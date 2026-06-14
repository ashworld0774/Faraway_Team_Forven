const DatasetRun = require("../models/DatasetRun");

const createDatasetRun = async (req, res) => {
  try {
    const newRun = new DatasetRun(req.body);
    const savedRun = await newRun.save();
    res.status(201).json(savedRun);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDatasetRuns = async (req, res) => {
  try {
    const runs = await DatasetRun.find().sort({ createdAt: -1 });
    res.json(runs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createDatasetRun,
  getDatasetRuns
};