import { PlaceProvider } from "./PlaceProvider.js";

export class CompanyProvider extends PlaceProvider {
  constructor({ endpoint, apiKey } = {}) {
    super();
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  async getPlaces() {
    if (!this.endpoint) return [];

    const response = await fetch(this.endpoint, {
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
    });
    const payload = await response.json();
    return this.normalize(payload);
  }

  normalize(payload) {
    const records = Array.isArray(payload) ? payload : payload?.results || [];
    return records
      .filter((record) => record.latitude && record.longitude)
      .map((record) => ({
        id: `company:${record.corporate_number || record.id}`,
        name: record.name || record.corporate_name,
        type: "company",
        category: record.industry || "企業",
        address: record.address,
        latitude: Number(record.latitude),
        longitude: Number(record.longitude),
        website: record.website,
        description: record.description,
        source: "CompanyProvider",
        headquarters: Boolean(record.headquarters),
        corporateNumber: record.corporate_number,
        capital: record.capital,
        employees: record.employees,
      }));
  }
}
