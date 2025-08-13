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

      // Let's try to find actual DEM collections by testing known DEM collection IDs
      const knownDemIds = [
        "USGS/SRTMGL1_003", // SRTM 30m
        "CGIAR/SRTM90_V4", // SRTM 90m
        "NASA/NASADEM_HGT/001", // NASADEM
        "USGS/GMTED2010", // GMTED2010
        "NOAA/NGDC/ETOPO1", // ETOPO1
        "COPERNICUS/DEM/GLO-30", // Copernicus DEM
        "JAXA/ALOS/AW3D30/V3_2", // ALOS World 3D
      ];

      console.log(`Testing known DEM collection IDs...`);

      // Check which DEM collections exist
      for (const testId of knownDemIds) {
        const exists = list.some((c) => c.id === testId);
        if (exists) {
          console.log(`Found working DEM collection: ${testId}`);
          return testId;
        } else {
          console.log(`Collection ${testId} not in available collections`);
        }
      }

      // Look for any collections with DEM/elevation in the name (but filter out vegetation)
      const demCandidates = list.filter((c) => {
        const id = (c.id || "").toLowerCase();
        const title = (c.title || "").toLowerCase();
        const description = (c.description || "").toLowerCase();

        const hasDemKeywords =
          id.includes("dem") ||
          title.includes("dem") ||
          id.includes("elevation") ||
          title.includes("elevation") ||
          id.includes("height") ||
          title.includes("height") ||
          id.includes("srtm") ||
          title.includes("srtm") ||
          description.includes("elevation") ||
          description.includes("digital elevation");

        // Exclude vegetation/phenology collections
        const notVegetation =
          !id.includes("sosd") &&
          !id.includes("eosd") &&
          !id.includes("vegetation") &&
          !title.includes("vegetation") &&
          !description.includes("phenology") &&
          !description.includes("vegetation");

        return hasDemKeywords && notVegetation;
      });

      console.log(
        `Found ${demCandidates.length} potential DEM collections after filtering:`
      );
      demCandidates.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.id} - ${c.title || "No title"}`);
      });

      if (demCandidates.length > 0) {
        const chosen = demCandidates[0].id;
        console.log(`Using filtered DEM collection: ${chosen}`);
        return chosen;
      }

      console.log(
        `No valid DEM collections found. Using fallback: USGS/SRTMGL1_003`
      );
      return "USGS/SRTMGL1_003";
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

      console.log(
        `Building DEM process graph for collection: ${collectionId}, format: ${format}`
      );

      // Map format to openEO format names
      const formatMap = {
        GTiff: "GTiff",
        PNG: "PNG",
        JSON: "JSON",
      };
      const openeoFormat = formatMap[format] || "GTiff";

      // Start with simple process graph - just load and save
      let processGraph;

      if (format === "JSON") {
        // For JSON, try to get statistics
        processGraph = {
          load: {
            process_id: "load_collection",
            arguments: {
              id: collectionId,
              spatial_extent: bbox,
            },
          },
          reduce: {
            process_id: "reduce_dimension",
            arguments: {
              data: { from_node: "load" },
              dimension: "t", // reduce temporal dimension if it exists
              reducer: {
                process_graph: {
                  mean: {
                    process_id: "mean",
                    arguments: {
                      data: { from_parameter: "data" },
                    },
                    result: true,
                  },
                },
              },
            },
          },
          save: {
            process_id: "save_result",
            arguments: {
              data: { from_node: "reduce" },
              format: "JSON",
            },
            result: true,
          },
        };
      } else {
        // For binary formats, keep it simple
        processGraph = {
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
              format: openeoFormat,
            },
            result: true,
          },
        };
      }

      console.log("Process graph:", JSON.stringify(processGraph, null, 2));

      const response = await axios.post(
        `${this.baseURL}/result`,
        { process: { process_graph: processGraph } },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          responseType: format === "JSON" ? "json" : "arraybuffer",
        }
      );

      console.log(
        `DEM request successful. Response type: ${typeof response.data}, Size: ${
          response.data?.byteLength || "N/A"
        } bytes`
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

const eoService = new OpenEOService();
export default eoService;
