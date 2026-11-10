/**
 * TrailTrace — IndexedDB persistence
 * Journeys, active session recovery, waypoints
 */

const DB_NAME = 'TrailTraceDB';
const DB_VERSION = 2;
const STORE_JOURNEYS = 'journeys';
const STORE_SESSION = 'session';
const STORE_WAYPOINTS = 'waypoints';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_JOURNEYS)) {
        const store = db.createObjectStore(STORE_JOURNEYS, { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORE_WAYPOINTS)) {
        const wp = db.createObjectStore(STORE_WAYPOINTS, { keyPath: 'id' });
        wp.createIndex('journeyId', 'journeyId', { unique: false });
      }
    };
  });
  return dbPromise;
}

export async function saveJourney(journey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOURNEYS, 'readwrite');
    tx.objectStore(STORE_JOURNEYS).put(journey);
    tx.oncomplete = () => resolve(journey);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllJourneys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOURNEYS, 'readonly');
    const req = tx.objectStore(STORE_JOURNEYS).getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getJourney(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_JOURNEYS, 'readonly').objectStore(STORE_JOURNEYS).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteJourney(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_JOURNEYS, STORE_WAYPOINTS], 'readwrite');
    tx.objectStore(STORE_JOURNEYS).delete(id);
    const wpStore = tx.objectStore(STORE_WAYPOINTS);
    const idx = wpStore.index('journeyId');
    const req = idx.getAllKeys(IDBKeyRange.only(id));
    req.onsuccess = () => {
      (req.result || []).forEach((key) => wpStore.delete(key));
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function renameJourney(id, newName) {
  const journey = await getJourney(id);
  if (!journey) return null;
  journey.name = (newName || '').trim() || 'Untitled Journey';
  return saveJourney(journey);
}

export async function saveActiveSession(session) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSION, 'readwrite');
    tx.objectStore(STORE_SESSION).put({ key: 'active', ...session, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getActiveSession() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_SESSION, 'readonly').objectStore(STORE_SESSION).get('active');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearActiveSession() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSION, 'readwrite');
    tx.objectStore(STORE_SESSION).delete('active');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveWaypoint(waypoint) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WAYPOINTS, 'readwrite');
    tx.objectStore(STORE_WAYPOINTS).put(waypoint);
    tx.oncomplete = () => resolve(waypoint);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getWaypointsForJourney(journeyId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const idx = db.transaction(STORE_WAYPOINTS, 'readonly').objectStore(STORE_WAYPOINTS).index('journeyId');
    const req = idx.getAll(journeyId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteWaypoint(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WAYPOINTS, 'readwrite');
    tx.objectStore(STORE_WAYPOINTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
