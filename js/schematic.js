/**
 * TrailTrace — Schematic map (Canvas)
 * Zoom, pan, rotation, heading-up, deviation connector.
 * Not a geographical map.
 */

export class SchematicMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.points = [];
    this.currentPos = null;
    this.connectorTarget = null; // {lat,lng} nearest on route
    this.waypoints = [];
    this.mode = 'record'; // record | view | retrace
    this.heading = 0;     // degrees, used in heading-up
    this.headingUp = true;
    this.follow = true;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this._dragging = false;
    this._lastTouch = null;
    this._pinchStartDist = null;
    this._pinchStartZoom = 1;
    this.padding = 40;
    this._geoBounds = null;
    this._bindEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _bindEvents() {
    const c = this.canvas;
    // Mouse
    c.addEventListener('mousedown', (e) => this._onPointerDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => {
      if (this._dragging) this._onPointerMove(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => this._onPointerUp());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      this.zoom = Math.max(0.3, Math.min(12, this.zoom * factor));
      this.follow = false;
      this.draw();
    }, { passive: false });

    // Touch
    c.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this._onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2) {
        this._dragging = false;
        const d = this._touchDist(e.touches);
        this._pinchStartDist = d;
        this._pinchStartZoom = this.zoom;
      }
    }, { passive: true });

    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this._dragging) {
        this._onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length === 2 && this._pinchStartDist) {
        const d = this._touchDist(e.touches);
        this.zoom = Math.max(0.3, Math.min(12, this._pinchStartZoom * (d / this._pinchStartDist)));
        this.follow = false;
        this.draw();
      }
    }, { passive: false });

    c.addEventListener('touchend', () => {
      this._onPointerUp();
      this._pinchStartDist = null;
    });
  }

  _touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _onPointerDown(x, y) {
    this._dragging = true;
    this._lastTouch = { x, y };
    this.follow = false;
  }

  _onPointerMove(x, y) {
    if (!this._lastTouch) return;
    const dx = x - this._lastTouch.x;
    const dy = y - this._lastTouch.y;
    this.offsetX += dx;
    this.offsetY += dy;
    this._lastTouch = { x, y };
    this.draw();
  }

  _onPointerUp() {
    this._dragging = false;
    this._lastTouch = null;
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth || 360;
    const h = parent.clientHeight || 400;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  setRoute(points, currentPos = null, mode = 'record') {
    this.points = points || [];
    this.currentPos = currentPos;
    this.mode = mode;
    this._geoBounds = null;
    this.draw();
  }

  setConnector(target) {
    this.connectorTarget = target;
    this.draw();
  }

  setWaypoints(wps) {
    this.waypoints = wps || [];
    this.draw();
  }

  setHeading(deg) {
    if (deg != null && Number.isFinite(deg)) {
      this.heading = deg;
      if (this.headingUp && this.follow) this.draw();
    }
  }

  setHeadingUp(on) {
    this.headingUp = !!on;
    this.draw();
  }

  recenter() {
    this.follow = true;
    this.offsetX = 0;
    this.offsetY = 0;
    this.draw();
  }

  clear() {
    this.points = [];
    this.currentPos = null;
    this.connectorTarget = null;
    this.waypoints = [];
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const grid = 36;
    for (let x = 0; x < w; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += grid) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    if (this.points.length === 0 && !this.currentPos) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Schematic route will appear here', w / 2, h / 2);
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillText('Not a real geographical map', w / 2, h / 2 + 20);
      return;
    }

    const projected = this._project(w, h);

    ctx.save();
    // Apply rotation around centre when heading-up
    if (this.headingUp && this.heading != null) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate((-this.heading * Math.PI) / 180);
      ctx.translate(-w / 2, -h / 2);
    }

    // Deviation connector
    if (this.connectorTarget && this.currentPos && projected.current && projected.connector) {
      ctx.beginPath();
      ctx.moveTo(projected.current.x, projected.current.y);
      ctx.lineTo(projected.connector.x, projected.connector.y);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Route path
    if (projected.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(projected.points[0].x, projected.points[0].y);
      for (let i = 1; i < projected.points.length; i++) {
        ctx.lineTo(projected.points[i].x, projected.points[i].y);
      }
      if (this.mode === 'retrace') {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([10, 6]);
      } else {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Start / Destination
    if (projected.points.length > 0) {
      this._marker(projected.points[0].x, projected.points[0].y, '#059669', 'S');
    }
    if (projected.points.length > 1) {
      const last = projected.points[projected.points.length - 1];
      this._marker(last.x, last.y, '#dc2626', 'D');
    }

    // Waypoints
    for (const wp of projected.waypoints) {
      this._marker(wp.x, wp.y, '#7c3aed', '•');
    }

    // Current position
    if (projected.current) {
      this._current(projected.current.x, projected.current.y);
    }

    ctx.restore();

    // North indicator (always upright)
    this._drawNorth(w, h);
  }

  _marker(x, y, color, label) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  }

  _current(x, y) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(37,99,235,0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#2563eb';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  _drawNorth(w, h) {
    const ctx = this.ctx;
    const cx = w - 28;
    const cy = 28;
    ctx.save();
    if (this.headingUp && this.heading != null) {
      ctx.translate(cx, cy);
      ctx.rotate((-this.heading * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx + 7, cy + 8);
    ctx.lineTo(cx, cy + 3);
    ctx.lineTo(cx - 7, cy + 8);
    ctx.closePath();
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy + 20);
    ctx.restore();
  }

  _project(w, h) {
    const all = [...this.points];
    if (this.currentPos) all.push(this.currentPos);
    if (this.connectorTarget) all.push(this.connectorTarget);
    this.waypoints.forEach((wp) => all.push(wp));

    if (all.length === 0) {
      return { points: [], current: null, connector: null, waypoints: [] };
    }

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of all) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }

    const latSpan = Math.max(maxLat - minLat, 0.00008);
    const lngSpan = Math.max(maxLng - minLng, 0.00008);
    const midLat = (minLat + maxLat) / 2;
    const cos = Math.cos((midLat * Math.PI) / 180) || 1;

    const pad = this.padding;
    const availW = w - pad * 2;
    const availH = h - pad * 2;
    const geoW = lngSpan * cos;
    const geoH = latSpan;
    let scale = Math.min(availW / geoW, availH / geoH) * this.zoom;

    // When following, centre on current position
    let centreLat = midLat;
    let centreLng = (minLng + maxLng) / 2;
    if (this.follow && this.currentPos) {
      centreLat = this.currentPos.lat;
      centreLng = this.currentPos.lng;
    }

    const project = (p) => {
      const x =
        w / 2 +
        (p.lng - centreLng) * cos * scale +
        this.offsetX;
      const y =
        h / 2 -
        (p.lat - centreLat) * scale +
        this.offsetY;
      return { x, y };
    };

    return {
      points: this.points.map(project),
      current: this.currentPos ? project(this.currentPos) : null,
      connector: this.connectorTarget ? project(this.connectorTarget) : null,
      waypoints: this.waypoints.map(project),
    };
  }
}
