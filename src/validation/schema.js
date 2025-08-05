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

export { ndviRequestSchema, coordinateSchema, linearRingSchema };
