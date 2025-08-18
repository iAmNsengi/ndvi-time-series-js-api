import Joi from "joi";

// Coordinate validation: [longitude, latitude]
const coordinateSchema = Joi.array().items(Joi.number()).length(2);

// Linear ring validation: array of coordinate pairs
const linearRingSchema = Joi.array().items(coordinateSchema).min(3);

// NDVI request schema
const ndviRequestSchema = Joi.object({
  start_date: Joi.date().required(),
  end_date: Joi.date().required(),
  coordinates: Joi.array().items(linearRingSchema).required(),
}).custom((value, helpers) => {
  const { start_date, end_date } = value;

  if (start_date && end_date && start_date > end_date) {
    return helpers.error("any.invalid", {
      message: "start_date must be earlier than or equal to end_date",
    });
  }

  return value;
}, "date-order-validation");

// DEM request schema - only JSON format supported, no file storage
const demRequestSchema = Joi.object({
  coordinates: Joi.array().items(linearRingSchema).required(),
  product: Joi.string().valid("GLO-30", "GLO-90", "EEA-10").default("GLO-30"),
}).messages({
  "any.required": "Missing required field",
});

export {
  ndviRequestSchema,
  demRequestSchema,
  coordinateSchema,
  linearRingSchema,
};
