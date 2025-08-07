import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import config from "./config.js";
import ndviRoutes from "./routes/ndviRoutes.js";
import fs from "fs/promises";
import { fromFile } from "geotiff";

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
// Logging middleware
app.use(morgan("combined"));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/ndvi", ndviRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "NDVI API Server",
    version: "1.0.0",
    endpoints: {
      "POST /ndvi/timeseries": "Get NDVI timeseries data",
      "GET /ndvi/health": "Health check endpoint",
    },
  });
});

app.get("/elevation", async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res
      .status(400)
      .json({ error: "Please provide lat and lon in query parameters." });
  }
  try {
    const tiff = await fromFile("Copernicus_DEM.tif");

    const image = await tiff.getImage();

    const rasters = await image.readRasters();
    const [raster] = rasters;

    const width = image.getWidth();
    const height = image.getHeight();

    const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
    const pixelWidth = (bbox[2] - bbox[0]) / width;
    const pixelHeight = (bbox[3] - bbox[1]) / height;


    const x = Math.floor((parseFloat(lon) - bbox[0]) / pixelWidth);
    const y = Math.floor((bbox[3] - parseFloat(lat)) / pixelHeight);

    if (x < 0 || x >= width || y < 0 || y >= height) {
      return res
        .status(400)
        .json({ error: "Lat/lon is outside the DEM bounds." });
    }

    const index = y * width + x;
    const value = raster[index];
    const nodata = image.getGDALNoData();
    console.log("NoData Value:", nodata);

    if (value === nodata) {
      return res.json({ elevation: null, message: "No data at this location" });
    }

    res.json({
      lat,
      lon,
      pixel: { x, y },
      elevation: value,
    });
  } catch (err) {
    console.error("Error reading DEM:", err);
    res.status(500).json({ error: "Failed to read DEM file" });
  }
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    error: "Internal Server Error",
    message:
      config.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
  });
});

// Start server
const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`NDVI API Server running on port ${PORT}`);
});

export default app;
