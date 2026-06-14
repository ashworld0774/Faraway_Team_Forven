const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    segmentId: {
      type: String,
      required: true
    },
    runId: {
      type: String,
      required: true
    },
    predictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prediction",
      required: true
    },
    featureWindowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeatureWindow",
      required: true
    },
    level: {
      type: String,
      enum: ["Warning", "Urgent"],
      required: true
    },
    riskScore: {
      type: Number,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    status: {
  type: String,
  enum: ["Open", "In Review", "Closed"],
  default: "Open",
},
  },
  { timestamps: true }
);


module.exports = mongoose.model("Alert", alertSchema);