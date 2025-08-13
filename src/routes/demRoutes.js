import express from "express";
import { demRequestSchema } from "../validation/schema.js";
import openeoService from "../services/openeoService.js";
import fileStorageService from "../services/fileStorageService.js";
import path from "path";

const router = express.Router();

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

    // JSON format - return enhanced response with file info
    const response = {
      data,
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
