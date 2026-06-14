"""
================================================================
firmware.py
Railway Track Condition Monitoring System
MicroPython Firmware for Raspberry Pi Pico / Pico W

Hardware:
  - Raspberry Pi Pico (RP2040) or Pico W
  - MPU6050 GY-521  (vibration, I2C 0x68)
  - MLX90614        (rail IR temperature, I2C 0x5A)
  - DS18B20         (contact temperature, OneWire)
  - NEO-M8N GPS     (UART)
  - MicroSD module  (SPI)
  - SIM800L GSM     (UART, optional)
  - Status LED

Author: [Your Name / Team]
Version: 1.0.0
License: MIT
================================================================
"""

import machine
import time
import os
import math
import json
import gc
from machine import Pin, I2C, UART, SPI, ADC

# ================================================================
# CONFIGURATION SECTION
# Edit values here to customize your installation
# ================================================================

# --- System Identity ---
DEVICE_ID        = "RTM_UNIT_001"
FIRMWARE_VERSION = "1.0.0"
TRAIN_ID         = "TRAIN_12345"

# --- Pin Definitions (Raspberry Pi Pico) ---
# I2C Bus 0 — for MPU6050 + MLX90614
PIN_I2C_SDA  = 0   # GP0
PIN_I2C_SCL  = 1   # GP1
I2C_FREQ     = 400000  # 400 kHz fast mode

# UART 0 — for NEO-M8N GPS
PIN_GPS_TX   = 12  # GP12 (Pico TX → GPS RX)
PIN_GPS_RX   = 13  # GP13 (Pico RX ← GPS TX)
GPS_BAUD     = 9600

# UART 1 — for SIM800L GSM
PIN_GSM_TX   = 4   # GP4
PIN_GSM_RX   = 5   # GP5
GSM_BAUD     = 9600   # SIM800L safer at 9600 than 115200

# SPI 0 — for MicroSD card
PIN_SD_SCK   = 18  # GP18
PIN_SD_MOSI  = 19  # GP19
PIN_SD_MISO  = 16  # GP16
PIN_SD_CS    = 17  # GP17

# OneWire — for DS18B20
PIN_DS18B20  = 2   # GP2

# Status LED (onboard LED on Pico = GP25)
PIN_LED      = 25

# --- I2C Addresses ---
MPU6050_ADDR  = 0x68
MLX90614_ADDR = 0x5A

# --- Timing (milliseconds) ---
SAMPLE_INTERVAL_MS       = 20      # 50 Hz vibration sampling
GPS_UPDATE_INTERVAL_MS   = 100
TEMP_UPDATE_INTERVAL_MS  = 2000
SD_LOG_INTERVAL_MS       = 1000
GSM_SEND_INTERVAL_MS     = 30000
DISPLAY_INTERVAL_MS      = 2000
VIBRATION_WINDOW_MS      = 500

# --- Alert Thresholds ---
# Vibration (m/s²)
VIB_RMS_WARNING     = 3.0
VIB_RMS_CRITICAL    = 7.0
VIB_PEAK_WARNING    = 8.0
VIB_PEAK_CRITICAL   = 15.0

# Rail Temperature (°C) — Long Welded Rail thresholds
RAIL_TEMP_WARNING   = 50.0   # Sun kink early warning
RAIL_TEMP_CRITICAL  = 55.0   # Sun kink danger
RAIL_TEMP_COLD      = -10.0  # Ice risk

# Contact Temperature (°C)
CONTACT_TEMP_WARNING  = 45.0
CONTACT_TEMP_CRITICAL = 50.0

# Speed (km/h)
SPEED_SLOW_THRESHOLD = 30.0

# --- Feature Flags ---
ENABLE_GSM         = False  # Set True if SIM800L connected
ENABLE_GPS         = True
ENABLE_SD          = True
ENABLE_IR_TEMP     = True
ENABLE_CONTACT_TEMP = True
DEBUG_VERBOSE      = False

# --- GSM Settings (only used if ENABLE_GSM = True) ---
GSM_APN        = "airtelgprs.com"  # Change for your SIM provider
SERVER_URL     = "your-server.com"
SERVER_PATH    = "/api/track-data"
SMS_RECIPIENT  = "+91XXXXXXXXXX"

# --- Alert Levels ---
ALERT_NONE     = 0
ALERT_INFO     = 1
ALERT_WARNING  = 2
ALERT_CRITICAL = 3


# ================================================================
# MPU6050 DRIVER
# Direct I2C register access — no external library needed
# ================================================================

class MPU6050:
    """MPU6050 6-axis accelerometer + gyroscope driver."""
    
    # Register addresses (from MPU6050 datasheet)
    REG_PWR_MGMT_1   = 0x6B
    REG_SMPLRT_DIV   = 0x19
    REG_CONFIG       = 0x1A
    REG_GYRO_CONFIG  = 0x1B
    REG_ACCEL_CONFIG = 0x1C
    REG_ACCEL_XOUT_H = 0x3B
    REG_TEMP_OUT_H   = 0x41
    REG_GYRO_XOUT_H  = 0x43
    REG_WHO_AM_I     = 0x75
    
    # Accelerometer ranges
    ACCEL_RANGE_2G   = 0
    ACCEL_RANGE_4G   = 1
    ACCEL_RANGE_8G   = 2
    ACCEL_RANGE_16G  = 3
    
    # Scale factors (LSB/g for each range)
    ACCEL_SCALE = {
        ACCEL_RANGE_2G:  16384.0,
        ACCEL_RANGE_4G:  8192.0,
        ACCEL_RANGE_8G:  4096.0,
        ACCEL_RANGE_16G: 2048.0,
    }
    
    # Gyroscope ranges
    GYRO_RANGE_250  = 0
    GYRO_RANGE_500  = 1
    GYRO_RANGE_1000 = 2
    GYRO_RANGE_2000 = 3
    
    GYRO_SCALE = {
        GYRO_RANGE_250:  131.0,
        GYRO_RANGE_500:  65.5,
        GYRO_RANGE_1000: 32.8,
        GYRO_RANGE_2000: 16.4,
    }
    
    GRAVITY = 9.80665  # m/s² (standard gravity)
    
    def __init__(self, i2c, address=MPU6050_ADDR):
        self.i2c = i2c
        self.address = address
        self.initialized = False
        
        # Calibration offsets
        self.offset_x = 0.0
        self.offset_y = 0.0
        self.offset_z = 0.0
        
        # Current readings
        self.accel_x = 0.0
        self.accel_y = 0.0
        self.accel_z = 0.0
        self.gyro_x  = 0.0
        self.gyro_y  = 0.0
        self.gyro_z  = 0.0
        self.temp_c  = 0.0
        
        # Vibration statistics
        self.sum_sq_x = 0.0
        self.sum_sq_y = 0.0
        self.sum_sq_z = 0.0
        self.sample_count = 0
        self.peak_accel = 0.0
        self.vibration_rms = 0.0
        self.vertical_rms = 0.0
        self.vibration_peak = 0.0
        
        self.accel_scale = self.ACCEL_SCALE[self.ACCEL_RANGE_4G]
        self.gyro_scale  = self.GYRO_SCALE[self.GYRO_RANGE_500]
    
    def begin(self):
        """Initialize the sensor."""
        try:
            # Check WHO_AM_I register (should return 0x68)
            who = self._read_byte(self.REG_WHO_AM_I)
            if who != 0x68:
                print("[MPU6050] Wrong WHO_AM_I: 0x{:02X}".format(who))
                return False
            
            # Wake up the device (clear sleep bit)
            self._write_byte(self.REG_PWR_MGMT_1, 0x00)
            time.sleep_ms(100)
            
            # Set sample rate divider (1kHz / (1+7) = 125 Hz output)
            self._write_byte(self.REG_SMPLRT_DIV, 0x07)
            
            # Configure low-pass filter (21 Hz bandwidth)
            # Reduces high-frequency noise — good for track analysis
            self._write_byte(self.REG_CONFIG, 0x04)
            
            # Set accelerometer range to ±4G (best for railway use)
            self._write_byte(self.REG_ACCEL_CONFIG, 
                           self.ACCEL_RANGE_4G << 3)
            
            # Set gyroscope range to ±500 deg/s
            self._write_byte(self.REG_GYRO_CONFIG, 
                           self.GYRO_RANGE_500 << 3)
            
            time.sleep_ms(100)
            
            self.initialized = True
            print("[MPU6050] Initialized OK (±4G, 21Hz filter)")
            
            # Calibrate
            self._calibrate()
            
            return True
            
        except Exception as e:
            print("[MPU6050] Init failed:", e)
            self.initialized = False
            return False
    
    def _read_byte(self, reg):
        """Read single byte from register."""
        return self.i2c.readfrom_mem(self.address, reg, 1)[0]
    
    def _write_byte(self, reg, value):
        """Write single byte to register."""
        self.i2c.writeto_mem(self.address, reg, bytes([value]))
    
    def _read_word(self, reg):
        """Read signed 16-bit word from register (high byte first)."""
        data = self.i2c.readfrom_mem(self.address, reg, 2)
        value = (data[0] << 8) | data[1]
        # Convert to signed
        if value >= 0x8000:
            value -= 0x10000
        return value
    
    def _calibrate(self):
        """Measure baseline offsets — keep sensor still during this."""
        print("[MPU6050] Calibrating (keep still 3 seconds)...")
        
        sum_x = sum_y = sum_z = 0.0
        samples = 100
        
        for _ in range(samples):
            ax = self._read_word(self.REG_ACCEL_XOUT_H) / self.accel_scale
            ay = self._read_word(self.REG_ACCEL_XOUT_H + 2) / self.accel_scale
            az = self._read_word(self.REG_ACCEL_XOUT_H + 4) / self.accel_scale
            
            # Convert g to m/s²
            sum_x += ax * self.GRAVITY
            sum_y += ay * self.GRAVITY
            sum_z += az * self.GRAVITY
            
            time.sleep_ms(20)
        
        self.offset_x = sum_x / samples
        self.offset_y = sum_y / samples
        # For Z-axis, keep gravity (9.81) so we measure DYNAMIC vertical accel
        self.offset_z = (sum_z / samples) - self.GRAVITY
        
        print("[MPU6050] Offsets: X={:.3f} Y={:.3f} Z={:.3f}".format(
            self.offset_x, self.offset_y, self.offset_z))
    
    def read(self):
        """Read current sensor values. Call frequently (50+ Hz)."""
        if not self.initialized:
            return False
        
        try:
            # Read accelerometer (3 axes, 16-bit each)
            ax_raw = self._read_word(self.REG_ACCEL_XOUT_H)
            ay_raw = self._read_word(self.REG_ACCEL_XOUT_H + 2)
            az_raw = self._read_word(self.REG_ACCEL_XOUT_H + 4)
            
            # Read temperature
            temp_raw = self._read_word(self.REG_TEMP_OUT_H)
            
            # Read gyroscope
            gx_raw = self._read_word(self.REG_GYRO_XOUT_H)
            gy_raw = self._read_word(self.REG_GYRO_XOUT_H + 2)
            gz_raw = self._read_word(self.REG_GYRO_XOUT_H + 4)
            
            # Convert and apply calibration
            ax = (ax_raw / self.accel_scale) * self.GRAVITY - self.offset_x
            ay = (ay_raw / self.accel_scale) * self.GRAVITY - self.offset_y
            az = (az_raw / self.accel_scale) * self.GRAVITY - self.offset_z
            
            # Store current values
            self.accel_x = ax
            self.accel_y = ay
            self.accel_z = az
            
            self.gyro_x = gx_raw / self.gyro_scale
            self.gyro_y = gy_raw / self.gyro_scale
            self.gyro_z = gz_raw / self.gyro_scale
            
            # Temperature: T = raw/340 + 36.53
            self.temp_c = (temp_raw / 340.0) + 36.53
            
            # Accumulate for RMS calculation
            self.sum_sq_x += ax * ax
            self.sum_sq_y += ay * ay
            self.sum_sq_z += az * az
            self.sample_count += 1
            
            # Track peak magnitude
            magnitude = math.sqrt(ax*ax + ay*ay + az*az)
            if magnitude > self.peak_accel:
                self.peak_accel = magnitude
            
            return True
            
        except Exception as e:
            if DEBUG_VERBOSE:
                print("[MPU6050] Read error:", e)
            return False
    
    def calculate_statistics(self):
        """Calculate RMS and peak over the current sample window."""
        if self.sample_count == 0:
            return
        
        rms_x = math.sqrt(self.sum_sq_x / self.sample_count)
        rms_y = math.sqrt(self.sum_sq_y / self.sample_count)
        rms_z = math.sqrt(self.sum_sq_z / self.sample_count)
        
        # Combined RMS (total vibration energy)
        self.vibration_rms = math.sqrt(rms_x*rms_x + 
                                       rms_y*rms_y + 
                                       rms_z*rms_z)
        
        # Vertical RMS (Z-axis) — most important for track condition
        self.vertical_rms = rms_z
        
        # Latch peak value
        self.vibration_peak = self.peak_accel
        
        # Reset accumulators for next window
        self.sum_sq_x = 0.0
        self.sum_sq_y = 0.0
        self.sum_sq_z = 0.0
        self.sample_count = 0
        self.peak_accel = 0.0


# ================================================================
# MLX90614 DRIVER — Infrared Temperature Sensor
# ================================================================

class MLX90614:
    """MLX90614 non-contact infrared thermometer."""
    
    REG_AMBIENT_TEMP = 0x06
    REG_OBJECT_TEMP  = 0x07
    
    def __init__(self, i2c, address=MLX90614_ADDR):
        self.i2c = i2c
        self.address = address
        self.initialized = False
    
    def begin(self):
        """Initialize and verify sensor presence."""
        try:
            # Try reading ambient temperature
            temp = self._read_temp(self.REG_AMBIENT_TEMP)
            if temp is not None and -40.0 < temp < 100.0:
                self.initialized = True
                print("[MLX90614] Initialized OK")
                return True
            else:
                print("[MLX90614] Invalid reading on init")
                return False
                
        except Exception as e:
            print("[MLX90614] Init failed:", e)
            self.initialized = False
            return False
    
    def _read_temp(self, register):
        """Read temperature register, return value in Celsius."""
        try:
            data = self.i2c.readfrom_mem(self.address, register, 3)
            # Combine bytes: data[1]=MSB, data[0]=LSB, data[2]=PEC checksum
            raw = (data[1] << 8) | data[0]
            
            # Convert to Kelvin (each LSB = 0.02 K)
            kelvin = raw * 0.02
            
            # Kelvin to Celsius
            celsius = kelvin - 273.15
            
            return celsius
        except Exception as e:
            if DEBUG_VERBOSE:
                print("[MLX90614] Read error:", e)
            return None
    
    def read_object_temp(self):
        """Read target object temperature (rail surface)."""
        if not self.initialized:
            return None
        return self._read_temp(self.REG_OBJECT_TEMP)
    
    def read_ambient_temp(self):
        """Read sensor housing ambient temperature."""
        if not self.initialized:
            return None
        return self._read_temp(self.REG_AMBIENT_TEMP)


# ================================================================
# DS18B20 DRIVER — Uses MicroPython's built-in onewire/ds18x20
# ================================================================

class DS18B20Sensor:
    """DS18B20 contact temperature sensor."""
    
    def __init__(self, pin_num):
        self.pin_num = pin_num
        self.initialized = False
        self.sensor = None
        self.devices = []
        self.last_temp = 0.0
        self.last_request_time = 0
    
    def begin(self):
        """Initialize sensor and find devices."""
        try:
            import onewire
            import ds18x20
            
            pin = Pin(self.pin_num)
            ow = onewire.OneWire(pin)
            self.sensor = ds18x20.DS18X20(ow)
            
            self.devices = self.sensor.scan()
            
            if len(self.devices) == 0:
                print("[DS18B20] No sensors found")
                print("[DS18B20] Check 4.7kΩ pull-up on data line")
                return False
            
            print("[DS18B20] Found {} sensor(s)".format(len(self.devices)))
            
            # Start first conversion
            self.sensor.convert_temp()
            self.last_request_time = time.ticks_ms()
            
            self.initialized = True
            return True
            
        except Exception as e:
            print("[DS18B20] Init failed:", e)
            self.initialized = False
            return False
    
    def read(self):
        """Get latest temperature reading. Non-blocking."""
        if not self.initialized or len(self.devices) == 0:
            return None
        
        try:
            # DS18B20 conversion takes ~750ms at 12-bit resolution
            # We use async pattern — request, wait, read
            elapsed = time.ticks_diff(time.ticks_ms(), 
                                      self.last_request_time)
            
            if elapsed >= 750:
                # Read the result
                temp = self.sensor.read_temp(self.devices[0])
                
                # Sanity check
                if temp is not None and -55.0 < temp < 125.0:
                    self.last_temp = temp
                
                # Start next conversion
                self.sensor.convert_temp()
                self.last_request_time = time.ticks_ms()
            
            return self.last_temp
            
        except Exception as e:
            if DEBUG_VERBOSE:
                print("[DS18B20] Read error:", e)
            return self.last_temp


# ================================================================
# GPS PARSER — Parses NMEA sentences from NEO-M8N
# ================================================================

class GPSParser:
    """Minimal NMEA parser for GPS data."""
    
    def __init__(self, uart):
        self.uart = uart
        self.initialized = False
        
        self.latitude = 0.0
        self.longitude = 0.0
        self.altitude = 0.0
        self.speed_kmph = 0.0
        self.satellites = 0
        self.has_fix = False
        self.time_str = "00:00:00"
        self.date_str = "0000-00-00"
        
        self._buffer = b""
        self._chars_processed = 0
    
    def begin(self):
        """Initialize GPS — just check if UART is producing data."""
        print("[GPS] Initializing NEO-M8N...")
        
        # Wait briefly for first data
        start = time.ticks_ms()
        got_data = False
        
        while time.ticks_diff(time.ticks_ms(), start) < 3000:
            if self.uart.any():
                self.uart.read(self.uart.any())
                got_data = True
                break
            time.sleep_ms(100)
        
        if got_data:
            print("[GPS] Data stream detected")
            print("[GPS] Waiting for satellite fix...")
            self.initialized = True
            return True
        else:
            print("[GPS] No data — check wiring (TX↔RX swap?)")
            self.initialized = False
            return False
    
    def update(self):
        """Read and parse available NMEA data."""
        if not self.initialized:
            return
        
        # Read all available bytes
        while self.uart.any():
            chunk = self.uart.read(self.uart.any())
            if chunk:
                self._chars_processed += len(chunk)
                self._buffer += chunk
                
                # Process complete sentences (terminated by \n)
                while b"\n" in self._buffer:
                    line, self._buffer = self._buffer.split(b"\n", 1)
                    self._parse_sentence(line.decode("ascii", "ignore").strip())
                
                # Prevent runaway buffer
                if len(self._buffer) > 256:
                    self._buffer = b""
    
    def _parse_sentence(self, sentence):
        """Parse a single NMEA sentence."""
        if not sentence.startswith("$"):
            return
        
        # Verify checksum (optional but recommended)
        if "*" in sentence:
            body, checksum = sentence[1:].rsplit("*", 1)
            calc_sum = 0
            for c in body:
                calc_sum ^= ord(c)
            try:
                if calc_sum != int(checksum, 16):
                    return  # Bad checksum, skip
            except ValueError:
                return
        else:
            body = sentence[1:]
        
        fields = body.split(",")
        if len(fields) < 1:
            return
        
        sentence_type = fields[0]
        
        # Parse GGA (Global Positioning System Fix Data)
        if sentence_type in ("GPGGA", "GNGGA"):
            self._parse_gga(fields)
        
        # Parse RMC (Recommended Minimum Navigation Information)
        elif sentence_type in ("GPRMC", "GNRMC"):
            self._parse_rmc(fields)
    
    def _parse_gga(self, fields):
        """Parse GGA sentence — position, fix quality, satellites, altitude."""
        try:
            # Field 6: Fix quality (0 = no fix, 1 = GPS fix, 2 = DGPS)
            fix_quality = int(fields[6]) if fields[6] else 0
            self.has_fix = (fix_quality > 0)
            
            # Field 7: Number of satellites
            if fields[7]:
                self.satellites = int(fields[7])
            
            if self.has_fix:
                # Field 2,3: Latitude (DDMM.MMMM, N/S)
                if fields[2] and fields[3]:
                    self.latitude = self._nmea_to_decimal(fields[2], fields[3])
                
                # Field 4,5: Longitude (DDDMM.MMMM, E/W)
                if fields[4] and fields[5]:
                    self.longitude = self._nmea_to_decimal(fields[4], fields[5])
                
                # Field 9: Altitude in meters
                if fields[9]:
                    self.altitude = float(fields[9])
            
            # Field 1: UTC time HHMMSS.SS
            if fields[1] and len(fields[1]) >= 6:
                t = fields[1]
                self.time_str = "{}:{}:{}".format(t[0:2], t[2:4], t[4:6])
                
        except (ValueError, IndexError):
            pass
    
    def _parse_rmc(self, fields):
        """Parse RMC sentence — for speed and date."""
        try:
            # Field 2: Status (A = active, V = void)
            if len(fields) > 2 and fields[2] == "A":
                # Field 7: Speed over ground in knots
                if len(fields) > 7 and fields[7]:
                    knots = float(fields[7])
                    self.speed_kmph = knots * 1.852  # knots → km/h
                
                # Field 9: Date DDMMYY
                if len(fields) > 9 and fields[9] and len(fields[9]) == 6:
                    d = fields[9]
                    self.date_str = "20{}-{}-{}".format(d[4:6], 
                                                        d[2:4], 
                                                        d[0:2])
        except (ValueError, IndexError):
            pass
    
    def _nmea_to_decimal(self, coord_str, direction):
        """Convert NMEA coordinate (DDMM.MMMM) to decimal degrees."""
        try:
            # Find the decimal point — degrees are everything before mm.mmmm
            if "." not in coord_str:
                return 0.0
            
            dot_pos = coord_str.index(".")
            degree_chars = dot_pos - 2  # MM before the dot
            
            degrees = float(coord_str[:degree_chars])
            minutes = float(coord_str[degree_chars:])
            
            decimal = degrees + (minutes / 60.0)
            
            if direction in ("S", "W"):
                decimal = -decimal
            
            return decimal
            
        except (ValueError, IndexError):
            return 0.0


# ================================================================
# SD CARD LOGGER
# ================================================================

class SDLogger:
    """Logs sensor data to MicroSD card as CSV."""
    
    def __init__(self):
        self.initialized = False
        self.current_filename = ""
        self.file_index = 0
        self.record_count = 0
        self.mount_point = "/sd"
    
    def begin(self):
        """Mount SD card and create initial log file."""
        if not ENABLE_SD:
            return False
        
        print("[SD] Initializing SD card...")
        
        try:
            # Import the sdcard driver
            # NOTE: You need sdcard.py library on the Pico's filesystem
            # Get from: https://github.com/micropython/micropython/blob/master/drivers/sdcard/sdcard.py
            import sdcard
            
            spi = SPI(0,
                      baudrate=1000000,
                      polarity=0,
                      phase=0,
                      sck=Pin(PIN_SD_SCK),
                      mosi=Pin(PIN_SD_MOSI),
                      miso=Pin(PIN_SD_MISO))
            
            sd = sdcard.SDCard(spi, Pin(PIN_SD_CS))
            
            # Mount SD card to /sd
            os.mount(sd, self.mount_point)
            
            # List files (validates mount)
            files = os.listdir(self.mount_point)
            print("[SD] Card mounted. {} files exist".format(len(files)))
            
            # Find next available log file index
            self._find_next_index()
            
            # Create new log file with CSV header
            self._create_log_file()
            
            # Write boot status
            self._write_status()
            
            self.initialized = True
            print("[SD] Logging to:", self.current_filename)
            return True
            
        except Exception as e:
            print("[SD] Failed:", e)
            print("[SD] Check: card inserted? FAT32 formatted?")
            print("[SD]        sdcard.py library on Pico?")
            self.initialized = False
            return False
    
    def _find_next_index(self):
        """Find next free log file number."""
        self.file_index = 0
        try:
            files = os.listdir(self.mount_point)
            
            while True:
                fname = "log_{:04d}.csv".format(self.file_index)
                if fname not in files:
                    break
                self.file_index += 1
                if self.file_index > 9999:
                    break
        except:
            pass
    
    def _create_log_file(self):
        """Create new log file with CSV header row."""
        self.current_filename = "{}/log_{:04d}.csv".format(
            self.mount_point, self.file_index)
        
        try:
            with open(self.current_filename, "w") as f:
                f.write("timestamp_ms,datetime,")
                f.write("latitude,longitude,altitude_m,speed_kmph,sats,")
                f.write("accel_x,accel_y,accel_z,")
                f.write("gyro_x,gyro_y,gyro_z,")
                f.write("vib_rms,vib_peak,vib_v_rms,")
                f.write("rail_temp_c,ambient_ir_c,contact_temp_c,")
                f.write("vib_alert,temp_alert,contact_alert,overall_alert,")
                f.write("mpu_ok,gps_ok,mlx_ok,ds_ok\n")
        except Exception as e:
            print("[SD] Cannot create file:", e)
    
    def _write_status(self):
        """Write boot info to status.txt."""
        try:
            with open("{}/status.txt".format(self.mount_point), "a") as f:
                f.write("=== BOOT @ {} ms ===\n".format(time.ticks_ms()))
                f.write("Device: {}\n".format(DEVICE_ID))
                f.write("Firmware: {}\n".format(FIRMWARE_VERSION))
                f.write("Train: {}\n".format(TRAIN_ID))
                f.write("Log: {}\n\n".format(self.current_filename))
        except:
            pass
    
    def log_data(self, data):
        """Append a data record to the CSV log."""
        if not self.initialized:
            return False
        
        try:
            with open(self.current_filename, "a") as f:
                line = "{},{},".format(data['timestamp_ms'], 
                                       data['datetime_str'])
                line += "{:.6f},{:.6f},{:.1f},{:.1f},{},".format(
                    data['latitude'], data['longitude'],
                    data['altitude_m'], data['speed_kmph'],
                    data['satellites'])
                line += "{:.3f},{:.3f},{:.3f},".format(
                    data['accel_x'], data['accel_y'], data['accel_z'])
                line += "{:.2f},{:.2f},{:.2f},".format(
                    data['gyro_x'], data['gyro_y'], data['gyro_z'])
                line += "{:.4f},{:.4f},{:.4f},".format(
                    data['vibration_rms'], data['vibration_peak'],
                    data['vibration_vertical_rms'])
                line += "{:.1f},{:.1f},{:.1f},".format(
                    data['rail_temp_c'], data['ambient_ir_c'],
                    data['contact_temp_c'])
                line += "{},{},{},{},".format(
                    data['vibration_alert'], data['rail_temp_alert'],
                    data['contact_temp_alert'], data['overall_alert'])
                line += "{},{},{},{}\n".format(
                    1 if data['mpu_ok'] else 0,
                    1 if data['gps_ok'] else 0,
                    1 if data['mlx_ok'] else 0,
                    1 if data['ds_ok'] else 0)
                f.write(line)
            
            self.record_count += 1
            
            # Rotate to new file every 10,000 records
            if self.record_count >= 10000:
                self.file_index += 1
                self._create_log_file()
                self.record_count = 0
            
            return True
            
        except Exception as e:
            if DEBUG_VERBOSE:
                print("[SD] Log error:", e)
            return False
    
    def log_alert(self, data, description):
        """Log a critical event to alerts.csv."""
        if not self.initialized:
            return
        
        try:
            alerts_file = "{}/alerts.csv".format(self.mount_point)
            
            # Create with header if doesn't exist
            try:
                with open(alerts_file, "r"):
                    pass
            except OSError:
                with open(alerts_file, "w") as f:
                    f.write("timestamp_ms,datetime,latitude,longitude,")
                    f.write("speed_kmph,vib_rms,vib_peak,rail_temp_c,")
                    f.write("contact_temp_c,alert_level,description\n")
            
            with open(alerts_file, "a") as f:
                f.write("{},{},{:.6f},{:.6f},{:.1f},{:.4f},{:.4f},"
                        "{:.1f},{:.1f},{},{}\n".format(
                    data['timestamp_ms'], data['datetime_str'],
                    data['latitude'], data['longitude'], data['speed_kmph'],
                    data['vibration_rms'], data['vibration_peak'],
                    data['rail_temp_c'], data['contact_temp_c'],
                    alert_level_to_string(data['overall_alert']),
                    description))
        except Exception as e:
            if DEBUG_VERBOSE:
                print("[SD] Alert log error:", e)


# ================================================================
# GSM COMMUNICATION (SIM800L) — Optional
# ================================================================

class GSMComm:
    """SIM800L GSM module driver."""
    
    def __init__(self, uart):
        self.uart = uart
        self.initialized = False
        self.send_count = 0
        self.fail_count = 0
        self.last_send_time = 0
    
    def begin(self):
        """Initialize SIM800L and verify network."""
        if not ENABLE_GSM:
            return False
        
        print("[GSM] Initializing SIM800L...")
        time.sleep(3)  # SIM800L power-up delay
        
        # Test AT command
        if not self._send_at("AT", "OK", 3000):
            print("[GSM] No response — check power & wiring")
            return False
        
        print("[GSM] AT OK")
        
        # Disable command echo
        self._send_at("ATE0", "OK", 1000)
        
        # Check SIM
        if not self._send_at("AT+CPIN?", "READY", 3000):
            print("[GSM] WARNING: SIM not ready")
        
        # Wait for network registration
        print("[GSM] Waiting for network...")
        for i in range(10):
            response = self._send_at_get_response("AT+CREG?", 2000)
            if ",1" in response or ",5" in response:
                print("[GSM] Network registered")
                self.initialized = True
                return True
            time.sleep(2)
        
        print("[GSM] WARNING: Network not found")
        self.initialized = True  # Still try to use for SMS
        return True
    
    def _send_at(self, command, expected, timeout_ms):
        """Send AT command, check for expected response."""
        try:
            # Clear input buffer
            while self.uart.any():
                self.uart.read(self.uart.any())
            
            # Send command
            self.uart.write(command + "\r\n")
            
            # Wait for response
            response = ""
            start = time.ticks_ms()
            
            while time.ticks_diff(time.ticks_ms(), start) < timeout_ms:
                if self.uart.any():
                    chunk = self.uart.read(self.uart.any())
                    if chunk:
                        response += chunk.decode("ascii", "ignore")
                        if expected in response:
                            return True
                        if "ERROR" in response:
                            return False
                time.sleep_ms(50)
            
            return False
            
        except Exception as e:
            if DEBUG_VERBOSE:
                print("[GSM] AT error:", e)
            return False
    
    def _send_at_get_response(self, command, timeout_ms):
        """Send AT command and return full response."""
        try:
            while self.uart.any():
                self.uart.read(self.uart.any())
            
            self.uart.write(command + "\r\n")
            
            response = ""
            start = time.ticks_ms()
            
            while time.ticks_diff(time.ticks_ms(), start) < timeout_ms:
                if self.uart.any():
                    chunk = self.uart.read(self.uart.any())
                    if chunk:
                        response += chunk.decode("ascii", "ignore")
                time.sleep_ms(50)
            
            return response
            
        except:
            return ""
    
    def send_data(self, data):
        """Send sensor data to server via HTTP POST."""
        if not self.initialized:
            return False
        
        now = time.ticks_ms()
        if time.ticks_diff(now, self.last_send_time) < GSM_SEND_INTERVAL_MS:
            return True
        self.last_send_time = now
        
        # Build JSON payload
        payload = {
            "device_id": DEVICE_ID,
            "train_id": TRAIN_ID,
            "timestamp": data['timestamp_ms'],
            "gps": {
                "lat": data['latitude'],
                "lon": data['longitude'],
                "speed": data['speed_kmph'],
                "sats": data['satellites']
            },
            "vibration": {
                "rms": data['vibration_rms'],
                "peak": data['vibration_peak']
            },
            "temperature": {
                "rail": data['rail_temp_c'],
                "contact": data['contact_temp_c']
            },
            "alert": data['overall_alert']
        }
        
        json_str = json.dumps(payload)
        
        # Simplified HTTP POST sequence
        try:
            self._send_at("AT+SAPBR=3,1,\"Contype\",\"GPRS\"", "OK", 2000)
            self._send_at('AT+SAPBR=3,1,"APN","{}"'.format(GSM_APN), 
                          "OK", 2000)
            self._send_at("AT+SAPBR=1,1", "OK", 10000)
            self._send_at("AT+HTTPINIT", "OK", 3000)
            self._send_at('AT+HTTPPARA="CID",1', "OK", 1000)
            self._send_at('AT+HTTPPARA="URL","http://{}{}"'.format(
                SERVER_URL, SERVER_PATH), "OK", 1000)
            self._send_at('AT+HTTPPARA="CONTENT","application/json"', 
                          "OK", 1000)
            
            # Send body
            cmd = "AT+HTTPDATA={},10000".format(len(json_str))
            if self._send_at(cmd, "DOWNLOAD", 3000):
                self.uart.write(json_str)
                time.sleep_ms(500)
            
            # POST
            success = self._send_at("AT+HTTPACTION=1", "OK", 3000)
            time.sleep(5)
            
            # Cleanup
            self._send_at("AT+HTTPTERM", "OK", 2000)
            self._send_at("AT+SAPBR=0,1", "OK", 3000)
            
            if success:
                self.send_count += 1
                print("[GSM] Data sent ({})".format(self.send_count))
            else:
                self.fail_count += 1
            
            return success
            
        except Exception as e:
            print("[GSM] Send error:", e)
            self.fail_count += 1
            return False
    
    def send_sms_alert(self, data, message):
        """Send SMS for critical alerts."""
        if not self.initialized:
            return False
        
        try:
            # Set text mode
            self._send_at("AT+CMGF=1", "OK", 1000)
            
            # Set recipient
            self.uart.write('AT+CMGS="{}"\r\n'.format(SMS_RECIPIENT))
            time.sleep(1)
            
            # Build SMS body
            sms_text = "RAIL ALERT[{}] {} Loc:{:.4f},{:.4f} Vib:{:.1f} Tmp:{:.1f}".format(
                alert_level_to_string(data['overall_alert']),
                message,
                data['latitude'], data['longitude'],
                data['vibration_rms'], data['rail_temp_c']
            )[:160]  # SMS max 160 chars
            
            self.uart.write(sms_text)
            time.sleep_ms(100)
            self.uart.write(bytes([26]))  # Ctrl+Z to send
            
            # Wait for confirmation
            time.sleep(5)
            
            response = self._send_at_get_response("", 1000)
            return "+CMGS:" in response
            
        except Exception as e:
            print("[GSM] SMS error:", e)
            return False


# ================================================================
# ALERT EVALUATION FUNCTIONS
# ================================================================

def evaluate_vibration_alert(rms, peak):
    """Determine alert level based on vibration."""
    if rms >= VIB_RMS_CRITICAL or peak >= VIB_PEAK_CRITICAL:
        return ALERT_CRITICAL
    elif rms >= VIB_RMS_WARNING or peak >= VIB_PEAK_WARNING:
        return ALERT_WARNING
    return ALERT_NONE


def evaluate_rail_temp_alert(temp):
    """Determine alert level based on rail temperature."""
    if temp >= RAIL_TEMP_CRITICAL:
        return ALERT_CRITICAL
    elif temp >= RAIL_TEMP_WARNING:
        return ALERT_WARNING
    elif temp <= RAIL_TEMP_COLD:
        return ALERT_WARNING
    return ALERT_NONE


def evaluate_contact_temp_alert(temp):
    """Determine alert level based on contact temperature."""
    if temp >= CONTACT_TEMP_CRITICAL:
        return ALERT_CRITICAL
    elif temp >= CONTACT_TEMP_WARNING:
        return ALERT_WARNING
    return ALERT_NONE


def evaluate_overall_alert(data):
    """Combined alert = highest of all alerts."""
    return max(data['vibration_alert'],
               data['rail_temp_alert'],
               data['contact_temp_alert'])


def alert_level_to_string(level):
    """Human-readable alert label."""
    return {
        ALERT_NONE:     "NORMAL",
        ALERT_INFO:     "INFO",
        ALERT_WARNING:  "WARNING",
        ALERT_CRITICAL: "CRITICAL"
    }.get(level, "UNKNOWN")


# ================================================================
# MAIN APPLICATION
# ================================================================

class RailwayMonitor:
    """Main application orchestrator."""
    
    def __init__(self):
        self.start_time = time.ticks_ms()
        
        # Initialize peripherals
        self.i2c = None
        self.gps_uart = None
        self.gsm_uart = None
        self.led = None
        
        # Sensor instances
        self.mpu = None
        self.mlx = None
        self.ds18b20 = None
        self.gps = None
        self.sd = None
        self.gsm = None
        
        # System data (mutable dictionary)
        self.data = self._create_data_dict()
        
        # Timing trackers
        self.last_sample = 0
        self.last_vib_stats = 0
        self.last_gps_update = 0
        self.last_temp_update = 0
        self.last_log = 0
        self.last_gsm = 0
        self.last_display = 0
        self.last_led = 0
        
        # State
        self.led_state = False
        self.led_interval = 1000
        self.last_alert_level = ALERT_NONE
        self.last_critical_alert_time = 0
        self.total_samples = 0
        self.total_alerts = 0
    
    def _create_data_dict(self):
        """Create empty data dictionary."""
        return {
            'timestamp_ms': 0,
            'datetime_str': "0000-00-00 00:00:00",
            'latitude': 0.0,
            'longitude': 0.0,
            'altitude_m': 0.0,
            'speed_kmph': 0.0,
            'satellites': 0,
            'gps_valid': False,
            'accel_x': 0.0, 'accel_y': 0.0, 'accel_z': 0.0,
            'gyro_x': 0.0,  'gyro_y': 0.0,  'gyro_z': 0.0,
            'vibration_rms': 0.0,
            'vibration_peak': 0.0,
            'vibration_vertical_rms': 0.0,
            'mpu_temp_c': 0.0,
            'rail_temp_c': 0.0,
            'ambient_ir_c': 0.0,
            'contact_temp_c': 0.0,
            'vibration_alert': ALERT_NONE,
            'rail_temp_alert': ALERT_NONE,
            'contact_temp_alert': ALERT_NONE,
            'overall_alert': ALERT_NONE,
            'mpu_ok': False,
            'gps_ok': False,
            'mlx_ok': False,
            'ds_ok': False,
            'sd_ok': False,
            'gsm_ok': False
        }
    
    def print_boot_header(self):
        """Print system info banner."""
        print()
        print("=" * 56)
        print("  RAILWAY TRACK CONDITION MONITORING SYSTEM")
        print("=" * 56)
        print("  Device ID    :", DEVICE_ID)
        print("  Firmware     :", FIRMWARE_VERSION)
        print("  Train ID     :", TRAIN_ID)
        print("  Platform     : Raspberry Pi Pico (MicroPython)")
        print("=" * 56)
        print()
    
    def initialize(self):
        """Initialize all peripherals and sensors."""
        self.print_boot_header()
        
        # Status LED
        self.led = Pin(PIN_LED, Pin.OUT)
        self.led.value(1)  # On during init
        
        # I2C Bus
        try:
            self.i2c = I2C(0, sda=Pin(PIN_I2C_SDA), 
                          scl=Pin(PIN_I2C_SCL), 
                          freq=I2C_FREQ)
            
            # Scan I2C bus
            devices = self.i2c.scan()
            print("[I2C] Devices found:", 
                  [hex(d) for d in devices])
        except Exception as e:
            print("[I2C] Init failed:", e)
            return False
        
        # MPU6050
        self.mpu = MPU6050(self.i2c)
        self.data['mpu_ok'] = self.mpu.begin()
        
        # MLX90614
        if ENABLE_IR_TEMP:
            self.mlx = MLX90614(self.i2c)
            self.data['mlx_ok'] = self.mlx.begin()
        
        # DS18B20
        if ENABLE_CONTACT_TEMP:
            self.ds18b20 = DS18B20Sensor(PIN_DS18B20)
            self.data['ds_ok'] = self.ds18b20.begin()
        
        # GPS
        if ENABLE_GPS:
            self.gps_uart = UART(0, baudrate=GPS_BAUD,
                                tx=Pin(PIN_GPS_TX),
                                rx=Pin(PIN_GPS_RX))
            self.gps = GPSParser(self.gps_uart)
            self.data['gps_ok'] = self.gps.begin()
        
        # SD Card
        if ENABLE_SD:
            self.sd = SDLogger()
            self.data['sd_ok'] = self.sd.begin()
        
        # GSM
        if ENABLE_GSM:
            self.gsm_uart = UART(1, baudrate=GSM_BAUD,
                                tx=Pin(PIN_GSM_TX),
                                rx=Pin(PIN_GSM_RX))
            self.gsm = GSMComm(self.gsm_uart)
            self.data['gsm_ok'] = self.gsm.begin()
        
        # Print summary
        print()
        print("[INIT] ============== SUMMARY ==============")
        print("[INIT]   MPU6050  (Vibration) :", 
              "OK" if self.data['mpu_ok'] else "FAILED")
        print("[INIT]   NEO-M8N  (GPS)       :", 
              "OK" if self.data['gps_ok'] else "FAILED")
        print("[INIT]   MLX90614 (IR Temp)   :", 
              "OK" if self.data['mlx_ok'] else "FAILED")
        print("[INIT]   DS18B20  (Contact)   :", 
              "OK" if self.data['ds_ok'] else "FAILED")
        print("[INIT]   SD Card  (Storage)   :", 
              "OK" if self.data['sd_ok'] else "FAILED")
        print("[INIT]   SIM800L  (GSM)       :", 
              "OK" if self.data['gsm_ok'] else "DISABLED")
        print("[INIT] =====================================")
        print()
        
        # Done LED blink pattern
        self.led.value(0)
        for _ in range(3):
            self.led.value(1)
            time.sleep_ms(100)
            self.led.value(0)
            time.sleep_ms(100)
        
        print("[MAIN] System running. Press Ctrl+C to stop.\n")
        return True
    
    def run(self):
        """Main loop — runs forever until interrupted."""
        try:
            while True:
                now = time.ticks_ms()
                
                # Task 1: High-frequency vibration sampling (50 Hz)
                if time.ticks_diff(now, self.last_sample) >= SAMPLE_INTERVAL_MS:
                    self.last_sample = now
                    self._task_sample()
                
                # Task 2: Vibration statistics (every 500ms)
                if time.ticks_diff(now, self.last_vib_stats) >= VIBRATION_WINDOW_MS:
                    self.last_vib_stats = now
                    self._task_vibration_analysis()
                
                # Task 3: GPS parsing (every 100ms)
                if time.ticks_diff(now, self.last_gps_update) >= GPS_UPDATE_INTERVAL_MS:
                    self.last_gps_update = now
                    self._task_gps_update()
                
                # Task 4: Temperature (every 2 seconds)
                if time.ticks_diff(now, self.last_temp_update) >= TEMP_UPDATE_INTERVAL_MS:
                    self.last_temp_update = now
                    self._task_temperature_update()
                
                # Task 5: SD logging (every 1 second)
                if time.ticks_diff(now, self.last_log) >= SD_LOG_INTERVAL_MS:
                    self.last_log = now
                    self._task_logging()
                
                # Task 6: GSM transmission (every 30 seconds)
                if ENABLE_GSM and time.ticks_diff(now, self.last_gsm) >= GSM_SEND_INTERVAL_MS:
                    self.last_gsm = now
                    self._task_gsm()
                
                # Task 7: Display update (every 2 seconds)
                if time.ticks_diff(now, self.last_display) >= DISPLAY_INTERVAL_MS:
                    self.last_display = now
                    self._task_display()
                
                # Task 8: LED update (variable)
                self._task_led_update()
                
                # Brief sleep to prevent 100% CPU usage
                time.sleep_ms(5)
                
                # Periodic garbage collection (MicroPython memory mgmt)
                if self.total_samples % 1000 == 0:
                    gc.collect()
                
        except KeyboardInterrupt:
            print("\n[MAIN] Stopped by user")
            self.led.value(0)
    
    # ----------------------------------------------------------
    # TASK METHODS
    # ----------------------------------------------------------
    
    def _task_sample(self):
        """Sample MPU6050 at high frequency."""
        if not self.data['mpu_ok']:
            return
        
        self.mpu.read()
        self.data['timestamp_ms'] = time.ticks_ms()
        self.total_samples += 1
    
    def _task_vibration_analysis(self):
        """Calculate vibration RMS and peak."""
        if not self.data['mpu_ok']:
            return
        
        self.mpu.calculate_statistics()
        
        # Copy to data dict
        self.data['accel_x'] = self.mpu.accel_x
        self.data['accel_y'] = self.mpu.accel_y
        self.data['accel_z'] = self.mpu.accel_z
        self.data['gyro_x']  = self.mpu.gyro_x
        self.data['gyro_y']  = self.mpu.gyro_y
        self.data['gyro_z']  = self.mpu.gyro_z
        self.data['vibration_rms'] = self.mpu.vibration_rms
        self.data['vibration_peak'] = self.mpu.vibration_peak
        self.data['vibration_vertical_rms'] = self.mpu.vertical_rms
        self.data['mpu_temp_c'] = self.mpu.temp_c
        
        # Evaluate alert
        self.data['vibration_alert'] = evaluate_vibration_alert(
            self.mpu.vibration_rms, self.mpu.vibration_peak)
        
        # Update overall alert
        self._evaluate_overall_alert()
    
    def _task_gps_update(self):
        """Process GPS NMEA stream."""
        if not self.data['gps_ok']:
            return
        
        self.gps.update()
        
        self.data['latitude'] = self.gps.latitude
        self.data['longitude'] = self.gps.longitude
        self.data['altitude_m'] = self.gps.altitude
        self.data['speed_kmph'] = self.gps.speed_kmph
        self.data['satellites'] = self.gps.satellites
        self.data['gps_valid'] = self.gps.has_fix
        self.data['datetime_str'] = "{} {}".format(
            self.gps.date_str, self.gps.time_str)
    
    def _task_temperature_update(self):
        """Read temperature sensors."""
        # MLX90614 (IR)
        if self.data['mlx_ok']:
            obj_temp = self.mlx.read_object_temp()
            amb_temp = self.mlx.read_ambient_temp()
            
            if obj_temp is not None:
                self.data['rail_temp_c'] = obj_temp
            if amb_temp is not None:
                self.data['ambient_ir_c'] = amb_temp
            
            self.data['rail_temp_alert'] = evaluate_rail_temp_alert(
                self.data['rail_temp_c'])
        
        # DS18B20 (contact)
        if self.data['ds_ok']:
            contact = self.ds18b20.read()
            if contact is not None:
                self.data['contact_temp_c'] = contact
                self.data['contact_temp_alert'] = \
                    evaluate_contact_temp_alert(contact)
        
        # Update overall alert
        self._evaluate_overall_alert()
    
    def _task_logging(self):
        """Log data to SD card."""
        if not self.data['sd_ok']:
            return
        
        self.sd.log_data(self.data)
        
        # Log alert events separately
        if self.data['overall_alert'] >= ALERT_WARNING:
            if self.data['vibration_alert'] >= ALERT_WARNING:
                desc = "Vibration RMS={:.2f} Peak={:.2f}".format(
                    self.data['vibration_rms'],
                    self.data['vibration_peak'])
            elif self.data['rail_temp_alert'] >= ALERT_WARNING:
                desc = "Rail Temp={:.1f}C".format(
                    self.data['rail_temp_c'])
            else:
                desc = "Multiple conditions"
            
            self.sd.log_alert(self.data, desc)
            self.total_alerts += 1
    
    def _task_gsm(self):
        """Send data via GSM."""
        if not self.data['gsm_ok']:
            return
        
        self.gsm.send_data(self.data)
    
    def _task_display(self):
        """Print status to serial console."""
        uptime_s = time.ticks_diff(time.ticks_ms(), self.start_time) // 1000
        
        print()
        print("=" * 50)
        print("  Railway Monitor | Uptime: {} s".format(uptime_s))
        print("=" * 50)
        
        # GPS
        if self.data['gps_valid']:
            print("GPS: {:.5f}, {:.5f} | {:.1f} km/h | {} sats".format(
                self.data['latitude'], self.data['longitude'],
                self.data['speed_kmph'], self.data['satellites']))
        else:
            print("GPS: Searching... | {} sats".format(
                self.data['satellites']))
        
        # Vibration
        print("VIB: RMS={:.2f}  Peak={:.2f}  V_RMS={:.2f} m/s² [{}]".format(
            self.data['vibration_rms'],
            self.data['vibration_peak'],
            self.data['vibration_vertical_rms'],
            alert_level_to_string(self.data['vibration_alert'])))
        
        # Temperature
        print("TMP: Rail={:.1f}°C  Amb={:.1f}°C  Contact={:.1f}°C [{}]".format(
            self.data['rail_temp_c'],
            self.data['ambient_ir_c'],
            self.data['contact_temp_c'],
            alert_level_to_string(self.data['rail_temp_alert'])))
        
        # System health
        print("SYS: SD={} GSM={} Logs={} Alerts={}".format(
            "OK" if self.data['sd_ok'] else "ERR",
            "OK" if self.data['gsm_ok'] else "OFF",
            self.sd.record_count if self.sd else 0,
            self.total_alerts))
        
        # Overall status
        if self.data['overall_alert'] >= ALERT_WARNING:
            print(">>> ALERT: {} <<<".format(
                alert_level_to_string(self.data['overall_alert'])))
        else:
            print("Status: NORMAL")
    
    def _task_led_update(self):
        """Update LED blink rate based on alert level."""
        # Set blink interval
        if self.data['overall_alert'] == ALERT_CRITICAL:
            self.led_interval = 100
        elif self.data['overall_alert'] == ALERT_WARNING:
            self.led_interval = 300
        elif self.data['overall_alert'] == ALERT_INFO:
            self.led_interval = 500
        else:
            self.led_interval = 1000
        
        now = time.ticks_ms()
        if time.ticks_diff(now, self.last_led) >= self.led_interval:
            self.last_led = now
            self.led_state = not self.led_state
            self.led.value(1 if self.led_state else 0)
    
    def _evaluate_overall_alert(self):
        """Update overall alert level + handle critical conditions."""
        prev_alert = self.data['overall_alert']
        new_alert = evaluate_overall_alert(self.data)
        self.data['overall_alert'] = new_alert
        
        # Handle alert transitions
        if new_alert != prev_alert:
            if new_alert == ALERT_CRITICAL:
                self._handle_critical_alert()
            elif new_alert == ALERT_WARNING:
                print("\n*** WARNING CONDITION DETECTED ***")
                self._print_alert_details()
            elif prev_alert >= ALERT_WARNING and new_alert == ALERT_NONE:
                print("\n*** Alert cleared — Normal ***")
    
    def _handle_critical_alert(self):
        """Take immediate action on critical alerts."""
        print("\n" + "!" * 50)
        print("!!!  CRITICAL ALERT DETECTED  !!!")
        print("!" * 50)
        self._print_alert_details()
        
        # Send SMS if GSM available + cooldown passed
        now = time.ticks_ms()
        if (self.gsm and self.data['gsm_ok'] and
            time.ticks_diff(now, self.last_critical_alert_time) > 60000):
            
            self.last_critical_alert_time = now
            
            if self.data['vibration_alert'] == ALERT_CRITICAL:
                msg = "Critical vibration RMS={:.1f}".format(
                    self.data['vibration_rms'])
            elif self.data['rail_temp_alert'] == ALERT_CRITICAL:
                msg = "Sun kink danger Rail={:.0f}C".format(
                    self.data['rail_temp_c'])
            else:
                msg = "Critical track condition"
            
            self.gsm.send_sms_alert(self.data, msg)
        
        # Flash LED rapidly
        for _ in range(10):
            self.led.value(1)
            time.sleep_ms(50)
            self.led.value(0)
            time.sleep_ms(50)
    
    def _print_alert_details(self):
        """Print details of what triggered the alert."""
        if self.data['vibration_alert'] >= ALERT_WARNING:
            print("  -> Vibration: RMS={:.2f}  Peak={:.2f}".format(
                self.data['vibration_rms'],
                self.data['vibration_peak']))
        
        if self.data['rail_temp_alert'] >= ALERT_WARNING:
            print("  -> Rail Temp: {:.1f}°C — SUN KINK RISK".format(
                self.data['rail_temp_c']))
        
        if self.data['contact_temp_alert'] >= ALERT_WARNING:
            print("  -> Contact Temp: {:.1f}°C elevated".format(
                self.data['contact_temp_c']))
        
        if self.data['gps_valid']:
            print("  -> Location: {:.6f}, {:.6f} @ {:.1f} km/h".format(
                self.data['latitude'],
                self.data['longitude'],
                self.data['speed_kmph']))


# ================================================================
# ENTRY POINT
# ================================================================

def main():
    """Application entry point."""
    monitor = RailwayMonitor()
    
    if monitor.initialize():
        monitor.run()
    else:
        print("[FATAL] Initialization failed. System halted.")
        # Blink LED in error pattern forever
        led = Pin(PIN_LED, Pin.OUT)
        while True:
            led.value(1)
            time.sleep_ms(200)
            led.value(0)
            time.sleep_ms(200)


# Auto-run when uploaded to Pico
if __name__ == "__main__":
    main()