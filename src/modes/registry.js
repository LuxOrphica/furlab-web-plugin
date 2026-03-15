"use strict";

const { createInventoryDirectMode } = require("./inventory_direct");
const { createIntarsiaMode } = require("./intarsia");
const { createInventoryManualMode } = require("./inventory_manual");
const { createInventorySplitReturnMode } = require("./inventory_split_return");

function createModeRegistry(deps) {
  const inventoryDirect = createInventoryDirectMode(deps || {});
  const intarsia = createIntarsiaMode(deps || {});
  const inventoryManual = createInventoryManualMode(deps || {});
  const inventorySplitReturn = createInventorySplitReturnMode(deps || {});
  const modes = new Map([
    [inventoryDirect.modeId, inventoryDirect],
    [intarsia.modeId, intarsia],
    [inventoryManual.modeId, inventoryManual],
    [inventorySplitReturn.modeId, inventorySplitReturn]
  ]);

  function get(modeId) {
    return modes.get(String(modeId || "").trim()) || null;
  }

  function requireMode(modeId) {
    const mode = get(modeId);
    if (!mode) throw new Error(`unknown_mode:${modeId}`);
    return mode;
  }

  return {
    get,
    require: requireMode
  };
}

module.exports = {
  createModeRegistry
};
