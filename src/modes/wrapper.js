"use strict";

const LAYOUT_TYPES = new Set([
  "longitudinal",
  "transverse",
  "intarsia",
  "inventory_direct",
  "inventory_manual",
  "inventory_split_return"
]);

function normalizePoint(p) {
  const x = Number(p && p.x);
  const y = Number(p && p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function normalizePoints(points) {
  const out = [];
  for (const p of Array.isArray(points) ? points : []) {
    const n = normalizePoint(p);
    if (n) out.push(n);
  }
  return out;
}

function parsePreviewWrapperRequest(body) {
  const raw = body && typeof body === "object" ? body : {};
  const layoutType = String(raw.layoutType || "").trim();
  if (!LAYOUT_TYPES.has(layoutType)) return { ok: false, error: "layout_type_unsupported" };
  const zone = raw.zone && typeof raw.zone === "object" ? raw.zone : {};
  const zonePoints = normalizePoints(zone.points);
  if (zonePoints.length < 3) return { ok: false, error: "zone_points_required" };
  const zoneId = zone.id;
  const inputs = raw.inputs && typeof raw.inputs === "object" ? raw.inputs : {};
  const options = raw.options && typeof raw.options === "object" ? raw.options : {};
  const seed = Number.isFinite(Number(raw.seed)) ? Number(raw.seed) : null;
  return {
    ok: true,
    value: { layoutType, zoneId, zonePoints, inputs, options, seed }
  };
}

function renderItemsFromPlacements(placements) {
  const items = [];
  for (const p of Array.isArray(placements) ? placements : []) {
    const contour = normalizePoints(p && p.alignedContour);
    if (contour.length < 3) continue;
    const id = String(
      (p && p.placementId) ||
      (p && p.fragmentId) ||
      (p && p.scrapPieceId) ||
      (p && p.inventoryTag) ||
      `placement_${items.length + 1}`
    );
    const renderIndex = Number.isFinite(Number(p && p.renderIndex))
      ? Number(p.renderIndex)
      : (Number.isFinite(Number(p && p.solveOrder)) ? Number(p.solveOrder) : (items.length + 1));
    items.push({
      id,
      contour,
      closed: true,
      renderIndex,
      meta: {
        inventoryTag: String(p && p.inventoryTag || ""),
        phase: String(p && p.phase || ""),
        status: String(p && p.status || "")
      }
    });
  }
  return items;
}

function wrapInventoryDirectPreview(input, direct) {
  const strictCoverage = !!(direct && direct.strictCoverage === true);
  const fullCoverageOk = !!(direct && direct.fullCoverageOk === true);
  const resultStatus = strictCoverage && !fullCoverageOk ? "failed" : "ok";
  const solveOrder = Array.isArray(direct && direct.solveOrder) ? direct.solveOrder : [];
  return {
    ok: true,
    layoutType: "inventory_direct",
    modeVersion: "v1.3",
    resultStatus,
    warnings: [],
    failedReason: resultStatus === "failed"
      ? String((direct && direct.failedReason) || "zone_not_fully_covered")
      : null,
    stats: {
      coveredRatio: Number(direct && direct.coveredRatio || 0),
      coveragePercent: Number(direct && direct.coveragePercent || 0),
      residualAreaMm2: Number(direct && direct.residualAreaMm2 || 0),
      fullCoverageOk
    },
    render: {
      renderOrderPolicy: String(input.options && input.options.renderOrderPolicy || "solve_order"),
      stackOrderPolicy: String(input.options && input.options.stackOrderPolicy || "solve_order"),
      solveOrder,
      items: renderItemsFromPlacements(direct && direct.placements)
    },
    debug: {
      algorithmTrace: direct && direct.algorithmTrace ? direct.algorithmTrace : null,
      seamCheck: direct && direct.seamCheck ? direct.seamCheck : null
    }
  };
}

function wrapIntarsiaPreview(input, result) {
  const placements = Array.isArray(result && result.placements) ? result.placements : [];
  const solveOrder = placements.map((p, idx) => String(
    (p && p.fragmentId) || (p && p.inventoryTag) || `placement_${idx + 1}`
  ));
  return {
    ok: true,
    layoutType: "intarsia",
    modeVersion: "v0.2",
    resultStatus: "ok",
    warnings: [],
    failedReason: null,
    stats: {
      placementsTotal: placements.length,
      placementsMatched: placements.filter((p) => String(p && p.status || "") === "matched").length
    },
    render: {
      renderOrderPolicy: "solve_order",
      stackOrderPolicy: "solve_order",
      solveOrder,
      items: renderItemsFromPlacements(placements)
    },
    debug: {}
  };
}

module.exports = {
  parsePreviewWrapperRequest,
  wrapInventoryDirectPreview,
  wrapIntarsiaPreview
};
