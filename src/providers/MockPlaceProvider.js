import { mockPlaces } from "../data/mockPlaces.js";
import { PlaceProvider } from "./PlaceProvider.js";

export class MockPlaceProvider extends PlaceProvider {
  async getPlaces() {
    return mockPlaces;
  }
}
