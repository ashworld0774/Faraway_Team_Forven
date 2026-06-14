const mongoose = require("mongoose");

const sensorReadingSchema = new mongoose.Schema({
  sensorId: { type: String, required: true },
  segmentId: { type: String, required: true },
  runId: { type: String, required: true },
  timestamp: { type: Date, required: true },
  vibrationX: { type: Number, required: true },
  vibrationY: { type: Number, required: true },
  vibrationZ: { type: Number, required: true },
  temperature: { type: Number, required: true },
  speed: { type: Number, required: true },
  noiseLevel: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model("SensorReading", sensorReadingSchema);