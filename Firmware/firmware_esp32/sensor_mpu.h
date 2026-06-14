/*
 * ============================================================
 * sensor_mpu.h
 * MPU6050 Accelerometer and Gyroscope
 * Vibration analysis for track condition monitoring
 * ============================================================
 */

#ifndef SENSOR_MPU_H
#define SENSOR_MPU_H

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <math.h>
#include "config.h"

// ============================================================
// CLASS DEFINITION
// ============================================================
class SensorMPU {
public:
    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------
    SensorMPU() : 
        _initialized(false),
        _sampleCount(0),
        _sumSquaredX(0), _sumSquaredY(0), _sumSquaredZ(0),
        _peakAccel(0),
        _lastSampleTime(0) {}

    // --------------------------------------------------------
    // Initialize the MPU6050
    // Returns true if successful
    // --------------------------------------------------------
    bool begin() {
        DEBUG_PRINTLN(F("[MPU6050] Initializing..."));
        
        if (!_mpu.begin()) {
            DEBUG_PRINTLN(F("[MPU6050] ERROR: Not found. Check wiring!"));
            _initialized = false;
            return false;
        }
        
        // Configure accelerometer range
        _mpu.setAccelerometerRange(MPU_ACCEL_RANGE);
        DEBUG_PRINT(F("[MPU6050] Accel range: "));
        switch (MPU_ACCEL_RANGE) {
            case MPU6050_RANGE_2_G:  DEBUG_PRINTLN(F("±2G"));  break;
            case MPU6050_RANGE_4_G:  DEBUG_PRINTLN(F("±4G"));  break;
            case MPU6050_RANGE_8_G:  DEBUG_PRINTLN(F("±8G"));  break;
            case MPU6050_RANGE_16_G: DEBUG_PRINTLN(F("±16G")); break;
        }
        
        // Configure gyroscope range
        _mpu.setGyroRange(MPU_GYRO_RANGE);
        
        // Configure low-pass filter — reduces high-frequency noise
        // 21Hz bandwidth is good for track geometry analysis
        // (track defects manifest at 0.5-20Hz at typical speeds)
        _mpu.setFilterBandwidth(MPU_FILTER_BANDWIDTH);
        DEBUG_PRINTLN(F("[MPU6050] Filter: 21Hz bandwidth"));
        
        // Perform gravity calibration
        _calibrate();
        
        _initialized = true;
        DEBUG_PRINTLN(F("[MPU6050] Ready"));
        return true;
    }

    // --------------------------------------------------------
    // Read raw sensor data
    // Call this frequently (every 20-50ms)
    // --------------------------------------------------------
    bool read() {
        if (!_initialized) return false;
        
        sensors_event_t accel, gyro, temp;
        _mpu.getEvent(&accel, &gyro, &temp);
        
        // Store raw readings
        _raw_ax = accel.acceleration.x;
        _raw_ay = accel.acceleration.y;
        _raw_az = accel.acceleration.z;
        _raw_gx = gyro.gyro.x;
        _raw_gy = gyro.gyro.y;
        _raw_gz = gyro.gyro.z;
        _raw_temp = temp.temperature;
        
        // Apply calibration offset
        // Remove gravity from vertical axis (Z in our mounting)
        // After calibration, 0 m/s² means perfectly level and still
        float ax = _raw_ax - _offset_ax;
        float ay = _raw_ay - _offset_ay;
        float az = _raw_az - _offset_az;
        
        // Store calibrated values
        _accel_x = ax;
        _accel_y = ay;
        _accel_z = az;
        _gyro_x  = _raw_gx * (180.0f / PI);  // rad/s → deg/s
        _gyro_y  = _raw_gy * (180.0f / PI);
        _gyro_z  = _raw_gz * (180.0f / PI);
        _temp_c  = _raw_temp;
        
        // Accumulate for RMS calculation
        // RMS = sqrt(mean of squared values over time window)
        // This gives us the "energy" of vibration
        _sumSquaredX += ax * ax;
        _sumSquaredY += ay * ay;
        _sumSquaredZ += az * az;
        _sampleCount++;
        
        // Track peak acceleration magnitude
        float magnitude = sqrt(ax*ax + ay*ay + az*az);
        if (magnitude > _peakAccel) {
            _peakAccel = magnitude;
        }
        
        return true;
    }

    // --------------------------------------------------------
    // Calculate vibration statistics over the sample window
    // Call this every VIBRATION_WINDOW_MS milliseconds
    // --------------------------------------------------------
    void calculateStatistics() {
        if (_sampleCount == 0) return;
        
        // RMS of each axis
        float rms_x = sqrt(_sumSquaredX / _sampleCount);
        float rms_y = sqrt(_sumSquaredY / _sampleCount);
        float rms_z = sqrt(_sumSquaredZ / _sampleCount);
        
        // Combined RMS (total vibration energy)
        _vibration_rms = sqrt(rms_x*rms_x + rms_y*rms_y + rms_z*rms_z);
        
        // Vertical RMS (Z-axis — most important for track geometry)
        // When mounted on bogie, Z-axis is vertical
        // Vertical vibration most strongly correlates with track condition
        _vertical_rms = rms_z;
        
        // Store peak and reset for next window
        _vibration_peak = _peakAccel;
        
        // Reset accumulators
        _sumSquaredX = 0;
        _sumSquaredY = 0;
        _sumSquaredZ = 0;
        _sampleCount = 0;
        _peakAccel = 0;
    }

    // --------------------------------------------------------
    // Populate the system data structure
    // --------------------------------------------------------
    void populateData(SystemData& data) {
        data.accel_x = _accel_x;
        data.accel_y = _accel_y;
        data.accel_z = _accel_z;
        data.gyro_x  = _gyro_x;
        data.gyro_y  = _gyro_y;
        data.gyro_z  = _gyro_z;
        data.vibration_rms          = _vibration_rms;
        data.vibration_peak         = _vibration_peak;
        data.vibration_vertical_rms = _vertical_rms;
        data.mpu_temp_c             = _temp_c;
        data.mpu_ok                 = _initialized;
        
        // Evaluate alert level
        data.vibration_alert = evaluateVibrationAlert(
            _vibration_rms, 
            _vibration_peak
        );
    }

    // --------------------------------------------------------
    // Getters
    // --------------------------------------------------------
    float getAccelX()       { return _accel_x; }
    float getAccelY()       { return _accel_y; }
    float getAccelZ()       { return _accel_z; }
    float getGyroX()        { return _gyro_x; }
    float getGyroY()        { return _gyro_y; }
    float getGyroZ()        { return _gyro_z; }
    float getRMS()          { return _vibration_rms; }
    float getPeak()         { return _vibration_peak; }
    float getVerticalRMS()  { return _vertical_rms; }
    float getTemperature()  { return _temp_c; }
    bool  isInitialized()   { return _initialized; }

    // --------------------------------------------------------
    // Print formatted vibration report to Serial
    // --------------------------------------------------------
    void printReport() {
        if (!_initialized) {
            DEBUG_PRINTLN(F("[MPU6050] Not initialized"));
            return;
        }
        
        DEBUG_PRINTLN(F("\n--- VIBRATION DATA ---"));
        DEBUG_PRINTF("  Accel X: %+6.2f m/s²\n", _accel_x);
        DEBUG_PRINTF("  Accel Y: %+6.2f m/s²\n", _accel_y);
        DEBUG_PRINTF("  Accel Z: %+6.2f m/s²\n", _accel_z);
        DEBUG_PRINTF("  Gyro  X: %+6.2f deg/s\n", _gyro_x);
        DEBUG_PRINTF("  Gyro  Y: %+6.2f deg/s\n", _gyro_y);
        DEBUG_PRINTF("  Gyro  Z: %+6.2f deg/s\n", _gyro_z);
        DEBUG_PRINTF("  RMS     : %.3f m/s²\n", _vibration_rms);
        DEBUG_PRINTF("  Vert RMS: %.3f m/s²\n", _vertical_rms);
        DEBUG_PRINTF("  Peak    : %.3f m/s²\n", _vibration_peak);
        DEBUG_PRINTF("  Temp    : %.1f °C\n", _temp_c);
    }

private:
    // --------------------------------------------------------
    // Calibration — removes static gravity component
    // Called once at startup on level, stationary track
    // --------------------------------------------------------
    void _calibrate() {
        DEBUG_PRINTLN(F("[MPU6050] Calibrating (keep still for 3 seconds)..."));
        
        float sum_x = 0, sum_y = 0, sum_z = 0;
        int   count = 100;
        
        for (int i = 0; i < count; i++) {
            sensors_event_t accel, gyro, temp;
            _mpu.getEvent(&accel, &gyro, &temp);
            sum_x += accel.acceleration.x;
            sum_y += accel.acceleration.y;
            sum_z += accel.acceleration.z;
            delay(20);
        }
        
        _offset_ax = sum_x / count;
        _offset_ay = sum_y / count;
        
        // For Z-axis, we KEEP 9.81 m/s² (gravity) as reference
        // We only remove the offset from vertical alignment
        // If sensor is perfectly flat, offset_z should be ~9.81
        // After subtraction, dynamic vertical acceleration ≈ 0 when still
        _offset_az = (sum_z / count) - 9.81f;
        
        DEBUG_PRINTF("[MPU6050] Calibration offsets: X=%.3f Y=%.3f Z=%.3f\n",
                     _offset_ax, _offset_ay, _offset_az);
    }

    // --------------------------------------------------------
    // Private members
    // --------------------------------------------------------
    Adafruit_MPU6050 _mpu;
    bool             _initialized;
    
    // Calibration offsets
    float _offset_ax, _offset_ay, _offset_az;
    
    // Current readings (calibrated)
    float _accel_x, _accel_y, _accel_z;
    float _gyro_x, _gyro_y, _gyro_z;
    float _temp_c;
    
    // Raw readings
    float _raw_ax, _raw_ay, _raw_az;
    float _raw_gx, _raw_gy, _raw_gz;
    float _raw_temp;
    
    // Vibration statistics
    float          _sumSquaredX, _sumSquaredY, _sumSquaredZ;
    int            _sampleCount;
    float          _peakAccel;
    float          _vibration_rms;
    float          _vertical_rms;
    float          _vibration_peak;
    unsigned long  _lastSampleTime;
};

// Global instance
SensorMPU mpuSensor;

#include "alert_system.h"

#endif // SENSOR_MPU_H