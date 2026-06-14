const SensorReading = require("../models/SensorReading");
const FeatureWindow = require("../models/FeatureWindow");
const axios = require("axios");

exports.generateFeatures = async (req, res) => {
  try {
    const { segmentId, runId } = req.body;

    if (!segmentId || !runId) {
      return res.status(400).json({
        message: "segmentId and runId are required"
      });
    }

    const readings = await SensorReading.find({ segmentId, runId })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    if (readings.length < 20) {
      return res.status(400).json({
        message: "Not enough readings",
        currentCount: readings.length,
        requiredCount: 20
      });
    }

    const ordered = readings.reverse();

    const response = await axios.post(
      "http://127.0.0.1:8000/extract-features",
      {
        readings: ordered
      }
    );

    const features = response.data;

    const featureDoc = await FeatureWindow.create({
      segmentId,
      runId,
      windowStart: ordered[0].timestamp,
      windowEnd: ordered[ordered.length - 1].timestamp,
      ...features
    });

    res.status(201).json(featureDoc);

  } catch (error) {
    console.error(
      "generateFeatures error full =>",
      error.response?.data || error.message
    );

    return res.status(500).json({
      message: "Failed to generate features",
      error: error.message,
      details: error.response?.data || null
    });
  }
};