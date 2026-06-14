import { useEffect, useMemo, useState } from "react";
import {
  fetchPredictionRunIds,
  fetchPredictionSummary,
  fetchPredictionsByRun,
  fetchAlertsByRun,
  updateAlertStatus,
  fetchSegmentById,
  fetchSensorSnapshot,
  fetchRiskTrend,
  fetchAlertDistribution,
  fetchClassDistribution,
  triggerPredictionForRun,
} from "../api";

function Dashboard() {
  const [runId, setRunId] = useState("");
  const [runIds, setRunIds] = useState([]);
  const [summary, setSummary] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [sensorSnapshot, setSensorSnapshot] = useState([]);
  const [riskTrend, setRiskTrend] = useState([]);
  const [alertDistribution, setAlertDistribution] = useState([]);
  const [classDistribution, setClassDistribution] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [segmentDetails, setSegmentDetails] = useState(null);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentError, setSegmentError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const normalizeAlert = (item) => ({
  ...item,
  alertId: item.alertId || item._id || item.id,
  predictionId:
    typeof item.predictionId === "object"
      ? item.predictionId?._id || item.predictionId?.id
      : item.predictionId,
  predictedClass:
    item.predictedClass || item.predictionId?.predictedClass || "N/A",
  confidence:
    item.confidence ?? item.predictionId?.confidence ?? "N/A",
  riskScore:
    item.riskScore ?? item.predictionId?.riskScore ?? "N/A",
  recommendedAction:
    item.recommendedAction || item.predictionId?.recommendedAction || "N/A",
  severity:
    item.severity || item.predictedClass || item.predictionId?.predictedClass || "N/A",
});

const normalizePrediction = (item) => ({
  ...item,
  predictionId: item.predictionId || item._id || item.id,
});

  const loadDashboardData = async (selectedRunId, showLoader = true) => {
  try {
    if (showLoader) setLoading(true);
    setError("");

    const summaryPromise = fetchPredictionSummary(selectedRunId).catch((err) => {
      console.error("Summary API failed:", err);
      return {
        totalPredictions: 0,
        classCounts: { Normal: 0, Inspect: 0, Urgent: 0 },
        averageRiskScore: 0,
        topRiskySegments: [],
      };
    });

    const predictionPromise = fetchPredictionsByRun(selectedRunId).catch((err) => {
      console.error("Predictions API failed:", err);
      return [];
    });

    const alertPromise = fetchAlertsByRun(selectedRunId).catch((err) => {
      console.error("Alerts API failed:", err);
      return [];
    });

    const sensorPromise = fetchSensorSnapshot(selectedRunId).catch((err) => {
      console.error("Sensor API failed:", err);
      return [];
    });

    const riskTrendPromise = fetchRiskTrend(selectedRunId).catch((err) => {
      console.error("Risk trend API failed:", err);
      return [];
    });

    const alertDistributionPromise = fetchAlertDistribution(selectedRunId).catch((err) => {
      console.error("Alert distribution API failed:", err);
      return [];
    });

    const classDistributionPromise = fetchClassDistribution(selectedRunId).catch((err) => {
      console.error("Class distribution API failed:", err);
      return [];
    });

    const [
      summaryData,
      predictionData,
      alertData,
      sensorData,
      riskTrendData,
      alertDistributionData,
      classDistributionData,
    ] = await Promise.all([
      summaryPromise,
      predictionPromise,
      alertPromise,
      sensorPromise,
      riskTrendPromise,
      alertDistributionPromise,
      classDistributionPromise,
    ]);

    setSummary(summaryData || {
      totalPredictions: 0,
      classCounts: { Normal: 0, Inspect: 0, Urgent: 0 },
      averageRiskScore: 0,
      topRiskySegments: [],
    });

    setPredictions(Array.isArray(predictionData) ? predictionData : []);
    setAlerts(Array.isArray(alertData) ? alertData : []);
    setSensorSnapshot(Array.isArray(sensorData) ? sensorData : []);
    setRiskTrend(Array.isArray(riskTrendData) ? riskTrendData : []);
    setAlertDistribution(Array.isArray(alertDistributionData) ? alertDistributionData : []);
    setClassDistribution(Array.isArray(classDistributionData) ? classDistributionData : []);
    setLastUpdated(new Date());
    setError("");
  } catch (err) {
    console.error("Dashboard data load error:", err);
    setError("");
    setSummary({
      totalPredictions: 0,
      classCounts: { Normal: 0, Inspect: 0, Urgent: 0 },
      averageRiskScore: 0,
      topRiskySegments: [],
    });
    setPredictions([]);
    setAlerts([]);
    setSensorSnapshot([]);
    setRiskTrend([]);
    setAlertDistribution([]);
    setClassDistribution([]);
  } finally {
    if (showLoader) setLoading(false);
  }
};

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        setLoading(true);
        setError("");

        const runIdData = await fetchPredictionRunIds();
        const safeRunIds = Array.isArray(runIdData) ? runIdData : [];
        setRunIds(safeRunIds);

        if (safeRunIds.length > 0) {
  const firstRunId = safeRunIds[0];
  setRunId(firstRunId);
  await loadDashboardData(firstRunId);
} else {
  setRunIds([]);
  setRunId("");
  setSummary({
    totalPredictions: 0,
    classCounts: { Normal: 0, Inspect: 0, Urgent: 0 },
    averageRiskScore: 0,
    topRiskySegments: [],
  });
  setPredictions([]);
  setAlerts([]);
  setSensorSnapshot([]);
  setRiskTrend([]);
  setAlertDistribution([]);
  setClassDistribution([]);
  setError("");
  setLoading(false);
}
      } catch (err) {
        console.error("Initialization error:", err);
        setError("Failed to initialize dashboard.");
        setLoading(false);
      }
    };

    initializeDashboard();
  }, []);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closeDetailsModal();
      }
    };

    if (isModalOpen) {
      window.addEventListener("keydown", handleEscape);
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!runId || !autoRefresh) return;

    const interval = setInterval(() => {
      loadDashboardData(runId, false);
    }, 10000);

    return () => clearInterval(interval);
  }, [runId, autoRefresh]);

  const handleRunChange = async (e) => {
    const selectedRunId = e.target.value;
    setRunId(selectedRunId);
    await loadDashboardData(selectedRunId);
  };

  const handleTriggerPrediction = async () => {
    if (!runId) return;

    try {
      setPredictionLoading(true);
      await triggerPredictionForRun(runId);
      await loadDashboardData(runId, false);
    } catch (err) {
      console.error("Prediction trigger failed:", err);
      alert("Failed to trigger ML prediction.");
    } finally {
      setPredictionLoading(false);
    }
  };

  // const handleAlertAction = async (alertId, newStatus) => {
  //   try {
  //     setActionLoading(alertId);

  //     const updatedAlert = await updateAlertStatus(alertId, newStatus);

  //     setAlerts((prevAlerts) =>
  //       prevAlerts.map((alert) =>
  //         alert.alertId === alertId ? updatedAlert : alert
  //       )
  //     );

  //     if (selectedItem?.alertId === alertId) {
  //       setSelectedItem((prev) => ({
  //         ...prev,
  //         ...updatedAlert,
  //         source: prev?.source || "alert",
  //       }));
  //     }
  //   } catch (err) {
  //     console.error("Failed to update alert status:", err);
  //     alert("Failed to update alert status");
  //   } finally {
  //     setActionLoading("");
  //   }
  // };

const handleAlertAction = async (alertId, newStatus) => {
  try {
    setActionLoading(alertId);

    const response = await updateAlertStatus(alertId, newStatus);
    const updatedAlert = response?.alert || response?.data?.alert || response?.data || response;

    if (!updatedAlert) {
      throw new Error("No updated alert returned from backend");
    }

    const normalizedUpdatedAlert = {
      ...updatedAlert,
      alertId: updatedAlert.alertId || updatedAlert._id || updatedAlert.id,
      predictionId:
        typeof updatedAlert.predictionId === "object"
          ? updatedAlert.predictionId?._id || updatedAlert.predictionId?.id
          : updatedAlert.predictionId,
      recommendedAction:
        updatedAlert.recommendedAction ||
        updatedAlert.predictionId?.recommendedAction ||
        "N/A",
      severity:
        updatedAlert.severity ||
        updatedAlert.predictedClass ||
        updatedAlert.predictionId?.predictedClass ||
        "N/A",
      confidence:
        updatedAlert.confidence ??
        updatedAlert.predictionId?.confidence ??
        "N/A",
      riskScore:
        updatedAlert.riskScore ??
        updatedAlert.predictionId?.riskScore ??
        "N/A",
    };

    setAlerts((prevAlerts) =>
      prevAlerts.map((alert) => {
        const currentId = alert.alertId || alert._id || alert.id;
        return currentId === alertId ? normalizedUpdatedAlert : alert;
      })
    );

    if ((selectedItem?.alertId || selectedItem?._id || selectedItem?.id) === alertId) {
      setSelectedItem((prev) => ({
        ...prev,
        ...normalizedUpdatedAlert,
        source: prev?.source || "alert",
      }));
    }
  } catch (err) {
    console.error("Failed to update alert status", err);
    alert(
      err?.response?.data?.message ||
      err?.message ||
      "Failed to update alert status"
    );
  } finally {
    setActionLoading("");
  }
};
  const openDetailsModal = async (item, source = "record") => {
    setSelectedItem({ ...item, source });
    setSegmentDetails(null);
    setSegmentError("");
    setSegmentLoading(true);
    setIsModalOpen(true);

    try {
      const details = await fetchSegmentById(item.segmentId);
      setSegmentDetails(details);
    } catch (error) {
      console.error("Failed to fetch segment details:", error);
      if (error?.status === 404) {
        setSegmentError(
          "Prediction record found, but corresponding TrackSegment document is missing for this segment."
        );
      } else {
        setSegmentError("Failed to load segment details.");
      }
    } finally {
      setSegmentLoading(false);
    }
  };

  const closeDetailsModal = () => {
    setSelectedItem(null);
    setIsModalOpen(false);
    setSegmentDetails(null);
    setSegmentError("");
    setSegmentLoading(false);
  };
  

  const getRiskTone = (score = 0) => {
    if (score >= 75) {
      return {
        bg: "rgba(220, 38, 38, 0.16)",
        border: "rgba(248, 113, 113, 0.35)",
        color: "#fecaca",
      };
    }
    if (score >= 50) {
      return {
        bg: "rgba(245, 158, 11, 0.16)",
        border: "rgba(251, 191, 36, 0.35)",
        color: "#fde68a",
      };
    }
    return {
      bg: "rgba(16, 185, 129, 0.16)",
      border: "rgba(52, 211, 153, 0.35)",
      color: "#bbf7d0",
    };
  };

  const getClassTone = (value) => {
    if (value === "Urgent") {
      return {
        bg: "rgba(220, 38, 38, 0.16)",
        border: "rgba(248, 113, 113, 0.35)",
        color: "#fecaca",
      };
    }
    if (value === "Inspect") {
      return {
        bg: "rgba(245, 158, 11, 0.16)",
        border: "rgba(251, 191, 36, 0.35)",
        color: "#fde68a",
      };
    }
    return {
      bg: "rgba(16, 185, 129, 0.16)",
      border: "rgba(52, 211, 153, 0.35)",
      color: "#bbf7d0",
    };
  };

  const getStatusTone = (status) => {
    if (status === "Closed") {
      return {
        bg: "rgba(37, 99, 235, 0.16)",
        border: "rgba(96, 165, 250, 0.35)",
        color: "#bfdbfe",
      };
    }
    if (status === "In Review") {
      return {
        bg: "rgba(245, 158, 11, 0.16)",
        border: "rgba(251, 191, 36, 0.35)",
        color: "#fde68a",
      };
    }
    return {
      bg: "rgba(148, 163, 184, 0.16)",
      border: "rgba(148, 163, 184, 0.35)",
      color: "#e2e8f0",
    };
  };

  const kpiCards = useMemo(() => {
    if (!summary) return [];

    return [
      {
        label: "Total Predictions",
        value: summary.totalPredictions ?? 0,
        accent: "#5eead4",
      },
      {
        label: "Normal",
        value: summary.classCounts?.Normal ?? 0,
        accent: "#34d399",
      },
      {
        label: "Inspect",
        value: summary.classCounts?.Inspect ?? 0,
        accent: "#fbbf24",
      },
      {
        label: "Urgent",
        value: summary.classCounts?.Urgent ?? 0,
        accent: "#f87171",
      },
      {
        label: "Avg Risk Score",
        value: summary.averageRiskScore ?? 0,
        accent: "#38bdf8",
      },
    ];
  }, [summary]);

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingCard}>
          <div style={styles.loadingPulse} />
          <h2 style={styles.loadingTitle}>Loading RailMitra Dashboard...</h2>
          <p style={styles.loadingText}>
            Fetching prediction runs, alerts, sensors, and analytics.
          </p>
        </div>
      </div>
    );
  }

if (error) {
  console.error("Dashboard warning:", error);
}``

  return (
    <div style={styles.page}>
      <div style={styles.backgroundGlowTop} />
      <div style={styles.backgroundGlowBottom} />

      <header style={styles.heroSection}>
        {error && (
  <div style={{
    marginBottom: "16px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "rgba(245, 158, 11, 0.12)",
    border: "1px solid rgba(251, 191, 36, 0.22)",
    color: "#fde68a"
  }}>
    Some backend endpoints are not available yet. Showing partial dashboard data.
  </div>
)}
        <div style={styles.heroLeft}>
          <div style={styles.brandRow}>
            <div style={styles.logoBox}>RM</div>
            <div>
              <p style={styles.eyebrow}>Railway Predictive Intelligence</p>
              <h1 style={styles.title}>RailMitra Dashboard</h1>
            </div>
          </div>



          <p style={styles.subtitle}>
            AI-assisted railway risk monitoring, sensor visibility, maintenance
            intelligence, and real-time ML support panel.
          </p>

          <div style={styles.quickStatsRow}>
            <div style={styles.quickStat}>
              <span style={styles.quickStatLabel}>Runs Loaded</span>
              <span style={styles.quickStatValue}>{runIds.length}</span>
            </div>
            <div style={styles.quickStat}>
              <span style={styles.quickStatLabel}>Alerts</span>
              <span style={styles.quickStatValue}>{alerts.length}</span>
            </div>
            <div style={styles.quickStat}>
              <span style={styles.quickStatLabel}>Predictions</span>
              <span style={styles.quickStatValue}>{predictions.length}</span>
            </div>
          </div>
        </div>

        <div style={styles.runSelectorCard}>
          <div style={styles.cardTopRow}>
            <h3 style={styles.selectorTitle}>Run Controls</h3>
            <span style={styles.liveBadge}>
              {autoRefresh ? "Auto Refresh ON" : "Auto Refresh OFF"}
            </span>
          </div>

          <label style={styles.selectorLabel}>Select Run ID</label>
          <select value={runId} onChange={handleRunChange} style={styles.select}>
            {runIds.length > 0 ? (
              runIds.map((id, index) => (
                <option key={id || index} value={id}>
                  {id}
                </option>
              ))
            ) : (
              <option value="">No Runs Available</option>
            )}
          </select>

          <div style={styles.controlButtonGroup}>
            <button
              style={styles.primaryButton}
              onClick={handleTriggerPrediction}
              disabled={predictionLoading}
            >
              {predictionLoading ? "Running ML..." : "Run ML Prediction"}
            </button>

            <button
              style={styles.secondaryButton}
              onClick={() => setAutoRefresh((prev) => !prev)}
            >
              {autoRefresh ? "Pause Refresh" : "Resume Refresh"}
            </button>
          </div>

          <div style={styles.selectorMeta}>
            <div style={styles.selectorMetaItem}>
              <span style={styles.selectorMetaLabel}>Current Run</span>
              <span style={styles.selectorMetaValue}>{runId || "N/A"}</span>
            </div>
            <div style={styles.selectorMetaItem}>
              <span style={styles.selectorMetaLabel}>Last Updated</span>
              <span style={styles.selectorMetaValue}>
                {lastUpdated ? lastUpdated.toLocaleTimeString() : "N/A"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section style={styles.kpiGrid}>
        {kpiCards.map((card) => (
          <div key={card.label} style={styles.kpiCard}>
            <div
              style={{
                ...styles.kpiAccent,
                background: `linear-gradient(135deg, ${card.accent}, transparent)`,
              }}
            />
            <p style={styles.kpiLabel}>{card.label}</p>
            <h2 style={styles.kpiValue}>{card.value}</h2>
          </div>
        ))}
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Live Sensor Snapshot</h2>
            <p style={styles.sectionSubtitle}>
              Recent live-style sensor values for selected run.
            </p>
          </div>
        </div>

        {sensorSnapshot.length > 0 ? (
          <div style={styles.sensorGrid}>
            {sensorSnapshot.slice(0, 6).map((sensor, index) => (
              <div key={sensor.segmentId || index} style={styles.sensorCard}>
                <div style={styles.sensorCardTop}>
                  <h3 style={styles.sensorCardTitle}>
                    {sensor.segmentId || `Segment ${index + 1}`}
                  </h3>
                  <span style={styles.sensorLiveDot}>LIVE</span>
                </div>
                <div style={styles.sensorMetric}>
                  <span style={styles.sensorLabel}>Vibration</span>
                  <span style={styles.sensorValue}>
                    {sensor.vibration ?? "N/A"}
                  </span>
                </div>
                <div style={styles.sensorMetric}>
                  <span style={styles.sensorLabel}>Temperature</span>
                  <span style={styles.sensorValue}>
                    {sensor.temperature ?? "N/A"}°C
                  </span>
                </div>
                <div style={styles.sensorMetric}>
                  <span style={styles.sensorLabel}>Acceleration</span>
                  <span style={styles.sensorValue}>
                    {sensor.acceleration ?? "N/A"}
                  </span>
                </div>
                <div style={styles.sensorMetric}>
                  <span style={styles.sensorLabel}>Noise</span>
                  <span style={styles.sensorValue}>
                    {sensor.noiseLevel ?? "N/A"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={styles.emptyText}>No live sensor data available.</p>
        )}
      </section>

      <section style={styles.chartGrid}>
        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Risk Trend</h3>
          <div style={styles.simpleChartWrap}>
            {riskTrend.length > 0 ? (
              <div style={styles.barChart}>
                {riskTrend.map((item, index) => (
                  <div key={index} style={styles.barItem}>
                    <div
                      style={{
                        ...styles.barFill,
                        height: `${Math.min(item.riskScore || 0, 100)}%`,
                        background:
                          "linear-gradient(180deg, #38bdf8 0%, #14b8a6 100%)",
                      }}
                    />
                    <span style={styles.barLabel}>
                      {item.label || item.time || `T${index + 1}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={styles.emptyText}>No risk trend data available.</p>
            )}
          </div>
        </div>

        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Alert Distribution</h3>
          {alertDistribution.length > 0 ? (
            <div style={styles.distributionList}>
              {alertDistribution.map((item, index) => (
                <div key={index} style={styles.distributionRow}>
                  <span style={styles.distributionLabel}>
                    {item.label || item.status || "Unknown"}
                  </span>
                  <div style={styles.distributionBarTrack}>
                    <div
                      style={{
                        ...styles.distributionBarFill,
                        width: `${Math.min(item.value || 0, 100)}%`,
                        background:
                          "linear-gradient(90deg, #f59e0b 0%, #f97316 100%)",
                      }}
                    />
                  </div>
                  <span style={styles.distributionValue}>{item.value ?? 0}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.emptyText}>No alert distribution data available.</p>
          )}
        </div>

        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Class Counts</h3>
          {classDistribution.length > 0 ? (
            <div style={styles.distributionList}>
              {classDistribution.map((item, index) => (
                <div key={index} style={styles.distributionRow}>
                  <span style={styles.distributionLabel}>
                    {item.label || item.className || "Unknown"}
                  </span>
                  <div style={styles.distributionBarTrack}>
                    <div
                      style={{
                        ...styles.distributionBarFill,
                        width: `${Math.min(item.value || 0, 100)}%`,
                        background:
                          "linear-gradient(90deg, #22c55e 0%, #14b8a6 100%)",
                      }}
                    />
                  </div>
                  <span style={styles.distributionValue}>{item.value ?? 0}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.emptyText}>No class distribution data available.</p>
          )}
        </div>
      </section>

      <section style={styles.tabsWrap}>
        <button
          style={activeTab === "overview" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          style={activeTab === "alerts" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("alerts")}
        >
          Alerts
        </button>
        <button
          style={activeTab === "predictions" ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab("predictions")}
        >
          Predictions
        </button>
      </section>

      {activeTab === "overview" && (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Top Risky Segments</h2>
              <p style={styles.sectionSubtitle}>
                Highest-priority segments flagged by current prediction output.
              </p>
            </div>
          </div>

          {summary?.topRiskySegments?.length > 0 ? (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Segment ID</th>
                    <th style={styles.th}>Predicted Class</th>
                    <th style={styles.th}>Risk Score</th>
                    <th style={styles.th}>Confidence</th>
                    <th style={styles.th}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topRiskySegments.map((item) => (
                    <tr key={item.predictionId} style={styles.tr}>
                      <td style={styles.td}>{item.segmentId}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...getClassTone(item.predictedClass),
                          }}
                        >
                          {item.predictedClass}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...getRiskTone(item.riskScore),
                          }}
                        >
                          {item.riskScore}
                        </span>
                      </td>
                      <td style={styles.td}>{item.confidence}</td>
                      <td style={styles.td}>
                        <button
                          style={styles.ghostButton}
                          onClick={() =>
                            openDetailsModal(item, "top-risky-segment")
                          }
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={styles.emptyText}>No risky segments found for this run.</p>
          )}
        </section>
      )}

      {activeTab === "alerts" && (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Alerts</h2>
              <p style={styles.sectionSubtitle}>
                Review and resolve maintenance alerts for the selected run.
              </p>
            </div>
          </div>

          {alerts.length > 0 ? (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Alert ID</th>
                    <th style={styles.th}>Segment ID</th>
                    <th style={styles.th}>Severity</th>
                    <th style={styles.th}>Recommended Action</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Action</th>
                    <th style={styles.th}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alertItem) => (
                    <tr key={alertItem.alertId} style={styles.tr}>
                      <td style={styles.td}>{alertItem.alertId}</td>
                      <td style={styles.td}>{alertItem.segmentId}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...getClassTone(alertItem.severity),
                          }}
                        >
                          {alertItem.severity}
                        </span>
                      </td>
                      <td style={styles.td}>{alertItem.recommendedAction}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...getStatusTone(alertItem.status),
                          }}
                        >
                          {alertItem.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {alertItem.status !== "Closed" ? (
                          <div style={styles.actionGroup}>
                            <button
                              style={{
                                ...styles.reviewButton,
                                opacity:
                                  actionLoading === alertItem.alertId ? 0.7 : 1,
                                cursor:
                                  actionLoading === alertItem.alertId
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                              onClick={() =>
                                handleAlertAction(
                                  alertItem.alertId,
                                  "In Review"
                                )
                              }
                              disabled={actionLoading === alertItem.alertId}
                            >
                              {actionLoading === alertItem.alertId
                                ? "Updating..."
                                : "Review"}
                            </button>

                            <button
                              style={{
                                ...styles.closeButton,
                                opacity:
                                  actionLoading === alertItem.alertId ? 0.7 : 1,
                                cursor:
                                  actionLoading === alertItem.alertId
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                              onClick={() =>
                                handleAlertAction(alertItem.alertId, "Closed")
                              }
                              disabled={actionLoading === alertItem.alertId}
                            >
                              {actionLoading === alertItem.alertId
                                ? "Updating..."
                                : "Close"}
                            </button>
                          </div>
                        ) : (
                          <span style={styles.resolvedText}>Resolved</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <button
                          style={styles.ghostButton}
                          onClick={() => openDetailsModal(alertItem, "alert")}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={styles.emptyText}>No alerts found for this run.</p>
          )}
        </section>
      )}

      {activeTab === "predictions" && (
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div>
              <h2 style={styles.sectionTitle}>All Predictions</h2>
              <p style={styles.sectionSubtitle}>
                Full prediction list for the selected run ID.
              </p>
            </div>
          </div>

          {predictions.length > 0 ? (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Prediction ID</th>
                    <th style={styles.th}>Segment ID</th>
                    <th style={styles.th}>Class</th>
                    <th style={styles.th}>Risk Score</th>
                    <th style={styles.th}>Confidence</th>
                    <th style={styles.th}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((prediction) => (
                    <tr key={prediction.predictionId || prediction._id || prediction.id} style={styles.tr}>
                      <td style={styles.td}>{prediction.predictionId || prediction._id || prediction.id || "N/A"}</td>
                      <td style={styles.td}>{prediction.segmentId}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...getClassTone(prediction.predictedClass),
                          }}
                        >
                          {prediction.predictedClass}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...getRiskTone(prediction.riskScore),
                          }}
                        >
                          {prediction.riskScore}
                        </span>
                      </td>
                      <td style={styles.td}>{prediction.confidence}</td>
                      <td style={styles.td}>
                        <button
                          style={styles.ghostButton}
                          onClick={() =>
                            openDetailsModal(prediction, "prediction")
                          }
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={styles.emptyText}>No predictions found for this run.</p>
          )}
        </section>
      )}

      {isModalOpen && selectedItem && (
        <div style={styles.modalOverlay} onClick={closeDetailsModal}>
          <div
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="segment-details-title"
          >
            <div style={styles.modalHeader}>
              <div>
                <h2 id="segment-details-title" style={styles.modalTitle}>
                  Segment Details
                </h2>
                <p style={styles.modalSubtitle}>
                  Source: {selectedItem.source || "N/A"}
                </p>
              </div>

              <button style={styles.modalCloseBtn} onClick={closeDetailsModal}>
                ×
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.modalGrid}>
                <div style={styles.modalField}>
                  <span style={styles.modalLabel}>Segment ID</span>
                  <span style={styles.modalValue}>
                    {selectedItem.segmentId || "N/A"}
                  </span>
                </div>

                <div style={styles.modalField}>
                  <span style={styles.modalLabel}>Run ID</span>
                  <span style={styles.modalValue}>
                    {selectedItem.runId || runId || "N/A"}
                  </span>
                </div>

                <div style={styles.modalField}>
                  <span style={styles.modalLabel}>Prediction ID</span>
                  <span style={styles.modalValue}>
                    {selectedItem.predictionId || "N/A"}
                  </span>
                </div>

                <div style={styles.modalField}>
                  <span style={styles.modalLabel}>Alert ID</span>
                  <span style={styles.modalValue}>
                    {selectedItem.alertId || "N/A"}
                  </span>
                </div>

                <div style={styles.modalField}>
                  <span style={styles.modalLabel}>
                    Predicted Class / Severity
                  </span>
                  <span style={styles.modalValue}>
                    <span
                      style={{
                        ...styles.badge,
                        ...getClassTone(
                          selectedItem.predictedClass ||
                            selectedItem.severity ||
                            "Normal"
                        ),
                      }}
                    >
                      {selectedItem.predictedClass ||
                        selectedItem.severity ||
                        "N/A"}
                    </span>
                  </span>
                </div>

                <div style={styles.modalField}>
                  <span style={styles.modalLabel}>Risk Score</span>
                  <span style={styles.modalValue}>
                    {selectedItem.riskScore !== undefined ? (
                      <span
                        style={{
                          ...styles.badge,
                          ...getRiskTone(selectedItem.riskScore),
                        }}
                      >
                        {selectedItem.riskScore}
                      </span>
                    ) : (
                      "N/A"
                    )}
                  </span>
                </div>

                <div style={styles.modalField}>
                  <span style={styles.modalLabel}>Confidence</span>
                  <span style={styles.modalValue}>
                    {selectedItem.confidence ?? "N/A"}
                  </span>
                </div>

                <div style={styles.modalField}>
                  <span style={styles.modalLabel}>Status</span>
                  <span style={styles.modalValue}>
                    {selectedItem.status ? (
                      <span
                        style={{
                          ...styles.badge,
                          ...getStatusTone(selectedItem.status),
                        }}
                      >
                        {selectedItem.status}
                      </span>
                    ) : (
                      "N/A"
                    )}
                  </span>
                </div>

                <div style={styles.modalFieldFull}>
                  <span style={styles.modalLabel}>Recommended Action</span>
                  <span style={styles.modalValue}>
                    {selectedItem.recommendedAction || "N/A"}
                  </span>
                </div>

                <div style={styles.modalFieldFull}>
                  <span style={styles.modalLabel}>Track Segment Details</span>

                  {segmentLoading ? (
                    <div style={styles.noteBox}>
                      <p style={styles.explanationText}>
                        Loading segment details...
                      </p>
                    </div>
                  ) : segmentError ? (
                    <div style={styles.noteBox}>
                      <p
                        style={{
                          ...styles.explanationText,
                          color: "#fca5a5",
                        }}
                      >
                        {segmentError}
                      </p>
                    </div>
                  ) : segmentDetails ? (
                    <div style={styles.modalGrid}>
                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Run ID</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.runId || "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Region ID</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.regionId || "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Source Train ID</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.sourceTrainId || "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Segment Index</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.segmentIndex ?? "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Window Length</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.windowLengthMeters != null
                            ? `${segmentDetails.windowLengthMeters} m`
                            : "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Pass Date</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.passDate
                            ? new Date(segmentDetails.passDate).toLocaleString()
                            : "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Average Speed</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.speedAvg ?? "N/A"}
                          {segmentDetails.speedAvg != null ? " km/h" : ""}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Ambient Temperature</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.tempAmbient ?? "N/A"}
                          {segmentDetails.tempAmbient != null ? " °C" : ""}
                        </span>
                      </div>

                      <div style={styles.modalFieldFull}>
                        <span style={styles.modalLabel}>Start Coordinates</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.startLat != null &&
                          segmentDetails.startLng != null
                            ? `${segmentDetails.startLat}, ${segmentDetails.startLng}`
                            : "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalFieldFull}>
                        <span style={styles.modalLabel}>End Coordinates</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.endLat != null &&
                          segmentDetails.endLng != null
                            ? `${segmentDetails.endLat}, ${segmentDetails.endLng}`
                            : "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>True Label</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.trueLabel || "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Label Source</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.labelSource || "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>RMS</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.features?.rms ?? "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Variance</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.features?.variance ?? "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Peak</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.features?.peak ?? "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Energy</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.features?.energy ?? "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Crest Factor</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.features?.crestFactor ?? "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>Kurtosis</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.features?.kurtosis ?? "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>FFT Band Low</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.features?.fftBandLow ?? "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>FFT Band Mid</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.features?.fftBandMid ?? "N/A"}
                        </span>
                      </div>

                      <div style={styles.modalField}>
                        <span style={styles.modalLabel}>FFT Band High</span>
                        <span style={styles.modalValue}>
                          {segmentDetails.features?.fftBandHigh ?? "N/A"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={styles.noteBox}>
                      <p style={styles.explanationText}>
                        No segment details found.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button style={styles.modalSecondaryBtn} onClick={closeDetailsModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(20,184,166,0.12), transparent 28%), radial-gradient(circle at bottom right, rgba(59,130,246,0.10), transparent 24%), linear-gradient(180deg, #071018 0%, #0b1724 45%, #0a1420 100%)",
    color: "#e6eef8",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: "24px",
    position: "relative",
    overflow: "hidden",
  },
  backgroundGlowTop: {
    position: "absolute",
    top: "-120px",
    right: "-80px",
    width: "320px",
    height: "320px",
    borderRadius: "999px",
    background: "rgba(45, 212, 191, 0.08)",
    filter: "blur(60px)",
    pointerEvents: "none",
  },
  backgroundGlowBottom: {
    position: "absolute",
    bottom: "-140px",
    left: "-80px",
    width: "360px",
    height: "360px",
    borderRadius: "999px",
    background: "rgba(56, 189, 248, 0.08)",
    filter: "blur(60px)",
    pointerEvents: "none",
  },
  heroSection: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
    gap: "20px",
    marginBottom: "24px",
  },
  heroLeft: {
    background: "linear-gradient(180deg, rgba(15,23,42,0.82), rgba(15,23,42,0.66))",
    border: "1px solid rgba(148, 163, 184, 0.14)",
    borderRadius: "24px",
    padding: "28px",
    boxShadow: "0 10px 35px rgba(0,0,0,0.22)",
    backdropFilter: "blur(12px)",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "14px",
    flexWrap: "wrap",
  },
  logoBox: {
    width: "58px",
    height: "58px",
    borderRadius: "16px",
    background:
      "linear-gradient(135deg, rgba(20,184,166,0.95), rgba(14,116,144,0.9))",
    color: "#ecfeff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "18px",
    letterSpacing: "0.08em",
    boxShadow: "0 10px 24px rgba(20,184,166,0.25)",
  },
  eyebrow: {
    margin: 0,
    fontSize: "12px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#67e8f9",
  },
  title: {
    margin: "6px 0 0 0",
    fontSize: "34px",
    lineHeight: 1.1,
    color: "#f8fbff",
  },
  subtitle: {
    margin: 0,
    maxWidth: "760px",
    color: "#9fb2c8",
    fontSize: "15px",
    lineHeight: 1.7,
  },
  quickStatsRow: {
    marginTop: "22px",
    display: "flex",
    gap: "14px",
    flexWrap: "wrap",
  },
  quickStat: {
    minWidth: "140px",
    background: "rgba(15, 23, 42, 0.48)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "16px",
    padding: "14px 16px",
  },
  quickStatLabel: {
    display: "block",
    fontSize: "12px",
    color: "#8ea5bb",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  quickStatValue: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#f8fbff",
  },
  runSelectorCard: {
    position: "relative",
    zIndex: 1,
    background: "linear-gradient(180deg, rgba(10,20,32,0.92), rgba(9,16,28,0.82))",
    border: "1px solid rgba(148, 163, 184, 0.14)",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 10px 35px rgba(0,0,0,0.22)",
    backdropFilter: "blur(12px)",
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "18px",
  },
  selectorTitle: {
    margin: 0,
    fontSize: "18px",
    color: "#f8fbff",
  },
  liveBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    color: "#99f6e4",
    background: "rgba(20,184,166,0.14)",
    border: "1px solid rgba(45,212,191,0.26)",
    borderRadius: "999px",
    padding: "7px 12px",
  },
  selectorLabel: {
    display: "block",
    fontSize: "13px",
    color: "#9fb2c8",
    marginBottom: "10px",
  },
  select: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid rgba(100, 116, 139, 0.5)",
    background: "rgba(15, 23, 42, 0.85)",
    color: "#e6eef8",
    outline: "none",
    fontSize: "14px",
  },
  controlButtonGroup: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginTop: "14px",
  },
  primaryButton: {
    padding: "11px 14px",
    border: "none",
    borderRadius: "12px",
    background: "linear-gradient(135deg, #14b8a6, #0f766e)",
    color: "#ecfeff",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "11px 14px",
    borderRadius: "12px",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background: "rgba(15, 23, 42, 0.72)",
    color: "#dbeafe",
    fontWeight: 700,
    cursor: "pointer",
  },
  selectorMeta: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginTop: "18px",
  },
  selectorMetaItem: {
    background: "rgba(15, 23, 42, 0.52)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "14px",
    padding: "12px",
  },
  selectorMetaLabel: {
    display: "block",
    fontSize: "11px",
    color: "#8ea5bb",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: "8px",
  },
  selectorMetaValue: {
    color: "#f8fbff",
    fontSize: "14px",
    fontWeight: 600,
    wordBreak: "break-word",
  },
  kpiGrid: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  kpiCard: {
    position: "relative",
    overflow: "hidden",
    background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.68))",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
  },
  kpiAccent: {
    position: "absolute",
    top: "-18px",
    right: "-24px",
    width: "110px",
    height: "110px",
    borderRadius: "999px",
    opacity: 0.28,
    filter: "blur(4px)",
  },
  kpiLabel: {
    position: "relative",
    margin: 0,
    fontSize: "13px",
    color: "#90a6bc",
  },
  kpiValue: {
    position: "relative",
    margin: "12px 0 0 0",
    fontSize: "30px",
    color: "#f8fbff",
  },
  panel: {
    position: "relative",
    zIndex: 1,
    background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.68))",
    padding: "22px",
    borderRadius: "24px",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    marginBottom: "24px",
    overflow: "hidden",
    boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    marginBottom: "18px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "24px",
    color: "#f8fbff",
  },
  sectionSubtitle: {
    margin: "8px 0 0 0",
    fontSize: "14px",
    color: "#90a6bc",
  },
  sensorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
  },
  sensorCard: {
    background: "rgba(15, 23, 42, 0.58)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "18px",
    padding: "16px",
  },
  sensorCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "14px",
    gap: "8px",
  },
  sensorCardTitle: {
    margin: 0,
    fontSize: "16px",
    color: "#f8fbff",
  },
  sensorLiveDot: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#99f6e4",
    background: "rgba(20,184,166,0.14)",
    border: "1px solid rgba(45,212,191,0.26)",
    borderRadius: "999px",
    padding: "5px 9px",
  },
  sensorMetric: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "8px 0",
    borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
  },
  sensorLabel: {
    color: "#8ea5bb",
    fontSize: "13px",
  },
  sensorValue: {
    color: "#f8fbff",
    fontWeight: 700,
    fontSize: "14px",
  },
  chartGrid: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  chartCard: {
    background: "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.68))",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "22px",
    padding: "18px",
    boxShadow: "0 10px 24px rgba(0,0,0,0.14)",
  },
  chartTitle: {
    margin: "0 0 14px 0",
    color: "#f8fbff",
    fontSize: "18px",
  },
  simpleChartWrap: {
    minHeight: "220px",
    display: "flex",
    alignItems: "flex-end",
  },
  barChart: {
    width: "100%",
    height: "220px",
    display: "flex",
    alignItems: "flex-end",
    gap: "12px",
  },
  barItem: {
    flex: 1,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: "10px",
  },
  barFill: {
    width: "100%",
    maxWidth: "42px",
    borderRadius: "14px 14px 6px 6px",
    minHeight: "8px",
    boxShadow: "0 8px 18px rgba(20,184,166,0.18)",
  },
  barLabel: {
    fontSize: "11px",
    color: "#8ea5bb",
    textAlign: "center",
  },
  distributionList: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  distributionRow: {
    display: "grid",
    gridTemplateColumns: "90px 1fr 50px",
    gap: "12px",
    alignItems: "center",
  },
  distributionLabel: {
    color: "#cbd5e1",
    fontSize: "13px",
  },
  distributionBarTrack: {
    height: "12px",
    borderRadius: "999px",
    background: "rgba(148, 163, 184, 0.14)",
    overflow: "hidden",
  },
  distributionBarFill: {
    height: "100%",
    borderRadius: "999px",
  },
  distributionValue: {
    textAlign: "right",
    color: "#f8fbff",
    fontWeight: 700,
    fontSize: "13px",
  },
  tabsWrap: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },
  tab: {
    padding: "10px 16px",
    borderRadius: "999px",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background: "rgba(15, 23, 42, 0.55)",
    color: "#9fb2c8",
    cursor: "pointer",
    fontWeight: 600,
  },
  tabActive: {
    padding: "10px 16px",
    borderRadius: "999px",
    border: "1px solid rgba(45, 212, 191, 0.32)",
    background: "linear-gradient(135deg, rgba(20,184,166,0.22), rgba(14,116,144,0.18))",
    color: "#ecfeff",
    cursor: "pointer",
    fontWeight: 700,
    boxShadow: "0 8px 18px rgba(20,184,166,0.18)",
  },
  tableWrap: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "860px",
  },
  th: {
    textAlign: "left",
    padding: "14px 12px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
    color: "#8ea5bb",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    whiteSpace: "nowrap",
  },
  tr: {
    transition: "background 0.2s ease",
  },
  td: {
    borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
    padding: "14px 12px",
    textAlign: "left",
    verticalAlign: "top",
    color: "#d8e3ef",
    fontSize: "14px",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  },
  ghostButton: {
    padding: "9px 14px",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    borderRadius: "12px",
    background: "rgba(15, 23, 42, 0.62)",
    color: "#dbeafe",
    fontWeight: 600,
    cursor: "pointer",
  },
  reviewButton: {
    padding: "8px 12px",
    border: "none",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #f59e0b, #d97706)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  closeButton: {
    padding: "8px 12px",
    border: "none",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionGroup: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  resolvedText: {
    color: "#94a3b8",
    fontWeight: 600,
  },
  emptyText: {
    color: "#94a3b8",
    margin: 0,
  },
  loadingScreen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "radial-gradient(circle at top, rgba(20,184,166,0.10), transparent 25%), linear-gradient(180deg, #071018 0%, #0b1724 100%)",
    padding: "24px",
  },
  loadingCard: {
    width: "100%",
    maxWidth: "520px",
    background: "rgba(15, 23, 42, 0.86)",
    border: "1px solid rgba(148,163,184,0.16)",
    borderRadius: "24px",
    padding: "32px",
    textAlign: "center",
    boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
  },
  loadingPulse: {
    width: "68px",
    height: "68px",
    margin: "0 auto 18px",
    borderRadius: "999px",
    background:
      "radial-gradient(circle, rgba(45,212,191,0.9) 0%, rgba(45,212,191,0.18) 42%, transparent 70%)",
  },
  loadingTitle: {
    margin: 0,
    color: "#f8fbff",
    fontSize: "24px",
  },
  loadingText: {
    margin: "10px 0 0 0",
    color: "#9fb2c8",
    lineHeight: 1.7,
  },
  errorCard: {
    width: "100%",
    maxWidth: "560px",
    background: "rgba(15, 23, 42, 0.86)",
    border: "1px solid rgba(248,113,113,0.22)",
    borderRadius: "24px",
    padding: "32px",
    textAlign: "center",
    boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
  },
  errorTitle: {
    margin: 0,
    color: "#fecaca",
    fontSize: "24px",
  },
  errorText: {
    margin: "12px 0 0 0",
    color: "#fca5a5",
    lineHeight: 1.7,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(2, 8, 23, 0.76)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
    zIndex: 999,
    backdropFilter: "blur(6px)",
  },
  modalContent: {
    width: "100%",
    maxWidth: "860px",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "linear-gradient(180deg, #0f172a 0%, #111b2d 100%)",
    borderRadius: "24px",
    border: "1px solid rgba(148, 163, 184, 0.16)",
    boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    padding: "24px 24px 0 24px",
  },
  modalTitle: {
    margin: 0,
    fontSize: "26px",
    color: "#f8fafc",
  },
  modalSubtitle: {
    marginTop: "8px",
    marginBottom: 0,
    color: "#94a3b8",
    fontSize: "14px",
  },
  modalCloseBtn: {
    backgroundColor: "rgba(30, 41, 59, 0.86)",
    color: "#e2e8f0",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    fontSize: "24px",
    cursor: "pointer",
  },
  modalBody: {
    padding: "24px",
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
  },
  modalField: {
    background: "rgba(15, 23, 42, 0.72)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "16px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  modalFieldFull: {
    gridColumn: "1 / -1",
    background: "rgba(15, 23, 42, 0.72)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "16px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  modalLabel: {
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  modalValue: {
    color: "#f8fafc",
    fontSize: "14px",
    wordBreak: "break-word",
  },
  explanationText: {
    margin: 0,
    color: "#cbd5e1",
    lineHeight: 1.7,
  },
  noteBox: {
    background: "rgba(7, 16, 24, 0.88)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "14px",
    padding: "14px",
  },
  modalFooter: {
    padding: "0 24px 24px 24px",
    display: "flex",
    justifyContent: "flex-end",
  },
  modalSecondaryBtn: {
    padding: "10px 16px",
    border: "none",
    borderRadius: "12px",
    background: "rgba(51, 65, 85, 0.92)",
    color: "#e2e8f0",
    fontWeight: 700,
    cursor: "pointer",
  },
};

export default Dashboard;