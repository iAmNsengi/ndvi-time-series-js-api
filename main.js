// --- Initialize the Leaflet map ---
// This creates a map centered on Spain (latitude 40.4637, longitude -3.7492) with zoom level 6
const map = L.map("map").setView([40.4637, -3.7492], 6);

// Add OpenStreetMap tiles as the map background
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// --- Enable drawing polygons on the map ---
// Create a layer group to store drawn items (parcels)
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Add drawing controls to the map (only allow polygons)
const drawControl = new L.Control.Draw({
  draw: {
    polygon: true, // Allow drawing polygons (for parcels)
    marker: false, // Disable marker tool
    polyline: false, // Disable polyline tool
    rectangle: false, // Disable rectangle tool
    circle: false, // Disable circle tool
    circlemarker: false, // Disable circle marker tool
  },
  edit: {
    featureGroup: drawnItems, // Allow editing/deleting drawn polygons
  },
});
map.addControl(drawControl);

// Listen for when a polygon is created on the map
map.on(L.Draw.Event.CREATED, function (event) {
  const layer = event.layer; // The drawn polygon layer
  drawnItems.clearLayers(); // Only keep one parcel at a time
  drawnItems.addLayer(layer); // Add the new polygon to the map

  // Get coordinates of the polygon (as an array of [lat, lng] pairs)
  const coords = layer
    .getLatLngs()[0]
    .map((latlng) => [latlng.lat, latlng.lng]);

  // Show coordinates in the Parcel Info panel
  updateParcelInfo({ coordinates: coords });

  // --- NEW: Fetch NDVI from openEO for the drawn polygon ---
  fetchNDVIFromOpenEO(coords);
});

// --- SIGPAC and openEO Integration ---

// Update the Parcel Info panel to show ownership
function updateParcelInfo(parcelData) {
  const details = document.getElementById("parcel-details");
  if (!parcelData || !parcelData.coordinates) {
    details.textContent = "Parcel info will appear here.";
    return;
  }
  let html =
    "<b>Coordinates:</b><br>" +
    parcelData.coordinates
      .map((c) => `Lat: ${c[0].toFixed(5)}, Lng: ${c[1].toFixed(5)}`)
      .join("<br>");
  if (parcelData.ownership) {
    html += `<br><b>Ownership:</b> ${parcelData.ownership}`;
  }
  details.innerHTML = html;
}

// Google Earth Engine openEO API Configuration
const EARTH_ENGINE_BASE_URL = "https://earthengine.openeo.org/v1.0";
const EARTH_ENGINE_CREDENTIALS = btoa("group1:test123"); // Base64 encoded credentials

// Fetch NDVI from Google Earth Engine openEO API for a polygon (array of [lat, lng])
async function fetchNDVIFromOpenEO(coords) {
  // Calculate bounding box from polygon coordinates
  const lats = coords.map((c) => c[0]);
  const lngs = coords.map((c) => c[1]);
  const bbox = {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };

  // Build process graph for NDVI using Google Earth Engine
  const processGraph = {
    process_graph: {
      load: {
        process_id: "load_collection",
        arguments: {
          id: "COPERNICUS/S2_SR", // Sentinel-2 Surface Reflectance
          spatial_extent: bbox,
          temporal_extent: ["2023-06-01", "2023-06-30"], // Updated to more recent data
          bands: ["B04", "B08"], // Red and NIR bands
        },
      },
      ndvi: {
        process_id: "ndvi",
        arguments: {
          data: { from_node: "load" },
          red: "B04",
          nir: "B08",
        },
      },
      reduce: {
        process_id: "reduce_dimension",
        arguments: {
          data: { from_node: "ndvi" },
          dimension: "t",
          reducer: {
            process_graph: {
              mean: {
                process_id: "mean",
                arguments: {
                  data: { from_parameter: "data" },
                },
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
    },
  };

  // Send request directly to Google Earth Engine openEO API
  try {
    const response = await fetch(`${EARTH_ENGINE_BASE_URL}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${EARTH_ENGINE_CREDENTIALS}`,
      },
      body: JSON.stringify(processGraph),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch NDVI from Google Earth Engine: ${response.status} ${response.statusText}`
      );
    }

    const ndviData = await response.json();
    console.log("NDVI result from Google Earth Engine:", ndviData);
    updateNDVIChart(ndviData);
  } catch (err) {
    console.error("Error calculating NDVI:", err);

    // Fallback: try with a different collection or temporal extent
    try {
      console.log("Trying fallback NDVI calculation...");
      const fallbackResult = await calculateNDVIFallback(coords, bbox);
      updateNDVIChart(fallbackResult);
    } catch (fallbackErr) {
      console.error("Fallback NDVI calculation also failed:", fallbackErr);
      updateNDVIChart(undefined);
    }
  }
}

// Fallback NDVI calculation with different parameters
async function calculateNDVIFallback(coords, bbox) {
  // Try with Landsat 8 collection as fallback
  const fallbackProcessGraph = {
    process_graph: {
      load: {
        process_id: "load_collection",
        arguments: {
          id: "LANDSAT/LC08/C02/T1_L2", // Landsat 8 Surface Reflectance
          spatial_extent: bbox,
          temporal_extent: ["2023-01-01", "2023-12-31"], // Wider temporal extent
          bands: ["B04", "B05"], // Red and NIR bands for Landsat
        },
      },
      ndvi: {
        process_id: "ndvi",
        arguments: {
          data: { from_node: "load" },
          red: "B04",
          nir: "B05",
        },
      },
      reduce: {
        process_id: "reduce_dimension",
        arguments: {
          data: { from_node: "ndvi" },
          dimension: "t",
          reducer: {
            process_graph: {
              mean: {
                process_id: "mean",
                arguments: {
                  data: { from_parameter: "data" },
                },
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
    },
  };

  const response = await fetch(`${EARTH_ENGINE_BASE_URL}/result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${EARTH_ENGINE_CREDENTIALS}`,
    },
    body: JSON.stringify(fallbackProcessGraph),
  });

  if (!response.ok) {
    throw new Error(`Fallback NDVI calculation failed: ${response.status}`);
  }

  return await response.json();
}

// Update NDVI chart (simple example)
function updateNDVIChart(ndviData) {
  const ctx = document.getElementById("ndvi-chart").getContext("2d");

  // Extract NDVI value robustly
  let value = undefined;
  if (typeof ndviData === "number") {
    value = ndviData;
  } else if (Array.isArray(ndviData)) {
    // Find first number in array
    value = ndviData.find((v) => typeof v === "number");
  } else if (typeof ndviData === "object" && ndviData !== null) {
    // Try common keys
    if (typeof ndviData.ndvi === "number") {
      value = ndviData.ndvi;
    } else if (typeof ndviData.value === "number") {
      value = ndviData.value;
    } else if (Array.isArray(ndviData.data)) {
      value = ndviData.data.find((v) => typeof v === "number");
    } else {
      // Try to find first numeric value in object
      for (const v of Object.values(ndviData)) {
        if (typeof v === "number") {
          value = v;
          break;
        } else if (Array.isArray(v)) {
          const found = v.find((x) => typeof x === "number");
          if (typeof found === "number") {
            value = found;
            break;
          }
        }
      }
    }
  }

  // Log for debugging
  console.log(
    "updateNDVIChart: ndviData=",
    ndviData,
    ", extracted value=",
    value
  );

  // Remove any previous chart instance (to avoid overlay)
  if (window.ndviChart) window.ndviChart.destroy();

  // Draw the chart
  window.ndviChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["NDVI"],
      datasets: [
        {
          label: "NDVI",
          data: [value],
          backgroundColor: "green",
        },
      ],
    },
    options: {
      scales: {
        y: { min: -1, max: 1 },
      },
    },
  });
  document.getElementById("abandonment-indicator").textContent =
    "NDVI value: " + (typeof value === "number" ? value : "No data");
}

// Function to update abandonment indicator (to be implemented)
function updateAbandonmentIndicator(isAbandoned) {
  const indicator = document.getElementById("abandonment-indicator");
  if (isAbandoned) {
    indicator.textContent = "Warning: Possible land abandonment detected!";
  } else {
    indicator.textContent = "";
  }
}

// TODO: Add event listeners for map interaction and parcel selection (if needed)
