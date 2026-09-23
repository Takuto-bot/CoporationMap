import "./vendor/turf.min.js";
import { PlaceService } from "./services/PlaceService.js";
import { MockPlaceProvider } from "./providers/MockPlaceProvider.js";
import { TYPE_META, FILTERS, getTypeMeta } from "./models/place.js";
import {
  TERRITORY_DEFAULTS,
  detectHistoricClosure,
  detectSelfClosure,
  distanceMeters,
  findNearestTrackContact,
} from "./services/TerritoryEngine.js";

const turfApi = globalThis.turf;

const JAPAN_CENTER = [35.681236, 139.767125];
const DEFAULT_ZOOM = 12;
const SELECTED_ZOOM = 16;
const MAX_SIDEBAR_RESULTS = 24;
const MAX_SUGGESTIONS = 8;
const CLOSE_THRESHOLD_METERS = 10;
const RECENT_POINT_EXCLUSION = 20;
const MINIMUM_POINT_DISTANCE_METERS = 3;
const MINIMUM_POINT_INTERVAL_MILLISECONDS = 2000;
const MAXIMUM_ACCEPTED_ACCURACY_METERS = 50;
const GPS_TRACKS_STORAGE_KEY = "corporation-map-gps-tracks-v1";
const ACTIVE_TRACK_STORAGE_KEY = "corporation-map-active-gps-track-v1";
const TERRITORIES_STORAGE_KEY = "corporation-map-territories-v1";
const TERRITORY_OPTIONS = {
  ...TERRITORY_DEFAULTS,
  closeThresholdMeters: CLOSE_THRESHOLD_METERS,
  recentPointExclusion: RECENT_POINT_EXCLUSION,
};
const GPS_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000,
};
const mobileLayoutQuery = window.matchMedia("(max-width: 760px)");

const app = document.querySelector("#app");
const sidePanel = document.querySelector("#sidePanel");
const searchInput = document.querySelector("#searchInput");
const suggestions = document.querySelector("#suggestions");
const filterChips = document.querySelector("#filterChips");
const clearSearchButton = document.querySelector("#clearSearchButton");
const locateButton = document.querySelector("#locateButton");
const zoomInButton = document.querySelector("#zoomInButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const themeToggle = document.querySelector("#themeToggle");
const themeIcon = document.querySelector("#themeIcon");
const territoryControl = document.querySelector("#territoryControl");
const trackingToggle = document.querySelector("#trackingToggle");
const trackingToggleLabel = document.querySelector("#trackingToggleLabel");
const trackingStatus = document.querySelector("#trackingStatus");
const territoryArea = document.querySelector("#territoryArea");
const trackingDistance = document.querySelector("#trackingDistance");

const icons = {
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
  locate:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M2 12h3"></path><path d="M19 12h3"></path><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
  minus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M5 12h14"></path></svg>',
  sun:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>',
  moon:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.3A8 8 0 0 1 9.7 4 7 7 0 1 0 20 14.3Z"></path></svg>',
  map:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"></path><path d="M9 3v15"></path><path d="M15 6v15"></path></svg>',
  external:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>',
  chevronUp:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"></path></svg>',
  play:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.7v12.6c0 .8.9 1.3 1.6.8l9-6.3a1 1 0 0 0 0-1.6l-9-6.3A1 1 0 0 0 8 5.7Z"></path></svg>',
  stop:
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"></rect></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"></path></svg>',
  headquarters:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16"></path><path d="M6 21V5a2 2 0 0 1 2-2h7v18"></path><path d="M15 7h3l-1-2 1-2h-3"></path><path d="M10 8h1"></path><path d="M10 12h1"></path><path d="M10 16h1"></path></svg>',
  company:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V5a2 2 0 0 1 2-2h7v18"></path><path d="M14 8h3a2 2 0 0 1 2 2v11"></path><path d="M9 7h1"></path><path d="M9 11h1"></path><path d="M9 15h1"></path></svg>',
  government:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-6 9 6"></path><path d="M4 10h16"></path><path d="M6 10v8"></path><path d="M10 10v8"></path><path d="M14 10v8"></path><path d="M18 10v8"></path><path d="M3 18h18"></path><path d="M2 22h20"></path></svg>',
};

document.querySelector(".search-icon").innerHTML = icons.search;
document.querySelector(".close-icon").innerHTML = icons.close;
document.querySelector(".locate-icon").innerHTML = icons.locate;
document.querySelector(".plus-icon").innerHTML = icons.plus;
document.querySelector(".minus-icon").innerHTML = icons.minus;
document.querySelector(".tracking-icon").innerHTML = icons.play;

const placeService = new PlaceService({
  providers: [new MockPlaceProvider()],
});

const map = L.map("map", {
  center: JAPAN_CENTER,
  zoom: DEFAULT_ZOOM,
  zoomControl: false,
  minZoom: 5,
  maxZoom: L.Browser.retina ? 18 : 19,
  preferCanvas: true,
});

const baseLayers = {
  light: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    detectRetina: true,
    maxNativeZoom: 19,
    maxZoom: 19,
    keepBuffer: 4,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
  dark: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    detectRetina: true,
    maxNativeZoom: 19,
    maxZoom: 19,
    keepBuffer: 4,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
};

let activeBaseLayer = null;

const clusterLayer = L.markerClusterGroup({
  chunkedLoading: true,
  showCoverageOnHover: false,
  maxClusterRadius: 54,
  spiderfyOnMaxZoom: true,
  disableClusteringAtZoom: 17,
});

map.addLayer(clusterLayer);

const territoryPolygonLayer = L.featureGroup().addTo(map);
const savedTrackLayer = L.featureGroup().addTo(map);
const activeTrackLine = L.polyline([], {
  color: "#e5484d",
  weight: 5,
  opacity: 0.94,
  lineCap: "round",
  lineJoin: "round",
  interactive: false,
}).addTo(map);
let locationMarker = null;
let accuracyCircle = null;

const scheduleMapResize = () => {
  window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  window.setTimeout(() => map.invalidateSize({ pan: false }), 220);
};
const mapResizeObserver = new ResizeObserver(scheduleMapResize);
mapResizeObserver.observe(document.querySelector("#map"));
window.addEventListener("resize", scheduleMapResize);
window.addEventListener("orientationchange", scheduleMapResize);
window.setTimeout(scheduleMapResize, 0);
window.setTimeout(scheduleMapResize, 420);

const state = {
  allPlaces: [],
  visiblePlaces: [],
  selectedPlaceId: null,
  hoveredPlaceId: null,
  activeType: "all",
  headquartersOnly: false,
  searchQuery: "",
  visited: new Set(JSON.parse(localStorage.getItem("corporation-map-visited") || "[]")),
  markers: new Map(),
  mobileSheetStage: "peek",
  isAnimatingToPlace: false,
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
  territories: loadStoredArray(TERRITORIES_STORAGE_KEY),
  savedTracks: loadStoredArray(GPS_TRACKS_STORAGE_KEY),
};

init();

async function init() {
  territoryControl.dataset.engineReady = turfApi ? "true" : "false";
  applyInitialTheme();
  setMobileSheetStage("peek", { animate: false });
  renderFilterChips();
  bindEvents();
  recoverInterruptedTrack();
  renderTerritoryLayers();
  renderTerritoryHud();
  state.allPlaces = await placeService.getPlaces();
  await refreshMapData();
  renderSidePanel();
}

function bindEvents() {
  map.on("moveend zoomend", () => {
    refreshMapData();
  });
  map.on("dragstart", () => {
    minimizeSheetForMapInteraction();
    if (state.tracking) state.followTracking = false;
  });
  map.on("zoomstart", minimizeSheetForMapInteraction);
  mobileLayoutQuery.addEventListener("change", () => {
    setMobileSheetStage("peek", { animate: false });
    renderSidePanel();
  });

  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value.trim();
    clearSearchButton.classList.toggle("hidden", !state.searchQuery);
    renderSuggestions();
    refreshMapData();
  });

  searchInput.addEventListener("focus", renderSuggestions);

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-stack")) {
      suggestions.classList.add("hidden");
    }
  });

  clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    state.searchQuery = "";
    clearSearchButton.classList.add("hidden");
    suggestions.classList.add("hidden");
    refreshMapData();
    searchInput.focus();
  });

  locateButton.addEventListener("click", () => {
    if (state.tracking) state.followTracking = true;
    handleLocate();
  });
  zoomInButton.addEventListener("click", () => map.zoomIn());
  zoomOutButton.addEventListener("click", () => map.zoomOut());
  themeToggle.addEventListener("click", toggleTheme);
  trackingToggle.addEventListener("click", toggleTracking);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.tracking) requestTrackingWakeLock();
  });
}

async function refreshMapData() {
  const bounds = map.getBounds();
  state.visiblePlaces = await placeService.getPlaces({
    bounds,
    filters: getCurrentFilters(),
    query: state.searchQuery,
  });

  const markerPlaces = await placeService.getPlaces({
    bounds: bounds.pad(0.35),
    filters: getCurrentFilters(),
    query: state.searchQuery,
  });

  renderMarkers(markerPlaces);
  renderSidePanel();
}

function getCurrentFilters() {
  return {
    type: state.activeType,
    headquartersOnly: state.headquartersOnly,
  };
}

function renderFilterChips() {
  filterChips.replaceChildren(
    ...FILTERS.map((filter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-chip";
      button.dataset.filter = filter.id;
      button.setAttribute("aria-pressed", isFilterActive(filter));
      const chipIcon = filter.iconName && icons[filter.iconName] ? icons[filter.iconName] : filter.label;
      button.innerHTML = `<span aria-hidden="true">${chipIcon}</span><span>${filter.label}</span>`;
      button.addEventListener("click", () => {
        if (filter.kind === "type") {
          state.activeType = filter.id;
        } else if (filter.kind === "flag") {
          state.headquartersOnly = !state.headquartersOnly;
        }
        renderFilterChips();
        refreshMapData();
      });
      return button;
    }),
  );
}

function isFilterActive(filter) {
  if (filter.kind === "type") {
    return state.activeType === filter.id ? "true" : "false";
  }
  return state.headquartersOnly ? "true" : "false";
}

function renderMarkers(places) {
  const existingIds = new Set(state.markers.keys());
  const nextIds = new Set(places.map((place) => place.id));

  for (const id of existingIds) {
    if (!nextIds.has(id)) {
      const marker = state.markers.get(id);
      clusterLayer.removeLayer(marker);
      state.markers.delete(id);
    }
  }

  for (const place of places) {
    let marker = state.markers.get(place.id);
    if (!marker) {
      marker = L.marker([place.latitude, place.longitude], {
        icon: createPlaceIcon(place),
        riseOnHover: true,
        title: place.name,
        bubblingMouseEvents: false,
      });
      marker.on("click", () => selectPlace(place.id));
      marker.on("mouseover", () => setHoveredPlace(place.id));
      marker.on("mouseout", () => clearHoveredPlace(place.id));
      state.markers.set(place.id, marker);
      clusterLayer.addLayer(marker);
    }
    marker.place = place;
    syncMarkerState(marker, place.id);
  }
}

function createPlaceIcon(place) {
  const type = getTypeMeta(place.type);
  return L.divIcon({
    className: "",
    html: `<div class="place-marker marker-${place.type}" data-place-id="${place.id}"><span class="marker-symbol">${icons[type.iconName]}</span></div>`,
    iconSize: [36, 44],
    iconAnchor: [18, 40],
    popupAnchor: [0, -38],
  });
}

function syncMarkerState(marker, placeId) {
  const element = marker.getElement();
  if (!element) return;
  const markerElement = element.querySelector(".place-marker");
  if (!markerElement) return;
  markerElement.classList.toggle("is-selected", state.selectedPlaceId === placeId);
  markerElement.classList.toggle("is-hovered", state.hoveredPlaceId === placeId);
}

function renderSidePanel() {
  const selected = getSelectedPlace();
  if (selected) {
    renderDetailPanel(selected);
    return;
  }

  sidePanel.classList.remove("has-mobile-detail");

  const center = map.getCenter();
  const places = state.visiblePlaces
    .map((place) => ({
      ...place,
      distanceMeters: center.distanceTo([place.latitude, place.longitude]),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_SIDEBAR_RESULTS);

  const header = document.createElement("div");
  header.className = "panel-header";
  header.innerHTML = `
    <p class="panel-kicker">この地図範囲にある施設</p>
    <div class="panel-title-row">
      <h2 class="panel-title">周辺スポット</h2>
      <span class="panel-count">${places.length}件</span>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "panel-list";

  if (!places.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "この範囲には表示できる施設がありません。地図を移動するか、フィルターを変更してください。";
    empty.style.padding = "12px 10px 18px";
    list.append(empty);
  } else {
    list.replaceChildren(...places.map(createPanelItem));
  }

  sidePanel.replaceChildren(createSheetHandle(), header, list);
}

function createPanelItem(place) {
  const type = getTypeMeta(place.type);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "panel-item";
  button.dataset.placeId = place.id;
  button.classList.toggle("is-selected", state.selectedPlaceId === place.id);
  button.classList.toggle("is-hovered", state.hoveredPlaceId === place.id);
  button.innerHTML = `
    <span class="type-badge badge-${place.type}" aria-hidden="true">${icons[type.iconName]}</span>
    <span>
      <span class="panel-item-title">${escapeHtml(place.name)}</span>
      <span class="panel-item-meta">${escapeHtml(place.category)} ・ ${formatDistance(place.distanceMeters)}</span>
    </span>
  `;
  button.addEventListener("mouseenter", () => setHoveredPlace(place.id));
  button.addEventListener("mouseleave", () => clearHoveredPlace(place.id));
  button.addEventListener("click", () => selectPlace(place.id, { fly: true }));
  return button;
}

function renderDetailPanel(place) {
  if (isMobileLayout()) {
    renderMobileDetailCard(place);
    return;
  }

  sidePanel.classList.remove("has-mobile-detail");
  const type = getTypeMeta(place.type);
  const header = document.createElement("div");
  header.className = "panel-header";
  header.innerHTML = `
    <div class="detail-title-row">
      <div>
        <p class="panel-kicker">選択中の施設</p>
        <h2 class="detail-title">${escapeHtml(place.name)}</h2>
      </div>
      <button class="icon-button subtle close-detail-button" type="button" aria-label="詳細を閉じる">
        <span class="icon close-icon">${icons.close}</span>
      </button>
    </div>
  `;
  header.querySelector("button").addEventListener("click", () => {
    state.selectedPlaceId = null;
    updateAllMarkerStates();
    renderSidePanel();
  });

  const body = document.createElement("div");
  body.className = "detail-body";
  body.innerHTML = `
    <div class="detail-topline">
      <span class="type-badge badge-${place.type}" aria-hidden="true">${icons[type.iconName]}</span>
      <div>
        <div><strong>${type.label}</strong>${place.headquarters ? " ・ 本社" : ""}</div>
        <div class="detail-meta">${escapeHtml(place.category)}</div>
      </div>
    </div>
    ${place.description ? `<p class="detail-description">${escapeHtml(place.description)}</p>` : ""}
    <div class="detail-section">
      <h3 class="detail-section-title">基本情報</h3>
      <dl class="detail-grid">
        ${detailRow("住所", place.address)}
        ${detailRow("証券コード", place.stockCode)}
        ${detailRow("法人番号", place.corporateNumber)}
        ${detailRow("資本金", place.capital)}
        ${detailRow("従業員数", place.employees)}
        ${detailRow("出典", place.source)}
      </dl>
    </div>
    <div class="detail-actions">
      ${place.website ? `<a class="text-button primary" href="${place.website}" target="_blank" rel="noopener noreferrer"><span class="icon">${icons.external}</span>公式サイト</a>` : ""}
      <button id="visitedButton" class="text-button" type="button"><span class="icon">${icons.check}</span>${state.visited.has(place.id) ? "訪問済み" : "訪問済みにする"}</button>
    </div>
  `;

  const visitedButton = body.querySelector("#visitedButton");
  visitedButton.addEventListener("click", () => toggleVisited(place.id));

  sidePanel.replaceChildren(header, body);
}

function renderMobileDetailCard(place) {
  const type = getTypeMeta(place.type);
  sidePanel.classList.add("has-mobile-detail");

  const card = document.createElement("div");
  card.className = "mobile-detail-card";
  card.innerHTML = `
    <div class="mobile-detail-summary">
      <span class="type-badge badge-${place.type}" aria-hidden="true">${icons[type.iconName]}</span>
      <div class="mobile-detail-copy">
        <p class="panel-kicker">${escapeHtml(type.label)}${place.headquarters ? " ・ 本社" : ""}</p>
        <h2 class="mobile-detail-title">${escapeHtml(place.name)}</h2>
        <p class="mobile-detail-meta">${escapeHtml(place.category)} ・ ${escapeHtml(place.address)}</p>
      </div>
      <button class="icon-button subtle close-detail-button" type="button" aria-label="詳細を閉じる">
        <span class="icon close-icon">${icons.close}</span>
      </button>
    </div>
    <button class="mobile-detail-expand-button" type="button">
      <span>詳しく見る</span><span class="icon" aria-hidden="true">${icons.chevronUp}</span>
    </button>
    <div class="mobile-detail-expanded">
      ${place.description ? `<p class="detail-description">${escapeHtml(place.description)}</p>` : ""}
      <dl class="detail-grid">
        ${detailRow("住所", place.address)}
        ${detailRow("証券コード", place.stockCode)}
        ${detailRow("法人番号", place.corporateNumber)}
        ${detailRow("出典", place.source)}
      </dl>
      <div class="detail-actions">
        ${place.website ? `<a class="text-button primary" href="${place.website}" target="_blank" rel="noopener noreferrer"><span class="icon">${icons.external}</span>公式サイト</a>` : ""}
        <button id="visitedButton" class="text-button" type="button"><span class="icon">${icons.check}</span>${state.visited.has(place.id) ? "訪問済み" : "訪問済みにする"}</button>
      </div>
    </div>
  `;

  card.querySelector(".close-detail-button").addEventListener("click", clearSelectedPlace);
  card.querySelector(".mobile-detail-expand-button").addEventListener("click", () => {
    setMobileSheetStage("half");
  });
  card.querySelector("#visitedButton")?.addEventListener("click", () => toggleVisited(place.id));
  sidePanel.replaceChildren(createSheetHandle(), card);
}

function createSheetHandle() {
  if (!isMobileLayout()) return document.createDocumentFragment();

  const handle = document.createElement("div");
  handle.className = "sheet-drag-handle";
  handle.tabIndex = 0;
  handle.setAttribute("role", "button");
  handle.setAttribute("aria-label", "施設一覧を展開または縮小");
  handle.setAttribute("aria-expanded", state.mobileSheetStage === "peek" ? "false" : "true");
  handle.innerHTML = '<span aria-hidden="true"></span>';

  let dragStartY = 0;
  let dragStartHeight = 0;
  let pointerId = null;

  handle.addEventListener("pointerdown", (event) => {
    pointerId = event.pointerId;
    dragStartY = event.clientY;
    dragStartHeight = sidePanel.getBoundingClientRect().height;
    handle.setPointerCapture(pointerId);
    sidePanel.classList.add("is-dragging");
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const { peek, full } = getMobileSheetHeights();
    const nextHeight = clamp(dragStartHeight + dragStartY - event.clientY, peek, full);
    sidePanel.style.setProperty("--sheet-drag-height", `${nextHeight}px`);
  });

  const finishDrag = (event) => {
    if (event.pointerId !== pointerId) return;
    const currentHeight = Number.parseFloat(sidePanel.style.getPropertyValue("--sheet-drag-height")) || dragStartHeight;
    pointerId = null;
    sidePanel.classList.remove("is-dragging");
    sidePanel.style.removeProperty("--sheet-drag-height");
    setMobileSheetStage(getClosestSheetStage(currentHeight));
  };

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("keydown", (event) => {
    const stages = ["peek", "half", "full"];
    const index = stages.indexOf(state.mobileSheetStage);
    if (event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setMobileSheetStage(stages[Math.min(index + 1, stages.length - 1)]);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMobileSheetStage(stages[Math.max(index - 1, 0)]);
    }
  });

  return handle;
}

function renderSuggestions() {
  const query = searchInput.value.trim();
  if (!query) {
    suggestions.classList.add("hidden");
    suggestions.replaceChildren();
    return;
  }

  const results = placeService.searchPlaces(query, {
    filters: getCurrentFilters(),
    limit: MAX_SUGGESTIONS,
  });

  if (!results.length) {
    suggestions.classList.remove("hidden");
    suggestions.innerHTML = '<p class="empty-state" style="padding:12px 14px;margin:0;">候補が見つかりません</p>';
    return;
  }

  suggestions.replaceChildren(...results.map(createSuggestionItem));
  suggestions.classList.remove("hidden");
}

function createSuggestionItem(place) {
  const type = getTypeMeta(place.type);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "suggestion-item";
  button.setAttribute("role", "option");
  button.innerHTML = `
    <span class="type-badge badge-${place.type}" aria-hidden="true">${icons[type.iconName]}</span>
    <span>
      <span class="suggestion-title">${escapeHtml(place.name)}</span>
      <span class="suggestion-meta">${escapeHtml(place.category)} ・ ${escapeHtml(place.address)}</span>
    </span>
  `;
  button.addEventListener("click", () => {
    searchInput.value = place.name;
    state.searchQuery = place.name;
    clearSearchButton.classList.remove("hidden");
    suggestions.classList.add("hidden");
    selectPlace(place.id, { fly: true, zoom: SELECTED_ZOOM });
  });
  return button;
}

function selectPlace(placeId, options = {}) {
  const place = state.allPlaces.find((item) => item.id === placeId);
  if (!place) return;

  state.selectedPlaceId = placeId;
  if (isMobileLayout()) setMobileSheetStage("peek");
  if (options.fly) {
    state.isAnimatingToPlace = true;
    map.flyTo([place.latitude, place.longitude], options.zoom || Math.max(map.getZoom(), SELECTED_ZOOM), {
      duration: 0.65,
    });
    map.once("moveend", () => {
      state.isAnimatingToPlace = false;
      keepSelectedMarkerAboveSheet(place);
    });
  } else if (isMobileLayout()) {
    window.requestAnimationFrame(() => keepSelectedMarkerAboveSheet(place));
  }
  updateAllMarkerStates();
  renderSidePanel();
}

function setHoveredPlace(placeId) {
  state.hoveredPlaceId = placeId;
  updateAllMarkerStates();
  updatePanelHoverState();
}

function clearHoveredPlace(placeId) {
  if (state.hoveredPlaceId !== placeId) return;
  state.hoveredPlaceId = null;
  updateAllMarkerStates();
  updatePanelHoverState();
}

function updateAllMarkerStates() {
  for (const [placeId, marker] of state.markers.entries()) {
    syncMarkerState(marker, placeId);
  }
}

function updatePanelHoverState() {
  sidePanel.querySelectorAll(".panel-item").forEach((item) => {
    item.classList.toggle("is-hovered", item.dataset.placeId === state.hoveredPlaceId);
  });
}

function getSelectedPlace() {
  if (!state.selectedPlaceId) return null;
  return state.allPlaces.find((place) => place.id === state.selectedPlaceId) || null;
}

function clearSelectedPlace() {
  state.selectedPlaceId = null;
  updateAllMarkerStates();
  if (isMobileLayout()) setMobileSheetStage("peek");
  renderSidePanel();
}

function minimizeSheetForMapInteraction() {
  if (!isMobileLayout() || state.isAnimatingToPlace) return;
  setMobileSheetStage("peek");
}

function keepSelectedMarkerAboveSheet(place) {
  if (!isMobileLayout() || state.selectedPlaceId !== place.id) return;
  const sheetHeight = sidePanel.getBoundingClientRect().height;
  map.panInside([place.latitude, place.longitude], {
    paddingTopLeft: L.point(20, 118),
    paddingBottomRight: L.point(20, sheetHeight + 28),
    animate: true,
    duration: 0.35,
  });
}

function isMobileLayout() {
  return mobileLayoutQuery.matches;
}

function getMobileSheetHeights() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  return {
    peek: Math.max(128, viewportHeight * 0.2),
    half: viewportHeight * 0.5,
    full: viewportHeight * 0.9,
  };
}

function getClosestSheetStage(height) {
  const heights = getMobileSheetHeights();
  return Object.entries(heights).reduce((closest, [stage, stageHeight]) =>
    Math.abs(stageHeight - height) < Math.abs(heights[closest] - height) ? stage : closest,
  "peek");
}

function setMobileSheetStage(stage, { animate = true } = {}) {
  state.mobileSheetStage = stage;
  if (!isMobileLayout()) {
    delete app.dataset.sheetStage;
    return;
  }
  app.dataset.sheetStage = stage;
  sidePanel.classList.toggle("without-sheet-animation", !animate);
  if (!animate) window.setTimeout(() => sidePanel.classList.remove("without-sheet-animation"), 0);
}

function toggleTracking() {
  if (state.tracking) {
    stopTracking();
  } else {
    startTracking();
  }
}

function startTracking() {
  if (!navigator.geolocation) {
    showToast("この端末ではGPSを利用できません。");
    return;
  }
  if (!turfApi) {
    showToast("領域判定ライブラリを読み込めませんでした。通信状態を確認してください。");
    return;
  }

  const startedAt = new Date().toISOString();
  state.tracking = true;
  state.followTracking = true;
  state.trackingDistanceMeters = 0;
  state.lastAccuracyMeters = null;
  state.trackingMessage = "GPS接続中";
  state.activeTrack = {
    id: `track:${startedAt}:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`,
    startedAt,
    endedAt: null,
    coordinates: [],
    samples: [],
  };
  state.activeTrailCoordinates = [];
  state.sessionReferenceTracks = [];
  state.historicContactAnchor = null;
  activeTrackLine.setLatLngs([]);
  renderTerritoryHud();
  requestTrackingWakeLock();

  state.watchId = navigator.geolocation.watchPosition(
    handleTrackingPosition,
    handleTrackingError,
    GPS_OPTIONS,
  );
}

function stopTracking({ save = true, notify = true } = {}) {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;

  if (save && state.activeTrack?.coordinates.length >= 2) {
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
  renderTerritoryHud();
  if (notify) showToast("GPS軌跡を保存しました。");
}

function handleTrackingPosition(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const sampleTimestamp = position.timestamp || Date.now();
  const coordinate = [roundCoordinate(longitude), roundCoordinate(latitude)];
  state.lastAccuracyMeters = accuracy;
  updateLocationVisualization(coordinate, accuracy);

  if (accuracy > MAXIMUM_ACCEPTED_ACCURACY_METERS) {
    state.trackingMessage = `精度待ち ±${Math.round(accuracy)}m`;
    renderTerritoryHud();
    return;
  }

  const previousSample = state.activeTrack?.samples.at(-1);
  if (
    previousSample &&
    sampleTimestamp - Date.parse(previousSample.timestamp) < MINIMUM_POINT_INTERVAL_MILLISECONDS
  ) {
    state.trackingMessage = `記録中 ±${Math.round(accuracy)}m`;
    renderTerritoryHud();
    return;
  }

  const previousCoordinate = state.activeTrack?.coordinates.at(-1);
  if (previousCoordinate) {
    const movedMeters = distanceMeters(turfApi, previousCoordinate, coordinate);
    if (movedMeters < MINIMUM_POINT_DISTANCE_METERS) {
      state.trackingMessage = `記録中 ±${Math.round(accuracy)}m`;
      renderTerritoryHud();
      return;
    }
    state.trackingDistanceMeters += movedMeters;
  }

  const isFirstPoint = !state.activeTrack.coordinates.length;
  state.activeTrack.coordinates.push(coordinate);
  state.activeTrack.samples.push({
    longitude: coordinate[0],
    latitude: coordinate[1],
    accuracy: Math.round(accuracy),
    timestamp: new Date(sampleTimestamp).toISOString(),
  });
  state.activeTrailCoordinates.push(coordinate);
  state.trackingMessage = `記録中 ±${Math.round(accuracy)}m`;
  activeTrackLine.setLatLngs(toLeafletCoordinates(state.activeTrack.coordinates));
  persistJson(ACTIVE_TRACK_STORAGE_KEY, state.activeTrack);

  detectTerritoryClosure(coordinate);
  renderTerritoryHud();

  const latLng = [coordinate[1], coordinate[0]];
  if (isFirstPoint) {
    map.flyTo(latLng, Math.max(map.getZoom(), 17), { duration: 0.65 });
  } else if (state.followTracking) {
    const sheetPadding = isMobileLayout() ? sidePanel.getBoundingClientRect().height + 28 : 28;
    map.panInside(latLng, {
      paddingTopLeft: L.point(24, 122),
      paddingBottomRight: L.point(24, sheetPadding),
      animate: true,
      duration: 0.3,
    });
  }
}

function handleTrackingError(error) {
  const messageByCode = {
    1: "位置情報の利用が許可されていません。",
    2: "現在位置を取得できません。",
    3: "GPSの取得がタイムアウトしました。",
  };
  const message = messageByCode[error.code] || "GPSでエラーが発生しました。";

  if (error.code === 1) {
    stopTracking({ save: false, notify: false });
    showToast(message);
    return;
  }

  state.trackingMessage = "GPS再接続中";
  renderTerritoryHud();
  showToast(message);
}

function detectTerritoryClosure(currentCoordinate) {
  const selfClosure = detectSelfClosure(
    turfApi,
    state.activeTrailCoordinates,
    TERRITORY_OPTIONS,
  );
  if (selfClosure) {
    captureTerritory(selfClosure, currentCoordinate);
    return;
  }

  const referenceTracks = [...state.savedTracks, ...state.sessionReferenceTracks];
  if (!referenceTracks.length) return;
  const contact = findNearestTrackContact(
    turfApi,
    currentCoordinate,
    referenceTracks,
    CLOSE_THRESHOLD_METERS,
  );
  if (!contact) return;

  if (!state.historicContactAnchor) {
    state.historicContactAnchor = {
      ...contact,
      trailIndex: state.activeTrailCoordinates.length - 1,
    };
    return;
  }
  if (state.historicContactAnchor.trackId !== contact.trackId) return;

  const referenceTrack = referenceTracks.find((track) => track.id === contact.trackId);
  const historicClosure = detectHistoricClosure(
    turfApi,
    state.activeTrailCoordinates,
    referenceTrack,
    state.historicContactAnchor,
    contact,
    TERRITORY_OPTIONS,
  );
  if (historicClosure) captureTerritory(historicClosure, currentCoordinate);
}

function captureTerritory(result, currentCoordinate) {
  const capturedAt = new Date().toISOString();
  const territory = {
    id: `territory:${capturedAt}:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`,
    capturedAt,
    areaSquareMeters: result.areaSquareMeters,
    coordinates: result.ring,
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
  showToast(`領域を獲得しました +${formatArea(result.areaSquareMeters)}`);
}

function updateLocationVisualization([longitude, latitude], accuracy) {
  const latLng = [latitude, longitude];
  if (!accuracyCircle) {
    accuracyCircle = L.circle(latLng, {
      radius: accuracy,
      color: "#2f7dd1",
      weight: 1,
      opacity: 0.55,
      fillColor: "#2f7dd1",
      fillOpacity: 0.1,
      interactive: false,
    }).addTo(map);
  } else {
    accuracyCircle.setLatLng(latLng).setRadius(accuracy);
  }

  if (!locationMarker) {
    locationMarker = L.circleMarker(latLng, {
      radius: 7,
      color: "#ffffff",
      weight: 3,
      fillColor: "#2f7dd1",
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
  } else {
    locationMarker.setLatLng(latLng);
  }
}

function recoverInterruptedTrack() {
  const recoveredTrack = loadStoredObject(ACTIVE_TRACK_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_TRACK_STORAGE_KEY);
  if (!recoveredTrack?.id || !Array.isArray(recoveredTrack.coordinates) || recoveredTrack.coordinates.length < 2) {
    return;
  }
  recoveredTrack.endedAt = recoveredTrack.endedAt || new Date().toISOString();
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
      color: "#b88712",
      weight: 2,
      opacity: 0.88,
      fillColor: "#f3c845",
      fillOpacity: 0.28,
    })
      .bindTooltip(`獲得領域 ${formatArea(territory.areaSquareMeters)}`, { sticky: true })
      .addTo(territoryPolygonLayer);
  }
}

function renderSavedTracks() {
  savedTrackLayer.clearLayers();
  for (const track of state.savedTracks) {
    if (!Array.isArray(track.coordinates) || track.coordinates.length < 2) continue;
    L.polyline(toLeafletCoordinates(track.coordinates), {
      color: "#557080",
      weight: 3,
      opacity: 0.48,
      dashArray: "5 8",
      interactive: false,
    }).addTo(savedTrackLayer);
  }
}

function renderTerritoryHud() {
  const totalArea = state.territories.reduce(
    (sum, territory) => sum + (Number(territory.areaSquareMeters) || 0),
    0,
  );
  territoryControl.classList.toggle("is-tracking", state.tracking);
  trackingStatus.classList.toggle(
    "has-low-accuracy",
    state.tracking && state.lastAccuracyMeters > MAXIMUM_ACCEPTED_ACCURACY_METERS,
  );
  trackingStatus.lastChild.textContent = state.trackingMessage || "GPS OFF";
  territoryArea.textContent = `獲得 ${formatArea(totalArea)}`;
  trackingDistance.textContent = `移動 ${formatTrackingDistance(state.trackingDistanceMeters)}`;
  trackingToggleLabel.textContent = state.tracking ? "STOP" : "START";
  trackingToggle.querySelector(".tracking-icon").innerHTML = state.tracking ? icons.stop : icons.play;
  trackingToggle.setAttribute(
    "aria-label",
    state.tracking ? "GPS軌跡の記録を停止" : "GPS軌跡の記録を開始",
  );
}

async function requestTrackingWakeLock() {
  if (!state.tracking || !navigator.wakeLock || document.visibilityState !== "visible") return;
  try {
    const wakeLock = await navigator.wakeLock.request("screen");
    if (!state.tracking) {
      await wakeLock.release();
      return;
    }
    state.wakeLock = wakeLock;
    wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
    });
  } catch {
    state.wakeLock = null;
  }
}

async function releaseTrackingWakeLock() {
  try {
    await state.wakeLock?.release();
  } catch {
    // The browser may already have released it when the page became hidden.
  }
  state.wakeLock = null;
}

function handleLocate() {
  if (!navigator.geolocation) {
    showToast("このブラウザでは現在地を取得できません。");
    return;
  }

  locateButton.setAttribute("aria-busy", "true");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      locateButton.removeAttribute("aria-busy");
      map.flyTo([position.coords.latitude, position.coords.longitude], 15, { duration: 0.7 });
    },
    () => {
      locateButton.removeAttribute("aria-busy");
      showToast("現在地を取得できませんでした。ブラウザの位置情報設定を確認してください。");
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  );
}

function toggleVisited(placeId) {
  if (state.visited.has(placeId)) {
    state.visited.delete(placeId);
  } else {
    state.visited.add(placeId);
  }
  localStorage.setItem("corporation-map-visited", JSON.stringify([...state.visited]));
  const selected = getSelectedPlace();
  if (selected) renderSidePanel();
}

function applyInitialTheme() {
  const saved = localStorage.getItem("corporation-map-theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  app.classList.toggle("dark", theme === "dark");
  setBaseLayer(theme);
  themeIcon.innerHTML = theme === "dark" ? icons.sun : icons.moon;
}

function toggleTheme() {
  const dark = !app.classList.contains("dark");
  app.classList.toggle("dark", dark);
  const theme = dark ? "dark" : "light";
  localStorage.setItem("corporation-map-theme", theme);
  setBaseLayer(theme);
  themeIcon.innerHTML = dark ? icons.sun : icons.moon;
}

function setBaseLayer(theme) {
  const nextLayer = baseLayers[theme] || baseLayers.light;
  if (activeBaseLayer === nextLayer) return;
  if (activeBaseLayer) map.removeLayer(activeBaseLayer);
  activeBaseLayer = nextLayer;
  activeBaseLayer.addTo(map);
  scheduleMapResize();
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  existing?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  app.append(toast);
  setTimeout(() => toast.remove(), 3800);
}

function loadStoredArray(key) {
  const value = loadStoredObject(key);
  return Array.isArray(value) ? value : [];
}

function loadStoredObject(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function persistJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("端末内の保存容量が不足しています。");
  }
}

function toLeafletCoordinates(coordinates) {
  return coordinates.map(([longitude, latitude]) => [latitude, longitude]);
}

function roundCoordinate(value) {
  return Number(value.toFixed(7));
}

function formatArea(squareMeters) {
  if (squareMeters < 10_000) return `${Math.round(squareMeters).toLocaleString("ja-JP")}m²`;
  return `${(squareMeters / 10_000).toFixed(2)}ha`;
}

function formatTrackingDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(2)}km`;
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function detailRow(label, value) {
  if (!value) return "";
  return `<dt>${label}</dt><dd>${escapeHtml(String(value))}</dd>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
