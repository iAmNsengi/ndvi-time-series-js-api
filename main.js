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

// Fetch NDVI from openEO for a polygon (array of [lat, lng])
async function fetchNDVIFromOpenEO(coords) {
  const geojson = {
    type: "Polygon",
    coordinates: [coords.map(([lat, lng]) => [lng, lat])],
  };

  // Connect to openEO backend
  const con = await window.OpenEO.connect("https://openeo.cloud");

  // Authenticate using your personal access token
  await con.authenticateBasic(
    "user",
    "d5b3db689fd1235c38679acd4352130e619d2564910052d1026b0da91d2fa674"
  );

  // Build process: load Sentinel-2, filter by geometry, calculate NDVI
  const builder = await con.buildProcess();
  const datacube = builder.load_collection(
    "SENTINEL2_L2A",
    {
      west: Math.min(...coords.map((c) => c[1])),
      east: Math.max(...coords.map((c) => c[1])),
      south: Math.min(...coords.map((c) => c[0])),
      north: Math.max(...coords.map((c) => c[0])),
    },
    ["2023-01-01", "2023-12-31"],
    ["B04", "B08"]
  );
  const ndvi = builder.ndvi(datacube, { red: "B04", nir: "B08" });
  const zonal = builder.aggregate_spatial(ndvi, geojson, "mean");

  // Execute and get result
  const result = await con.computeResult(zonal);
  console.log("NDVI result from openEO:", result);

  updateNDVIChart(result);
}

// Update NDVI chart (simple example)
function updateNDVIChart(ndviData) {
  const ctx = document.getElementById("ndvi-chart").getContext("2d");

  // Extract NDVI value if needed
  let value = ndviData;
  if (Array.isArray(ndviData)) value = ndviData[0];
  if (typeof ndviData === "object" && ndviData !== null) {
    // Try common keys
    value = ndviData.ndvi || ndviData.value || Object.values(ndviData)[0];
  }

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
    "NDVI value: " + (value !== undefined ? value : "No data");
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
