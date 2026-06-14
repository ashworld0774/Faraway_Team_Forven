/*
 * ============================================================
 * alert_system.h
 * Alert level determination and management
 * ============================================================
 */

#ifndef ALERT_SYSTEM_H
#define ALERT_SYSTEM_H

#include "config.h"

// ============================================================
// ALERT EVALUATION FUNCTIONS
// ============================================================

// Returns highest alert level from all readings
AlertLevel evaluateVibrationAlert(float rms, float peak) {
    if (rms >= VIBRATION_RMS_CRITICAL || peak >= VIBRATION_PEAK_CRITICAL) {
        return ALERT_CRITICAL;
    } else if (rms >= VIBRATION_RMS_WARNING || peak >= VIBRATION_PEAK_WARNING) {
        return ALERT_WARNING;
    } else {
        return ALERT_NONE;
    }
}

AlertLevel evaluateRailTempAlert(float rail_temp) {
    if (rail_temp >= RAIL_TEMP_CRITICAL_C) {
        return ALERT_CRITICAL;
    } else if (rail_temp >= RAIL_TEMP_WARNING_C) {
        return ALERT_WARNING;
    } else if (rail_temp <= RAIL_TEMP_COLD_WARNING_C) {
        return ALERT_WARNING;
    } else {
        return ALERT_NONE;
    }
}

AlertLevel evaluateContactTempAlert(float temp) {
    if (temp >= AMBIENT_TEMP_CRITICAL_C) {
        return ALERT_CRITICAL;
    } else if (temp >= AMBIENT_TEMP_WARNING_C) {
        return ALERT_WARNING;
    } else {
        return ALERT_NONE;
    }
}

AlertLevel evaluateOverallAlert(SystemData& data) {
    AlertLevel highest = ALERT_NONE;
    
    if (data.vibration_alert > highest) highest = data.vibration_alert;
    if (data.rail_temp_alert  > highest) highest = data.rail_temp_alert;
    if (data.contact_temp_alert > highest) highest = data.contact_temp_alert;
    
    return highest;
}

// Returns human-readable alert string
const char* alertLevelToString(AlertLevel level) {
    switch (level) {
        case ALERT_NONE:     return "NORMAL";
        case ALERT_INFO:     return "INFO";
        case ALERT_WARNING:  return "WARNING";
        case ALERT_CRITICAL: return "CRITICAL";
        default:             return "UNKNOWN";
    }
}

// Returns alert string for CSV logging
const char* alertLevelToCode(AlertLevel level) {
    switch (level) {
        case ALERT_NONE:     return "0";
        case ALERT_INFO:     return "1";
        case ALERT_WARNING:  return "2";
        case ALERT_CRITICAL: return "3";
        default:             return "0";
    }
}

#endif // ALERT_SYSTEM_H