const mongoose = require("mongoose");

const trackSegmentSchema = new mongoose.Schema(
  {
    segmentId: { type: String, required: true, unique: true },
    runId: { type: String, required: true, index: true },
    regionId: { type: String, required: true, index: true },
    sourceTrainId: { type: String, required: true },

    segmentIndex: { type: Number, required: true },
    windowLengthMeters: { type: Number, default: 25 },

    startLat: Number,
    startLng: Number,
    endLat: Number,
    endLng: Number,

    passDate: Date,
    speedAvg: Number,
    tempAmbient: Number,

    features: {
      rms: Number,
      variance: Number,
      peak: Number,
      energy: Number,
      crestFactor: Number,
      kurtosis: Number,
      fftBandLow: Number,
      fftBandMid: Number,
      fftBandHigh: Number
    },

    trueLabel: {
      type: String,
      enum: ["Normal", "Inspect", "Urgent"],
      default: "Normal"
    },
    labelSource: {
      type: String,
      default: "maintenance-window-derived"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TrackSegment", trackSegmentSchema);