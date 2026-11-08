/**
 * PathBack — Main application controller
 */

import { GPSTracker } from './gps.js';
import { RouteVisualizer } from './visualization.js';
import {
  saveJourney,
  getAllJourneys,
  getJourney,
  deleteJourney,
  renameJourney,
} from './storage.js';
import {
  pathDistance,
  formatDistance,
  formatDuration,
  formatTimestamp,
  reverseRoute,
  distanceToRoute,
  generateId,
  haversine,
} from './utils.js';

// ── State ──────────────────────────────────────────────
const state = {
  mode: 'idle', // idle | recording | viewing | retracing
  currentJourney: null, // while recording
  loadedJourney: null, // selected for view/retrace
  retraceRoute: null, // reversed points
  startTime: null,
  durationTimer: null,
  journeys: [],
};

// ── DOM refs ───────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);

const els = {
  statusTitle: $('#status-title'),
  statusBadge: $('#status-badge'),
  nameGroup: $('#name-group'),
  journeyName: $('#journey-name'),
  canvas: $('#route-canvas'),
  liveStats: $('#live-stats'),
  statDistance: $('#stat-distance'),
  statDuration: $('#stat-duration'),
  statPoints: $('#stat-points'),
  statAccuracy: $('#stat-accuracy'),
  trackingControls: $('#tracking-controls'),
  btnStart: $('#btn-start'),
  btnStop: $('#btn-stop'),
  retraceControls: $('#retrace-controls'),
  btnStartRetrace: $('#btn-start-retrace'),
  btnExitRetrace: $('#btn-exit-retrace'),
  deviationWarning: $('#deviation-warning'),
  geoNotice: $('#geo-notice'),
  journeyList: $('#journey-list'),
  journeyCount: $('#journey-count'),
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
  btnRename: $('#btn-rename'),
  btnDelete: $('#btn-delete'),
  toast: $('#toast'),
};

// ── Services ───────────────────────────────────────────
const tracker = new GPSTracker();
const visualizer = new RouteVisualizer(els.canvas);

// ── Init ───────────────────────────────────────────────
async function init() {
  if (!GPSTracker.isAvailable()) {
    showToast('Geolocation is not supported in this browser.');
    els.btnStart.disabled = true;
  }

  tracker.onPoint = onGPSPoint;
  tracker.onError = onGPSError;
  tracker.onAccuracy = (acc) => {
    els.statAccuracy.textContent = acc != null ? Math.round(acc) : '—';
  };

  els.btnStart.addEventListener('click', startRecording);
  els.btnStop.addEventListener('click', stopRecording);
  els.btnStartRetrace.addEventListener('click', startRetracing);
  els.btnExitRetrace.addEventListener('click', exitRetrace);
  els.modalClose.addEventListener('click', closeModal);
  els.modalBackdrop.addEventListener('click', closeModal);
  els.btnRetrace.addEventListener('click', () => {
    closeModal();
    enterRetraceMode(state.loadedJourney);
  });
  els.btnView.addEventListener('click', () => {
    closeModal();
    viewJourney(state.loadedJourney);
  });
  els.btnRename.addEventListener('click', handleRename);
  els.btnDelete.addEventListener('click', handleDelete);

  await refreshJourneyList();
  updateUI();
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

  visualizer.clear();
  tracker.clearPoints();

  const started = tracker.start();
  if (!started) return;

  startDurationTimer();
  updateUI();
  showToast('Tracking started. Move around to record your path.');
}

async function stopRecording() {
  tracker.stop();
  stopDurationTimer();

  const journey = state.currentJourney;
  if (!journey) return;

  journey.endedAt = Date.now();
  journey.points = tracker.getPoints();
  journey.distance = pathDistance(journey.points);
  journey.duration = journey.endedAt - journey.startedAt;

  if (journey.points.length < 2) {
    showToast('Not enough points recorded. Journey not saved.');
    state.mode = 'idle';
    state.currentJourney = null;
    updateUI();
    return;
  }

  try {
    await saveJourney(journey);
    showToast(`Saved “${journey.name}” — ${formatDistance(journey.distance)} km`);
  } catch (err) {
    console.error(err);
    showToast('Failed to save journey. Storage may be full or blocked.');
  }

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
    els.statPoints.textContent = allPoints.length;
    visualizer.setRoute(allPoints, point, 'record');
  }

  if (state.mode === 'retracing' && state.retraceRoute) {
    // Live position on the reversed route
    visualizer.setRoute(state.retraceRoute, point, 'retrace');
    checkDeviation(point);
  }
}

function onGPSError(err) {
  showToast(err.message || 'Location error');
  if (state.mode === 'recording') {
    // Keep recording state so user can retry or stop
  }
}

// ── Duration timer ─────────────────────────────────────
function startDurationTimer() {
  stopDurationTimer();
  state.durationTimer = setInterval(() => {
    if (!state.startTime) return;
    const elapsed = Date.now() - state.startTime;
    els.statDuration.textContent = formatDuration(elapsed);
  }, 1000);
}

function stopDurationTimer() {
  if (state.durationTimer) {
    clearInterval(state.durationTimer);
    state.durationTimer = null;
  }
}

// ── Journey list ───────────────────────────────────────
async function refreshJourneyList() {
  try {
    state.journeys = await getAllJourneys();
  } catch (err) {
    console.error(err);
    state.journeys = [];
  }

  els.journeyCount.textContent = state.journeys.length;

  if (state.journeys.length === 0) {
    els.journeyList.innerHTML =
      '<p class="empty-state">No journeys yet. Start tracking to create your first path.</p>';
    return;
  }

  els.journeyList.innerHTML = state.journeys
    .map(
      (j) => `
    <div class="journey-item" data-id="${j.id}" role="button" tabindex="0">
      <div class="journey-info">
        <div class="journey-name">${escapeHtml(j.name)}</div>
        <div class="journey-meta">${formatDistance(j.distance)} km · ${formatDuration(j.duration)} · ${j.points?.length || 0} pts</div>
      </div>
      <span class="journey-arrow">›</span>
    </div>`
    )
    .join('');

  els.journeyList.querySelectorAll('.journey-item').forEach((el) => {
    el.addEventListener('click', () => openJourneyModal(el.dataset.id));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openJourneyModal(el.dataset.id);
      }
    });
  });
}

async function openJourneyModal(id) {
  const journey = await getJourney(id);
  if (!journey) {
    showToast('Journey not found');
    return;
  }
  state.loadedJourney = journey;

  els.modalTitle.textContent = journey.name;
  els.modalDistance.textContent = formatDistance(journey.distance) + ' km';
  els.modalDuration.textContent = formatDuration(journey.duration);
  els.modalPoints.textContent = journey.points?.length || 0;
  els.modalStarted.textContent = formatTimestamp(journey.startedAt);
  els.modalEnded.textContent = formatTimestamp(journey.endedAt);

  els.modal.classList.remove('hidden');
}

function closeModal() {
  els.modal.classList.add('hidden');
}

// ── View / Retrace ─────────────────────────────────────
function viewJourney(journey) {
  if (!journey) return;
  state.mode = 'viewing';
  state.loadedJourney = journey;
  state.retraceRoute = null;
  tracker.stop();
  stopDurationTimer();

  visualizer.setRoute(journey.points, null, 'view');
  els.statDistance.textContent = formatDistance(journey.distance);
  els.statDuration.textContent = formatDuration(journey.duration);
  els.statPoints.textContent = journey.points?.length || 0;
  els.statAccuracy.textContent = '—';
  updateUI();
  showToast('Viewing saved route');
}

function enterRetraceMode(journey) {
  if (!journey || !journey.points?.length) {
    showToast('Cannot retrace — no points');
    return;
  }
  state.mode = 'retracing';
  state.loadedJourney = journey;
  state.retraceRoute = reverseRoute(journey.points);
  state.startTime = null;
  tracker.stop();
  stopDurationTimer();

  // Show reversed route, waiting for user to start live tracking
  visualizer.setRoute(state.retraceRoute, null, 'retrace');
  els.statDistance.textContent = formatDistance(journey.distance);
  els.statDuration.textContent = formatDuration(journey.duration);
  els.statPoints.textContent = journey.points.length;
  els.statAccuracy.textContent = '—';
  els.deviationWarning.classList.add('hidden');
  updateUI();
  showToast('Route reversed. Press “Start Retracing” to track your return.');
}

async function startRetracing() {
  if (state.mode !== 'retracing' || !state.retraceRoute) return;

  const started = tracker.start();
  if (!started) return;

  state.startTime = Date.now();
  startDurationTimer();
  showToast('Retracing active. Follow the dashed path back to Start.');
  updateUI();
}

function exitRetrace() {
  tracker.stop();
  stopDurationTimer();
  state.mode = 'idle';
  state.loadedJourney = null;
  state.retraceRoute = null;
  visualizer.clear();
  els.deviationWarning.classList.add('hidden');
  resetStats();
  updateUI();
}

/**
 * Basic deviation detection.
 * Warns if current position is further than (threshold + accuracy) from the route.
 */
function checkDeviation(currentPos) {
  if (!state.retraceRoute || state.retraceRoute.length < 2) return;

  const dist = distanceToRoute(currentPos, state.retraceRoute);
  const accuracy = currentPos.accuracy || 20;
  // Threshold: 40 m base + accuracy buffer to reduce false alarms
  const threshold = 40 + accuracy;

  if (dist > threshold) {
    els.deviationWarning.classList.remove('hidden');
  } else {
    els.deviationWarning.classList.add('hidden');
  }
}

// ── Rename / Delete ────────────────────────────────────
async function handleRename() {
  if (!state.loadedJourney) return;
  const newName = prompt('Rename journey', state.loadedJourney.name);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) {
    showToast('Name cannot be empty');
    return;
  }
  try {
    await renameJourney(state.loadedJourney.id, trimmed);
    state.loadedJourney.name = trimmed;
    els.modalTitle.textContent = trimmed;
    await refreshJourneyList();
    showToast('Renamed');
  } catch (err) {
    showToast('Rename failed');
  }
}

async function handleDelete() {
  if (!state.loadedJourney) return;
  const ok = confirm(`Delete “${state.loadedJourney.name}”? This cannot be undone.`);
  if (!ok) return;
  try {
    await deleteJourney(state.loadedJourney.id);
    closeModal();
    if (
      state.loadedJourney &&
      (state.mode === 'viewing' || state.mode === 'retracing')
    ) {
      exitRetrace();
    }
    state.loadedJourney = null;
    await refreshJourneyList();
    showToast('Journey deleted');
  } catch (err) {
    showToast('Delete failed');
  }
}

// ── UI helpers ─────────────────────────────────────────
function updateUI() {
  const mode = state.mode;

  // Status badge
  els.statusBadge.className = 'status-badge';
  if (mode === 'recording') {
    els.statusTitle.textContent = 'Recording';
    els.statusBadge.textContent = 'Live';
    els.statusBadge.classList.add('recording');
  } else if (mode === 'retracing') {
    els.statusTitle.textContent = tracker.isTracking
      ? 'Retracing'
      : 'Ready to retrace';
    els.statusBadge.textContent = tracker.isTracking ? 'Active' : 'Retrace';
    els.statusBadge.classList.add('retracing');
  } else if (mode === 'viewing') {
    els.statusTitle.textContent = 'Viewing route';
    els.statusBadge.textContent = 'Saved';
  } else {
    els.statusTitle.textContent = 'Ready to track';
    els.statusBadge.textContent = 'Idle';
  }

  // Name input
  els.journeyName.disabled = mode === 'recording';
  if (mode === 'idle') {
    // keep current value
  }

  // Controls visibility
  const showTracking = mode === 'idle' || mode === 'recording' || mode === 'viewing';
  const showRetrace = mode === 'retracing';

  els.trackingControls.classList.toggle('hidden', !showTracking || mode === 'retracing');
  els.btnStart.classList.toggle('hidden', mode === 'recording');
  els.btnStop.classList.toggle('hidden', mode !== 'recording');
  els.nameGroup.classList.toggle('hidden', mode === 'retracing' || mode === 'viewing');

  els.retraceControls.classList.toggle('hidden', !showRetrace);
  els.btnStartRetrace.classList.toggle(
    'hidden',
    mode !== 'retracing' || tracker.isTracking
  );
  // Exit always visible in retrace mode
}

function resetStats() {
  els.statDistance.textContent = '0.00';
  els.statDuration.textContent = '00:00';
  els.statPoints.textContent = '0';
  els.statAccuracy.textContent = '—';
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 3200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Boot ───────────────────────────────────────────────
init().catch((err) => {
  console.error('Init failed', err);
  showToast('App failed to start. Check console.');
});
