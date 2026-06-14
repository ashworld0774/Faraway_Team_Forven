const mongoose = require("mongoose");

const predictionSchema = new mongoose.Schema(
  {
    segmentId: {
      type: String,
      required: true
    },
    runId: {
      type: String,
      required: true
    },
    featureWindowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeatureWindow",
      required: true
    },
    predictedClass: {
      type: String,
      required: true
    },
    confidence: {
      type: Number,
      default: null
    },
    anomalyScore: {
      type: Number,
      default: null
    },
    recommendedAction: {
      type: String,
      default: "Inspect"
    },
    riskScore: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Prediction", predictionSchema);