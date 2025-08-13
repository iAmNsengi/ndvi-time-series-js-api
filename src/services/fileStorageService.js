import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileStorageService {
  constructor() {
    // Create storage directories
    this.baseDir = path.join(__dirname, "../../storage");
    this.demDir = path.join(this.baseDir, "dem");
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [this.baseDir, this.demDir];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created storage directory: ${dir}`);
      }
    });
  }

  generateFilename(format, coordinates) {
    const timestamp = new Date().toISOString().replace(/[:.-]/g, "_");
    const bbox = this.getBboxFromCoordinates(coordinates);
    const extension = this.getFileExtension(format);

    // Create a readable filename with timestamp and bbox info
    const bboxStr = `${bbox.west.toFixed(3)}_${bbox.south.toFixed(
      3
    )}_${bbox.east.toFixed(3)}_${bbox.north.toFixed(3)}`;
    return `dem_${timestamp}_bbox_${bboxStr}${extension}`;
  }

  getFileExtension(format) {
    const extensions = {
      GTiff: ".tiff",
      PNG: ".png",
      JSON: ".json",
    };
    return extensions[format] || ".bin";
  }

  getBboxFromCoordinates(coordinates) {
    const ring = coordinates?.[0] || [];
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

  async saveDemFile(data, format, coordinates, product = "GLO-30") {
    try {
      const filename = this.generateFilename(format, coordinates);
      const filePath = path.join(this.demDir, filename);

      // Create metadata
      const metadata = {
        filename,
        format,
        product,
        coordinates,
        bbox: this.getBboxFromCoordinates(coordinates),
        timestamp: new Date().toISOString(),
        fileSize:
          data.byteLength ||
          (typeof data === "string"
            ? data.length
            : JSON.stringify(data).length),
      };

      // Save the file
      if (format === "JSON") {
        // For JSON, save as formatted JSON
        const jsonData =
          typeof data === "string" ? data : JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonData, "utf8");
      } else {
        // For binary data (GTiff, PNG)
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        fs.writeFileSync(filePath, buffer);
      }

      // Save metadata file
      const metadataPath = path.join(this.demDir, `${filename}.meta.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

      console.log(`Saved DEM file: ${filename} (${metadata.fileSize} bytes)`);

      return {
        success: true,
        filename,
        filePath,
        metadata,
        relativePath: `/storage/dem/${filename}`,
        downloadUrl: `/api/storage/dem/${filename}`,
      };
    } catch (error) {
      console.error("Error saving DEM file:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  listDemFiles() {
    try {
      if (!fs.existsSync(this.demDir)) {
        return [];
      }

      const files = fs
        .readdirSync(this.demDir)
        .filter((file) => !file.endsWith(".meta.json"))
        .map((filename) => {
          const filePath = path.join(this.demDir, filename);
          const metadataPath = path.join(this.demDir, `${filename}.meta.json`);

          let metadata = {};
          if (fs.existsSync(metadataPath)) {
            metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
          }

          const stats = fs.statSync(filePath);

          return {
            filename,
            ...metadata,
            actualFileSize: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            downloadUrl: `/api/storage/dem/${filename}`,
          };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created)); // newest first

      return files;
    } catch (error) {
      console.error("Error listing DEM files:", error);
      return [];
    }
  }

  getDemFile(filename) {
    try {
      const filePath = path.join(this.demDir, filename);
      const metadataPath = path.join(this.demDir, `${filename}.meta.json`);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      let metadata = {};
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      }

      return {
        filePath,
        metadata,
        exists: true,
      };
    } catch (error) {
      console.error("Error getting DEM file:", error);
      return null;
    }
  }

  deleteDemFile(filename) {
    try {
      const filePath = path.join(this.demDir, filename);
      const metadataPath = path.join(this.demDir, `${filename}.meta.json`);

      let deleted = false;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
      }

      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }

      return { success: deleted, filename };
    } catch (error) {
      console.error("Error deleting DEM file:", error);
      return { success: false, error: error.message };
    }
  }
}

export default new FileStorageService();
