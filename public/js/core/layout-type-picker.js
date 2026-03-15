// Extracted from app.js (layout type picker modal UI controller)
(function (global) {
  function createLayoutTypePicker(options) {
    const opts = options && typeof options === "object" ? options : {};
    const byId = typeof opts.byId === "function"
      ? opts.byId
      : (id) => global.document && global.document.getElementById(id);
    const getCatalog = typeof opts.getCatalog === "function" ? opts.getCatalog : (() => []);
    const getThumbSvg = typeof opts.getThumbSvg === "function" ? opts.getThumbSvg : (() => "");
    const getPreferredMode = typeof opts.getPreferredMode === "function" ? opts.getPreferredMode : (() => "");

    let selectedMode = null;

    function render() {
      const grid = byId("layoutTypeGrid");
      if (!grid) return;
      const catalog = getCatalog();
      grid.innerHTML = "";
      for (const item of catalog) {
        const mode = String(item && item.mode || "");
        const card = global.document.createElement("div");
        card.className = "layout-type-card" + (selectedMode === mode ? " active" : "");
        card.innerHTML = `${getThumbSvg(mode)}<div class="layout-type-title">${String(item && item.title || mode)}</div>`;
        card.addEventListener("click", () => {
          selectedMode = mode;
          render();
        });
        grid.appendChild(card);
      }
      const addBtn = byId("layoutTypeAddBtn");
      if (addBtn) {
        addBtn.disabled = !selectedMode;
        const picked = catalog.find((x) => String(x && x.mode || "") === String(selectedMode || ""));
        addBtn.textContent = picked ? `Добавить: ${picked.title}` : "Добавить";
      }
    }

    function open() {
      const catalog = getCatalog();
      const preferredMode = String(getPreferredMode() || "");
      const preferred = catalog.find((x) => String(x && x.mode || "") === preferredMode);
      selectedMode = preferred ? preferredMode : (catalog.length ? String(catalog[0].mode || "") : "");
      render();
      const backdrop = byId("layoutTypeBackdrop");
      if (backdrop) backdrop.style.display = "flex";
    }

    function close() {
      const backdrop = byId("layoutTypeBackdrop");
      if (backdrop) backdrop.style.display = "none";
      selectedMode = null;
    }

    function getSelectedMode() {
      return String(selectedMode || "");
    }

    return {
      render,
      open,
      close,
      getSelectedMode
    };
  }

  global.FurLabLayoutTypePicker = Object.assign({}, global.FurLabLayoutTypePicker || {}, {
    createLayoutTypePicker
  });
})(window);

