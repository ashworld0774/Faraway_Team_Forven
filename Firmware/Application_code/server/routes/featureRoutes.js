const express = require("express");
const router = express.Router();

const { generateFeatures } = require("../controllers/featureController");

console.log("featureRoutes loaded");

router.post("/generate", generateFeatures);

module.exports = router;