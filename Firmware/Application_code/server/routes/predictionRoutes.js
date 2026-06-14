const express = require("express");
const router = express.Router();
const Prediction = require("../models/Prediction");

router.get("/run-ids", async (req, res) => {
  try {
    const runIds = await Prediction.distinct("runId");
    res.json(runIds);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch run IDs" });
  }
});

router.get("/run/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const predictions = await Prediction.find({ runId }).sort({ createdAt: -1 });
    res.json(predictions);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch predictions by runId" });
  }
});

router.get("/summary/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const predictions = await Prediction.find({ runId });

    const totalPredictions = predictions.length;
    const classCounts = {
      Normal: predictions.filter(p => p.predictedClass === "Normal").length,
      Inspect: predictions.filter(p => p.predictedClass === "Inspect").length,
      Urgent: predictions.filter(p => p.predictedClass === "Urgent").length,
    };

    const averageRiskScore =
      totalPredictions > 0
        ? (
            predictions.reduce((sum, p) => sum + (p.riskScore || 0), 0) /
            totalPredictions
          ).toFixed(2)
        : 0;

    const topRiskySegments = [...predictions]
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      .slice(0, 5);

    res.json({
      totalPredictions,
      classCounts,
      averageRiskScore,
      topRiskySegments,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch prediction summary" });
  }
});

module.exports = router;