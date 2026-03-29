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
        const isPlaceholder = !!(item && item.placeholder);
        const card = global.document.createElement("div");
        card.className = "layout-type-card" + (selectedMode === mode ? " active" : "") + (isPlaceholder ? " placeholder" : "");
        card.setAttribute("data-mode", mode);
        if (isPlaceholder) card.setAttribute("data-placeholder", "1");
        card.innerHTML = `${getThumbSvg(mode)}<div class="layout-type-title">${String(item && item.title || mode)}</div>`;
        card.addEventListener("click", () => {
          if (isPlaceholder) return;
          selectedMode = mode;
          render();
        });
        grid.appendChild(card);
      }

      const addBtn = byId("layoutTypeAddBtn");
      if (addBtn) {
        const selectedVisible = filtered.some((x) => String(x && x.mode || "") === String(selectedMode || ""));
        addBtn.disabled = !selectedMode || !selectedVisible;
        addBtn.textContent = "Выбрать";
      }
    }

    function open() {
      selectedMode = "";

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
