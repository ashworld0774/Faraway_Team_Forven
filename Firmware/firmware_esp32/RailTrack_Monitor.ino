/*
 * ============================================================
 * main.ino
 * Railway Track Condition Monitoring System
 * 
 * Hardware:
 *   - ESP32 DevKit V1 (30-pin)
 *   - MPU6050 GY-521 (vibration, I2C 0x68)
 *   - MLX90614 (rail IR temperature, I2C 0x5A)
 *   - DS18B20 (contact temperature, OneWire GPIO4)
 *   - NEO-M8N GPS (UART1, GPIO16/17)
 *   - MicroSD module (SPI, GPIO5/18/19/23)
 *   - SIM800L GSM (UART2, GPIO26/27) [optional]
 *   - Status LED (GPIO2)
 *
 * Author: [Your Name / Team Name]
 * Date: 2025
 * Version: 1.0.0
 *
 * License: MIT — Free to use, modify, and share
 * ============================================================
 */

// ============================================================
// INCLUDE ALL MODULES
// Order matters — config.h must be first!
// ============================================================
#include "config.h"
#include "alert_system.h"
#include "sensor_mpu.h"
#include "sensor_gps.h"
#include "sensor_temp.h"
#include "data_logger.h"
#include "gsm_comm.h"

// ============================================================
// GLOBAL STATE VARIABLES
// ============================================================
SystemData currentData;                // Current sensor readings

// Timing variables — using millis() for non-blocking timing
// NEVER use delay() in main loop — it blocks everything!
unsigned long lastSampleTime      = 0;
unsigned long lastGPSTime         = 0;
unsigned long lastTempTime        = 0;
unsigned long lastLogTime         = 0;
unsigned long lastGSMTime         = 0;
unsigned long lastDisplayTime     = 0;
unsigned long lastVibStatsTime    = 0;
unsigned long lastLEDTime         = 0;
unsigned long systemStartTime     = 0;

// LED blink pattern (reflects system status)
bool          ledState            = false;
unsigned long ledInterval         = 1000;   // 1 second = normal
bool          previousAlert       = false;

// Alert tracking (prevent duplicate SMS alerts)
AlertLevel    lastAlertLevel      = ALERT_NONE;
unsigned long lastAlertTime       = 0;
#define ALERT_COOLDOWN_MS         60000     // 1 min between SMS alerts

// Statistics tracking
unsigned long totalSamples        = 0;
unsigned long totalAlerts         = 0;

// ============================================================
// FUNCTION DECLARATIONS (prototypes)
// ============================================================
void initSystem();
void runSensorSampling();
void runVibrationAnalysis();
void runGPSUpdate();
void runTemperatureUpdate();
void runDataLogging();
void runGSMTransmission();
void runDisplayUpdate();
void runAlertProcessing();
void runLEDUpdate();
void printSystemStatus();
void printBootHeader();
void handleCriticalAlert();

// ============================================================
// setup() — Runs ONCE at power-on or reset
// ============================================================
void setup() {
    // Initialize serial port for debugging FIRST
    Serial.begin(DEBUG_BAUD);
    delay(500);  // Give serial monitor time to connect
    
    // Print boot header
    printBootHeader();
    
    // Record system start time
    systemStartTime = millis();
    
    // Initialize GPIO
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, HIGH);  // LED on during initialization
    
    // Initialize I2C bus with explicit pins
    Wire.begin(PIN_SDA, PIN_SCL);
    Wire.setClock(400000);  // 400kHz fast mode
    
    DEBUG_PRINTLN(F("\n[INIT] Starting module initialization..."));
    DEBUG_PRINTLN(F("[INIT] ================================"));
    
    // --------------------------------------------------------
    // Initialize MPU6050 — vibration sensor
    // --------------------------------------------------------
    bool mpuOK = mpuSensor.begin();
    currentData.mpu_ok = mpuOK;
    if (!mpuOK) {
        DEBUG_PRINTLN(F("[INIT] MPU6050 FAILED — vibration monitoring off"));
    }
    
    // --------------------------------------------------------
    // Initialize GPS
    // --------------------------------------------------------
    bool gpsOK = false;
    if (ENABLE_GPS) {
        gpsOK = gpsSensor.begin();
        currentData.gps_ok = gpsOK;
    }
    
    // --------------------------------------------------------
    // Initialize Temperature Sensors
    // --------------------------------------------------------
    bool tempOK = tempSensor.begin();
    
    // --------------------------------------------------------
    // Initialize SD Card
    // --------------------------------------------------------
    bool sdOK = false;
    if (ENABLE_SD) {
        sdOK = sdLogger.begin();
        currentData.sd_ok = sdOK;
    }
    
    // --------------------------------------------------------
    // Initialize GSM (last — takes longest and optional)
    // --------------------------------------------------------
    bool gsmOK = false;
    if (ENABLE_GSM) {
        DEBUG_PRINTLN(F("[INIT] Starting GSM (may take 10-30 seconds)..."));
        gsmOK = gsmComm.begin();
        currentData.gsm_ok = gsmOK;
    }
    
    // --------------------------------------------------------
    // Initialization complete summary
    // --------------------------------------------------------
    DEBUG_PRINTLN(F("\n[INIT] ================================"));
    DEBUG_PRINTLN(F("[INIT] Initialization Complete:"));
    DEBUG_PRINTF("[INIT]   MPU6050  (Vibration) : %s\n", 
                 mpuOK  ? "OK" : "FAILED");
    DEBUG_PRINTF("[INIT]   NEO-M8N  (GPS)       : %s\n", 
                 gpsOK  ? "OK" : "FAILED/SEARCHING");
    DEBUG_PRINTF("[INIT]   MLX90614 (IR Temp)   : %s\n", 
                 tempSensor.isMLXReady() ? "OK" : "FAILED");
    DEBUG_PRINTF("[INIT]   DS18B20  (Temp)      : %s\n", 
                 tempSensor.isDSReady()  ? "OK" : "FAILED");
    DEBUG_PRINTF("[INIT]   SD Card  (Storage)   : %s\n", 
                 sdOK   ? "OK" : "FAILED");
    DEBUG_PRINTF("[INIT]   SIM800L  (GSM)       : %s\n", 
                 gsmOK  ? "OK" : "DISABLED/FAILED");
    DEBUG_PRINTLN(F("[INIT] ================================"));
    
    // Check if minimum sensors are available
    if (!mpuOK) {
        DEBUG_PRINTLN(F("[INIT] WARNING: Core vibration sensor missing!"));
        DEBUG_PRINTLN(F("[INIT] System will run but track monitoring limited"));
    }
    
    // LED off = initialization done
    digitalWrite(PIN_LED, LOW);
    
    // Short blink pattern to indicate ready
    for (int i = 0; i < 3; i++) {
        digitalWrite(PIN_LED, HIGH);
        delay(100);
        digitalWrite(PIN_LED, LOW);
        delay(100);
    }
    
    DEBUG_PRINTLN(F("\n[MAIN] System running. Starting main loop..."));
    DEBUG_PRINTLN(F("[MAIN] Open Serial Monitor at 115200 baud"));
    DEBUG_PRINTLN(F("[MAIN] ====================================\n"));
}

// ============================================================
// loop() — Runs CONTINUOUSLY after setup()
// Uses timing-based scheduling (no RTOS needed for prototype)
// NEVER put delay() in loop — it blocks all other tasks!
// ============================================================
void loop() {
    unsigned long now = millis();
    
    // --------------------------------------------------------
    // TASK 1: Read MPU6050 vibration data (every 20ms = 50Hz)
    // High frequency sampling captures vibration accurately
    // Nyquist theorem: to detect N Hz vibration, sample at 2N Hz
    // Track defects cause vibrations up to 20Hz, so 50Hz is good
    // --------------------------------------------------------
    if (now - lastSampleTime >= 20) {
        lastSampleTime = now;
        runSensorSampling();
        totalSamples++;
    }
    
    // --------------------------------------------------------
    // TASK 2: Calculate vibration statistics (every 500ms)
    // --------------------------------------------------------
    if (now - lastVibStatsTime >= VIBRATION_WINDOW_MS) {
        lastVibStatsTime = now;
        runVibrationAnalysis();
    }
    
    // --------------------------------------------------------
    // TASK 3: Process GPS data (every 100ms)
    // GPS sends data continuously — we parse it frequently
    // --------------------------------------------------------
    if (now - lastGPSTime >= 100) {
        lastGPSTime = now;
        runGPSUpdate();
    }
    
    // --------------------------------------------------------
    // TASK 4: Read temperature sensors (every 2 seconds)
    // MLX90614 and DS18B20 don't need high-speed sampling
    // Temperature changes slowly relative to vibration
    // --------------------------------------------------------
    if (now - lastTempTime >= TEMP_UPDATE_INTERVAL_MS) {
        lastTempTime = now;
        runTemperatureUpdate();
    }
    
    // --------------------------------------------------------
    // TASK 5: Process alerts (every 500ms)
    // --------------------------------------------------------
    if (now - lastVibStatsTime >= 100) {  
        runAlertProcessing();
    }
    
    // --------------------------------------------------------
    // TASK 6: Log data to SD card (every 1 second)
    // --------------------------------------------------------
    if (now - lastLogTime >= SD_LOG_INTERVAL_MS) {
        lastLogTime = now;
        runDataLogging();
    }
    
    // --------------------------------------------------------
    // TASK 7: Send data via GSM (every 30 seconds)
    // GSM transmission is slow — don't do it too often
    // --------------------------------------------------------
    if (ENABLE_GSM && (now - lastGSMTime >= GSM_SEND_INTERVAL_MS)) {
        lastGSMTime = now;
        runGSMTransmission();
    }
    
    // --------------------------------------------------------
    // TASK 8: Print status to Serial (every 2 seconds)
    // --------------------------------------------------------
    if (now - lastDisplayTime >= DISPLAY_INTERVAL_MS) {
        lastDisplayTime = now;
        runDisplayUpdate();
    }
    
    // --------------------------------------------------------
    // TASK 9: Update status LED (reflects alert level)
    // --------------------------------------------------------
    runLEDUpdate();
}

// ============================================================
// TASK FUNCTIONS
// ============================================================

// --------------------------------------------------------
// Task 1: Sample MPU6050 at high frequency
// --------------------------------------------------------
void runSensorSampling() {
    if (!currentData.mpu_ok) return;
    
    mpuSensor.read();
    currentData.timestamp_ms = millis();
}

// --------------------------------------------------------
// Task 2: Calculate vibration statistics over time window
// --------------------------------------------------------
void runVibrationAnalysis() {
    if (!currentData.mpu_ok) return;
    
    mpuSensor.calculateStatistics();
    mpuSensor.populateData(currentData);
}

// --------------------------------------------------------
// Task 3: Process GPS NMEA stream
// --------------------------------------------------------
void runGPSUpdate() {
    if (!ENABLE_GPS) return;
    
    gpsSensor.update();
    gpsSensor.populateData(currentData);
}

// --------------------------------------------------------
// Task 4: Read temperature sensors
// --------------------------------------------------------
void runTemperatureUpdate() {
    tempSensor.update();
    tempSensor.populateData(currentData);
}

// --------------------------------------------------------
// Task 5: Evaluate alerts and handle critical conditions
// --------------------------------------------------------
void runAlertProcessing() {
    // Calculate overall alert level
    currentData.overall_alert = evaluateOverallAlert(currentData);
    
    // If alert level changed, handle it
    if (currentData.overall_alert != lastAlertLevel) {
        
        if (currentData.overall_alert == ALERT_CRITICAL) {
            handleCriticalAlert();
        } else if (currentData.overall_alert == ALERT_WARNING) {
            DEBUG_PRINTLN(F("\n⚠️  WARNING CONDITION DETECTED"));
            _printAlertDetails();
        } else if (lastAlertLevel >= ALERT_WARNING && 
                   currentData.overall_alert == ALERT_NONE) {
            DEBUG_PRINTLN(F("\n✅  Alert cleared — Conditions normal"));
        }
        
        lastAlertLevel = currentData.overall_alert;
    }
}

// --------------------------------------------------------
// Task 6: Log data to SD card
// --------------------------------------------------------
void runDataLogging() {
    if (!ENABLE_SD) return;
    
    bool logged = sdLogger.logData(currentData);
    currentData.sd_ok = sdLogger.isInitialized();
    
    // Also log to alert file if alert is active
    if (currentData.overall_alert >= ALERT_WARNING) {
        char desc[80];
        
        // Build description of what triggered the alert
        if (currentData.vibration_alert >= ALERT_WARNING) {
            snprintf(desc, sizeof(desc), 
                     "Vibration RMS=%.2f Peak=%.2f",
                     currentData.vibration_rms,
                     currentData.vibration_peak);
        } else if (currentData.rail_temp_alert >= ALERT_WARNING) {
            snprintf(desc, sizeof(desc),
                     "Rail Temp=%.1f deg C",
                     currentData.rail_temp_c);
        } else {
            strcpy(desc, "Multiple conditions");
        }
        
        sdLogger.logAlert(currentData, desc);
        totalAlerts++;
    }
}

// --------------------------------------------------------
// Task 7: Transmit data via GSM
// --------------------------------------------------------
void runGSMTransmission() {
    if (!ENABLE_GSM || !currentData.gsm_ok) return;
    
    gsmComm.sendData(currentData);
}

// --------------------------------------------------------
// Task 8: Display status on Serial Monitor
// --------------------------------------------------------
void runDisplayUpdate() {
    // Clear screen with separator
    DEBUG_PRINTLN(F("\n"));
    DEBUG_PRINTLN(F("╔══════════════════════════════════════════════╗"));
    DEBUG_PRINTF( "║  Railway Monitor | Uptime: %8lu s         ║\n",
                  millis() / 1000);
    DEBUG_PRINTLN(F("╚══════════════════════════════════════════════╝"));
    
    // GPS status line
    if (currentData.gps_valid) {
        DEBUG_PRINTF("📍 GPS: %.5f, %.5f | %.1f km/h | %d sats\n",
                     currentData.latitude,
                     currentData.longitude,
                     currentData.speed_kmph,
                     currentData.satellites);
    } else {
        DEBUG_PRINTF("📍 GPS: Searching... | %d sats | %s\n",
                     currentData.satellites,
                     currentData.gps_ok ? "Active" : "Failed");
    }
    
    // Vibration status line
    DEBUG_PRINTF("📳 VIB: RMS=%.2f  Peak=%.2f  V_RMS=%.2f m/s²  [%s]\n",
                 currentData.vibration_rms,
                 currentData.vibration_peak,
                 currentData.vibration_vertical_rms,
                 alertLevelToString(currentData.vibration_alert));
    
    // Temperature status line
    DEBUG_PRINTF("🌡  TEMP: Rail=%.1f°C  IR_Amb=%.1f°C  "
                 "Contact=%.1f°C  [%s]\n",
                 currentData.rail_temp_c,
                 currentData.ambient_ir_c,
                 currentData.contact_temp_c,
                 alertLevelToString(currentData.rail_temp_alert));
    
    // System health line
    DEBUG_PRINTF("💾 SD:%s | GSM:%s | Logs:%d | Alerts:%lu\n",
                 currentData.sd_ok ? "OK" : "ERR",
                 currentData.gsm_ok ? 
                     (String("OK(") + gsmComm.getSendCount() + ")").c_str() 
                     : "OFF",
                 sdLogger.getRecordCount(),
                 totalAlerts);
    
    // Overall alert status
    if (currentData.overall_alert >= ALERT_WARNING) {
        DEBUG_PRINTF("⚠️  ALERT: %s\n", 
                     alertLevelToString(currentData.overall_alert));
        _printAlertDetails();
    } else {
        DEBUG_PRINTLN(F("✅  Status: NORMAL"));
    }
}

// --------------------------------------------------------
// Task 9: Update LED blink pattern
// NORMAL:   Slow blink (1 second on/off)
// WARNING:  Fast blink (200ms on/off)
// CRITICAL: Very fast blink (50ms) or solid on
// --------------------------------------------------------
void runLEDUpdate() {
    unsigned long now = millis();
    
    // Set blink interval based on alert level
    switch (currentData.overall_alert) {
        case ALERT_CRITICAL: ledInterval = 100;  break;
        case ALERT_WARNING:  ledInterval = 300;  break;
        case ALERT_INFO:     ledInterval = 500;  break;
        default:             ledInterval = 1000; break;
    }
    
    // Toggle LED at the set interval
    if (now - lastLEDTime >= ledInterval) {
        lastLEDTime = now;
        ledState = !ledState;
        digitalWrite(PIN_LED, ledState ? HIGH : LOW);
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// --------------------------------------------------------
// Handle a critical alert condition
// --------------------------------------------------------
void handleCriticalAlert() {
    DEBUG_PRINTLN(F("\n"));
    DEBUG_PRINTLN(F("🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨"));
    DEBUG_PRINTLN(F("🚨  CRITICAL ALERT DETECTED!          🚨"));
    DEBUG_PRINTLN(F("🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨"));
    _printAlertDetails();
    
    // Log immediately to SD
    char desc[80] = "CRITICAL CONDITION";
    sdLogger.logAlert(currentData, desc);
    totalAlerts++;
    
    // Send SMS if GSM available and cooldown has passed
    unsigned long now = millis();
    if (ENABLE_GSM && currentData.gsm_ok && 
        (now - lastAlertTime > ALERT_COOLDOWN_MS)) {
        
        lastAlertTime = now;
        
        char alertMsg[80];
        if (currentData.vibration_alert == ALERT_CRITICAL) {
            snprintf(alertMsg, sizeof(alertMsg),
                     "Critical vibration! RMS=%.1f m/s2",
                     currentData.vibration_rms);
        } else if (currentData.rail_temp_alert == ALERT_CRITICAL) {
            snprintf(alertMsg, sizeof(alertMsg),
                     "Sun kink danger! Rail=%.0f deg C",
                     currentData.rail_temp_c);
        } else {
            strcpy(alertMsg, "Critical track condition!");
        }
        
        gsmComm.sendSMSAlert(currentData, alertMsg);
        
        // Also send data immediately (don't wait for 30s interval)
        gsmComm.sendData(currentData);
    }
    
    // Flash LED rapidly to draw attention
    for (int i = 0; i < 10; i++) {
        digitalWrite(PIN_LED, HIGH);
        delay(50);
        digitalWrite(PIN_LED, LOW);
        delay(50);
    }
}

// --------------------------------------------------------
// Print details of what triggered the current alert
// --------------------------------------------------------
void _printAlertDetails() {
    if (currentData.vibration_alert >= ALERT_WARNING) {
        DEBUG_PRINTF("  → Vibration: RMS=%.2f (limit=%.1f), "
                     "Peak=%.2f (limit=%.1f)\n",
                     currentData.vibration_rms,
                     currentData.vibration_alert == ALERT_CRITICAL ? 
                         VIBRATION_RMS_CRITICAL : VIBRATION_RMS_WARNING,
                     currentData.vibration_peak,
                     currentData.vibration_alert == ALERT_CRITICAL ? 
                         VIBRATION_PEAK_CRITICAL : VIBRATION_PEAK_WARNING);
    }
    
    if (currentData.rail_temp_alert >= ALERT_WARNING) {
        DEBUG_PRINTF("  → Rail Temp: %.1f°C (limit=%.1f°C) — "
                     "SUN KINK RISK!\n",
                     currentData.rail_temp_c,
                     currentData.rail_temp_alert == ALERT_CRITICAL ? 
                         RAIL_TEMP_CRITICAL_C : RAIL_TEMP_WARNING_C);
    }
    
    if (currentData.contact_temp_alert >= ALERT_WARNING) {
        DEBUG_PRINTF("  → Contact Temp: %.1f°C elevated\n",
                     currentData.contact_temp_c);
    }
    
    if (currentData.gps_valid) {
        DEBUG_PRINTF("  → Location: %.6f, %.6f | Speed: %.1f km/h\n",
                     currentData.latitude,
                     currentData.longitude,
                     currentData.speed_kmph);
    } else {
        DEBUG_PRINTLN(F("  → Location: GPS fix not available"));
    }
}

// --------------------------------------------------------
// Print boot header with ASCII art and system info
// --------------------------------------------------------
void printBootHeader() {
    delay(100);
    DEBUG_PRINTLN(F("\n"));
    DEBUG_PRINTLN(F("╔══════════════════════════════════════════════════╗"));
    DEBUG_PRINTLN(F("║                                                  ║"));
    DEBUG_PRINTLN(F("║   RAILWAY TRACK CONDITION MONITORING SYSTEM      ║"));
    DEBUG_PRINTLN(F("║   ─────────────────────────────────────────      ║"));
    DEBUG_PRINTF( "║   Device ID    : %-30s  ║\n", DEVICE_ID);
    DEBUG_PRINTF( "║   Firmware     : v%-28s  ║\n", FIRMWARE_VERSION);
    DEBUG_PRINTF( "║   Train ID     : %-30s  ║\n", TRAIN_ID);
    DEBUG_PRINTLN(F("║                                                  ║"));
    DEBUG_PRINTLN(F("║   Sensors: MPU6050 | MLX90614 | DS18B20         ║"));
    DEBUG_PRINTLN(F("║            NEO-M8N GPS | SIM800L GSM            ║"));
    DEBUG_PRINTLN(F("║   Storage: MicroSD Card                         ║"));
    DEBUG_PRINTLN(F("║                                                  ║"));
    DEBUG_PRINTLN(F("╚══════════════════════════════════════════════════╝"));
    DEBUG_PRINTLN(F(""));
    DEBUG_PRINTLN(F("Built for Indian Railways — Hackathon Prototype"));
    DEBUG_PRINTLN(F(""));
}