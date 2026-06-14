const mongoose = require("mongoose");
const axios = require("axios");

const FeatureWindow = require("../models/FeatureWindow");
const Prediction = require("../models/Prediction");
const Alert = require("../models/Alert");

const createPredictionsBulk = async (req, res) => {
  try {
    const predictions = req.body;

    if (!Array.isArray(predictions) || predictions.length === 0) {
      return res.status(400).json({
        message: "Please send an array of predictions"
      });
    }

    const savedPredictions = await Prediction.insertMany(predictions);

    res.status(201).json(savedPredictions);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

const getPredictionRunIds = async (req, res) => {
  try {
    const runIds = await Prediction.distinct("runId");

    res.json(runIds.sort());
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

const getPredictionsByRunId = async (req, res) => {
  try {
    const { runId } = req.params;

    const predictions = await Prediction.find({ runId })
      .sort({ createdAt: -1 });

    res.json(predictions);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

const getPredictionSummary = async (req, res) => {
  try {
    const { runId } = req.params;

    const predictions = await Prediction.find({ runId });

    const total = predictions.length;

    const normalCount = predictions.filter(
      (p) => p.predictedClass === "Normal"
    ).length;

    const inspectCount = predictions.filter(
      (p) => p.predictedClass === "Inspect"
    ).length;

    const urgentCount = predictions.filter(
      (p) => p.predictedClass === "Urgent"
    ).length;

    const avgRiskScore =
      total > 0
        ? predictions.reduce(
            (sum, p) => sum + (p.riskScore || 0),
            0
          ) / total
        : 0;

    const topRiskySegments = await Prediction.find({ runId })
      .sort({ riskScore: -1 })
      .limit(5);

    res.json({
      runId,
      totalPredictions: total,
      classCounts: {
        Normal: normalCount,
        Inspect: inspectCount,
        Urgent: urgentCount
      },
      averageRiskScore: Number(avgRiskScore.toFixed(2)),
      topRiskySegments
    });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

const inferPrediction = async (req, res) => {
  try {
    const { segmentId, runId, featureWindowId } = req.body;

    if (!segmentId || !runId || !featureWindowId) {
      return res.status(400).json({
        message: "segmentId, runId and featureWindowId are required"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(featureWindowId)) {
      return res.status(400).json({
        message: "Invalid featureWindowId format"
      });
    }

    const featureDoc = await FeatureWindow.findById(featureWindowId).lean();

    if (!featureDoc) {
      return res.status(404).json({
        message: "FeatureWindow not found"
      });
    }

    const mlServiceUrl = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

    const payload = {
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
        noiseMean: featureDoc.noiseMean
      }
    };

    console.log("Payload sent to ML =>", payload);

    const mlResponse = await axios.post(`${mlServiceUrl}/predict`, payload, {
      timeout: 10000
    });

    const riskScore = Number(mlResponse.data.confidence || 0);

    const predictionDoc = await Prediction.create({
      segmentId,
      runId,
      featureWindowId,
      predictedClass: mlResponse.data.predictedClass,
      confidence: mlResponse.data.confidence,
      anomalyScore: mlResponse.data.anomalyScore || null,
      recommendedAction: mlResponse.data.recommendedAction || "Inspect",
      riskScore
    });

        let alertDoc = null;
    let alertLevel = null;

    if (riskScore >= 0.85) {
      alertLevel = "Urgent";
    } else if (riskScore >= 0.6) {
      alertLevel = "Warning";
    }

    if (alertLevel) {
      alertDoc = await Alert.create({
        segmentId,
        runId,
        predictionId: predictionDoc._id,
        featureWindowId,
        level: alertLevel,
        riskScore,
        message: `${alertLevel} alert for ${segmentId} in ${runId}. Predicted class: ${predictionDoc.predictedClass}. Risk score: ${riskScore}`,
        status: "Open"
      });
    }

    return res.status(201).json({
  prediction: predictionDoc,
  alert: alertDoc,
  message: alertDoc
    ? "Prediction created and alert auto-generated"
    : "Prediction created, no alert triggered"
});
  } catch (error) {
    console.error("inferPrediction error =>", error.response?.data || error.message);

    return res.status(500).json({
      message: "Prediction inference failed",
      error: error.message,
      details: error.response?.data || null
    });
  }
};


module.exports = {
  createPredictionsBulk,
  getPredictionRunIds,
  getPredictionsByRunId,
  getPredictionSummary,
  inferPrediction
};