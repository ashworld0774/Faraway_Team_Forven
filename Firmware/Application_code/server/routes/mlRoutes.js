const express = require("express");
const router = express.Router();
const axios = require("axios");
const FeatureWindow = require("../models/FeatureWindow");
const Prediction = require("../models/Prediction");
const Alert = require("../models/Alert");

const ML_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

router.post("/predict/:runId", async (req, res) => {
  try {
    const { runId } = req.params;

    const featureWindows = await FeatureWindow.find({ runId }).lean();

    if (!featureWindows || featureWindows.length === 0) {
      return res.status(404).json({
        message: `No feature windows found for runId: ${runId}. Sensor pipeline se data aana chahiye pehle.`
      });
    }

    const results = [];

    for (const featureDoc of featureWindows) {
      try {
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
            noiseMean: featureDoc.noiseMean,
          },
        };

        const mlRes = await axios.post(`${ML_URL}/predict`, payload, {
          timeout: 10000,
        });

        const riskScore = Number(mlRes.data.confidence || 0);

        const predictionDoc = await Prediction.create({
          segmentId: featureDoc.segmentId,
          runId,
          featureWindowId: featureDoc._id,
          predictedClass: mlRes.data.predictedClass,
          confidence: mlRes.data.confidence,
          anomalyScore: mlRes.data.anomalyScore || null,
          recommendedAction: mlRes.data.recommendedAction || "Inspect",
          riskScore,
        });

        let alertDoc = null;
        let alertLevel = null;
        if (riskScore >= 0.85) alertLevel = "Urgent";
        else if (riskScore >= 0.6) alertLevel = "Warning";

        if (alertLevel) {
          alertDoc = await Alert.create({
            segmentId: featureDoc.segmentId,
            runId,
            predictionId: predictionDoc._id,
            featureWindowId: featureDoc._id,
            level: alertLevel,
            riskScore,
            message: `${alertLevel} alert for ${featureDoc.segmentId} in ${runId}. Predicted: ${predictionDoc.predictedClass}. Risk: ${riskScore}`,
            status: "Open",
          });
        }

        results.push({ prediction: predictionDoc, alert: alertDoc });
      } catch (innerErr) {
        console.error(`Failed for featureWindow ${featureDoc._id}:`, innerErr.message);
        results.push({ featureWindowId: featureDoc._id, error: innerErr.message });
      }
    }

    return res.status(201).json({
      message: `Processed ${results.length} feature windows for run ${runId}`,
      results,
    });

  } catch (error) {
    console.error("ML predict error =>", error.message);
    return res.status(500).json({
      message: "Failed to trigger ML prediction",
      error: error.message,
    });
  }
});

module.exports = router;