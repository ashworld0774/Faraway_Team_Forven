const mongoose = require("mongoose");
const Alert = require("../models/Alert");

const formatAlert = (alertDoc) => {
  const alert = alertDoc.toObject ? alertDoc.toObject({ virtuals: true }) : alertDoc;
  const prediction = alert.predictionId && typeof alert.predictionId === "object"
    ? alert.predictionId
    : null;

  return {
    alertId: alert._id?.toString(),
    id: alert._id?.toString(),
    segmentId: alert.segmentId || prediction?.segmentId || null,
    runId: alert.runId || null,
    featureWindowId: alert.featureWindowId?._id?.toString?.() || alert.featureWindowId || null,

    predictionId: prediction?._id?.toString?.() || alert.predictionId?.toString?.() || null,
    predictedClass: prediction?.predictedClass || null,
    confidence: prediction?.confidence ?? null,
    riskScore: prediction?.riskScore ?? null,
    recommendedAction:
      alert.recommendedAction ||
      prediction?.recommendedAction ||
      "Inspect track segment",

    severity:
      alert.severity ||
      prediction?.predictedClass ||
      "Normal",

    status: alert.status || "Open",
    createdAt: alert.createdAt || null,
    updatedAt: alert.updatedAt || null,

    prediction: prediction || null,
    featureWindow: alert.featureWindowId || null,
  };
};

exports.getAllAlerts = async (req, res) => {
  try {
    const { level, severity, status, segmentId, runId } = req.query;
    const filter = {};

    if (level) filter.level = level;
    if (severity) filter.severity = severity;
    if (status) filter.status = status;
    if (segmentId) filter.segmentId = segmentId;
    if (runId) filter.runId = runId;

    const alerts = await Alert.find(filter)
      .populate("predictionId", "segmentId predictedClass confidence riskScore recommendedAction createdAt")
      .populate("featureWindowId", "windowStart windowEnd")
      .sort({ createdAt: -1 });

    res.status(200).json(alerts.map(formatAlert));
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch alerts",
      error: error.message
    });
  }
};

exports.getOpenAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find({ status: { $in: ["Open", "In Review"] } })
      .populate("predictionId", "segmentId predictedClass confidence riskScore recommendedAction createdAt")
      .populate("featureWindowId", "windowStart windowEnd")
      .sort({ createdAt: -1 });

    res.status(200).json(alerts.map(formatAlert));
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch open alerts",
      error: error.message
    });
  }
};

exports.getAlertsByRun = async (req, res) => {
  try {
    const { runId } = req.params;

    const alerts = await Alert.find({ runId })
      .populate("predictionId", "segmentId predictedClass confidence riskScore recommendedAction createdAt")
      .populate("featureWindowId", "windowStart windowEnd")
      .sort({ createdAt: -1 });

    res.status(200).json(alerts.map(formatAlert));
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch alerts for run",
      error: error.message
    });
  }
};

exports.getAlertById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid alert id" });
    }

    const alert = await Alert.findById(id)
      .populate("predictionId", "segmentId predictedClass confidence riskScore recommendedAction createdAt")
      .populate("featureWindowId", "windowStart windowEnd");

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    res.status(200).json(formatAlert(alert));
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch alert",
      error: error.message
    });
  }
};

exports.updateAlertStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["Open", "In Review", "Closed"];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid alert id" });
    }

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Valid status is required",
        allowedStatuses
      });
    }

    const updatedAlert = await Alert.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    )
      .populate("predictionId", "segmentId predictedClass confidence riskScore recommendedAction createdAt")
      .populate("featureWindowId", "windowStart windowEnd");

    if (!updatedAlert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    res.status(200).json({
      message: "Alert status updated successfully",
      alert: formatAlert(updatedAlert)
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update alert status",
      error: error.message
    });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid alert id" });
    }

    const deletedAlert = await Alert.findByIdAndDelete(id);

    if (!deletedAlert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    res.status(200).json({
      message: "Alert deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete alert",
      error: error.message
    });
  }
};