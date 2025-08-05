import express from "express";
import { ndviRequestSchema } from "../validation/schema.js";
import openeoService from "../services/openeoService.js";

const router = express.Router();

// Middleware to validate request body
const validateRequest = (req, res, next) => {
  const { error, value } = ndviRequestSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: "Validation error",
      details: error.details.map((detail) => detail.message),
    });
  }

  req.body = value;
  next();
};

// POST /ndvi/timeseries
router.post("/timeseries", validateRequest, async (req, res) => {
  try {
    const { coordinates, start_date, end_date } = req.body;

    const result = await openeoService.getNDVITimeseries(
      coordinates,
      start_date,
      end_date
    );

    res.json(result);
  } catch (error) {
    console.error("Error in NDVI timeseries endpoint:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

export default router;
