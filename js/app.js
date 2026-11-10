/**
 * TrailTrace — Main application controller
 */

import { GPSTracker } from './gps.js';
import { SchematicMap } from './schematic.js';
import { LeafletMap } from './leaflet-map.js';
import { Compass } from './compass.js';
import {
  saveJourney, getAllJourneys, getJourney, deleteJourney, renameJourney,
  saveActiveSession, getActiveSession, clearActiveSession,
  saveWaypoint, getWaypointsForJourney,
} from './storage.js';
import {
  pathDistance, formatDistance, formatDuration, formatTimestamp,
  reverseRoute, nearestOnRoute, remainingRouteDistance, bearing,
  smoothHeading, isNearDestination, generateId, haversine,
} from './utils.js';
import { downloadGPX, importGPX } from './gpx.js';

// ── State ──────────────────────────────────────────────
const state = {
  mode: 'idle', // idle | recording | viewing | retracing
  mapMode: 'schematic', // schematic | real
  currentJourney: null,
  loadedJourney: null,
  retraceRoute: null,
  startTime: null,
  durationTimer: null,
  journeys: [],
  waypoints: [],
  follow: true,
  headingUp: true,
  lastHeading: null,
  wakeLock: null,
  deviationThreshold: 40, // metres base
};

// ── DOM ────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const els = {
  btnMenu: $('#btn-menu'),
  btnCloseSidebar: $('#btn-close-sidebar'),
  sidebar: $('#sidebar'),
  sidebarBackdrop: $('#sidebar-backdrop'),
  connBadge: $('#conn-badge'),
  statusPill: $('#status-pill'),
  schematicCanvas: $('#schematic-canvas'),
  leafletContainer: $('#leaflet-container'),
  mapModeLabel: $('#map-mode-label'),
  btnRecenter: $('#btn-recenter'),
  btnHeadingUp: $('#btn-heading-up'),
  btnNorthUp: $('#btn-north-up'),
  btnMapMode: $('#btn-map-mode'),
  routeStatus: $('#route-status'),
  routeStatusText: $('#route-status-text'),
  routeStatusDist: $('#route-status-dist'),
  statDistance: $('#stat-distance'),
  statRemaining: $('#stat-remaining'),
  statDuration: $('#stat-duration'),
  statAccuracy: $('#stat-accuracy'),
  journeyName: $('#journey-name'),
  btnStart: $('#btn-start'),
  btnStop: $('#btn-stop'),
  btnStartRetrace: $('#btn-start-retrace'),
  btnExitRetrace: $('#btn-exit-retrace'),
  btnModeReal: $('#btn-mode-real'),
  btnModeSchematic: $('#btn-mode-schematic'),
  compassRose: $('#compass-rose'),
  headingValue: $('#heading-value'),
  headingSource: $('#heading-source'),
  sidePoints: $('#side-points'),
  sideCoords: $('#side-coords'),
  sideStatus: $('#side-status'),
  btnAddWaypoint: $('#btn-add-waypoint'),
  journeyList: $('#journey-list'),
  journeyCount: $('#journey-count'),
  gpxImport: $('#gpx-import'),
  modal: $('#journey-modal'),
  modalBackdrop: $('#modal-backdrop'),
  modalClose: $('#modal-close'),
  modalTitle: $('#modal-title'),
  modalDistance: $('#modal-distance'),
  modalDuration: $('#modal-duration'),
  modalPoints: $('#modal-points'),
  modalStarted: $('#modal-started'),
  modalEnded: $('#modal-ended'),
  btnRetrace: $('#btn-retrace'),
  btnView: $('#btn-view'),
  btnExportGpx: $('#btn-export-gpx'),
  btnRename: $('#btn-rename'),
  btnDelete: $('#btn-delete'),
  toast: $('#toast'),
};

// ── Services ───────────────────────────────────────────
const tracker = new GPSTracker();
const schematic = new SchematicMap(els.schematicCanvas);
const realMap = new LeafletMap(els.leafletContainer);
const compass = new Compass();

// ── Init ───────────────────────────────────────────────
async function init() {
  updateConnectionStatus();
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);

  tracker.on('point', onGPSPoint);
  tracker.on('raw', onGPSRaw);
  tracker.on('error', (err) => showToast(err.message));
  tracker.on('accuracy', (acc) => {
    els.statAccuracy.textContent = acc != null ? Math.round(acc) + ' m' : '—';
  });

  compass.onChange(({ heading, source }) => {
    if (heading != null) {
      state.lastHeading = heading;
      els.headingValue.textContent = Math.round(heading) + '°';
      els.headingSource.textContent = source === 'device' ? 'Device compass' : source === 'gps' ? 'GPS course' : 'No heading';
      els.compassRose.style.transform = `rotate(${-heading}deg)`;
      schematic.setHeading(heading);
    }
  });

  // UI events
  els.btnMenu.addEventListener('click', () => openSidebar());
  els.btnCloseSidebar.addEventListener('click', closeSidebar);
  els.sidebarBackdrop.addEventListener('click', closeSidebar);
  els.btnStart.addEventListener('click', startRecording);
  els.btnStop.addEventListener('click', stopRecording);
  els.btnStartRetrace.addEventListener('click', startRetracing);
  els.btnExitRetrace.addEventListener('click', exitRetrace);
  els.btnRecenter.addEventListener('click', () => {
    state.follow = true;
    schematic.recenter();
    const pos = tracker.lastPosition;
    if (pos) realMap.recenter(pos);
  });
  els.btnHeadingUp.addEventListener('click', async () => {
    state.headingUp = true;
    schematic.setHeadingUp(true);
    els.btnHeadingUp.classList.add('active');
    els.btnNorthUp.classList.remove('active');
    await compass.requestPermission();
    compass.start();
  });
  els.btnNorthUp.addEventListener('click', () => {
    state.headingUp = false;
    schematic.setHeadingUp(false);
    schematic.heading = 0;
    els.btnNorthUp.classList.add('active');
    els.btnHeadingUp.classList.remove('active');
    schematic.draw();
  });
  els.btnMapMode.addEventListener('click', toggleMapMode);
  els.btnModeReal.addEventListener('click', () => setMapMode('real'));
  els.btnModeSchematic.addEventListener('click', () => setMapMode('schematic'));
  els.btnAddWaypoint.addEventListener('click', addWaypoint);
  els.gpxImport.addEventListener('change', handleGpxImport);

  els.modalClose.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', closeModal);
  els.btnRetrace.addEventListener('click', () => { closeModal(); enterRetraceMode(state.loadedJourney); });
  els.btnView.addEventListener('click', () => { closeModal(); viewJourney(state.loadedJourney); });
  els.btnExportGpx.addEventListener('click', () => {
    if (state.loadedJourney) downloadGPX(state.loadedJourney);
  });
  els.btnRename.addEventListener('click', handleRename);
  els.btnDelete.addEventListener('click', handleDelete);

  // Defaults
  els.btnHeadingUp.classList.add('active');
  schematic.setHeadingUp(true);

  await refreshJourneyList();
  await tryRecoverSession();
  updateUI();

  // Try compass permission on first interaction
  document.body.addEventListener('click', async function once() {
    await compass.requestPermission();
    compass.start();
    document.body.removeEventListener('click', once);
  }, { once: true });
}

// ── Connection ─────────────────────────────────────────
function updateConnectionStatus() {
  const online = navigator.onLine;
  els.connBadge.textContent = online ? 'Online' : 'Offline';
  els.connBadge.className = 'conn-badge ' + (online ? 'online' : 'offline');
}

// ── Map mode ───────────────────────────────────────────
function setMapMode(mode) {
  state.mapMode = mode;
  if (mode === 'real') {
    els.leafletContainer.classList.remove('hidden');
    els.schematicCanvas.classList.add('hidden');
    els.mapModeLabel.textContent = 'Real map';
    els.btnModeReal.classList.add('btn-active');
    els.btnModeSchematic.classList.remove('btn-active');
    realMap.init();
    realMap.invalidateSize();
    syncMaps();
  } else {
    els.schematicCanvas.classList.remove('hidden');
    els.leafletContainer.classList.add('hidden');
    els.mapModeLabel.textContent = 'Schematic';
    els.btnModeSchematic.classList.add('btn-active');
    els.btnModeReal.classList.remove('btn-active');
    schematic._resize();
    syncMaps();
  }
}

function toggleMapMode() {
  setMapMode(state.mapMode === 'schematic' ? 'real' : 'schematic');
}

function syncMaps() {
  const pts = state.mode === 'retracing' && state.retraceRoute
    ? state.retraceRoute
    : (state.currentJourney?.points || state.loadedJourney?.points || []);
  const pos = tracker.lastPosition;
  const mode = state.mode === 'retracing' ? 'retrace' : state.mode === 'recording' ? 'record' : 'view';

  schematic.setRoute(pts, pos, mode);
  schematic.setWaypoints(state.waypoints);
  realMap.setRoute(pts, pos, mode);
  realMap.setWaypoints(state.waypoints);
}

// ── Recording ──────────────────────────────────────────
async function startRecording() {
  const name = (els.journeyName.value || '').trim() || 'Untitled Journey';
  state.mode = 'recording';
  state.currentJourney = {
    id: generateId(),
    name,
    points: [],
    startedAt: Date.now(),
    endedAt: null,
    distance: 0,
    duration: 0,
  };
  state.startTime = Date.now();
  state.loadedJourney = null;
  state.retraceRoute = null;
  state.waypoints = [];

  tracker.clearPoints();
  schematic.clear();
  realMap.clear();

  if (!tracker.start()) return;
  startDurationTimer();
  requestWakeLock();
  updateUI();
  showToast('Tracking started');
  persistSession();
}

async function stopRecording() {
  tracker.stop();
  stopDurationTimer();
  releaseWakeLock();

  const journey = state.currentJourney;
  if (!journey) return;

  journey.endedAt = Date.now();
  journey.points = tracker.getPoints();
  journey.distance = pathDistance(journey.points);
  journey.duration = journey.endedAt - journey.startedAt;

  if (journey.points.length < 2) {
    showToast('Not enough points — journey not saved');
    state.mode = 'idle';
    state.currentJourney = null;
    await clearActiveSession();
    updateUI();
    return;
  }

  try {
    await saveJourney(journey);
    // Save waypoints linked to this journey
    for (const wp of state.waypoints) {
      wp.journeyId = journey.id;
      await saveWaypoint(wp);
    }
    showToast(`Saved “${journey.name}” — ${formatDistance(journey.distance)}`);
  } catch (e) {
    console.error(e);
    showToast('Failed to save journey');
  }

  await clearActiveSession();
  state.mode = 'idle';
  state.currentJourney = null;
  await refreshJourneyList();
  updateUI();
}

function onGPSPoint(point, allPoints) {
  if (state.mode === 'recording' && state.currentJourney) {
    state.currentJourney.points = allPoints;
    state.currentJourney.distance = pathDistance(allPoints);
    els.statDistance.textContent = formatDistance(state.currentJourney.distance);
    els.sidePoints.textContent = allPoints.length;
    els.sideCoords.textContent = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    schematic.setRoute(allPoints, point, 'record');
    realMap.setRoute(allPoints, point, 'record');
    persistSession();
  }

  if (state.mode === 'retracing' && state.retraceRoute) {
    schematic.setRoute(state.retraceRoute, point, 'retrace');
    realMap.setRoute(state.retraceRoute, point, 'retrace');
    updateDeviation(point);
    const rem = remainingRouteDistance(point, state.retraceRoute);
    els.statRemaining.textContent = formatDistance(rem);

    // Arrival check — near the end of the reversed route (original start)
    const dest = state.retraceRoute[state.retraceRoute.length - 1];
    if (isNearDestination(point, dest, 30)) {
      showToast('You have reached the destination');
    }
  }

  // GPS course for compass
  if (point.heading != null && point.heading >= 0) {
    compass.updateGpsCourse(point.heading);
  } else if (allPoints && allPoints.length >= 2) {
    const a = allPoints[allPoints.length - 2];
    const b = allPoints[allPoints.length - 1];
    const brg = bearing(a.lat, a.lng, b.lat, b.lng);
    compass.updateGpsCourse(brg);
  }
}

function onGPSRaw(point) {
  els.sideCoords.textContent = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

// ── Deviation ──────────────────────────────────────────
function updateDeviation(pos) {
  if (!state.retraceRoute || state.retraceRoute.length < 2) return;

  const near = nearestOnRoute(pos, state.retraceRoute);
  const accuracy = pos.accuracy || 20;
  const threshold = state.deviationThreshold + accuracy;

  schematic.setConnector(near.distance > threshold * 0.5 ? near.closest : null);
  realMap.setConnector(
    near.distance > threshold * 0.5 ? pos : null,
    near.distance > threshold * 0.5 ? near.closest : null
  );

  els.routeStatus.classList.remove('hidden', 'on', 'off');
  if (near.distance > threshold) {
    els.routeStatus.classList.add('off');
    els.routeStatusText.textContent = 'OFF ROUTE';
    els.routeStatusDist.textContent = formatDistance(near.distance) + ' away';
  } else if (near.distance > threshold * 0.4) {
    els.routeStatus.classList.add('off');
    els.routeStatusText.textContent = 'RECONNECTING';
    els.routeStatusDist.textContent = formatDistance(near.distance);
  } else {
    els.routeStatus.classList.add('on');
    els.routeStatusText.textContent = 'ON ROUTE';
    els.routeStatusDist.textContent = '';
  }
}

// ── Retrace ────────────────────────────────────────────
function enterRetraceMode(journey) {
  if (!journey?.points?.length) {
    showToast('Cannot retrace — no points');
    return;
  }
  state.mode = 'retracing';
  state.loadedJourney = journey;
  state.retraceRoute = reverseRoute(journey.points);
  state.startTime = null;
  tracker.stop();
  stopDurationTimer();

  schematic.setRoute(state.retraceRoute, null, 'retrace');
  realMap.setRoute(state.retraceRoute, null, 'retrace');
  els.statDistance.textContent = formatDistance(journey.distance);
  els.statDuration.textContent = formatDuration(journey.duration);
  els.statRemaining.textContent = formatDistance(journey.distance);
  els.routeStatus.classList.add('hidden');
  updateUI();
  showToast('Route reversed. Press Start Retrace to begin.');
}

async function startRetracing() {
  if (state.mode !== 'retracing' || !state.retraceRoute) return;
  if (!tracker.start()) return;
  state.startTime = Date.now();
  startDurationTimer();
  requestWakeLock();
  compass.start();
  showToast('Retracing active — follow the dashed path');
  updateUI();
}

function exitRetrace() {
  tracker.stop();
  stopDurationTimer();
  releaseWakeLock();
  state.mode = 'idle';
  state.loadedJourney = null;
  state.retraceRoute = null;
  schematic.clear();
  realMap.clear();
  els.routeStatus.classList.add('hidden');
  els.statRemaining.textContent = '—';
  resetStats();
  updateUI();
}

function viewJourney(journey) {
  if (!journey) return;
  state.mode = 'viewing';
  state.loadedJourney = journey;
  state.retraceRoute = null;
  tracker.stop();
  stopDurationTimer();
  schematic.setRoute(journey.points, null, 'view');
  realMap.setRoute(journey.points, null, 'view');
  els.statDistance.textContent = formatDistance(journey.distance);
  els.statDuration.textContent = formatDuration(journey.duration);
  els.statRemaining.textContent = '—';
  getWaypointsForJourney(journey.id).then((wps) => {
    state.waypoints = wps;
    schematic.setWaypoints(wps);
    realMap.setWaypoints(wps);
  });
  updateUI();
  showToast('Viewing saved route');
}

// ── Waypoints ──────────────────────────────────────────
async function addWaypoint() {
  const pos = tracker.lastPosition;
  if (!pos) {
    showToast('No GPS position yet');
    return;
  }
  const name = prompt('Waypoint name', 'Waypoint');
  if (name === null) return;
  const wp = {
    id: generateId(),
    journeyId: state.currentJourney?.id || state.loadedJourney?.id || null,
    name: name.trim() || 'Waypoint',
    lat: pos.lat,
    lng: pos.lng,
    timestamp: Date.now(),
  };
  state.waypoints.push(wp);
  schematic.setWaypoints(state.waypoints);
  realMap.setWaypoints(state.waypoints);
  if (wp.journeyId) await saveWaypoint(wp);
  showToast(`Waypoint “${wp.name}” added`);
}

// ── Session recovery ───────────────────────────────────
async function persistSession() {
  if (state.mode !== 'recording' || !state.currentJourney) return;
  try {
    await saveActiveSession({
      mode: 'recording',
      journey: {
        ...state.currentJourney,
        points: tracker.getPoints(),
      },
      waypoints: state.waypoints,
    });
  } catch (e) {
    console.warn('Session persist failed', e);
  }
}

async function tryRecoverSession() {
  try {
    const session = await getActiveSession();
    if (!session || session.mode !== 'recording' || !session.journey?.points?.length) return;
    const age = Date.now() - (session.updatedAt || 0);
    if (age > 6 * 60 * 60 * 1000) {
      await clearActiveSession();
      return;
    }
    const ok = confirm(
      `Recover interrupted journey “${session.journey.name}” (${session.journey.points.length} points)?`
    );
    if (!ok) {
      await clearActiveSession();
      return;
    }
    state.mode = 'recording';
    state.currentJourney = session.journey;
    state.waypoints = session.waypoints || [];
    state.startTime = session.journey.startedAt;
    tracker.setPoints(session.journey.points);
    tracker.start();
    startDurationTimer();
    requestWakeLock();
    schematic.setRoute(session.journey.points, null, 'record');
    schematic.setWaypoints(state.waypoints);
    updateUI();
    showToast('Journey recovered — continue recording');
  } catch (e) {
    console.warn('Recovery failed', e);
  }
}

// ── Journey list / modal ───────────────────────────────
async function refreshJourneyList() {
  try {
    state.journeys = await getAllJourneys();
  } catch {
    state.journeys = [];
  }
  els.journeyCount.textContent = state.journeys.length;
  if (!state.journeys.length) {
    els.journeyList.innerHTML = '<p class="empty-state">No journeys yet.</p>';
    return;
  }
  els.journeyList.innerHTML = state.journeys
    .map(
      (j) => `<div class="journey-item" data-id="${j.id}">
        <div class="journey-name">${esc(j.name)}</div>
        <div class="journey-meta">${formatDistance(j.distance)} · ${formatDuration(j.duration)} · ${j.points?.length || 0} pts</div>
      </div>`
    )
    .join('');
  els.journeyList.querySelectorAll('.journey-item').forEach((el) => {
    el.addEventListener('click', () => openJourneyModal(el.dataset.id));
  });
}

async function openJourneyModal(id) {
  const journey = await getJourney(id);
  if (!journey) return;
  state.loadedJourney = journey;
  els.modalTitle.textContent = journey.name;
  els.modalDistance.textContent = formatDistance(journey.distance);
  els.modalDuration.textContent = formatDuration(journey.duration);
  els.modalPoints.textContent = journey.points?.length || 0;
  els.modalStarted.textContent = formatTimestamp(journey.startedAt);
  els.modalEnded.textContent = formatTimestamp(journey.endedAt);
  els.modal.classList.remove('hidden');
  closeSidebar();
}

function closeModal() {
  els.modal.classList.add('hidden');
}

async function handleRename() {
  if (!state.loadedJourney) return;
  const n = prompt('Rename journey', state.loadedJourney.name);
  if (n === null) return;
  await renameJourney(state.loadedJourney.id, n.trim());
  state.loadedJourney.name = n.trim();
  els.modalTitle.textContent = n.trim();
  await refreshJourneyList();
  showToast('Renamed');
}

async function handleDelete() {
  if (!state.loadedJourney) return;
  if (!confirm(`Delete “${state.loadedJourney.name}”?`)) return;
  await deleteJourney(state.loadedJourney.id);
  closeModal();
  if (state.mode === 'viewing' || state.mode === 'retracing') exitRetrace();
  state.loadedJourney = null;
  await refreshJourneyList();
  showToast('Deleted');
}

async function handleGpxImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const journey = importGPX(text);
    await saveJourney(journey);
    await refreshJourneyList();
    showToast(`Imported “${journey.name}”`);
  } catch (err) {
    showToast(err.message || 'Import failed');
  }
  e.target.value = '';
}

// ── Wake Lock ──────────────────────────────────────────
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => {
        state.wakeLock = null;
      });
    }
  } catch {
    /* unsupported or denied */
  }
}

function releaseWakeLock() {
  if (state.wakeLock) {
    state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
  }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && (state.mode === 'recording' || state.mode === 'retracing')) {
    requestWakeLock();
  }
});

// ── Timers / UI helpers ────────────────────────────────
function startDurationTimer() {
  stopDurationTimer();
  state.durationTimer = setInterval(() => {
    if (!state.startTime) return;
    els.statDuration.textContent = formatDuration(Date.now() - state.startTime);
  }, 1000);
}

function stopDurationTimer() {
  if (state.durationTimer) clearInterval(state.durationTimer);
  state.durationTimer = null;
}

function openSidebar() {
  els.sidebar.classList.add('open');
  els.sidebarBackdrop.classList.remove('hidden');
}

function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.sidebarBackdrop.classList.add('hidden');
}

function updateUI() {
  const m = state.mode;
  els.statusPill.className = 'status-pill';
  if (m === 'recording') {
    els.statusPill.textContent = 'Recording';
    els.statusPill.classList.add('recording');
    els.sideStatus.textContent = 'Recording';
  } else if (m === 'retracing') {
    els.statusPill.textContent = tracker.isTracking ? 'Retracing' : 'Retrace ready';
    els.statusPill.classList.add('retracing');
    els.sideStatus.textContent = tracker.isTracking ? 'Retracing' : 'Retrace ready';
  } else if (m === 'viewing') {
    els.statusPill.textContent = 'Viewing';
    els.sideStatus.textContent = 'Viewing';
  } else {
    els.statusPill.textContent = 'Idle';
    els.sideStatus.textContent = 'Idle';
  }

  els.journeyName.disabled = m === 'recording';
  els.btnStart.classList.toggle('hidden', m === 'recording' || m === 'retracing');
  els.btnStop.classList.toggle('hidden', m !== 'recording');
  els.btnStartRetrace.classList.toggle('hidden', m !== 'retracing' || tracker.isTracking);
  els.btnExitRetrace.classList.toggle('hidden', m !== 'retracing');
  els.btnAddWaypoint.disabled = !(m === 'recording' || (m === 'retracing' && tracker.isTracking));
}

function resetStats() {
  els.statDistance.textContent = '0 m';
  els.statDuration.textContent = '00:00';
  els.statAccuracy.textContent = '—';
  els.sidePoints.textContent = '0';
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add('hidden'), 3200);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Boot
init().catch((e) => {
  console.error(e);
  showToast('App failed to start');
});
