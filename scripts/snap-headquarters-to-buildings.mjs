import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(projectRoot, "src", "data", "nikkei225Headquarters.js");
const overpassUrl = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const searchRadiusMeters = 90;
const maxSnapDistanceMeters = 45;
const batchSize = 18;

const originalSource = await fs.readFile(dataPath, "utf8");
const sourceDate = originalSource.match(/Source date: ([^.]+)\./)?.[1] || new Date().toISOString().slice(0, 10);
const moduleUrl = `${pathToFileURL(dataPath).href}?refresh=${Date.now()}`;
const { NIKKEI_225_HEADQUARTERS } = await import(moduleUrl);
const entries = Object.entries(NIKKEI_225_HEADQUARTERS);
let snappedCount = 0;
let unchangedCount = 0;

for (let offset = 0; offset < entries.length; offset += batchSize) {
  const batch = entries.slice(offset, offset + batchSize);
  const query = buildQuery(batch);
  const elements = await fetchOverpass(query);
  const footprints = elements
    .filter((element) => element.type === "way" && element.geometry?.length >= 4)
    .map((element) => element.geometry.map(({ lat, lon }) => ({ lat, lon })));

  for (const [code, headquarters] of batch) {
    const origin = {
      lat: headquarters.addressLatitude ?? headquarters.latitude,
      lon: headquarters.addressLongitude ?? headquarters.longitude,
    };
    const nearest = findNearestFootprint(origin, footprints);

    headquarters.addressLatitude = origin.lat;
    headquarters.addressLongitude = origin.lon;
    if (nearest && nearest.distance <= maxSnapDistanceMeters) {
      const interior = findInteriorPoint(nearest.polygon, origin);
      if (interior) {
        headquarters.latitude = roundCoordinate(interior.lat);
        headquarters.longitude = roundCoordinate(interior.lon);
        headquarters.locationPrecision = "building";
        snappedCount += 1;
        continue;
      }
    }

    headquarters.latitude = origin.lat;
    headquarters.longitude = origin.lon;
    headquarters.locationPrecision = "address";
    unchangedCount += 1;
  }

  console.log(`Processed ${Math.min(offset + batch.length, entries.length)}/${entries.length}`);
  if (offset + batchSize < entries.length) await delay(850);
}

const header = `// Generated from the Financial Services Agency EDINET code list, GSI address search,\n// and nearby OpenStreetMap building footprints.\n// Source date: ${sourceDate}. Run scripts/update-headquarters.ps1, then this script, to refresh.\nexport const NIKKEI_225_HEADQUARTERS = `;
await fs.writeFile(dataPath, `${header}${JSON.stringify(NIKKEI_225_HEADQUARTERS, null, 2)};\n`, "utf8");
console.log(`Snapped ${snappedCount} headquarters to buildings; kept ${unchangedCount} address points.`);

function buildQuery(batch) {
  const statements = batch
    .map(([, item]) => {
      const lat = item.addressLatitude ?? item.latitude;
      const lon = item.addressLongitude ?? item.longitude;
      return `way(around:${searchRadiusMeters},${lat},${lon})["building"];`;
    })
    .join("\n");
  return `[out:json][timeout:60];\n(\n${statements}\n);\nout geom;`;
}

async function fetchOverpass(query) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(overpassUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "CorporationMap headquarters updater",
      },
      body: new URLSearchParams({ data: query }),
    });

    if (response.ok) {
      const payload = await response.json();
      return payload.elements || [];
    }

    if (attempt === 4 || ![429, 502, 503, 504].includes(response.status)) {
      throw new Error(`Overpass API returned ${response.status}: ${await response.text()}`);
    }
    await delay(attempt * 2500);
  }
  return [];
}

function findNearestFootprint(origin, footprints) {
  let best = null;
  for (const polygon of footprints) {
    const distance = pointInPolygon(origin, polygon) ? 0 : distanceToPolygon(origin, polygon);
    if (!best || distance < best.distance) best = { polygon, distance };
  }
  return best;
}

function findInteriorPoint(polygon, origin) {
  const bounds = polygon.reduce(
    (result, point) => ({
      minLat: Math.min(result.minLat, point.lat),
      maxLat: Math.max(result.maxLat, point.lat),
      minLon: Math.min(result.minLon, point.lon),
      maxLon: Math.max(result.maxLon, point.lon),
    }),
    { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity },
  );
  const candidates = [
    origin,
    {
      lat: (bounds.minLat + bounds.maxLat) / 2,
      lon: (bounds.minLon + bounds.maxLon) / 2,
    },
  ];

  const gridSize = 15;
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      candidates.push({
        lat: bounds.minLat + ((y + 0.5) / gridSize) * (bounds.maxLat - bounds.minLat),
        lon: bounds.minLon + ((x + 0.5) / gridSize) * (bounds.maxLon - bounds.minLon),
      });
    }
  }

  return candidates
    .filter((candidate) => pointInPolygon(candidate, polygon))
    .map((candidate) => ({ candidate, clearance: distanceToPolygon(candidate, polygon) }))
    .sort((a, b) => b.clearance - a.clearance)[0]?.candidate;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(point, polygon) {
  let minimum = Infinity;
  for (let index = 0; index < polygon.length - 1; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, polygon[index], polygon[index + 1]));
  }
  return minimum;
}

function distanceToSegment(point, start, end) {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = metersPerDegreeLat * Math.cos((point.lat * Math.PI) / 180);
  const px = 0;
  const py = 0;
  const ax = (start.lon - point.lon) * metersPerDegreeLon;
  const ay = (start.lat - point.lat) * metersPerDegreeLat;
  const bx = (end.lon - point.lon) * metersPerDegreeLon;
  const by = (end.lat - point.lat) * metersPerDegreeLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function roundCoordinate(value) {
  return Number(value.toFixed(7));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
