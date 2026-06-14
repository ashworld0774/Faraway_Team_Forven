const API_BASE_URL = "http://localhost:5000/api";

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let errorMessage = "Request failed";
    try {
      const errorData = await response.json();
      errorMessage = errorData?.message || errorMessage;
    } catch {
      errorMessage = response.statusText || errorMessage;
    }

    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export const fetchPredictionRunIds = () => apiRequest("/predictions/run-ids");

export const fetchPredictionSummary = (runId) =>
  apiRequest(`/predictions/summary/${encodeURIComponent(runId)}`);

export const fetchPredictionsByRun = (runId) =>
  apiRequest(`/predictions/run/${encodeURIComponent(runId)}`);

export const fetchAlertsByRun = (runId) =>
  apiRequest(`/alerts/run/${encodeURIComponent(runId)}`);

export const updateAlertStatus = (alertId, status) =>
  apiRequest(`/alerts/${encodeURIComponent(alertId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const fetchSegmentById = (segmentId) =>
  apiRequest(`/segments/${encodeURIComponent(segmentId)}`);

export const fetchSensorSnapshot = (runId) =>
  apiRequest(`/sensors/live/${encodeURIComponent(runId)}`);

export const fetchRiskTrend = (runId) =>
  apiRequest(`/analytics/risk-trend/${encodeURIComponent(runId)}`);

export const fetchAlertDistribution = (runId) =>
  apiRequest(`/analytics/alert-distribution/${encodeURIComponent(runId)}`);

export const fetchClassDistribution = (runId) =>
  apiRequest(`/analytics/class-distribution/${encodeURIComponent(runId)}`);

export const triggerPredictionForRun = (runId) =>
  apiRequest(`/ml/predict/${encodeURIComponent(runId)}`, {
    method: "POST",
  });