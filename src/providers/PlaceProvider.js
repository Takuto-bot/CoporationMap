/**
 * Provider contract.
 *
 * A provider can use any upstream schema, but it must return normalized Place
 * objects to the UI layer. Add new data sources by implementing getPlaces()
 * and doing source-specific mapping inside the provider.
 */
export class PlaceProvider {
  isDynamic = false;

  async getPlaces() {
    throw new Error("PlaceProvider#getPlaces must be implemented");
  }
}
