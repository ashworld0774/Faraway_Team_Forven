const express = require("express");
const router = express.Router();

const {
  getLatestSensorReadings,
  getLatestFeatureWindows,
  getLatestPredictions,
  getDashboardOverview
} = require("../controllers/dashboardController");

router.get("/sensors/latest", getLatestSensorReadings);
router.get("/features/latest", getLatestFeatureWindows);
router.get("/predictions/latest", getLatestPredictions);
router.get("/overview", getDashboardOverview);

module.exports = router;