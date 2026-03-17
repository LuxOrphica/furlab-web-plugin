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
    let searchTerm = "";

    function getFilteredCatalog(catalog) {
      const q = String(searchTerm || "").trim().toLowerCase();
      if (!q) return catalog;
      return catalog.filter((item) => {
        const mode = String(item && item.mode || "").toLowerCase();
        const title = String(item && item.title || "").toLowerCase();
        return mode.includes(q) || title.includes(q);
      });
    }

    function render() {
      const grid = byId("layoutTypeGrid");
      if (!grid) return;
      const catalog = getCatalog();
      const filtered = getFilteredCatalog(catalog);
      grid.innerHTML = "";

      for (const item of filtered) {
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
        const selectedVisible = filtered.some((x) => String(x && x.mode || "") === String(selectedMode || ""));
        addBtn.disabled = !selectedMode || !selectedVisible;
        const picked = catalog.find((x) => String(x && x.mode || "") === String(selectedMode || ""));
        addBtn.textContent = picked ? `Добавить: ${picked.title}` : "Добавить";
      }
    }

    function open() {
      const catalog = getCatalog();
      const preferredMode = String(getPreferredMode() || "");
      const preferred = catalog.find((x) => String(x && x.mode || "") === preferredMode);
      selectedMode = preferred ? preferredMode : (catalog.length ? String(catalog[0].mode || "") : "");

      const searchEl = byId("layoutTypeSearch");
      if (searchEl) {
        searchEl.value = "";
        searchTerm = "";
      }

      render();
      const backdrop = byId("layoutTypeBackdrop");
      if (backdrop) backdrop.style.display = "flex";
    }

    function close() {
      const backdrop = byId("layoutTypeBackdrop");
      if (backdrop) backdrop.style.display = "none";
      selectedMode = null;
      searchTerm = "";
    }

    function getSelectedMode() {
      return String(selectedMode || "");
    }

    function wire() {
      const searchEl = byId("layoutTypeSearch");
      if (searchEl) {
        searchEl.addEventListener("input", () => {
          searchTerm = String(searchEl.value || "");
          render();
        });
      }
    }

    wire();

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
