const express = require("express");
const router = express.Router();
const SensorReading = require("../models/SensorReading");
const { ingestSensorReading, getSensorReadingsBySegment } = require("../controllers/sensorController");

router.post("/readings", ingestSensorReading);

router.get("/readings/:segmentId", getSensorReadingsBySegment);

router.get("/live/:runId", async (req, res) => {
  try {
    const { runId } = req.params;

    const readings = await SensorReading.find({ runId })
      .sort({ timestamp: -1 })
      .limit(6);

    res.json(readings);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch live sensor data" });
  }
});

module.exports = router;