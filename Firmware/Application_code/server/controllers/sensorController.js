const SensorReading = require("../models/SensorReading");
const FeatureWindow = require("../models/FeatureWindow");
const Prediction = require("../models/Prediction");
const Alert = require("../models/Alert");
const axios = require("axios");

const ML_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

async function tryAutoPredict(segmentId, runId) {
  try {
    const readings = await SensorReading.find({ segmentId, runId })
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();

    if (readings.length < 5) return;

    const ordered = readings.reverse();

    const featureRes = await axios.post(`${ML_URL}/extract-features`, {
      readings: ordered,
    });

    const features = featureRes.data;

    const featureDoc = await FeatureWindow.create({
      segmentId,
      runId,
      windowStart: ordered[0].timestamp,
      windowEnd: ordered[ordered.length - 1].timestamp,
      ...features,
    });

    const mlRes = await axios.post(`${ML_URL}/predict`, {
      features: {
        rmsX: featureDoc.rmsX,
        rmsY: featureDoc.rmsY,
        rmsZ: featureDoc.rmsZ,
        varianceX: featureDoc.varianceX,
        varianceY: featureDoc.varianceY,
        varianceZ: featureDoc.varianceZ,
        vibrationPeak: featureDoc.vibrationPeak,
        tempMean: featureDoc.tempMean,
        speedMean: featureDoc.speedMean,
        noiseMean: featureDoc.noiseMean,
      },
    });

    const riskScore = Number(mlRes.data.confidence || 0);

    const predictionDoc = await Prediction.create({
      segmentId,
      runId,
      featureWindowId: featureDoc._id,
      predictedClass: mlRes.data.predictedClass,
      confidence: mlRes.data.confidence,
      anomalyScore: mlRes.data.anomalyScore || null,
      recommendedAction: mlRes.data.recommendedAction || "Inspect",
      riskScore,
    });

    let alertLevel = null;
    if (riskScore >= 0.85) alertLevel = "Urgent";
    else if (riskScore >= 0.6) alertLevel = "Warning";

    if (alertLevel) {
      await Alert.create({
        segmentId,
        runId,
        predictionId: predictionDoc._id,
        featureWindowId: featureDoc._id,
        level: alertLevel,
        riskScore,
        message: `${alertLevel} alert for ${segmentId} in ${runId}. Predicted: ${predictionDoc.predictedClass}. Risk: ${riskScore}`,
        status: "Open",
      });
    }

    console.log(`✅ Auto-pipeline done: ${segmentId} → ${mlRes.data.predictedClass} (risk: ${riskScore})`);

  } catch (err) {
    console.error(`⚠️ Auto-pipeline failed for ${segmentId}:`, err.message);
  }
}

exports.ingestSensorReading = async (req, res) => {
  try {
    const reading = await SensorReading.create(req.body);
    res.status(201).json(reading);

    tryAutoPredict(reading.segmentId, reading.runId);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSensorReadingsBySegment = async (req, res) => {
  try {
    const data = await SensorReading
      .find({ segmentId: req.params.segmentId })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};