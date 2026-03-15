// Extracted from app.js (layout mode catalog/titles/thumbs)
(function (global) {
  const CATALOG = [
    { mode: "longitudinal", title: "\u041f\u0440\u043e\u0434\u043e\u043b\u044c\u043d\u0430\u044f" },
    { mode: "transverse", title: "\u041f\u043e\u043f\u0435\u0440\u0435\u0447\u043d\u0430\u044f" },
    { mode: "intarsia", title: "\u0418\u043d\u0442\u0430\u0440\u0441\u0438\u044f" },
    { mode: "inventory", title: "\u0418\u0437 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u044f" },
    { mode: "inventory_split_return", title: "\u0418\u0437 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u044f (Split & Return)" },
    { mode: "inventory_manual", title: "\u0418\u0437 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u044f (\u0440\u0443\u0447\u043d\u043e\u0439)" }
  ];

  const THUMBS = {
    longitudinal: '<svg class="layout-type-thumb" viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="99" height="71" fill="none" stroke="#222"/><line x1="25" y1="1" x2="25" y2="71" stroke="#222"/><line x1="50" y1="1" x2="50" y2="71" stroke="#222"/><line x1="75" y1="1" x2="75" y2="71" stroke="#222"/></svg>',
    transverse: '<svg class="layout-type-thumb" viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="99" height="71" fill="none" stroke="#222"/><line x1="1" y1="18" x2="99" y2="18" stroke="#222"/><line x1="1" y1="36" x2="99" y2="36" stroke="#222"/><line x1="1" y1="54" x2="99" y2="54" stroke="#222"/></svg>',
    intarsia: '<svg class="layout-type-thumb" viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="99" height="71" fill="none" stroke="#222"/><line x1="1" y1="70" x2="50" y2="36" stroke="#222"/><line x1="50" y1="36" x2="99" y2="70" stroke="#222"/><line x1="1" y1="1" x2="50" y2="36" stroke="#222"/><line x1="50" y1="36" x2="99" y2="1" stroke="#222"/></svg>',
    inventory_split_return: '<svg class="layout-type-thumb" viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="99" height="71" fill="none" stroke="#222"/><circle cx="35" cy="36" r="18" fill="none" stroke="#222"/><circle cx="65" cy="36" r="18" fill="none" stroke="#222"/><path d="M35 18v36M65 18v36M17 36h36M47 36h36" stroke="#222" fill="none"/></svg>',
    inventory: '<svg class="layout-type-thumb" viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="99" height="71" fill="none" stroke="#222"/><circle cx="50" cy="36" r="24" fill="none" stroke="#222"/><path d="M26 36h48M50 12v48M33 19l34 34M67 19L33 53" stroke="#222" fill="none"/></svg>'
  };

  function getLayoutModeTitle(mode) {
    const m = String(mode || "");
    const row = CATALOG.find((x) => x.mode === m);
    return row ? row.title : "\u0418\u0437 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u044f";
  }

  function isInventoryLikeLayoutMode(mode) {
    const m = String(mode || "");
    return m === "inventory" || m === "inventory_manual" || m === "inventory_split_return";
  }

  function getLayoutModeCatalog() {
    return CATALOG.slice();
  }

  function getLayoutModeThumbSvg(mode) {
    const m = String(mode || "");
    return THUMBS[m] || THUMBS.inventory;
  }

  global.FurLabLayoutModes = Object.assign({}, global.FurLabLayoutModes || {}, {
    getLayoutModeTitle,
    isInventoryLikeLayoutMode,
    getLayoutModeCatalog,
    getLayoutModeThumbSvg
  });
})(window);
