"use strict";

function normalizePlacementOrders(placements) {
  if (!Array.isArray(placements)) return [];
  return placements.map((p, idx) => {
    const solveOrder = Number.isFinite(Number(p && p.solveOrder))
      ? Number(p.solveOrder)
      : (idx + 1);
    const solveIndex = Number.isFinite(Number(p && p.solveIndex))
      ? Number(p.solveIndex)
      : Math.max(0, solveOrder - 1);
    return {
      ...p,
      solveOrder,
      solveIndex,
      renderIndex: Number.isFinite(Number(p && p.renderIndex)) ? Number(p.renderIndex) : (-solveOrder)
    };
  });
}

function buildSolveOrder(placements) {
  return normalizePlacementOrders(placements)
    .slice()
    .sort((a, b) => Number(a && a.solveOrder || 0) - Number(b && b.solveOrder || 0))
    .map((p) => String(p && (p.placementId || p.fragmentId || p.scrapPieceId || p.inventoryTag || "")))
    .filter((x) => x.length > 0);
}

function createInventorySplitReturnMode(deps) {
  const assignInventoryDirect = deps && deps.assignInventoryDirect;
  if (typeof assignInventoryDirect !== "function") {
    throw new Error("inventory_split_return mode requires assignInventoryDirect");
  }

  function getDescriptor() {
    return {
      layoutType: "inventory_split_return",
      modeVersion: "v0.3",
      displayName: "Inventory Split & Return",
      supportsPreview: true,
      supportsApply: true
    };
  }

  function validatePreview(req) {
    const zonePoints = Array.isArray(req && req.zonePoints) ? req.zonePoints : [];
    if (zonePoints.length < 3) return { ok: false, error: "zone_points_required" };
    return { ok: true };
  }

  async function preview(input) {
    const zonePoints = Array.isArray(input && input.zonePoints) ? input.zonePoints : [];
    const candidates = Array.isArray(input && input.candidates) ? input.candidates : [];
    const axis = String(input && input.axis || "y");
    const filters = input && input.filters && typeof input.filters === "object" ? input.filters : {};
    const constraints = input && input.constraints && typeof input.constraints === "object" ? input.constraints : {};
    const incomingOptions = input && input.options && typeof input.options === "object" ? input.options : {};
    const options = {
      ...incomingOptions,
      // Contract v0.1: deterministic first-on-top stack for used-visible gain.
      layerPolicy: "first_on_top",
      splitReturnEnabled: true,
      modeId: "inventory_split_return"
    };

    const direct = await assignInventoryDirect(zonePoints, candidates, axis, filters, constraints, options);
    const placements = normalizePlacementOrders(direct && direct.placements);
    return {
      ...(direct || {}),
      placements,
      splitReturnEnabled: true,
      splitReturnMode: "inventory_split_return",
      solveOrder: buildSolveOrder(placements)
    };
  }

  async function applyWrapper(req) {
    return {
      ok: false,
      layoutType: "inventory_split_return",
      error: "apply_not_implemented",
      message: "inventory_split_return apply adapter is not connected yet.",
      previewToken: String(req && req.previewToken || "")
    };
  }

  return {
    modeId: "inventory_split_return",
    getDescriptor,
    validatePreview,
    preview,
    applyWrapper
  };
}

module.exports = {
  createInventorySplitReturnMode
};
