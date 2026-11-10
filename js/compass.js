/**
 * TrailTrace — Compass / heading service
 * Combines device orientation and GPS course-over-ground.
 */

import { smoothHeading } from './utils.js';

export class Compass {
  constructor() {
    this.deviceHeading = null;   // phone facing direction
    this.gpsCourse = null;      // movement direction from GPS
    this.heading = null;        // best available smoothed heading
    this.source = 'none';       // 'device' | 'gps' | 'none'
    this._listening = false;
    this._listeners = [];
    this._permissionState = 'unknown';
  }

  onChange(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((f) => f !== fn);
    };
  }

  _emit() {
    this._listeners.forEach((fn) => {
      try {
        fn({
          heading: this.heading,
          deviceHeading: this.deviceHeading,
          gpsCourse: this.gpsCourse,
          source: this.source,
        });
      } catch (e) {
        console.error(e);
      }
    });
  }

  /**
   * Request orientation permission (required on iOS 13+).
   */
  async requestPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const state = await DeviceOrientationEvent.requestPermission();
        this._permissionState = state;
        return state === 'granted';
      } catch {
        this._permissionState = 'denied';
        return false;
      }
    }
    this._permissionState = 'granted';
    return true;
  }

  start() {
    if (this._listening) return;
    this._listening = true;

    // Device orientation
    window.addEventListener('deviceorientationabsolute', this._onOrient, true);
    window.addEventListener('deviceorientation', this._onOrient, true);
  }

  stop() {
    this._listening = false;
    window.removeEventListener('deviceorientationabsolute', this._onOrient, true);
    window.removeEventListener('deviceorientation', this._onOrient, true);
  }

  _onOrient = (event) => {
    // Prefer absolute if available
    let h = null;
    if (event.absolute && event.alpha != null) {
      // alpha is degrees from north (0-360) in absolute mode on many devices
      h = (360 - event.alpha) % 360;
    } else if (event.webkitCompassHeading != null) {
      // iOS
      h = event.webkitCompassHeading;
    } else if (event.alpha != null) {
      h = (360 - event.alpha) % 360;
    }

    if (h != null && Number.isFinite(h)) {
      this.deviceHeading = smoothHeading(this.deviceHeading, h, 0.3);
      this._updateBest();
    }
  };

  /**
   * Feed GPS course (from Geolocation coords.heading or computed from successive points).
   */
  updateGpsCourse(course) {
    if (course != null && Number.isFinite(course) && course >= 0) {
      this.gpsCourse = smoothHeading(this.gpsCourse, course, 0.35);
      this._updateBest();
    }
  }

  _updateBest() {
    // Prefer device heading when available; fall back to GPS course when moving
    if (this.deviceHeading != null) {
      this.heading = this.deviceHeading;
      this.source = 'device';
    } else if (this.gpsCourse != null) {
      this.heading = this.gpsCourse;
      this.source = 'gps';
    } else {
      this.heading = null;
      this.source = 'none';
    }
    this._emit();
  }

  getHeading() {
    return this.heading;
  }
}
