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
    const isManualInventoryMode = deps && deps.isManualInventoryMode;
    const api = deps && deps.api;
    const closeReplaceCandidateModal = deps && deps.closeReplaceCandidateModal;
    const openReplaceCandidateModal = deps && deps.openReplaceCandidateModal;
    const renderPlacementRows = deps && deps.renderPlacementRows;
    const renderDetailZoneTree = deps && deps.renderDetailZoneTree;
    const renderScene = deps && deps.renderScene;
    const openInventoryStep1 = deps && deps.openInventoryStep1;
    const renderManualTrayIntoRoot = deps && deps.renderManualTrayIntoRoot;
    function parseLocaleNumber(v, fallback = null) {
      if (v === null || v === undefined) return fallback;
      if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
      const s = String(v).trim().replace(",", ".");
      if (!s) return fallback;
      const n = Number(s);
      return Number.isFinite(n) ? n : fallback;
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
      const actionTitle = state.layoutMode === "inventory_manual"
        ? "Загрузить кандидаты из БД"
        : (state.layoutMode === "inventory_split_return"
          ? "Подобрать (Split & Return)"
          : (state.layoutMode === "inventory"
          ? "Подобрать из библиотеки"
          : (state.layoutMode === "intarsia" ? "Сгенерировать интарсию" : "Заполнить остаток")));
      const selectedLayout = Array.isArray(state.layouts)
        ? (state.layouts.find((x) => Number(x.id) === Number(state.selectedLayoutId || 0)) || null)
        : null;
      const selectedLayoutName = selectedLayout ? String(selectedLayout.name || "") : "";
      const selectedLayoutModeTitle = getLayoutModeTitle(selectedLayout ? selectedLayout.mode : state.layoutMode);
      const zoneAreaValue = zone ? polygonArea(zone.points || []).toFixed(2) : "-";
      const zonePerimeterValue = zone ? polylineLength(zone.points || [], true).toFixed(2) : "-";

      if (state.uiPanel === "zones") {
        if (zone) {
          const zoneNapDeg = typeof getZoneNapDirectionDeg === "function"
            ? Number(getZoneNapDirectionDeg(zone))
            : Number(DEFAULT_NAP_DIRECTION_DEG || 90);
          root.innerHTML = `
            <div style="font-weight:600; margin-bottom:6px;">Зона</div>
            <div class="prop-row"><div class="prop-label">Название</div><div>${String(zone.name || `Зона ${zone.id}`)}</div></div>
            <div class="prop-row"><div class="prop-label">Detail ID</div><div>${detail ? detail.id : "-"}</div></div>
            <div class="prop-row"><div class="prop-label">Zone ID</div><div>${zone.id}</div></div>
            <div class="prop-row"><div class="prop-label">Направление ворса, °</div><div><input id="zoneNapDirectionInput" type="number" min="0" max="359.9" step="1" style="width:100%; min-width:0; box-sizing:border-box; padding:4px 6px;" value="${zoneNapDeg.toFixed(1)}"></div></div>
            <div class="prop-row"><div class="prop-label">Площадь зоны</div><div>${zoneAreaValue}</div></div>
            <div class="prop-row"><div class="prop-label">Периметр зоны</div><div>${zonePerimeterValue}</div></div>
          `;
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
            <div style="font-weight:600; margin-bottom:6px;">Деталь</div>
            <div class="prop-row"><div class="prop-label">Detail ID</div><div>${detail.id}</div></div>
            <div class="tree-empty" style="margin-top:6px;">Выберите зону, чтобы увидеть её параметры.</div>
          `;
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
        root.innerHTML = `
          <div style="font-weight:600; margin-bottom:6px;">Фрагмент</div>
          <div style="margin:8px 0 6px; font-weight:600;">Информация</div>
          <div class="prop-row"><div class="prop-label">ID фрагмента</div><div>${selectedFragId}</div></div>
          <div class="prop-row"><div class="prop-label">Площадь, мм²</div><div>${fragArea.toFixed(1)}</div></div>
          <div class="prop-row"><div class="prop-label">Периметр, мм</div><div>${fragPerim.toFixed(1)}</div></div>
          <div style="margin:8px 0 6px; font-weight:600;">Инвентарь</div>
          <div class="prop-row"><div class="prop-label">Инвентарный номер</div><div>${selectedPlacement && selectedPlacement.inventoryTag ? selectedPlacement.inventoryTag : "-"}</div></div>
          <div class="prop-row"><div class="prop-label">Статус</div><div>${selectedPlacement && selectedPlacement.status ? selectedPlacement.status : "-"}</div></div>
          <div style="display:flex; gap:8px; margin:6px 0;">
            <button id="fragReplaceBtn" ${selectedPlacement ? "" : "disabled"}>Заменить</button>
            <button id="fragClearBtn" ${selectedPlacement ? "" : "disabled"}>Снять подбор</button>
          </div>
          <div style="margin:8px 0 6px; font-weight:600;">Параметры</div>
          <div class="prop-row"><div class="prop-label">Резерв под припуск, мм</div><div>${allowance.toFixed(1)}</div></div>
          <div class="prop-row"><div class="prop-label">Направление ворса</div><div>${nap}</div></div>
          <div class="prop-row"><div class="prop-label">Цель ворса</div><div>${napTargetText}</div></div>
          <div class="prop-row"><div class="prop-label">Допуск ворса</div><div>${napTolText}</div></div>
          <div class="prop-row"><div class="prop-label">Δ к цели</div><div>${napDeltaToTargetText}</div></div>
          <div class="prop-row"><div class="prop-label">Проверка ворса</div><div style="font-weight:600; color:${napCheckOk === null ? "#666" : (napCheckOk ? "#0a7d2e" : "#b42318")};">${napCheckText}</div></div>
          <div style="margin:8px 0 6px; font-weight:600;">Качество подбора</div>
          <div class="prop-row"><div class="prop-label">Fit score</div><div>${fitScore}</div></div>
          <div class="prop-row"><div class="prop-label">Совпадение площади</div><div>${fitAreaRatio}</div></div>
          <div class="prop-row"><div class="prop-label">Overlap</div><div>${fitOverlap}</div></div>
          <div class="prop-row"><div class="prop-label">Внутри фрагмента</div><div>${fitInside}</div></div>
          <div class="prop-row"><div class="prop-label">Chamfer</div><div>${fitChamfer}</div></div>
          <div class="prop-row"><div class="prop-label">Δ ворса</div><div>${napDelta}</div></div>
          <div class="prop-row"><div class="prop-label">Поворот совмещения</div><div>${alignRot}</div></div>
        `;
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
      const nameInputReadonly = selectedLayout ? "" : "readonly";
      const typeValue = selectedLayout ? selectedLayoutModeTitle : "-";

      root.innerHTML = `
        <div style="font-weight:600; margin-bottom:6px;">Выкладка</div>
        <div class="prop-row"><div class="prop-label">Название</div><div><input id="layoutNameInput" type="text" placeholder="(Пусто)" style="width:100%; min-width:0; box-sizing:border-box; padding:4px 6px; background:#fff; opacity:1;" ${nameInputReadonly}></div></div>
        <div class="prop-row"><div class="prop-label">Тип</div><div>${typeValue}</div></div>
        <div style="margin:8px 0 6px; font-weight:600;">Инвентарь</div>
        <div><button id="inventoryPickBtn" style="width:100%;">${actionTitle}</button></div>
        <div class="tree-empty" style="margin-top:6px;">${isManualInventoryMode() ? "Ручной подбор" : "Настройки подбора, preview и применение"}</div>
        <div style="margin:8px 0 6px; font-weight:600;">Параметры</div>
        <div class="prop-row"><div class="prop-label">Резерв припуска, мм</div><div><input id="layoutAllowanceInput" type="number" min="0" max="200" step="0.5" style="width:100%; min-width:0; box-sizing:border-box; padding:4px 6px;" value="${Number(allowanceValue).toFixed(1)}"></div></div>
      `;
      const btn = byId("inventoryPickBtn");
      if (btn) {
        const hasAnyZone = Array.isArray(state.zones) && state.zones.length > 0;
        btn.disabled = !hasAnyZone;
        btn.onclick = () => openInventoryStep1();
      }
      const layoutNameInput = byId("layoutNameInput");
      if (layoutNameInput) {
        layoutNameInput.value = selectedLayoutName;
        if (selectedLayout) {
          layoutNameInput.oninput = () => {
            selectedLayout.name = String(layoutNameInput.value || "");
            renderDetailZoneTree();
          };
        }
      }
      const layoutAllowanceInput = byId("layoutAllowanceInput");
      if (layoutAllowanceInput) {
        layoutAllowanceInput.oninput = () => {
          const v = parseLocaleNumber(layoutAllowanceInput.value, null);
          if (!Number.isFinite(v)) return;
          state.layoutRun.allowanceMm = Math.max(0, Math.min(200, v));
          const invAllowance = byId("invAllowanceMm");
          if (invAllowance) invAllowance.value = Number(state.layoutRun.allowanceMm).toFixed(1);
        };
        layoutAllowanceInput.onblur = () => {
          const v = parseLocaleNumber(layoutAllowanceInput.value, null);
          const n = Number.isFinite(v) ? Math.max(0, Math.min(200, v)) : 12;
          state.layoutRun.allowanceMm = n;
          layoutAllowanceInput.value = n.toFixed(1);
          const invAllowance = byId("invAllowanceMm");
          if (invAllowance) invAllowance.value = n.toFixed(1);
        };
      }
      renderManualTrayIntoRoot();
    }

    return { renderPropertyEditor };
  }

  root.FurLabPropertyEditorView = { createPropertyEditorView };
})(typeof window !== "undefined" ? window : globalThis);
