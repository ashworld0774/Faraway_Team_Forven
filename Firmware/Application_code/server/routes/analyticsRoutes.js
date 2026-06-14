const express = require("express");
const router = express.Router();
const Prediction = require("../models/Prediction");
const Alert = require("../models/Alert");

router.get("/class-distribution/:runId", async (req, res) => {
  try {
    const { runId } = req.params;

    const result = await Prediction.aggregate([
      { $match: { runId } },
      { $group: { _id: "$predictedClass", value: { $sum: 1 } } }
    ]);

    res.json(
      result.map(item => ({
        label: item._id,
        value: item.value
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch class distribution" });
  }
});

router.get("/alert-distribution/:runId", async (req, res) => {
  try {
    const { runId } = req.params;

    const result = await Alert.aggregate([
      { $match: { runId } },
      { $group: { _id: "$status", value: { $sum: 1 } } }
    ]);

    res.json(
      result.map(item => ({
        label: item._id,
        value: item.value
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch alert distribution" });
  }
});

router.get("/risk-trend/:runId", async (req, res) => {
  try {
    const { runId } = req.params;

    const predictions = await Prediction.find({ runId })
      .sort({ createdAt: 1 })
      .limit(10);

    res.json(
      predictions.map((item, index) => ({
        label: `P${index + 1}`,
        riskScore: item.riskScore || 0
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch risk trend" });
  }
});

module.exports = router;