# NDVI Timeseries API

A REST API for calculating NDVI (Normalized Difference Vegetation Index) timeseries data using OpenEO and Sentinel-2 satellite imagery.

## Features

- Calculate NDVI timeseries for specified geographic areas
- Uses Sentinel-2 L2A data (B04 and B08 bands)
- Supports custom date ranges and polygon coordinates
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


## Error Handling

The API returns appropriate HTTP status codes:

- `200`: Success
- `400`: Validation error (check request format)
- `500`: Internal server error


## Project Structure

```
js/
├── src/
│   ├── app.js              # Main application file
│   ├── config.js           # Configuration and environment variables
│   ├── routes/
│   │   └── ndviRoutes.js   # API route definitions
│   ├── services/
│   │   └── openeoService.js # OpenEO integration service
│   └── validation/
│       └── schema.js       # Request validation schemas
├── package.json
├── Dockerfile
└── README.md
```
