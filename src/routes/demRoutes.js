import express from "express";
import { demRequestSchema } from "../validation/schema.js";
import openeoService from "../services/openeoService.js";

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

// POST /dem/clip → JSON format only
router.post("/clip", validateDemRequest, async (req, res) => {
  try {
    const { coordinates, product } = req.body;

    const data = await openeoService.getDEMCutout(coordinates, product);

    // Parse JSON data
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
        // metadata: transformedData.metadata,
      }),
      // Original raw data (optional, for advanced users)
      rawData: parsedData,
    };

    return res.json(response);
  } catch (error) {
    console.error("Error in DEM clip endpoint:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", message: error.message });
  }
});

export default router;
