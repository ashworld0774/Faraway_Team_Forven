const mongoose = require("mongoose");

const datasetRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true },
    datasetName: { type: String, default: "DR-Train" },
    regionId: { type: String, required: true },
    sourceTrainId: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
    totalPasses: { type: Number, default: 0 },
    totalSegments: { type: Number, default: 0 },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("DatasetRun", datasetRunSchema);