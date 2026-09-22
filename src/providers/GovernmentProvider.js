import { PlaceProvider } from "./PlaceProvider.js";

export class GovernmentProvider extends PlaceProvider {
  constructor({ endpoint } = {}) {
    super();
    this.endpoint = endpoint;
  }

  async getPlaces() {
    if (!this.endpoint) return [];
    const response = await fetch(this.endpoint);
    const payload = await response.json();
    return this.normalize(payload);
  }

  normalize(payload) {
    const records = Array.isArray(payload) ? payload : payload?.features || [];
    return records
      .map((record) => {
        const properties = record.properties || record;
        const coordinates = record.geometry?.coordinates;
        const longitude = properties.longitude ?? coordinates?.[0];
        const latitude = properties.latitude ?? coordinates?.[1];
        if (!latitude || !longitude) return null;
        return {
          id: `government:${properties.id || properties.name}`,
          name: properties.name,
          type: "government",
          category: properties.category || "官公庁",
          address: properties.address,
          latitude: Number(latitude),
          longitude: Number(longitude),
          website: properties.website,
          description: properties.description,
          source: "GovernmentProvider",
        };
      })
      .filter(Boolean);
  }
}
