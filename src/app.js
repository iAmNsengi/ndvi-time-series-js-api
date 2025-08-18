import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import config from "./config.js";
import ndviRoutes from "./routes/ndviRoutes.js";
import demRoutes from "./routes/demRoutes.js";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "path";
import { fileURLToPath } from "url";

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
app.use("/dem", demRoutes);

// Swagger UI at /docs and raw spec at /docs/openapi.yaml
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openapiPath = path.join(__dirname, "..", "docs", "openapi.yaml");
const openapiDocument = YAML.load(openapiPath);
app.get("/docs/openapi.yaml", (req, res) => {
  res.setHeader("Content-Type", "application/yaml");
  res.sendFile(openapiPath);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Geospatial API Server",
    version: "1.0.0",
    endpoints: {
      "POST /ndvi/timeseries": "Get NDVI timeseries data",
      "GET /ndvi/health": "Health check endpoint",
      "POST /dem/clip": "Get DEM cutout (JSON format only) via openEO",
      "GET /docs": "Swagger UI",
      "GET /docs/openapi.yaml": "OpenAPI YAML",
    },
  });
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
