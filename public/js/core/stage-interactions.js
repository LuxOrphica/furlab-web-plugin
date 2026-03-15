// Extracted from app.js: stage pointer/wheel interactions and drag lifecycle.
(function (global) {
  function createStageInteractions(options) {
    const opts = options && typeof options === "object" ? options : {};
    const stage = opts.stage;
    const state = opts.state;
    if (!stage || !state) {
      return { attach: () => {} };
    }

    const screenToWorld = typeof opts.screenToWorld === "function" ? opts.screenToWorld : () => null;
    const renderScene = typeof opts.renderScene === "function" ? opts.renderScene : () => {};
    const isManualInventoryMode = typeof opts.isManualInventoryMode === "function" ? opts.isManualInventoryMode : () => false;
    const centroid = typeof opts.centroid === "function" ? opts.centroid : () => ({ x: 0, y: 0 });
    const rotatePoints = typeof opts.rotatePoints === "function" ? opts.rotatePoints : (points) => points;
    const updateManualActivePiecePoints = typeof opts.updateManualActivePiecePoints === "function" ? opts.updateManualActivePiecePoints : () => {};
    const renderInventoryManualPanel = typeof opts.renderInventoryManualPanel === "function" ? opts.renderInventoryManualPanel : () => {};
    const setWorkspaceCursor = typeof opts.setWorkspaceCursor === "function" ? opts.setWorkspaceCursor : () => {};
    const findManualPlacementAt = typeof opts.findManualPlacementAt === "function" ? opts.findManualPlacementAt : () => null;
    const pointInPolygon = typeof opts.pointInPolygon === "function" ? opts.pointInPolygon : () => false;
    const findLayoutFragmentAt = typeof opts.findLayoutFragmentAt === "function" ? opts.findLayoutFragmentAt : () => null;
    const findZoneAt = typeof opts.findZoneAt === "function" ? opts.findZoneAt : () => null;
    const findDetailAt = typeof opts.findDetailAt === "function" ? opts.findDetailAt : () => null;
    const findVertexAt = typeof opts.findVertexAt === "function" ? opts.findVertexAt : () => null;
    const pushCommand = typeof opts.pushCommand === "function" ? opts.pushCommand : () => {};
    const byId = typeof opts.byId === "function" ? opts.byId : () => null;
    const getCanvasHeight = typeof opts.getCanvasHeight === "function" ? opts.getCanvasHeight : () => 0;
    const recomputeInventoryManualVisibility = typeof opts.recomputeInventoryManualVisibility === "function"
      ? opts.recomputeInventoryManualVisibility
      : null;

    function mapContour(points, fn) {
      if (!Array.isArray(points) || points.length < 3) return points;
      const out = points
        .map((q) => ({ x: Number(q && q.x), y: Number(q && q.y) }))
        .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
        .map(fn);
      return out.length >= 3 ? out : points;
    }
    function mapContours(list, fn) {
      if (!Array.isArray(list)) return list;
      return list.map((poly) => mapContour(poly, fn));
    }
    function cloneContour(points) {
      if (!Array.isArray(points)) return points;
      return points.map((q) => ({ x: Number(q && q.x), y: Number(q && q.y) }));
    }
    function cloneContours(list) {
      if (!Array.isArray(list)) return list;
      return list.map((poly) => cloneContour(poly));
    }
    function snapshotPlacementGeometry(pl) {
      if (!pl || typeof pl !== "object") return null;
      return {
        alignedContour: cloneContour(pl.alignedContour),
        inZoneContour: cloneContour(pl.inZoneContour),
        alignedCoreContour: cloneContour(pl.alignedCoreContour),
        inZoneCoreContour: cloneContour(pl.inZoneCoreContour),
        usedVisibleContour: cloneContour(pl.usedVisibleContour),
        alignedCoreContours: cloneContours(pl.alignedCoreContours),
        inZoneContours: cloneContours(pl.inZoneContours),
        inZoneCoreContours: cloneContours(pl.inZoneCoreContours),
        usedVisibleContours: cloneContours(pl.usedVisibleContours)
      };
    }
    function restorePlacementGeometry(pl, snap) {
      if (!pl || !snap) return;
      pl.alignedContour = cloneContour(snap.alignedContour);
      pl.inZoneContour = cloneContour(snap.inZoneContour);
      pl.alignedCoreContour = cloneContour(snap.alignedCoreContour);
      pl.inZoneCoreContour = cloneContour(snap.inZoneCoreContour);
      pl.usedVisibleContour = cloneContour(snap.usedVisibleContour);
      pl.alignedCoreContours = cloneContours(snap.alignedCoreContours);
      pl.inZoneContours = cloneContours(snap.inZoneContours);
      pl.inZoneCoreContours = cloneContours(snap.inZoneCoreContours);
      pl.usedVisibleContours = cloneContours(snap.usedVisibleContours);
    }
    function translatePlacementGeometry(pl, dx, dy) {
      const shift = (q) => ({ x: q.x + dx, y: q.y + dy });
      pl.alignedContour = mapContour(pl.alignedContour, shift);
      pl.inZoneContour = mapContour(pl.inZoneContour, shift);
      pl.alignedCoreContour = mapContour(pl.alignedCoreContour, shift);
      pl.inZoneCoreContour = mapContour(pl.inZoneCoreContour, shift);
      pl.usedVisibleContour = mapContour(pl.usedVisibleContour, shift);
      pl.alignedCoreContours = mapContours(pl.alignedCoreContours, shift);
      pl.inZoneContours = mapContours(pl.inZoneContours, shift);
      pl.inZoneCoreContours = mapContours(pl.inZoneCoreContours, shift);
      pl.usedVisibleContours = mapContours(pl.usedVisibleContours, shift);
    }
    function rotatePlacementGeometry(pl, angleRad, center) {
      const rotOne = (q) => {
        const r = rotatePoints([{ x: q.x, y: q.y }], angleRad, center);
        return (Array.isArray(r) && r[0]) ? r[0] : q;
      };
      pl.alignedContour = mapContour(pl.alignedContour, rotOne);
      pl.inZoneContour = mapContour(pl.inZoneContour, rotOne);
      pl.alignedCoreContour = mapContour(pl.alignedCoreContour, rotOne);
      pl.inZoneCoreContour = mapContour(pl.inZoneCoreContour, rotOne);
      pl.usedVisibleContour = mapContour(pl.usedVisibleContour, rotOne);
      pl.alignedCoreContours = mapContours(pl.alignedCoreContours, rotOne);
      pl.inZoneContours = mapContours(pl.inZoneContours, rotOne);
      pl.inZoneCoreContours = mapContours(pl.inZoneCoreContours, rotOne);
      pl.usedVisibleContours = mapContours(pl.usedVisibleContours, rotOne);
    }

    function attach() {
      stage.on("contextmenu", (e) => {
        e.evt.preventDefault();
      });

      stage.on("wheel", (e) => {
        e.evt.preventDefault();
        if (isManualInventoryMode()) {
          const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
          const selIdx = Number(manual && manual.selectedPlacementIndex);
          const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
          const selPlacement = Number.isFinite(selIdx) && selIdx >= 0 && selIdx < placements.length ? placements[selIdx] : null;
          if (selPlacement && Array.isArray(selPlacement.alignedContour) && selPlacement.alignedContour.length >= 3 && (e.evt.shiftKey || e.evt.altKey)) {
            const stepDeg = e.evt.deltaY < 0 ? 5 : -5;
            const center = centroid(selPlacement.alignedContour);
            rotatePlacementGeometry(selPlacement, (stepDeg * Math.PI) / 180, center);
            if (manual) manual.statusNote = "кусок повернут";
            renderInventoryManualPanel();
            renderScene();
            return;
          }
          const ap = manual && manual.activePiece ? manual.activePiece : null;
          if (ap && Array.isArray(ap.points) && ap.points.length >= 3 && (e.evt.shiftKey || e.evt.altKey)) {
            const stepDeg = e.evt.deltaY < 0 ? 5 : -5;
            const center = centroid(ap.points);
            const rotated = rotatePoints(ap.points, (stepDeg * Math.PI) / 180, center);
            updateManualActivePiecePoints(rotated);
            renderScene();
            return;
          }
        }
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const factor = e.evt.deltaY < 0 ? 1.1 : 0.9;
        const wb = screenToWorld(pointer.x, pointer.y);
        state.viewport.scale = Math.max(0.02, Math.min(500, state.viewport.scale * factor));
        state.viewport.offsetX = pointer.x - wb.x * state.viewport.scale;
        state.viewport.offsetY = (getCanvasHeight() - pointer.y) - wb.y * state.viewport.scale;
        renderScene();
      });

      stage.on("mousedown", (e) => {
        const p = stage.getPointerPosition();
        if (!p) return;
        const world = screenToWorld(p.x, p.y);
        state.drag.isDown = true;
        state.drag.startX = p.x;
        state.drag.startY = p.y;
        state.drag.startOffsetX = state.viewport.offsetX;
        state.drag.startOffsetY = state.viewport.offsetY;

        if (isManualInventoryMode() && e.evt.button === 0 && state.tool !== "pan" && !state.keys.space) {
          const hitPl = findManualPlacementAt(world);
          if (hitPl && Number.isFinite(Number(hitPl.placementIndex))) {
            state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
            state.layoutRun.manual.selectedPlacementIndex = Number(hitPl.placementIndex);
            state.layoutRun.manual.statusNote = "кусок выбран";
            state.drag.mode = "manual-placement-move";
            state.drag.manualPointerStart = world;
            state.drag.manualPlacementIndex = Number(hitPl.placementIndex);
            state.drag.manualPlacementStart = Array.isArray(hitPl.placement.alignedContour) ? hitPl.placement.alignedContour.map((q) => ({ x: q.x, y: q.y })) : null;
            state.drag.manualPlacementGeomStart = snapshotPlacementGeometry(hitPl.placement);
            renderInventoryManualPanel();
            renderScene();
            return;
          }
          const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
          const ap = manual && manual.activePiece ? manual.activePiece : null;
          if (ap && Array.isArray(ap.points) && ap.points.length >= 3 && pointInPolygon(world, ap.points)) {
            state.drag.mode = "manual-piece-move";
            state.drag.manualPointerStart = world;
            state.drag.manualPieceStart = ap.points.map((q) => ({ x: q.x, y: q.y }));
            return;
          }
        }

        if (state.tool === "pan" || state.keys.space || e.evt.button === 1 || e.evt.button === 2) {
          state.drag.mode = "pan";
          setWorkspaceCursor("grabbing");
          return;
        }
        if (e.evt.button !== 0) return;
        if (state.tool === "draw-zone") {
          state.draftZone.push(world);
          renderScene();
          return;
        }
        if (state.tool === "select") {
          const fragHit = findLayoutFragmentAt(world);
          if (fragHit) {
            state.selectedZoneId = fragHit.zoneId;
            state.selectedFragmentId = fragHit.fragmentId;
            const z = state.zones.find((x) => Number(x.id) === Number(fragHit.zoneId));
            if (z && Number(z.detailId || 0) > 0) state.selectedDetailId = Number(z.detailId);
            renderScene();
            return;
          }
          const hit = findZoneAt(world);
          state.selectedZoneId = hit ? hit.id : null;
          state.selectedFragmentId = null;
          if (hit && Number(hit.detailId || 0) > 0) state.selectedDetailId = Number(hit.detailId);
          const detailHit = findDetailAt(world, 10);
          state.selectedDetailId = detailHit ? detailHit.id : state.selectedDetailId;
          renderScene();
          return;
        }
        if (state.tool === "edit-vertex") {
          const hv = findVertexAt(world);
          if (hv) {
            state.drag.mode = "move-vertex";
            state.drag.movingZoneId = hv.zone.id;
            state.drag.movingVertexIndex = hv.vertexIndex;
            state.drag.movingOldPoint = { ...hv.zone.points[hv.vertexIndex] };
            return;
          }
          const hz = findZoneAt(world);
          state.selectedZoneId = hz ? hz.id : null;
          state.selectedFragmentId = null;
          if (hz && Number(hz.detailId || 0) > 0) state.selectedDetailId = Number(hz.detailId);
          renderScene();
        }
      });

      stage.on("mousemove", () => {
        if (!state.drag.isDown) return;
        const p = stage.getPointerPosition();
        if (!p) return;
        if (state.drag.mode === "pan") {
          const dx = p.x - state.drag.startX;
          const dy = p.y - state.drag.startY;
          state.viewport.offsetX = state.drag.startOffsetX + dx;
          state.viewport.offsetY = state.drag.startOffsetY - dy;
          renderScene();
          return;
        }
        if (state.drag.mode === "move-vertex") {
          const z = state.zones.find((x) => x.id === state.drag.movingZoneId);
          if (!z) return;
          z.points[state.drag.movingVertexIndex] = screenToWorld(p.x, p.y);
          renderScene();
          return;
        }
        if (state.drag.mode === "manual-piece-move") {
          const cur = screenToWorld(p.x, p.y);
          const from = state.drag.manualPointerStart;
          const startPts = Array.isArray(state.drag.manualPieceStart) ? state.drag.manualPieceStart : null;
          if (!from || !startPts || startPts.length < 3) return;
          const dx = cur.x - from.x;
          const dy = cur.y - from.y;
          const moved = startPts.map((q) => ({ x: q.x + dx, y: q.y + dy }));
          updateManualActivePiecePoints(moved);
          renderScene();
          return;
        }
        if (state.drag.mode === "manual-placement-move") {
          const cur = screenToWorld(p.x, p.y);
          const from = state.drag.manualPointerStart;
          const startPts = Array.isArray(state.drag.manualPlacementStart) ? state.drag.manualPlacementStart : null;
          const idx = Number(state.drag.manualPlacementIndex);
          const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
          const pl = Number.isFinite(idx) && idx >= 0 && idx < placements.length ? placements[idx] : null;
          if (!from || !startPts || startPts.length < 3 || !pl) return;
          const dx = cur.x - from.x;
          const dy = cur.y - from.y;
          const snap = state.drag.manualPlacementGeomStart || null;
          if (snap) restorePlacementGeometry(pl, snap);
          translatePlacementGeometry(pl, dx, dy);
          renderScene();
        }
      });

      stage.on("mouseup", () => {
        if (state.drag.mode === "manual-placement-move") {
          const idx = Number(state.drag.manualPlacementIndex);
          if (state.layoutRun && state.layoutRun.manual) state.layoutRun.manual.selectedPlacementIndex = Number.isFinite(idx) ? idx : -1;
          if (state.layoutRun && state.layoutRun.manual) state.layoutRun.manual.statusNote = "кусок перемещен";
          if (typeof recomputeInventoryManualVisibility === "function") {
            void recomputeInventoryManualVisibility();
          }
          renderInventoryManualPanel();
        }
        if (state.drag.mode === "move-vertex") {
          const z = state.zones.find((x) => x.id === state.drag.movingZoneId);
          if (z) {
            const idx = state.drag.movingVertexIndex;
            const to = { ...z.points[idx] };
            const from = state.drag.movingOldPoint;
            if (from && (from.x !== to.x || from.y !== to.y)) pushCommand({ type: "move-vertex", zoneId: z.id, vertexIndex: idx, from, to });
          }
        }
        state.drag.isDown = false;
        state.drag.mode = "";
        state.drag.movingZoneId = null;
        state.drag.movingVertexIndex = null;
        state.drag.movingOldPoint = null;
        state.drag.manualPointerStart = null;
        state.drag.manualPieceStart = null;
        state.drag.manualPlacementIndex = null;
        state.drag.manualPlacementStart = null;
        state.drag.manualPlacementGeomStart = null;
        if (state.keys.space) setWorkspaceCursor("grab");
        else setWorkspaceCursor("");
      });

      stage.on("dblclick", () => {
        if (state.tool !== "draw-zone") return;
        if (state.draftZone.length < 3) return;
        const btn = byId("finishZoneBtn");
        if (btn && typeof btn.click === "function") btn.click();
      });
    }

    return { attach };
  }

  global.FurLabStageInteractions = Object.assign({}, global.FurLabStageInteractions || {}, {
    createStageInteractions
  });
})(window);
