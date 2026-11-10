/**
 * TrailTrace — GPX export / import
 */

import { isValidCoordinate, generateId, pathDistance } from './utils.js';

/**
 * Export a journey to GPX 1.1 XML string.
 */
export function exportGPX(journey) {
  const name = escapeXml(journey.name || 'TrailTrace Journey');
  const pts = journey.points || [];
  const trkpts = pts
    .map((p) => {
      const ele = p.altitude != null ? `<ele>${p.altitude}</ele>` : '';
      const time = p.timestamp
        ? `<time>${new Date(p.timestamp).toISOString()}</time>`
        : '';
      return `      <trkpt lat="${p.lat}" lon="${p.lng}">${ele}${time}</trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailTrace"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${name}</name>
    <time>${new Date(journey.startedAt || Date.now()).toISOString()}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Trigger browser download of a GPX file.
 */
export function downloadGPX(journey) {
  const xml = exportGPX(journey);
  const blob = new Blob([xml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(journey.name || 'journey').replace(/[^a-z0-9-_]/gi, '_')}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse a GPX string into a journey-like object.
 */
export function importGPX(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid GPX file');
  }

  const nameEl = doc.querySelector('trk > name') || doc.querySelector('metadata > name');
  const name = nameEl ? nameEl.textContent.trim() : 'Imported Journey';

  const trkpts = [...doc.querySelectorAll('trkpt')];
  const points = [];
  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lng = parseFloat(pt.getAttribute('lon'));
    if (!isValidCoordinate(lat, lng)) continue;
    const ele = pt.querySelector('ele');
    const time = pt.querySelector('time');
    points.push({
      lat,
      lng,
      altitude: ele ? parseFloat(ele.textContent) : null,
      timestamp: time ? Date.parse(time.textContent) : null,
    });
  }

  if (points.length < 2) {
    throw new Error('GPX contains fewer than 2 valid points');
  }

  const startedAt = points[0].timestamp || Date.now();
  const endedAt = points[points.length - 1].timestamp || Date.now();

  return {
    id: generateId(),
    name,
    points,
    startedAt,
    endedAt,
    distance: pathDistance(points),
    duration: Math.max(0, endedAt - startedAt),
    imported: true,
  };
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
