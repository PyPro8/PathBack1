/**
 * TrailTrace — Real map via Leaflet + OpenStreetMap tiles
 * Configurable tile layer. Attribution required.
 */

export class LeafletMap {
  constructor(container) {
    this.container = container;
    this.map = null;
    this.routeLayer = null;
    this.userMarker = null;
    this.startMarker = null;
    this.endMarker = null;
    this.connectorLayer = null;
    this.waypointMarkers = [];
    this.follow = true;
    this.headingUp = false;
    this._userMoved = false;
    this._ready = false;
  }

  init() {
    if (this.map) return;
    if (typeof L === 'undefined') {
      console.error('Leaflet not loaded');
      return;
    }

    this.map = L.map(this.container, {
      zoomControl: false,
      attributionControl: true,
    }).setView([0, 0], 2);

    // Configurable tile provider — OSM standard with attribution
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.routeLayer = L.polyline([], { color: '#0f172a', weight: 4, opacity: 0.85 }).addTo(this.map);
    this.connectorLayer = L.polyline([], {
      color: '#f59e0b',
      weight: 3,
      dashArray: '8,6',
      opacity: 0.9,
    }).addTo(this.map);

    this.map.on('dragstart', () => {
      this.follow = false;
      this._userMoved = true;
    });

    this._ready = true;
  }

  setRoute(points, currentPos, mode = 'record') {
    if (!this._ready) this.init();
    if (!this.map) return;

    const latlngs = (points || []).map((p) => [p.lat, p.lng]);
    this.routeLayer.setLatLngs(latlngs);
    this.routeLayer.setStyle({
      color: mode === 'retrace' ? '#2563eb' : '#0f172a',
      dashArray: mode === 'retrace' ? '10,6' : null,
      weight: mode === 'retrace' ? 5 : 4,
    });

    // Start / end markers
    if (this.startMarker) this.map.removeLayer(this.startMarker);
    if (this.endMarker) this.map.removeLayer(this.endMarker);

    if (latlngs.length > 0) {
      this.startMarker = L.circleMarker(latlngs[0], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#059669',
        fillOpacity: 1,
      }).addTo(this.map).bindTooltip('Start');
    }
    if (latlngs.length > 1) {
      this.endMarker = L.circleMarker(latlngs[latlngs.length - 1], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#dc2626',
        fillOpacity: 1,
      }).addTo(this.map).bindTooltip('Destination');
    }

    // User marker
    if (currentPos) {
      const ll = [currentPos.lat, currentPos.lng];
      if (!this.userMarker) {
        this.userMarker = L.circleMarker(ll, {
          radius: 10,
          color: '#fff',
          weight: 3,
          fillColor: '#2563eb',
          fillOpacity: 1,
        }).addTo(this.map);
      } else {
        this.userMarker.setLatLng(ll);
      }
      if (this.follow) {
        this.map.setView(ll, Math.max(this.map.getZoom(), 16), { animate: true });
      }
    }

    // Fit bounds on first load of a route
    if (latlngs.length >= 2 && !currentPos) {
      this.map.fitBounds(this.routeLayer.getBounds(), { padding: [40, 40] });
    }
  }

  setConnector(from, to) {
    if (!this.map || !from || !to) {
      if (this.connectorLayer) this.connectorLayer.setLatLngs([]);
      return;
    }
    this.connectorLayer.setLatLngs([
      [from.lat, from.lng],
      [to.lat, to.lng],
    ]);
  }

  setWaypoints(wps) {
    this.waypointMarkers.forEach((m) => this.map.removeLayer(m));
    this.waypointMarkers = [];
    (wps || []).forEach((wp) => {
      const m = L.circleMarker([wp.lat, wp.lng], {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#7c3aed',
        fillOpacity: 1,
      }).addTo(this.map);
      if (wp.name) m.bindTooltip(wp.name);
      this.waypointMarkers.push(m);
    });
  }

  recenter(pos) {
    this.follow = true;
    this._userMoved = false;
    if (pos && this.map) {
      this.map.setView([pos.lat, pos.lng], Math.max(this.map.getZoom(), 16), { animate: true });
    }
  }

  invalidateSize() {
    if (this.map) setTimeout(() => this.map.invalidateSize(), 100);
  }

  clear() {
    if (this.routeLayer) this.routeLayer.setLatLngs([]);
    if (this.connectorLayer) this.connectorLayer.setLatLngs([]);
    if (this.userMarker) {
      this.map.removeLayer(this.userMarker);
      this.userMarker = null;
    }
    if (this.startMarker) {
      this.map.removeLayer(this.startMarker);
      this.startMarker = null;
    }
    if (this.endMarker) {
      this.map.removeLayer(this.endMarker);
      this.endMarker = null;
    }
    this.waypointMarkers.forEach((m) => this.map.removeLayer(m));
    this.waypointMarkers = [];
  }
}
