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
    longitudinal:
      '<svg class="layout-type-thumb" viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0.5" y="0.5" width="126" height="126" fill="#fff" stroke="#1e1e1e"/>' +
      '<line x1="42.5" y1="1" x2="42.5" y2="126" stroke="#1e1e1e"/>' +
      '<line x1="84.5" y1="1" x2="84.5" y2="126" stroke="#1e1e1e"/>' +
      '</svg>',
    transverse:
      '<svg class="layout-type-thumb" viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0.5" y="0.5" width="126" height="126" fill="#fff" stroke="#1e1e1e"/>' +
      '<line x1="1" y1="42.5" x2="126" y2="42.5" stroke="#1e1e1e"/>' +
      '<line x1="1" y1="84.5" x2="126" y2="84.5" stroke="#1e1e1e"/>' +
      '</svg>',
    intarsia:
      '<svg class="layout-type-thumb" viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0.5" y="0.5" width="126" height="126" fill="#fff" stroke="#1e1e1e"/>' +
      '<path d="M20 68C34 52 46 34 57 20c9-12 25-7 24 7-1 11-11 23-19 33-7 9-7 20 4 20 12 0 23-10 30-19 9-12 22-1 16 9-5 8-13 13-20 18-9 6-16 14-15 22 1 7-7 11-13 6-6-4-5-12-2-18 3-6 8-12 12-18 5-7 2-10-6-6-11 5-21 17-30 27-10 11-27 8-30-6-3-10 4-19 15-25 9-5 18-8 24-12" fill="none" stroke="#1e1e1e" stroke-width="1.2"/>' +
      '</svg>',
    inventory:
      '<svg class="layout-type-thumb" viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0.5" y="0.5" width="126" height="126" fill="#fff" stroke="#1e1e1e"/>' +
      '<path d="M43 24l16 18-10 7 8 12-14 12 10 17-12 14 21 7 30-18 12-20-4-25-13-11-12-20H43z" fill="#f2f2f2" stroke="#1e1e1e"/>' +
      '<path d="M46 29l48 70M54 24l46 67M39 36l46 67M35 47l44 63M42 59l34 50" stroke="#1e1e1e" stroke-width="1"/>' +
      '</svg>',
    inventory_split_return:
      '<svg class="layout-type-thumb" viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0.5" y="0.5" width="126" height="126" fill="#fff" stroke="#1e1e1e"/>' +
      '<circle cx="46" cy="63.5" r="30" fill="none" stroke="#1e1e1e"/>' +
      '<circle cx="81" cy="63.5" r="30" fill="none" stroke="#1e1e1e"/>' +
      '<path d="M46 33v61M81 33v61M16 63.5h60M51 63.5h60" stroke="#1e1e1e" stroke-width="1"/>' +
      '</svg>',
    inventory_manual:
      '<svg class="layout-type-thumb" viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="0.5" y="0.5" width="126" height="126" fill="#fff" stroke="#1e1e1e"/>' +
      '<circle cx="63.5" cy="63.5" r="35" fill="none" stroke="#1e1e1e"/>' +
      '<path d="M29 63.5h69M63.5 29v69M39 39l49 49M88 39L39 88" stroke="#1e1e1e" stroke-width="1"/>' +
      '<path d="M78 86l9 20-11-4-7 9-6-24z" fill="#1e1e1e"/>' +
      '</svg>'
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
