/**
 * PathBack — Schematic route visualization on HTML Canvas.
 * Not a geographical map. Plots relative positions of GPS points.
 */

export class RouteVisualizer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.points = [];
    this.currentPos = null;
    this.mode = 'record'; // 'record' | 'retrace' | 'view'
    this.padding = 28;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth || 360;
    const h = Math.min(320, Math.round(w * 0.8));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  /**
   * Set the route points and optional current position.
   * @param {Array<{lat: number, lng: number}>} points
   * @param {{lat: number, lng: number}|null} currentPos
   * @param {'record'|'retrace'|'view'} mode
   */
  setRoute(points, currentPos = null, mode = 'record') {
    this.points = points || [];
    this.currentPos = currentPos;
    this.mode = mode;
    this.draw();
  }

  clear() {
    this.points = [];
    this.currentPos = null;
    this.mode = 'record';
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const grid = 40;
    for (let x = 0; x < w; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (this.points.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Route will appear here', w / 2, h / 2);
      return;
    }

    const projected = this._project(this.points, this.currentPos, w, h);

    // Draw path
    if (projected.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(projected.points[0].x, projected.points[0].y);
      for (let i = 1; i < projected.points.length; i++) {
        ctx.lineTo(projected.points[i].x, projected.points[i].y);
      }
      if (this.mode === 'retrace') {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
      } else {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Start marker (green)
    if (projected.points.length > 0) {
      this._drawMarker(projected.points[0].x, projected.points[0].y, '#059669', 'S');
    }

    // Destination marker (red) — last recorded point
    if (projected.points.length > 1) {
      const last = projected.points[projected.points.length - 1];
      this._drawMarker(last.x, last.y, '#dc2626', 'D');
    }

    // Current position (blue pulse)
    if (projected.current) {
      this._drawCurrent(projected.current.x, projected.current.y);
    }
  }

  _drawMarker(x, y, color, label) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  }

  _drawCurrent(x, y) {
    const ctx = this.ctx;
    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.2)';
    ctx.fill();
    // Inner
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#2563eb';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /**
   * Project lat/lng into canvas coordinates using a simple bounding-box fit.
   * Preserves aspect ratio of the geographic span.
   */
  _project(points, currentPos, w, h) {
    const all = [...points];
    if (currentPos) all.push(currentPos);

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    for (const p of all) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }

    // Avoid zero span
    const latSpan = Math.max(maxLat - minLat, 0.00005);
    const lngSpan = Math.max(maxLng - minLng, 0.00005);

    // Expand slightly for padding
    const pad = this.padding;
    const availW = w - pad * 2;
    const availH = h - pad * 2;

    // Fit while preserving aspect (approx: 1° lat ≈ 1° lng * cos(lat))
    const midLat = (minLat + maxLat) / 2;
    const cos = Math.cos((midLat * Math.PI) / 180) || 1;
    const geoW = lngSpan * cos;
    const geoH = latSpan;
    const scale = Math.min(availW / geoW, availH / geoH);

    const offsetX = pad + (availW - geoW * scale) / 2;
    const offsetY = pad + (availH - geoH * scale) / 2;

    const project = (p) => ({
      x: offsetX + (p.lng - minLng) * cos * scale,
      // Invert Y: higher lat → higher on map → lower canvas y
      y: offsetY + (maxLat - p.lat) * scale,
    });

    return {
      points: points.map(project),
      current: currentPos ? project(currentPos) : null,
    };
  }
}
