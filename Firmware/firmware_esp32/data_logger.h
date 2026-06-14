/*
 * ============================================================
 * data_logger.h
 * SD Card Data Logger
 * Creates CSV files with all sensor data
 * ============================================================
 */

#ifndef DATA_LOGGER_H
#define DATA_LOGGER_H

#include <SPI.h>
#include <SD.h>
#include "config.h"

class DataLogger {
public:
    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------
    DataLogger() :
        _initialized(false),
        _fileIndex(0),
        _recordCount(0),
        _lastLogTime(0),
        _lastAlertFlushTime(0) {
        memset(_currentFilename, 0, sizeof(_currentFilename));
    }

    // --------------------------------------------------------
    // Initialize SD card
    // --------------------------------------------------------
    bool begin() {
        DEBUG_PRINTLN(F("[SD] Initializing SD card..."));
        
        if (!ENABLE_SD) {
            DEBUG_PRINTLN(F("[SD] Disabled in config"));
            return false;
        }
        
        // Initialize SPI and SD
        if (!SD.begin(PIN_SD_CS)) {
            DEBUG_PRINTLN(F("[SD] ERROR: Card mount failed!"));
            DEBUG_PRINTLN(F("[SD] Check:"));
            DEBUG_PRINTLN(F("[SD]   1. Card is inserted"));
            DEBUG_PRINTLN(F("[SD]   2. Card is FAT32 formatted"));
            DEBUG_PRINTLN(F("[SD]   3. SPI wiring correct"));
            DEBUG_PRINTLN(F("[SD]   4. CS pin = GPIO5"));
            _initialized = false;
            return false;
        }
        
        // Get card info
        uint8_t cardType = SD.cardType();
        if (cardType == CARD_NONE) {
            DEBUG_PRINTLN(F("[SD] No card attached"));
            _initialized = false;
            return false;
        }
        
        DEBUG_PRINT(F("[SD] Card type: "));
        switch (cardType) {
            case CARD_MMC:  DEBUG_PRINTLN(F("MMC"));  break;
            case CARD_SD:   DEBUG_PRINTLN(F("SD"));   break;
            case CARD_SDHC: DEBUG_PRINTLN(F("SDHC")); break;
            default:        DEBUG_PRINTLN(F("Unknown")); break;
        }
        
        uint64_t cardSize = SD.cardSize() / (1024 * 1024);
        DEBUG_PRINTF("[SD] Card size: %lluMB\n", cardSize);
        DEBUG_PRINTF("[SD] Free space: %lluMB\n", 
                     (SD.totalBytes() - SD.usedBytes()) / (1024*1024));
        
        // Find the next available log file index
        _findNextFileIndex();
        
        // Create new log file with CSV headers
        _createLogFile();
        
        // Create alert log file
        _createAlertFile();
        
        // Write system startup status
        _writeStatusFile();
        
        _initialized = true;
        DEBUG_PRINTF("[SD] Ready. Logging to: %s\n", _currentFilename);
        return true;
    }

    // --------------------------------------------------------
    // Log a data record to SD card
    // --------------------------------------------------------
    bool logData(const SystemData& data) {
        if (!_initialized) return false;
        if (!ENABLE_SD) return false;
        
        unsigned long now = millis();
        if (now - _lastLogTime < SD_LOG_INTERVAL_MS) return true;
        _lastLogTime = now;
        
        File logFile = SD.open(_currentFilename, FILE_APPEND);
        if (!logFile) {
            DEBUG_PRINTLN(F("[SD] ERROR: Cannot open log file"));
            return false;
        }
        
        // Write CSV record
        // Format: timestamp, datetime, lat, lon, alt, speed, sats,
        //         ax, ay, az, gx, gy, gz, vib_rms, vib_peak, vib_v_rms,
        //         rail_temp, ambient_ir, contact_temp,
        //         vib_alert, temp_alert, contact_alert, overall_alert,
        //         mpu_ok, gps_ok, mlx_ok, ds_ok

        logFile.printf(
            "%lu,"                    // timestamp_ms
            "%s,"                     // datetime
            "%.6f,%.6f,%.1f,%.1f,"   // lat, lon, alt, speed
            "%d,"                     // satellites
            "%.3f,%.3f,%.3f,"         // accel x,y,z
            "%.2f,%.2f,%.2f,"         // gyro x,y,z
            "%.4f,%.4f,%.4f,"         // vib_rms, vib_peak, vib_v_rms
            "%.1f,%.1f,%.1f,"         // rail_temp, ambient_ir, contact_temp
            "%s,%s,%s,%s,"            // alert codes
            "%d,%d,%d,%d\n",          // sensor health flags
            
            data.timestamp_ms,
            data.datetime_str,
            data.latitude, data.longitude, data.altitude_m, data.speed_kmph,
            data.satellites,
            data.accel_x, data.accel_y, data.accel_z,
            data.gyro_x,  data.gyro_y,  data.gyro_z,
            data.vibration_rms, data.vibration_peak, 
            data.vibration_vertical_rms,
            data.rail_temp_c, data.ambient_ir_c, data.contact_temp_c,
            alertLevelToCode(data.vibration_alert),
            alertLevelToCode(data.rail_temp_alert),
            alertLevelToCode(data.contact_temp_alert),
            alertLevelToCode(data.overall_alert),
            data.mpu_ok ? 1 : 0,
            data.gps_ok ? 1 : 0,
            data.mlx_ok ? 1 : 0,
            data.ds18b20_ok ? 1 : 0
        );
        
        logFile.close();
        _recordCount++;
        
        // If records exceed ~10000, start new file (manages file size)
        if (_recordCount >= 10000) {
            _fileIndex++;
            _createLogFile();
            _recordCount = 0;
        }
        
        return true;
    }

    // --------------------------------------------------------
    // Log an alert event (separate alerts-only file)
    // --------------------------------------------------------
    bool logAlert(const SystemData& data, const char* description) {
        if (!_initialized) return false;
        
        File alertFile = SD.open(ALERT_FILENAME, FILE_APPEND);
        if (!alertFile) return false;
        
        alertFile.printf(
            "%lu,%s,%.6f,%.6f,%.1f,%.4f,%.4f,%.1f,%.1f,%s,%s\n",
            data.timestamp_ms,
            data.datetime_str,
            data.latitude,
            data.longitude,
            data.speed_kmph,
            data.vibration_rms,
            data.vibration_peak,
            data.rail_temp_c,
            data.contact_temp_c,
            alertLevelToString(data.overall_alert),
            description
        );
        
        alertFile.close();
        
        DEBUG_PRINTF("[SD] Alert logged: %s\n", description);
        return true;
    }

    bool isInitialized() { return _initialized; }
    int  getRecordCount() { return _recordCount; }
    char* getCurrentFilename() { return _currentFilename; }

private:
    // --------------------------------------------------------
    // Find next available file index
    // --------------------------------------------------------
    void _findNextFileIndex() {
        char filename[30];
        _fileIndex = 0;
        
        while (_fileIndex < MAX_LOG_FILES) {
            snprintf(filename, sizeof(filename), 
                     LOG_FILENAME_FORMAT, _fileIndex);
            if (!SD.exists(filename)) break;
            _fileIndex++;
        }
        
        DEBUG_PRINTF("[SD] Next file index: %d\n", _fileIndex);
    }

    // --------------------------------------------------------
    // Create a new log file with CSV headers
    // --------------------------------------------------------
    void _createLogFile() {
        snprintf(_currentFilename, sizeof(_currentFilename),
                 LOG_FILENAME_FORMAT, _fileIndex);
        
        File logFile = SD.open(_currentFilename, FILE_WRITE);
        if (!logFile) {
            DEBUG_PRINTF("[SD] Cannot create: %s\n", _currentFilename);
            return;
        }
        
        // Write CSV header row — matches the data format in logData()
        logFile.println(
            "timestamp_ms,datetime,"
            "latitude,longitude,altitude_m,speed_kmph,"
            "satellites,"
            "accel_x,accel_y,accel_z,"
            "gyro_x,gyro_y,gyro_z,"
            "vib_rms,vib_peak,vib_vertical_rms,"
            "rail_temp_c,ambient_ir_c,contact_temp_c,"
            "vib_alert,temp_alert,contact_alert,overall_alert,"
            "mpu_ok,gps_ok,mlx_ok,ds18b20_ok"
        );
        
        logFile.close();
        DEBUG_PRINTF("[SD] Created log: %s\n", _currentFilename);
    }

    // --------------------------------------------------------
    // Create alert log file with headers
    // --------------------------------------------------------
    void _createAlertFile() {
        if (!SD.exists(ALERT_FILENAME)) {
            File f = SD.open(ALERT_FILENAME, FILE_WRITE);
            if (f) {
                f.println(
                    "timestamp_ms,datetime,"
                    "latitude,longitude,speed_kmph,"
                    "vib_rms,vib_peak,"
                    "rail_temp_c,contact_temp_c,"
                    "alert_level,description"
                );
                f.close();
            }
        }
    }

    // --------------------------------------------------------
    // Write system status/boot info
    // --------------------------------------------------------
    void _writeStatusFile() {
        File f = SD.open(STATUS_FILENAME, FILE_APPEND);
        if (f) {
            f.printf("=== BOOT @ %lu ms ===\n", millis());
            f.printf("Device: %s\n", DEVICE_ID);
            f.printf("Firmware: %s\n", FIRMWARE_VERSION);
            f.printf("Train: %s\n", TRAIN_ID);
            f.printf("Log file: %s\n", _currentFilename);
            f.println();
            f.close();
        }
    }

    bool  _initialized;
    int   _fileIndex;
    int   _recordCount;
    char  _currentFilename[30];
    unsigned long _lastLogTime;
    unsigned long _lastAlertFlushTime;
};

// Global instance
DataLogger sdLogger;

#endif // DATA_LOGGER_H