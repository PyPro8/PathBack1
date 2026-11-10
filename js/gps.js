/**
 * TrailTrace — centralized GPS tracking service
 * Single watcher; broadcasts points to subscribers.
 */

import { shouldAcceptPoint } from './utils.js';

export class GPSTracker {
  constructor() {
    this.watchId = null;
    this.points = [];
    this.isTracking = false;
    this.lastAccuracy = null;
    this.lastPosition = null;
    this._listeners = { point: [], error: [], accuracy: [], raw: [] };
  }

  static isAvailable() {
    return 'geolocation' in navigator;
  }

  on(event, fn) {
    if (this._listeners[event]) this._listeners[event].push(fn);
    return () => {
      this._listeners[event] = this._listeners[event].filter((f) => f !== fn);
    };
  }

  _emit(event, ...args) {
    (this._listeners[event] || []).forEach((fn) => {
      try { fn(...args); } catch (e) { console.error(e); }
    });
  }

  start(options = {}) {
    if (!GPSTracker.isAvailable()) {
      this._emit('error', new Error('Geolocation is not supported by this browser.'));
      return false;
    }
    if (this.isTracking) return true;

    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 1500,
      timeout: 15000,
      ...options,
    };

    this.isTracking = true;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handle(pos),
      (err) => this._handleError(err),
      geoOptions
    );
    return true;
  }

  stop() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking = false;
  }

  clearPoints() {
    this.points = [];
  }

  getPoints() {
    return [...this.points];
  }

  setPoints(pts) {
    this.points = Array.isArray(pts) ? [...pts] : [];
  }

  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!GPSTracker.isAvailable()) {
        reject(new Error('Geolocation not available'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(this._toPoint(pos)),
        reject,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
      );
    });
  }

  _toPoint(pos) {
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp || Date.now(),
    };
  }

  _handle(pos) {
    const point = this._toPoint(pos);
    this.lastPosition = point;
    this.lastAccuracy = point.accuracy;
    this._emit('raw', point);
    this._emit('accuracy', point.accuracy);

    const last = this.points.length ? this.points[this.points.length - 1] : null;
    const decision = shouldAcceptPoint(point, last);
    if (decision.accept) {
      this.points.push(point);
      this._emit('point', point, this.points);
    }
  }

  _handleError(err) {
    let message = 'Location error';
    if (err.code === err.PERMISSION_DENIED) {
      message = 'Location permission denied. Allow location access and try again.';
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      message = 'Location unavailable. Check that GPS is enabled.';
    } else if (err.code === err.TIMEOUT) {
      message = 'Location request timed out. Move to an open area.';
    }
    this._emit('error', new Error(message));
  }
}
