import "./vendor/turf.min.js";
import {
  TERRITORY_DEFAULTS,
  detectHistoricClosure,
  detectSelfClosure,
  distanceMeters,
  findNearestTrackContact,
} from "./services/TerritoryEngine.js";

const turfApi = globalThis.turf;
const CLOSE_THRESHOLD_METERS = 10;
const MINIMUM_POINT_DISTANCE_METERS = 3;
const MINIMUM_POINT_INTERVAL_MILLISECONDS = 2000;
const MAXIMUM_ACCEPTED_ACCURACY_METERS = 50;
const MAX_MAP_ZOOM = L.Browser.retina ? 18 : 19;
const GPS_TRACKS_STORAGE_KEY = "corporation-map-gps-tracks-v1";
const ACTIVE_TRACK_STORAGE_KEY = "corporation-map-active-gps-track-v1";
const TERRITORIES_STORAGE_KEY = "corporation-map-territories-v1";
const THEME_STORAGE_KEY = "corporation-map-theme";
const TERRITORY_OPTIONS = {
  ...TERRITORY_DEFAULTS,
  closeThresholdMeters: CLOSE_THRESHOLD_METERS,
};
const GPS_OPTIONS = { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 };
const $ = (selector) => document.querySelector(selector);

const app = $("#app");
const territoryControl = $("#territoryControl");
const trackingToggle = $("#trackingToggle");
const trackingToggleIcon = $("#trackingToggleIcon");
const trackingToggleLabel = $("#trackingToggleLabel");
const trackingStatus = $("#trackingStatus");
const trackingStatusText = $("#trackingStatusText");
const territoryArea = $("#territoryArea");
const territoryCount = $("#territoryCount");
const trackingDistance = $("#trackingDistance");
const historyButton = $("#historyButton");
const historyCount = $("#historyCount");
const historyPanel = $("#historyPanel");
const historyBackdrop = $("#historyBackdrop");
const historyList = $("#historyList");
const territoriesTab = $("#territoriesTab");
const tracksTab = $("#tracksTab");
const locateButton = $("#locateButton");
const zoomInButton = $("#zoomInButton");
const zoomOutButton = $("#zoomOutButton");
const themeToggle = $("#themeToggle");
const toast = $("#toast");

const icons = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.7v12.6c0 .8.9 1.3 1.6.8l9-6.3a1 1 0 0 0 0-1.6l-9-6.3A1 1 0 0 0 8 5.7Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.3A8 8 0 0 1 9.7 4 7 7 0 1 0 20 14.3Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
};

const map = L.map("map", {
  center: [35.681236, 139.767125], zoom: 11, zoomControl: false, minZoom: 5,
  maxZoom: MAX_MAP_ZOOM, preferCanvas: true,
});
const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  detectRetina: true, maxNativeZoom: 19, maxZoom: 19, keepBuffer: 4,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const territoryPolygonLayer = L.featureGroup().addTo(map);
const savedTrackLayer = L.featureGroup().addTo(map);
const activeTrackLine = L.polyline([], {
  color: "#e85c4a", weight: 5, opacity: 0.98,
  lineCap: "round", lineJoin: "round", interactive: false,
}).addTo(map);
let locationMarker = null;
let accuracyCircle = null;
let toastTimer = null;
const playerIcon = L.divIcon({
  className: "player-icon",
  html: '<span class="player-icon-body"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="m9 20 3-6 3 6M6 12l6-3 6 3M12 9v5"/></svg></span>',
  iconSize: [42, 42], iconAnchor: [21, 21],
});

const state = {
  tracking: false,
  watchId: null,
  wakeLock: null,
  activeTrack: null,
  activeTrailCoordinates: [],
  sessionReferenceTracks: [],
  historicContactAnchor: null,
  trackingDistanceMeters: 0,
  lastAccuracyMeters: null,
  trackingMessage: "GPS OFF",
  followTracking: true,
  historyTab: "territories",
  initialLocationPending: true,
  territories: loadStoredArray(TERRITORIES_STORAGE_KEY),
  savedTracks: loadStoredArray(GPS_TRACKS_STORAGE_KEY),
};

init();

function init() {
  applyInitialTheme();
  bindEvents();
  recoverInterruptedTrack();
  renderTerritoryLayers();
  renderDashboard();
  renderHistory();
  focusLatestRecord();
  locateOnStart();
  updateZoomControls();
  window.setTimeout(() => map.invalidateSize(), 100);
}

function bindEvents() {
  trackingToggle.addEventListener("click", () => state.tracking ? stopTracking() : startTracking());
  locateButton.addEventListener("click", handleLocate);
  zoomInButton.addEventListener("click", () => { state.initialLocationPending = false; map.zoomIn(); });
  zoomOutButton.addEventListener("click", () => { state.initialLocationPending = false; map.zoomOut(); });
  themeToggle.addEventListener("click", toggleTheme);
  historyButton.addEventListener("click", openHistory);
  $("#historyCloseButton").addEventListener("click", closeHistory);
  historyBackdrop.addEventListener("click", closeHistory);
  territoriesTab.addEventListener("click", () => selectHistoryTab("territories"));
  tracksTab.addEventListener("click", () => selectHistoryTab("tracks"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && app.classList.contains("history-open")) closeHistory();
  });
  map.on("dragstart", () => {
    state.followTracking = false;
    state.initialLocationPending = false;
  });
  map.on("zoomend", updateZoomControls);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestTrackingWakeLock();
  });
  window.addEventListener("resize", () => map.invalidateSize({ pan: false }));
  window.addEventListener("orientationchange", () => window.setTimeout(() => map.invalidateSize(), 250));
}

function startTracking() {
  if (!navigator.geolocation) return showToast("この端末では位置情報を利用できません。");
  if (!turfApi) return showToast("領域判定を読み込めませんでした。通信状態を確認してください。");

  const startedAt = new Date().toISOString();
  state.initialLocationPending = false;
  state.tracking = true;
  state.followTracking = true;
  state.trackingDistanceMeters = 0;
  state.lastAccuracyMeters = null;
  state.trackingMessage = "GPS接続中";
  state.activeTrack = {
    id: makeId("track"), startedAt, endedAt: null, coordinates: [], samples: [],
  };
  state.activeTrailCoordinates = [];
  state.sessionReferenceTracks = [];
  state.historicContactAnchor = null;
  activeTrackLine.setLatLngs([]);
  renderDashboard();
  requestTrackingWakeLock();
  try {
    state.watchId = navigator.geolocation.watchPosition(
      handleTrackingPosition, handleTrackingError, GPS_OPTIONS,
    );
  } catch {
    stopTracking({ save: false, notify: false });
    showToast("GPSを開始できませんでした。位置情報の設定を確認してください。");
  }
}

function stopTracking({ save = true, notify = true } = {}) {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
  const hasTrack = state.activeTrack?.coordinates.length >= 2;
  if (save && hasTrack) {
    state.activeTrack.endedAt = new Date().toISOString();
    state.savedTracks.push(state.activeTrack);
    persistJson(GPS_TRACKS_STORAGE_KEY, state.savedTracks);
  }
  localStorage.removeItem(ACTIVE_TRACK_STORAGE_KEY);
  state.tracking = false;
  state.trackingMessage = "GPS OFF";
  state.activeTrack = null;
  state.activeTrailCoordinates = [];
  state.sessionReferenceTracks = [];
  state.historicContactAnchor = null;
  activeTrackLine.setLatLngs([]);
  releaseTrackingWakeLock();
  renderSavedTracks();
  renderDashboard();
  renderHistory();
  if (notify) showToast(hasTrack ? "軌跡を保存しました。" : "記録を終了しました。");
}

function handleTrackingPosition(position) {
  if (!state.tracking || !state.activeTrack) return;
  const { latitude, longitude, accuracy } = position.coords;
  if (![latitude, longitude, accuracy].every(Number.isFinite)) return;
  const sampleTimestamp = position.timestamp || Date.now();
  const coordinate = [roundCoordinate(longitude), roundCoordinate(latitude)];
  state.lastAccuracyMeters = accuracy;
  updateLocationVisualization(coordinate, accuracy);

  if (accuracy > MAXIMUM_ACCEPTED_ACCURACY_METERS) {
    state.trackingMessage = `精度待ち ±${Math.round(accuracy)}m`;
    renderDashboard();
    return;
  }

  const previousSample = state.activeTrack.samples.at(-1);
  if (previousSample && sampleTimestamp - Date.parse(previousSample.timestamp) < MINIMUM_POINT_INTERVAL_MILLISECONDS) {
    updateRecordingStatus(accuracy);
    return;
  }
  const previousCoordinate = state.activeTrack.coordinates.at(-1);
  if (previousCoordinate) {
    const movedMeters = distanceMeters(turfApi, previousCoordinate, coordinate);
    if (movedMeters < MINIMUM_POINT_DISTANCE_METERS) {
      updateRecordingStatus(accuracy);
      return;
    }
    state.trackingDistanceMeters += movedMeters;
  }

  const firstPoint = state.activeTrack.coordinates.length === 0;
  state.activeTrack.coordinates.push(coordinate);
  state.activeTrack.samples.push({
    longitude: coordinate[0], latitude: coordinate[1],
    accuracy: Math.round(accuracy), timestamp: new Date(sampleTimestamp).toISOString(),
  });
  state.activeTrailCoordinates.push(coordinate);
  activeTrackLine.setLatLngs(toLeafletCoordinates(state.activeTrack.coordinates));
  persistJson(ACTIVE_TRACK_STORAGE_KEY, state.activeTrack);
  detectTerritoryClosure(coordinate);
  updateRecordingStatus(accuracy);

  const latLng = [coordinate[1], coordinate[0]];
  if (firstPoint) {
    map.flyTo(latLng, Math.max(map.getZoom(), 17), { duration: 0.65 });
  } else if (state.followTracking) {
    const bottomPadding = territoryControl.getBoundingClientRect().height + 28;
    map.panInside(latLng, {
      paddingTopLeft: L.point(24, 86),
      paddingBottomRight: L.point(24, bottomPadding),
      animate: true, duration: 0.3,
    });
  }
}

function updateRecordingStatus(accuracy) {
  state.trackingMessage = `記録中 ±${Math.round(accuracy)}m`;
  renderDashboard();
}

function handleTrackingError(error) {
  const messages = {
    1: "位置情報が許可されていません。端末の設定を確認してください。",
    2: "現在位置を取得できません。",
    3: "GPSの取得がタイムアウトしました。",
  };
  if (error.code === 1) stopTracking({ save: true, notify: false });
  else {
    state.trackingMessage = "GPS再接続中";
    renderDashboard();
  }
  showToast(messages[error.code] || "GPSでエラーが発生しました。");
}

function detectTerritoryClosure(currentCoordinate) {
  const selfClosure = detectSelfClosure(turfApi, state.activeTrailCoordinates, TERRITORY_OPTIONS);
  if (selfClosure) return captureTerritory(selfClosure, currentCoordinate);

  const referenceTracks = [...state.savedTracks, ...state.sessionReferenceTracks];
  if (!referenceTracks.length) return;
  const contact = findNearestTrackContact(turfApi, currentCoordinate, referenceTracks, CLOSE_THRESHOLD_METERS);
  if (!contact) return;
  if (!state.historicContactAnchor || state.historicContactAnchor.trackId !== contact.trackId) {
    state.historicContactAnchor = { ...contact, trailIndex: state.activeTrailCoordinates.length - 1 };
    return;
  }
  const referenceTrack = referenceTracks.find((track) => track.id === contact.trackId);
  const closure = detectHistoricClosure(
    turfApi, state.activeTrailCoordinates, referenceTrack,
    state.historicContactAnchor, contact, TERRITORY_OPTIONS,
  );
  if (closure) captureTerritory(closure, currentCoordinate);
}

function captureTerritory(result, currentCoordinate) {
  const territory = {
    id: makeId("territory"), capturedAt: new Date().toISOString(),
    areaSquareMeters: result.areaSquareMeters, coordinates: result.ring,
    source: {
      kind: result.kind,
      sessionTrackId: state.activeTrack.id,
      referenceTrackId: result.contact.trackId || state.activeTrack.id,
      closeThresholdMeters: CLOSE_THRESHOLD_METERS,
    },
  };
  state.territories.push(territory);
  persistJson(TERRITORIES_STORAGE_KEY, state.territories);
  if (state.activeTrailCoordinates.length >= 2) {
    state.sessionReferenceTracks.push({
      id: `${state.activeTrack.id}:segment:${state.sessionReferenceTracks.length + 1}`,
      coordinates: [...state.activeTrailCoordinates],
    });
  }
  state.activeTrailCoordinates = [result.contact.coordinate, currentCoordinate];
  state.historicContactAnchor = null;
  renderTerritoryPolygons();
  renderHistory();
  showToast(`領域を獲得 +${formatArea(result.areaSquareMeters)}`);
}

function updateLocationVisualization([longitude, latitude], accuracy) {
  const latLng = [latitude, longitude];
  if (!accuracyCircle) {
    accuracyCircle = L.circle(latLng, {
      radius: accuracy, color: "#247ac4", weight: 1, opacity: 0.45,
      fillColor: "#247ac4", fillOpacity: 0.035, interactive: false,
    }).addTo(map);
  } else accuracyCircle.setLatLng(latLng).setRadius(accuracy);

  if (!locationMarker) {
    locationMarker = L.marker(latLng, {
      icon: playerIcon, interactive: false, keyboard: false,
    }).addTo(map);
  } else locationMarker.setLatLng(latLng);
}

function recoverInterruptedTrack() {
  const recoveredTrack = loadStoredObject(ACTIVE_TRACK_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_TRACK_STORAGE_KEY);
  if (!recoveredTrack?.id || !Array.isArray(recoveredTrack.coordinates) || recoveredTrack.coordinates.length < 2) return;
  recoveredTrack.endedAt ||= new Date().toISOString();
  recoveredTrack.recovered = true;
  if (!state.savedTracks.some((track) => track.id === recoveredTrack.id)) {
    state.savedTracks.push(recoveredTrack);
    persistJson(GPS_TRACKS_STORAGE_KEY, state.savedTracks);
  }
}

function renderTerritoryLayers() {
  renderTerritoryPolygons();
  renderSavedTracks();
}

function renderTerritoryPolygons() {
  territoryPolygonLayer.clearLayers();
  for (const territory of state.territories) {
    if (!Array.isArray(territory.coordinates) || territory.coordinates.length < 4) continue;
    L.polygon(toLeafletCoordinates(territory.coordinates), {
      color: "#a67508", weight: 2, opacity: 0.95,
      fillColor: "#f1bf36", fillOpacity: 0.34,
    }).bindTooltip(`獲得エリア ${formatArea(territory.areaSquareMeters)}`, { sticky: true })
      .addTo(territoryPolygonLayer);
  }
}

function renderSavedTracks() {
  savedTrackLayer.clearLayers();
  for (const track of state.savedTracks) {
    if (!Array.isArray(track.coordinates) || track.coordinates.length < 2) continue;
    L.polyline(toLeafletCoordinates(track.coordinates), {
      color: "#087f72", weight: 3, opacity: 0.62,
      dashArray: "5 7", interactive: false,
    }).addTo(savedTrackLayer);
  }
}

function renderDashboard() {
  const totalArea = state.territories.reduce((sum, item) => sum + (Number(item.areaSquareMeters) || 0), 0);
  territoryArea.textContent = formatArea(totalArea);
  territoryCount.textContent = `${state.territories.length} エリア`;
  trackingDistance.textContent = formatDistance(state.trackingDistanceMeters);
  trackingStatusText.textContent = state.trackingMessage;
  trackingStatus.classList.toggle("is-active", state.tracking);
  trackingStatus.classList.toggle(
    "is-low-accuracy", state.tracking && state.lastAccuracyMeters > MAXIMUM_ACCEPTED_ACCURACY_METERS,
  );
  territoryControl.classList.toggle("is-tracking", state.tracking);
  trackingToggleIcon.innerHTML = state.tracking ? icons.stop : icons.play;
  trackingToggleLabel.textContent = state.tracking ? "STOP" : "START";
  trackingToggle.setAttribute("aria-label", state.tracking ? "GPS記録を停止" : "GPS記録を開始");
  historyCount.textContent = state.territories.length;
}

function openHistory() {
  app.classList.add("history-open");
  historyPanel.removeAttribute("inert");
  historyPanel.setAttribute("aria-hidden", "false");
  historyBackdrop.hidden = false;
  historyButton.setAttribute("aria-expanded", "true");
  renderHistory();
  $("#historyCloseButton").focus();
}

function closeHistory() {
  app.classList.remove("history-open");
  historyPanel.setAttribute("inert", "");
  historyPanel.setAttribute("aria-hidden", "true");
  historyBackdrop.hidden = true;
  historyButton.setAttribute("aria-expanded", "false");
  historyButton.focus();
}

function selectHistoryTab(tab) {
  state.historyTab = tab;
  for (const [button, active] of [[territoriesTab, tab === "territories"], [tracksTab, tab === "tracks"]]) {
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  renderHistory();
}

function renderHistory() {
  historyList.replaceChildren();
  const isTerritory = state.historyTab === "territories";
  const records = (isTerritory ? state.territories : state.savedTracks)
    .filter((record) => record && Array.isArray(record.coordinates) && record.coordinates.length >= 2);
  historyPanel.classList.toggle("is-empty", !records.length);
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = isTerritory ? "獲得エリアはまだありません" : "保存した軌跡はまだありません";
    historyList.append(empty);
    return;
  }
  [...records].reverse().forEach((record, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    const number = records.length - index;
    const label = isTerritory ? `エリア ${String(number).padStart(2, "0")}` : `軌跡 ${String(number).padStart(2, "0")}`;
    const date = formatDate(isTerritory ? record.capturedAt : record.startedAt);
    const value = isTerritory ? formatArea(record.areaSquareMeters) : formatTrackDistance(record.coordinates);
    const text = document.createElement("span");
    text.className = "history-item-text";
    const name = document.createElement("strong");
    name.textContent = label;
    const meta = document.createElement("span");
    meta.textContent = date;
    text.append(name, meta);
    const valueElement = document.createElement("strong");
    valueElement.className = "history-item-value";
    valueElement.textContent = value;
    const arrow = document.createElement("span");
    arrow.className = "history-item-arrow";
    arrow.innerHTML = icons.arrow;
    button.append(text, valueElement, arrow);
    button.addEventListener("click", () => {
      const bounds = L.latLngBounds(toLeafletCoordinates(record.coordinates.filter(isCoordinate)));
      closeHistory();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.35), { maxZoom: 17, animate: true });
    });
    historyList.append(button);
  });
}

function focusLatestRecord() {
  const latest = state.territories.at(-1) || state.savedTracks.at(-1);
  if (!latest?.coordinates?.length) return;
  const bounds = L.latLngBounds(toLeafletCoordinates(latest.coordinates.filter(isCoordinate)));
  if (bounds.isValid()) map.fitBounds(bounds.pad(0.5), { maxZoom: 16, animate: false });
}

function locateOnStart() {
  if (!navigator.geolocation) return;
  try {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (![latitude, longitude, accuracy].every(Number.isFinite)) return;
        updateLocationVisualization([longitude, latitude], accuracy);
        if (state.initialLocationPending && !state.tracking) {
          map.setView([latitude, longitude], 16, { animate: false });
        }
        state.initialLocationPending = false;
      },
      () => { state.initialLocationPending = false; },
      { enableHighAccuracy: true, maximumAge: 300000, timeout: 10000 },
    );
  } catch {
    state.initialLocationPending = false;
  }
}

function updateZoomControls() {
  zoomInButton.disabled = map.getZoom() >= MAX_MAP_ZOOM;
  zoomOutButton.disabled = map.getZoom() <= map.getMinZoom();
}

function handleLocate() {
  if (state.tracking && locationMarker) {
    state.followTracking = true;
    map.flyTo(locationMarker.getLatLng(), Math.max(map.getZoom(), 16));
    return;
  }
  if (!navigator.geolocation) return showToast("この端末では位置情報を利用できません。");
  locateButton.setAttribute("aria-busy", "true");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      locateButton.removeAttribute("aria-busy");
      updateLocationVisualization(
        [position.coords.longitude, position.coords.latitude], position.coords.accuracy,
      );
      map.flyTo([position.coords.latitude, position.coords.longitude], 16, { duration: 0.7 });
    },
    () => {
      locateButton.removeAttribute("aria-busy");
      showToast("現在地を取得できませんでした。位置情報の設定を確認してください。");
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  );
}

function applyInitialTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const dark = saved ? saved === "dark" : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  app.classList.toggle("dark", dark);
  themeToggle.innerHTML = dark ? icons.sun : icons.moon;
  themeToggle.setAttribute("aria-label", dark ? "ライト表示に切り替え" : "ダーク表示に切り替え");
}

function toggleTheme() {
  const dark = !app.classList.contains("dark");
  app.classList.toggle("dark", dark);
  localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  themeToggle.innerHTML = dark ? icons.sun : icons.moon;
  themeToggle.setAttribute("aria-label", dark ? "ライト表示に切り替え" : "ダーク表示に切り替え");
  baseLayer.redraw();
}

async function requestTrackingWakeLock() {
  if (!state.tracking || !navigator.wakeLock || document.visibilityState !== "visible" || state.wakeLock) return;
  try {
    const wakeLock = await navigator.wakeLock.request("screen");
    if (!state.tracking) return wakeLock.release();
    state.wakeLock = wakeLock;
    wakeLock.addEventListener("release", () => { state.wakeLock = null; });
  } catch {
    state.wakeLock = null;
  }
}

async function releaseTrackingWakeLock() {
  try { await state.wakeLock?.release(); } catch { /* Already released by the browser. */ }
  state.wakeLock = null;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3800);
}

function loadStoredArray(key) {
  const value = loadStoredObject(key);
  return Array.isArray(value) ? value : [];
}

function loadStoredObject(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function persistJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { showToast("端末内の保存容量が不足しています。"); }
}

function makeId(prefix) {
  return `${prefix}:${new Date().toISOString()}:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

function toLeafletCoordinates(coordinates) {
  return coordinates.map(([longitude, latitude]) => [latitude, longitude]);
}

function roundCoordinate(value) { return Number(value.toFixed(7)); }

function formatArea(squareMeters) {
  const area = Number(squareMeters) || 0;
  if (area < 10000) return `${Math.round(area).toLocaleString("ja-JP")} m²`;
  return `${(area / 10000).toFixed(2)} ha`;
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatTrackDistance(coordinates) {
  if (!turfApi || !Array.isArray(coordinates)) return "0 m";
  let meters = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    if (!isCoordinate(coordinates[index - 1]) || !isCoordinate(coordinates[index])) continue;
    try { meters += distanceMeters(turfApi, coordinates[index - 1], coordinates[index]); }
    catch { /* Ignore a malformed stored segment. */ }
  }
  return formatDistance(meters);
}

function isCoordinate(value) {
  return Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite);
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "日付不明";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}
