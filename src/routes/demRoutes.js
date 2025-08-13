import express from "express";
import { demRequestSchema } from "../validation/schema.js";
import openeoService from "../services/openeoService.js";
import fileStorageService from "../services/fileStorageService.js";
import path from "path";

const router = express.Router();

// Helper function to transform DEM data into user-friendly format
const transformDemData = (demData) => {
  try {
    if (!demData || !demData.data || !Array.isArray(demData.data)) {
      return null;
    }

    const elevationArray = demData.data[0]; // First (and only) band
    if (!Array.isArray(elevationArray)) {
      return null;
    }

    // Get coordinate arrays
    const xCoords = demData.coords?.x?.data || [];
    const yCoords = demData.coords?.y?.data || [];

    if (xCoords.length === 0 || yCoords.length === 0) {
      console.warn("No coordinate data found");
      return null;
    }

    // Transform to user-friendly format: array of {x, y, elevation} objects
    const points = [];
    const validElevations = [];

    for (let yIdx = 0; yIdx < elevationArray.length; yIdx++) {
      const row = elevationArray[yIdx];
      if (!Array.isArray(row)) continue;

      for (let xIdx = 0; xIdx < row.length; xIdx++) {
        const elevation = row[xIdx];

        // Filter out nodata values
        const isValidElevation =
          elevation !== null &&
          elevation !== undefined &&
          !isNaN(elevation) &&
          elevation !== 19.5 && // Common SRTM nodata value
          elevation !== -9999 && // Common nodata value
          elevation !== -32768 && // Common nodata value
          elevation > -1000 && // Reasonable bounds
          elevation < 10000;

        if (
          isValidElevation &&
          xIdx < xCoords.length &&
          yIdx < yCoords.length
        ) {
          const point = {
            x: Math.round(xCoords[xIdx] * 1000000) / 1000000, // Round to 6 decimal places
            y: Math.round(yCoords[yIdx] * 1000000) / 1000000,
            elevation: Math.round(elevation * 100) / 100, // Round to 2 decimal places
          };
          points.push(point);
          validElevations.push(elevation);
        }
      }
    }

    if (validElevations.length === 0) {
      return null;
    }

    // Calculate statistics
    const min = Math.min(...validElevations);
    const max = Math.max(...validElevations);
    const mean =
      validElevations.reduce((sum, val) => sum + val, 0) /
      validElevations.length;

    const sorted = [...validElevations].sort((a, b) => a - b);
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    const variance =
      validElevations.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      validElevations.length;
    const stddev = Math.sqrt(variance);

    return {
      points,
      statistics: {
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        stddev: Math.round(stddev * 100) / 100,
        count: validElevations.length,
        units: "meters",
      },
      metadata: {
        gridSize: {
          width: xCoords.length,
          height: yCoords.length,
        },
        bounds: {
          minX: Math.min(...xCoords),
          maxX: Math.max(...xCoords),
          minY: Math.min(...yCoords),
          maxY: Math.max(...yCoords),
        },
        crs: demData.attrs?.crs || "Unknown",
      },
    };
  } catch (error) {
    console.warn("Failed to transform DEM data:", error.message);
    return null;
  }
};

// Validate DEM request
const validateDemRequest = (req, res, next) => {
  const { error, value } = demRequestSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      error: "Validation error",
      details: error.details.map((d) => d.message),
    });
  }
  req.body = value;
  next();
};

// POST /dem/clip → small cutout via /result
router.post("/clip", validateDemRequest, async (req, res) => {
  try {
    const { coordinates, product, format, saveLocally = true } = req.body;

    const data = await openeoService.getDEMCutout(coordinates, product, format);

    let savedFile = null;
    if (saveLocally) {
      // Save file locally with timestamp and metadata
      savedFile = await fileStorageService.saveDemFile(
        data,
        format,
        coordinates,
        product
      );
      if (!savedFile.success) {
        console.warn("Failed to save file locally:", savedFile.error);
      }
    }

    // Set appropriate headers based on format
    if (format === "GTiff") {
      res.setHeader("Content-Type", "image/tiff");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=dem_cutout.tiff"
      );

      // Include file info in response headers if saved
      if (savedFile?.success) {
        res.setHeader("X-Saved-File", savedFile.filename);
        res.setHeader("X-Download-Url", savedFile.downloadUrl);
      }

      return res.send(Buffer.from(data));
    }

    if (format === "PNG") {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", "inline; filename=dem_cutout.png");

      // Include file info in response headers if saved
      if (savedFile?.success) {
        res.setHeader("X-Saved-File", savedFile.filename);
        res.setHeader("X-Download-Url", savedFile.downloadUrl);
      }

      return res.send(Buffer.from(data));
    }

    // JSON format - parse and return enhanced response with file info
    let parsedData = data;
    try {
      // If data is a stringified JSON, parse it
      if (typeof data === "string") {
        // Handle NaN values and other special cases before parsing
        let cleanedData = data
          .replace(/:\s*NaN\s*([,\}])/g, ": null$1") // Replace NaN with null
          .replace(/:\s*Infinity\s*([,\}])/g, ": null$1") // Replace Infinity with null
          .replace(/:\s*-Infinity\s*([,\}])/g, ": null$1"); // Replace -Infinity with null

        parsedData = JSON.parse(cleanedData);
      }
    } catch (error) {
      console.warn("Failed to parse JSON data:", error.message);
      // Try alternative parsing - split by lines and reconstruct
      try {
        if (typeof data === "string" && data.includes('"nodata":NaN')) {
          console.log("Attempting alternative JSON parsing...");
          // Use eval in a safe context as last resort (only for known openEO responses)
          const safeEval = new Function(
            "return " + data.replace(/NaN/g, "null")
          );
          parsedData = safeEval();
          console.log("Alternative parsing successful");
        } else {
          parsedData = data; // fallback to original data
        }
      } catch (evalError) {
        console.warn("Alternative parsing also failed:", evalError.message);
        parsedData = data; // final fallback to original data
      }
    }

    // Transform DEM data into user-friendly format
    const transformedData = transformDemData(parsedData);

    const response = {
      success: true,
      // User-friendly format: array of {x, y, elevation} points
      ...(transformedData && {
        elevationPoints: transformedData.points,
        statistics: transformedData.statistics,
        metadata: transformedData.metadata,
      }),
      // Original raw data (optional, for advanced users)
      rawData: parsedData,
      ...(savedFile?.success && {
        savedFile: {
          filename: savedFile.filename,
          downloadUrl: savedFile.downloadUrl,
          metadata: savedFile.metadata,
        },
      }),
    };

    return res.json(response);
  } catch (error) {
    console.error("Error in DEM clip endpoint:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", message: error.message });
  }
});

// GET /dem/files → list all saved DEM files
router.get("/files", async (req, res) => {
  try {
    const files = fileStorageService.listDemFiles();
    return res.json({
      total: files.length,
      files,
    });
  } catch (error) {
    console.error("Error listing DEM files:", error);
    return res.status(500).json({ error: "Failed to list files" });
  }
});

// GET /dem/files/:filename → download a specific saved file
router.get("/files/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const fileInfo = fileStorageService.getDemFile(filename);

    if (!fileInfo || !fileInfo.exists) {
      return res.status(404).json({ error: "File not found" });
    }

    const { filePath, metadata } = fileInfo;
    const extension = path.extname(filename).toLowerCase();

    // Set appropriate headers based on file type
    if (extension === ".tiff") {
      res.setHeader("Content-Type", "image/tiff");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    } else if (extension === ".png") {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `inline; filename=${filename}`);
    } else if (extension === ".json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    }

    // Add metadata headers
    if (metadata) {
      res.setHeader("X-DEM-Product", metadata.product || "unknown");
      res.setHeader("X-DEM-Format", metadata.format || "unknown");
      res.setHeader("X-DEM-Timestamp", metadata.timestamp || "unknown");
    }

    return res.sendFile(filePath);
  } catch (error) {
    console.error("Error downloading DEM file:", error);
    return res.status(500).json({ error: "Failed to download file" });
  }
});

// DELETE /dem/files/:filename → delete a specific saved file
router.delete("/files/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    const result = fileStorageService.deleteDemFile(filename);

    if (!result.success) {
      return res
        .status(404)
        .json({ error: "File not found or could not be deleted" });
    }

    return res.json({ message: `File ${filename} deleted successfully` });
  } catch (error) {
    console.error("Error deleting DEM file:", error);
    return res.status(500).json({ error: "Failed to delete file" });
  }
});

// TODO: POST /dem/job and GET /dem/job/:job_id for async processing if needed

export default router;
