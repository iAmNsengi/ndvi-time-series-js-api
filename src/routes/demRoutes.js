import express from "express";
import { demRequestSchema } from "../validation/schema.js";
import openeoService from "../services/openeoService.js";

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
    const { coordinates, product, format } = req.body;

    const data = await openeoService.getDEMCutout(coordinates, product, format);

    if (format === "GTiff") {
      res.setHeader("Content-Type", "image/tiff");
      return res.send(Buffer.from(data));
    }

    if (format === "PNG") {
      res.setHeader("Content-Type", "image/png");
      return res.send(Buffer.from(data));
    }

    // JSON or other formats
    return res.json(data);
  } catch (error) {
    console.error("Error in DEM clip endpoint:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", message: error.message });
  }
});

// TODO: POST /dem/job and GET /dem/job/:job_id for async processing if needed

export default router;
