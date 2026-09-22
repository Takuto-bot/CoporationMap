export class PlaceService {
  constructor({ providers }) {
    this.providers = providers;
    this.staticProviders = providers.filter((provider) => !provider.isDynamic);
    this.dynamicProviders = providers.filter((provider) => provider.isDynamic);
    this.cache = null;
  }

  async getPlaces(options = {}) {
    const staticPlaces = await this.loadPlaces();
    const dynamicPlaces = await this.loadDynamicPlaces(options);
    const places = uniquePlaces([...staticPlaces, ...dynamicPlaces]);
    return this.applyOptions(places, options);
  }

  searchPlaces(query, options = {}) {
    if (!query || !this.cache) return [];
    const normalizedQuery = normalize(query);
    const scored = this.applyOptions(this.cache, options)
      .map((place) => ({
        place,
        score: getSearchScore(place, normalizedQuery),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name, "ja"));

    return scored.slice(0, options.limit || 10).map((item) => item.place);
  }

  async loadPlaces() {
    if (this.cache) return this.cache;
    const providerResults = await Promise.all(this.staticProviders.map((provider) => safeGetPlaces(provider)));
    this.cache = uniquePlaces(providerResults.flat());
    return this.cache;
  }

  async loadDynamicPlaces(options) {
    if (!this.dynamicProviders.length) return [];
    const providerResults = await Promise.all(
      this.dynamicProviders.map((provider) => safeGetPlaces(provider, options)),
    );
    return providerResults.flat();
  }

  applyOptions(places, options) {
    const bounds = options.bounds;
    const filters = options.filters || {};
    const normalizedQuery = normalize(options.query || "");

    return places.filter((place) => {
      if (filters.type && filters.type !== "all" && place.type !== filters.type) return false;
      if (filters.headquartersOnly && !place.headquarters) return false;
      if (bounds && !bounds.contains([place.latitude, place.longitude])) return false;
      if (normalizedQuery && getSearchScore(place, normalizedQuery) === 0) return false;
      return true;
    });
  }
}

async function safeGetPlaces(provider, options) {
  try {
    return await provider.getPlaces(options);
  } catch (error) {
    console.warn(`Place provider failed: ${provider.constructor.name}`, error);
    return [];
  }
}

function uniquePlaces(places) {
  const deduped = new Map();
  places.forEach((place) => {
    deduped.set(place.id, place);
  });
  return [...deduped.values()];
}

function getSearchScore(place, normalizedQuery) {
  if (!normalizedQuery) return 1;
  const fields = [
    place.name,
    place.category,
    place.address,
    place.description,
    place.corporateNumber,
    place.stockCode,
    place.searchAliases,
  ]
    .filter(Boolean)
    .map(normalize);

  if (normalize(place.name).startsWith(normalizedQuery)) return 12;
  if (fields.some((field) => field.includes(normalizedQuery))) return 8;

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (queryTokens.length && queryTokens.every((token) => fields.some((field) => field.includes(token)))) {
    return 5;
  }
  return 0;
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}
