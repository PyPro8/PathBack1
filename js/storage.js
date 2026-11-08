/**
 * PathBack — IndexedDB storage for journeys.
 * No accounts, fully local, survives page refresh.
 */

const DB_NAME = 'PathBackDB';
const DB_VERSION = 1;
const STORE = 'journeys';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
    };
  });
  return dbPromise;
}

/**
 * Save a journey object.
 * @param {object} journey
 * @returns {Promise<object>}
 */
export async function saveJourney(journey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.put(journey);
    request.onsuccess = () => resolve(journey);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all journeys, newest first.
 * @returns {Promise<object[]>}
 */
export async function getAllJourneys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const list = request.result || [];
      list.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single journey by id.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getJourney(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a journey by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteJourney(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Rename a journey.
 * @param {string} id
 * @param {string} newName
 * @returns {Promise<object|null>}
 */
export async function renameJourney(id, newName) {
  const journey = await getJourney(id);
  if (!journey) return null;
  journey.name = (newName || '').trim() || 'Untitled Journey';
  return saveJourney(journey);
}
