// FurLab Geometry helpers — pure polygon math, no state, no DOM
// Exposes window.FurLabGeom
(function (global) {

  function contourThumbSvg(points, closed) {
    const pts = Array.isArray(points) ? points : [];
    if (pts.length < 2) return '<svg viewBox="0 0 28 28"></svg>';
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const pad = 2;
    const scale = Math.min((28 - 2 * pad) / w, (28 - 2 * pad) / h);
    const ox = (28 - w * scale) * 0.5;
    const oy = (28 - h * scale) * 0.5;
    const mapped = pts.map((p) => ({
      x: ox + (p.x - minX) * scale,
      y: 28 - (oy + (p.y - minY) * scale)
    }));
    const d = mapped
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ")
      + (closed ? " Z" : "");
    return `<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="none" stroke="#222" stroke-width="1.2"/></svg>`;
  }

  function polygonArea(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += (a.x * b.y - b.x * a.y);
    }
    return Math.abs(sum) * 0.5;
  }

  function polylineLength(points, closed) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      len += Math.hypot(dx, dy);
    }
    if (closed) {
      const dx = points[0].x - points[points.length - 1].x;
      const dy = points[0].y - points[points.length - 1].y;
      len += Math.hypot(dx, dy);
    }
    return len;
  }

  function clipPolygonByHalfPlane(poly, nx, ny, c) {
    const out = [];
    if (!Array.isArray(poly) || poly.length < 3) return out;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = nx * a.x + ny * a.y + c;
      const db = nx * b.x + ny * b.y + c;
      const ina = da >= 0;
      const inb = db >= 0;
      if (ina && inb) {
        out.push({ x: b.x, y: b.y });
      } else if (ina && !inb) {
        const t = da / (da - db || 1e-9);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      } else if (!ina && inb) {
        const t = da / (da - db || 1e-9);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        out.push({ x: b.x, y: b.y });
      }
    }
    return out;
  }

  function centroid(points) {
    if (!Array.isArray(points) || points.length === 0) return { x: 0, y: 0 };
    let x = 0, y = 0;
    for (const p of points) { x += p.x; y += p.y; }
    return { x: x / points.length, y: y / points.length };
  }

  function polygonBBox(points) {
    let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
    for (const p of points || []) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function randomPointInPolygon(poly, bbox, maxAttempts) {
    if (maxAttempts === undefined) maxAttempts = 500;
    const pointInPolygon = window.FurLabUtils ? window.FurLabUtils.pointInPolygon : null;
    if (!pointInPolygon) return centroid(poly);
    for (let i = 0; i < maxAttempts; i++) {
      const x = bbox.minX + Math.random() * bbox.width;
      const y = bbox.minY + Math.random() * bbox.height;
      if (pointInPolygon({ x, y }, poly)) return { x, y };
    }
    return centroid(poly);
  }

  function clipPolygonToRect(poly, x0, y0, x1, y1) {
    let out = poly;
    out = clipPolygonByHalfPlane(out, 1, 0, -x0);
    out = clipPolygonByHalfPlane(out, -1, 0, x1);
    out = clipPolygonByHalfPlane(out, 0, 1, -y0);
    out = clipPolygonByHalfPlane(out, 0, -1, y1);
    return out;
  }

  function splitPolygonByLine(poly, px, py, dx, dy) {
    const nx = -Number(dy || 0);
    const ny = Number(dx || 0);
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || (Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9)) return [];
    const c = -((nx * Number(px || 0)) + (ny * Number(py || 0)));
    const a = clipPolygonByHalfPlane(poly, nx, ny, c);
    const b = clipPolygonByHalfPlane(poly, -nx, -ny, -c);
    const out = [];
    if (Array.isArray(a) && a.length >= 3) out.push(a);
    if (Array.isArray(b) && b.length >= 3) out.push(b);
    return out;
  }

  function clipPolygonByBand(poly, nx, ny, lower, upper) {
    let out = clipPolygonByHalfPlane(poly, nx, ny, -lower);
    out = clipPolygonByHalfPlane(out, -nx, -ny, upper);
    return out;
  }

  function toBooleanMulti(points) {
    if (!Array.isArray(points) || points.length < 3) return [];
    const ring = [];
    for (const p of points) {
      const x = Number(p && p.x);
      const y = Number(p && p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      ring.push([Number(x.toFixed(6)), Number(y.toFixed(6))]);
    }
    if (ring.length < 3) return [];
    const f = ring[0];
    const l = ring[ring.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
    if (ring.length < 4) return [];
    return [[ring]];
  }

  function fromBooleanMultiOuter(mp) {
    const out = [];
    if (!Array.isArray(mp)) return out;
    for (const poly of mp) {
      if (!Array.isArray(poly) || !Array.isArray(poly[0]) || poly[0].length < 4) continue;
      const ring = poly[0];
      const pts = [];
      for (let i = 0; i < ring.length - 1; i++) {
        const p = ring[i];
        const x = Number(p && p[0]);
        const y = Number(p && p[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        pts.push({ x, y });
      }
      if (pts.length >= 3) out.push(pts);
    }
    return out;
  }

  function toBooleanMultiFromMultiOuter(polys) {
    const mp = [];
    for (const pts of Array.isArray(polys) ? polys : []) {
      const one = toBooleanMulti(pts);
      if (Array.isArray(one) && one.length) mp.push(...one);
    }
    return mp;
  }

  function computeCoverageHoles(zonePoints, coverContours) {
    const normalizeContourArray = window.FurLabUtils ? window.FurLabUtils.normalizeContourArray : null;
    const zonePts = normalizeContourArray ? normalizeContourArray(zonePoints) : null;
    if (!zonePts) return [];
    const pc = (typeof window !== "undefined" && window.polygonClipping) ? window.polygonClipping : null;
    if (!pc || typeof pc.difference !== "function") return [];
    const zoneMp = toBooleanMulti(zonePts);
    if (!Array.isArray(zoneMp) || !zoneMp.length) return [];
    const normalizeCA = normalizeContourArray || ((x) => x);
    const coverList = (Array.isArray(coverContours) ? coverContours : [])
      .map((poly) => normalizeCA(poly))
      .filter((poly) => Array.isArray(poly) && poly.length >= 3);
    if (!coverList.length) return [zonePts];
    const coverMp = toBooleanMultiFromMultiOuter(coverList);
    if (!Array.isArray(coverMp) || !coverMp.length) return [zonePts];
    try {
      const diff = pc.difference(zoneMp, coverMp) || [];
      return fromBooleanMultiOuter(diff).filter((poly) => polygonArea(poly) > 1);
    } catch (_) {
      return [];
    }
  }

  function extractCoreMultiFromPlacement(pl) {
    if (Array.isArray(pl && pl.inZoneCoreContours) && pl.inZoneCoreContours.length > 0) {
      return pl.inZoneCoreContours;
    }
    if (Array.isArray(pl && pl.inZoneCoreContour) && pl.inZoneCoreContour.length >= 3) {
      return toBooleanMulti(pl.inZoneCoreContour);
    }
    return [];
  }

  function buildRoundedRectPolygon(x0, y0, x1, y1, radiusMm) {
    const w = Math.max(0, x1 - x0);
    const h = Math.max(0, y1 - y0);
    const rRaw = Math.max(0, Number(radiusMm || 0));
    const r = Math.max(0, Math.min(rRaw, Math.max(0, Math.min(w, h) * 0.5 - 1e-6)));
    if (!(w > 0 && h > 0)) return [];
    if (!(r > 1e-9)) {
      return [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 }
      ];
    }
    const seg = 4;
    const pts = [];
    function addArc(cx, cy, a0, a1) {
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const a = a0 + (a1 - a0) * t;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
    }
    addArc(x1 - r, y0 + r, -Math.PI / 2, 0);
    addArc(x1 - r, y1 - r, 0, Math.PI / 2);
    addArc(x0 + r, y1 - r, Math.PI / 2, Math.PI);
    addArc(x0 + r, y0 + r, Math.PI, Math.PI * 1.5);
    return pts;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  global.FurLabGeom = {
    contourThumbSvg,
    polygonArea,
    polylineLength,
    clipPolygonByHalfPlane,
    centroid,
    polygonBBox,
    randomPointInPolygon,
    clipPolygonToRect,
    splitPolygonByLine,
    clipPolygonByBand,
    toBooleanMulti,
    fromBooleanMultiOuter,
    toBooleanMultiFromMultiOuter,
    computeCoverageHoles,
    extractCoreMultiFromPlacement,
    buildRoundedRectPolygon,
  };

})(window);
