// Extracted from app.js: manual tray HTML rendering.
(function (global) {
  function createManualTrayView(options) {
    const opts = options && typeof options === "object" ? options : {};
    const t = typeof opts.t === "function" ? opts.t : (_k, _v, fb) => String(fb || "");

    function renderHtml(input) {
      const cfg = input && typeof input === "object" ? input : {};
      const sections = cfg.sections && typeof cfg.sections === "object"
        ? cfg.sections
        : { large: [], medium: [], small: [] };
      const trayOpen = cfg.trayOpen && typeof cfg.trayOpen === "object"
        ? cfg.trayOpen
        : { large: false, medium: false, small: false };
      const selectedTag = String(cfg.selectedTag || "");
      const getThumbSvg = typeof cfg.getThumbSvg === "function" ? cfg.getThumbSvg : () => "";
      const formatSectionRangeCm = typeof cfg.formatSectionRangeCm === "function" ? cfg.formatSectionRangeCm : () => "";
      const metricsLine = String(cfg.metricsLine || "");
      const selectedInfoLine = String(cfg.selectedInfoLine || "");
      const seamDebugLine = String(cfg.seamDebugLine || "");
      const seamFlowSummary = String(cfg.seamFlowSummary || "");
      const seamExcludedSummary = String(cfg.seamExcludedSummary || "");
      const rotateStepDeg = Math.max(1, Number(cfg.rotateStepDeg || 5));
      const noDataHtml = String(cfg.noDataHtml || '<div class="tree-empty">-</div>');
      const hasDebug = !!(seamDebugLine || seamFlowSummary || seamExcludedSummary);

      const makeCards = (list, sectionKey) => {
        const top = Array.isArray(list) ? list : [];
        if (!top.length) return noDataHtml;
        return top.map((c) => {
          const tag = String(c && (c.inventoryTag || c.id) || "-");
          const isSel = tag === selectedTag;
          const thumb = getThumbSvg(c, sectionKey);
          return `<button data-manual-piece="${tag}" title="${tag}" draggable="true" style="background:${isSel ? "#e9f3ff" : "#fff"};">${thumb}</button>`;
        }).join("");
      };

      const sectionHtml = (key, title, list) => {
        const open = !!trayOpen[key];
        return `
          <div class="manual-tray-section">
            <div class="manual-tray-cards-wrap ${open ? "open" : ""}">
              <div class="manual-tray-cards-grid">${makeCards(list, key)}</div>
            </div>
            <button type="button" class="manual-tray-toggle" data-manual-toggle="${key}">
              <span>${title}</span>
              <span>${open ? "&#9662;" : "&#9656;"}</span>
            </button>
          </div>
        `;
      };

      return `
        <div class="manual-tray-title" data-manual-tray-drag>${t("tray_title", null, "Лоток кусков (ручной)")} <span style="font-size:11px; color:#777;">${t("tray_title_hint_drag", null, "(перетащить)")}</span></div>
        <div class="manual-tray-toolbar">
          <button type="button" data-manual-toolbar="recompute">${t("btn_evaluate", null, "Оценить")}</button>
          <button type="button" data-manual-toolbar="apply">${t("btn_apply", null, "Применить")}</button>
        </div>
        <div class="manual-tray-toolbar" style="margin-top:6px;">
          <button type="button" data-manual-toolbar="rotate-left">↶</button>
          <button type="button" data-manual-toolbar="rotate-right">↷</button>
          <button type="button" data-manual-toolbar="rotate-step-minus">−</button>
          <button type="button" data-manual-toolbar="rotate-step-plus">+</button>
          <span style="font-size:12px; color:#555; align-self:center;">${t("manual_rotate_step", null, "шаг")} ${rotateStepDeg}°</span>
          <button type="button" data-manual-toolbar="z-up">${t("manual_z_up", null, "Выше")}</button>
          <button type="button" data-manual-toolbar="z-down">${t("manual_z_down", null, "Ниже")}</button>
          <button type="button" data-manual-toolbar="z-front">${t("manual_z_front", null, "Вперёд")}</button>
          <button type="button" data-manual-toolbar="z-back">${t("manual_z_back", null, "Назад")}</button>
        </div>
        <div class="manual-tray-metrics" title="${selectedInfoLine.replace(/"/g, "&quot;")}">${selectedInfoLine}</div>
        <div class="manual-tray-metrics" title="${metricsLine.replace(/"/g, "&quot;")}">${metricsLine}</div>
        ${hasDebug ? `
          <details class="manual-tray-debug">
            <summary>${t("manual_debug_summary", null, "Диагностика")}</summary>
            ${seamDebugLine ? `<div class="manual-tray-metrics" title="${seamDebugLine.replace(/"/g, "&quot;")}">${seamDebugLine}</div>` : ""}
            ${seamFlowSummary ? `<div class="manual-tray-metrics" title="${seamFlowSummary.replace(/"/g, "&quot;")}">${seamFlowSummary}</div>` : ""}
            ${seamExcludedSummary ? `<div class="manual-tray-metrics" title="${seamExcludedSummary.replace(/"/g, "&quot;")}">${seamExcludedSummary}</div>` : ""}
          </details>
        ` : ""}
        <div class="manual-tray-sections">
          ${sectionHtml("large", `${t("tray_section_large", null, "Большие")} ${formatSectionRangeCm("large", sections)}`, sections.large)}
          ${sectionHtml("medium", `${t("tray_section_medium", null, "Средние")} ${formatSectionRangeCm("medium", sections)}`, sections.medium)}
          ${sectionHtml("small", `${t("tray_section_small", null, "Малые")} ${formatSectionRangeCm("small", sections)}`, sections.small)}
        </div>
      `;
    }

    return { renderHtml };
  }

  global.FurLabManualTrayView = Object.assign({}, global.FurLabManualTrayView || {}, {
    createManualTrayView
  });
})(window);
