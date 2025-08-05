import dotenv from "dotenv";
dotenv.config();

const config = {
  OPENEO_API_URL: process.env.OPENEO_API_URL || "",
  OPENEO_CLIENT_ID: process.env.OPENEO_CLIENT_ID || "",
  OPENEO_CLIENT_SECRET: process.env.OPENEO_CLIENT_SECRET || "",
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
};

// api url must have proper protocol
if (config.OPENEO_API_URL && !config.OPENEO_API_URL.startsWith("http")) {
  config.OPENEO_API_URL = `https://${config.OPENEO_API_URL}`;
}

// Add the correct API endpoint (same as Python openeo library)
if (config.OPENEO_API_URL && !config.OPENEO_API_URL.includes("/openeo/")) {
  config.OPENEO_API_URL = `${config.OPENEO_API_URL}/openeo/1.0`;
}

// Validate required environment variables
const requiredEnvVars = [
  "OPENEO_API_URL",
  "OPENEO_CLIENT_ID",
  "OPENEO_CLIENT_SECRET",
];
const missingVars = requiredEnvVars.filter((varName) => !config[varName]);

if (missingVars.length > 0) {
  console.error("Missing required environment variables:", missingVars);
  process.exit(1);
}

export default config;
