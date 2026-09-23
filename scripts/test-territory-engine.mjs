import assert from "node:assert/strict";
import "../src/vendor/turf.min.js";
import {
  detectHistoricClosure,
  detectSelfClosure,
  findNearestTrackContact,
} from "../src/services/TerritoryEngine.js";

const turf = globalThis.turf;
assert.ok(turf, "the vendored Turf.js bundle should expose its API");

const loop = [
  [-0.001, 0],
  [0, 0],
  [0.001, 0],
  [0.001, 0.001],
  [0, 0.001],
  [0.00001, 0.00001],
];
const selfClosure = detectSelfClosure(turf, loop, {
  recentPointExclusion: 2,
  closeThresholdMeters: 10,
  minimumAreaSquareMeters: 25,
});
assert.ok(selfClosure, "a return to an older segment should create a territory");
assert.equal(selfClosure.kind, "self");
assert.ok(selfClosure.areaSquareMeters > 10_000);
assert.deepEqual(selfClosure.ring[0], selfClosure.ring.at(-1));
assert.ok(
  !selfClosure.ring.some(([longitude, latitude]) => longitude === -0.001 && latitude === 0),
  "the path before the contacted segment must not be included",
);

const denseLoop = [
  ...Array.from({ length: 11 }, (_, index) => [index * 0.0001, 0]),
  ...Array.from({ length: 10 }, (_, index) => [0.001, (index + 1) * 0.0001]),
  ...Array.from({ length: 10 }, (_, index) => [0.001 - (index + 1) * 0.0001, 0.001]),
  ...Array.from({ length: 10 }, (_, index) => [0, 0.001 - (index + 1) * 0.0001]),
];
assert.ok(
  detectSelfClosure(turf, denseLoop),
  "the default 20-point exclusion should still detect an older trail contact",
);

const openPath = [
  [0, 0],
  [0.001, 0],
  [0.002, 0],
  [0.003, 0],
  [0.004, 0],
];
assert.equal(
  detectSelfClosure(turf, openPath, {
    recentPointExclusion: 2,
    closeThresholdMeters: 10,
    minimumAreaSquareMeters: 25,
  }),
  null,
  "an open walk must not be captured",
);

const savedTrack = {
  id: "saved:1",
  coordinates: [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
    [0.003, 0],
    [0.004, 0],
  ],
};
const historicTrail = [
  [0.0002, 0.00001],
  [0.0002, 0.001],
  [0.0015, 0.0014],
  [0.0028, 0.001],
  [0.0035, 0.00001],
];
const anchorContact = findNearestTrackContact(turf, historicTrail[0], [savedTrack], 10);
const closingContact = findNearestTrackContact(turf, historicTrail.at(-1), [savedTrack], 10);
const historicClosure = detectHistoricClosure(
  turf,
  historicTrail,
  savedTrack,
  { ...anchorContact, trailIndex: 0 },
  closingContact,
  {
    minimumHistoricTrailPoints: 4,
    minimumHistoricSegmentGap: 2,
    minimumAreaSquareMeters: 25,
  },
);
assert.ok(historicClosure, "two contacts with a saved track should create a territory");
assert.equal(historicClosure.kind, "historic");
assert.ok(historicClosure.areaSquareMeters > 10_000);

console.log("TerritoryEngine tests passed");
