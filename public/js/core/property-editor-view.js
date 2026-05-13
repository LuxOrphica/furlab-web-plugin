(function registerFurLabPropertyEditorView(globalObj) {
  const root = globalObj || (typeof window !== "undefined" ? window : globalThis);

  function createPropertyEditorView(deps) {
    const byId = deps && deps.byId;
    const state = deps && deps.state;
    const findPlacementForFragment = deps && deps.findPlacementForFragment;
    const polygonArea = deps && deps.polygonArea;
    const polylineLength = deps && deps.polylineLength;
    const DEFAULT_NAP_DIRECTION_DEG = deps && deps.DEFAULT_NAP_DIRECTION_DEG;
    const getZoneNapDirectionDeg = deps && deps.getZoneNapDirectionDeg;
    const setZoneNapDirectionDeg = deps && deps.setZoneNapDirectionDeg;
    const getLayoutModeTitle = deps && deps.getLayoutModeTitle;
    const api = deps && deps.api;
    const closeReplaceCandidateModal = deps && deps.closeReplaceCandidateModal;
    const openReplaceCandidateModal = deps && deps.openReplaceCandidateModal;
    const renderPlacementRows = deps && deps.renderPlacementRows;
    const renderDetailZoneTree = deps && deps.renderDetailZoneTree;
      const renderScene = deps && deps.renderScene;
      const openInventoryStep1 = deps && deps.openInventoryStep1;
      const renderManualTrayIntoRoot = deps && deps.renderManualTrayIntoRoot;
      const saveLayoutEntry = deps && deps.saveLayoutEntry;
      const markLayoutDirty = deps && deps.markLayoutDirty;
    const getRadialAutoCenter = deps && deps.getRadialAutoCenter;
    const getFurMaterialById = deps && deps.getFurMaterialById;
    const ensureFurMaterialLoaded = deps && deps.ensureFurMaterialLoaded;
    const importSvgContours = deps && deps.importSvgContours;
      let regularLayoutPreviewTimer = null;

    function ensurePropertyEditorUi() {
      if (!state.propertyEditorUi || typeof state.propertyEditorUi !== "object") {
        state.propertyEditorUi = {};
      }
      if (!state.propertyEditorUi.sections || typeof state.propertyEditorUi.sections !== "object") {
        state.propertyEditorUi.sections = {};
      }
      if (!state.propertyEditorUi.layoutEdit || typeof state.propertyEditorUi.layoutEdit !== "object") {
        state.propertyEditorUi.layoutEdit = {};
      }
      return state.propertyEditorUi;
    }

    function isSectionOpen(key, defaultOpen) {
      const ui = ensurePropertyEditorUi();
      if (Object.prototype.hasOwnProperty.call(ui.sections, key)) {
        return !!ui.sections[key];
      }
      return !!defaultOpen;
    }

    function renderEditorSection(key, title, bodyHtml, defaultOpen = true) {
      const open = isSectionOpen(key, defaultOpen);
      return `
        <section class="prop-section">
          <button type="button" class="prop-section-toggle" data-prop-section="${key}" aria-expanded="${open ? "true" : "false"}">
            <span class="prop-section-toggle-icon">${open ? "▾" : "▸"}</span>
            <span>${title}</span>
          </button>
          <div class="prop-section-body${open ? " open" : ""}">
            ${bodyHtml}
          </div>
        </section>
      `;
    }

    function bindSectionToggles(rootEl) {
      if (!rootEl) return;
      const ui = ensurePropertyEditorUi();
      rootEl.querySelectorAll("[data-prop-section]").forEach((btn) => {
        btn.onclick = () => {
          const key = String(btn.getAttribute("data-prop-section") || "");
          if (!key) return;
          ui.sections[key] = !isSectionOpen(key, true);
          renderPropertyEditor();
        };
      });
    }

    function parseLocaleNumber(v, fallback = null) {
      if (v === null || v === undefined) return fallback;
      if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
      const s = String(v).trim().replace(",", ".");
      if (!s) return fallback;
      const n = Number(s);
      return Number.isFinite(n) ? n : fallback;
    }

    function isLayoutEditEnabled(layoutId, defaultValue = true) {
      const ui = ensurePropertyEditorUi();
      const key = String(layoutId || "");
      if (key && Object.prototype.hasOwnProperty.call(ui.layoutEdit, key)) {
        return !!ui.layoutEdit[key];
      }
      return !!defaultValue;
    }

    function setLayoutEditEnabled(layoutId, value) {
      const ui = ensurePropertyEditorUi();
      const key = String(layoutId || "");
      if (!key) return;
      ui.layoutEdit[key] = !!value;
    }

    let _propToastTimer = null;
    function showPropToast(msg, isError) {
      let el = document.getElementById("propSaveToast");
      if (!el) {
        el = document.createElement("div");
        el.id = "propSaveToast";
        el.className = "prop-save-toast";
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.className = "prop-save-toast" + (isError ? " prop-save-toast--error" : "") + " prop-save-toast--visible";
      if (_propToastTimer) clearTimeout(_propToastTimer);
      _propToastTimer = setTimeout(() => {
        el.className = "prop-save-toast";
      }, 3000);
    }

    function renderPropertyEditor() {
      const root = byId("propertyEditor");
      if (!root) return;
      const detail = state.details.find((d) => d.id === state.selectedDetailId) || null;
      const zone = state.zones.find((z) => Number(z && z.id) === Number(state.selectedZoneId)) || null;
      const selectedFragId = Number(state.selectedFragmentId || 0);
      const selectedFrag = Array.isArray(state.layoutRun.fragments)
        ? state.layoutRun.fragments.find((f) => Number(f.id || 0) === selectedFragId)
        : null;
      const selectedPlacement = findPlacementForFragment(selectedFrag || selectedFragId);
      const fragArea = selectedFrag ? polygonArea(selectedFrag.points || []) : 0;
      const fragPerim = selectedFrag ? polylineLength(selectedFrag.points || [], true) : 0;
      const allowance = parseLocaleNumber(state.layoutRun && state.layoutRun.allowanceMm, null);
      const baseNapDeg = selectedPlacement && Number.isFinite(Number(selectedPlacement.napDirectionDeg))
        ? Number(selectedPlacement.napDirectionDeg)
        : Number(state.layoutRun.lastNapDirectionDeg || DEFAULT_NAP_DIRECTION_DEG);
      const alignRotNum = selectedPlacement && Number.isFinite(Number(selectedPlacement.alignRotationDeg))
        ? Number(selectedPlacement.alignRotationDeg)
        : 0;
      const effectiveNapDeg = selectedPlacement && Number.isFinite(Number(selectedPlacement.napEffectiveDeg))
        ? (((Number(selectedPlacement.napEffectiveDeg) % 360) + 360) % 360)
        : ((((baseNapDeg + alignRotNum) % 360) + 360) % 360);
      const nap = `${effectiveNapDeg.toFixed(1)}°`;
      const targetNapRaw = state.layoutRun && state.layoutRun.lastConstraints && Number.isFinite(Number(state.layoutRun.lastConstraints.napDirectionDeg))
        ? Number(state.layoutRun.lastConstraints.napDirectionDeg)
        : Number(state.layoutRun.lastNapDirectionDeg || DEFAULT_NAP_DIRECTION_DEG);
      const targetNapDeg = ((targetNapRaw % 360) + 360) % 360;
      const napTolRaw = state.layoutRun && state.layoutRun.lastConstraints && Number.isFinite(Number(state.layoutRun.lastConstraints.napToleranceDeg))
        ? Number(state.layoutRun.lastConstraints.napToleranceDeg)
        : Number((byId("invNapTol") && byId("invNapTol").value) || 15);
      const napTolDeg = Math.max(0, Math.min(180, Number.isFinite(napTolRaw) ? napTolRaw : 3));
      const napDeltaAbs = selectedPlacement
        ? Math.min(
            Math.abs(effectiveNapDeg - targetNapDeg),
            360 - Math.abs(effectiveNapDeg - targetNapDeg)
          )
        : null;
      const napCheckOk = napDeltaAbs === null
        ? null
        : (napTolDeg <= 1e-6 ? napDeltaAbs <= 1e-6 : napDeltaAbs <= napTolDeg + 1e-6);
      const napTargetText = `${targetNapDeg.toFixed(1)}°`;
      const napTolText = `${napTolDeg.toFixed(1)}°`;
      const napDeltaToTargetText = napDeltaAbs === null ? "-" : `${napDeltaAbs.toFixed(3)}°`;
      const napCheckText = napCheckOk === null ? "-" : (napCheckOk ? "OK" : "FAIL");
      const fitScore = selectedPlacement && Number.isFinite(Number(selectedPlacement.fitScore))
        ? Number(selectedPlacement.fitScore).toFixed(2)
        : "-";
      const fitAreaRatio = selectedPlacement && Number.isFinite(Number(selectedPlacement.fitAreaRatio))
        ? Number(selectedPlacement.fitAreaRatio).toFixed(3)
        : "-";
      const fitOverlap = selectedPlacement && Number.isFinite(Number(selectedPlacement.fitOverlap))
        ? Number(selectedPlacement.fitOverlap).toFixed(3)
        : "-";
      const fitInside = selectedPlacement && Number.isFinite(Number(selectedPlacement.fitInsidePercent))
        ? `${Number(selectedPlacement.fitInsidePercent).toFixed(1)}%`
        : "-";
      const fitChamfer = selectedPlacement && Number.isFinite(Number(selectedPlacement.fitChamferMm))
        ? `${Number(selectedPlacement.fitChamferMm).toFixed(1)} мм`
        : "-";
      const napDelta = selectedPlacement && Number.isFinite(Number(selectedPlacement.napDeltaDeg))
        ? `${Number(selectedPlacement.napDeltaDeg).toFixed(1)}°`
        : "-";
      const alignRot = selectedPlacement && Number.isFinite(Number(selectedPlacement.alignRotationDeg))
        ? `${Number(selectedPlacement.alignRotationDeg).toFixed(1)}°`
        : "-";
      const selectedLayout = Array.isArray(state.layouts)
        ? (state.layouts.find((x) => Number(x.id) === Number(state.selectedLayoutId || 0)) || null)
        : null;
      const currentLayoutMode = String((selectedLayout && selectedLayout.mode) || state.layoutMode || "");
      const isManualLayoutSelected = currentLayoutMode === "inventory_manual";
      const isFragmentOnlyRegularLayoutSelected = currentLayoutMode === "longitudinal" || currentLayoutMode === "shifted" || currentLayoutMode === "transverse" || currentLayoutMode === "radial";
      const isIntarsiaMode = currentLayoutMode === "intarsia";
      const actionTitle = currentLayoutMode === "inventory_manual"
        ? "Загрузить кандидаты из БД"
        : (isFragmentOnlyRegularLayoutSelected
          ? "Сгенерировать выкладку"
        : (currentLayoutMode === "inventory_split_return"
          ? "Подобрать (Split & Return)"
          : (currentLayoutMode === "inventory"
          ? "Подобрать из библиотеки"
          : (currentLayoutMode === "intarsia" ? "Сгенерировать интарсию" : "Заполнить остаток"))));
      const selectedLayoutName = selectedLayout ? String(selectedLayout.name || "") : "";
      const selectedLayoutModeTitle = getLayoutModeTitle(selectedLayout ? selectedLayout.mode : state.layoutMode);
      const zoneAreaValue = zone ? polygonArea(zone.points || []).toFixed(2) : "-";
      const zonePerimeterValue = zone ? polylineLength(zone.points || [], true).toFixed(2) : "-";
      const zoneValidation = state.zoneValidation && Array.isArray(state.zoneValidation.zones)
        ? (state.zoneValidation.zones.find((item) => Number(item && item.id || 0) === Number(zone && zone.id || 0)) || null)
        : null;
      const detailValidation = state.zoneValidation && Array.isArray(state.zoneValidation.details)
        ? (state.zoneValidation.details.find((item) => Number(item && item.id || 0) === Number(detail && detail.id || 0)) || null)
        : null;
      const selectedMaterial = typeof getFurMaterialById === "function"
        ? getFurMaterialById(String(state.selectedMaterialId || ""))
        : null;

      if (state.uiPanel === "materials") {
        const selectedMaterialId = String(state.selectedMaterialId || "");
        if (selectedMaterialId && typeof ensureFurMaterialLoaded === "function") {
          void ensureFurMaterialLoaded(selectedMaterialId);
        }
        if (!selectedMaterial) {
          root.innerHTML = '<div class="tree-empty">Меховой материал не выбран</div>';
          return;
        }
        const swatch = selectedMaterial.colorHex
          ? `<span class="prop-color-swatch" style="background:${String(selectedMaterial.colorHex)};"></span>`
          : '<span class="prop-color-swatch"></span>';
        root.innerHTML = `
          <div class="prop-title">Меховой материал</div>
          ${renderEditorSection("fur_info", "Информация", `
            <div class="prop-row"><div class="prop-label">Название</div><div>${String(selectedMaterial.name || "-")}</div></div>
            <div class="prop-row"><div class="prop-label">Категория</div><div>${String(selectedMaterial.category || "-")}</div></div>
            <div class="prop-row"><div class="prop-label">Вид</div><div>${String(selectedMaterial.species || "-")}</div></div>
          `, true)}
          ${renderEditorSection("fur_color", "Цвет и пигментация", `
            <div class="prop-row"><div class="prop-label">Цвет</div><div class="prop-color-row">${swatch}<span>${String(selectedMaterial.colorHex || "-")}</span></div></div>
            <div class="prop-row"><div class="prop-label">Меланин</div><div>${selectedMaterial.melanin !== null && selectedMaterial.melanin !== undefined ? Number(selectedMaterial.melanin).toFixed(2) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Феомеланин</div><div>${selectedMaterial.pheomelanin !== null && selectedMaterial.pheomelanin !== undefined ? Number(selectedMaterial.pheomelanin).toFixed(2) : "-"}</div></div>
          `, true)}
          ${renderEditorSection("fur_size", "Размеры заготовки", `
            <div class="prop-row"><div class="prop-label">Длина макс, мм</div><div>${selectedMaterial.maxLengthMm !== null && selectedMaterial.maxLengthMm !== undefined ? Number(selectedMaterial.maxLengthMm).toFixed(0) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Ширина макс, мм</div><div>${selectedMaterial.maxWidthMm !== null && selectedMaterial.maxWidthMm !== undefined ? Number(selectedMaterial.maxWidthMm).toFixed(0) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Толщина, мм</div><div>${selectedMaterial.thicknessMm !== null && selectedMaterial.thicknessMm !== undefined ? Number(selectedMaterial.thicknessMm).toFixed(2) : "-"}</div></div>
          `, true)}
          ${renderEditorSection("fur_aesthetic", "Эстетика", `
            <div class="prop-row"><div class="prop-label">Блеск</div><div>${selectedMaterial.gloss !== null && selectedMaterial.gloss !== undefined ? Number(selectedMaterial.gloss).toFixed(2) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Мягкость</div><div>${selectedMaterial.softness !== null && selectedMaterial.softness !== undefined ? Number(selectedMaterial.softness).toFixed(2) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Опушенность</div><div>${selectedMaterial.fluffiness !== null && selectedMaterial.fluffiness !== undefined ? Number(selectedMaterial.fluffiness).toFixed(2) : "-"}</div></div>
          `, true)}
          ${renderEditorSection("fur_hair", "Геометрия ворса", `
            <div class="prop-row"><div class="prop-label">Длина, мм</div><div>${selectedMaterial.pileLengthMm !== null && selectedMaterial.pileLengthMm !== undefined ? Number(selectedMaterial.pileLengthMm).toFixed(1) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Диаметр, мм</div><div>${selectedMaterial.hairThicknessMm !== null && selectedMaterial.hairThicknessMm !== undefined ? Number(selectedMaterial.hairThicknessMm).toFixed(2) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Густота, шт/inch²</div><div>${selectedMaterial.pileDensityPerIn2 !== null && selectedMaterial.pileDensityPerIn2 !== undefined ? Number(selectedMaterial.pileDensityPerIn2).toFixed(0) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Уточнение</div><div>${selectedMaterial.taper !== null && selectedMaterial.taper !== undefined ? Number(selectedMaterial.taper).toFixed(2) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Сегментация, шт</div><div>${selectedMaterial.segmentationCount !== null && selectedMaterial.segmentationCount !== undefined ? Number(selectedMaterial.segmentationCount).toFixed(0) : "-"}</div></div>
          `, true)}
          ${renderEditorSection("fur_orientation", "Ориентация и извитость", `
            <div class="prop-row"><div class="prop-label">Изгиб/наклон волос</div><div>${selectedMaterial.hairBend !== null && selectedMaterial.hairBend !== undefined ? Number(selectedMaterial.hairBend).toFixed(2) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Разброс направления изгиба</div><div>${selectedMaterial.bendSpread !== null && selectedMaterial.bendSpread !== undefined ? Number(selectedMaterial.bendSpread).toFixed(2) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Радиус извитости, мм</div><div>${selectedMaterial.curlRadiusMm !== null && selectedMaterial.curlRadiusMm !== undefined ? Number(selectedMaterial.curlRadiusMm).toFixed(1) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Эффект скрученности</div><div>${selectedMaterial.curlEffect !== null && selectedMaterial.curlEffect !== undefined ? Number(selectedMaterial.curlEffect).toFixed(2) : "-"}</div></div>
          `, true)}
          ${renderEditorSection("fur_physics", "Физика полотна", `
            <div class="prop-row"><div class="prop-label">Упругость</div><div>${selectedMaterial.elasticity !== null && selectedMaterial.elasticity !== undefined ? Number(selectedMaterial.elasticity).toFixed(2) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Растяжимость</div><div>${selectedMaterial.stretch !== null && selectedMaterial.stretch !== undefined ? Number(selectedMaterial.stretch).toFixed(2) : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Вес полотна, г/м²</div><div>${selectedMaterial.weightGm2 !== null && selectedMaterial.weightGm2 !== undefined ? Number(selectedMaterial.weightGm2).toFixed(0) : "-"}</div></div>
          `, true)}
        `;
        bindSectionToggles(root);
        return;
      }

      if (state.uiPanel === "zones") {
        if (zone) {
          const zoneNapDeg = typeof getZoneNapDirectionDeg === "function"
            ? Number(getZoneNapDirectionDeg(zone))
            : Number(DEFAULT_NAP_DIRECTION_DEG || 90);
          root.innerHTML = `
            <div class="prop-title">Зона</div>
            ${renderEditorSection("zone_info", "Информация", `
              <div class="prop-row"><div class="prop-label">Название</div><div>${String(zone.name || `Зона ${zone.id}`)}</div></div>
              <div class="prop-row"><div class="prop-label">Detail ID</div><div>${detail ? detail.id : "-"}</div></div>
              <div class="prop-row"><div class="prop-label">Zone ID</div><div>${zone.id}</div></div>
              <div class="prop-row"><div class="prop-label">Направление ворса, °</div><div class="prop-field-inline"><input id="zoneNapDirectionInput" class="prop-input prop-input-compact prop-input-numeric prop-input-align-start" type="number" min="0" max="359.9" step="1" value="${zoneNapDeg.toFixed(1)}"></div></div>
            `, true)}
            ${renderEditorSection("zone_material", "Меховой материал", `
              <div class="prop-row"><div class="prop-label">Материал</div><div>${String(zone.materialName || zone.materialId || "-")}</div></div>
              <div class="prop-row"><div class="prop-label">Material ID</div><div>${String(zone.materialId || "-")}</div></div>
            `, true)}
            ${renderEditorSection("zone_geometry", "Геометрия", `
              <div class="prop-row"><div class="prop-label">Площадь зоны</div><div>${zoneAreaValue} мм²</div></div>
              <div class="prop-row"><div class="prop-label">Периметр зоны</div><div>${zonePerimeterValue} мм</div></div>
            `, true)}
          `;
          bindSectionToggles(root);
          const zoneNapInput = byId("zoneNapDirectionInput");
          if (zoneNapInput && typeof setZoneNapDirectionDeg === "function") {
            const applyNap = () => {
              const raw = Number(zoneNapInput.value);
              const next = setZoneNapDirectionDeg(zone.id, raw);
              if (Number.isFinite(Number(next))) {
                zoneNapInput.value = Number(next).toFixed(1);
              }
            };
            zoneNapInput.onchange = applyNap;
            zoneNapInput.onblur = applyNap;
          }
          return;
        }
        if (detail) {
          root.innerHTML = `
            <div class="prop-title">Деталь</div>
            ${renderEditorSection("detail_info", "Информация", `
              <div class="prop-row"><div class="prop-label">Detail ID</div><div>${detail.id}</div></div>
            `, true)}
            <div class="tree-empty" style="margin-top:6px;">Выберите зону, чтобы увидеть её параметры.</div>
          `;
          bindSectionToggles(root);
          return;
        }
        root.innerHTML = '<div class="tree-empty">Нет выбранного объекта</div>';
        return;
      }

      if (!selectedLayout) {
        root.innerHTML = '<div class="tree-empty">Выкладка не выбрана</div>';
        return;
      }

      if (selectedFragId > 0) {
        const regularFragmentMode = isFragmentOnlyRegularLayoutSelected;
        const allowanceText = Number.isFinite(Number(allowance)) ? Number(allowance).toFixed(1) : "-";
        root.innerHTML = regularFragmentMode
          ? `
          <div class="prop-title">Фрагмент</div>
          ${renderEditorSection("fragment_info", "Информация", `
            <div class="prop-row"><div class="prop-label">ID фрагмента</div><div>${selectedFragId}</div></div>
            <div class="prop-row"><div class="prop-label">Площадь, мм²</div><div>${fragArea.toFixed(1)}</div></div>
            <div class="prop-row"><div class="prop-label">Периметр, мм</div><div>${fragPerim.toFixed(1)}</div></div>
            <div class="prop-row"><div class="prop-label">Резерв под припуск, мм</div><div>${allowanceText}</div></div>
            <div class="prop-row"><div class="prop-label">Режим</div><div>${selectedLayoutModeTitle}</div></div>
          `, true)}
          `
          : `
          <div class="prop-title">Фрагмент</div>
          ${renderEditorSection("fragment_info", "Информация", `
            <div class="prop-row"><div class="prop-label">ID фрагмента</div><div>${selectedFragId}</div></div>
            <div class="prop-row"><div class="prop-label">Площадь, мм²</div><div>${fragArea.toFixed(1)}</div></div>
            <div class="prop-row"><div class="prop-label">Периметр, мм</div><div>${fragPerim.toFixed(1)}</div></div>
          `, true)}
          ${renderEditorSection("fragment_inventory", "Инвентарь", `
            <div class="prop-row"><div class="prop-label">Инвентарный номер</div><div>${selectedPlacement && selectedPlacement.inventoryTag ? selectedPlacement.inventoryTag : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Статус</div><div>${selectedPlacement && selectedPlacement.status ? selectedPlacement.status : "-"}</div></div>
            <div class="prop-actions">
              <button class="prop-btn" id="fragReplaceBtn" ${selectedPlacement ? "" : "disabled"}>Заменить</button>
              <button class="prop-btn" id="fragClearBtn" ${selectedPlacement ? "" : "disabled"}>Снять подбор</button>
            </div>
          `, true)}
          ${renderEditorSection("fragment_params", "Параметры", `
            <div class="prop-row"><div class="prop-label">Резерв под припуск, мм</div><div>${allowanceText}</div></div>
            <div class="prop-row"><div class="prop-label">Направление ворса</div><div>${nap}</div></div>
            <div class="prop-row"><div class="prop-label">Цель ворса</div><div>${napTargetText}</div></div>
            <div class="prop-row"><div class="prop-label">Допуск ворса</div><div>${napTolText}</div></div>
            <div class="prop-row"><div class="prop-label">Δ к цели</div><div>${napDeltaToTargetText}</div></div>
            <div class="prop-row"><div class="prop-label">Проверка ворса</div><div style="font-weight:600; color:${napCheckOk === null ? "#666" : (napCheckOk ? "#0a7d2e" : "#b42318")};">${napCheckText}</div></div>
          `, true)}
          ${renderEditorSection("fragment_quality", "Качество подбора", `
            <div class="prop-row"><div class="prop-label">Fit score</div><div>${fitScore}</div></div>
            <div class="prop-row"><div class="prop-label">Совпадение площади</div><div>${fitAreaRatio}</div></div>
            <div class="prop-row"><div class="prop-label">Overlap</div><div>${fitOverlap}</div></div>
            <div class="prop-row"><div class="prop-label">Внутри фрагмента</div><div>${fitInside}</div></div>
            <div class="prop-row"><div class="prop-label">Chamfer</div><div>${fitChamfer}</div></div>
            <div class="prop-row"><div class="prop-label">Δ ворса</div><div>${napDelta}</div></div>
            <div class="prop-row"><div class="prop-label">Поворот совмещения</div><div>${alignRot}</div></div>
          `, false)}
          `;
        bindSectionToggles(root);
        if (regularFragmentMode) {
          return;
        }
        const clearBtn = byId("fragClearBtn");
        if (clearBtn && selectedPlacement) {
          clearBtn.onclick = () => {
            const target = findPlacementForFragment(selectedFrag || selectedFragId);
            const targetIdx = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements.indexOf(target) : -1;
            state.layoutRun.placements = (state.layoutRun.placements || []).filter((_, idx) => idx !== targetIdx);
            renderDetailZoneTree();
            renderPropertyEditor();
            renderScene();
          };
        }
        const replaceBtn = byId("fragReplaceBtn");
        if (replaceBtn && selectedPlacement) {
          replaceBtn.onclick = async () => {
            const frag = Array.isArray(state.layoutRun.fragments)
              ? state.layoutRun.fragments.find((f) => Number(f.id || 0) === selectedFragId)
              : null;
            if (!frag) return;
            const targetPlacement = findPlacementForFragment(frag);
            const targetPlacementIdx = Array.isArray(state.layoutRun.placements)
              ? state.layoutRun.placements.indexOf(targetPlacement)
              : -1;
            const excludeInventoryTags = (state.layoutRun.placements || [])
              .filter((p, idx) => idx !== targetPlacementIdx && p && p.status === "matched" && p.inventoryTag)
              .map((p) => String(p.inventoryTag));
            const res = await api("/api/layout/fragment/candidates", "POST", {
              fragment: { id: selectedFragId, points: frag.points || [] },
              axis: state.layoutRun.lastAxis || "y",
              filters: state.layoutRun.lastFilters || {},
              constraints: state.layoutRun.lastConstraints || {},
              candidates: state.layoutRun.candidatePool || [],
              excludeInventoryTags,
              limit: 5
            });
            const info = byId("replaceCandidateInfo");
            const body = byId("replaceCandidateRows");
            if (!res.ok || !Array.isArray(res.items) || !res.items.length) {
              info.textContent = `Фрагмент ${selectedFragId}: подходящих кандидатов нет`;
              body.innerHTML = '<tr><td colspan="5" style="font-size:12px; color:#666; text-align:center;">Нет кандидатов</td></tr>';
              byId("replaceCandidateApplyBtn").onclick = () => closeReplaceCandidateModal();
              openReplaceCandidateModal();
              return;
            }
            info.textContent = `Фрагмент ${selectedFragId}: top-${res.items.length} по score`;
            body.innerHTML = res.items.map((it, i) => `
              <tr>
                <td style="font-size:12px;">${it.inventoryTag || "-"}</td>
                <td style="font-size:12px;">${Number(it.fitScore || 0).toFixed(2)}</td>
                <td style="font-size:12px;">${Number(it.fitOverlap || 0).toFixed(3)}</td>
                <td style="font-size:12px;">${Number(it.fitChamferMm || 0).toFixed(1)}</td>
                <td style="font-size:12px; text-align:center;"><input type="radio" name="replaceCandidatePick" value="${i}" ${i === 0 ? "checked" : ""}></td>
              </tr>
            `).join("");
            byId("replaceCandidateApplyBtn").onclick = () => {
              const pickedRadio = document.querySelector('input[name="replaceCandidatePick"]:checked');
              const idx = pickedRadio ? Number(pickedRadio.value || 0) : 0;
              const chosen = res.items[idx];
              if (!chosen) return;
              state.layoutRun.placements = (state.layoutRun.placements || []).map((p, i) => {
                if (i !== targetPlacementIdx) return p;
                return {
                  ...p,
                  scrapPieceId: String(chosen.scrapPieceId || ""),
                  inventoryTag: String(chosen.inventoryTag || ""),
                  scrapContour: String(chosen.scrapContour || ""),
                  napDirectionDeg: Number.isFinite(Number(chosen.napDirectionDeg)) ? Number(chosen.napDirectionDeg) : null,
                  bboxWidthMm: Number.isFinite(Number(chosen.bboxWidthMm)) ? Number(chosen.bboxWidthMm) : null,
                  bboxHeightMm: Number.isFinite(Number(chosen.bboxHeightMm)) ? Number(chosen.bboxHeightMm) : null,
                  fitScore: Number.isFinite(Number(chosen.fitScore)) ? Number(chosen.fitScore) : null,
                  fitAreaRatio: Number.isFinite(Number(chosen.fitAreaRatio)) ? Number(chosen.fitAreaRatio) : null,
                  fitCoverageRatio: Number.isFinite(Number(chosen.fitCoverageRatio)) ? Number(chosen.fitCoverageRatio) : null,
                  fitOverlap: Number.isFinite(Number(chosen.fitOverlap)) ? Number(chosen.fitOverlap) : null,
                  fitInsidePercent: Number.isFinite(Number(chosen.fitInsidePercent)) ? Number(chosen.fitInsidePercent) : null,
                  fitChamferMm: Number.isFinite(Number(chosen.fitChamferMm)) ? Number(chosen.fitChamferMm) : null,
                  napDeltaDeg: Number.isFinite(Number(chosen.napDeltaDeg)) ? Number(chosen.napDeltaDeg) : null,
                  alignRotationDeg: Number.isFinite(Number(chosen.alignRotationDeg)) ? Number(chosen.alignRotationDeg) : null,
                  napEffectiveDeg: Number.isFinite(Number(chosen.napEffectiveDeg)) ? Number(chosen.napEffectiveDeg) : null,
                  alignOffsetX: Number.isFinite(Number(chosen.alignOffsetX)) ? Number(chosen.alignOffsetX) : null,
                  alignOffsetY: Number.isFinite(Number(chosen.alignOffsetY)) ? Number(chosen.alignOffsetY) : null,
                  alignedContour: Array.isArray(chosen.alignedContour) ? chosen.alignedContour : null,
                  status: "matched",
                  reason: null
                };
              });
              renderPlacementRows(state.layoutRun.placements);
              renderDetailZoneTree();
              renderPropertyEditor();
              renderScene();
              closeReplaceCandidateModal();
            };
            openReplaceCandidateModal();
          };
        }
        return;
      }

      if (!detail && !zone) {
        root.innerHTML = '<div class="tree-empty">Нет выбранного объекта</div>';
        return;
      }

      const allowanceValue = Number.isFinite(allowance) ? allowance : 12;
      const loadedCandidatesCount = Array.isArray(state.layoutRun && state.layoutRun.candidatePool)
        ? state.layoutRun.candidatePool.length
        : 0;
      const lockManualInventoryParams = !!(isManualLayoutSelected && loadedCandidatesCount > 0);
      const isLongitudinalLayoutSelected = currentLayoutMode === "longitudinal";
      const showLongitudinalDebug = false;
      const layoutEditEnabled = selectedLayout ? isLayoutEditEnabled(selectedLayout.id, true) : true;
      const layoutSavedState = !!(selectedLayout && selectedLayout.persistedRunId && !selectedLayout.isDirty);
      const nameInputReadonly = selectedLayout ? "" : "readonly";
      const typeValue = selectedLayout ? selectedLayoutModeTitle : "-";
      const rowsValue = Math.max(1, Number((byId("fillRows") && byId("fillRows").value) || 5));
      const colsValue = Math.max(1, Number((byId("fillCols") && byId("fillCols").value) || 5));
      const axisCountValue = Math.max(0, Math.min(6, Number((byId("fillAxisCount") && byId("fillAxisCount").value) || 1)));
      const angleValue = Math.max(-89, Math.min(89, Number((byId("fillAngleDeg") && byId("fillAngleDeg").value) || 45)));
      const bandStepValue = Math.max(10, Math.min(5000, Number((byId("fillBandStep") && byId("fillBandStep").value) || 120)));
      const shiftPercentValue = Math.max(-100, Math.min(100, Number((byId("fillShiftPercent") && byId("fillShiftPercent").value) || 50)));
      const ringCountValue = Math.max(1, Math.min(20, Number((byId("fillRingCount") && byId("fillRingCount").value) || 4)));
      const sectorCountValue = Math.max(1, Math.min(36, Number((byId("fillSectorCount") && byId("fillSectorCount").value) || 8)));
      const sectorRotationValue = Math.max(-360, Math.min(360, Number((byId("fillSectorRotationDeg") && byId("fillSectorRotationDeg").value) || 0)));
      const innerRadiusValue = Math.max(0, Number((byId("fillInnerRadiusMm") && byId("fillInnerRadiusMm").value) || 0));
      const centerModeValue = String((byId("fillCenterMode") && byId("fillCenterMode").value) || "auto");
      const centerXValue = Number((byId("fillCenterX") && byId("fillCenterX").value) || 0);
      const centerYValue = Number((byId("fillCenterY") && byId("fillCenterY").value) || 0);
      const gapXValue = Math.max(0, Number((byId("fillGapX") && byId("fillGapX").value) || 0));
      const gapYValue = Math.max(0, Number((byId("fillGapY") && byId("fillGapY").value) || 0));
      const cornerRadiusValue = Math.max(0, Number((byId("fillCornerRadius") && byId("fillCornerRadius").value) || 0));
      const workspaceInfoText = String((byId("workspaceInfo") && byId("workspaceInfo").textContent) || "").trim();
      const selectedLayoutBoundZoneId = Number(selectedLayout && selectedLayout.boundZoneId || 0) || 0;
      const selectedLayoutBoundDetailId = Number(selectedLayout && selectedLayout.boundDetailId || 0) || 0;
      const layoutRunZoneId = Number(state.layoutRun && state.layoutRun.selectedZoneId || 0) || 0;
      const selectedZoneIdValue = Number(state.selectedZoneId || 0) || 0;
      const selectedDetailIdValue = Number(state.selectedDetailId || 0) || 0;
      const layoutRunFragmentsCount = Array.isArray(state.layoutRun && state.layoutRun.fragments) ? state.layoutRun.fragments.length : 0;
      const runtimeSnapshot = selectedLayout && selectedLayout.runtimeSnapshot && typeof selectedLayout.runtimeSnapshot === "object"
        ? selectedLayout.runtimeSnapshot
        : null;
      const runtimeSnapshotFragmentsCount = Array.isArray(runtimeSnapshot && runtimeSnapshot.layoutRun && runtimeSnapshot.layoutRun.fragments)
        ? runtimeSnapshot.layoutRun.fragments.length
        : 0;
      const runtimeSnapshotZoneId = Number(runtimeSnapshot && (runtimeSnapshot.selectedZoneId || (runtimeSnapshot.layoutRun && runtimeSnapshot.layoutRun.selectedZoneId) || 0) || 0) || 0;
      const diagnosticRows = isLongitudinalLayoutSelected
        ? `
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">layout.boundZoneId</div><div class="prop-value-diagnostic">${selectedLayoutBoundZoneId || "-"}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">layout.boundDetailId</div><div class="prop-value-diagnostic">${selectedLayoutBoundDetailId || "-"}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">state.selectedZoneId</div><div class="prop-value-diagnostic">${selectedZoneIdValue || "-"}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">state.selectedDetailId</div><div class="prop-value-diagnostic">${selectedDetailIdValue || "-"}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">layoutRun.selectedZoneId</div><div class="prop-value-diagnostic">${layoutRunZoneId || "-"}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">layoutRun.status</div><div class="prop-value-diagnostic">${String(state.layoutRun && state.layoutRun.status || "-")}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">layoutRun.active</div><div class="prop-value-diagnostic">${state.layoutRun && state.layoutRun.active ? "true" : "false"}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">layoutRun.fragments</div><div class="prop-value-diagnostic">${layoutRunFragmentsCount}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">snapshot.selectedZoneId</div><div class="prop-value-diagnostic">${runtimeSnapshotZoneId || "-"}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">snapshot.fragments</div><div class="prop-value-diagnostic">${runtimeSnapshotFragmentsCount}</div></div>
          <div class="prop-row prop-row-diagnostic"><div class="prop-label prop-label-diagnostic">workspaceInfo</div><div class="prop-value-diagnostic" style="word-break:break-word;">${workspaceInfoText ? String(workspaceInfoText) : "-"}</div></div>
        `
        : "";
      const layoutActionSectionTitle = isFragmentOnlyRegularLayoutSelected ? "Параметры выкладки" : "Инвентарь";
      const layoutActionSectionHint = isFragmentOnlyRegularLayoutSelected
        ? ""
        : (isManualLayoutSelected ? "" : `<div class="tree-empty" style="margin-top:6px;">Настройки подбора, preview и применение</div>`);
      const _lockedCls = !layoutEditEnabled ? " prop-input--locked" : "";
      const _lockedAttr = !layoutEditEnabled ? " disabled" : "";
      const layoutActionSectionBody = isFragmentOnlyRegularLayoutSelected
        ? `
          <div class="prop-row prop-row-compact"><div class="prop-label">Резерв под припуски, мм</div><div class="prop-field-compact"><input id="layoutAllowanceInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="0" max="200" step="0.5" value="${Number(allowanceValue).toFixed(1)}"${_lockedAttr}></div></div>
          ${currentLayoutMode === "transverse"
            ? `<div class="prop-row prop-row-compact"><div class="prop-label">Оси</div><div class="prop-field-compact"><input id="layoutAxisCountInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="0" max="6" step="1" value="${axisCountValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Шаг, мм</div><div class="prop-field-compact"><input id="layoutBandStepInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="10" max="5000" step="5" value="${bandStepValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Угол, °</div><div class="prop-field-compact"><input id="layoutAngleDegInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="-89" max="89" step="1" value="${angleValue}"${_lockedAttr}></div></div>`
            : currentLayoutMode === "radial"
            ? `<div class="prop-row prop-row-compact"><div class="prop-label">Кольца</div><div class="prop-field-compact"><input id="layoutRingCountInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="1" max="20" step="1" value="${ringCountValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Секторы</div><div class="prop-field-compact"><input id="layoutSectorCountInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="1" max="36" step="1" value="${sectorCountValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Поворот, °</div><div class="prop-field-compact"><input id="layoutSectorRotationInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="-360" max="360" step="1" value="${sectorRotationValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Внутренний радиус, мм</div><div class="prop-field-compact"><input id="layoutInnerRadiusInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="0" max="5000" step="1" value="${innerRadiusValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Центр</div><div class="prop-field-compact"><select id="layoutCenterModeInput" class="prop-input prop-input-compact${_lockedCls}"${_lockedAttr}><option value="auto"${centerModeValue === "auto" ? " selected" : ""}>Авто</option><option value="manual"${centerModeValue === "manual" ? " selected" : ""}>Вручную</option></select></div></div>
               <div class="tree-empty" style="margin:2px 0 6px; font-size:11px;">При режиме «Вручную» это координаты центра рисунка в мм на рабочем поле.</div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Координата X, мм</div><div class="prop-field-compact"><input id="layoutCenterXInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="-100000" max="100000" step="1" value="${centerXValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Координата Y, мм</div><div class="prop-field-compact"><input id="layoutCenterYInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="-100000" max="100000" step="1" value="${centerYValue}"${_lockedAttr}></div></div>`
            : currentLayoutMode === "shifted"
            ? `<div class="prop-row prop-row-compact"><div class="prop-label">Ряды</div><div class="prop-field-compact"><input id="layoutRowsInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="1" max="20" step="1" value="${rowsValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Колонки</div><div class="prop-field-compact"><input id="layoutColsInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="1" max="20" step="1" value="${colsValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Смещение ряда, %</div><div class="prop-field-compact"><input id="layoutShiftPercentInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="-100" max="100" step="1" value="${shiftPercentValue}"${_lockedAttr}></div></div>`
            : `<div class="prop-row prop-row-compact"><div class="prop-label">Ряды</div><div class="prop-field-compact"><input id="layoutRowsInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="1" max="20" step="1" value="${rowsValue}"${_lockedAttr}></div></div>
               <div class="prop-row prop-row-compact"><div class="prop-label">Колонки</div><div class="prop-field-compact"><input id="layoutColsInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="1" max="20" step="1" value="${colsValue}"${_lockedAttr}></div></div>`}
          <div class="prop-row prop-row-compact"><div class="prop-label">Зазор X, мм</div><div class="prop-field-compact"><input id="layoutGapXInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="0" max="1000" step="1" value="${gapXValue}"${_lockedAttr}></div></div>
          <div class="prop-row prop-row-compact"><div class="prop-label">Зазор Y, мм</div><div class="prop-field-compact"><input id="layoutGapYInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="0" max="1000" step="1" value="${gapYValue}"${_lockedAttr}></div></div>
          ${(currentLayoutMode === "transverse" || currentLayoutMode === "radial") ? "" : `<div class="prop-row prop-row-compact"><div class="prop-label">Скругление, мм</div><div class="prop-field-compact"><input id="layoutCornerRadiusInput" class="prop-input prop-input-compact prop-input-numeric${_lockedCls}" type="number" min="0" max="1000" step="1" value="${cornerRadiusValue}"${_lockedAttr}></div></div>`}
        `
        : (() => {
          const furCatalog = Array.isArray(state.furMaterialsCatalog) ? state.furMaterialsCatalog : [];
          const currentFurFilter = String(state.manualFurMaterialFilterId || "");
          const furOptions = furCatalog.map((m) => {
            const sel = String(m.id || "") === currentFurFilter ? " selected" : "";
            return `<option value="${String(m.id || "").replace(/"/g, "&quot;")}"${sel}>${String(m.name || m.id || "").replace(/</g, "&lt;")}</option>`;
          }).join("");
          return `
          <div class="prop-row prop-row-compact">
            <div class="prop-label">Мех</div>
            <div class="prop-field-compact">
              <select id="manualFurFilterSelect" class="prop-input prop-input-compact"${lockManualInventoryParams ? " disabled" : ""}>
                <option value=""${currentFurFilter === "" ? " selected" : ""}>Неважно</option>
                ${furOptions}
              </select>
            </div>
          </div>
          <div class="prop-row prop-row-compact">
            <div class="prop-label">Резерв припуска, мм</div>
            <div class="prop-field-compact"><input id="layoutAllowanceInput" class="prop-input prop-input-compact prop-input-numeric" type="number" min="0" max="200" step="0.5" value="${Number(allowanceValue).toFixed(1)}"${!layoutEditEnabled ? " disabled" : ""}></div>
          </div>
          <div class="prop-actions prop-actions-stack">
            <button class="prop-btn prop-btn--primary" id="inventoryPickBtn">${actionTitle}</button>
          </div>
          ${layoutActionSectionHint}
        `;
        })();

      const layoutHeaderActions = selectedLayout ? `
        <div class="prop-title-row">
          <div class="prop-title">Выкладка</div>
          <div class="prop-title-actions">
            <button class="prop-icon-btn${layoutEditEnabled ? " is-active" : ""}" id="layoutEditBtn" type="button" title="${layoutEditEnabled ? "Заблокировать редактирование" : "Редактировать"}">
              <img src="${layoutEditEnabled ? "/assets/panel-icons/edit-active.svg" : "/assets/panel-icons/edit.svg"}" alt="">
            </button>
            <button class="prop-icon-btn" id="layoutSaveBtn" type="button" title="Сохранить выкладку">
              <img src="/assets/panel-icons/save.svg" alt="">
            </button>
          </div>
        </div>
      ` : `<div class="prop-title">Выкладка</div>`;

      const svgImportedFrags = Array.isArray(state.intarsiaSvgFragments) ? state.intarsiaSvgFragments : [];
      const svgFileName = state.intarsiaSvgFileName || "";
      const hasSvg = svgImportedFrags.length > 0 && svgFileName;
      const intarsiaImportSection = isIntarsiaMode ? renderEditorSection("layout_intarsia_import", "Импорт контуров", `
        <input id="intarsiaSvgFileInputProp" type="file" accept=".svg,image/svg+xml" style="display:none"/>
        ${hasSvg ? `
        <div class="layout-list-card" style="margin:0;">
          <div class="layout-list-text" style="min-width:0;overflow:hidden;">
            <div class="layout-list-title" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${svgFileName.replace(/"/g,'&quot;')}">${svgFileName.replace(/</g,'&lt;')}</div>
          </div>
          <div class="layout-list-actions">
            <button class="layout-list-action-btn" id="intarsiaSvgPickBtnProp" type="button" title="Заменить файл"><span class="material-symbols-outlined" aria-hidden="true">grid_view</span></button>
            <button class="layout-list-action-btn danger" id="intarsiaSvgClearBtnProp" type="button" title="Удалить"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
          </div>
        </div>
        ` : `<div class="prop-actions prop-actions-stack"><button class="prop-btn" id="intarsiaSvgPickBtnProp" type="button">+ Выбрать</button></div>`}
      `, true) : "";

      root.innerHTML = `
        ${layoutHeaderActions}
        ${renderEditorSection("layout_info", "Информация", `
          <div class="prop-row"><div class="prop-label">Название</div><div><input id="layoutNameInput" class="prop-input${!layoutEditEnabled ? " prop-input--locked" : ""}" type="text" placeholder="(Пусто)" ${nameInputReadonly}></div></div>
          <div class="prop-row"><div class="prop-label">Тип</div><div>${typeValue}</div></div>
        `, true)}
        ${intarsiaImportSection}
        ${isIntarsiaMode ? "" : renderEditorSection("layout_inventory", layoutActionSectionTitle, layoutActionSectionBody, true)}
        ${(isFragmentOnlyRegularLayoutSelected || isManualLayoutSelected) ? "" : renderEditorSection("layout_params", "Параметры выкладки", `
          <div class="prop-row"><div class="prop-label">Резерв под припуски, мм</div><div><input id="layoutAllowanceInput" class="prop-input${!layoutEditEnabled ? " prop-input--locked" : ""}" type="number" min="0" max="200" step="0.5" value="${Number(allowanceValue).toFixed(1)}"${!layoutEditEnabled ? " disabled" : ""}></div></div>
        `, true)}
        ${(isFragmentOnlyRegularLayoutSelected && showLongitudinalDebug) ? renderEditorSection("layout_debug", "Диагностика", diagnosticRows, true) : ""}
      `;
      bindSectionToggles(root);

      // Intarsia SVG import buttons in property editor
      const svgPickBtnProp = byId("intarsiaSvgPickBtnProp");
      const svgFileInputProp = byId("intarsiaSvgFileInputProp");
      const svgClearBtnProp = byId("intarsiaSvgClearBtnProp");
      if (svgPickBtnProp && svgFileInputProp && typeof importSvgContours === "function") {
        svgPickBtnProp.onclick = () => svgFileInputProp.click();
        svgFileInputProp.onchange = () => {
          const file = svgFileInputProp.files && svgFileInputProp.files[0];
          if (!file) return;
          state.intarsiaSvgFileName = file.name;
          importSvgContours(file, 1);
          svgFileInputProp.value = "";
        };
      }
      if (svgClearBtnProp && typeof importSvgContours === "function") {
        svgClearBtnProp.onclick = () => {
          state.intarsiaSvgFileName = null;
          importSvgContours(null, 1);
        };
      }


      const layoutEditBtn = byId("layoutEditBtn");
      if (layoutEditBtn && selectedLayout) {
        layoutEditBtn.onclick = () => {
          setLayoutEditEnabled(selectedLayout.id, !layoutEditEnabled);
          renderPropertyEditor();
        };
      }
      const layoutSaveBtn = byId("layoutSaveBtn");
      if (layoutSaveBtn) {
        layoutSaveBtn.disabled = !selectedLayout || typeof saveLayoutEntry !== "function";
        layoutSaveBtn.onclick = async () => {
          if (!selectedLayout || typeof saveLayoutEntry !== "function") return;
          layoutSaveBtn.disabled = true;
          try {
            await saveLayoutEntry(selectedLayout);
            showPropToast(`Выкладка «${selectedLayout.name || "-"}» сохранена.`, false);
          } catch (e) {
            showPropToast("Ошибка сохранения выкладки.", true);
          } finally {
            layoutSaveBtn.disabled = false;
          }
        };
      }
      const furFilterSel = byId("manualFurFilterSelect");
      if (furFilterSel) {
        furFilterSel.value = String(state.manualFurMaterialFilterId || "");
        furFilterSel.onchange = () => {
          state.manualFurMaterialFilterId = furFilterSel.value;
        };
        if (!Array.isArray(state.furMaterialsCatalog) || state.furMaterialsCatalog.length === 0) {
          api("/api/fur-materials", "GET", null, 20000).then((json) => {
            if (json && json.ok && Array.isArray(json.items) && json.items.length > 0) {
              state.furMaterialsCatalog = json.items
                .map((item) => ({ id: String(item && item.id || "").trim(), name: String(item && item.name || "").trim() }))
                .filter((m) => m.id);
              const sel = byId("manualFurFilterSelect");
              if (sel) {
                sel.innerHTML = `<option value="">Неважно</option>` +
                  state.furMaterialsCatalog.map((m) =>
                    `<option value="${String(m.id).replace(/"/g, "&quot;")}">${String(m.name || m.id).replace(/</g, "&lt;")}</option>`
                  ).join("");
                sel.value = String(state.manualFurMaterialFilterId || "");
              }
            }
          }).catch(() => {});
        }
      }
      const btn = byId("inventoryPickBtn");
      if (btn) {
        const hasAnyZone = Array.isArray(state.zones) && state.zones.length > 0;
        btn.disabled = !hasAnyZone || lockManualInventoryParams || !layoutEditEnabled;
        btn.onclick = () => openInventoryStep1(currentLayoutMode);
      }
      const layoutNameInput = byId("layoutNameInput");
      if (layoutNameInput) {
        layoutNameInput.value = selectedLayoutName;
        layoutNameInput.disabled = !layoutEditEnabled;
        layoutNameInput.readOnly = !layoutEditEnabled;
        if (selectedLayout) {
          layoutNameInput.oninput = () => {
            if (!layoutEditEnabled) return;
            selectedLayout.name = String(layoutNameInput.value || "");
            if (typeof markLayoutDirty === "function") markLayoutDirty(selectedLayout, true);
            renderDetailZoneTree();
          };
        }
      }
      const layoutAllowanceInput = byId("layoutAllowanceInput");
      if (layoutAllowanceInput) {
        const allowanceLocked = isManualLayoutSelected ? !layoutEditEnabled : (lockManualInventoryParams || !layoutEditEnabled);
        layoutAllowanceInput.disabled = allowanceLocked;
        layoutAllowanceInput.readOnly = allowanceLocked;
        layoutAllowanceInput.oninput = () => {
          if (allowanceLocked) return;
          const v = parseLocaleNumber(layoutAllowanceInput.value, null);
          if (!Number.isFinite(v)) return;
          state.layoutRun.allowanceMm = Math.max(0, Math.min(200, v));
          if (typeof markLayoutDirty === "function") markLayoutDirty(selectedLayout, true);
          const invAllowance = byId("invAllowanceMm");
          if (invAllowance) invAllowance.value = Number(state.layoutRun.allowanceMm).toFixed(1);
        };
        layoutAllowanceInput.onblur = () => {
          if (allowanceLocked) return;
          const v = parseLocaleNumber(layoutAllowanceInput.value, null);
          const n = Number.isFinite(v) ? Math.max(0, Math.min(200, v)) : 12;
          state.layoutRun.allowanceMm = n;
          layoutAllowanceInput.value = n.toFixed(1);
          if (typeof markLayoutDirty === "function") markLayoutDirty(selectedLayout, true);
          const invAllowance = byId("invAllowanceMm");
          if (invAllowance) invAllowance.value = n.toFixed(1);
        };
      }
      const bindMirrorNumberInput = (localId, sharedId, min, max, fallback, decimals = 0) => {
        const localEl = byId(localId);
        const sharedEl = byId(sharedId);
        if (!localEl || !sharedEl) return;
        localEl.disabled = !layoutEditEnabled;
        localEl.readOnly = !layoutEditEnabled;
        const scheduleRegularPreview = () => {
          if (!isFragmentOnlyRegularLayoutSelected) return;
          if (typeof markLayoutDirty === "function") markLayoutDirty(selectedLayout, true);
          if (regularLayoutPreviewTimer) clearTimeout(regularLayoutPreviewTimer);
          regularLayoutPreviewTimer = setTimeout(() => {
            regularLayoutPreviewTimer = null;
            openInventoryStep1(currentLayoutMode);
          }, 180);
        };
        const normalize = () => {
          if (!layoutEditEnabled) return;
          const raw = parseLocaleNumber(localEl.value, null);
          const next = Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : fallback;
          sharedEl.value = decimals > 0 ? Number(next).toFixed(decimals) : String(Math.round(next));
          localEl.value = decimals > 0 ? Number(next).toFixed(decimals) : String(Math.round(next));
          scheduleRegularPreview();
        };
        localEl.oninput = () => {
          if (!layoutEditEnabled) return;
          const raw = parseLocaleNumber(localEl.value, null);
          if (!Number.isFinite(raw)) return;
          const next = Math.max(min, Math.min(max, raw));
          sharedEl.value = decimals > 0 ? Number(next).toFixed(decimals) : String(Math.round(next));
          scheduleRegularPreview();
        };
        localEl.onblur = normalize;
      };
      bindMirrorNumberInput("layoutRowsInput", "fillRows", 1, 20, 5, 0);
      bindMirrorNumberInput("layoutColsInput", "fillCols", 1, 20, 5, 0);
      bindMirrorNumberInput("layoutShiftPercentInput", "fillShiftPercent", -100, 100, 50, 0);
      bindMirrorNumberInput("layoutAxisCountInput", "fillAxisCount", 0, 6, 1, 0);
      bindMirrorNumberInput("layoutBandStepInput", "fillBandStep", 10, 5000, 120, 0);
      bindMirrorNumberInput("layoutAngleDegInput", "fillAngleDeg", -89, 89, 45, 0);
      bindMirrorNumberInput("layoutRingCountInput", "fillRingCount", 1, 20, 4, 0);
      bindMirrorNumberInput("layoutSectorCountInput", "fillSectorCount", 1, 36, 8, 0);
      bindMirrorNumberInput("layoutSectorRotationInput", "fillSectorRotationDeg", -360, 360, 0, 0);
      bindMirrorNumberInput("layoutInnerRadiusInput", "fillInnerRadiusMm", 0, 5000, 0, 0);
      bindMirrorNumberInput("layoutCenterXInput", "fillCenterX", -100000, 100000, 0, 0);
      bindMirrorNumberInput("layoutCenterYInput", "fillCenterY", -100000, 100000, 0, 0);
      bindMirrorNumberInput("layoutGapXInput", "fillGapX", 0, 1000, 0, 0);
      bindMirrorNumberInput("layoutGapYInput", "fillGapY", 0, 1000, 0, 0);
      bindMirrorNumberInput("layoutCornerRadiusInput", "fillCornerRadius", 0, 1000, 0, 0);
      const layoutCenterModeInput = byId("layoutCenterModeInput");
      const fillCenterMode = byId("fillCenterMode");
      const layoutCenterXInput = byId("layoutCenterXInput");
      const layoutCenterYInput = byId("layoutCenterYInput");
      const syncRadialCenterInputs = () => {
        const manual = !!(layoutCenterModeInput && String(layoutCenterModeInput.value || "auto") === "manual");
        if (layoutCenterXInput) {
          layoutCenterXInput.disabled = !layoutEditEnabled || !manual;
          layoutCenterXInput.readOnly = !layoutEditEnabled || !manual;
        }
        if (layoutCenterYInput) {
          layoutCenterYInput.disabled = !layoutEditEnabled || !manual;
          layoutCenterYInput.readOnly = !layoutEditEnabled || !manual;
        }
      };
      if (layoutCenterModeInput && fillCenterMode) {
        layoutCenterModeInput.disabled = !layoutEditEnabled;
        layoutCenterModeInput.onchange = () => {
          if (!layoutEditEnabled) return;
          fillCenterMode.value = String(layoutCenterModeInput.value || "auto");
          if (String(fillCenterMode.value || "auto") === "manual" && typeof getRadialAutoCenter === "function") {
            const autoCenter = getRadialAutoCenter();
            if (autoCenter && Number.isFinite(Number(autoCenter.x)) && Number.isFinite(Number(autoCenter.y))) {
              const nextX = Math.round(Number(autoCenter.x) * 10) / 10;
              const nextY = Math.round(Number(autoCenter.y) * 10) / 10;
              const fillCenterX = byId("fillCenterX");
              const fillCenterY = byId("fillCenterY");
              if (fillCenterX) fillCenterX.value = String(nextX);
              if (fillCenterY) fillCenterY.value = String(nextY);
              if (layoutCenterXInput) layoutCenterXInput.value = String(nextX);
              if (layoutCenterYInput) layoutCenterYInput.value = String(nextY);
            }
          }
          syncRadialCenterInputs();
          if (typeof markLayoutDirty === "function") markLayoutDirty(selectedLayout, true);
          if (regularLayoutPreviewTimer) clearTimeout(regularLayoutPreviewTimer);
          regularLayoutPreviewTimer = setTimeout(() => {
            regularLayoutPreviewTimer = null;
            openInventoryStep1(currentLayoutMode);
          }, 180);
        };
        syncRadialCenterInputs();
      }
      renderManualTrayIntoRoot();
    }

    return { renderPropertyEditor };
  }

  root.FurLabPropertyEditorView = { createPropertyEditorView };
})(typeof window !== "undefined" ? window : globalThis);
