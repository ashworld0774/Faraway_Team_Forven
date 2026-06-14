const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const connectDB = require("./config/db");
const datasetRoutes = require("./routes/datasetRoutes");
const segmentRoutes = require("./routes/segmentRoutes");
const predictionRoutes = require("./routes/predictionRoutes");
const alertRoutes = require("./routes/alertRoutes");
const sensorRoutes = require("./routes/sensorRoutes");
const featureRoutes = require("./routes/featureRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const mlRoutes = require("./routes/mlRoutes");

dotenv.config();

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "RailMitra backend running" });
});

app.use("/api/datasets", datasetRoutes);
app.use("/api/segments", segmentRoutes);
app.use("/api/sensors", sensorRoutes);
app.use("/api/features", featureRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/ml", mlRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});