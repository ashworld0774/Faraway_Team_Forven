/*
 * ============================================================
 * sensor_temp.h
 * Temperature Sensors:
 * - MLX90614 (non-contact infrared — rail surface)
 * - DS18B20 (contact OneWire — ambient/contact)
 * ============================================================
 */

#ifndef SENSOR_TEMP_H
#define SENSOR_TEMP_H

#include <Adafruit_MLX90614.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "config.h"
#include "alert_system.h"

class SensorTemp {
public:
    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------
    SensorTemp() :
        _oneWire(PIN_DS18B20),
        _ds18b20(&_oneWire),
        _mlx_initialized(false),
        _ds_initialized(false),
        _rail_temp(0.0f),
        _ambient_ir(0.0f),
        _contact_temp(0.0f),
        _lastReadTime(0) {}

    // --------------------------------------------------------
    // Initialize both temperature sensors
    // --------------------------------------------------------
    bool begin() {
        bool anySuccess = false;
        
        // Initialize MLX90614 (I2C)
        DEBUG_PRINTLN(F("[TEMP] Initializing MLX90614 (IR)..."));
        if (ENABLE_IR_TEMP) {
            if (_mlx.begin()) {
                _mlx_initialized = true;
                anySuccess = true;
                DEBUG_PRINTLN(F("[TEMP] MLX90614 ready"));
                DEBUG_PRINTF("[TEMP] MLX90614 emissivity: %.2f\n",
                             _mlx.readEmissivity());
                // Rail steel emissivity ≈ 0.28 (polished) to 0.9 (oxidized)
                // For oxidized/rusty rail: 0.8 is a reasonable default
                // If you want to set it: _mlx.writeEmissivity(0.8);
            } else {
                DEBUG_PRINTLN(F("[TEMP] WARNING: MLX90614 not found"));
                DEBUG_PRINTLN(F("[TEMP] Check I2C address (should be 0x5A)"));
                _mlx_initialized = false;
            }
        }
        
        // Initialize DS18B20 (OneWire)
        DEBUG_PRINTLN(F("[TEMP] Initializing DS18B20 (contact)..."));
        if (ENABLE_CONTACT_TEMP) {
            _ds18b20.begin();
            int deviceCount = _ds18b20.getDeviceCount();
            
            if (deviceCount > 0) {
                _ds_initialized = true;
                anySuccess = true;
                DEBUG_PRINTF("[TEMP] DS18B20: %d sensor(s) found\n", 
                             deviceCount);
                
                // Set resolution: 9=0.5°C, 10=0.25°C, 11=0.125°C, 12=0.0625°C
                // 12-bit gives best accuracy (0.0625°C) but takes 750ms to convert
                // 10-bit gives 0.25°C accuracy and takes only 188ms
                _ds18b20.setResolution(10);
                
                // Set to async (non-blocking) mode
                _ds18b20.setWaitForConversion(false);
                
                // Request first conversion
                _ds18b20.requestTemperatures();
                
            } else {
                DEBUG_PRINTLN(F("[TEMP] WARNING: DS18B20 not found"));
                DEBUG_PRINTLN(F("[TEMP] Check: 4.7kΩ pull-up on data line?"));
                _ds_initialized = false;
            }
        }
        
        return anySuccess;
    }

    // --------------------------------------------------------
    // Update temperature readings
    // MLX90614 reads quickly (< 20ms)
    // DS18B20 needs 188ms (10-bit) or 750ms (12-bit) after request
    // We use async mode — request, come back later, read result
    // --------------------------------------------------------
    void update() {
        unsigned long now = millis();
        
        // Only update every TEMP_UPDATE_INTERVAL_MS
        if (now - _lastReadTime < TEMP_UPDATE_INTERVAL_MS) return;
        _lastReadTime = now;
        
        // Read MLX90614
        if (_mlx_initialized) {
            float obj  = _mlx.readObjectTempC();   // Rail surface
            float amb  = _mlx.readAmbientTempC();   // Sensor ambient
            
            // Sanity check — MLX90614 returns 0 or negative on errors
            if (obj > -40.0f && obj < 200.0f) {
                _rail_temp  = obj;
            } else {
                DEBUG_PRINTLN(F("[TEMP] MLX90614 read error (object)"));
            }
            
            if (amb > -40.0f && amb < 100.0f) {
                _ambient_ir = amb;
            } else {
                DEBUG_PRINTLN(F("[TEMP] MLX90614 read error (ambient)"));
            }
        }
        
        // Read DS18B20 (result from previous request)
        if (_ds_initialized) {
            float t = _ds18b20.getTempCByIndex(0);
            
            // DEVICE_DISCONNECTED_C = -127.0°C — indicates read failure
            if (t != DEVICE_DISCONNECTED_C && t > -55.0f && t < 125.0f) {
                _contact_temp = t;
            } else {
                DEBUG_PRINTLN(F("[TEMP] DS18B20 read error"));
                DEBUG_PRINTLN(F("[TEMP] Check pull-up resistor (4.7kΩ)"));
            }
            
            // Request next conversion (async — result ready after 188ms)
            _ds18b20.requestTemperatures();
        }
    }

    // --------------------------------------------------------
    // Populate the system data structure
    // --------------------------------------------------------
    void populateData(SystemData& data) {
        data.rail_temp_c    = _rail_temp;
        data.ambient_ir_c   = _ambient_ir;
        data.contact_temp_c = _contact_temp;
        data.mlx_ok         = _mlx_initialized;
        data.ds18b20_ok     = _ds_initialized;
        
        // Evaluate temperature alerts
        data.rail_temp_alert     = evaluateRailTempAlert(_rail_temp);
        data.contact_temp_alert  = evaluateContactTempAlert(_contact_temp);
    }

    // --------------------------------------------------------
    // Getters
    // --------------------------------------------------------
    float getRailTemp()      { return _rail_temp; }
    float getAmbientIR()     { return _ambient_ir; }
    float getContactTemp()   { return _contact_temp; }
    bool  isMLXReady()       { return _mlx_initialized; }
    bool  isDSReady()        { return _ds_initialized; }

    // --------------------------------------------------------
    // Print temperature report
    // --------------------------------------------------------
    void printReport() {
        DEBUG_PRINTLN(F("\n--- TEMPERATURE DATA ---"));
        
        if (_mlx_initialized) {
            DEBUG_PRINTF("  Rail surface (IR) : %.1f °C\n", _rail_temp);
            DEBUG_PRINTF("  Ambient (IR sens) : %.1f °C\n", _ambient_ir);
            
            // Sun kink warning
            if (_rail_temp >= RAIL_TEMP_CRITICAL_C) {
                DEBUG_PRINTLN(F("  *** CRITICAL: Sun kink danger zone! ***"));
            } else if (_rail_temp >= RAIL_TEMP_WARNING_C) {
                DEBUG_PRINTLN(F("  *** WARNING: Rail temp elevated ***"));
            }
        } else {
            DEBUG_PRINTLN(F("  IR sensor: Not available"));
        }
        
        if (_ds_initialized) {
            DEBUG_PRINTF("  Contact temp      : %.1f °C\n", _contact_temp);
        } else {
            DEBUG_PRINTLN(F("  Contact sensor: Not available"));
        }
    }

private:
    OneWire          _oneWire;
    DallasTemperature _ds18b20;
    Adafruit_MLX90614 _mlx;
    
    bool  _mlx_initialized;
    bool  _ds_initialized;
    
    float _rail_temp;
    float _ambient_ir;
    float _contact_temp;
    
    unsigned long _lastReadTime;
};

// Global instance
SensorTemp tempSensor;

#endif // SENSOR_TEMP_H