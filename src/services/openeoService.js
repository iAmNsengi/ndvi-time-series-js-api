import axios from "axios";
import config from "../config.js";

class OpenEOService {
  constructor() {
    this.baseURL = config.OPENEO_API_URL;
    this.clientId = config.OPENEO_CLIENT_ID;
    this.clientSecret = config.OPENEO_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      console.log("Connecting to OpenEO:", this.baseURL);

      const capabilitiesResponse = await axios.get(`${this.baseURL}/`);
      console.log("OpenEO capabilities:", capabilitiesResponse.data);

      // Use OAuth2 client credentials authentication with same scopes as Python library
      const tokenResponse = await axios.post(
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
        `grant_type=client_credentials&client_id=${this.clientId}&client_secret=${this.clientSecret}&scope=openid email profile user-context`,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      // Use the same token format as Python library (prepend oidc/CDSE/)
      this.accessToken = `oidc/CDSE/${tokenResponse.data.access_token}`;
      // Set expiry to 1 hour from now (minus 5 minutes buffer)
      this.tokenExpiry = Date.now() + 55 * 60 * 1000;

      console.log("OpenEO authentication successful!");
      return this.accessToken;
    } catch (error) {
      console.error("Error getting access token:", error.message);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }
      throw new Error("Failed to authenticate with OpenEO");
    }
  }

  loadFields(coordinates) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: coordinates,
          },
        },
      ],
    };
  }

  async getNDVITimeseries(coordinates, startDate, endDate) {
    try {
      const token = await this.getAccessToken();

      // Format dates to ISO string
      const startDateISO = new Date(startDate).toISOString().split("T")[0];
      const endDateISO = new Date(endDate).toISOString().split("T")[0];

      const fields = this.loadFields(coordinates);

      // Create the process graph for NDVI calculation (exact same as Python version)
      const processGraph = {
        loadcollection1: {
          process_id: "load_collection",
          arguments: {
            bands: ["B04", "B08"],
            id: "SENTINEL2_L2A",
            spatial_extent: null,
            temporal_extent: [startDateISO, endDateISO],
          },
        },
        reducedimension1: {
          process_id: "reduce_dimension",
          arguments: {
            data: { from_node: "loadcollection1" },
            dimension: "bands",
            reducer: {
              process_graph: {
                arrayelement1: {
                  process_id: "array_element",
                  arguments: {
                    data: { from_parameter: "data" },
                    index: 1,
                  },
                },
                arrayelement2: {
                  process_id: "array_element",
                  arguments: {
                    data: { from_parameter: "data" },
                    index: 0,
                  },
                },
                subtract1: {
                  process_id: "subtract",
                  arguments: {
                    x: { from_node: "arrayelement1" },
                    y: { from_node: "arrayelement2" },
                  },
                },
                add1: {
                  process_id: "add",
                  arguments: {
                    x: { from_node: "arrayelement1" },
                    y: { from_node: "arrayelement2" },
                  },
                },
                divide1: {
                  process_id: "divide",
                  arguments: {
                    x: { from_node: "subtract1" },
                    y: { from_node: "add1" },
                  },
                  result: true,
                },
              },
            },
          },
        },
        aggregatespatial1: {
          process_id: "aggregate_spatial",
          arguments: {
            data: { from_node: "reducedimension1" },
            geometries: fields,
            reducer: {
              process_graph: {
                mean1: {
                  process_id: "mean",
                  arguments: {
                    data: { from_parameter: "data" },
                  },
                  result: true,
                },
              },
            },
          },
          result: true,
        },
      };

      // Execute the process
      const response = await axios.post(
        `${this.baseURL}/result`,
        {
          process: {
            process_graph: processGraph,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("Error getting NDVI timeseries:", error.message);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error(
          "Response data:",
          JSON.stringify(error.response.data, null, 2)
        );
        console.error("Response headers:", error.response.headers);
      }
      throw new Error("Failed to get NDVI timeseries from OpenEO");
    }
  }
}

export default new OpenEOService();
