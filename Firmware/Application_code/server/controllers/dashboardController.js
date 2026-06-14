const SensorReading = require("../models/SensorReading");
const FeatureWindow = require("../models/FeatureWindow");
const Prediction = require("../models/Prediction");
const Alert = require("../models/Alert");

const getLatestSensorReadings = async (req, res) => {
  try {
    const { segmentId, limit = 10 } = req.query;

    const filter = {};
    if (segmentId) filter.segmentId = segmentId;

    const readings = await SensorReading.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.status(200).json(readings);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch latest sensor readings",
      error: error.message
    });
  }
};

const getLatestFeatureWindows = async (req, res) => {
  try {
    const { segmentId, limit = 5 } = req.query;

    const filter = {};
    if (segmentId) filter.segmentId = segmentId;

    const features = await FeatureWindow.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.status(200).json(features);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch latest feature windows",
      error: error.message
    });
  }
};

const getLatestPredictions = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const predictions = await Prediction.find({})
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.status(200).json(predictions);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch latest predictions",
      error: error.message
    });
  }
};

const getDashboardOverview = async (req, res) => {
  try {
    const { segmentId, runId } = req.query;

    const sensorFilter = {};
    const featureFilter = {};
    const predictionFilter = {};
    const alertFilter = { status: "Open" };

    if (segmentId) {
      sensorFilter.segmentId = segmentId;
      featureFilter.segmentId = segmentId;
      predictionFilter.segmentId = segmentId;
      alertFilter.segmentId = segmentId;
    }

    if (runId) {
      featureFilter.runId = runId;
      predictionFilter.runId = runId;
      alertFilter.runId = runId;
    }

    const latestSensorReadings = await SensorReading.find(sensorFilter)
      .sort({ createdAt: -1 })
      .limit(10);

    const latestFeatureSummary = await FeatureWindow.findOne(featureFilter)
      .sort({ createdAt: -1 });

    const latestPrediction = await Prediction.findOne(predictionFilter)
      .sort({ createdAt: -1 });

    const activeAlerts = await Alert.find(alertFilter)
      .populate("predictionId", "predictedClass confidence riskScore recommendedAction")
      .sort({ createdAt: -1 })
      .limit(10);

    return res.status(200).json({
      latestSensorReadings,
      latestFeatureSummary,
      latestPrediction,
      activeAlerts
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch dashboard overview",
      error: error.message
    });
  }
};

module.exports = {
  getLatestSensorReadings,
  getLatestFeatureWindows,
  getLatestPredictions,
  getDashboardOverview
};