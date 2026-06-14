const mongoose = require("mongoose");

const featureWindowSchema = new mongoose.Schema({
  segmentId: String,
  runId: String,
  windowStart: Date,
  windowEnd: Date,
  rmsX: Number,
  rmsY: Number,
  rmsZ: Number,
  meanX: Number,
  meanY: Number,
  meanZ: Number,
  varianceX: Number,
  varianceY: Number,
  varianceZ: Number,
  vibrationPeak: Number,
  tempMean: Number,
  speedMean: Number,
  noiseMean: Number
}, { timestamps: true });

module.exports = mongoose.model("FeatureWindow", featureWindowSchema);