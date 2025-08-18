# Geospatial API (NDVI + DEM)

A REST API for calculating NDVI (Normalized Difference Vegetation Index) timeseries data and retrieving Digital Elevation Model (DEM) data using OpenEO and Sentinel-2 satellite imagery.

## Features

- Calculate NDVI timeseries for specified geographic areas
- Retrieve DEM (Digital Elevation Model) data for specified areas
- Uses Sentinel-2 L2A data (B04 and B08 bands) for NDVI
- Supports Copernicus DEM collections (GLO-30, GLO-90, EEA-10)
- JSON format only for all data responses
- Built with Express.js and OpenEO integration

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager

### Environment variables

```
OPENEO_API_URL=https://openeo.dataspace.copernicus.eu/openeo/1.0
OPENEO_CLIENT_ID=your_client_id
OPENEO_CLIENT_SECRET=your_client_secret
PORT=3000
NODE_ENV=development
```

## Running the API

```bash
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Health Check

```
GET /ndvi/health
```

Returns the API status and current timestamp.

### NDVI Timeseries

```
POST /ndvi/timeseries
```

Calculate NDVI timeseries for a specified area and date range.

#### Request Body

```json
{
  "start_date": "2020-01-01",
  "end_date": "2020-01-31",
  "coordinates": [
    [
      [5.055945487931457, 51.222709834076504],
      [5.064972484168688, 51.221122565090525],
      [5.067474954083448, 51.218249806779134],
      [5.064827929485983, 51.21689628072789],
      [5.05917785594747, 51.217191909908095],
      [5.053553857094518, 51.21807492332223],
      [5.055945487931457, 51.222709834076504]
    ]
  ]
}
```

#### Parameters

- `start_date`: Start date in YYYY-MM-DD format
- `end_date`: End date in YYYY-MM-DD format
- `coordinates`: Array of polygon coordinates in GeoJSON format (longitude, latitude pairs)

#### Response

Returns the NDVI timeseries data from OpenEO processing.

### DEM Data

```
POST /dem
```

Retrieve DEM (Digital Elevation Model) data for a specified area.

#### Request Body

```json
{
  "coordinates": [
    [
      [5.055945487931457, 51.222709834076504],
      [5.064972484168688, 51.221122565090525],
      [5.067474954083448, 51.218249806779134],
      [5.055945487931457, 51.222709834076504]
    ]
  ],
  "product": "GLO-30",
  "format": "JSON"
}
```

#### Parameters

- `coordinates`: Array of polygon coordinates in GeoJSON format (longitude, latitude pairs)
- `product`: DEM product type - "GLO-30" (default), "GLO-90", or "EEA-10"
- `format`: Output format - "JSON" only

#### Response

Returns elevation data in JSON format with:

- `elevationPoints`: Array of {x, y, elevation} coordinate points
- `statistics`: Summary statistics (min, max, mean, median, stddev)
- `metadata`: Grid information and coordinate bounds
- `rawData`: Original OpenEO response data

## Error Handling

The API returns appropriate HTTP status codes:

- `200`: Success
- `400`: Validation error (check request format)
- `500`: Internal server error

## Project Structure

```
leaflet-viewer/
├── src/
│   ├── app.js                    # Main application file
│   ├── config.js                 # Configuration and environment variables
│   ├── routes/
│   │   ├── ndviRoutes.js         # NDVI API route definitions
│   │   └── demRoutes.js          # DEM API route definitions
│   ├── services/
│   │   └── openeoService.js      # OpenEO integration service
│   └── validation/
│       └── schema.js             # Request validation schemas
├── docs/
│   └── openapi.yaml              # OpenAPI documentation
├── package.json
├── Dockerfile
└── README.md
```

## API Documentation

Interactive API documentation is available at `/docs` when the server is running.
