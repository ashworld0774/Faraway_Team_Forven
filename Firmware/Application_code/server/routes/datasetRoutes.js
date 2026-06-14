const express = require("express");
const router = express.Router();

const {
  createDatasetRun,
  getDatasetRuns
} = require("../controllers/datasetController");

router.post("/", createDatasetRun);
router.get("/", getDatasetRuns);

module.exports = router;