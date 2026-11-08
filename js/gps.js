/**
 * PathBack — Browser Geolocation tracking wrapper.
 */

import { shouldAcceptPoint, isValidCoordinate } from './utils.js';

export class GPSTracker {
  constructor() {
    this.watchId = null;
    this.points = [];
    this.onPoint = null; // callback(point)
    this.onError = null;
    this.onAccuracy = null;
    this.isTracking = false;
    this.lastAccuracy = null;
  }

  /**
   * Check if geolocation is available.
   */
  static isAvailable() {
    return 'geolocation' in navigator;
  }

  /**
   * Start watching position.
   * @param {object} options
   */
  start(options = {}) {
    if (!GPSTracker.isAvailable()) {
      if (this.onError) this.onError(new Error('Geolocation is not supported by this browser.'));
      return false;
    }

    if (this.isTracking) return true;

    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 15000,
      ...options,
    };

    this.points = [];
    this.isTracking = true;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handlePosition(pos),
      (err) => this._handleError(err),
      geoOptions
    );

    return true;
  }

  /**
   * Stop watching.
   */
  stop() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isTracking = false;
  }

  /**
   * Get a single current position (one-shot).
   * @returns {Promise<{lat: number, lng: number, accuracy: number, timestamp: number}>}
   */
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!GPSTracker.isAvailable()) {
        reject(new Error('Geolocation not available'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp || Date.now(),
          };
          resolve(p);
        },
        reject,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    });
  }

  _handlePosition(pos) {
    const point = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp || Date.now(),
      altitude: pos.coords.altitude,
      speed: pos.coords.speed,
    };

    this.lastAccuracy = point.accuracy;
    if (this.onAccuracy) this.onAccuracy(point.accuracy);

    const last = this.points.length ? this.points[this.points.length - 1] : null;
    const decision = shouldAcceptPoint(point, last);

    if (decision.accept) {
      this.points.push(point);
      if (this.onPoint) this.onPoint(point, this.points);
    }
    // Still report accuracy even if point filtered
  }

  _handleError(err) {
    let message = 'Location error';
    switch (err.code) {
      case err.PERMISSION_DENIED:
        message = 'Location permission denied. Please allow location access and try again.';
        break;
      case err.POSITION_UNAVAILABLE:
        message = 'Location unavailable. Check that GPS is enabled.';
        break;
      case err.TIMEOUT:
        message = 'Location request timed out. Move to an open area and try again.';
        break;
    }
    if (this.onError) this.onError(new Error(message));
  }

  getPoints() {
    return [...this.points];
  }

  clearPoints() {
    this.points = [];
  }
}
