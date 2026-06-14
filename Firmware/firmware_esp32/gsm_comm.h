/*
 * ============================================================
 * gsm_comm.h
 * SIM800L GSM Communication
 * Sends data to remote server via HTTP POST
 * Also sends SMS alerts for critical conditions
 * ============================================================
 */

#ifndef GSM_COMM_H
#define GSM_COMM_H

#include <HardwareSerial.h>
#include <ArduinoJson.h>
#include "config.h"

class GSMComm {
public:
    // --------------------------------------------------------
    // Constructor
    // --------------------------------------------------------
    GSMComm() :
        _gsmSerial(2),  // UART2
        _initialized(false),
        _lastSendTime(0),
        _sendCount(0),
        _failCount(0) {}

    // --------------------------------------------------------
    // Initialize SIM800L
    // --------------------------------------------------------
    bool begin() {
        if (!ENABLE_GSM) {
            DEBUG_PRINTLN(F("[GSM] Disabled in config"));
            return false;
        }
        
        DEBUG_PRINTLN(F("[GSM] Initializing SIM800L..."));
        
        _gsmSerial.begin(GSM_BAUD_RATE, SERIAL_8N1, 
                         PIN_GSM_RX, PIN_GSM_TX);
        delay(3000);  // SIM800L needs time to power up
        
        // Test AT communication
        if (!_sendATCommand("AT", "OK", 3000)) {
            DEBUG_PRINTLN(F("[GSM] ERROR: No AT response"));
            DEBUG_PRINTLN(F("[GSM] Check:"));
            DEBUG_PRINTLN(F("[GSM]   1. Power from battery (3.7-4.2V)"));
            DEBUG_PRINTLN(F("[GSM]   2. 1000µF capacitor on VCC"));
            DEBUG_PRINTLN(F("[GSM]   3. TX/RX wires not swapped"));
            _initialized = false;
            return false;
        }
        
        DEBUG_PRINTLN(F("[GSM] AT command OK"));
        
        // Disable echo (cleaner responses)
        _sendATCommand("ATE0", "OK", 1000);
        
        // Check SIM card
        if (!_sendATCommand("AT+CPIN?", "READY", 3000)) {
            DEBUG_PRINTLN(F("[GSM] WARNING: SIM card not ready"));
            DEBUG_PRINTLN(F("[GSM] Check SIM card insertion"));
            // Continue anyway — might work for SMS without data
        }
        
        // Wait for network registration
        DEBUG_PRINTLN(F("[GSM] Waiting for network..."));
        bool networkReady = false;
        for (int i = 0; i < 10; i++) {
            String response = _sendATCommandResponse("AT+CREG?", 2000);
            if (response.indexOf(",1") != -1 || 
                response.indexOf(",5") != -1) {
                networkReady = true;
                DEBUG_PRINTLN(F("[GSM] Network registered"));
                break;
            }
            DEBUG_PRINT(F("[GSM] Waiting for network... "));
            DEBUG_PRINTLN(i + 1);
            delay(2000);
        }
        
        if (!networkReady) {
            DEBUG_PRINTLN(F("[GSM] WARNING: Network not found"));
            DEBUG_PRINTLN(F("[GSM] SMS/Data unavailable but initialized"));
        }
        
        // Get signal strength
        String csq = _sendATCommandResponse("AT+CSQ", 1000);
        DEBUG_PRINT(F("[GSM] Signal: "));
        DEBUG_PRINTLN(csq);
        
        // Get SIM operator name
        String cops = _sendATCommandResponse("AT+COPS?", 2000);
        DEBUG_PRINT(F("[GSM] Operator: "));
        DEBUG_PRINTLN(cops);
        
        _initialized = true;
        DEBUG_PRINTLN(F("[GSM] Ready"));
        return true;
    }

    // --------------------------------------------------------
    // Send data to server via HTTP POST
    // --------------------------------------------------------
    bool sendData(const SystemData& data) {
        if (!_initialized) return false;
        if (!ENABLE_GSM) return false;
        
        unsigned long now = millis();
        if (now - _lastSendTime < GSM_SEND_INTERVAL_MS) return true;
        _lastSendTime = now;
        
        DEBUG_PRINTLN(F("[GSM] Preparing to send data..."));
        
        // Build JSON payload
        // Using ArduinoJson to create proper JSON format
        StaticJsonDocument<1024> doc;
        
        doc["device_id"]    = DEVICE_ID;
        doc["train_id"]     = TRAIN_ID;
        doc["firmware"]     = FIRMWARE_VERSION;
        doc["timestamp"]    = data.timestamp_ms;
        doc["datetime"]     = data.datetime_str;
        
        JsonObject gps = doc.createNestedObject("gps");
        gps["lat"]      = serialized(String(data.latitude, 6));
        gps["lon"]      = serialized(String(data.longitude, 6));
        gps["alt"]      = data.altitude_m;
        gps["speed"]    = data.speed_kmph;
        gps["sats"]     = data.satellites;
        gps["valid"]    = data.gps_valid;
        
        JsonObject vib = doc.createNestedObject("vibration");
        vib["ax"]       = serialized(String(data.accel_x, 3));
        vib["ay"]       = serialized(String(data.accel_y, 3));
        vib["az"]       = serialized(String(data.accel_z, 3));
        vib["rms"]      = serialized(String(data.vibration_rms, 4));
        vib["peak"]     = serialized(String(data.vibration_peak, 4));
        vib["v_rms"]    = serialized(String(data.vibration_vertical_rms, 4));
        vib["alert"]    = (int)data.vibration_alert;
        
        JsonObject temp = doc.createNestedObject("temperature");
        temp["rail"]    = serialized(String(data.rail_temp_c, 1));
        temp["ambient"] = serialized(String(data.ambient_ir_c, 1));
        temp["contact"] = serialized(String(data.contact_temp_c, 1));
        temp["alert"]   = (int)data.rail_temp_alert;
        
        doc["alert_level"] = (int)data.overall_alert;
        
        // Serialize JSON to string
        String jsonStr;
        serializeJson(doc, jsonStr);
        
        DEBUG_PRINTF("[GSM] Payload size: %d bytes\n", jsonStr.length());
        
        // Send via HTTP
        bool success = _httpPost(jsonStr);
        
        if (success) {
            _sendCount++;
            DEBUG_PRINTF("[GSM] Sent successfully (total: %d)\n", _sendCount);
        } else {
            _failCount++;
            DEBUG_PRINTF("[GSM] Send failed (fails: %d)\n", _failCount);
        }
        
        return success;
    }

    // --------------------------------------------------------
    // Send SMS alert for critical conditions
    // --------------------------------------------------------
    bool sendSMSAlert(const SystemData& data, const char* message) {
        if (!_initialized) return false;
        
        // Build SMS text
        char sms[160];  // Standard SMS length limit
        snprintf(sms, sizeof(sms),
            "RAIL ALERT[%s] %s "
            "Loc:%.4f,%.4f "
            "Vib:%.1f Tmp:%.1f",
            alertLevelToString(data.overall_alert),
            message,
            data.latitude,
            data.longitude,
            data.vibration_rms,
            data.rail_temp_c
        );
        
        // Set SMS text mode
        _sendATCommand("AT+CMGF=1", "OK", 1000);
        
        // Set recipient number — CHANGE THIS
        String cmd = "AT+CMGS=\"+91XXXXXXXXXX\"";
        _sendATCommandNoWait(cmd.c_str());
        delay(1000);
        
        // Send message text + Ctrl+Z to send
        _gsmSerial.print(sms);
        delay(100);
        _gsmSerial.write(26);  // Ctrl+Z = send SMS
        
        delay(3000);
        
        String resp = "";
        unsigned long t = millis();
        while (millis() - t < 5000) {
            while (_gsmSerial.available()) {
                resp += (char)_gsmSerial.read();
            }
            if (resp.indexOf("+CMGS:") != -1) {
                DEBUG_PRINTLN(F("[GSM] SMS sent successfully"));
                return true;
            }
        }
        
        DEBUG_PRINTLN(F("[GSM] SMS send failed or timeout"));
        return false;
    }

    // --------------------------------------------------------
    // Getters
    // --------------------------------------------------------
    bool isInitialized() { return _initialized; }
    int  getSendCount()  { return _sendCount; }
    int  getFailCount()  { return _failCount; }

    // Get signal strength (0-31, 99=unknown, higher=better)
    int getSignalStrength() {
        String resp = _sendATCommandResponse("AT+CSQ", 1000);
        int idx = resp.indexOf("+CSQ: ");
        if (idx != -1) {
            return resp.substring(idx + 6).toInt();
        }
        return -1;
    }

private:
    // --------------------------------------------------------
    // HTTP POST to server
    // --------------------------------------------------------
    bool _httpPost(const String& json) {
        // Set APN and open data connection
        _sendATCommand("AT+SAPBR=3,1,\"Contype\",\"GPRS\"", "OK", 2000);
        
        String apnCmd = "AT+SAPBR=3,1,\"APN\",\"";
        apnCmd += GSM_APN;
        apnCmd += "\"";
        _sendATCommand(apnCmd.c_str(), "OK", 2000);
        
        _sendATCommand("AT+SAPBR=1,1", "OK", 10000);
        _sendATCommand("AT+SAPBR=2,1", "OK", 3000);
        
        // Initialize HTTP
        if (!_sendATCommand("AT+HTTPINIT", "OK", 3000)) {
            DEBUG_PRINTLN(F("[GSM] HTTP init failed"));
            return false;
        }
        
        // Set HTTP parameters
        _sendATCommand("AT+HTTPPARA=\"CID\",1", "OK", 2000);
        
        String urlCmd = "AT+HTTPPARA=\"URL\",\"http://";
        urlCmd += SERVER_URL;
        urlCmd += ":";
        urlCmd += SERVER_PORT;
        urlCmd += SERVER_PATH;
        urlCmd += "\"";
        _sendATCommand(urlCmd.c_str(), "OK", 2000);
        
        _sendATCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"", 
                       "OK", 2000);
        
        // Set HTTP body (data)
        String dataCmd = "AT+HTTPDATA=";
        dataCmd += json.length();
        dataCmd += ",10000";
        
        if (!_sendATCommand(dataCmd.c_str(), "DOWNLOAD", 3000)) {
            DEBUG_PRINTLN(F("[GSM] HTTP data command failed"));
            _sendATCommand("AT+HTTPTERM", "OK", 2000);
            return false;
        }
        
        // Send the JSON data
        _gsmSerial.print(json);
        delay(500);
        
        // Send the HTTP POST
        if (!_sendATCommand("AT+HTTPACTION=1", "OK", 3000)) {
            DEBUG_PRINTLN(F("[GSM] HTTP action failed"));
            _sendATCommand("AT+HTTPTERM", "OK", 2000);
            return false;
        }
        
        // Wait for response
        delay(5000);
        String response = _sendATCommandResponse("AT+HTTPREAD", 5000);
        
        // Terminate HTTP session
        _sendATCommand("AT+HTTPTERM", "OK", 2000);
        _sendATCommand("AT+SAPBR=0,1", "OK", 5000);
        
        // Check response code (200 = success)
        bool success = (response.indexOf("200") != -1);
        return success;
    }

    // --------------------------------------------------------
    // Send AT command and wait for expected response
    // Returns true if expected string found in response
    // --------------------------------------------------------
    bool _sendATCommand(const char* cmd, const char* expected, 
                        unsigned long timeout) {
        _gsmSerial.println(cmd);
        
        unsigned long startTime = millis();
        String response = "";
        
        while (millis() - startTime < timeout) {
            while (_gsmSerial.available()) {
                char c = _gsmSerial.read();
                response += c;
                if (response.indexOf(expected) != -1) {
                    if (DEBUG_VERBOSE) {
                        DEBUG_PRINTF("[GSM] CMD: %s → OK\n", cmd);
                    }
                    return true;
                }
                if (response.indexOf("ERROR") != -1) {
                    if (DEBUG_VERBOSE) {
                        DEBUG_PRINTF("[GSM] CMD: %s → ERROR\n", cmd);
                    }
                    return false;
                }
            }
        }
        
        if (DEBUG_VERBOSE) {
            DEBUG_PRINTF("[GSM] CMD: %s → TIMEOUT\n", cmd);
        }
        return false;
    }

    // --------------------------------------------------------
    // Send AT command and return full response as String
    // --------------------------------------------------------
    String _sendATCommandResponse(const char* cmd, unsigned long timeout) {
        _gsmSerial.println(cmd);
        
        unsigned long startTime = millis();
        String response = "";
        
        while (millis() - startTime < timeout) {
            while (_gsmSerial.available()) {
                response += (char)_gsmSerial.read();
            }
            if (response.length() > 0 && 
                millis() - startTime > 200) {
                // Give a bit of time for full response
                delay(100);
                while (_gsmSerial.available()) {
                    response += (char)_gsmSerial.read();
                }
                break;
            }
        }
        
        return response;
    }

    // --------------------------------------------------------
    // Send AT command without waiting for response
    // --------------------------------------------------------
    void _sendATCommandNoWait(const char* cmd) {
        _gsmSerial.println(cmd);
    }

    HardwareSerial  _gsmSerial;
    bool            _initialized;
    unsigned long   _lastSendTime;
    int             _sendCount;
    int             _failCount;
};

// Global instance
GSMComm gsmComm;

#endif // GSM_COMM_H