import { PlaceProvider } from "./PlaceProvider.js";

export class OpenStreetMapProvider extends PlaceProvider {
  constructor({ overpassEndpoint = "https://overpass-api.de/api/interpreter" } = {}) {
    super();
    this.overpassEndpoint = overpassEndpoint;
    this.isDynamic = true;
  }

  async getPlaces({ bounds } = {}) {
    if (!bounds) return [];

    const bbox = [
      bounds.getSouth(),
      bounds.getWest(),
      bounds.getNorth(),
      bounds.getEast(),
    ].join(",");

    const query = `
      [out:json][timeout:18];
      (
        node["office"~"government|company"](${bbox});
        way["office"~"government|company"](${bbox});
        relation["office"~"government|company"](${bbox});
      );
      out center tags 80;
    `;

    const response = await fetch(this.overpassEndpoint, {
      method: "POST",
      body: query,
    });
    const payload = await response.json();
    return this.normalize(payload);
  }

  normalize(payload) {
    return (payload.elements || [])
      .map((element) => {
        const tags = element.tags || {};
        const lat = element.lat ?? element.center?.lat;
        const lon = element.lon ?? element.center?.lon;
        if (!lat || !lon || !tags.name) return null;
        return {
          id: `osm:${element.type}:${element.id}`,
          name: tags.name,
          type: mapOsmType(tags),
          category: tags.office || tags.amenity || "施設",
          address: [
            tags["addr:province"],
            tags["addr:city"],
            tags["addr:quarter"],
            tags["addr:block_number"],
            tags["addr:housenumber"],
          ]
            .filter(Boolean)
            .join(""),
          latitude: Number(lat),
          longitude: Number(lon),
          website: tags.website,
          description: tags.description,
          source: "OpenStreetMap",
        };
      })
      .filter(Boolean);
  }
}

function mapOsmType(tags) {
  if (tags.office === "government") return "government";
  return "company";
}
