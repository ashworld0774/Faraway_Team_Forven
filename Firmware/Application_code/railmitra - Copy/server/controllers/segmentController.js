const TrackSegment = require("../models/TrackSegment");

const sanitizeSegment = (item) => ({
  segmentId: item.segmentId?.trim(),
  runId: item.runId?.trim(),
  regionId: item.regionId?.trim(),
  sourceTrainId: item.sourceTrainId?.trim(),
  segmentIndex: item.segmentIndex,
  windowLengthMeters: item.windowLengthMeters ?? 25,
  startLat: item.startLat,
  startLng: item.startLng,
  endLat: item.endLat,
  endLng: item.endLng,
  passDate: item.passDate,
  speedAvg: item.speedAvg,
  tempAmbient: item.tempAmbient,
  features: {
    rms: item.features?.rms,
    variance: item.features?.variance,
    peak: item.features?.peak,
    energy: item.features?.energy,
    crestFactor: item.features?.crestFactor,
    kurtosis: item.features?.kurtosis,
    fftBandLow: item.features?.fftBandLow,
    fftBandMid: item.features?.fftBandMid,
    fftBandHigh: item.features?.fftBandHigh
  },
  trueLabel: item.trueLabel || "Normal",
  labelSource: item.labelSource || "maintenance-window-derived"
});

const createSegmentsBulk = async (req, res) => {
  try {
    const segments = req.body;

    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({
        message: "Please send an array of segments"
      });
    }

    const cleanedSegments = segments
      .map(sanitizeSegment)
      .filter(
        (item) =>
          item.segmentId &&
          item.runId &&
          item.regionId &&
          item.sourceTrainId
      );

    if (cleanedSegments.length === 0) {
      return res.status(400).json({
        message: "No valid segments found after sanitization"
      });
    }

    const result = await TrackSegment.insertMany(cleanedSegments, {
      ordered: false
    });

    return res.status(201).json({
      message: "Segments inserted successfully",
      insertedCount: result.length,
      insertedSegments: result
    });
  } catch (error) {
    console.error("createSegmentsBulk error:", error);

    return res.status(500).json({
      message: "Bulk insert completed partially or failed",
      error: error.message,
      insertedCount: error.insertedDocs ? error.insertedDocs.length : 0,
      insertedDocs: error.insertedDocs || []
    });
  }
};

const getAllSegments = async (req, res) => {
  try {
    const { runId } = req.query;
    const filter = runId ? { runId: runId.trim() } : {};

    const segments = await TrackSegment.find(filter).sort({ createdAt: -1 });

    res.json(segments);
  } catch (error) {
    console.error("getAllSegments error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getSegmentBySegmentId = async (req, res) => {
  try {
    const rawSegmentId = req.params.segmentId;
    const segmentId = rawSegmentId?.trim();

    const segment = await TrackSegment.findOne({ segmentId });

    if (!segment) {
      return res.status(404).json({
        message: "Segment not found",
        requestedSegmentId: rawSegmentId,
        hint: "Prediction may exist, but TrackSegment document is missing in database."
      });
    }

    res.json(segment);
  } catch (error) {
    console.error("getSegmentBySegmentId error:", error);
    res.status(500).json({ message: error.message });
  }
};

const getSegmentDebugStats = async (req, res) => {
  try {
    const totalSegments = await TrackSegment.countDocuments();

    const runCounts = await TrackSegment.aggregate([
      {
        $group: {
          _id: "$runId",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const sampleSegments = await TrackSegment.find({})
      .select("segmentId runId regionId")
      .limit(20)
      .sort({ createdAt: -1 });

    res.json({
      totalSegments,
      runCounts,
      sampleSegments
    });
  } catch (error) {
    console.error("getSegmentDebugStats error:", error);
    res.status(500).json({ message: error.message });
  }
};

  const upsertSegmentsBulk = async (req, res) => {
  try {
    const segments = req.body;

    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({
        message: "Please send an array of segments"
      });
    }

    const cleanedSegments = segments
      .map(sanitizeSegment)
      .filter(
        (item) =>
          item.segmentId &&
          item.runId &&
          item.regionId &&
          item.sourceTrainId
      );

    if (cleanedSegments.length === 0) {
      return res.status(400).json({
        message: "No valid segments found after sanitization"
      });
    }

    const ops = cleanedSegments.map((item) => ({
      updateOne: {
        filter: { segmentId: item.segmentId },
        update: { $set: item },
        upsert: true
      }
    }));

    const result = await TrackSegment.bulkWrite(ops, { ordered: false });

    return res.status(200).json({
      message: "Segments upserted successfully",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount
    });
  } catch (error) {
    console.error("upsertSegmentsBulk error:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createSegmentsBulk,
  upsertSegmentsBulk,
  getAllSegments,
  getSegmentBySegmentId,
  getSegmentDebugStats
};