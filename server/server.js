const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 4000;

// --- Copernicus OAuth2 credentials ---
const CLIENT_ID = "sh-daeffbe1-901c-4bc5-b415-0f22d18706f7";
const CLIENT_SECRET = "j9c14UD1VaC53GtlxCck4UhpEwWRKK9r";
const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

app.use(cors());
app.use(express.json());

// Helper: Get a fresh access token using client credentials
async function getAccessToken() {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", CLIENT_ID);
  params.append("client_secret", CLIENT_SECRET);
  const response = await axios.post(TOKEN_URL, params);
  return response.data.access_token;
}

app.post("/api/ndvi", async (req, res) => {
  try {
    // Log the incoming process graph
    console.log("Received NDVI process graph from frontend:", JSON.stringify(req.body, null, 2));
    // Get a fresh access token for each request
    let accessToken = await getAccessToken();
    // Extract only the JWT part if the token has a prefix (e.g., oidc/egi/)
    if (accessToken.includes("/")) {
      accessToken = accessToken.substring(accessToken.lastIndexOf("/") + 1);
    }
    console.log("Using JWT access token:", accessToken.substring(0, 30) + "... (truncated)");
    // Forward the NDVI process graph to openEO API
    const response = await axios.post(
      "https://openeo.dataspace.copernicus.eu/openeo/1.0/result",
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    console.log("openEO API response status:", response.status);
    res.status(response.status).json(response.data);
  } catch (err) {
    if (err.response) {
      console.error("Proxy error: openEO API response:", err.response.data);
    } else {
      console.error("Proxy error:", err.message);
    }
    res.status(err.response?.status || 500).json({
      error: "Proxy server error",
      details: err.response?.data || err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`openEO proxy server running at http://localhost:${PORT}`);
});
