export const TERRITORY_DEFAULTS = Object.freeze({
  closeThresholdMeters: 10,
  recentPointExclusion: 20,
  minimumAreaSquareMeters: 25,
  minimumHistoricSegmentGap: 3,
  minimumHistoricTrailPoints: 5,
});

export function detectSelfClosure(turfApi, coordinates, options = {}) {
  const config = { ...TERRITORY_DEFAULTS, ...options };
  if (coordinates.length < config.recentPointExclusion + 3) return null;

  const eligibleCoordinates = coordinates.slice(0, -config.recentPointExclusion);
  if (eligibleCoordinates.length < 2) return null;

  const currentCoordinate = coordinates.at(-1);
  const contact = nearestPointOnCoordinates(turfApi, eligibleCoordinates, currentCoordinate);
  if (!contact || contact.distanceMeters > config.closeThresholdMeters) return null;

  const ring = closeRing([
    contact.coordinate,
    ...coordinates.slice(contact.segmentIndex + 1),
    contact.coordinate,
  ]);
  const territory = createTerritory(turfApi, ring, config.minimumAreaSquareMeters);
  if (!territory) return null;

  return {
    ...territory,
    contact,
    kind: "self",
  };
}

export function findNearestTrackContact(turfApi, coordinate, tracks, thresholdMeters) {
  let nearest = null;

  for (const track of tracks) {
    if (!track?.id || !Array.isArray(track.coordinates) || track.coordinates.length < 2) continue;
    const contact = nearestPointOnCoordinates(turfApi, track.coordinates, coordinate);
    if (!contact || contact.distanceMeters > thresholdMeters) continue;
    if (!nearest || contact.distanceMeters < nearest.distanceMeters) {
      nearest = {
        ...contact,
        trackId: track.id,
      };
    }
  }

  return nearest;
}

export function detectHistoricClosure(turfApi, trailCoordinates, track, anchor, contact, options = {}) {
  const config = { ...TERRITORY_DEFAULTS, ...options };
  if (!anchor || !contact || anchor.trackId !== contact.trackId || anchor.trackId !== track?.id) return null;
  if (trailCoordinates.length - anchor.trailIndex < config.minimumHistoricTrailPoints) return null;
  if (Math.abs(contact.segmentIndex - anchor.segmentIndex) < config.minimumHistoricSegmentGap) return null;

  const historicReturnPath = getHistoricReturnPath(
    track.coordinates,
    anchor.segmentIndex,
    contact.segmentIndex,
  );
  const ring = closeRing([
    anchor.coordinate,
    ...trailCoordinates.slice(anchor.trailIndex + 1),
    contact.coordinate,
    ...historicReturnPath,
    anchor.coordinate,
  ]);
  const territory = createTerritory(turfApi, ring, config.minimumAreaSquareMeters);
  if (!territory) return null;

  return {
    ...territory,
    contact,
    kind: "historic",
  };
}

export function distanceMeters(turfApi, from, to) {
  return turfApi.distance(turfApi.point(from), turfApi.point(to), { units: "meters" });
}

function nearestPointOnCoordinates(turfApi, coordinates, coordinate) {
  try {
    const nearest = turfApi.nearestPointOnLine(
      turfApi.lineString(coordinates),
      turfApi.point(coordinate),
      { units: "meters" },
    );
    const properties = nearest.properties || {};
    return {
      coordinate: nearest.geometry.coordinates,
      distanceMeters: properties.pointDistance ?? properties.dist,
      segmentIndex: properties.segmentIndex ?? properties.index ?? 0,
    };
  } catch {
    return null;
  }
}

function createTerritory(turfApi, rawRing, minimumAreaSquareMeters) {
  const ring = closeRing(rawRing);
  if (ring.length < 4 || countUniqueCoordinates(ring) < 3) return null;

  try {
    const feature = turfApi.polygon([ring]);
    const areaSquareMeters = turfApi.area(feature);
    if (!Number.isFinite(areaSquareMeters) || areaSquareMeters < minimumAreaSquareMeters) return null;
    return { ring, areaSquareMeters };
  } catch {
    return null;
  }
}

function getHistoricReturnPath(coordinates, anchorSegmentIndex, contactSegmentIndex) {
  if (contactSegmentIndex > anchorSegmentIndex) {
    return coordinates.slice(anchorSegmentIndex + 1, contactSegmentIndex + 1).reverse();
  }
  return coordinates.slice(contactSegmentIndex + 1, anchorSegmentIndex + 1);
}

function closeRing(coordinates) {
  const deduped = [];
  for (const coordinate of coordinates) {
    if (!isCoordinate(coordinate)) continue;
    if (!deduped.length || !coordinatesEqual(deduped.at(-1), coordinate)) {
      deduped.push([Number(coordinate[0]), Number(coordinate[1])]);
    }
  }
  if (deduped.length && !coordinatesEqual(deduped[0], deduped.at(-1))) {
    deduped.push([...deduped[0]]);
  }
  return deduped;
}

function countUniqueCoordinates(coordinates) {
  return new Set(coordinates.slice(0, -1).map(([longitude, latitude]) => `${longitude},${latitude}`)).size;
}

function coordinatesEqual(first, second) {
  return first[0] === second[0] && first[1] === second[1];
}

function isCoordinate(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  );
}
