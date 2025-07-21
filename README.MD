

## Project Summary: Interactive Parcel NDVI Explorer with openEO
### Project Goal
The goal was to create a web application that allows users to:
Draw a parcel (polygon) on a map of Spain
Instantly retrieve and visualize the NDVI (Normalized Difference Vegetation Index) for that area using the openEO API and Sentinel-2 satellite data
This enables users to explore land health and vegetation trends interactively, leveraging real satellite data.

### Technology Stack
Frontend: HTML, CSS, JavaScript
Map & Drawing: Leaflet.js and Leaflet.draw
Charting: Chart.js for NDVI visualization
Remote Sensing Data: openEO Platform (API for satellite data processing)
Authentication: openEO personal access token

### Key Features and How They Work
A. Interactive Map and Drawing
Leaflet.js displays a map centered on Spain.
Leaflet.draw adds drawing controls, allowing users to draw polygons (parcels) on the map.
When a polygon is drawn, its coordinates are extracted and displayed in the UI.
Code Example:
Apply to main.js
B. Displaying Parcel Information
When a polygon is drawn, its coordinates are shown in a dedicated info panel.
The updateParcelInfo function formats and displays these coordinates.
C. Fetching NDVI from openEO
openEO is a cloud platform that provides access to satellite data and processing.
When a polygon is drawn, the app:
Converts the polygon to GeoJSON format.
Connects to the openEO backend.
Authenticates using a personal access token (since OIDC login popups are not supported in the CDN JS client).
Builds a process graph to:
Load Sentinel-2 data for the area and time range.
Calculate NDVI using the red and near-infrared bands.
Aggregate the NDVI spatially over the drawn polygon (mean NDVI).
Executes the process and retrieves the NDVI result.
Code Example:
Apply to main.js
D. Visualizing NDVI
The NDVI value is displayed as a bar chart using Chart.js.
The value is also shown as text for clarity.
The chart is updated every time a new polygon is drawn.
Code Example:
Apply to main.js

### Authentication: Why and How
The openEO API requires authentication for data processing.
The CDN JS client does not support OIDC login popups.
Solution: Use a personal access token, which you generate from your openEO account 1.
The token is used with authenticateBasic("user", "TOKEN") in the code.


### Project Structure
index.html: Contains the map, info panels, and includes all required JS/CSS libraries.
style.css: Styles the map and info panels for a clean, modern look.
main.js: Contains all the logic for map interaction, NDVI fetching, and charting.

### How to Use the App (Demo Flow)
Open the web page.
Draw a polygon anywhere on the map of Spain.
Instantly see the coordinates in the info panel.
The app fetches the NDVI for the drawn area from openEO and displays it as a chart and as text.

### Why This Approach?
Leaflet.js is lightweight, open-source, and perfect for interactive mapping.
openEO provides a unified, cloud-based way to access and process satellite data, making it ideal for NDVI and other remote sensing indices.
Chart.js is simple and effective for quick data visualization.
Personal access tokens are the most reliable way to authenticate with openEO in browser-based apps.

### Further Improvements
Add time series NDVI (not just mean for a fixed year).
Allow users to select different satellite products or time ranges.
Add error handling and loading indicators for better UX.
Integrate SIGPAC search for official Spanish parcel lookup (already scaffolded in code).
