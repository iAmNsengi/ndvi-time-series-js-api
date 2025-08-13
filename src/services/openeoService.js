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

  collectionFromProduct(product) {
    // Default hardcoded IDs (used by some providers like Earth Engine driver)
    const defaultMap = {
      "GLO-30": "COPERNICUS/DEM/GLO-30",
      "GLO-90": "COPERNICUS/DEM/GLO-90",
      "EEA-10": "COPERNICUS/DEM/EEA-10",
    };
    return defaultMap[product] || defaultMap["GLO-30"];
  }

  async resolveDemCollectionId(product, token) {
    // Try provider-specific discovery to avoid 404 CollectionNotFound
    try {
      const resp = await axios.get(`${this.baseURL}/collections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = resp.data.collections || [];
      const want =
        product === "GLO-90" ? "90" : product === "EEA-10" ? "10" : "30";

      // Log all collections to see what's available
      console.log(`Available collections (${list.length} total):`);
      list.forEach((c, i) => {
        if (i < 20) {
          // Log first 20 collections
          console.log(`  ${i + 1}. ${c.id} - ${c.title || "No title"}`);
        }
      });
      if (list.length > 20) {
        console.log(`  ... and ${list.length - 20} more collections`);
      }

      // Look for DEM collections with broader search terms
      const demCandidates = list.filter((c) => {
        const id = (c.id || "").toLowerCase();
        const title = (c.title || "").toLowerCase();
        return (
          id.includes("dem") ||
          title.includes("dem") ||
          id.includes("elevation") ||
          title.includes("elevation") ||
          id.includes("copernicus") ||
          title.includes("copernicus") ||
          id.includes("srtm") ||
          title.includes("srtm")
        );
      });

      console.log(`Found ${demCandidates.length} potential DEM collections:`);
      demCandidates.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.id} - ${c.title || "No title"}`);
      });

      // If we found DEM candidates, pick the first one
      if (demCandidates.length > 0) {
        const chosen = demCandidates[0].id;
        console.log(`Resolved DEM collection for ${product}: ${chosen}`);
        return chosen;
      }

      // If no DEM collections found, try some common Earth Engine DEM collection names
      const commonDemIds = [
        "USGS/SRTMGL1_003",
        "NASA/NASADEM_HGT/001",
        "JAXA/ALOS/AW3D30/V3_2",
        "MERIT/DEM/v1_0_3",
        "COPERNICUS/DEM/GLO-30",
      ];

      console.log(
        `No DEM collections found in discovery. Trying common Earth Engine DEM: ${commonDemIds[0]}`
      );
      return commonDemIds[0];
    } catch (err) {
      console.warn(
        `Failed to list collections (${err.message}). Using SRTM fallback.`
      );
      // Try a different Earth Engine DEM collection that's more commonly available
      return "USGS/SRTMGL1_003"; // SRTM is commonly available in Earth Engine
    }
  }

  bboxFromPolygon(polygon) {
    // polygon: [[[lon, lat], ...]] (first ring)
    const ring = polygon?.[0] || [];
    let west = Infinity,
      south = Infinity,
      east = -Infinity,
      north = -Infinity;
    for (const [lon, lat] of ring) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
    return { west, south, east, north };
  }

  async getDEMCutout(coordinates, product = "GLO-30", format = "GTiff") {
    try {
      const token = await this.getAccessToken();
      const collectionId = await this.resolveDemCollectionId(product, token);
      const bbox = this.bboxFromPolygon(coordinates);

      const processGraph = {
        load: {
          process_id: "load_collection",
          arguments: {
            id: collectionId,
            spatial_extent: bbox,
          },
        },
        save: {
          process_id: "save_result",
          arguments: {
            data: { from_node: "load" },
            format,
          },
          result: true,
        },
      };

      const response = await axios.post(
        `${this.baseURL}/result`,
        { process: { process_graph: processGraph } },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          responseType: format === "GTiff" ? "arraybuffer" : "json",
        }
      );

      return response.data;
    } catch (error) {
      console.error("Error getting DEM cutout:", error.message);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }
      throw new Error("Failed to get DEM cutout from OpenEO");
    }
  }
}

export default new OpenEOService();
