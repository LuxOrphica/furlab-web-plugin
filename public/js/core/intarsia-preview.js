(function registerFurLabIntarsiaPreview(globalObj) {
  const root = globalObj || (typeof window !== "undefined" ? window : globalThis);

  function createIntarsiaPreview(deps) {
    const state = deps && deps.state;
    const byId = deps && deps.byId;
    const generateFragmentsForZone = deps && deps.generateFragmentsForZone;
    const refreshIntarsiaDerivedFragmentLimits = deps && deps.refreshIntarsiaDerivedFragmentLimits;
    const renderScene = deps && deps.renderScene;

    function previewIntarsiaFragmentsDraft() {
      if (!state || state.layoutMode !== "intarsia") return;
      const zone = state.zones.find((z) => Number(z && z.id) === Number(state.selectedZoneId));
      if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) return;
      const rows = Math.max(2, Number(byId("fillRows").value || 5));
      const cols = Math.max(2, Number(byId("fillCols").value || 5));
      const gapX = Math.max(0, Number(byId("fillGapX").value || 0));
      const gapY = Math.max(0, Number(byId("fillGapY").value || 0));
      const cornerRadius = Math.max(0, Number(byId("fillCornerRadius").value || 0));
      const splitRes = generateFragmentsForZone(zone.points || [], {
        fillType: "regular",
        rows,
        cols,
        gapX,
        gapY,
        cornerRadius,
        variability: 0
      });
      const frags = Array.isArray(splitRes && splitRes.fragments) ? splitRes.fragments : [];
      state.layoutRun.active = true;
      state.layoutRun.status = "preview";
      state.layoutRun.fillType = "regular";
      state.layoutRun.strategy = "intarsia";
      state.layoutRun.selectedZoneId = zone.id;
      state.layoutRun.fragments = frags.map((f, i) => ({
        id: Number(f && f.id) || (i + 1),
        points: Array.isArray(f && f.points) ? f.points : []
      }));
      state.layoutRun.placements = [];
      state.layoutRun.previewLayers = { pieceIntersections: [], visibleArea: [], coverageHoles: [] };
      state.layoutRun.stats = splitRes && splitRes.stats ? splitRes.stats : { violations: 0, intersections: 0, uncovered: 0 };
      byId("workspaceInfo").textContent = `Интарсия: фрагментов ${state.layoutRun.fragments.length} (сетка ${rows}x${cols}, зазоры ${gapX}/${gapY} мм, скругл. ${cornerRadius} мм)`;
      refreshIntarsiaDerivedFragmentLimits();
      renderScene();
    }

    return { previewIntarsiaFragmentsDraft };
  }

  root.FurLabIntarsiaPreview = { createIntarsiaPreview };
})(typeof window !== "undefined" ? window : globalThis);
