const express = require("express");
const router = express.Router();

const {
  getAllAlerts,
  getOpenAlerts,
  getAlertsByRun,
  getAlertById,
  updateAlertStatus,
  deleteAlert,
} = require("../controllers/alertController");

router.get("/", getAllAlerts);
router.get("/open", getOpenAlerts);
router.get("/run/:runId", getAlertsByRun);
router.get("/:id", getAlertById);
router.patch("/:id/status", updateAlertStatus);
router.delete("/:id", deleteAlert);

module.exports = router;