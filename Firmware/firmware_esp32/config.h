/*
 * ============================================================
 * config.h
 * Railway Track Condition Monitoring System
 * Configuration File — Change settings here only
 * ============================================================
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================================
// SYSTEM IDENTITY
// ============================================================
#define DEVICE_ID           "RTM_UNIT_001"
#define FIRMWARE_VERSION    "1.0.0"
#define TRAIN_ID            "TRAIN_12345"

// ============================================================
// PIN DEFINITIONS — ESP32 DevKit V1
// ============================================================

// I2C Bus (MPU6050 + MLX90614)
#define PIN_SDA             21
#define PIN_SCL             22

// UART1 — GPS (NEO-M8N)
#define PIN_GPS_RX          16
#define PIN_GPS_TX          17
#define GPS_BAUD_RATE       9600

// UART2 — SIM800L GSM
#define PIN_GSM_RX          26
#define PIN_GSM_TX          27
#define GSM_BAUD_RATE       115200

// SPI — MicroSD Card
#define PIN_SD_MOSI         23
#define PIN_SD_MISO         19
#define PIN_SD_SCK          18
#define PIN_SD_CS           5

// OneWire — DS18B20 Temperature Sensor
#define PIN_DS18B20         4

// Status LED
#define PIN_LED             2

// ============================================================
// TIMING CONFIGURATION (all values in milliseconds)
// ============================================================
#define SAMPLE_INTERVAL_MS          100    // Read sensors every 100ms
#define GPS_UPDATE_INTERVAL_MS      1000   // GPS update every 1 second
#define TEMP_UPDATE_INTERVAL_MS     2000   // Temperature every 2 seconds
#define SD_LOG_INTERVAL_MS          1000   // Log to SD every 1 second
#define GSM_SEND_INTERVAL_MS        30000  // Send GSM data every 30 sec
#define DISPLAY_INTERVAL_MS         2000   // Serial print every 2 seconds
#define VIBRATION_WINDOW_MS         500    // Window for vibration analysis

// ============================================================
// VIBRATION ALERT THRESHOLDS
// ============================================================
// Units: m/s² (gravity = 9.81 m/s²)
// Normal track: 0.5-2.0 m/s² vertical acceleration
// Moderate defect: 2.0-5.0 m/s²
// Severe defect: > 5.0 m/s²

#define VIBRATION_NORMAL_THRESHOLD      2.0f   // Below = normal
#define VIBRATION_WARNING_THRESHOLD     5.0f   // Below = warning
#define VIBRATION_CRITICAL_THRESHOLD    10.0f  // Above = critical

// RMS threshold for anomaly detection
#define VIBRATION_RMS_WARNING           3.0f
#define VIBRATION_RMS_CRITICAL          7.0f

// Peak-to-peak threshold
#define VIBRATION_PEAK_WARNING          8.0f
#define VIBRATION_PEAK_CRITICAL         15.0f

// ============================================================
// TEMPERATURE ALERT THRESHOLDS
// ============================================================
// Rail steel: safe operating range -20°C to +60°C
// Long Welded Rail (LWR) critical: above 55°C (sun kink risk)

// MLX90614 — Rail surface temperature (infrared)
#define RAIL_TEMP_WARNING_C             50.0f  // Sun kink early warning
#define RAIL_TEMP_CRITICAL_C            55.0f  // Sun kink danger zone
#define RAIL_TEMP_COLD_WARNING_C        (-10.0f) // Ice/frost risk

// DS18B20 — Rail contact/ambient temperature
#define AMBIENT_TEMP_WARNING_C          45.0f
#define AMBIENT_TEMP_CRITICAL_C         50.0f

// MLX90614 ambient (sensor housing temperature)
#define SENSOR_TEMP_MAX_C               70.0f  // Sensor protection

// ============================================================
// SPEED THRESHOLDS
// ============================================================
#define SPEED_SLOW_KMPH                 30.0f  // Below = stationary/slow
#define SPEED_NORMAL_MAX_KMPH           130.0f // Typical passenger max
#define SPEED_HIGH_KMPH                 130.0f // High speed threshold

// ============================================================
// MPU6050 SETTINGS
// ============================================================
// Accelerometer range options: 2G, 4G, 8G, 16G
// For railway: 4G recommended (higher sensitivity than 16G,
// enough range for derailment events)
#define MPU_ACCEL_RANGE         MPU6050_RANGE_4_G

// Gyroscope range options: 250, 500, 1000, 2000 deg/s
#define MPU_GYRO_RANGE          MPU6050_RANGE_500_DEG

// Low-pass filter: reduces noise
// Options: 5Hz, 10Hz, 21Hz, 44Hz, 94Hz, 184Hz, 260Hz bandwidth
#define MPU_FILTER_BANDWIDTH    MPU6050_BAND_21_HZ

// Number of samples for vibration RMS calculation
#define VIBRATION_SAMPLE_COUNT  50

// ============================================================
// SD CARD SETTINGS
// ============================================================
#define LOG_FILENAME_FORMAT     "/log_%04d.csv"
#define ALERT_FILENAME          "/alerts.csv"
#define STATUS_FILENAME         "/status.txt"
#define MAX_LOG_FILES           999
#define SD_BUFFER_SIZE          512

// ============================================================
// GSM / SIM800L SETTINGS
// ============================================================
// Replace with your server details
#define GSM_APN                 "airtelgprs.com"  // Change for your SIM
#define SERVER_URL              "your-server.com"
#define SERVER_PORT             80
#define SERVER_PATH             "/api/track-data"
#define GSM_TIMEOUT_MS          10000
#define GSM_RETRY_COUNT         3

// Enable/disable features
#define ENABLE_GSM              true   // Set false if SIM800L not connected
#define ENABLE_GPS              true
#define ENABLE_SD               true
#define ENABLE_IR_TEMP          true   // MLX90614
#define ENABLE_CONTACT_TEMP     true   // DS18B20

// ============================================================
// DEBUG SETTINGS
// ============================================================
#define DEBUG_SERIAL            true
#define DEBUG_BAUD              115200
#define DEBUG_VERBOSE           false  // Extra detailed output

// Debug macros — compile out when not needed
#if DEBUG_SERIAL
  #define DEBUG_PRINT(x)    Serial.print(x)
  #define DEBUG_PRINTLN(x)  Serial.println(x)
  #define DEBUG_PRINTF(...) Serial.printf(__VA_ARGS__)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTLN(x)
  #define DEBUG_PRINTF(...)
#endif

// ============================================================
// ALERT LEVELS (used across all modules)
// ============================================================
typedef enum {
    ALERT_NONE     = 0,
    ALERT_INFO     = 1,
    ALERT_WARNING  = 2,
    ALERT_CRITICAL = 3
} AlertLevel;

// ============================================================
// SYSTEM DATA STRUCTURE
// Holds all sensor readings in one place
// ============================================================
typedef struct {
    // Timestamp
    unsigned long timestamp_ms;
    char          datetime_str[25];
    
    // GPS
    double   latitude;
    double   longitude;
    double   altitude_m;
    float    speed_kmph;
    int      satellites;
    bool     gps_valid;
    char     gps_time[15];
    char     gps_date[12];
    
    // Vibration (MPU6050)
    float    accel_x;          // m/s²
    float    accel_y;
    float    accel_z;
    float    gyro_x;           // deg/s
    float    gyro_y;
    float    gyro_z;
    float    vibration_rms;    // Combined RMS
    float    vibration_peak;   // Peak acceleration
    float    vibration_vertical_rms;  // Vertical axis specifically
    float    mpu_temp_c;       // MPU internal temperature
    
    // Temperature (MLX90614)
    float    rail_temp_c;      // Rail surface temperature (IR)
    float    ambient_ir_c;     // Ambient from MLX90614
    
    // Temperature (DS18B20)
    float    contact_temp_c;   // Contact temperature
    
    // Alert status
    AlertLevel vibration_alert;
    AlertLevel rail_temp_alert;
    AlertLevel contact_temp_alert;
    AlertLevel overall_alert;
    
    // System health
    bool     sd_ok;
    bool     gps_ok;
    bool     mpu_ok;
    bool     mlx_ok;
    bool     ds18b20_ok;
    bool     gsm_ok;
    
} SystemData;

#endif // CONFIG_H