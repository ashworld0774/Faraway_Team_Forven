const express = require("express");
const router = express.Router();

console.log("segmentRoutes loaded");

const {
  createSegmentsBulk,
  upsertSegmentsBulk,
  getAllSegments,
  getSegmentBySegmentId,
  getSegmentDebugStats
} = require("../controllers/segmentController");

router.get("/debug/stats", getSegmentDebugStats);
router.post("/upsert", upsertSegmentsBulk);
router.post("/", createSegmentsBulk);
router.get("/", getAllSegments);
router.get("/:segmentId", getSegmentBySegmentId);

module.exports = router;