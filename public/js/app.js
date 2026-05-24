// In FurLab, default grain/nap direction in 2D is vertical down.
    const DEFAULT_NAP_DIRECTION_DEG = 90;
    const INVENTORY_OPTIMIZATION_DEFAULT = "sew_quality_economy";
    const INVENTORY_OPTIMIZATION_PROFILE = {
      key: "sew_quality_economy",
      label: "Sew quality / Economy",
      description: "Goals: full coverage, fewer pieces and seams, higher utilization.",
      options: {
        strictCoverage: true,
        strictCoverageHard: true,
        coverageTarget: 0.99999,
        coverageEps: 0.0005,
        solverMode: "phasedV1",
        maxSolveMs: 45000,
        hardMaxSolveMs: 90000,
        maxPieces: 160,
        maxPointsPerCandidate: 120,
        minGainAreaMm2: 60,
        objectiveMode: "oneGood",
        objectiveMinEfficiency: 0.82,
        objectivePiecePenalty: 0.18,
        objectiveFragmentPenalty: 0.28,
        minEfficiencyBase: 0.20,
        phaseAEndCoverage: 0.22,
        phaseAInsideMin: 0.90,
        phaseAMaxOverlap: 0.08,
        phaseBEfficiencyMin: 0.42,
        phaseAMinPieces: 1,
        phaseAMinGainMm2: 4000,
        phaseAMinGainShare: 0.03,
        minGainVisibleMm2: 10000,
        minSpanMm: 100,
        enforceMinGainByArea: true,
        coverageFirst: false,
        enforceTimeBudget: true,
        maxRepairAttempts: 4,
        repairWindow: 28,
        tailCoverageStart: 0.93,
        tailResidualRatio: 0.03,
        tailResidualLooseRatio: 0.015,
        tailMinEfficiency: 0.30,
        tailMinEfficiencyLoose: 0.18,
        pocketModeStartRatio: 0.08,
        pocketAreaK: 2.4,
        tailOversizeAlpha: 2.4,
        tailStallTrigger: 3,
        tailPenaltyBoost: 2.2,
        tailMaxPlacements: 14,
        tailCapResidualRatio: 0.03,
        tailMinGainShare: 0.22,
        tailMinGainCapMm2: 280,
        layerPolicy: "first_on_top",
        maxPieceOverlap: 0.95,
        overlapPenalty: 0.25,
        outsidePenalty: 0.05,
        minInsideRatio: 0.01
      }
    };
    const ENGINEERING_STYLES = (window.FurLabStyles && window.FurLabStyles.ENGINEERING_STYLES) || {};
    const i18nRu = window.FurLabI18nRu && typeof window.FurLabI18nRu === "object" ? window.FurLabI18nRu : {};
    const t = typeof i18nRu.t === "function"
      ? (key, vars, fallback) => i18nRu.t(key, vars, fallback)
      : (_key, _vars, fallback) => String(fallback || "");

    INVENTORY_OPTIMIZATION_PROFILE.label = t("optimization_profile_label", null, "Sew quality / Economy");
    INVENTORY_OPTIMIZATION_PROFILE.description = t(
      "optimization_profile_description",
      null,
      "Goals: full coverage, fewer pieces and seams, higher utilization."
    );

    let discoveredFiles = [];
    let discoveredZprjFile = "";
    let previewToken = "";
    let previewSourceType = "dxf";
    let previewItems = [];
    let selectedIndexes = new Set();
    let activePreviewIndex = null;

    const state = (window.FurLabState && typeof window.FurLabState.createInitialState === "function")
      ? window.FurLabState.createInitialState(DEFAULT_NAP_DIRECTION_DEG)
      : {};
    const progressApi = window.FurLabProgress || {};
    const reportsState = { model: null, selectedDetailId: null };
    if (window.FurLabReports) window.FurLabReports.init({ state, reportsState, getSelectedLayoutEntry: () => getSelectedLayoutEntry() });


    function byId(id) { return document.getElementById(id); }
    async function refreshBuildTag() {
      const tagNode = byId("buildTag");
      if (!tagNode) return;
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const j = await r.json();
        const id = String(j && j.buildId ? j.buildId : "unknown");
        tagNode.textContent = `build: ${id}`;
      } catch (_) {
        tagNode.textContent = "build: unavailable";
      }
    }
    const parseLocaleNumber = (...a) => window.FurLabUtils.parseLocaleNumber(...a);
    function getCurrentManualAllowanceMm() {
      const fromLayoutEditor = parseLocaleNumber(byId("layoutAllowanceInput") && byId("layoutAllowanceInput").value, null);
      if (Number.isFinite(Number(fromLayoutEditor))) return Math.max(0, Number(fromLayoutEditor));
      const fromStepInput = parseLocaleNumber(byId("pieceSeamReserveMm") && byId("pieceSeamReserveMm").value, null);
      if (Number.isFinite(Number(fromStepInput))) return Math.max(0, Number(fromStepInput));
      const fromInvReadonly = parseLocaleNumber(byId("invAllowanceMm") && byId("invAllowanceMm").value, null);
      if (Number.isFinite(Number(fromInvReadonly))) return Math.max(0, Number(fromInvReadonly));
      const fromState = parseLocaleNumber(state.layoutRun && state.layoutRun.allowanceMm, null);
      if (Number.isFinite(Number(fromState))) return Math.max(0, Number(fromState));
      return 12;
    }
    const normalizeDeg = (...a) => window.FurLabUtils.normalizeDeg(...a);
    function getZoneNapDirectionDeg(zone) {
      return normalizeDeg(zone && zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG);
    }
    function show(id, obj) {
      const el = byId(id);
      const text = JSON.stringify(obj, null, 2);
      el.textContent = text;
      el.style.display = text ? "block" : "none";
    }
    const safeText = (v) => window.FurLabUtils.safeText(v);
    const escapeHtml = (v) => window.FurLabUtils.escapeHtml(v);
    // reportsState is declared above (before FurLabReports.init)
    const REPORT_MIN_FRAGMENT_AREA_MM2 = 50;
    function getLayoutSnapshotForReports(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e) return null;
      if (Number(state.selectedLayoutId || 0) === Number(e.id || 0) && state.layoutRun && typeof state.layoutRun === "object") {
        return {
          selectedZoneId: Number(e.boundZoneId || state.layoutRun.selectedZoneId || state.selectedZoneId || 0) || null,
          selectedDetailId: Number(e.boundDetailId || state.selectedDetailId || 0) || null,
          layoutRun: state.layoutRun
        };
      }
      if (e.runtimeSnapshot && typeof e.runtimeSnapshot === "object" && e.runtimeSnapshot.layoutRun) {
        return e.runtimeSnapshot;
      }
      return null;
    }
    function findPlacementForFragmentInSnapshot(snapshot, fragmentOrId) {
      const snap = snapshot && typeof snapshot === "object" ? snapshot : null;
      const placements = Array.isArray(snap && snap.layoutRun && snap.layoutRun.placements) ? snap.layoutRun.placements : [];
      const fragments = Array.isArray(snap && snap.layoutRun && snap.layoutRun.fragments) ? snap.layoutRun.fragments : [];
      const frag = (fragmentOrId && typeof fragmentOrId === "object")
        ? fragmentOrId
        : fragments.find((f) => Number(f && f.id || 0) === Number(fragmentOrId || 0));
      if (!frag) return null;
      const ownerPlacementIndex = Number(frag.ownerPlacementIndex);
      if (Number.isFinite(ownerPlacementIndex) && ownerPlacementIndex >= 0 && ownerPlacementIndex < placements.length) {
        return placements[ownerPlacementIndex] || null;
      }
      const ownerPlacementId = Number(frag.ownerPlacementId || 0);
      if (ownerPlacementId) {
        return placements.find((p) => Number(p && p.fragmentId || 0) === ownerPlacementId) || null;
      }
      const fragId = Number(frag.id || 0);
      return placements.find((p) => Number(p && p.fragmentId || 0) === fragId) || null;
    }
    // Reports functions delegated to window.FurLabReports (core/reports.js)
    const canOpenReports = () => window.FurLabReports ? window.FurLabReports.canOpenReports() : false;
    function isInventoryModeForReports(mode) {
      const m = String(mode || "").trim().toLowerCase();
      return m === "inventory_manual" || m === "inventory_direct" || m === "inventory_split_return";
    }
    const escapeCsv = (v) => window.FurLabUtils.escapeCsv(v);
    const napSymbolByDeg = (d) => window.FurLabUtils.napSymbolByDeg(d);
    const finiteNumOrNaN = (v) => window.FurLabUtils.finiteNumOrNaN(v);
    const normalizeContourArrayForReports = (raw) => window.FurLabUtils.normalizeContourArray(raw);
    const buildReportsModel = () => window.FurLabReports ? window.FurLabReports.buildReportsModel() : null;
    const renderReportsPrintAll = (model) => window.FurLabReports && window.FurLabReports.renderReportsPrintAll(model);
    const renderReportsView = (detailId) => window.FurLabReports && window.FurLabReports.renderReportsView(detailId);
    const updateReportsButtonState = () => window.FurLabReports && window.FurLabReports.updateReportsButtonState();
    const closeReportsModal = () => window.FurLabReports && window.FurLabReports.closeReportsModal();
    const openReportsModal = () => window.FurLabReports && window.FurLabReports.openReportsModal();

    function findPlacementForFragment(fragmentOrId) {
      const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements : [];
      const frag = (fragmentOrId && typeof fragmentOrId === "object")
        ? fragmentOrId
        : (Array.isArray(state.layoutRun.fragments)
          ? state.layoutRun.fragments.find((f) => Number(f.id || 0) === Number(fragmentOrId || 0))
          : null);
      if (!frag) return null;
      const ownerPlacementIndex = Number(frag.ownerPlacementIndex);
      if (Number.isFinite(ownerPlacementIndex) && ownerPlacementIndex >= 0 && ownerPlacementIndex < placements.length) {
        return placements[ownerPlacementIndex] || null;
      }
      const ownerPlacementId = Number(frag.ownerPlacementId);
      if (Number.isFinite(ownerPlacementId)) {
        const byOwner = placements.find((p) => Number(p && p.fragmentId || 0) === ownerPlacementId);
        if (byOwner) return byOwner;
        return null;
      }
      const fragId = Number(frag.id || 0);
      return placements.find((p) => Number(p && p.fragmentId || 0) === fragId) || null;
    }
    let coverSolverWorker = null;
    let coverWorkerSeq = 1;
    let inventoryProgressStartedAt = 0;
    let inventoryProgressTimerId = null;
    let inventoryProgressLastTs = 0;
    let inventoryProgressLastSig = "";
    let inventoryRunSeq = 0;
    let inventoryLiveHistory = [];
    let inventoryLiveLastPhase = "";
    let inventoryLiveLastReason = "";
    let inventoryLiveLastEvalBucket = -1;
    let inventoryLiveLastRenderAt = 0;
    let intarsiaStepPhase = 1;
    let manualEvalSeq = 0;
    let manualEvalDebounceId = null;
    const inventoryProgressController = (
      window.FurLabProgressController &&
      typeof window.FurLabProgressController.createProgressController === "function"
    )
      ? window.FurLabProgressController.createProgressController({
        fetch: (...args) => fetch(...args),
        setProgress: (percent, title) => setInventoryProgress(percent, title),
        onEvent: (payload) => handleInventoryProgressEvent(payload),
        setLiveText: (text) => {
          setInventoryProgressStatus(text);
        }
      })
      : null;
    const inventoryProgressView = (
      window.FurLabProgressView &&
      typeof window.FurLabProgressView.createProgressView === "function"
    )
      ? window.FurLabProgressView.createProgressView({ byId })
      : null;
    const inventoryProgressUi = (
      window.FurLabInventoryProgressUi &&
      typeof window.FurLabInventoryProgressUi.createInventoryProgressUi === "function"
    )
      ? window.FurLabInventoryProgressUi.createInventoryProgressUi({
        byId,
        onStepUpdate: (titleText, p) => {
          if (titleText && inventoryProgressView && typeof inventoryProgressView.updateSteps === "function") {
            inventoryProgressView.updateSteps(titleText, p);
          }
        }
      })
      : null;
    const inventoryModalDragApi = window.FurLabInventoryModalDrag || {};
    const inventoryModalDrag = (typeof inventoryModalDragApi.createInventoryModalDrag === "function")
      ? inventoryModalDragApi.createInventoryModalDrag({ byId })
      : null;
    const inventoryStepModalBridgeApi = window.FurLabInventoryStepModalBridge || {};
    const inventoryStepModalBridge = (typeof inventoryStepModalBridgeApi.createInventoryStepModalBridge === "function")
      ? inventoryStepModalBridgeApi.createInventoryStepModalBridge({ inventoryModalDrag })
      : {};
    const NOOP = () => {};
    const ensureInventoryStep1ModalPosition = inventoryStepModalBridge.ensureInventoryStep1ModalPosition || NOOP;
    const setupInventoryStep1Drag = inventoryStepModalBridge.setupInventoryStep1Drag || NOOP;
    const prepareInventoryStep2Modal = inventoryStepModalBridge.prepareInventoryStep2Modal || NOOP;
    const manualTrayInteractionsApi = window.FurLabManualTrayInteractions || {};
    const manualTrayViewApi = window.FurLabManualTrayView || {};
    const manualTrayView = (typeof manualTrayViewApi.createManualTrayView === "function")
      ? manualTrayViewApi.createManualTrayView({ t })
      : null;
    const manualTrayInteractions = (typeof manualTrayInteractionsApi.createManualTrayInteractions === "function")
      ? manualTrayInteractionsApi.createManualTrayInteractions({
        byId,
        isManualInventoryMode: () => isManualInventoryMode(),
        screenToWorld: (sx, sy) => screenToWorld(sx, sy),
        onPickByTag: (tag, world) => {
          const pool = Array.isArray(state.layoutRun && state.layoutRun.candidatePool) ? state.layoutRun.candidatePool : [];
          const picked = pool.find((c) => String(c && (c.inventoryTag || c.id) || "") === String(tag || "")) || null;
          if (!picked) return null;
          addManualPlacementFromCandidate(picked, world);
          return picked;
        },
        onRenderTray: () => {
          renderManualTrayIntoRoot();
        }
      })
      : null;
    const intarsiaPreviewApi = window.FurLabIntarsiaPreview || {};
    const intarsiaPreview = (typeof intarsiaPreviewApi.createIntarsiaPreview === "function")
      ? intarsiaPreviewApi.createIntarsiaPreview({
        state,
        byId,
        generateFragmentsForZone: (...args) => generateFragmentsForZone(...args),
        refreshIntarsiaDerivedFragmentLimits: () => refreshIntarsiaDerivedFragmentLimits(),
        renderScene: () => renderScene()
      })
      : null;
    const detailZoneTreeViewApi = window.FurLabDetailZoneTreeView || {};
    const detailZoneTreeView = (typeof detailZoneTreeViewApi.createDetailZoneTreeView === "function")
      ? detailZoneTreeViewApi.createDetailZoneTreeView({
        byId,
        state,
        openLayoutTypePicker: () => openLayoutTypePicker(),
        applyLayoutMode: (mode) => applyLayoutMode(mode),
        getLayoutModeTitle: (mode) => getLayoutModeTitle(mode),
        getLayoutModeThumbSvg: (mode) => getLayoutModeThumbSvg(mode),
        renderLayoutModeSwitch: () => renderLayoutModeSwitch(),
        renderPropertyEditor: () => renderPropertyEditor(),
        renderScene: () => renderScene(),
        fitBBoxToView: (bbox) => fitBBoxToView(bbox),
        contourThumbSvg: (points, closed) => contourThumbSvg(points, closed),
        fitPointsToView: (points) => fitPointsToView(points),
        findPlacementForFragment: (fragmentOrId) => findPlacementForFragment(fragmentOrId),
        saveLayoutEntry: (entry) => saveLayoutEntry(entry),
        openLayoutEntry: (entry) => openLayoutEntry(entry),
        selectLayoutEntry: (entry) => selectLayoutEntry(entry),
        deleteLayoutEntry: (entry) => deleteLayoutEntry(entry),
        openZoneContextMenu: (payload) => openZoneContextMenu(payload),
        openMaterialLibrary: (zone) => openMaterialLibrary(zone),
        buildMaterialPreviewSvgMarkup: (material) => buildMaterialPreviewSvgMarkup(material),
        getFurMaterialById: (materialId) => getFurMaterialById(materialId),
        removeProjectMaterialById: (materialId) => removeProjectMaterialById(materialId),
        assignMaterialToZone: (zone, material) => assignMaterialToZone(zone, material)
      })
      : null;
    const propertyEditorViewApi = window.FurLabPropertyEditorView || {};
    const propertyEditorView = (typeof propertyEditorViewApi.createPropertyEditorView === "function")
      ? propertyEditorViewApi.createPropertyEditorView({
        byId,
        state,
        getZoneNapDirectionDeg: (zone) => getZoneNapDirectionDeg(zone),
        setZoneNapDirectionDeg: (zoneId, deg) => {
          const z = state.zones.find((x) => Number(x && x.id) === Number(zoneId));
          if (!z) return null;
          z.napDirectionDeg = normalizeDeg(deg, DEFAULT_NAP_DIRECTION_DEG);
          if (Number(state.layoutRun && state.layoutRun.selectedZoneId || 0) === Number(z.id)) {
            state.layoutRun.lastNapDirectionDeg = z.napDirectionDeg;
          }
          renderScene();
          void persistZonesForCurrentWorkspace();
          return z.napDirectionDeg;
        },
        findPlacementForFragment: (fragmentOrId) => findPlacementForFragment(fragmentOrId),
        polygonArea: (points) => polygonArea(points),
        polylineLength: (points, closed) => polylineLength(points, closed),
        DEFAULT_NAP_DIRECTION_DEG,
        getLayoutModeTitle: (mode) => getLayoutModeTitle(mode),
        isManualInventoryMode: () => isManualInventoryMode(),
        api: (...args) => api(...args),
        closeReplaceCandidateModal: () => closeReplaceCandidateModal(),
        openReplaceCandidateModal: () => openReplaceCandidateModal(),
        renderPlacementRows: (rows) => renderPlacementRows(rows),
        renderDetailZoneTree: () => renderDetailZoneTree(),
        renderScene: () => renderScene(),
        openInventoryStep1: (mode) => openInventoryStep1(mode),
        renderManualTrayIntoRoot: () => renderManualTrayIntoRoot(),
        saveLayoutEntry: (entry) => saveLayoutEntry(entry),
        markLayoutDirty: (entry, dirty) => markLayoutDirty(entry, dirty),
        getFurMaterialById: (materialId) => getFurMaterialById(materialId),
        ensureFurMaterialLoaded: async (materialId) => {
          const before = getFurMaterialById(materialId);
          const loaded = await loadFurMaterialDetails(materialId);
          if (loaded && loaded !== before) {
            renderPropertyEditor();
          }
          return loaded;
        },
        getRadialAutoCenter: () => {
          const zone = resolveCurrentRadialZone();
          return zone ? getZoneCenterPoint(zone) : null;
        },
        applyIntarsiaFragmentsToZone: (zoneId) => applyIntarsiaFragmentsToZone(zoneId),
        applyIntarsiaFragmentToZone: (fragmentId, zoneId) => applyIntarsiaFragmentToZone(fragmentId, zoneId),
        previewIntarsiaFragmentsDraft: () => previewIntarsiaFragmentsDraft(),
        importSvgContours: (file, scale) => {
          const rerenderPropEditor = () => {
            if (propertyEditorView && typeof propertyEditorView.renderPropertyEditor === "function") {
              propertyEditorView.renderPropertyEditor();
            }
          };
          if (!file) {
            state.intarsiaSvgFragments = null;
            state.intarsiaSvgFileName = null;
            state.layoutRun.fragments = [];
            state.layoutRun.fillType = null;
            state.layoutRun.active = false;
            const modeEl = byId("fillGridMode");
            if (modeEl) { modeEl.value = "grid"; syncGridModeUi(); }
            rerenderPropEditor();
            renderScene();
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const result = parseSvgContours(ev.target.result, scale);
            if (result.error || !result.contours.length) {
              state.intarsiaSvgFragments = null;
            } else {
              // Center imported contours on the selected zone
              const zone = state.zones && state.zones.find((z) => Number(z && z.id) === Number(state.selectedZoneId))
                || (Array.isArray(state.zones) ? state.zones[0] : null);
              let contours = result.contours;
              if (zone && Array.isArray(zone.points) && zone.points.length >= 3) {
                // zone bounding box center
                const zx = zone.points.map((p) => p.x), zy = zone.points.map((p) => p.y);
                const zCx = (Math.min(...zx) + Math.max(...zx)) / 2;
                const zCy = (Math.min(...zy) + Math.max(...zy)) / 2;
                // contours bounding box center
                const allPts = contours.flat();
                const ax = allPts.map((p) => p.x), ay = allPts.map((p) => p.y);
                const cCx = (Math.min(...ax) + Math.max(...ax)) / 2;
                const cCy = (Math.min(...ay) + Math.max(...ay)) / 2;
                const dx = zCx - cCx, dy = zCy - cCy;
                contours = contours.map((pts) => pts.map((p) => ({ x: p.x + dx, y: p.y + dy })));
              }
              const existing = Array.isArray(state.intarsiaSvgFragments) ? state.intarsiaSvgFragments : [];
              const maxId = existing.reduce((m, f) => Math.max(m, Number(f && f.id || 0)), 0);
              const newFrags = contours.map((pts, idx) => ({ id: maxId + idx + 1, points: pts }));
              state.intarsiaSvgFragments = existing.concat(newFrags);
              state.layoutRun.fillType = "import_svg";
              const modeEl = byId("fillGridMode");
              if (modeEl) { modeEl.value = "import_svg"; syncGridModeUi(); }
            }
            rerenderPropEditor();
            previewIntarsiaFragmentsDraft();
          };
          reader.readAsText(file);
        }
      })
      : null;
    const layerLegend = (
      window.FurLabLayerLegend &&
      typeof window.FurLabLayerLegend.createLayerLegend === "function"
    )
      ? window.FurLabLayerLegend.createLayerLegend({
        byId,
        t,
        getStats: () => ({
          fragmentsCount: Array.isArray(state.layoutRun && state.layoutRun.fragments) ? state.layoutRun.fragments.length : 0,
          manualBeforeApply: isManualInventoryMode() && String(state.layoutRun && state.layoutRun.status || "") !== "applied",
          matchedPiecesCount: Array.isArray(state.layoutRun && state.layoutRun.placements)
            ? state.layoutRun.placements.filter((p) => String(p && p.status || "") === "matched").length
            : 0
        })
      })
      : null;
    const inventoryStep2Ui = (
      window.FurLabInventoryStep2Ui &&
      typeof window.FurLabInventoryStep2Ui.createInventoryStep2Ui === "function"
    )
      ? window.FurLabInventoryStep2Ui.createInventoryStep2Ui({
        byId,
        t,
        isManualInventoryMode: () => isManualInventoryMode(),
        renderPlacementExplain: () => renderPlacementExplain()
      })
      : null;
    function updateInventoryProgressKpis(input) {
      if (inventoryProgressView && typeof inventoryProgressView.updateKpis === "function") {
        inventoryProgressView.updateKpis(input);
      }
    }

    function ensureCoverSolverWorker() {
      if (coverSolverWorker) return coverSolverWorker;
      if (typeof Worker === "undefined") return null;
      coverSolverWorker = new Worker("/workers/cover_solver_worker.js");
      return coverSolverWorker;
    }

    function resetInventoryProgressMonotonic() {
      if (inventoryProgressUi && typeof inventoryProgressUi.resetMonotonic === "function") {
        inventoryProgressUi.resetMonotonic();
      }
    }

    function setInventoryProgress(percent, titleText, options) {
      if (inventoryProgressUi && typeof inventoryProgressUi.setProgress === "function") {
        inventoryProgressUi.setProgress(percent, titleText, options);
        return;
      }
      const bar = byId("inventoryProgressBar");
      const text = byId("inventoryProgressText");
      const title = byId("inventoryProgressTitle");
      const incoming = Math.max(0, Math.min(100, Number(percent) || 0));
      if (bar) bar.style.width = `${incoming}%`;
      if (text) text.textContent = `${Math.round(incoming)}%`;
      if (title && titleText) title.textContent = titleText;
      if (titleText && inventoryProgressView && typeof inventoryProgressView.updateSteps === "function") {
        inventoryProgressView.updateSteps(titleText, incoming);
      }
    }

    function setInventoryProgressStatus(text) {
      const el = byId("inventoryProgressStatus");
      if (!el) return;
      const raw = String(text || "").trim();
      if (!raw) {
        el.textContent = "РћР¶РёРґР°РЅРёРµ С‚РµР»РµРјРµС‚СЂРёРё...";
        return;
      }
      el.textContent = raw.replace(/\s*\n+\s*/g, " | ");
    }

    function addInventoryProgressNote(text) {
      const msg = String(text || "").trim();
      if (!msg) return;
      const stamp = new Date().toLocaleTimeString();
      inventoryLiveHistory.push(`[${stamp}] ${msg}`);
      if (inventoryLiveHistory.length > 12) inventoryLiveHistory = inventoryLiveHistory.slice(-12);
      const tail = inventoryLiveHistory.slice(-2).join(" Р’В· ");
      setInventoryProgressStatus(`${t("checkpoints_title", null, "Checkpoints")}: ${tail}`);
    }

    const formatDurationClock = typeof progressApi.formatDurationClock === "function"
      ? progressApi.formatDurationClock
      : ((ms) => {
        const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
        const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
        const ss = String(totalSec % 60).padStart(2, "0");
        return `${mm}:${ss}`;
      });
    function updateInventoryProgressTimer() {
      if (inventoryProgressUi && typeof inventoryProgressUi.updateTimer === "function") {
        inventoryProgressUi.updateTimer(inventoryProgressStartedAt, formatDurationClock);
        return;
      }
      const el = byId("inventoryProgressTimer");
      if (!el || !inventoryProgressStartedAt) return;
      el.textContent = formatDurationClock(Date.now() - inventoryProgressStartedAt);
    }

    function startServerPreviewProgressTicker() {
      const phases = Array.isArray(progressApi.SERVER_PREVIEW_PROGRESS_PHASES) && progressApi.SERVER_PREVIEW_PROGRESS_PHASES.length
        ? progressApi.SERVER_PREVIEW_PROGRESS_PHASES
        : ["Server / phases"];
      if (inventoryProgressController && typeof inventoryProgressController.startTicker === "function") {
        inventoryProgressController.startTicker(phases);
        return;
      }
      let tickIndex = 0;
      let percent = 68;
      const timerId = setInterval(() => {
        const label = phases[tickIndex % phases.length];
        tickIndex += 1;
        percent = Math.min(94, percent + 1.3);
        setInventoryProgress(percent, label);
      }, 1300);
      startServerPreviewProgressTicker.__fallbackTimer = timerId;
    }

    function stopServerPreviewProgressTicker() {
      if (inventoryProgressController && typeof inventoryProgressController.stopTicker === "function") {
        inventoryProgressController.stopTicker();
        return;
      }
      const timerId = startServerPreviewProgressTicker.__fallbackTimer;
      if (timerId) clearInterval(timerId);
      startServerPreviewProgressTicker.__fallbackTimer = null;
    }

    function closeInventoryProgressStream() {
      if (inventoryProgressController && typeof inventoryProgressController.closeStream === "function") {
        inventoryProgressController.closeStream();
      }
    }

    const createProgressToken = typeof progressApi.createProgressToken === "function"
      ? progressApi.createProgressToken
      : (() => `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    function handleInventoryProgressEvent(payload) {
      const p = payload && typeof payload === "object" ? payload : {};
      const sign = typeof progressApi.buildProgressSignature === "function"
        ? progressApi.buildProgressSignature(p)
        : { ts: Number(p.ts), sig: "" };
      const ts = Number(sign.ts);
      const sig = String(sign.sig || "");
      if (Number.isFinite(ts) && ts < inventoryProgressLastTs) return;
      if (sig && sig === inventoryProgressLastSig) return;
      if (Number.isFinite(ts)) inventoryProgressLastTs = ts;
      inventoryProgressLastSig = sig;

      const isTelemetryEvent = typeof progressApi.isTelemetryEvent === "function"
        ? !!progressApi.isTelemetryEvent(p)
        : false;
      if (isTelemetryEvent && inventoryProgressController && typeof inventoryProgressController.setHadEvent === "function") {
        inventoryProgressController.setHadEvent(true);
      }

      if (Number.isFinite(Number(p.percent)) && p.title) {
        setInventoryProgress(Number(p.percent), String(p.title));
      } else if (p.title) {
        const fallbackPercent = (inventoryProgressController && typeof inventoryProgressController.getServerPercent === "function")
          ? inventoryProgressController.getServerPercent()
          : 68;
        setInventoryProgress(fallbackPercent, String(p.title));
      }

      const mergedKpi = typeof progressApi.mergeMonotonicKpi === "function"
        ? progressApi.mergeMonotonicKpi((inventoryProgressView && inventoryProgressView.getKpiState ? inventoryProgressView.getKpiState() : {}), p)
        : (inventoryProgressView && inventoryProgressView.getKpiState ? inventoryProgressView.getKpiState() : {});
      updateInventoryProgressKpis(mergedKpi);

      const phaseRu = (progressApi.PHASE_RU && typeof progressApi.PHASE_RU === "object") ? progressApi.PHASE_RU : {};
      const reasonRu = (progressApi.REASON_RU && typeof progressApi.REASON_RU === "object") ? progressApi.REASON_RU : {};
      const described = typeof progressApi.describeProgressEvent === "function"
        ? progressApi.describeProgressEvent(p, phaseRu, reasonRu)
        : { phaseRaw: "-", reasonRaw: "", phaseLabel: "-", reasonLabel: "", lines: [], evalBucket: 0, shortLine: "-" };

      const phaseRaw = described.phaseRaw;
      const reasonRaw = described.reasonRaw;
      const lines = Array.isArray(described.lines) ? described.lines : [];
      const now = Date.now();
      const evalBucket = Number.isFinite(Number(described.evalBucket)) ? Number(described.evalBucket) : 0;
      const phaseChanged = phaseRaw !== inventoryLiveLastPhase;
      const reasonChanged = reasonRaw !== inventoryLiveLastReason;
      const evalStepChanged = evalBucket !== inventoryLiveLastEvalBucket;

      if (phaseChanged || reasonChanged || evalStepChanged) {
        const stamp = new Date(now).toLocaleTimeString();
        const short = `[${stamp}] ${String(described.shortLine || described.phaseLabel || phaseRaw)}`;
        inventoryLiveHistory.push(short);
        if (inventoryLiveHistory.length > 12) inventoryLiveHistory = inventoryLiveHistory.slice(-12);
        inventoryLiveLastPhase = phaseRaw;
        inventoryLiveLastReason = reasonRaw;
        inventoryLiveLastEvalBucket = evalBucket;
      }

      if (now - inventoryLiveLastRenderAt > 300 || phaseChanged || reasonChanged) {
        const current = lines[0] || described.shortLine || described.phaseLabel || phaseRaw || "processing";
        setInventoryProgressStatus(current);
        inventoryLiveLastRenderAt = now;
      }
      if (Number.isFinite(Number(p.iterations)) || Number.isFinite(Number(p.evaluated))) {
        const dbg = byId("invDebugInfo");
        if (dbg) {
          const iter = Number.isFinite(Number(p.iterations)) ? Number(p.iterations) : "-";
          const ev = Number.isFinite(Number(p.evaluated)) ? Number(p.evaluated) : "-";
          dbg.textContent = `phase=${phaseRaw || "-"} iter=${iter} evaluated=${ev}`;
        }
      }
    }

    function openInventoryProgressStream(progressToken) {
      if (inventoryProgressController && typeof inventoryProgressController.openStream === "function") {
        inventoryProgressController.openStream(progressToken);
      }
    }

    function appendServerTraceProgress(trace) {
      if (!trace || typeof trace !== "object") return;
      const snap = typeof progressApi.buildTraceProgressSnapshot === "function"
        ? progressApi.buildTraceProgressSnapshot(trace)
        : null;
      const lines = snap && Array.isArray(snap.progressLines) ? snap.progressLines : [];
      const kpi = snap && snap.kpi && typeof snap.kpi === "object" ? snap.kpi : null;
      if (lines[0]) setInventoryProgress(95, String(lines[0]));
        setInventoryProgress(96, t("progress_result_build", null, "Building result"));
      if (lines[2]) setInventoryProgress(97, String(lines[2]));
      if (lines[3]) setInventoryProgress(98, String(lines[3]));
      if (kpi) updateInventoryProgressKpis(kpi);
    }

    function runCoverWorkerJob(mode, zonePoints, config, candidates, onProgress) {
      return new Promise((resolve, reject) => {
        const w = ensureCoverSolverWorker();
        if (!w) {
          resolve({ ok: false, skipped: true, reason: "worker_unavailable" });
          return;
        }
        const jobId = coverWorkerSeq++;
        const timeout = setTimeout(() => {
          try { w.postMessage({ type: "cancel", jobId }); } catch (_) {}
          cleanup();
          reject(new Error("cover_worker_timeout"));
        }, 15000);

        const cleanup = () => {
          clearTimeout(timeout);
          w.removeEventListener("message", onMessage);
          w.removeEventListener("error", onError);
        };

        const onError = (e) => {
          cleanup();
          reject(new Error((e && e.message) ? e.message : "cover_worker_error"));
        };
        const onMessage = (e) => {
          const msg = e && e.data ? e.data : null;
          if (!msg || Number(msg.jobId) !== Number(jobId)) return;
          if (msg.type === "progress") {
            if (typeof onProgress === "function") onProgress(msg);
            return;
          }
          if (msg.type === "done") {
            cleanup();
            resolve(msg);
            return;
          }
          if (msg.type === "error") {
            cleanup();
            reject(new Error(msg.error || "cover_worker_failed"));
          }
        };

        w.addEventListener("message", onMessage);
        w.addEventListener("error", onError);
        w.postMessage({
          type: "start",
          jobId,
          payload: {
            mode: String(mode || "bootstrap"),
            zonePoints,
            config: config || {},
            candidates: Array.isArray(candidates) ? candidates : []
          }
        });
      });
    }

    function buildOracleCaseFromCurrentPreview() {
      const zone = state.zones.find((z) => Number(z.id) === Number(state.selectedZoneId || 0));
      if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) return null;
      const pool = Array.isArray(state.layoutRun.candidatePool) ? state.layoutRun.candidatePool : [];
      const pieces = [];
      for (const c of pool) {
        const contour = parseScrapContourPoints(c && c.scrapContour);
        if (!Array.isArray(contour) || contour.length < 3) continue;
        pieces.push({
          id: String((c && (c.inventoryTag || c.id)) || ""),
          points: contour.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
          areaMm2: Number(c && c.areaMm2 || 0)
        });
      }
      if (!pieces.length) return null;
      const seed = Number(state.layoutRun.lastSeed || Date.now());
      const snap = state.layoutRun && state.layoutRun.paramsSnapshot && typeof state.layoutRun.paramsSnapshot === "object"
        ? state.layoutRun.paramsSnapshot
        : {};
      const opt = snap.options && typeof snap.options === "object" ? snap.options : {};
      const cst = snap.constraints && typeof snap.constraints === "object" ? snap.constraints : {};
      const napTol = Number.isFinite(Number(cst.napToleranceDeg))
        ? Number(cst.napToleranceDeg)
        : getEffectiveNapToleranceDegForCurrentRun();
      return {
        name: `zone_${zone.id}_${new Date().toISOString().replace(/[:.]/g, "-")}`,
        seed,
        zone: {
          id: Number(zone.id),
          points: zone.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
        },
        pieces,
        params: {
          rPreview: Number.isFinite(Number(opt.rasterMm)) ? Number(opt.rasterMm) : 10,
          rFinal: Number.isFinite(Number(opt.rasterMm)) ? Number(opt.rasterMm) : 2,
          thetaMin: -napTol,
          thetaMax: napTol,
          nAngles: 12,
          lambdaOverlap: Number.isFinite(Number(opt.overlapPenalty)) ? Number(opt.overlapPenalty) : 1,
          maxIter: Number.isFinite(Number(opt.maxRepairAttempts)) ? Number(opt.maxRepairAttempts) * 100 : 300,
          coverageTarget: Number.isFinite(Number(opt.coverageTarget)) ? Number(opt.coverageTarget) : 0.999,
          coverageEps: Number.isFinite(Number(opt.coverageEps)) ? Number(opt.coverageEps) : 0.002,
          maxSolveMs: Number.isFinite(Number(opt.maxSolveMs)) ? Number(opt.maxSolveMs) : 22000,
          maxPieces: Number.isFinite(Number(opt.maxPieces)) ? Number(opt.maxPieces) : 48,
          maxPointsPerCandidate: Number.isFinite(Number(opt.maxPointsPerCandidate)) ? Number(opt.maxPointsPerCandidate) : 90,
          napTolDeg: napTol,
          minAreaMm2: Number.isFinite(Number(opt.minAreaMm2))
            ? Number(opt.minAreaMm2)
            : (Number(byId("invMinArea").value || 0) || 0),
          tailCoverageStart: Number.isFinite(Number(opt.tailCoverageStart)) ? Number(opt.tailCoverageStart) : undefined,
          tailResidualRatio: Number.isFinite(Number(opt.tailResidualRatio)) ? Number(opt.tailResidualRatio) : undefined,
          tailMinEfficiency: Number.isFinite(Number(opt.tailMinEfficiency)) ? Number(opt.tailMinEfficiency) : undefined,
          tailMinEfficiencyLoose: Number.isFinite(Number(opt.tailMinEfficiencyLoose)) ? Number(opt.tailMinEfficiencyLoose) : undefined,
          pocketModeStartRatio: Number.isFinite(Number(opt.pocketModeStartRatio)) ? Number(opt.pocketModeStartRatio) : undefined,
          pocketAreaK: Number.isFinite(Number(opt.pocketAreaK)) ? Number(opt.pocketAreaK) : undefined
        }
      };
    }

    function downloadJsonFile(fileName, obj) {
      const text = JSON.stringify(obj, null, 2);
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    let W = 1280, H = 760;
    const stage = new Konva.Stage({ container: "workspace", width: W, height: H });
    function getToolCursorMode() {
      const tool = String(state.tool || "select");
      if (tool === "split-zone") return "split";
      if (tool === "add-vertex") return "add-point";
      if (tool === "edit-vertex" || tool === "curve-vertex" || tool === "smooth-vertex") return "edit-point";
      if (tool === "draw-zone" || tool === "draw-rect" || tool === "draw-ellipse") return "pen";
      return "select";
    }
    function setWorkspaceCursor(mode) {
      const el = stage && stage.container ? stage.container() : null;
      if (!el) return;
      const nextMode = String(mode || "").trim() || getToolCursorMode();
      const cursorMap = {
        select: "url('/assets/tool-cursors/select.svg') 2 2, auto",
        pen: "url('/assets/tool-cursors/pen.svg') 2 2, auto",
        split: "crosshair",
        "add-point": "url('/assets/tool-cursors/add-point.svg') 5 126, auto",
        "edit-point": "url('/assets/tool-cursors/edit-point.svg') 5 95, auto"
      };
      if (nextMode === "grab") el.style.cursor = "grab";
      else if (nextMode === "grabbing") el.style.cursor = "grabbing";
      else if (nextMode === "none") el.style.cursor = "";
      else el.style.cursor = cursorMap[nextMode] || cursorMap.select;
    }
    function syncWorkspaceSize() {
      const el = byId("workspace");
      if (!el) return;
      const nextW = Math.max(640, Math.floor(el.clientWidth || 1280));
      const nextH = Math.max(400, Math.floor(el.clientHeight || 760));
      if (nextW === W && nextH === H) return;
      W = nextW; H = nextH;
      stage.width(W);
      stage.height(H);
      renderScene();
    }
    window.addEventListener("resize", syncWorkspaceSize);
    setTimeout(syncWorkspaceSize, 0);
    const layerGuides = new Konva.Layer();
    const layerContent = new Konva.Layer();
    const layerOverlay = new Konva.Layer();
    const layerSelection = new Konva.Layer();
    stage.add(layerGuides);
    stage.add(layerContent);
    stage.add(layerOverlay);
    stage.add(layerSelection);
    const layerPattern = layerContent;
    const layerFragments = layerContent;
    const layerVisibleArea = layerOverlay;
    const layerPreview = layerOverlay;
    const layerZones = layerOverlay;
    const layerUi = layerSelection;

    function worldToScreen(p) {
      return { x: p.x * state.viewport.scale + state.viewport.offsetX, y: H - (p.y * state.viewport.scale + state.viewport.offsetY) };
    }
    function screenToWorld(x, y) {
      return { x: (x - state.viewport.offsetX) / state.viewport.scale, y: ((H - y) - state.viewport.offsetY) / state.viewport.scale };
    }

    const distance2 = (a, b) => window.FurLabUtils.distance2(a, b);
    const pointInPolygon = (point, polygon) => window.FurLabUtils.pointInPolygon(point, polygon);
    function findZoneAt(worldPoint) {
      for (let i = state.zones.length - 1; i >= 0; i--) {
        const z = state.zones[i];
        if (z.points.length >= 3 && pointInPolygon(worldPoint, z.points)) return z;
      }
      return null;
    }
    function findVertexAt(worldPoint, thresholdPx = 14) {
      const zone = state.zones.find((z) => Number(z && z.id) === Number(state.selectedZoneId));
      if (!zone) return null;
      const thr = thresholdPx / state.viewport.scale;
      const thr2 = thr * thr;
      let best = null;
      let bestD2 = Number.POSITIVE_INFINITY;
      for (let i = 0; i < zone.points.length; i++) {
        const d2 = distance2(worldPoint, zone.points[i]);
        if (d2 > thr2) continue;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { zone, vertexIndex: i, distance2: d2 };
        }
      }
      return best;
    }
    function findNearestVertexInSelectedZone(worldPoint) {
      const zone = state.zones.find((z) => Number(z && z.id) === Number(state.selectedZoneId));
      if (!zone || !Array.isArray(zone.points) || zone.points.length === 0) return null;
      let best = null;
      let bestD2 = Number.POSITIVE_INFINITY;
      for (let i = 0; i < zone.points.length; i++) {
        const d2 = distance2(worldPoint, zone.points[i]);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { zone, vertexIndex: i, distance2: d2 };
        }
      }
      return best;
    }
    function findLayoutFragmentAt(worldPoint) {
      if (!state.layoutRun.active) return null;
      const zoneId = Number(state.layoutRun.selectedZoneId || 0);
      if (!zoneId) return null;
      const frags = Array.isArray(state.layoutRun.fragments) ? state.layoutRun.fragments : [];
      // First try fragment polygons (exact visible area)
      for (let i = frags.length - 1; i >= 0; i--) {
        const f = frags[i];
        const pts = Array.isArray(f && f.points) ? f.points : [];
        if (pts.length >= 3 && pointInPolygon(worldPoint, pts)) {
          return { fragmentId: Number(f.id || 0), zoneId };
        }
      }
      // Fallback: search by core contour (non-overlapping) for direct inventory mode
      const isDirectInv = isInventoryLikeLayoutMode(state.layoutMode) && !isManualInventoryMode();
      if (isDirectInv) {
        const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements : [];
        // First pass: try core contours (non-overlapping вЂ” each point belongs to exactly one piece)
        for (let i = placements.length - 1; i >= 0; i--) {
          const p = placements[i];
          if (!p || String(p.status || "") !== "matched") continue;
          const pts = Array.isArray(p.inZoneCoreContour) && p.inZoneCoreContour.length >= 3
            ? p.inZoneCoreContour
            : (Array.isArray(p.alignedCoreContour) && p.alignedCoreContour.length >= 3 ? p.alignedCoreContour : []);
          if (pts.length >= 3 && pointInPolygon(worldPoint, pts)) {
            const frag = frags.find((f) => Number(f.ownerPlacementIndex) === i);
            if (frag) return { fragmentId: Number(frag.id || 0), zoneId };
            // Fragment missing for this placement вЂ” log for debugging
            console.warn("[findLayoutFragmentAt] placement hit but no fragment found", {
              pi: i, tag: p.inventoryTag, scrap: p.scrapPieceId,
              fragOwners: frags.map((f) => Number(f.ownerPlacementIndex))
            });
          }
        }
        // Second pass: full contour for clicks in seam allowance zone
        for (let i = placements.length - 1; i >= 0; i--) {
          const p = placements[i];
          if (!p || String(p.status || "") !== "matched") continue;
          const pts = Array.isArray(p.inZoneContour) && p.inZoneContour.length >= 3
            ? p.inZoneContour : [];
          if (pts.length >= 3 && pointInPolygon(worldPoint, pts)) {
            const frag = frags.find((f) => Number(f.ownerPlacementIndex) === i);
            if (frag) return { fragmentId: Number(frag.id || 0), zoneId };
            console.warn("[findLayoutFragmentAt] inZoneContour hit but no fragment found", {
              pi: i, tag: p.inventoryTag, scrap: p.scrapPieceId,
              fragOwners: frags.map((f) => Number(f.ownerPlacementIndex))
            });
          }
        }
      }
      return null;
    }
    function findManualPlacementAt(worldPoint) {
      if (!isManualInventoryMode()) return null;
      const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
      for (let i = placements.length - 1; i >= 0; i--) {
        const p = placements[i];
        if (!p || String(p.status || "") !== "matched") continue;
        const pts = Array.isArray(p.alignedContour) ? p.alignedContour : [];
        if (pts.length >= 3 && pointInPolygon(worldPoint, pts)) return { placementIndex: i, placement: p };
      }
      return null;
    }
    const dist2PointToSegment = (p, a, b) => window.FurLabUtils.dist2PointToSegment(p, a, b);
    function findDetailAt(worldPoint, thresholdPx = 8) {
      if (!Array.isArray(state.details) || state.details.length === 0) return null;
      const thr = thresholdPx / state.viewport.scale;
      const thr2 = thr * thr;
      let best = null;
      let bestD2 = Number.POSITIVE_INFINITY;
      const focusedZone = state.zones.find((z) => Number(z.id) === Number(state.selectedZoneId || 0)) || null;
      const focusedDetailId = focusedZone ? Number(focusedZone.detailId || 0) : 0;
      const detailsToRender = focusedDetailId
        ? state.details.filter((d) => Number(d.id) === focusedDetailId)
        : state.details;

      for (const d of detailsToRender) {
        const e = d && d.entity;
        const pts = Array.isArray(e && e.points) ? e.points : [];
        if (pts.length < 2) continue;
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const p of pts) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        if (
          worldPoint.x < minX - thr || worldPoint.x > maxX + thr ||
          worldPoint.y < minY - thr || worldPoint.y > maxY + thr
        ) continue;
        if (e.closed && pts.length >= 3 && pointInPolygon(worldPoint, pts)) return d;
        for (let i = 0; i + 1 < pts.length; i++) {
          const d2 = dist2PointToSegment(worldPoint, pts[i], pts[i + 1]);
          if (d2 <= thr2 && d2 < bestD2) {
            bestD2 = d2;
            best = d;
          }
        }
      }
      return best;
    }
    const _detailBoundaryCache = new Map();
    function getDetailBoundaryPointsForZone(zone) {
      const detailId = Number(zone && zone.detailId || 0) || 0;
      if (!detailId) return [];
      if (_detailBoundaryCache.has(detailId)) return _detailBoundaryCache.get(detailId);
      let result = [];
      if (Array.isArray(state.details)) {
        const detail = state.details.find((item) => Number(item && item.id || 0) === detailId) || null;
        const pts = Array.isArray(detail && detail.entity && detail.entity.points) ? detail.entity.points : [];
        if (pts.length >= 3) result = pts;
      }
      if (result.length < 3 && Array.isArray(state.zones)) {
        const baseZone = state.zones.find((z) => Number(z && z.detailId || 0) === detailId && String(z && z.originType || "") === "base") || null;
        const basePts = Array.isArray(baseZone && baseZone.points) ? baseZone.points : [];
        if (basePts.length >= 3) result = basePts;
      }
      _detailBoundaryCache.set(detailId, result);
      return result;
    }
    function invalidateDetailBoundaryCache() { _detailBoundaryCache.clear(); }
    function projectPointToBoundary(points, worldPoint) {
      const pts = Array.isArray(points) ? points : [];
      if (pts.length < 2 || !worldPoint) return null;
      let best = null;
      let bestD2 = Number.POSITIVE_INFINITY;
      const closed = pts.length >= 3;
      const last = closed ? pts.length : (pts.length - 1);
      for (let i = 0; i < last; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const wx = worldPoint.x - a.x;
        const wy = worldPoint.y - a.y;
        const c2 = vx * vx + vy * vy;
        if (c2 <= 1e-9) continue;
        const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / c2));
        const projected = { x: a.x + t * vx, y: a.y + t * vy };
        const d2 = distance2(worldPoint, projected);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { x: projected.x, y: projected.y, distance2: d2 };
        }
      }
      return best;
    }
    function isZoneVertexOnDetailBoundary(zone, vertexIndex, thresholdPx = 8) {
      const pts = Array.isArray(zone && zone.points) ? zone.points : [];
      const idx = Number(vertexIndex);
      if (!Number.isFinite(idx) || idx < 0 || idx >= pts.length) return false;
      const detailBoundary = getDetailBoundaryPointsForZone(zone);
      if (detailBoundary.length < 2) return false;
      const projected = projectPointToBoundary(detailBoundary, pts[idx]);
      if (!projected) return false;
      const thresholdMm = thresholdPx / Math.max(0.0001, Number(state.viewport && state.viewport.scale || 1));
      return Number(projected.distance2 || 0) <= thresholdMm * thresholdMm;
    }
    function isZoneVertexOnSharedBoundary(zone, vertexIndex, thresholdPx = 8) {
      const pts = Array.isArray(zone && zone.points) ? zone.points : [];
      const idx = Number(vertexIndex);
      if (!Number.isFinite(idx) || idx < 0 || idx >= pts.length) return false;
      const thresholdMm = thresholdPx / Math.max(0.0001, Number(state.viewport && state.viewport.scale || 1));
      const threshold2 = thresholdMm * thresholdMm;
      const point = pts[idx];
      const siblings = (Array.isArray(state.zones) ? state.zones : []).filter((item) =>
        Number(item && item.id || 0) !== Number(zone && zone.id || 0)
        && Number(item && item.detailId || 0) === Number(zone && zone.detailId || 0)
        && Array.isArray(item && item.points)
        && item.points.length >= 2
      );
      for (const sibling of siblings) {
        const projected = projectPointToBoundary(sibling.points, point);
        if (projected && Number(projected.distance2 || 0) <= threshold2) return true;
      }
      return false;
    }
    function findSharedBoundaryVertexLinks(zone, vertexIndex, thresholdPx = 8) {
      const pts = Array.isArray(zone && zone.points) ? zone.points : [];
      const idx = Number(vertexIndex);
      if (!Number.isFinite(idx) || idx < 0 || idx >= pts.length) return [];
      const thresholdMm = thresholdPx / Math.max(0.0001, Number(state.viewport && state.viewport.scale || 1));
      const threshold2 = thresholdMm * thresholdMm;
      const point = pts[idx];
      const links = [];
      const siblings = (Array.isArray(state.zones) ? state.zones : []).filter((item) =>
        Number(item && item.id || 0) !== Number(zone && zone.id || 0)
        && Number(item && item.detailId || 0) === Number(zone && zone.detailId || 0)
        && Array.isArray(item && item.points)
        && item.points.length >= 2
      );
      for (const sibling of siblings) {
        let bestIndex = -1;
        let bestD2 = Number.POSITIVE_INFINITY;
        for (let i = 0; i < sibling.points.length; i++) {
          const d2 = distance2(point, sibling.points[i]);
          if (d2 < bestD2) {
            bestD2 = d2;
            bestIndex = i;
          }
        }
        if (bestIndex >= 0 && bestD2 <= threshold2) {
          links.push({
            zoneId: Number(sibling.id || 0) || null,
            vertexIndex: bestIndex,
            from: { x: Number(sibling.points[bestIndex].x), y: Number(sibling.points[bestIndex].y) }
          });
        }
      }
      return links;
    }
    function isVertexEditingTool(tool) {
      return ["edit-vertex", "add-vertex", "smooth-vertex", "curve-vertex"].includes(String(tool || ""));
    }
    const buildRectZonePoints = (a, b) => window.FurLabUtils.buildRectZonePoints(a, b);
    const buildEllipseZonePoints = (...a) => window.FurLabUtils.buildEllipseZonePoints(...a);
    function createZoneFromPoints(points, options = {}) {
      const pts = Array.isArray(points)
        ? points
            .map((p) => ({ x: Number(p && p.x), y: Number(p && p.y) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        : [];
      if (pts.length < 3) return false;
      const zoneId = state.nextZoneId++;
      const detailId = Number(options && options.detailId || state.selectedDetailId || 0) || null;
      const parentZoneIdOpt = Number(options && options.parentZoneId || 0) || null;
      function resolveZoneName() {
        if (parentZoneIdOpt) {
          const parent = (Array.isArray(state.zones) ? state.zones : []).find((z) => Number(z && z.id || 0) === parentZoneIdOpt);
          const parentName = (parent && parent.name) || (options.parentZoneSnapshot && options.parentZoneSnapshot.name) || `Р—РѕРЅР° ${parentZoneIdOpt}`;
          const parentSuffix = String(parentName).replace(/^Р—РѕРЅР°\s*/i, "");
          const siblingCount = (Array.isArray(state.zones) ? state.zones : []).filter((z) => Number(z && z.parentZoneId || 0) === parentZoneIdOpt && Number(z && z.detailId || 0) === detailId).length;
          return `Р—РѕРЅР° ${parentSuffix}${siblingCount + 1}`;
        }
        return `Р—РѕРЅР° ${detailId || zoneId}`;
      }
      const zone = {
        id: zoneId,
        name: resolveZoneName(),
        detailId,
        napDirectionDeg: DEFAULT_NAP_DIRECTION_DEG,
        originType: String(options && options.originType || "manual").trim().toLowerCase() || "manual",
        parentZoneId: Number(options && options.parentZoneId || 0) || null,
        parentZoneSnapshot: options && options.parentZoneSnapshot && typeof options.parentZoneSnapshot === "object"
          ? JSON.parse(JSON.stringify(options.parentZoneSnapshot))
          : null,
        points: pts
      };
      const cmd = { type: "create-zone", zone };
      executeCommand(cmd);
      pushCommand(cmd);
      state.draftZone = [];
      renderScene();
      if (!options.skipPersist) void persistZonesForCurrentWorkspace();
      return true;
    }
    function removeSelectedZoneVertex() {
      const zone = state.zones.find((z) => Number(z && z.id || 0) === Number(state.selectedZoneId || 0)) || null;
      const vertexIndex = Number(state.selectedVertexIndex);
      if (!zone || !Array.isArray(zone.points) || zone.points.length <= 3) return false;
      if (!Number.isFinite(vertexIndex) || vertexIndex < 0 || vertexIndex >= zone.points.length) return false;
      if (isZoneVertexOnDetailBoundary(zone, vertexIndex)) return false;
      const point = { ...zone.points[vertexIndex] };
      zone.points.splice(vertexIndex, 1);
      pushCommand({
        type: "delete-vertex",
        zoneId: Number(zone.id || 0) || null,
        vertexIndex,
        point
      });
      state.selectedVertexIndex = Math.max(0, Math.min(vertexIndex, zone.points.length - 1));
      void persistZonesForCurrentWorkspace();
      renderScene();
      return true;
    }

    function pushCommand(cmd) { state.history.undo.push(cmd); state.history.redo = []; }
    function cloneZoneStateForCommand(zone) {
      const z = zone && typeof zone === "object" ? zone : null;
      if (!z) return null;
      return {
        id: Number(z.id || 0) || null,
        name: String(z.name || "").trim(),
        detailId: Number(z.detailId || 0) || null,
        napDirectionDeg: normalizeDeg(z.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG),
        originType: String(z.originType || "").trim() || null,
        parentZoneId: Number(z.parentZoneId || 0) || null,
        parentZoneSnapshot: z.parentZoneSnapshot && typeof z.parentZoneSnapshot === "object"
          ? JSON.parse(JSON.stringify(z.parentZoneSnapshot))
          : null,
        points: (Array.isArray(z.points) ? z.points : []).map((p) => ({ ...p }))
      };
    }
    function materializeZoneFromCommand(zone) {
      const z = cloneZoneStateForCommand(zone);
      if (!z) return null;
      return z;
    }
    const smoothZoneVertexPoints = (...a) => window.FurLabUtils.smoothZoneVertexPoints(...a);

    function clearCurveEdit(options = {}) {
      const restore = options && options.restore === true;
      const ce = state.curveEdit && typeof state.curveEdit === "object" ? state.curveEdit : null;
      if (restore && ce) {
        const zone = state.zones.find((x) => Number(x && x.id || 0) === Number(ce.zoneId || 0)) || null;
        if (zone && Array.isArray(ce.basePoints) && ce.basePoints.length >= 3) {
          zone.points = ce.basePoints.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
        }
      }
      state.curveEdit = null;
    }

    function beginCurveEdit(zone, vertexIndex, strength = 0.28) {
      const z = zone && typeof zone === "object" ? zone : null;
      if (!z || !Array.isArray(z.points) || z.points.length < 3) {
        clearCurveEdit({ restore: true });
        return false;
      }
      state.selectedZoneId = Number(z.id || 0) || null;
      state.curveEdit = {
        zoneId: Number(z.id || 0) || null,
        vertexIndex: ((Number(vertexIndex || 0) % z.points.length) + z.points.length) % z.points.length,
        strength: Math.max(0.08, Math.min(0.48, Number(strength) || 0.28)),
        basePoints: z.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
      };
      return true;
    }

    function getCurveEditContext() {
      const ce = state.curveEdit && typeof state.curveEdit === "object" ? state.curveEdit : null;
      if (!ce || String(state.tool || "") !== "curve-vertex") return null;
      const zone = state.zones.find((x) => Number(x && x.id || 0) === Number(ce.zoneId || 0)) || null;
      const basePoints = Array.isArray(ce.basePoints) ? ce.basePoints.map((p) => ({ x: Number(p.x), y: Number(p.y) })) : [];
      if (!zone || basePoints.length < 3) return null;
      const n = basePoints.length;
      const idx = ((Number(ce.vertexIndex || 0) % n) + n) % n;
      const prev = basePoints[(idx - 1 + n) % n];
      const cur = basePoints[idx];
      const next = basePoints[(idx + 1) % n];
      const vPrev = { x: prev.x - cur.x, y: prev.y - cur.y };
      const vNext = { x: next.x - cur.x, y: next.y - cur.y };
      const lenPrev = Math.hypot(vPrev.x, vPrev.y);
      const lenNext = Math.hypot(vNext.x, vNext.y);
      if (!(lenPrev > 1e-6 && lenNext > 1e-6)) return null;
      const uPrev = { x: vPrev.x / lenPrev, y: vPrev.y / lenPrev };
      const uNext = { x: vNext.x / lenNext, y: vNext.y / lenNext };
      const minLen = Math.max(1e-6, Math.min(lenPrev, lenNext));
      const worldMinHandleLen = Math.max(12 / Math.max(0.001, Number(state.viewport && state.viewport.scale || 1)), minLen * 0.08);
      const handleLen = Math.max(worldMinHandleLen, minLen * Math.max(0.08, Math.min(0.48, Number(ce.strength) || 0.28)));
      return {
        zone,
        basePoints,
        vertexIndex: idx,
        strength: Math.max(0.08, Math.min(0.48, Number(ce.strength) || 0.28)),
        cur,
        uPrev,
        uNext,
        minLen,
        handleLen,
        handlePrev: { x: cur.x + uPrev.x * handleLen, y: cur.y + uPrev.y * handleLen },
        handleNext: { x: cur.x + uNext.x * handleLen, y: cur.y + uNext.y * handleLen }
      };
    }

    function applyCurveEditPreview(strength) {
      const ctx = getCurveEditContext();
      if (!ctx) return false;
      const nextStrength = Math.max(0.08, Math.min(0.48, Number(strength) || ctx.strength));
      const nextPoints = smoothZoneVertexPoints(ctx.basePoints, ctx.vertexIndex, nextStrength);
      if (!Array.isArray(nextPoints) || nextPoints.length < ctx.basePoints.length + 2) return false;
      ctx.zone.points = nextPoints.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
      state.curveEdit.strength = nextStrength;
      return true;
    }

    function commitCurveEdit() {
      const ctx = getCurveEditContext();
      if (!ctx) return false;
      const zone = ctx.zone;
      const beforePoints = ctx.basePoints.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
      const afterPoints = (Array.isArray(zone.points) ? zone.points : []).map((p) => ({ x: Number(p.x), y: Number(p.y) }));
      clearCurveEdit();
      state.selectedVertexIndex = null;
      const changed = beforePoints.length !== afterPoints.length || beforePoints.some((p, i) => Math.abs(p.x - afterPoints[i].x) > 1e-6 || Math.abs(p.y - afterPoints[i].y) > 1e-6);
      if (changed) {
        pushCommand({
          type: "curve-vertex",
          zoneId: Number(zone.id || 0) || null,
          beforePoints,
          afterPoints
        });
        renderPropertyEditor();
        void persistZonesForCurrentWorkspace();
      }
      return changed;
    }
    function executeCommand(cmd) {
      if (cmd.type === "create-zone") {
        const zone = materializeZoneFromCommand(cmd.zone);
        if (!zone) return;
        state.zones.push(zone);
        state.selectedZoneId = cmd.zone.id;
      } else if (cmd.type === "split-zone") {
        state.zones = state.zones.filter((z) => Number(z && z.id) !== Number(cmd.originalZone && cmd.originalZone.id));
        for (const zone of (Array.isArray(cmd.newZones) ? cmd.newZones : [])) {
          const nextZone = materializeZoneFromCommand(zone);
          if (nextZone) state.zones.push(nextZone);
        }
        state.selectedZoneId = Number(cmd.newZones && cmd.newZones[0] && cmd.newZones[0].id || 0) || null;
      } else if (cmd.type === "add-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId);
        if (!z) return;
        const insertIndex = Math.max(0, Math.min(Array.isArray(z.points) ? z.points.length : 0, Number(cmd.insertIndex || 0)));
        z.points.splice(insertIndex, 0, { ...cmd.point });
        state.selectedZoneId = Number(z.id || 0) || null;
        state.selectedVertexIndex = insertIndex;
      } else if (cmd.type === "delete-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId);
        if (!z) return;
        const idx = Math.max(0, Math.min(Array.isArray(z.points) ? z.points.length : 0, Number(cmd.vertexIndex || 0)));
        z.points.splice(idx, 0, { ...cmd.point });
        state.selectedZoneId = Number(z.id || 0) || null;
        state.selectedVertexIndex = idx;
      } else if (cmd.type === "smooth-vertex" || cmd.type === "curve-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId);
        if (!z) return;
        z.points = (Array.isArray(cmd.afterPoints) ? cmd.afterPoints : []).map((p) => ({ ...p }));
        state.selectedZoneId = Number(z.id || 0) || null;
      } else if (cmd.type === "move-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId); if (!z) return; z.points[cmd.vertexIndex] = { ...cmd.to };
      } else if (cmd.type === "move-shared-vertices") {
        for (const move of (Array.isArray(cmd.moves) ? cmd.moves : [])) {
          const z = state.zones.find((x) => x.id === move.zoneId);
          if (!z || !Array.isArray(z.points)) continue;
          const idx = Number(move.vertexIndex);
          if (!Number.isFinite(idx) || idx < 0 || idx >= z.points.length) continue;
          z.points[idx] = { ...move.to };
        }
      }
    }
    function revertCommand(cmd) {
      if (cmd.type === "create-zone") {
        state.zones = state.zones.filter((z) => z.id !== cmd.zone.id);
        if (state.selectedZoneId === cmd.zone.id) state.selectedZoneId = null;
      } else if (cmd.type === "split-zone") {
        state.zones = state.zones.filter((z) => !Array.isArray(cmd.newZones) || !cmd.newZones.some((next) => Number(next && next.id) === Number(z && z.id)));
        const originalZone = materializeZoneFromCommand(cmd.originalZone);
        if (originalZone) state.zones.push(originalZone);
        state.selectedZoneId = Number(cmd.originalZone && cmd.originalZone.id || 0) || null;
      } else if (cmd.type === "add-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId);
        if (!z) return;
        const idx = Number(cmd.insertIndex || 0);
        if (idx >= 0 && idx < z.points.length) z.points.splice(idx, 1);
        state.selectedZoneId = Number(z.id || 0) || null;
        state.selectedVertexIndex = null;
      } else if (cmd.type === "delete-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId);
        if (!z) return;
        const idx = Number(cmd.vertexIndex || 0);
        if (idx >= 0 && idx <= z.points.length) z.points.splice(idx, 0, { ...cmd.point });
        state.selectedZoneId = Number(z.id || 0) || null;
        state.selectedVertexIndex = idx;
      } else if (cmd.type === "smooth-vertex" || cmd.type === "curve-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId);
        if (!z) return;
        z.points = (Array.isArray(cmd.beforePoints) ? cmd.beforePoints : []).map((p) => ({ ...p }));
        state.selectedZoneId = Number(z.id || 0) || null;
      } else if (cmd.type === "move-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId); if (!z) return; z.points[cmd.vertexIndex] = { ...cmd.from };
      } else if (cmd.type === "move-shared-vertices") {
        for (const move of (Array.isArray(cmd.moves) ? cmd.moves : [])) {
          const z = state.zones.find((x) => x.id === move.zoneId);
          if (!z || !Array.isArray(z.points)) continue;
          const idx = Number(move.vertexIndex);
          if (!Number.isFinite(idx) || idx < 0 || idx >= z.points.length) continue;
          z.points[idx] = { ...move.from };
        }
      }
    }
    function undo() { const cmd = state.history.undo.pop(); if (!cmd) return; revertCommand(cmd); state.history.redo.push(cmd); renderScene(); void persistZonesCurrentNoReload(); }
    function redo() { const cmd = state.history.redo.pop(); if (!cmd) return; executeCommand(cmd); state.history.undo.push(cmd); renderScene(); void persistZonesCurrentNoReload(); }
    async function persistZonesCurrentNoReload() {
      const workspaceKey = buildZonesWorkspaceKey();
      if (!workspaceKey) return;
      const zones = (Array.isArray(state.zones) ? state.zones : []).map(normalizeZoneForPersistence).filter(Boolean);
      await api("/api/zones/save", "POST", { workspaceKey, selectedZoneId: Number(state.selectedZoneId || 0) || null, zones }, 20000);
    }

    function fitPatternToView() {
      const g = state.patternGeometry; if (!g || !g.bbox) return;
      const b = g.bbox; const m = 20;
      const w = Math.max(1, b.width), h = Math.max(1, b.height);
      const s = Math.max(0.05, Math.min((W - 2 * m) / w, (H - 2 * m) / h));
      state.viewport.scale = s;
      state.viewport.offsetX = m - b.minX * s + (W - 2 * m - w * s) / 2;
      state.viewport.offsetY = m - b.minY * s + (H - 2 * m - h * s) / 2;
    }

    function zoomAtCenter(factor) {
      const px = W / 2;
      const py = H / 2;
      const wb = screenToWorld(px, py);
      state.viewport.scale = Math.max(0.02, Math.min(500, state.viewport.scale * factor));
      state.viewport.offsetX = px - wb.x * state.viewport.scale;
      state.viewport.offsetY = (H - py) - wb.y * state.viewport.scale;
    }

    function linePoints(points) {
      const out = [];
      for (const p of points) {
        const s = worldToScreen(p);
        out.push(s.x, s.y);
      }
      return out;
    }

    const normalizeHexColor = (...a) => window.FurLabHatch.normalizeHexColor(...a);
    const clamp01 = (...a) => window.FurLabHatch.clamp01(...a);
    const hexToRgb = (...a) => window.FurLabHatch.hexToRgb(...a);
    const rgbaFromHex = (...a) => window.FurLabHatch.rgbaFromHex(...a);
    const computeMaterialHatchColor = (...a) => window.FurLabHatch.computeMaterialHatchColor(...a);
    const normalizeRange = (...a) => window.FurLabHatch.normalizeRange(...a);
    const getMaterialPatternSpec = (m) => window.FurLabHatch.getMaterialPatternSpec(m);
    const buildWavyLinePoints = (...a) => window.FurLabHatch.buildWavyLinePoints(...a);
    const buildWavyDashSegmentPoints = (...a) => window.FurLabHatch.buildWavyDashSegmentPoints(...a);
    const buildMaterialPreviewSvgMarkup = (m) => window.FurLabHatch.buildMaterialPreviewSvgMarkup(m);
    const buildMaterialPreviewSvg = (m) => window.FurLabHatch.buildMaterialPreviewSvg(m);
    const buildMaterialPatternPreviewStyle = (m) => window.FurLabHatch.buildMaterialPatternPreviewStyle(m);
    const describeMaterialPatternDebug = (m) => window.FurLabHatch.describeMaterialPatternDebug(m);
    const getZoneMaterialVisual = (m) => window.FurLabHatch.getZoneMaterialVisual(m);
    const buildHatchTile = (v, l) => window.FurLabHatch.buildHatchTile(v, l);

    function addZoneMaterialOverlay(layer, zone, visual) {
      const pts = Array.isArray(zone && zone.points) ? zone.points : [];
      if (pts.length < 3) return;
      const screenPts = pts.map((p) => worldToScreen(p));
      const layerSpecs = Array.isArray(visual.layers) ? visual.layers : [];
      const angleDeg = Number(visual.angleRad || 0) * 180 / Math.PI;
      for (const layerSpec of layerSpecs) {
        const tile = buildHatchTile(visual, layerSpec);
        if (!tile) continue;
        const shape = new Konva.Shape({
          listening: false,
          fillPatternImage: tile,
          fillPatternRepeat: 'repeat',
          fillPatternRotation: angleDeg,
          stroke: null,
          strokeWidth: 0,
          sceneFunc(ctx2d, shape) {
            ctx2d.beginPath();
            for (let i = 0; i < screenPts.length; i++) {
              const p = screenPts[i];
              if (i === 0) ctx2d.moveTo(p.x, p.y); else ctx2d.lineTo(p.x, p.y);
            }
            ctx2d.closePath();
            ctx2d.fillShape(shape);
          }
        });
        layer.add(shape);
      }
    }

    // (kept for potential reuse)
    function _addParallelHatchLegacy(hatchGroup, centerX, centerY, diag, visual, options) {
      const opts = options && typeof options === 'object' ? options : {};
      const useWave = !!opts.wave;
      const baseDash = Array.isArray(opts.dash) ? opts.dash : visual.dash;
      const strokeWidth = Math.max(0.45, Number(opts.strokeWidth || visual.strokeWidth));
      const stroke = opts.stroke || visual.hatchStroke;
      const angle = visual.angleRad;
      const dirX = Math.cos(angle); const dirY = Math.sin(angle);
      const normalX = -dirY; const normalY = dirX;
      const spacing = Math.max(5, Number(opts.spacing || visual.spacing));
      const amplitude = Number(opts.amplitude || visual.bendAmplitude || 2);
      const wavelength = Number(opts.wavelength || Math.max(12, visual.curlRadiusPx * 2));
      const pad = strokeWidth + 2;
      const size = Math.ceil(diag * 2 + pad * 2);
      const offscreen = document.createElement("canvas");
      offscreen.width = size; offscreen.height = size;
      const ctx2d = offscreen.getContext("2d");
      ctx2d.strokeStyle = stroke; ctx2d.lineWidth = strokeWidth; ctx2d.lineCap = "round"; ctx2d.lineJoin = "round";
      const lox = size / 2; const loy = size / 2;
      for (let offset = -diag; offset <= diag; offset += spacing) {
        const anchorX = normalX * offset; const anchorY = normalY * offset;
        if (useWave) {
          const dashLen = Math.max(1.2, baseDash[0]); const gapLen = Math.max(1.2, baseDash[1]);
          ctx2d.beginPath();
          for (let t = -diag; t <= diag; t += dashLen + gapLen) {
            const tEnd = Math.min(diag, t + dashLen);
            if (tEnd <= t) continue;
            const wpts = buildWavyDashSegmentPoints(anchorX, anchorY, dirX, dirY, normalX, normalY, t, tEnd, amplitude, wavelength);
            if (wpts.length < 4) continue;
            ctx2d.moveTo(lox + wpts[0], loy + wpts[1]);
            for (let wi = 2; wi < wpts.length; wi += 2) ctx2d.lineTo(lox + wpts[wi], loy + wpts[wi + 1]);
          }
          ctx2d.stroke();
        } else {
          const dashLen = Math.max(1.2, baseDash[0]); const gapLen = Math.max(1.2, baseDash[1]);
          ctx2d.setLineDash([dashLen, gapLen]);
          ctx2d.beginPath();
          ctx2d.moveTo(lox + anchorX - dirX * diag, loy + anchorY - dirY * diag);
          ctx2d.lineTo(lox + anchorX + dirX * diag, loy + anchorY + dirY * diag);
          ctx2d.stroke();
        }
      }
      ctx2d.setLineDash([]);
      hatchGroup.add(new Konva.Image({
        image: offscreen,
        x: centerX - size / 2,
        y: centerY - size / 2,
        width: size,
        height: size,
        listening: false
      }));
    }


    function getRenderablePatternEntities() {
      const g = state.patternGeometry;
      if (!g || !Array.isArray(g.entities)) {
        state.filterStats = { total: 0, noisy: 0, open: 0, minPoints: 0, tooSmall: 0, dedup: 0, capped: 0, shown: 0, smartClosed: 0 };
        return [];
      }
      const src = g.entities;
      const stats = { total: src.length, noisy: 0, open: 0, minPoints: 0, tooSmall: 0, dedup: 0, capped: 0, shown: 0, smartClosed: 0, fallbackRaw: 0 };
      function segmentIntersection(a, b, c, d) {
        function orient(p, q, r) {
          return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        }
        function onSeg(p, q, r) {
          return Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) &&
            Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
        }
        const o1 = orient(a, b, c);
        const o2 = orient(a, b, d);
        const o3 = orient(c, d, a);
        const o4 = orient(c, d, b);
        if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) return true;
        if (o1 === 0 && onSeg(a, c, b)) return true;
        if (o2 === 0 && onSeg(a, d, b)) return true;
        if (o3 === 0 && onSeg(c, a, d)) return true;
        if (o4 === 0 && onSeg(c, b, d)) return true;
        return false;
      }
      function contourLooksNoisy(points, bbox) {
        if (!Array.isArray(points) || points.length < 8) return true;
        const w = Math.max(1, Number(bbox && bbox.width || 0));
        const h = Math.max(1, Number(bbox && bbox.height || 0));
        const perimeter = 2 * (w + h);
        let length = 0;
        for (let i = 1; i < points.length; i++) {
          const dx = points[i].x - points[i - 1].x;
          const dy = points[i].y - points[i - 1].y;
          length += Math.hypot(dx, dy);
        }
        if (length > perimeter * 7.5) return true;
        const n = points.length;
        if (n > 2200) return true;
        let intersections = 0;
        const maxChecks = 2500;
        let checks = 0;
        for (let i = 0; i + 1 < n - 1; i++) {
          const a = points[i], b = points[i + 1];
          for (let j = i + 2; j + 1 < n; j++) {
            if (i === 0 && j === n - 2) continue;
            const c = points[j], d = points[j + 1];
            if (segmentIntersection(a, b, c, d)) {
              intersections++;
              if (intersections > 14) return true;
            }
            checks++;
            if (checks >= maxChecks) break;
          }
          if (checks >= maxChecks) break;
        }
        return false;
      }
      function bridgeIntersectsTooMuch(points, bridgeA, bridgeB) {
        let hits = 0;
        for (let i = 0; i + 1 < points.length; i++) {
          const a = points[i], b = points[i + 1];
          if (!a || !b) continue;
          if (i === 0 || i === points.length - 2) continue;
          if (segmentIntersection(bridgeA, bridgeB, a, b)) {
            hits++;
            if (hits > 2) return true;
          }
        }
        return false;
      }
      function normEntity(e) {
        const pts = Array.isArray(e && e.points) ? e.points : [];
        if (pts.length < 2) return { entity: e, closedEff: !!(e && e.closed), bbox: null, area: 0, smartClosed: false };
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const p of pts) {
          if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const w = Number.isFinite(minX) ? (maxX - minX) : 0;
        const h = Number.isFinite(minY) ? (maxY - minY) : 0;
        const diag = Math.hypot(w, h);
        const first = pts[0];
        const last = pts[pts.length - 1];
        const endDist = Math.hypot((last.x - first.x), (last.y - first.y));
        const nearClosed = endDist <= Math.max(2, diag * 0.025);
        const closedEff = !!(e && e.closed) || nearClosed;
        if (closedEff && state.view.autoCloseContours && (!e.closed) && nearClosed) {
          const np = pts.slice();
          np.push({ x: first.x, y: first.y });
          return {
            entity: { ...e, points: np, closed: true, smartClosed: true, smartCloseBridge: { from: { ...last }, to: { ...first }, dist: endDist } },
            closedEff: true,
            bbox: { minX, minY, maxX, maxY, width: w, height: h },
            area: w * h,
            smartClosed: true
          };
        }
        const bbox = { minX, minY, maxX, maxY, width: w, height: h };
        if (!closedEff && state.view.smartCloseGaps && pts.length >= 3) {
          const tolAbs = Math.max(2, Number(state.view.gapTolerance || 40));
          const tolRel = Math.max(2, diag * 0.08);
          const tol = Math.max(tolAbs, tolRel);
          const maxBridge = Math.max(tolAbs, Math.min(Math.max(w, h) * 0.3, (w + h) * 0.35));
          if (endDist <= tol && endDist <= maxBridge && !bridgeIntersectsTooMuch(pts, last, first)) {
            const np = pts.slice();
            np.push({ x: first.x, y: first.y });
            return {
              entity: { ...e, points: np, closed: true, smartClosed: true, smartCloseBridge: { from: { ...last }, to: { ...first }, dist: endDist } },
              closedEff: true,
              bbox,
              noisy: contourLooksNoisy(np, bbox),
              area: w * h,
              smartClosed: true
            };
          }
        }
        return {
          entity: e,
          closedEff,
          bbox,
          noisy: contourLooksNoisy(pts, bbox),
          area: w * h,
          smartClosed: false
        };
      }

      const normalized = src.map(normEntity);
      stats.smartClosed = normalized.filter((x) => x.smartClosed === true).length;
      if (!state.view.majorContoursOnly) {
        stats.shown = src.length;
        state.filterStats = stats;
        return src;
      }

      const modeAll = String(state.view.partsMode || "main") === "all";
      const compactZprj = previewSourceType === "zprj" && state.view.zprjCompactView === true;
      const minPointsUser = Math.max(4, Number(state.view.minContourPoints || 0));
      const maxContoursUser = Math.max(10, Number(state.view.maxContours || 0));
      const minPointsBase = modeAll ? Math.min(minPointsUser, 12) : minPointsUser;
      const maxContoursBase = modeAll ? Math.max(maxContoursUser, 400) : maxContoursUser;
      const minPoints = compactZprj ? Math.max(minPointsBase, 24) : minPointsBase;
      const maxContours = compactZprj ? Math.min(maxContoursBase, 80) : maxContoursBase;
      const rejectNoisy = compactZprj ? true : (modeAll ? false : !!state.view.rejectNoisyContours);
      const minWidthHeight = modeAll ? 3 : 8;
      const scored = [];
      for (const n of normalized) {
        const e = n.entity;
        const pts = Array.isArray(e && e.points) ? e.points : [];
        const isClosed = !!n.closedEff;
        if (rejectNoisy && n.noisy) { stats.noisy++; continue; }
        if (state.view.closedContoursOnly && !isClosed) { stats.open++; continue; }
        const requiredPoints = isClosed ? minPoints : Math.round(minPoints * 1.6);
        if (pts.length < requiredPoints) { stats.minPoints++; continue; }
        const b = n.bbox;
        if (!b) continue;
        if (b.width < minWidthHeight || b.height < minWidthHeight) { stats.tooSmall++; continue; }
        const score = n.area + pts.length * 10 + (isClosed ? 1000000 : 0);
        scored.push({ e, score, bbox: b });
      }
      scored.sort((a, b) => b.score - a.score);
      const dedup = [];
      const out = [];
      for (const s of scored) {
        const b = s.bbox;
        const dup = dedup.some((d) =>
          Math.abs(d.minX - b.minX) < 3 &&
          Math.abs(d.minY - b.minY) < 3 &&
          Math.abs(d.maxX - b.maxX) < 3 &&
          Math.abs(d.maxY - b.maxY) < 3
        );
        if (dup) { stats.dedup++; continue; }
        dedup.push(b);
        out.push(s.e);
        if (out.length >= maxContours) {
          stats.capped = Math.max(0, scored.length - out.length - stats.dedup);
          break;
        }
      }
      if (out.length === 0 && src.length > 0) {
        // Safety fallback: never show an empty canvas when geometry exists but filters are too strict.
        stats.fallbackRaw = 1;
        stats.shown = src.length;
        state.filterStats = stats;
        return src;
      }
      stats.shown = out.length;
      state.filterStats = stats;
      return out;
    }

    function computeDetailsFromEntities(entities, nameCandidates) {
      const detailCandidates = [];
      for (const e of entities) {
        const pts = Array.isArray(e.points) ? e.points : [];
        if (pts.length < 10) continue;
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const p of pts) {
          if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) continue;
        const width = maxX - minX;
        const height = maxY - minY;
        const area = width * height;
        if (width < 15 || height < 15 || area < 400) continue;
        detailCandidates.push({ entity: e, bbox: { minX, minY, maxX, maxY, width, height }, area, points: pts.length });
      }

      detailCandidates.sort((a, b) => b.area - a.area);
      const dedup = [];
      for (const d of detailCandidates) {
        const isDup = dedup.some((x) =>
          Math.abs(x.bbox.minX - d.bbox.minX) < 4 &&
          Math.abs(x.bbox.minY - d.bbox.minY) < 4 &&
          Math.abs(x.bbox.maxX - d.bbox.maxX) < 4 &&
          Math.abs(x.bbox.maxY - d.bbox.maxY) < 4
        );
        if (!isDup) dedup.push(d);
      }

      return dedup.slice(0, 400).map((d, i) => ({
        id: i + 1,
        name: `Р”РµС‚Р°Р»СЊ ${i + 1}`,
        bbox: d.bbox,
        area: d.area,
        points: d.points,
        entity: d.entity
      }));
    }

    function fitBBoxToView(bbox) {
      if (!bbox) return;
      const m = 24;
      const w = Math.max(1, Number(bbox.width || 0));
      const h = Math.max(1, Number(bbox.height || 0));
      const s = Math.max(0.05, Math.min((W - 2 * m) / w, (H - 2 * m) / h));
      state.viewport.scale = s;
      state.viewport.offsetX = m - bbox.minX * s + (W - 2 * m - w * s) / 2;
      state.viewport.offsetY = m - bbox.minY * s + (H - 2 * m - h * s) / 2;
    }

    function fitPointsToView(points) {
      const pts = Array.isArray(points) ? points : [];
      if (pts.length < 2) return;
      const bb = polygonBBox(pts);
      if (
        !bb ||
        !Number.isFinite(bb.minX) || !Number.isFinite(bb.minY) ||
        !Number.isFinite(bb.maxX) || !Number.isFinite(bb.maxY)
      ) return;
      fitBBoxToView(bb);
    }

    const segmentIntersectionGlobal = (...a) => window.FurLabUtils.segmentIntersectionGlobal(...a);

    function closeSelectedGapConservative() {
      const selected = state.details.find((d) => d.id === state.selectedDetailId);
      if (!selected || !selected.entity) {
        byId("workspaceInfo").textContent = "No selected detail to close. Select detail first.";
        return;
      }
      const e = selected.entity;
      const pts = Array.isArray(e.points) ? e.points : [];
      if (pts.length < 4) {
        byId("workspaceInfo").textContent = "Selected contour is too short.";
        return;
      }
      const first = pts[0];
      const last = pts[pts.length - 1];
      const endDist = Math.hypot(last.x - first.x, last.y - first.y);
      const alreadyClosed = endDist <= 1e-6;
      if (alreadyClosed || e.closed === true) {
        byId("workspaceInfo").textContent = "Selected contour is already closed.";
        return;
      }

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const diag = Math.hypot(w, h);
      // Force mode requested: connect ends regardless of gap/intersections.

      const np = pts.slice();
      np.push({ x: first.x, y: first.y });
      e.points = np;
      e.closed = true;
      e.smartCloseBridge = { from: { ...last }, to: { ...first }, dist: endDist, manual: true };
      renderScene();
      byId("workspaceInfo").textContent = `Selected contour force-closed (gap=${endDist.toFixed(2)}).`;
    }

    function initZonesFromDetails() {
      if (!Array.isArray(state.details) || state.details.length === 0) {
        state.zones = [];
        state.selectedZoneId = null;
        state.selectedFragmentId = null;
        state.nextZoneId = 1;
        return;
      }
      const newZones = [];
      let zid = 1;
      for (const d of state.details) {
        const e = d && d.entity;
        const pts = Array.isArray(e && e.points) ? e.points : [];
        if (pts.length < 3) continue;
        newZones.push({
          id: zid,
          name: `Р—РѕРЅР° ${zid}`,
          detailId: d.id,
          materialId: null,
          materialName: null,
          napDirectionDeg: DEFAULT_NAP_DIRECTION_DEG,
          originType: "base",
          parentZoneId: null,
          points: pts.map((p) => ({ x: p.x, y: p.y }))
        });
        zid++;
      }
      state.zones = newZones;
      state.nextZoneId = zid;
      state.selectedZoneId = newZones.length ? newZones[0].id : null;
      state.selectedFragmentId = null;
      if (newZones.length) state.selectedDetailId = Number(newZones[0].detailId || state.selectedDetailId || 1);
      if (typeof updateProjectUi === "function") updateProjectUi();
    }

    function reconcileZonesWithDetails(zones) {
      const list = Array.isArray(zones) ? zones.map((zone) => ({ ...zone, points: Array.isArray(zone && zone.points) ? zone.points.map((p) => ({ x: p.x, y: p.y })) : [] })) : [];
      const details = Array.isArray(state.details) ? state.details : [];
      if (!details.length) return list;
      const coveredDetailIds = new Set(list.map((zone) => Number(zone && zone.detailId || 0)).filter((id) => id > 0));
      let nextId = list.reduce((maxId, zone) => Math.max(maxId, Number(zone && zone.id || 0)), 0) + 1;
      for (const detail of details) {
        const detailId = Number(detail && detail.id || 0) || 0;
        if (detailId <= 0 || coveredDetailIds.has(detailId)) continue;
        const pts = Array.isArray(detail && detail.entity && detail.entity.points) ? detail.entity.points : [];
        if (pts.length < 3) continue;
        list.push({
          id: nextId,
          name: `???? ${nextId}`,
          detailId,
          materialId: null,
          materialName: null,
          napDirectionDeg: DEFAULT_NAP_DIRECTION_DEG,
          originType: 'base',
          parentZoneId: null,
          parentZoneSnapshot: null,
          points: pts.map((p) => ({ x: p.x, y: p.y }))
        });
        coveredDetailIds.add(detailId);
        nextId += 1;
      }
      return list;
    }

    function normalizeZoneForPersistence(zone) {
      if (!zone || typeof zone !== "object") return null;
      const id = Number(zone.id);
      const detailId = Number(zone.detailId);
      const points = (Array.isArray(zone.points) ? zone.points : [])
        .map((p) => ({ x: Number(p && p.x), y: Number(p && p.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(detailId) || detailId <= 0 || points.length < 3) return null;
      return {
        id,
        name: String(zone.name || `Р—РѕРЅР° ${id}`),
        detailId,
        materialId: zone.materialId !== undefined && zone.materialId !== null && String(zone.materialId).trim()
          ? String(zone.materialId).trim()
          : null,
        materialName: zone.materialName !== undefined && zone.materialName !== null && String(zone.materialName).trim()
          ? String(zone.materialName).trim()
          : null,
        napDirectionDeg: Number.isFinite(Number(zone.napDirectionDeg)) ? Number(zone.napDirectionDeg) : DEFAULT_NAP_DIRECTION_DEG,
        originType: ["base", "split", "manual"].includes(String(zone.originType || "").trim().toLowerCase())
          ? String(zone.originType || "").trim().toLowerCase()
          : "base",
        parentZoneId: Number(zone.parentZoneId || 0) || null,
        parentZoneSnapshot: zone.parentZoneSnapshot && typeof zone.parentZoneSnapshot === "object"
          ? {
              id: Number(zone.parentZoneSnapshot.id || 0) || null,
              name: String(zone.parentZoneSnapshot.name || ""),
              detailId: Number(zone.parentZoneSnapshot.detailId || 0) || null,
              materialId: zone.parentZoneSnapshot.materialId !== undefined && zone.parentZoneSnapshot.materialId !== null && String(zone.parentZoneSnapshot.materialId).trim()
                ? String(zone.parentZoneSnapshot.materialId).trim()
                : null,
              materialName: zone.parentZoneSnapshot.materialName !== undefined && zone.parentZoneSnapshot.materialName !== null && String(zone.parentZoneSnapshot.materialName).trim()
                ? String(zone.parentZoneSnapshot.materialName).trim()
                : null,
              napDirectionDeg: Number.isFinite(Number(zone.parentZoneSnapshot.napDirectionDeg))
                ? Number(zone.parentZoneSnapshot.napDirectionDeg)
                : DEFAULT_NAP_DIRECTION_DEG,
              originType: ["base", "split", "manual"].includes(String(zone.parentZoneSnapshot.originType || "").trim().toLowerCase())
                ? String(zone.parentZoneSnapshot.originType || "").trim().toLowerCase()
                : "base",
              parentZoneId: Number(zone.parentZoneSnapshot.parentZoneId || 0) || null,
              points: (Array.isArray(zone.parentZoneSnapshot.points) ? zone.parentZoneSnapshot.points : [])
                .map((p) => ({ x: Number(p && p.x), y: Number(p && p.y) }))
                .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
            }
          : null,
        points
      };
    }

    // ---------------------------------------------------------------------------
    // Zones persistence — delegated to window.FurLabZonesPersistence (core/zones-persistence.js)
    // ---------------------------------------------------------------------------
    if (window.FurLabZonesPersistence) window.FurLabZonesPersistence.init({
      state,
      api,
      normalizeZoneForPersistence,
      reconcileZonesWithDetails,
      migrateLoadedZoneOriginTypes: (zones) => migrateLoadedZoneOriginTypes(zones),
      ensureProjectMaterialEntry,
      loadFurMaterialDetails,
      initZonesFromDetails,
      clearActiveLayoutRuntime,
      render: { renderScene: () => renderScene(), renderLayoutModeSwitch: () => renderLayoutModeSwitch(), renderDetailZoneTree: () => renderDetailZoneTree(), renderPropertyEditor: () => renderPropertyEditor() },
    });
    const buildZonesWorkspaceKey = () => window.FurLabZonesPersistence ? window.FurLabZonesPersistence.buildZonesWorkspaceKey() : "";
    const buildZoneValidationPayload = () => window.FurLabZonesPersistence ? window.FurLabZonesPersistence.buildZoneValidationPayload() : {};
    const validateZonesForCurrentWorkspace = () => window.FurLabZonesPersistence ? window.FurLabZonesPersistence.validateZonesForCurrentWorkspace() : Promise.resolve();
    const persistZonesForCurrentWorkspace = () => window.FurLabZonesPersistence ? window.FurLabZonesPersistence.persistZonesForCurrentWorkspace() : Promise.resolve();
    const loadZonesForCurrentWorkspace = (opts) => window.FurLabZonesPersistence ? window.FurLabZonesPersistence.loadZonesForCurrentWorkspace(opts) : Promise.resolve();
    const resetZonesForCurrentWorkspace = () => window.FurLabZonesPersistence ? window.FurLabZonesPersistence.resetZonesForCurrentWorkspace() : Promise.resolve();

    // ---------------------------------------------------------------------------
    // Materials catalog — delegated to window.FurLabMaterials (core/materials.js)
    // ---------------------------------------------------------------------------
    if (window.FurLabMaterials) window.FurLabMaterials.init({
      state,
      api,
      renderPropertyEditor: () => renderPropertyEditor(),
    });
    const loadMaterialsDict = (f) => window.FurLabMaterials ? window.FurLabMaterials.loadMaterialsDict(f) : Promise.resolve([]);
    const loadFurMaterialsCatalog = (f) => window.FurLabMaterials ? window.FurLabMaterials.loadFurMaterialsCatalog(f) : Promise.resolve([]);
    const loadFurMaterialDetails = (id, f) => window.FurLabMaterials ? window.FurLabMaterials.loadFurMaterialDetails(id, f) : Promise.resolve(null);
    const getFurMaterialById = (id) => window.FurLabMaterials ? window.FurLabMaterials.getFurMaterialById(id) : null;
    const ensureProjectMaterialEntry = (m) => window.FurLabMaterials ? window.FurLabMaterials.ensureProjectMaterialEntry(m) : null;

    async function removeProjectMaterialById(materialId) {
      const id = String(materialId || "").trim();
      if (!id) return false;
      const assignedZones = (Array.isArray(state.zones) ? state.zones : []).filter((zone) => String(zone && zone.materialId || "").trim() === id);
      const material = getFurMaterialById(id) || (Array.isArray(state.projectMaterials) ? state.projectMaterials.find((item) => String(item && item.id || "") === id) : null) || null;
      const materialName = String(material && (material.name || material.materialName) || id);
      if (assignedZones.length > 0) {
        const ok = window.confirm(`РњРµС… "${materialName}" РЅР°Р·РЅР°С‡РµРЅ ${assignedZones.length} Р·РѕРЅ(Р°Рј). РЎРЅСЏС‚СЊ РЅР°Р·РЅР°С‡РµРЅРёРµ Рё СѓРґР°Р»РёС‚СЊ РµРіРѕ РёР· РїСЂРѕРµРєС‚Р°?`);
        if (!ok) return false;
        for (const zone of assignedZones) {
          const json = await assignMaterialToZone(zone, { id: null, name: null });
          if (!json || !json.ok) {
            byId("workspaceInfo").textContent = `РћС€РёР±РєР° СЃРЅСЏС‚РёСЏ РјР°С‚РµСЂРёР°Р»Р° СЃ Р·РѕРЅС‹: ${String(json && json.error || "unknown")}`;
            return false;
          }
        }
      }
      state.projectMaterials = (Array.isArray(state.projectMaterials) ? state.projectMaterials : []).filter((item) => String(item && item.id || "") !== id);
      if (state.furMaterialDetailsById && typeof state.furMaterialDetailsById === "object") {
        delete state.furMaterialDetailsById[id];
      }
      if (String(state.selectedMaterialId || "") === id) {
        const next = Array.isArray(state.projectMaterials) && state.projectMaterials.length > 0 ? state.projectMaterials[0] : null;
        state.selectedMaterialId = String(next && next.id || "");
      }
      renderDetailZoneTree();
      renderPropertyEditor();
      renderScene();
      byId("workspaceInfo").textContent = `РњРµС… СѓРґР°Р»С‘РЅ РёР· РїСЂРѕРµРєС‚Р°: ${materialName}`;
      return true;
    }

    async function assignMaterialToZone(zone, material) {
      const z = zone && typeof zone === "object" ? zone : null;
      if (!z) return { ok: false, error: "zone_required" };
      const workspaceKey = buildZonesWorkspaceKey();
      if (!workspaceKey) return { ok: false, error: "zones_workspace_missing" };
      const materialId = material && material.id !== undefined && material.id !== null && String(material.id).trim()
        ? String(material.id).trim()
        : null;
      const materialName = material && material.name !== undefined && material.name !== null && String(material.name).trim()
        ? String(material.name).trim()
        : null;
      const zoneId = Number(z.id || 0) || 0;
      if (zoneId > 0 && z.materialId && Array.isArray(state.layouts)) {
        const hasFragments = state.layouts.some(
          (le) => isFragmentOnlyLayoutMode(String(le && le.mode || "")) &&
            Number(le.boundZoneId || 0) === zoneId &&
            Array.isArray(le.layoutRun && le.layoutRun.fragments) &&
            le.layoutRun.fragments.length > 0
        );
        if (hasFragments) {
          if (!confirm("РњР°С‚РµСЂРёР°Р» РјРµС…Р° РёР·РјРµРЅС‘РЅ. Р¤СЂР°РіРјРµРЅС‚С‹ РІС‹РєР»Р°РґРєРё Р±СѓРґСѓС‚ РїРµСЂРµСЃС‡РёС‚Р°РЅС‹. РџСЂРѕРґРѕР»Р¶РёС‚СЊ?")) {
            return { ok: false, error: "cancelled_by_user" };
          }
        }
      }
      const json = await api(`/api/project/zones/${encodeURIComponent(String(Number(z.id || 0) || 0))}/material`, "POST", {
        workspaceKey,
        materialId,
        materialName
      }, 20000);
        if (json && json.ok) {
          const targetZone = state.zones.find((z2) => Number(z2 && z2.id || 0) === zoneId);
          if (targetZone) {
            targetZone.materialId = materialId || undefined;
            targetZone.materialName = materialName || undefined;
          }
          if (materialId) ensureProjectMaterialEntry({ id: materialId, name: materialName });
          const changedZoneId = Number(z.id || 0) || 0;
          if (changedZoneId > 0 && Array.isArray(state.layouts)) {
            for (const le of state.layouts) {
              if (isFragmentOnlyLayoutMode(String(le && le.mode || "")) && Number(le.boundZoneId || 0) === changedZoneId) {
                le.isDirty = true;
              }
            }
          }
          await validateZonesForCurrentWorkspace();
          renderDetailZoneTree();
          renderPropertyEditor();
        renderScene();
        const assignedName = materialName || materialId || "РЅРµ РІС‹Р±СЂР°РЅ";
        byId("workspaceInfo").textContent = materialId
          ? `РњР°С‚РµСЂРёР°Р» РЅР°Р·РЅР°С‡РµРЅ Р·РѕРЅРµ: ${assignedName}`
          : "РњР°С‚РµСЂРёР°Р» Р·РѕРЅС‹ СЃРЅСЏС‚.";
      }
      return json;
    }

    async function openMaterialLibrary(zone) {
      state.libraryPickerMode = "materials";
      state.pendingZoneMaterialZoneId = zone && typeof zone === "object"
        ? (Number(zone.id || 0) || null)
        : null;
      await loadFurMaterialsCatalog();
      if (layoutTypePicker && typeof layoutTypePicker.open === "function") {
        layoutTypePicker.open();
        return;
      }
      byId("layoutTypeBackdrop").style.display = "flex";
    }

    async function addMaterialById(materialId) {
      const id = String(materialId || "").trim();
      if (!id) return;
      const catalog = await loadFurMaterialsCatalog();
      const material = catalog.find((item) => String(item.id || "") === id) || { id, name: id };
      ensureProjectMaterialEntry(material);
      state.selectedMaterialId = id;
      await loadFurMaterialDetails(id);
      const zoneId = Number(state.pendingZoneMaterialZoneId || state.selectedZoneId || 0) || 0;
      if (zoneId > 0) {
        const zone = state.zones.find((item) => Number(item && item.id || 0) === zoneId) || null;
        if (zone) {
          const conflictZone = (Array.isArray(state.zones) ? state.zones : []).find((z) =>
            z && Number(z.id || 0) !== zoneId && String(z.materialId || "").trim() === id
          );
          if (conflictZone) {
            const conflictName = String(conflictZone.name || `Р—РѕРЅР° ${conflictZone.id}`);
            byId("workspaceInfo").textContent = `РњРµС… СѓР¶Рµ РЅР°Р·РЅР°С‡РµРЅ Р·РѕРЅРµ "${conflictName}". РћРґРёРЅ РјРµС… вЂ” РѕРґРЅР° Р·РѕРЅР°.`;
            closeLayoutTypePicker();
            return;
          }
          const json = await assignMaterialToZone(zone, material);
          if (!json || !json.ok) {
            byId("workspaceInfo").textContent = `РћС€РёР±РєР° РЅР°Р·РЅР°С‡РµРЅРёСЏ РјР°С‚РµСЂРёР°Р»Р°: ${String(json && json.error || "unknown")}`;
            return;
          }
        }
      }
      state.uiPanel = "materials";
      renderLayoutModeSwitch();
      renderDetailZoneTree();
      renderPropertyEditor();
    }

    function openZoneMaterialModal(zone, items) {
      const z = zone && typeof zone === "object" ? zone : null;
      const list = Array.isArray(items) ? items : [];
      if (!z) return;
      const backdrop = byId("zoneMaterialBackdrop");
      const title = byId("zoneMaterialTitle");
      const info = byId("zoneMaterialInfo");
      const select = byId("zoneMaterialSelect");
      if (!backdrop || !title || !info || !select) return;
      title.textContent = `РњРµС…РѕРІРѕР№ РјР°С‚РµСЂРёР°Р»: ${String(z.name || `Р—РѕРЅР° ${z.id}`)}`;
      info.textContent = list.length
        ? `РќР°Р№РґРµРЅРѕ РјР°С‚РµСЂРёР°Р»РѕРІ: ${list.length}`
        : "РњР°С‚РµСЂРёР°Р»С‹ РІ Р±Р°Р·Рµ РЅРµ РЅР°Р№РґРµРЅС‹.";
      select.innerHTML = [`<option value="">РќРµ РЅР°Р·РЅР°С‡РµРЅ</option>`]
        .concat(list.map((item) => {
          const label = item.piecesCount > 0
            ? `${escapeHtml(item.name || item.id)} (${Number(item.piecesCount)} С€С‚.)`
            : `${escapeHtml(item.name || item.id)}`;
          return `<option value="${escapeHtml(item.id)}">${label}</option>`;
        }))
        .join("");
      select.value = String(z.materialId || "");
      state.pendingZoneMaterialZoneId = Number(z.id || 0) || null;
      backdrop.style.display = "flex";
    }

    function closeZoneMaterialModal() {
      const backdrop = byId("zoneMaterialBackdrop");
      if (backdrop) backdrop.style.display = "none";
      state.pendingZoneMaterialZoneId = null;
    }

    // ---------------------------------------------------------------------------
    // Zone classification — delegated to window.FurLabZoneClassify (core/zone-classify.js)
    // ---------------------------------------------------------------------------
    if (window.FurLabZoneClassify) window.FurLabZoneClassify.init({ state });
    const getDetailContourPoints = (id) => window.FurLabZoneClassify ? window.FurLabZoneClassify.getDetailContourPoints(id) : [];
    const pointsMatchExactly = (a, b, tol) => window.FurLabZoneClassify ? window.FurLabZoneClassify.pointsMatchExactly(a, b, tol) : false;
    const isLikelyBaseZone = (z) => window.FurLabZoneClassify ? window.FurLabZoneClassify.isLikelyBaseZone(z) : false;
    const isLegacyManualZone = (z) => window.FurLabZoneClassify ? window.FurLabZoneClassify.isLegacyManualZone(z) : false;
    const migrateLoadedZoneOriginTypes = (zones) => window.FurLabZoneClassify ? window.FurLabZoneClassify.migrateLoadedZoneOriginTypes(zones) : false;
    const isSplitDerivedZone = (z) => window.FurLabZoneClassify ? window.FurLabZoneClassify.isSplitDerivedZone(z) : false;
    const isManualZone = (z) => window.FurLabZoneClassify ? window.FurLabZoneClassify.isManualZone(z) : false;
    const getRelatedSplitZones = (z) => window.FurLabZoneClassify ? window.FurLabZoneClassify.getRelatedSplitZones(z) : [];
    const hasSplitDescendants = (z) => window.FurLabZoneClassify ? window.FurLabZoneClassify.hasSplitDescendants(z) : false;
    const canRestoreParentZone = (z) => window.FurLabZoneClassify ? window.FurLabZoneClassify.canRestoreParentZone(z) : false;
    const isLastZoneInDetail = (z) => window.FurLabZoneClassify ? window.FurLabZoneClassify.isLastZoneInDetail(z) : false;
    const canDeleteZone = (z) => window.FurLabZoneClassify ? window.FurLabZoneClassify.canDeleteZone(z) : false;

    let zoneContextMenuEl = null;

    function ensureZoneContextMenu() {
      if (zoneContextMenuEl && zoneContextMenuEl.isConnected) return zoneContextMenuEl;
      const menu = document.createElement("div");
      menu.className = "zone-context-menu";
      menu.setAttribute("role", "menu");
      document.body.appendChild(menu);
      const hide = (e) => {
        if (!menu.classList.contains("open")) return;
        if (e && menu.contains(e.target)) return;
        hideZoneContextMenu();
      };
      document.addEventListener("mousedown", hide, true);
      document.addEventListener("scroll", () => hideZoneContextMenu(), true);
      document.addEventListener("keydown", (e) => {
        if (String(e && e.key || "") === "Escape") hideZoneContextMenu();
      });
      zoneContextMenuEl = menu;
      return menu;
    }

    function hideZoneContextMenu() {
      const menu = zoneContextMenuEl;
      if (!menu) return;
      menu.classList.remove("open");
      menu.style.left = "-9999px";
      menu.style.top = "-9999px";
      menu.innerHTML = "";
    }

    function selectZoneForEditing(zone) {
      const z = zone && typeof zone === "object" ? zone : null;
      if (!z) return;
      state.selectedZoneId = Number(z.id || 0) || null;
      state.selectedDetailId = Number(z.detailId || state.selectedDetailId || 0) || state.selectedDetailId;
      state.selectedFragmentId = null;
      setWorkspaceTool("edit-vertex", { skipRender: true });
      fitPointsToView(z.points);
      renderScene();
      renderDetailZoneTree();
      renderPropertyEditor();
    }

    async function deleteZoneEntry(zone, options) {
      const z = zone && typeof zone === "object" ? zone : null;
      if (!z) return false;
      const zoneId = Number(z.id || 0) || 0;
      if (zoneId <= 0) return false;
      if (!canDeleteZone(z)) {
        byId("workspaceInfo").textContent = isLastZoneInDetail(z)
          ? "Р‘Р°Р·РѕРІСѓСЋ Р·РѕРЅСѓ РґРµС‚Р°Р»Рё СѓРґР°Р»СЏС‚СЊ РЅРµР»СЊР·СЏ."
          : isSplitDerivedZone(z)
            ? "РќРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ СЌС‚Рѕ СЂР°Р·Р±РёРµРЅРёРµ, РїРѕРєР° СЃСѓС‰РµСЃС‚РІСѓСЋС‚ РґРѕС‡РµСЂРЅРёРµ Р·РѕРЅС‹ Р±РѕР»РµРµ РіР»СѓР±РѕРєРѕРіРѕ СѓСЂРѕРІРЅСЏ."
            : "Р­С‚Сѓ Р·РѕРЅСѓ СЃРµР№С‡Р°СЃ РЅРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ.";
        return false;
      }
      const isManual = isManualZone(z);
      const relatedSplitZones = isManual ? [] : getRelatedSplitZones(z);
      const affectedZoneIds = new Set(relatedSplitZones.map((item) => Number(item && item.id || 0)).filter((id) => id > 0));
      affectedZoneIds.add(zoneId);
      const dependentLayouts = (Array.isArray(state.layouts) ? state.layouts : []).filter((entry) => affectedZoneIds.has(Number(entry && entry.boundZoneId || 0)));
      const parentZoneName = String(z && z.parentZoneSnapshot && z.parentZoneSnapshot.name || `Р—РѕРЅР° ${Number(z.parentZoneId || 0) || ""}`).trim();
      const message = isManual
        ? (dependentLayouts.length
          ? `РЈРґР°Р»РёС‚СЊ Р·РѕРЅСѓ "${String(z.name || `Р—РѕРЅР° ${zoneId}`)}"? РЎРІСЏР·Р°РЅРЅС‹Рµ РІС‹РєР»Р°РґРєРё (${dependentLayouts.length}) Р±СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹.`
          : `РЈРґР°Р»РёС‚СЊ Р·РѕРЅСѓ "${String(z.name || `Р—РѕРЅР° ${zoneId}`)}"?`)
        : (dependentLayouts.length
          ? `РћС‚РјРµРЅРёС‚СЊ СЂР°Р·Р±РёРµРЅРёРµ Рё РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ "${parentZoneName}"? РЎРІСЏР·Р°РЅРЅС‹Рµ РІС‹РєР»Р°РґРєРё (${dependentLayouts.length}) Р±СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹.`
          : `РћС‚РјРµРЅРёС‚СЊ СЂР°Р·Р±РёРµРЅРёРµ Рё РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ "${parentZoneName}"?`);
      const skipConfirm = options && options.skipConfirm;
      if (!skipConfirm && typeof window.confirm === "function" && !window.confirm(message)) return false;
      hideZoneContextMenu();
      // Silently remove dependent layouts without intermediate renders
      for (const entry of dependentLayouts.slice()) {
        if (entry.persistedRunId) {
          const res = await api("/api/layout/manual/runs/delete", "POST", { id: entry.persistedRunId });
          const notFound = String(res && res.error || "") === "not_found";
          if (res && !res.ok && !notFound) {
            byId("workspaceInfo").textContent = `РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ РІС‹РєР»Р°РґРєРё: ${String(res && res.error || "unknown")}`;
            return false;
          }
        }
        state.layouts = state.layouts.filter((x) => Number(x.id) !== Number(entry.id));
      }
      // If the currently selected layout was removed, clear the runtime and pick next
      const selectedStillExists = state.layouts.some((x) => Number(x.id) === Number(state.selectedLayoutId || 0));
      if (!selectedStillExists) {
        state.selectedLayoutId = state.layouts.length ? state.layouts[0].id : null;
        clearActiveLayoutRuntime();
      }
      const workspaceKey = buildZonesWorkspaceKey();
      const json = await api("/api/zones/delete", "POST", { workspaceKey, zoneId }, 20000);
      if (!json || !json.ok) {
        byId("workspaceInfo").textContent = `РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ Р·РѕРЅС‹: ${String(json && json.error || "unknown")}`;
        return false;
      }
      const savedZones = Array.isArray(json.zones) ? json.zones : [];
      state.zones = savedZones;
      state.nextZoneId = savedZones.reduce((maxId, item) => Math.max(maxId, Number(item && item.id || 0)), 0) + 1;
      if (!savedZones.some((item) => Number(item && item.id || 0) === Number(state.selectedZoneId || 0))) {
        const sibling = savedZones.find((item) => Number(item && item.detailId || 0) === Number(z.detailId || 0)) || savedZones[0] || null;
        state.selectedZoneId = Number(sibling && sibling.id || 0) || null;
        state.selectedDetailId = Number(sibling && sibling.detailId || z.detailId || state.selectedDetailId || 0) || state.selectedDetailId;
      }
      state.selectedFragmentId = null;
      await validateZonesForCurrentWorkspace();
      const restoredZone = isManual
        ? (savedZones.find((item) => Number(item && item.detailId || 0) === Number(z.detailId || 0)) || null)
        : (savedZones.find((item) => Number(item && item.id || 0) === Number(z.parentZoneId || 0))
          || savedZones.find((item) => Number(item && item.detailId || 0) === Number(z.detailId || 0))
          || null);
      if (restoredZone) {
        state.selectedZoneId = Number(restoredZone.id || 0) || state.selectedZoneId;
        state.selectedDetailId = Number(restoredZone.detailId || 0) || state.selectedDetailId;
      }
      byId("workspaceInfo").textContent = isManual
        ? `Р—РѕРЅР° СѓРґР°Р»РµРЅР°: ${String(z.name || `Р—РѕРЅР° ${zoneId}`)}`
        : `Р Р°Р·Р±РёРµРЅРёРµ РѕС‚РјРµРЅРµРЅРѕ. Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅР° Р·РѕРЅР°: ${String(restoredZone && restoredZone.name || parentZoneName || `Р—РѕРЅР° ${Number(z.parentZoneId || 0) || ""}`)}`;
      state.uiPanel = "zones";
      renderLayoutModeSwitch();
      renderDetailZoneTree();
      renderPropertyEditor();
      renderScene();
      return true;
    }

    async function applyIntarsiaFragmentsToZone(zoneId) {
      const zone = state.zones.find((z) => Number(z && z.id || 0) === Number(zoneId || 0));
      if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) {
        byId("workspaceInfo").textContent = "Р—РѕРЅР° РЅРµ РЅР°Р№РґРµРЅР°";
        return;
      }
      const fragments = Array.isArray(state.intarsiaSvgFragments) ? state.intarsiaSvgFragments : [];
      if (fragments.length === 0) {
        byId("workspaceInfo").textContent = "РќРµС‚ С„СЂР°РіРјРµРЅС‚РѕРІ РґР»СЏ РїСЂРёРјРµРЅРµРЅРёСЏ";
        return;
      }
      byId("workspaceInfo").textContent = "Р Р°Р·Р±РёРµРЅРёРµ Р·РѕРЅС‹вЂ¦";
      const res = await api("/api/intarsia/apply-fragments", "POST", {
        zonePoints: zone.points,
        fragments: fragments.map((f) => ({ points: f.points }))
      });
      if (!res || !res.ok) {
        byId("workspaceInfo").textContent = `РћС€РёР±РєР°: ${String(res && res.error || "unknown")}`;
        return;
      }
      console.log("[intarsia-fragments] api res:", { subZones: (res.subZones||[]).length, remainderZones: (res.remainderZones||[]).length, fragments: fragments.length, zonePoints: zone.points.length, zoneId: zone.id });
      const detailId = Number(zone.detailId || state.selectedDetailId || 0) || null;
      const parentSnapshot = {
        id: zone.id,
        name: String(zone.name || `Р—РѕРЅР° ${zone.id}`),
        detailId: Number(zone.detailId || 0) || null,
        materialId: zone.materialId !== undefined && zone.materialId !== null && String(zone.materialId).trim() ? String(zone.materialId).trim() : null,
        materialName: zone.materialName !== undefined && zone.materialName !== null && String(zone.materialName).trim() ? String(zone.materialName).trim() : null,
        napDirectionDeg: normalizeDeg(zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG),
        originType: ["base", "split", "manual"].includes(String(zone.originType || "").trim().toLowerCase()) ? String(zone.originType || "").trim().toLowerCase() : "base",
        parentZoneId: Number(zone.parentZoneId || 0) || null,
        points: zone.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
      };
      let firstNewZoneId = null;
      // Create sub-zones for each fragment clipped to zone (skipPersist to avoid race condition)
      for (const sz of (res.subZones || [])) {
        if (Array.isArray(sz.points) && sz.points.length >= 3) {
          const idBefore = state.nextZoneId;
          createZoneFromPoints(sz.points, { detailId, originType: "split", parentZoneId: zone.id, parentZoneSnapshot: parentSnapshot, skipPersist: true });
          if (!firstNewZoneId && state.nextZoneId > idBefore) firstNewZoneId = idBefore;
        }
      }
      // Create remainder zone(s)
      for (const rz of (res.remainderZones || [])) {
        if (Array.isArray(rz.points) && rz.points.length >= 3) {
          const idBefore = state.nextZoneId;
          createZoneFromPoints(rz.points, { detailId, originType: "split", parentZoneId: zone.id, parentZoneSnapshot: parentSnapshot, skipPersist: true });
          if (!firstNewZoneId && state.nextZoneId > idBefore) firstNewZoneId = idBefore;
        }
      }
      // Rebind intarsia layout to first new sub-zone before removing original
      if (firstNewZoneId) {
        const intarsiaEntry = (Array.isArray(state.layouts) ? state.layouts : [])
          .find((e) => String(e && e.mode || "") === "intarsia" && Number(e && e.boundZoneId || 0) === Number(zone.id || 0));
        if (intarsiaEntry) {
          intarsiaEntry.boundZoneId = firstNewZoneId;
          state.layoutRun.selectedZoneId = firstNewZoneId;
        }
      }
      // Remove original zone directly вЂ” it's a base zone so deleteZoneEntry would refuse it
      const origId = Number(zone.id || 0);
      state.zones = (Array.isArray(state.zones) ? state.zones : []).filter((z) => Number(z && z.id || 0) !== origId);
      state.nextZoneId = Math.max(state.nextZoneId, origId + 1);
      // Remove all intarsia fragments that were applied (they are now encoded as zones)
      const appliedFragmentIds = new Set(fragments.map((f) => Number(f && f.id || 0)).filter(Boolean));
      state.intarsiaSvgFragments = (Array.isArray(state.intarsiaSvgFragments) ? state.intarsiaSvgFragments : [])
        .filter((f) => !appliedFragmentIds.has(Number(f && f.id || 0)));
      state.layoutRun.fragments = (Array.isArray(state.layoutRun.fragments) ? state.layoutRun.fragments : [])
        .filter((f) => !appliedFragmentIds.has(Number(f && f.id || 0)));
      state.selectedFragmentId = null;
      await persistZonesCurrentNoReload();
      byId("workspaceInfo").textContent = `Р—РѕРЅР° СЂР°Р·Р±РёС‚Р°: ${(res.subZones || []).length} С„СЂР°РіРј. + ${(res.remainderZones || []).length} РѕСЃС‚Р°С‚РѕРє`;
      renderScene();
      renderDetailZoneTree();
    }

    async function applyIntarsiaFragmentToZone(fragmentId, zoneId) {
      const zone = state.zones.find((z) => Number(z && z.id || 0) === Number(zoneId || 0));
      if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) {
        byId("workspaceInfo").textContent = "Р—РѕРЅР° РЅРµ РЅР°Р№РґРµРЅР°";
        return;
      }
      const frag = (Array.isArray(state.intarsiaSvgFragments) ? state.intarsiaSvgFragments : [])
        .find((f) => Number(f && f.id || 0) === Number(fragmentId || 0));
      if (!frag || !Array.isArray(frag.points) || frag.points.length < 3) {
        byId("workspaceInfo").textContent = "Р¤СЂР°РіРјРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ";
        return;
      }
      byId("workspaceInfo").textContent = "РџСЂРµРѕР±СЂР°Р·РѕРІР°РЅРёРµ С„СЂР°РіРјРµРЅС‚Р° РІ Р·РѕРЅСѓвЂ¦";
      const res = await api("/api/intarsia/apply-fragments", "POST", {
        zonePoints: zone.points,
        fragments: [{ points: frag.points }]
      });
      if (!res || !res.ok) {
        byId("workspaceInfo").textContent = `РћС€РёР±РєР°: ${String(res && res.error || "unknown")}`;
        return;
      }
      const detailId = Number(zone.detailId || state.selectedDetailId || 0) || null;
      const parentSnapshot = {
        id: zone.id,
        name: String(zone.name || `Р—РѕРЅР° ${zone.id}`),
        detailId: Number(zone.detailId || 0) || null,
        materialId: zone.materialId !== undefined && zone.materialId !== null && String(zone.materialId).trim() ? String(zone.materialId).trim() : null,
        materialName: zone.materialName !== undefined && zone.materialName !== null && String(zone.materialName).trim() ? String(zone.materialName).trim() : null,
        napDirectionDeg: normalizeDeg(zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG),
        originType: ["base", "split", "manual"].includes(String(zone.originType || "").trim().toLowerCase()) ? String(zone.originType || "").trim().toLowerCase() : "base",
        parentZoneId: Number(zone.parentZoneId || 0) || null,
        points: zone.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
      };
      // Create sub-zone for this fragment (skipPersist to avoid race condition)
      for (const sz of (res.subZones || [])) {
        if (Array.isArray(sz.points) && sz.points.length >= 3) {
          createZoneFromPoints(sz.points, { detailId, originType: "split", parentZoneId: zone.id, parentZoneSnapshot: parentSnapshot, skipPersist: true });
        }
      }
      // Create remainder zone(s) as split children, then delete original
      const remainders = (res.remainderZones || []).filter((rz) => Array.isArray(rz.points) && rz.points.length >= 3);
      for (const rz of remainders) {
        createZoneFromPoints(rz.points, { detailId, originType: "split", parentZoneId: zone.id, parentZoneSnapshot: parentSnapshot, skipPersist: true });
      }
      if (remainders.length > 0) {
        // Remove original zone directly вЂ” base zones are rejected by deleteZoneEntry
        const origId = Number(zone.id || 0);
        state.zones = (Array.isArray(state.zones) ? state.zones : []).filter((z) => Number(z && z.id || 0) !== origId);
        await persistZonesCurrentNoReload();
      }
      // Remove this fragment from intarsia list
      state.intarsiaSvgFragments = (Array.isArray(state.intarsiaSvgFragments) ? state.intarsiaSvgFragments : [])
        .filter((f) => Number(f && f.id || 0) !== Number(fragmentId || 0));
      state.layoutRun.fragments = (Array.isArray(state.layoutRun.fragments) ? state.layoutRun.fragments : [])
        .filter((f) => Number(f && f.id || 0) !== Number(fragmentId || 0));
      state.selectedFragmentId = null;
      byId("workspaceInfo").textContent = `Р¤СЂР°РіРјРµРЅС‚ ${fragmentId} РїСЂРµРѕР±СЂР°Р·РѕРІР°РЅ РІ Р·РѕРЅСѓ`;
      renderScene();
      renderDetailZoneTree();
      renderPropertyEditor();
    }

    function openIntarsiaFragmentContextMenu(payload) {
      const zoneId = Number(payload && payload.zoneId || 0);
      const menu = ensureZoneContextMenu();
      menu.innerHTML = "";
      const addItem = (label, onClick, options) => {
        const cfg = options && typeof options === "object" ? options : {};
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "zone-context-menu-btn";
        btn.disabled = !!cfg.disabled;
        btn.innerHTML = `<span>${escapeHtml(label)}</span>`;
        if (typeof onClick === "function" && !cfg.disabled) {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try { await onClick(); } finally { hideZoneContextMenu(); }
          });
        }
        menu.appendChild(btn);
      };
      const addSeparator = () => {
        const sep = document.createElement("div");
        sep.className = "zone-context-menu-sep";
        menu.appendChild(sep);
      };

      addItem("РЈРґР°Р»РёС‚СЊ С„СЂР°РіРјРµРЅС‚", () => {
        const delId = Number(state.selectedFragmentId);
        if (Array.isArray(state.intarsiaSvgFragments)) {
          state.intarsiaSvgFragments = state.intarsiaSvgFragments.filter((f) => Number(f && f.id || 0) !== delId);
        }
        if (Array.isArray(state.layoutRun && state.layoutRun.fragments)) {
          state.layoutRun.fragments = state.layoutRun.fragments.filter((f) => Number(f && f.id || 0) !== delId);
        }
        state.selectedFragmentId = null;
        renderScene();
      });
      addSeparator();
      addItem("Р Р°Р·Р±РёС‚СЊ Р·РѕРЅСѓ РїРѕ РІСЃРµРј С„СЂР°РіРјРµРЅС‚Р°Рј", () => applyIntarsiaFragmentsToZone(zoneId), { disabled: !zoneId });

      menu.classList.add("open");
      menu.style.left = "0px";
      menu.style.top = "0px";
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      const rect = menu.getBoundingClientRect();
      const left = Math.max(6, Math.min(Number(payload && payload.x || 0), vw - rect.width - 6));
      const top = Math.max(6, Math.min(Number(payload && payload.y || 0), vh - rect.height - 6));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }

    function openZoneContextMenu(payload) {
      const zone = payload && payload.zone && typeof payload.zone === "object" ? payload.zone : null;
      if (!zone) return;
      state.selectedZoneId = Number(zone.id || 0) || null;
      state.selectedDetailId = Number(zone.detailId || state.selectedDetailId || 0) || state.selectedDetailId;
      state.selectedFragmentId = null;
      const menu = ensureZoneContextMenu();
      menu.innerHTML = "";
      const addItem = (label, onClick, options) => {
        const cfg = options && typeof options === "object" ? options : {};
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "zone-context-menu-btn" + (cfg.danger ? " zone-context-menu-btn--danger" : "");
        btn.disabled = !!cfg.disabled;
        btn.innerHTML = `<span>${escapeHtml(label)}</span>${cfg.shortcut ? `<span class="zone-context-menu-shortcut">${escapeHtml(cfg.shortcut)}</span>` : ""}`;
        if (typeof onClick === "function" && !cfg.disabled) {
          btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              await onClick();
            } finally {
              hideZoneContextMenu();
            }
          });
        }
        menu.appendChild(btn);
      };
      const addSeparator = () => {
        const sep = document.createElement("div");
        sep.className = "zone-context-menu-sep";
        menu.appendChild(sep);
      };

      addItem("Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ Р·РѕРЅСѓ", () => {
        selectZoneForEditing(zone);
      });
      addItem("РћР±СЉРµРґРёРЅРёС‚СЊ Р·РѕРЅС‹", () => deleteZoneEntry(zone), { disabled: !canRestoreParentZone(zone) });
      addSeparator();
      addItem("Р’С‹Р±СЂР°С‚СЊ РјРµС…РѕРІРѕР№ РјР°С‚РµСЂРёР°Р»", async () => {
        await openMaterialLibrary(zone);
      }, { shortcut: "Ctrl+Shift+M" });
      if (zone.materialId) {
        addItem("РЈР±СЂР°С‚СЊ РјРµС…", async () => {
          await assignMaterialToZone(zone, null);
        });
      }
      addItem("Р’С‹Р±СЂР°С‚СЊ РѕР±СЂР°Р±РѕС‚РєСѓ", null, { disabled: true, shortcut: "Ctrl+Shift+O" });
      addItem("Р’С‹Р±СЂР°С‚СЊ РІС‹РєР»Р°РґРєСѓ", () => {
        state.uiPanel = "layouts";
        renderLayoutModeSwitch();
        renderDetailZoneTree();
        renderPropertyEditor();
        openLayoutTypePicker();
      }, { shortcut: "Ctrl+Shift+V" });
      addSeparator();
      addItem("РЈРґР°Р»РёС‚СЊ Р·РѕРЅСѓ", () => deleteZoneEntry(zone), { disabled: !canDeleteZone(zone), danger: true });

      menu.classList.add("open");
      menu.style.left = "0px";
      menu.style.top = "0px";
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      const rect = menu.getBoundingClientRect();
      const left = Math.max(6, Math.min(Number(payload && payload.x || 0), vw - rect.width - 6));
      const top = Math.max(6, Math.min(Number(payload && payload.y || 0), vh - rect.height - 6));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      renderDetailZoneTree();
      renderPropertyEditor();
      renderScene();
    }

    // ---------------------------------------------------------------------------
    // Geometry helpers — delegated to window.FurLabGeom (core/geom.js)
    // ---------------------------------------------------------------------------
    const contourThumbSvg = (pts, closed) => window.FurLabGeom.contourThumbSvg(pts, closed);

    function renderDetailZoneTree() {
      if (detailZoneTreeView && typeof detailZoneTreeView.renderDetailZoneTree === "function") {
        detailZoneTreeView.renderDetailZoneTree();
      }
    }

    const polygonArea = (pts) => window.FurLabGeom.polygonArea(pts);
    const polylineLength = (pts, closed) => window.FurLabGeom.polylineLength(pts, closed);

    const normalizeContourArray = (raw) => window.FurLabUtils.normalizeContourArray(raw);

    const clipPolygonByHalfPlane = (poly, nx, ny, c) => window.FurLabGeom.clipPolygonByHalfPlane(poly, nx, ny, c);
    const centroid = (pts) => window.FurLabGeom.centroid(pts);
    const polygonBBox = (pts) => window.FurLabGeom.polygonBBox(pts);
    const randomPointInPolygon = (poly, bbox, n) => window.FurLabGeom.randomPointInPolygon(poly, bbox, n);
    const clipPolygonToRect = (poly, x0, y0, x1, y1) => window.FurLabGeom.clipPolygonToRect(poly, x0, y0, x1, y1);
    const splitPolygonByLine = (poly, px, py, dx, dy) => window.FurLabGeom.splitPolygonByLine(poly, px, py, dx, dy);

    function zoneSplitDerivedIds(zoneId) {
      const base = Number(zoneId || 0) || 0;
      const taken = new Set((Array.isArray(state.zones) ? state.zones : []).map((zone) => Number(zone && zone.id || 0)).filter((id) => id > 0));
      const preferredA = Number(`${base}1`);
      const preferredB = Number(`${base}2`);
      if (preferredA > 0 && preferredB > 0 && !taken.has(preferredA) && !taken.has(preferredB) && preferredA !== preferredB) {
        return [preferredA, preferredB];
      }
      const out = [];
      while (out.length < 2) {
        const nextId = Number(state.nextZoneId || 1) || 1;
        state.nextZoneId = nextId + 1;
        if (taken.has(nextId) || out.includes(nextId)) continue;
        out.push(nextId);
      }
      return out;
    }

    async function splitSelectedZoneByLine(fromPoint, toPoint) {
      const zone = state.zones.find((item) => Number(item && item.id || 0) === Number(state.selectedZoneId || 0)) || null;
      if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) {
        byId("workspaceInfo").textContent = "Р—РѕРЅР° РЅРµ РІС‹Р±СЂР°РЅР° РґР»СЏ СЂР°Р·РґРµР»РµРЅРёСЏ.";
        return false;
      }
      const a = fromPoint && Number.isFinite(Number(fromPoint.x)) && Number.isFinite(Number(fromPoint.y)) ? fromPoint : null;
      const b = toPoint && Number.isFinite(Number(toPoint.x)) && Number.isFinite(Number(toPoint.y)) ? toPoint : null;
      if (!a || !b) {
        byId("workspaceInfo").textContent = "Р›РёРЅРёСЏ СЂР°Р·РґРµР»РµРЅРёСЏ РЅРµ Р·Р°РґР°РЅР°.";
        return false;
      }
      const dx = Number(b.x) - Number(a.x);
      const dy = Number(b.y) - Number(a.y);
      if (Math.hypot(dx, dy) < 1e-6) {
        byId("workspaceInfo").textContent = "Р›РёРЅРёСЏ СЂР°Р·РґРµР»РµРЅРёСЏ СЃР»РёС€РєРѕРј РєРѕСЂРѕС‚РєР°СЏ.";
        return false;
      }
      const parts = splitPolygonByLine(zone.points, a.x, a.y, dx, dy)
        .filter((poly) => Array.isArray(poly) && poly.length >= 3)
        .filter((poly) => polygonArea(poly) > 1);
      if (parts.length !== 2) {
        byId("workspaceInfo").textContent = "Р›РёРЅРёСЏ РЅРµ СЂР°Р·РґРµР»РёР»Р° Р·РѕРЅСѓ РЅР° РґРІРµ РєРѕСЂСЂРµРєС‚РЅС‹Рµ С‡Р°СЃС‚Рё.";
        return false;
      }
      const boundLayouts = (Array.isArray(state.layouts) ? state.layouts : []).filter(
        (l) => l && Number(l.boundZoneId || 0) === Number(zone.id)
      );
      if (boundLayouts.length > 0) {
        const names = boundLayouts.map((l) => String(l.name || l.mode || l.id)).join(", ");
        const ok = window.confirm(
          `РЈ Р·РѕРЅС‹ В«${zone.name || zone.id}В» РµСЃС‚СЊ РІС‹РєР»Р°РґРє${boundLayouts.length === 1 ? "Р°" : "Рё"}: ${names}.\n\nРџСЂРё СЂР°Р·РґРµР»РµРЅРёРё Р·РѕРЅС‹ ${boundLayouts.length === 1 ? "РѕРЅР° Р±СѓРґРµС‚ СѓРґР°Р»РµРЅР°" : "РѕРЅРё Р±СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹"}. РџСЂРѕРґРѕР»Р¶РёС‚СЊ?`
        );
        if (!ok) {
          state.draftSplitLine = [];
          renderScene();
          return false;
        }
      }
      const [newIdA, newIdB] = zoneSplitDerivedIds(zone.id);
      state.nextZoneId = Math.max(Number(state.nextZoneId || 1), newIdA + 1, newIdB + 1);
      const sortedParts = parts
        .map((points) => ({ points, center: centroid(points), area: polygonArea(points) }))
        .sort((left, right) => {
          if (Math.abs(left.center.x - right.center.x) > 1e-6) return left.center.x - right.center.x;
          return left.center.y - right.center.y;
        });
      const cmd = {
        type: "split-zone",
        originalZone: {
          id: zone.id,
          name: String(zone.name || `Р—РѕРЅР° ${zone.id}`),
          detailId: Number(zone.detailId || 0) || null,
          materialId: zone.materialId !== undefined && zone.materialId !== null && String(zone.materialId).trim()
            ? String(zone.materialId).trim()
            : null,
          materialName: zone.materialName !== undefined && zone.materialName !== null && String(zone.materialName).trim()
            ? String(zone.materialName).trim()
            : null,
          napDirectionDeg: normalizeDeg(zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG),
          originType: ["base", "split", "manual"].includes(String(zone.originType || "").trim().toLowerCase())
            ? String(zone.originType || "").trim().toLowerCase()
            : "base",
          parentZoneId: Number(zone.parentZoneId || 0) || null,
          points: zone.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
        },
        newZones: [
          {
            id: newIdA,
            name: `Р—РѕРЅР° ${newIdA}`,
            detailId: Number(zone.detailId || 0) || null,
            materialId: zone.materialId !== undefined && zone.materialId !== null && String(zone.materialId).trim()
              ? String(zone.materialId).trim()
              : null,
            materialName: zone.materialName !== undefined && zone.materialName !== null && String(zone.materialName).trim()
              ? String(zone.materialName).trim()
              : null,
            napDirectionDeg: normalizeDeg(zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG),
            originType: "split",
            parentZoneId: Number(zone.id || 0) || null,
            parentZoneSnapshot: {
              id: zone.id,
              name: String(zone.name || `Р—РѕРЅР° ${zone.id}`),
              detailId: Number(zone.detailId || 0) || null,
              materialId: zone.materialId !== undefined && zone.materialId !== null && String(zone.materialId).trim()
                ? String(zone.materialId).trim()
                : null,
              materialName: zone.materialName !== undefined && zone.materialName !== null && String(zone.materialName).trim()
                ? String(zone.materialName).trim()
                : null,
              napDirectionDeg: normalizeDeg(zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG),
              originType: ["base", "split", "manual"].includes(String(zone.originType || "").trim().toLowerCase())
                ? String(zone.originType || "").trim().toLowerCase()
                : "base",
              parentZoneId: Number(zone.parentZoneId || 0) || null,
              points: zone.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
            },
            points: sortedParts[0].points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
          },
          {
            id: newIdB,
            name: `Р—РѕРЅР° ${newIdB}`,
            detailId: Number(zone.detailId || 0) || null,
            materialId: zone.materialId !== undefined && zone.materialId !== null && String(zone.materialId).trim()
              ? String(zone.materialId).trim()
              : null,
            materialName: zone.materialName !== undefined && zone.materialName !== null && String(zone.materialName).trim()
              ? String(zone.materialName).trim()
              : null,
            napDirectionDeg: normalizeDeg(zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG),
            originType: "split",
            parentZoneId: Number(zone.id || 0) || null,
            parentZoneSnapshot: {
              id: zone.id,
              name: String(zone.name || `Р—РѕРЅР° ${zone.id}`),
              detailId: Number(zone.detailId || 0) || null,
              materialId: zone.materialId !== undefined && zone.materialId !== null && String(zone.materialId).trim()
                ? String(zone.materialId).trim()
                : null,
              materialName: zone.materialName !== undefined && zone.materialName !== null && String(zone.materialName).trim()
                ? String(zone.materialName).trim()
                : null,
              napDirectionDeg: normalizeDeg(zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG),
              originType: ["base", "split", "manual"].includes(String(zone.originType || "").trim().toLowerCase())
                ? String(zone.originType || "").trim().toLowerCase()
                : "base",
              parentZoneId: Number(zone.parentZoneId || 0) || null,
              points: zone.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
            },
            points: sortedParts[1].points.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
          }
        ]
      };
      executeCommand(cmd);
      pushCommand(cmd);
      state.draftSplitLine = [];
      renderScene();
      await persistZonesForCurrentWorkspace();
      byId("workspaceInfo").textContent = `Р—РѕРЅР° ${zone.id} СЂР°Р·РґРµР»РµРЅР° РЅР° ${newIdA} Рё ${newIdB}.`;
      return true;
    }
    async function commitDraftSplitLine() {
      const line = Array.isArray(state.draftSplitLine) ? state.draftSplitLine : [];
      if (line.length < 2) {
        byId("workspaceInfo").textContent = "Р›РёРЅРёСЏ Р·РѕРЅРёСЂРѕРІР°РЅРёСЏ: РїРѕСЃС‚Р°РІСЊС‚Рµ РґРІРµ С‚РѕС‡РєРё СЂР°Р·РґРµР»РµРЅРёСЏ.";
        return false;
      }
      const ok = await splitSelectedZoneByLine(line[0], line[1]);
      if (!ok && Array.isArray(state.draftSplitLine) && state.draftSplitLine.length >= 2) {
        byId("workspaceInfo").textContent = byId("workspaceInfo").textContent || "Р›РёРЅРёСЏ Р·РѕРЅРёСЂРѕРІР°РЅРёСЏ: СЃРєРѕСЂСЂРµРєС‚РёСЂСѓР№С‚Рµ С‚РѕС‡РєРё СЂР°Р·СЂРµР·Р°.";
      }
      return ok;
    }

    const clipPolygonByBand = (poly, nx, ny, lo, hi) => window.FurLabGeom.clipPolygonByBand(poly, nx, ny, lo, hi);
    const toBooleanMulti = (pts) => window.FurLabGeom.toBooleanMulti(pts);
    const fromBooleanMultiOuter = (mp) => window.FurLabGeom.fromBooleanMultiOuter(mp);
    const toBooleanMultiFromMultiOuter = (polys) => window.FurLabGeom.toBooleanMultiFromMultiOuter(polys);
    const computeCoverageHoles = (zPts, cPts) => window.FurLabGeom.computeCoverageHoles(zPts, cPts);
    const extractCoreMultiFromPlacement = (pl) => window.FurLabGeom.extractCoreMultiFromPlacement(pl);
    const buildRoundedRectPolygon = (x0, y0, x1, y1, r) => window.FurLabGeom.buildRoundedRectPolygon(x0, y0, x1, y1, r);

    // ---------------------------------------------------------------------------
    // Fragment generation — delegated to window.FurLabFragments (core/fragments.js)
    // ---------------------------------------------------------------------------
    const generateVoronoiFragments = (pts, opts) => window.FurLabFragments.generateVoronoiFragments(pts, opts);
    const generateRegularFragments = (pts, opts) => window.FurLabFragments.generateRegularFragments(pts, opts);
    const generateShiftedFragments = (pts, opts) => window.FurLabFragments.generateShiftedFragments(pts, opts);
    const generateDiagonalFragments = (pts, opts) => window.FurLabFragments.generateDiagonalFragments(pts, opts);
    const generateRadialFragments = (pts, opts) => window.FurLabFragments.generateRadialFragments(pts, opts);
    const generateFragmentsForZone = (pts, opts) => window.FurLabFragments.generateFragmentsForZone(pts, opts);

    // (old generateVoronoiFragments body removed — now in core/fragments.js)
    function refreshIntarsiaDerivedFragmentLimits() {
      const minAreaEl = byId("invMinArea");
      const minWEl = byId("minFragmentWidthMm");
      const minLEl = byId("minFragmentLengthMm");
      if (!minAreaEl || !minWEl || !minLEl) return;
      const isIntarsia = state.layoutMode === "intarsia";
      minAreaEl.disabled = isIntarsia;
      minWEl.disabled = isIntarsia;
      minLEl.disabled = isIntarsia;
      if (!isIntarsia) return;
      const frags = Array.isArray(state.layoutRun && state.layoutRun.fragments) ? state.layoutRun.fragments : [];
      if (!frags.length) {
        minAreaEl.value = "0";
        minWEl.value = "0";
        minLEl.value = "0";
        return;
      }
      let minArea = Number.POSITIVE_INFINITY;
      let minW = Number.POSITIVE_INFINITY;
      let minH = Number.POSITIVE_INFINITY;
      for (const f of frags) {
        const pts = Array.isArray(f && f.points) ? f.points : [];
        if (pts.length < 3) continue;
        const area = polygonArea(pts);
        const bb = polygonBBox(pts);
        if (!(bb && Number.isFinite(area))) continue;
        minArea = Math.min(minArea, Math.max(0, area));
        minW = Math.min(minW, Math.max(0, bb.width));
        minH = Math.min(minH, Math.max(0, bb.height));
      }
      minAreaEl.value = Number.isFinite(minArea) ? String(Math.round(minArea)) : "0";
      minWEl.value = Number.isFinite(minW) ? String(Math.round(minW)) : "0";
      minLEl.value = Number.isFinite(minH) ? String(Math.round(minH)) : "0";
    }

    function buildCurrentFragmentThresholdBasis() {
      const frags = Array.isArray(state.layoutRun && state.layoutRun.fragments) ? state.layoutRun.fragments : [];
      if (!frags.length) {
        return {
          kind: "none",
          source: "no_fragments",
          fragmentsCount: 0
        };
      }
      let minArea = Number.POSITIVE_INFINITY;
      let minW = Number.POSITIVE_INFINITY;
      let minH = Number.POSITIVE_INFINITY;
      let sumArea = 0;
      let sumW = 0;
      let sumH = 0;
      let count = 0;
      for (const f of frags) {
        const pts = Array.isArray(f && f.points) ? f.points : [];
        if (pts.length < 3) continue;
        const bb = polygonBBox(pts);
        const area = polygonArea(pts);
        if (!bb || !Number.isFinite(area)) continue;
        const w = Math.max(0, Number(bb.width || 0));
        const h = Math.max(0, Number(bb.height || 0));
        minArea = Math.min(minArea, area);
        minW = Math.min(minW, w);
        minH = Math.min(minH, h);
        sumArea += area;
        sumW += w;
        sumH += h;
        count += 1;
      }
      return {
        kind: "global_prefilter",
        source: "min_fragment_after_clipping",
        fragmentsCount: count,
        minAreaMm2: Number.isFinite(minArea) ? Math.round(minArea) : null,
        minWidthMm: Number.isFinite(minW) ? Math.round(minW) : null,
        minHeightMm: Number.isFinite(minH) ? Math.round(minH) : null,
        avgAreaMm2: count > 0 ? Math.round(sumArea / count) : null,
        avgWidthMm: count > 0 ? Math.round(sumW / count) : null,
        avgHeightMm: count > 0 ? Math.round(sumH / count) : null
      };
    }

    function setIntarsiaStepPhase(phase) {
      intarsiaStepPhase = phase === 2 ? 2 : 1;
      const isIntarsia = state.layoutMode === "intarsia";
      const step1Fields = byId("intarsiaStep1GridFields");
      const step2Fields = byId("intarsiaStep2CandidateFields");
      const step1Btn = byId("inventoryStep1RunBtn");
      const step2Btn = byId("inventoryStep1IntarsiaAssignBtn");
      const hintEl = byId("inventoryStep1FlowHint");
      const hasIntarsiaFragments = (
        isIntarsia &&
        state.layoutRun &&
        Number(state.layoutRun.selectedZoneId || 0) === Number(state.selectedZoneId || 0) &&
        Array.isArray(state.layoutRun.fragments) &&
        state.layoutRun.fragments.length > 0
      );
      if (isIntarsia && intarsiaStepPhase === 2 && !hasIntarsiaFragments) intarsiaStepPhase = 1;
      if (!isIntarsia) {
        if (step1Fields) step1Fields.style.display = "block";
        if (step2Fields) step2Fields.style.display = "block";
        if (step1Btn) step1Btn.textContent = t("btn_pick", null, "Pick");
        if (step2Btn) step2Btn.style.display = "none";
        if (hintEl) hintEl.textContent = "";
        refreshIntarsiaDerivedFragmentLimits();
        return;
      }
      if (step1Fields) step1Fields.style.display = intarsiaStepPhase === 1 ? "block" : "none";
      if (step2Fields) step2Fields.style.display = intarsiaStepPhase === 2 ? "block" : "none";
      if (step1Btn) step1Btn.textContent = t("btn_step1_generate", null, "Step 1: Generate fragments");
      if (step2Btn) {
        step2Btn.style.display = "inline-block";
        step2Btn.textContent = t("btn_step2_pick_pieces", null, "Step 2: Pick pieces");
        step2Btn.disabled = !hasIntarsiaFragments;
      }
      if (hintEl) {
        hintEl.textContent = hasIntarsiaFragments
          ? t("step1_hint_fragments_ready", { count: state.layoutRun.fragments.length }, `Fragments ready: ${state.layoutRun.fragments.length}. Run step 2.`)
          : t("step1_hint_run_step1_first", null, "Run step 1 first (generate fragments), then step 2 (pick pieces).");
      }
      refreshIntarsiaDerivedFragmentLimits();
    }

    function syncFillTypeUi() {
      const intarsiaMode = state.layoutMode === "intarsia";
      const fillType = String(byId("fillType").value || "voronoi");
      const inventoryMode = isInventoryLikeLayoutMode(state.layoutMode);
      if (inventoryMode) byId("inventoryScenario").value = "A";
      const scenario = inventoryMode ? "A" : String(byId("inventoryScenario").value || "A");
      byId("inventoryScenarioRow").style.display = "none";
      byId("inventoryScenarioHint").style.display = inventoryMode ? "block" : "none";
      const optimizationRowEl = byId("inventoryOptimizationRow");
      if (optimizationRowEl) optimizationRowEl.style.display = "none";
      byId("inventoryOptimizationHint").style.display = inventoryMode && scenario === "A" ? "block" : "none";
      byId("fillTypeRow").style.display = (inventoryMode || intarsiaMode) ? "none" : "grid";
      byId("placementStrategyRow").style.display = (inventoryMode || intarsiaMode) ? "none" : "grid";
      const step1RunBtn = byId("inventoryStep1RunBtn");
      const step1IntarsiaAssignBtn = byId("inventoryStep1IntarsiaAssignBtn");
      if (inventoryMode) {
        const optimizationPreset = INVENTORY_OPTIMIZATION_PROFILE;
        byId("placementStrategy").value = "bestFit";
        byId("fillVoronoiFields").style.display = "none";
        byId("fillRegularFields").style.display = "none";
        byId("inventoryScenarioHint").textContent = state.layoutMode === "inventory_manual"
          ? t("scenario_hint_manual", null, "РќР°СЃС‚СЂРѕР№С‚Рµ РїР°СЂР°РјРµС‚СЂС‹ РїРѕРґР±РѕСЂР° Рё Р·Р°РіСЂСѓР·РёС‚Рµ РєР°РЅРґРёРґР°С‚РѕРІ РІ Р»РѕС‚РѕРє.")
          : (state.layoutMode === "inventory_split_return"
            ? t("scenario_hint_split", null, "Split & Return: only visible part is used, leftover returns to pool.")
            : t("scenario_hint_inventory", null, "Layout is generated directly from inventory piece contours."));
        byId("inventoryOptimizationHint").textContent = state.layoutMode === "inventory_manual" ? "" : (optimizationPreset.description || "");
        byId("inventoryStep1Title").textContent = state.layoutMode === "inventory_manual"
          ? t("step1_title_manual", null, "Step 1. Manual placement + hints")
          : (state.layoutMode === "inventory_split_return"
            ? t("step1_title_split", null, "Step 1. Split & Return settings")
            : t("step1_title_inventory", null, "Step 1. Inventory pick settings"));
        if (step1RunBtn) step1RunBtn.textContent = t("btn_pick", null, "Pick");
        if (step1IntarsiaAssignBtn) step1IntarsiaAssignBtn.style.display = "none";
      } else if (intarsiaMode) {
        byId("placementStrategy").value = "bestFit";
        byId("fillVoronoiFields").style.display = "none";
        byId("fillRegularFields").style.display = "block";
        byId("inventoryOptimizationHint").textContent = "";
        const curGridMode = String(byId("fillGridMode") && byId("fillGridMode").value || "grid");
        byId("inventoryStep1Title").textContent = "\u0428\u0430\u0433 1. \u0418\u043d\u0442\u0430\u0440\u0441\u0438\u044f";
        if (step1IntarsiaAssignBtn) step1IntarsiaAssignBtn.style.display = "inline-block";
      } else {
        byId("fillVoronoiFields").style.display = fillType === "voronoi" ? "block" : "none";
        byId("fillRegularFields").style.display = fillType === "regular" ? "block" : "none";
        byId("inventoryOptimizationHint").textContent = "";
        byId("inventoryStep1Title").textContent = t("step1_title_fill_residual", null, "Step 1. Fill residual");
        if (step1RunBtn) step1RunBtn.textContent = t("btn_pick", null, "Pick");
        if (step1IntarsiaAssignBtn) step1IntarsiaAssignBtn.style.display = "none";
      }
      const isManualMode = state.layoutMode === "inventory_manual";
      const allowanceMmRow = byId("invAllowanceMmRow");
      if (allowanceMmRow) allowanceMmRow.style.display = isManualMode ? "none" : "";
      const sizeFilterRow = byId("invSizeFilterRow");
      if (sizeFilterRow) sizeFilterRow.style.display = isManualMode ? "none" : "";
      const furFilterRow = byId("invFurFilterRow");
      if (furFilterRow) furFilterRow.style.display = isManualMode ? "grid" : "none";
      const furSel = byId("invFurMaterialFilter");
      if (furSel && isManualMode) {
        function buildFurOptions(catalog) {
          const cur = String(state.manualFurMaterialFilterId || "");
          furSel.innerHTML = `<option value="">РќРµРІР°Р¶РЅРѕ</option>` +
            catalog.map((m) => `<option value="${String(m.id).replace(/"/g, "&quot;")}">${String(m.name || m.id).replace(/</g, "&lt;")}</option>`).join("");
          furSel.value = cur;
        }
        const catalog = Array.isArray(state.furMaterialsCatalog) ? state.furMaterialsCatalog : [];
        if (catalog.length === 0) {
          loadFurMaterialsCatalog().then(() => {
            const sel2 = byId("invFurMaterialFilter");
            if (!sel2) return;
            buildFurOptions(Array.isArray(state.furMaterialsCatalog) ? state.furMaterialsCatalog : []);
          }).catch(() => {});
        } else {
          buildFurOptions(catalog);
        }
        furSel.onchange = () => { state.manualFurMaterialFilterId = furSel.value; };
      }
      syncGridModeUi();
      setIntarsiaStepPhase(intarsiaStepPhase);
      syncRegularIntarsiaNapToleranceUi();
    }

    function parseSvgPathToPoints(d, scale) {
      // Tokenize: commands and numbers (handles negative numbers after implicit separator)
      const tokenRe = /([MLHVCSQTAZmlhvcsqtaz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
      const tokens = [];
      let m;
      while ((m = tokenRe.exec(d)) !== null) tokens.push(m[1] || m[2]);

      const CURVE_STEPS = 8;
      const pts = [];
      let i = 0, cx = 0, cy = 0, subX = 0, subY = 0, cmd = "M";
      let prevCpX = 0, prevCpY = 0; // for S/s and T/t

      function nn() { return i < tokens.length && !isNaN(Number(tokens[i])) ? Number(tokens[i++]) : 0; }
      function add(x, y) { pts.push({ x: x * scale, y: y * scale }); prevCpX = cx; prevCpY = cy; cx = x; cy = y; }

      function cubicBezier(x0, y0, x1, y1, x2, y2, x3, y3) {
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS, mt = 1 - t;
          add(mt*mt*mt*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3,
              mt*mt*mt*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3);
        }
      }
      function quadBezier(x0, y0, x1, y1, x2, y2) {
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS, mt = 1 - t;
          add(mt*mt*x0 + 2*mt*t*x1 + t*t*x2, mt*mt*y0 + 2*mt*t*y1 + t*t*y2);
        }
      }
      function arcTo(x1, y1, rx, ry, xRot, largeArc, sweep) {
        // Approximate arc as cubic beziers (simplified: sample as line if tiny, else use parametric)
        const dx = (cx - x1) / 2, dy = (cy - y1) / 2;
        const steps = Math.max(4, Math.round(Math.sqrt(dx*dx+dy*dy) / 20));
        const x0 = cx, y0 = cy;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          // Simple linear interpolation as arc fallback (good enough for seam lines)
          add(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        }
      }

      while (i < tokens.length) {
        const t = tokens[i];
        if (isNaN(Number(t))) { cmd = t; i++; continue; }
        switch (cmd) {
          case "M": { const x=nn(),y=nn(); add(x,y); subX=x; subY=y; cmd="L"; break; }
          case "m": { const x=cx+nn(),y=cy+nn(); add(x,y); subX=x; subY=y; cmd="l"; break; }
          case "L": add(nn(),nn()); break;
          case "l": add(cx+nn(),cy+nn()); break;
          case "H": add(nn(),cy); break;
          case "h": add(cx+nn(),cy); break;
          case "V": add(cx,nn()); break;
          case "v": add(cx,cy+nn()); break;
          case "C": { const x1=nn(),y1=nn(),x2=nn(),y2=nn(),x3=nn(),y3=nn(); cubicBezier(cx,cy,x1,y1,x2,y2,x3,y3); break; }
          case "c": { const x1=cx+nn(),y1=cy+nn(),x2=cx+nn(),y2=cy+nn(),x3=cx+nn(),y3=cy+nn(); cubicBezier(cx,cy,x1,y1,x2,y2,x3,y3); break; }
          case "S": { const x1=2*cx-prevCpX,y1=2*cy-prevCpY,x2=nn(),y2=nn(),x3=nn(),y3=nn(); cubicBezier(cx,cy,x1,y1,x2,y2,x3,y3); break; }
          case "s": { const x1=2*cx-prevCpX,y1=2*cy-prevCpY,x2=cx+nn(),y2=cy+nn(),x3=cx+nn(),y3=cy+nn(); cubicBezier(cx,cy,x1,y1,x2,y2,x3,y3); break; }
          case "Q": { const x1=nn(),y1=nn(),x2=nn(),y2=nn(); quadBezier(cx,cy,x1,y1,x2,y2); break; }
          case "q": { const x1=cx+nn(),y1=cy+nn(),x2=cx+nn(),y2=cy+nn(); quadBezier(cx,cy,x1,y1,x2,y2); break; }
          case "T": { const x1=2*cx-prevCpX,y1=2*cy-prevCpY,x2=nn(),y2=nn(); quadBezier(cx,cy,x1,y1,x2,y2); break; }
          case "t": { const x1=2*cx-prevCpX,y1=2*cy-prevCpY,x2=cx+nn(),y2=cy+nn(); quadBezier(cx,cy,x1,y1,x2,y2); break; }
          case "A": { const rx=nn(),ry=nn(),xr=nn(),la=nn(),sw=nn(),x=nn(),y=nn(); arcTo(x,y,rx,ry,xr,la,sw); break; }
          case "a": { const rx=nn(),ry=nn(),xr=nn(),la=nn(),sw=nn(),x=cx+nn(),y=cy+nn(); arcTo(x,y,rx,ry,xr,la,sw); break; }
          case "Z": case "z": cx=subX; cy=subY; break;
          default: if (!isNaN(Number(tokens[i]))) nn(); else i++; break;
        }
      }
      return pts;
    }

    function parseSvgContours(svgText, scaleMmPerUnit) {
      const scale = Number(scaleMmPerUnit) > 0 ? Number(scaleMmPerUnit) : 1;
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, "image/svg+xml");
      const err = doc.querySelector("parsererror");
      if (err) return { contours: [], error: "SVG parse error" };
      const contours = [];

      // Try to auto-detect scale from SVG width/viewBox
      let autoScale = scale;
      const svgEl = doc.querySelector("svg");
      if (svgEl) {
        const wAttr = svgEl.getAttribute("width") || "";
        const vbAttr = svgEl.getAttribute("viewBox") || "";
        const mmMatch = wAttr.match(/^([\d.]+)mm$/i);
        const cmMatch = wAttr.match(/^([\d.]+)cm$/i);
        const vbNums = vbAttr.trim().split(/[\s,]+/).map(Number);
        if (vbNums.length >= 4 && vbNums[2] > 0) {
          let physMm = null;
          if (mmMatch) physMm = Number(mmMatch[1]);
          else if (cmMatch) physMm = Number(cmMatch[1]) * 10;
          if (physMm) autoScale = physMm / vbNums[2];
        }
      }

      function pxPts(str) {
        return (str.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || []).map(Number);
      }
      for (const el of doc.querySelectorAll("polygon,polyline")) {
        const nums = pxPts(el.getAttribute("points") || "");
        if (nums.length < 6) continue;
        const pts = [];
        for (let j = 0; j + 1 < nums.length; j += 2) pts.push({ x: nums[j] * autoScale, y: nums[j + 1] * autoScale });
        contours.push(pts);
      }
      for (const el of doc.querySelectorAll("path")) {
        const pts = parseSvgPathToPoints(el.getAttribute("d") || "", autoScale);
        if (pts.length >= 3) contours.push(pts);
      }
      for (const el of doc.querySelectorAll("rect")) {
        const x = Number(el.getAttribute("x") || 0) * autoScale;
        const y = Number(el.getAttribute("y") || 0) * autoScale;
        const w = Number(el.getAttribute("width") || 0) * autoScale;
        const h = Number(el.getAttribute("height") || 0) * autoScale;
        if (w > 0 && h > 0) contours.push([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]);
      }

      return { contours, autoScale };
    }

    function syncGridModeUi() {
      const modeEl = byId("fillGridMode");
      if (!modeEl) return;
      const mode = String(modeEl.value || "grid");
      const gridEl = document.querySelector(".fill-mode-grid");
      const radialEl = document.querySelector(".fill-mode-radial");
      const bandsEl = document.querySelector(".fill-mode-bands");
      const voronoiEl = document.querySelector(".fill-mode-voronoi");
      const importSvgEl = document.querySelector(".fill-mode-import-svg");
      if (gridEl) gridEl.style.display = mode === "grid" ? "" : "none";
      if (radialEl) radialEl.style.display = mode === "radial" ? "" : "none";
      if (bandsEl) bandsEl.style.display = mode === "bands" ? "" : "none";
      if (voronoiEl) voronoiEl.style.display = mode === "voronoi" ? "" : "none";
      if (importSvgEl) importSvgEl.style.display = mode === "import_svg" ? "" : "none";
      // Sync fillType for server: voronoi mode в†’ fillType=voronoi, others в†’ regular
      const fillTypeEl = byId("fillType");
      if (fillTypeEl) fillTypeEl.value = mode === "voronoi" ? "voronoi" : "regular";
      // Center X/Y visible only when manual center selected
      const centerManualEl = document.querySelector(".fill-center-manual");
      const centerModeEl = byId("fillCenterMode");
      if (centerManualEl && centerModeEl) {
        centerManualEl.style.display = centerModeEl.value === "manual" ? "" : "none";
      }
    }

    function setNapToleranceInputValue(nextValue, markTouched) {
      const el = byId("invNapTol");
      if (!el) return;
      const safe = Math.max(0, Math.min(180, Number(nextValue)));
      el.value = String(Number.isFinite(safe) ? safe : 15);
      const touched = markTouched === true;
      el.dataset.userTouched = touched ? "1" : "0";
      if (state.layoutRun && typeof state.layoutRun === "object") {
        state.layoutRun.__napTolTouchedByUser = touched;
      }
    }

    function syncRegularIntarsiaNapToleranceUi() {
      const el = byId("invNapTol");
      if (!el) return;
      const isRegularIntarsia = state.layoutMode === "intarsia"
        && String(byId("fillType") && byId("fillType").value || "") === "regular";
      if (!isRegularIntarsia) return;
      const persistedNapTol = Number(
        state.layoutRun
        && state.layoutRun.lastConstraints
        && state.layoutRun.lastConstraints.napToleranceDeg
      );
      if (Number.isFinite(persistedNapTol)) {
        setNapToleranceInputValue(persistedNapTol, true);
        return;
      }
      const userTouched = el.dataset.userTouched === "1"
        || !!(state.layoutRun && state.layoutRun.__napTolTouchedByUser);
      if (userTouched) return;
      const current = Number(el.value);
      if (!Number.isFinite(current) || Math.abs(current - 15) <= 1e-6) {
        setNapToleranceInputValue(0, false);
      }
    }

    function getEffectiveNapToleranceDegForCurrentRun() {
      const isRegularIntarsia = state.layoutMode === "intarsia"
        && String(byId("fillType") && byId("fillType").value || "") === "regular";
      const savedNapTol = Number(
        state.layoutRun
        && state.layoutRun.lastConstraints
        && state.layoutRun.lastConstraints.napToleranceDeg
      );
      if (Number.isFinite(savedNapTol)) return Math.max(0, Math.min(180, savedNapTol));
      const el = byId("invNapTol");
      const raw = Number(el && el.value);
      const userTouched = !!(el && el.dataset && el.dataset.userTouched === "1")
        || !!(state.layoutRun && state.layoutRun.__napTolTouchedByUser);
      if (isRegularIntarsia && !userTouched) {
        return 0;
      }
      return Number.isFinite(raw) ? Math.max(0, Math.min(180, raw)) : 15;
    }

    function toScale10(input, fallback = 5) {
      const n = Number(input);
      if (!Number.isFinite(n)) return fallback;
      if (n <= 10) return Math.max(1, Math.min(10, n));
      return Math.max(1, Math.min(10, n / 10));
    }

    function clampInputNumber(id, min, max, fallback) {
      const el = byId(id);
      if (!el) return;
      const n = Number(el.value);
      const next = Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
      el.value = String(next);
    }
    const placementExplainViewApi = window.FurLabPlacementExplainView || {};
    const placementExplainView = (typeof placementExplainViewApi.createPlacementExplainView === "function")
      ? placementExplainViewApi.createPlacementExplainView({
        byId,
        state,
        polygonArea,
        toBooleanMulti,
        toBooleanMultiFromMultiOuter,
        fromBooleanMultiOuter,
        centroid,
        rotatePoints,
        translatePoints,
        parseScrapContourPoints,
        findPlacementForFragment,
        isManualInventoryMode: () => isManualInventoryMode(),
        DEFAULT_NAP_DIRECTION_DEG
      })
      : null;

    function renderPlacementRows(rows) {
      if (placementExplainView && typeof placementExplainView.renderPlacementRows === "function") {
        placementExplainView.renderPlacementRows(rows);
      }
    }

    function renderFragmentCoverageQuality(rows) {
      if (placementExplainView && typeof placementExplainView.renderFragmentCoverageQuality === "function") {
        placementExplainView.renderFragmentCoverageQuality(rows);
      }
    }

    function renderPlacementExplain() {
      if (placementExplainView && typeof placementExplainView.renderPlacementExplain === "function") {
        placementExplainView.renderPlacementExplain();
      }
    }

function renderSplitEvents(events) {
      const wrap = byId("invSplitEventsBlock");
      const body = byId("invSplitEvents");
      if (!wrap || !body) return;
      const list = Array.isArray(events) ? events : [];
      if (!list.length) {
        wrap.style.display = "none";
        body.textContent = "";
        return;
      }
      wrap.style.display = "";
      const lines = list.slice(0, 80).map((e, i) => {
        const parent = String(e && e.parentCandidateKey || "-");
        const child = String(e && e.derivedCandidateKey || "-");
        const g = Number.isFinite(Number(e && e.generation)) ? Number(e.generation) : 1;
        const s = Number.isFinite(Number(e && e.splitIndex)) ? Number(e.splitIndex) : (i + 1);
        const used = Number(e && e.usedAreaMm2 || 0).toFixed(1);
        const left = Number(e && e.leftoverAreaMm2 || 0).toFixed(1);
        return `${i + 1}. ${parent} -> ${child} (g=${g}, s=${s}, used=${used}, left=${left})`;
      });
      body.textContent = lines.join("\n");
    }

    function isManualInventoryMode() {
      return String(state.layoutMode || "") === "inventory_manual";
    }

    function renderInventoryManualPanel() {
      syncInventoryStep2ModeUi();
      const root = byId("inventoryManualPanel");
      if (!root) return;
      root.style.display = isManualInventoryMode() ? "block" : "none";
      if (!isManualInventoryMode()) return;

      const metricsEl = byId("inventoryManualMetrics");
      const stateEl = byId("inventoryManualState");
      const summaryEl = byId("inventoryManualSummary");
      const mm = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual.lastMetrics : null;
      const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
      const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
      const loadedCount = Array.isArray(state.layoutRun && state.layoutRun.candidatePool)
        ? state.layoutRun.candidatePool.length
        : 0;

      const selectedIdx = Number(manual && manual.selectedPlacementIndex);
      const selectedPlacement = Number.isFinite(selectedIdx) && selectedIdx >= 0 && selectedIdx < placements.length ? placements[selectedIdx] : null;
      const hasSelected = !!selectedPlacement;
      const selectedTag = hasSelected
        ? String(selectedPlacement.inventoryTag || `#${selectedIdx + 1}`)
        : t("manual_selected_none", null, "РЅРµС‚");
      const activeNapRaw = manual && manual.activePiece && Number.isFinite(Number(manual.activePiece.napDirectionDeg))
        ? Number(manual.activePiece.napDirectionDeg)
        : null;
      const selectedNapDeg = hasSelected
        ? (Number.isFinite(Number(selectedPlacement.napEffectiveDeg))
            ? Number(selectedPlacement.napEffectiveDeg)
            : (Number.isFinite(Number(selectedPlacement.napDirectionDeg))
                ? Number(selectedPlacement.napDirectionDeg)
                : null))
        : activeNapRaw;
      const selectedNapText = Number.isFinite(selectedNapDeg)
        ? `${((((selectedNapDeg % 360) + 360) % 360)).toFixed(1)}В°`
        : "-";
      const noteText = manual && manual.statusNote ? String(manual.statusNote).trim() : "";

      if (stateEl) {
        stateEl.textContent = noteText
          ? `${t("manual_status_prefix", null, "РЎС‚Р°С‚СѓСЃ")}: ${noteText}`
          : `${t("manual_status_prefix", null, "РЎС‚Р°С‚СѓСЃ")}: ${t("manual_status_ready", null, "РіРѕС‚РѕРІ Рє СЂР°Р·РјРµС‰РµРЅРёСЋ")}`;
      }

      if (metricsEl) {
        if (!mm) {
          metricsEl.textContent = "gain=- | util=- | СЃС‚Р°С‚СѓСЃ=-";
        } else {
          const reason = String(mm.statusReason || "").trim();
          metricsEl.textContent = `gain=${Number(mm.gainAreaMm2 || 0).toFixed(0)} РјРјВІ | util=${(Number(mm.utilizationLocal || 0) * 100).toFixed(1)}% | СЃС‚Р°С‚СѓСЃ=${String(mm.status || "ok")}${reason ? ` (${reason})` : ""}`;
        }
      }

      if (summaryEl) {
        const zone = getManualZone();
        const zoneArea = zone ? Math.max(0, Number(polygonArea(zone.points || []) || 0)) : 0;
        const usefulArea = placements.reduce((a, p) => a + Number(p && p.gainAreaMm2 || 0), 0);
        const coverage = zoneArea > 0 ? (usefulArea / zoneArea) * 100 : 0;
        if (placements.length <= 0) {
          summaryEl.textContent = t("manual_summary_loaded", { loaded: loadedCount }, `Р›РѕС‚РѕРє: ${loadedCount}`);
        } else {
          const napPart = t("manual_summary_nap", { nap: selectedNapText }, `nap: ${selectedNapText}`);
          summaryEl.textContent = t(
            "manual_summary_full",
            {
              loaded: loadedCount,
              onField: placements.length,
              coverage: coverage.toFixed(1),
              selected: selectedTag,
              nap: napPart
            },
            `Р›РѕС‚РѕРє: ${loadedCount} | РќР° РїРѕР»Рµ: ${placements.length} | РџРѕРєСЂС‹С‚РёРµ: ${coverage.toFixed(1)}% | Р’С‹Р±СЂР°РЅ: ${selectedTag} | ${napPart}`
          );
        }
      }
    }

    function setInventoryMetricRowVisible(valueId, visible) {
      if (inventoryStep2Ui && typeof inventoryStep2Ui.setMetricRowVisible === "function") {
        inventoryStep2Ui.setMetricRowVisible(valueId, visible);
      } else {
        const el = byId(valueId);
        if (!el || !el.parentElement) return;
        el.parentElement.style.display = visible ? "" : "none";
      }
    }

    function syncInventoryStep2ModeUi() {
      if (inventoryStep2Ui && typeof inventoryStep2Ui.syncModeUi === "function") {
        inventoryStep2Ui.syncModeUi();
        return;
      }
    }

    function getManualZone(referencePoints) {
      const zones = Array.isArray(state.zones) ? state.zones : [];
      if (!zones.length) return null;
      const validZone = (z) => Array.isArray(z && z.points) && z.points.length >= 3;
      const refPts = Array.isArray(referencePoints) ? referencePoints : [];
      if (refPts.length >= 3) {
        const c = centroid(refPts);
        const byRef = findZoneAt(c);
        if (byRef && validZone(byRef)) return byRef;
      }

      const selectedId = Number(state.layoutRun.selectedZoneId || state.selectedZoneId);
      const bySelected = zones.find((z) => Number(z.id) === selectedId && validZone(z)) || null;
      if (bySelected) return bySelected;

      const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
      const activePts = manual && manual.activePiece && Array.isArray(manual.activePiece.points)
        ? manual.activePiece.points
        : [];
      if (activePts.length >= 3) {
        const c = centroid(activePts);
        const byActive = findZoneAt(c);
        if (byActive && validZone(byActive)) return byActive;
      }

      const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
      for (let i = placements.length - 1; i >= 0; i--) {
        const pts = Array.isArray(placements[i] && placements[i].alignedContour) ? placements[i].alignedContour : [];
        if (pts.length < 3) continue;
        const c = centroid(pts);
        const byPlacement = findZoneAt(c);
        if (byPlacement && validZone(byPlacement)) return byPlacement;
      }

      // Final fallback for initialization-only cases.
      return zones.find((z) => validZone(z)) || null;
    }

    function getManualZoneForPlacements(placements) {
      const zones = Array.isArray(state.zones) ? state.zones : [];
      const list = Array.isArray(placements) ? placements : [];
      if (!zones.length || !list.length) return null;
      let bestZone = null;
      let bestScore = -1;
      for (const z of zones) {
        const zPts = Array.isArray(z && z.points) ? z.points : [];
        if (zPts.length < 3) continue;
        let score = 0;
        for (const pl of list) {
          const pts = Array.isArray(pl && pl.alignedContour) ? pl.alignedContour : [];
          if (pts.length < 3) continue;
          // Count how many vertices of the placed contour are inside this zone.
          // This is robust enough for manual mode and avoids wrong selected-zone fallback.
          for (const p of pts) {
            if (pointInPolygon(p, zPts)) score++;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestZone = z;
        }
      }
      return bestScore > 0 ? bestZone : null;
    }

    function getManualCoveredContours() {
      return (state.layoutRun.fragments || [])
        .map((f) => Array.isArray(f && f.points) ? f.points : [])
        .filter((pts) => pts.length >= 3);
    }

    function toPointList(raw) {
      return (Array.isArray(raw) ? raw : [])
        .map((p) => ({ x: Number(p && p.x), y: Number(p && p.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    }

    function multiLargestOuterPoints(multi) {
      const polys = Array.isArray(multi) ? multi : [];
      let best = [];
      let bestArea = 0;
      for (const poly of polys) {
        const outer = Array.isArray(poly) && Array.isArray(poly[0]) ? poly[0] : null;
        if (!Array.isArray(outer) || outer.length < 4) continue;
        const pts = [];
        for (let i = 0; i < outer.length - 1; i++) {
          const x = Number(outer[i] && outer[i][0]);
          const y = Number(outer[i] && outer[i][1]);
          if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
        }
        if (pts.length < 3) continue;
        const area = Math.abs(polygonArea(pts));
        if (area > bestArea) {
          bestArea = area;
          best = pts;
        }
      }
      return best;
    }
    function contourBBox(points) {
      const pts = Array.isArray(points) ? points : [];
      if (pts.length < 3) return null;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const p of pts) {
        const x = Number(p && p.x);
        const y = Number(p && p.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    function extractOuterContoursFromMulti(multi) {
      const out = [];
      for (const poly of (Array.isArray(multi) ? multi : [])) {
        const outer = Array.isArray(poly) && Array.isArray(poly[0]) ? poly[0] : null;
        if (!Array.isArray(outer) || outer.length < 4) continue;
        const pts = [];
        for (let i = 0; i < outer.length - 1; i++) {
          const x = Number(outer[i] && outer[i][0]);
          const y = Number(outer[i] && outer[i][1]);
          if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
        }
        if (pts.length >= 3) out.push(pts);
      }
      return out;
    }

    function contourEdges(contour) {
      const pts = Array.isArray(contour) ? contour : [];
      if (pts.length < 3) return [];
      const edges = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const ax = Number(a && a.x), ay = Number(a && a.y);
        const bx = Number(b && b.x), by = Number(b && b.y);
        if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) continue;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (!(len > 1e-6)) continue;
        edges.push({ ax, ay, bx, by, dx, dy, len });
      }
      return edges;
    }

    function sharedCollinearSegment(edgeA, edgeB, opts) {
      const tolDistMm = Math.max(0.2, Number(opts && opts.tolDistMm || 0.8));
      const tolParallel = Math.max(1e-6, Number(opts && opts.tolParallel || 0.01));
      const minLenMm = Math.max(0.5, Number(opts && opts.minLenMm || 5));
      const cross = Math.abs((edgeA.dx * edgeB.dy) - (edgeA.dy * edgeB.dx));
      const denom = Math.max(1e-9, edgeA.len * edgeB.len);
      if ((cross / denom) > tolParallel) return null;
      const distPointToLine = (x, y) => Math.abs((edgeA.dx * (y - edgeA.ay)) - (edgeA.dy * (x - edgeA.ax))) / Math.max(1e-9, edgeA.len);
      if (distPointToLine(edgeB.ax, edgeB.ay) > tolDistMm) return null;
      if (distPointToLine(edgeB.bx, edgeB.by) > tolDistMm) return null;
      const ux = edgeA.dx / edgeA.len;
      const uy = edgeA.dy / edgeA.len;
      const project = (x, y) => ((x - edgeA.ax) * ux) + ((y - edgeA.ay) * uy);
      const a0 = 0;
      const a1 = edgeA.len;
      const b0 = project(edgeB.ax, edgeB.ay);
      const b1 = project(edgeB.bx, edgeB.by);
      const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
      const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
      const overlap = hi - lo;
      if (!(overlap >= minLenMm)) return null;
      const p1 = { x: edgeA.ax + (ux * lo), y: edgeA.ay + (uy * lo) };
      const p2 = { x: edgeA.ax + (ux * hi), y: edgeA.ay + (uy * hi) };
      return { p1, p2, lengthMm: overlap };
    }

    function seamKey(seg, aKey, bKey) {
      const q = (n) => Math.round(Number(n || 0) * 100) / 100;
      const p1 = seg && seg.p1 ? seg.p1 : { x: 0, y: 0 };
      const p2 = seg && seg.p2 ? seg.p2 : { x: 0, y: 0 };
      const pa = `${q(p1.x)},${q(p1.y)}`;
      const pb = `${q(p2.x)},${q(p2.y)}`;
      const pp = pa <= pb ? `${pa}|${pb}` : `${pb}|${pa}`;
      const aa = String(aKey || "");
      const bb = String(bKey || "");
      const ab = aa <= bb ? `${aa}::${bb}` : `${bb}::${aa}`;
      return `${ab}::${pp}`;
    }

    function pointSegDistance(pt, a, b) {
      const px = Number(pt && pt.x);
      const py = Number(pt && pt.y);
      const ax = Number(a && a.x);
      const ay = Number(a && a.y);
      const bx = Number(b && b.x);
      const by = Number(b && b.y);
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) {
        return Number.POSITIVE_INFINITY;
      }
      const abx = bx - ax;
      const aby = by - ay;
      const apx = px - ax;
      const apy = py - ay;
      const ab2 = abx * abx + aby * aby;
      const t = ab2 > 1e-9 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0;
      const cx = ax + abx * t;
      const cy = ay + aby * t;
      return Math.hypot(px - cx, py - cy);
    }

    function minDistancePointToEdges(pt, edges) {
      let best = Number.POSITIVE_INFINITY;
      for (const e of Array.isArray(edges) ? edges : []) {
        const d = pointSegDistance(pt, { x: e.ax, y: e.ay }, { x: e.bx, y: e.by });
        if (d < best) best = d;
      }
      return best;
    }

    function seamOnZoneBoundary(seam, zonePoints, tolMm) {
      const pts = Array.isArray(seam && seam.points) ? seam.points : [];
      if (pts.length < 2 || !Array.isArray(zonePoints) || zonePoints.length < 3) return false;
      const zoneEdges = contourEdges(zonePoints);
      if (!zoneEdges.length) return false;
      const p1 = pts[0];
      const p2 = pts[pts.length - 1];
      const pm = {
        x: (Number(p1 && p1.x || 0) + Number(p2 && p2.x || 0)) * 0.5,
        y: (Number(p1 && p1.y || 0) + Number(p2 && p2.y || 0)) * 0.5
      };
      const tol = Math.max(0.5, Number(tolMm || 1.4));
      const d1 = minDistancePointToEdges(p1, zoneEdges);
      const d2 = minDistancePointToEdges(p2, zoneEdges);
      const dm = minDistancePointToEdges(pm, zoneEdges);
      return d1 <= tol && d2 <= tol && dm <= tol;
    }

    function computeSeamSegmentsFromEdgeItems(itemsInput, opts, diagnosticsOut) {
      const diag = diagnosticsOut && typeof diagnosticsOut === "object" ? diagnosticsOut : null;
      const tolDistMm = Math.max(0.2, Number(opts && opts.tolDistMm || 0.8));
      const minLenMm = Math.max(0.5, Number(opts && opts.minLenMm || 5));
      const items = (Array.isArray(itemsInput) ? itemsInput : []).filter((x) => Array.isArray(x && x.edges) && x.edges.length > 0);
      const seams = [];
      const seen = new Set();
      let candidatePairs = 0;
      const rejectReasons = {
        same_owner: 0,
        disjoint: 0,
        point_touch_only: 0,
        shared_border_too_short: 0,
        not_collinear: 0
      };
      const pairSamples = [];
      function addReject(reason, a, b, maxSharedLenMm) {
        if (Object.prototype.hasOwnProperty.call(rejectReasons, reason)) rejectReasons[reason] += 1;
        if (pairSamples.length >= 120) return;
        pairSamples.push({
          fragmentA: Number(a && (a.fragmentId || a.placementIndex || a.idx) || 0),
          fragmentB: Number(b && (b.fragmentId || b.placementIndex || b.idx) || 0),
          ownerA: String(a && (a.scrapPieceId || a.inventoryTag || `p${a.ownerPlacementIndex}`) || ""),
          ownerB: String(b && (b.scrapPieceId || b.inventoryTag || `p${b.ownerPlacementIndex}`) || ""),
          rejectReason: String(reason || "unknown"),
          maxSharedLenMm: Math.round(Number(maxSharedLenMm || 0) * 1000) / 1000
        });
      }
      const bboxTol = tolDistMm + 1;
      function bboxDisjoint(a, b) {
        if (!a || !b) return true;
        return (
          Number(a.maxX) + bboxTol < Number(b.minX) ||
          Number(b.maxX) + bboxTol < Number(a.minX) ||
          Number(a.maxY) + bboxTol < Number(b.minY) ||
          Number(b.maxY) + bboxTol < Number(a.minY)
        );
      }
      for (let i = 0; i < items.length; i += 1) {
        const a = items[i];
        for (let j = i + 1; j < items.length; j += 1) {
          const b = items[j];
          const aKey = a.scrapPieceId || a.inventoryTag || `p${Number.isFinite(a.ownerPlacementIndex) ? a.ownerPlacementIndex : a.idx}`;
          const bKey = b.scrapPieceId || b.inventoryTag || `p${Number.isFinite(b.ownerPlacementIndex) ? b.ownerPlacementIndex : b.idx}`;
          if (aKey === bKey) {
            addReject("same_owner", a, b, 0);
            continue;
          }
          candidatePairs += 1;
          if (bboxDisjoint(a.bbox, b.bbox)) {
            addReject("disjoint", a, b, 0);
            continue;
          }
          let acceptedInPair = false;
          let hasShortShared = false;
          let hasPointTouchOnly = false;
          let hasAnyEdgeOverlap = false;
          let maxSharedLenMm = 0;
          for (const ea of a.edges) {
            const minAx = Math.min(ea.ax, ea.bx), maxAx = Math.max(ea.ax, ea.bx);
            const minAy = Math.min(ea.ay, ea.by), maxAy = Math.max(ea.ay, ea.by);
            for (const eb of b.edges) {
              const minBx = Math.min(eb.ax, eb.bx), maxBx = Math.max(eb.ax, eb.bx);
              const minBy = Math.min(eb.ay, eb.by), maxBy = Math.max(eb.ay, eb.by);
              if (maxAx + bboxTol < minBx || maxBx + bboxTol < minAx || maxAy + bboxTol < minBy || maxBy + bboxTol < minAy) continue;
              hasAnyEdgeOverlap = true;
              const endpointTouch =
                (Math.hypot(ea.ax - eb.ax, ea.ay - eb.ay) <= tolDistMm) ||
                (Math.hypot(ea.ax - eb.bx, ea.ay - eb.by) <= tolDistMm) ||
                (Math.hypot(ea.bx - eb.ax, ea.by - eb.ay) <= tolDistMm) ||
                (Math.hypot(ea.bx - eb.bx, ea.by - eb.by) <= tolDistMm);
              if (endpointTouch) hasPointTouchOnly = true;
              const segAny = sharedCollinearSegment(ea, eb, { ...(opts || {}), minLenMm: 0.1 });
              if (!segAny) continue;
              maxSharedLenMm = Math.max(maxSharedLenMm, Number(segAny.lengthMm || 0));
              if (Number(segAny.lengthMm || 0) < minLenMm) {
                hasShortShared = true;
                continue;
              }
              const key = seamKey(segAny, aKey, bKey);
              if (!seen.has(key)) {
                seen.add(key);
                seams.push({
                  pieceA: {
                    placementIndex: Number.isFinite(a.ownerPlacementIndex) ? a.ownerPlacementIndex : a.idx,
                    ownerPlacementId: Number.isFinite(a.ownerPlacementId) ? a.ownerPlacementId : 0,
                    scrapPieceId: a.scrapPieceId,
                    inventoryTag: a.inventoryTag
                  },
                  pieceB: {
                    placementIndex: Number.isFinite(b.ownerPlacementIndex) ? b.ownerPlacementIndex : b.idx,
                    ownerPlacementId: Number.isFinite(b.ownerPlacementId) ? b.ownerPlacementId : 0,
                    scrapPieceId: b.scrapPieceId,
                    inventoryTag: b.inventoryTag
                  },
                  lengthMm: Math.round(Number(segAny.lengthMm || 0) * 1000) / 1000,
                  points: [
                    { x: Number(segAny.p1 && segAny.p1.x || 0), y: Number(segAny.p1 && segAny.p1.y || 0) },
                    { x: Number(segAny.p2 && segAny.p2.x || 0), y: Number(segAny.p2 && segAny.p2.y || 0) }
                  ]
                });
              }
              acceptedInPair = true;
            }
          }
          if (!acceptedInPair) {
            if (hasShortShared) addReject("shared_border_too_short", a, b, maxSharedLenMm);
            else if (hasPointTouchOnly) addReject("point_touch_only", a, b, maxSharedLenMm);
            else if (!hasAnyEdgeOverlap) addReject("disjoint", a, b, maxSharedLenMm);
            else addReject("not_collinear", a, b, maxSharedLenMm);
          }
        }
      }
      if (diag) {
        diag.fragmentsCount = items.length;
        diag.candidatePairs = candidatePairs;
        diag.acceptedSeams = seams.length;
        diag.rejectReasons = rejectReasons;
        diag.pairSamples = pairSamples;
      }
      return seams;
    }

    function computeSeamSegmentsFromVisibleContours(visibleContours, opts, diagnosticsOut) {
      const diag = diagnosticsOut && typeof diagnosticsOut === "object" ? diagnosticsOut : null;
      const list = Array.isArray(visibleContours) ? visibleContours : [];
      const items = list.map((vc, idx) => {
        const contours = extractOuterContoursFromMulti(vc && vc.visibleContours);
        const edges = [];
        for (const contour of contours) edges.push(...contourEdges(contour));
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const contour of contours) {
          for (const p of contour) {
            minX = Math.min(minX, Number(p && p.x));
            minY = Math.min(minY, Number(p && p.y));
            maxX = Math.max(maxX, Number(p && p.x));
            maxY = Math.max(maxY, Number(p && p.y));
          }
        }
        const bbox = Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)
          ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
          : null;
        return {
          idx,
          fragmentId: Number(vc && vc.ownerPlacementId || 0),
          placementIndex: Number(vc && vc.placementIndex || idx),
          ownerPlacementIndex: Number(vc && vc.placementIndex || idx),
          ownerPlacementId: Number(vc && vc.ownerPlacementId || 0),
          scrapPieceId: String(vc && vc.scrapPieceId || ""),
          inventoryTag: String(vc && vc.inventoryTag || ""),
          areaMm2: Math.max(0, Number(vc && vc.visibleAreaMm2 || 0)),
          pointCount: contours.reduce((acc, c) => acc + Number(Array.isArray(c) ? c.length : 0), 0),
          bbox,
          edges
        };
      }).filter((x) => Array.isArray(x.edges) && x.edges.length > 0);
      if (diag) {
        diag.fragments = items.map((it) => ({
          fragmentId: Number(it.fragmentId || 0),
          ownerPlacementIndex: Number.isFinite(it.ownerPlacementIndex) ? it.ownerPlacementIndex : -1,
          ownerPlacementId: Number.isFinite(it.ownerPlacementId) ? it.ownerPlacementId : 0,
          pieceId: String(it.scrapPieceId || ""),
          inventoryTag: String(it.inventoryTag || ""),
          areaMm2: Math.round(Number(it.areaMm2 || 0) * 1000) / 1000,
          pointCount: Number(it.pointCount || 0),
          bbox: it.bbox
            ? {
                minX: Math.round(it.bbox.minX * 1000) / 1000,
                minY: Math.round(it.bbox.minY * 1000) / 1000,
                maxX: Math.round(it.bbox.maxX * 1000) / 1000,
                maxY: Math.round(it.bbox.maxY * 1000) / 1000,
                width: Math.round(it.bbox.width * 1000) / 1000,
                height: Math.round(it.bbox.height * 1000) / 1000
              }
            : null
        }));
      }
      return computeSeamSegmentsFromEdgeItems(items, opts, diag);
    }

    function computeSeamSegmentsFromAppliedFragments(fragments, opts, diagnosticsOut) {
      const diag = diagnosticsOut && typeof diagnosticsOut === "object" ? diagnosticsOut : null;
      const list = (Array.isArray(fragments) ? fragments : [])
        .map((f, idx) => {
          const seamSrc = (Array.isArray(f && f.seamPoints) && f.seamPoints.length >= 3)
            ? f.seamPoints
            : (Array.isArray(f && f.points) ? f.points : []);
          const points = seamSrc
            .map((q) => ({ x: Number(q && q.x), y: Number(q && q.y) }))
            .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
          if (points.length < 3) return null;
          const edges = contourEdges(points);
          if (!edges.length) return null;
          let minX = Number.POSITIVE_INFINITY;
          let minY = Number.POSITIVE_INFINITY;
          let maxX = Number.NEGATIVE_INFINITY;
          let maxY = Number.NEGATIVE_INFINITY;
          for (const p of points) {
            minX = Math.min(minX, Number(p && p.x));
            minY = Math.min(minY, Number(p && p.y));
            maxX = Math.max(maxX, Number(p && p.x));
            maxY = Math.max(maxY, Number(p && p.y));
          }
          const bbox = Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)
            ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
            : null;
          return {
            idx,
            fragmentId: Number(f && f.id || 0),
            ownerPlacementIndex: Number(f && f.ownerPlacementIndex),
            ownerPlacementId: Number(f && f.ownerPlacementId),
            scrapPieceId: String(f && f.scrapPieceId || ""),
            inventoryTag: String(f && f.inventoryTag || ""),
            areaMm2: Math.max(0, Number(f && f.areaMm2 || 0)),
            pointCount: points.length,
            bbox,
            edges
          };
        })
        .filter(Boolean);
      if (diag) {
        diag.fragments = list.map((it) => ({
          fragmentId: Number(it.fragmentId || 0),
          ownerPlacementIndex: Number.isFinite(it.ownerPlacementIndex) ? it.ownerPlacementIndex : -1,
          ownerPlacementId: Number.isFinite(it.ownerPlacementId) ? it.ownerPlacementId : 0,
          pieceId: String(it.scrapPieceId || ""),
          inventoryTag: String(it.inventoryTag || ""),
          areaMm2: Math.round(Number(it.areaMm2 || 0) * 1000) / 1000,
          pointCount: Number(it.pointCount || 0),
          bbox: it.bbox
            ? {
                minX: Math.round(it.bbox.minX * 1000) / 1000,
                minY: Math.round(it.bbox.minY * 1000) / 1000,
                maxX: Math.round(it.bbox.maxX * 1000) / 1000,
                maxY: Math.round(it.bbox.maxY * 1000) / 1000,
                width: Math.round(it.bbox.width * 1000) / 1000,
                height: Math.round(it.bbox.height * 1000) / 1000
              }
            : null
        }));
      }
      return computeSeamSegmentsFromEdgeItems(list, opts, diagnosticsOut);
    }

    function updateManualActivePiecePoints(nextPoints) {
      const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
      const ap = manual && manual.activePiece ? manual.activePiece : null;
      if (!ap) return;
      const pts = toPointList(nextPoints);
      if (pts.length < 3) return;
      ap.points = pts;
      ap.center = centroid(pts);
    }

    async function evaluateManualActivePieceNow() {
      if (!isManualInventoryMode()) return;
      const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
      const ap = manual && manual.activePiece ? manual.activePiece : null;
      const zone = getManualZone(ap.points);
      if (!ap || !Array.isArray(ap.points) || ap.points.length < 3 || !zone) {
        if (manual) {
          manual.lastMetrics = null;
          manual.lastEvalContours = null;
        }
        renderInventoryManualPanel();
        renderScene();
        return;
      }
      const seq = ++manualEvalSeq;
      const res = await api("/api/layout/manual/evaluate", "POST", {
        zone: { id: zone.id, points: zone.points || [] },
        piecePoints: ap.points,
        coveredContours: getManualCoveredContours(),
        pieceSeamReserveMm: getCurrentManualAllowanceMm(),
        minVisibleAreaMm2: 6000,
        minSpanMm: 70
      }).catch(() => null);
      if (seq !== manualEvalSeq) return;
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      if (!res || !res.ok) {
        state.layoutRun.manual.lastMetrics = {
          gainAreaMm2: 0,
          overlapAreaMm2: 0,
          outsideAreaMm2: 0,
          utilizationLocal: 0,
          coveragePct: 0,
          status: "error",
          statusReason: String(res && (res.error || res.errorCode) || "manual_recompute_failed")
        };
        state.layoutRun.manual.statusNote = "РѕС†РµРЅРєР° РЅРµ РїРѕР»СѓС‡РµРЅР°";
        renderInventoryManualPanel();
        renderManualTrayIntoRoot();
        renderScene();
        return;
      }
      const mm = res.metrics || {};
      manual.lastMetrics = {
        pieceAreaMm2: Number(mm.pieceAreaMm2 || 0),
        gainAreaMm2: Number(mm.gainAreaMm2 || 0),
        overlapAreaMm2: Number(mm.overlapInsideMm2 || 0),
        outsideAreaMm2: Number(mm.outsideWasteMm2 || 0),
        utilizationLocal: Number(mm.utilization || 0),
        status: String(mm.status || "ok"),
        statusReason: String(mm.statusReason || ""),
        visibleSpanMm: Number(mm.visibleSpanMm || 0),
        inZoneAreaMm2: Number(mm.inZoneAreaMm2 || 0),
        inZoneCoreAreaMm2: Number(mm.inZoneCoreAreaMm2 || 0),
        gainCoreAreaMm2: Number(mm.gainCoreAreaMm2 || 0)
      };
      manual.lastEvalContours = res.contours && typeof res.contours === "object" ? res.contours : null;
      renderInventoryManualPanel();
      renderScene();
    }

    async function evaluateManualActivePieceDirect() {
      const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
      const ap = manual && manual.activePiece ? manual.activePiece : null;
      const zone = getManualZone(ap.points);
      if (!manual || !ap || !Array.isArray(ap.points) || ap.points.length < 3 || !zone) return null;
      const res = await api("/api/layout/manual/evaluate", "POST", {
        zone: { id: zone.id, points: zone.points || [] },
        piecePoints: ap.points,
        coveredContours: getManualCoveredContours(),
        pieceSeamReserveMm: getCurrentManualAllowanceMm(),
        minVisibleAreaMm2: 6000,
        minSpanMm: 70
      }).catch(() => null);
      if (!res || !res.ok) return null;
      const mm = res.metrics || {};
      manual.lastMetrics = {
        pieceAreaMm2: Number(mm.pieceAreaMm2 || 0),
        gainAreaMm2: Number(mm.gainAreaMm2 || 0),
        overlapAreaMm2: Number(mm.overlapInsideMm2 || 0),
        outsideAreaMm2: Number(mm.outsideWasteMm2 || 0),
        utilizationLocal: Number(mm.utilization || 0),
        status: String(mm.status || "ok"),
        statusReason: String(mm.statusReason || ""),
        visibleSpanMm: Number(mm.visibleSpanMm || 0),
        inZoneAreaMm2: Number(mm.inZoneAreaMm2 || 0),
        inZoneCoreAreaMm2: Number(mm.inZoneCoreAreaMm2 || 0),
        gainCoreAreaMm2: Number(mm.gainCoreAreaMm2 || 0)
      };
      manual.lastEvalContours = res.contours && typeof res.contours === "object" ? res.contours : null;
      return manual.lastMetrics;
    }

    async function ensureManualPlacementsCoreContours() {
      if (!isManualInventoryMode()) return;
      const zone = getManualZone();
      if (!zone) return;
      const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
      if (!placements.length) return;
      const seamMm = getCurrentManualAllowanceMm();
      const targets = placements.filter((p) => Array.isArray(p && p.alignedContour) && p.alignedContour.length >= 3);
      if (!targets.length) return;
      for (const p of targets) {
        try {
          const res = await api("/api/layout/manual/evaluate", "POST", {
            zone: { id: zone.id, points: zone.points || [] },
            piecePoints: p.alignedContour || [],
            coveredContours: [],
            pieceSeamReserveMm: seamMm
          });
          if (!res || !res.ok || !res.contours) continue;
          const ctr = res.contours;
          // Only update core contour if erosion actually produced a result вЂ” don't overwrite good data with empty
          if (Array.isArray(ctr.coreWorld) && ctr.coreWorld.length > 0) {
            p.alignedCoreContours = ctr.coreWorld;
            p.alignedCoreContour = multiLargestOuterPoints(p.alignedCoreContours);
          }
          p.inZoneCoreContours = Array.isArray(ctr.inZoneCore) ? ctr.inZoneCore : [];
          p.inZoneCoreContour = multiLargestOuterPoints(p.inZoneCoreContours);
          p.inZoneCoreAreaMm2 = Number(res && res.metrics && res.metrics.inZoneCoreAreaMm2 || 0);
          p.seamStatus = String(res && res.metrics && res.metrics.seamStatus || (seamMm > 0 ? "failed" : "disabled"));
          p.seamReserveMm = seamMm;
        } catch (_) {
          // Keep placement unchanged on transport/runtime errors.
        }
      }
    }

    function scheduleManualActivePieceEval() {
      if (manualEvalDebounceId) clearTimeout(manualEvalDebounceId);
      manualEvalDebounceId = setTimeout(() => {
        manualEvalDebounceId = null;
        void evaluateManualActivePieceNow();
      }, 90);
    }

    function activateManualPieceFromCandidate(candidate, anchorWorld) {
      if (!isManualInventoryMode()) return;
      const c = candidate && typeof candidate === "object" ? candidate : null;
      if (!c) return;
      const contourRaw = parseScrapContourPoints(c.scrapContour);
      const contour = toPointList(contourRaw);
      if (contour.length < 3) return;
      const zone = getManualZone(contour);
      const zoneCenter = zone ? centroid(zone.points || []) : { x: 0, y: 0 };
      const targetCenter = anchorWorld && Number.isFinite(Number(anchorWorld.x)) && Number.isFinite(Number(anchorWorld.y))
        ? { x: Number(anchorWorld.x), y: Number(anchorWorld.y) }
        : zoneCenter;
      const partCenter = centroid(contour);
      const moved = translatePoints(contour, targetCenter.x - partCenter.x, targetCenter.y - partCenter.y);
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      state.layoutRun.manual.selectedCandidateTag = String(c.inventoryTag || c.id || "");
      state.layoutRun.manual.activePiece = {
        inventoryTag: String(c.inventoryTag || c.id || ""),
        scrapPieceId: String(c.scrapPieceId || c.id || ""),
        candidate: c,
        points: moved,
        center: centroid(moved),
        rotationDeg: 0
      };
      state.layoutRun.manual.statusNote = "РЅРµ Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅ";
      state.layoutRun.manual.lastMetrics = null;
      state.layoutRun.manual.lastEvalContours = null;
      renderInventoryManualPanel();
      renderScene();
    }

    function addManualPlacementFromCandidate(candidate, anchorWorld) {
      if (!isManualInventoryMode()) return null;
      const c = candidate && typeof candidate === "object" ? candidate : null;
      if (!c) return null;
      const contour = toPointList(parseScrapContourPoints(c.scrapContour));
      if (contour.length < 3) return null;
      const zone = getManualZone();
      const zoneCenter = zone ? centroid(zone.points || []) : { x: 0, y: 0 };
      const targetCenter = anchorWorld && Number.isFinite(Number(anchorWorld.x)) && Number.isFinite(Number(anchorWorld.y))
        ? { x: Number(anchorWorld.x), y: Number(anchorWorld.y) }
        : zoneCenter;
      const partCenter = centroid(contour);
      const moved = translatePoints(contour, targetCenter.x - partCenter.x, targetCenter.y - partCenter.y);
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      const nextId = (state.layoutRun.placements || []).length + 1;
      const p = {
        status: "matched",
        fragmentId: nextId,
        fragmentAreaMm2: 0,
        gainAreaMm2: 0,
        overlapAreaMm2: 0,
        outsideAreaMm2: 0,
        utilizationLocal: 0,
        scrapAreaMm2: Number(c && c.areaMm2 || 0),
        inventoryTag: String(c.inventoryTag || c.id || ""),
        scrapPieceId: String(c.scrapPieceId || c.id || ""),
        materialId: String(c.materialId || ""),
        alignedContour: moved,
        inZoneContour: moved.slice(),
        inZoneContours: [],
        alignedCoreContour: [],
        alignedCoreContours: [],
        inZoneCoreContour: [],
        inZoneCoreContours: [],
        inZoneCoreAreaMm2: 0
      };
      state.layoutRun.placements = (state.layoutRun.placements || []).concat([p]);
      state.layoutRun.manual.selectedPlacementIndex = state.layoutRun.placements.length - 1;
      state.layoutRun.manual.selectedCandidateTag = String(c.inventoryTag || c.id || "");
      state.layoutRun.manual.activePiece = null;
      state.layoutRun.manual.lastMetrics = null;
      state.layoutRun.manual.lastEvalContours = null;
      state.layoutRun.manual.statusNote = "РєСѓСЃРѕРє РґРѕР±Р°РІР»РµРЅ (СЂСѓС‡РЅРѕР№ СЂРµР¶РёРј)";
      byId("invTotalFragments").textContent = String(state.layoutRun.placements.length);
      renderPlacementRows(state.layoutRun.placements || []);
      renderInventoryManualPanel();
      renderScene();
      void requestManualRecomputeFromUi();
      // Important: when adding directly from tray, compute Pfull/Pcore metrics immediately,
      // otherwise "РџСЂРёРїСѓСЃРє РєСѓСЃРєР°" has no geometry to render for this placement.
      const coveredBefore = getManualCoveredContours();
      void (async () => {
        try {
          const zoneNow = getManualZone(moved);
          if (!zoneNow) return;
          const evalRes = await api("/api/layout/manual/evaluate", "POST", {
            zone: { id: zoneNow.id, points: zoneNow.points || [] },
            piecePoints: moved,
            coveredContours: coveredBefore,
            pieceSeamReserveMm: getCurrentManualAllowanceMm(),
            minVisibleAreaMm2: 6000,
            minSpanMm: 70
          }).catch(() => null);
          if (!evalRes || !evalRes.ok) return;
          const mm = evalRes.metrics || {};
          const ctr = evalRes.contours || {};
          p.gainAreaMm2 = Number(mm.gainAreaMm2 || 0);
          p.fragmentAreaMm2 = Number(mm.gainAreaMm2 || 0);
          p.overlapAreaMm2 = Number(mm.overlapInsideMm2 || 0);
          p.outsideAreaMm2 = Number(mm.outsideWasteMm2 || 0);
          p.utilizationLocal = Number(mm.utilization || 0);
          p.scrapAreaMm2 = Number(mm.pieceAreaMm2 || p.scrapAreaMm2 || 0);
          p.inZoneContours = Array.isArray(ctr.inZone) ? ctr.inZone : [];
          p.inZoneContour = multiLargestOuterPoints(p.inZoneContours);
          p.alignedCoreContours = Array.isArray(ctr.coreWorld) ? ctr.coreWorld : [];
          p.alignedCoreContour = multiLargestOuterPoints(p.alignedCoreContours);
          p.inZoneCoreContours = Array.isArray(ctr.inZoneCore) ? ctr.inZoneCore : [];
          p.inZoneCoreContour = multiLargestOuterPoints(p.inZoneCoreContours);
          p.inZoneCoreAreaMm2 = Number(mm.inZoneCoreAreaMm2 || 0);
          updateManualStatsFromPlacements();
          renderPlacementRows(state.layoutRun.placements || []);
          renderScene();
          void requestManualRecomputeFromUi();
        } catch (_) {}
      })();
      return p;
    }

    async function commitInventoryManualActivePiece() {
      if (!isManualInventoryMode()) return;
      const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
      const ap = manual && manual.activePiece ? manual.activePiece : null;
      if (!ap || !Array.isArray(ap.points) || ap.points.length < 3) return;
      if (manualEvalDebounceId) {
        clearTimeout(manualEvalDebounceId);
        manualEvalDebounceId = null;
      }
      if (manual && !manual.lastMetrics) await evaluateManualActivePieceDirect();
      const mm = manual && manual.lastMetrics ? manual.lastMetrics : null;
      const inZoneArea = Number(mm && mm.inZoneAreaMm2 || 0);
      const gainArea = Number(mm && mm.gainAreaMm2 || 0);
      if (!mm || inZoneArea <= 0) {
        const reason = String(mm && mm.statusReason || "").trim();
        byId("invDebugInfo").textContent = `manual_commit_rejected: piece_outside_zone${reason ? ` (${reason})` : ""}`;
        if (manual) manual.statusNote = t("manual_status_not_fixed_outside", null, "Not fixed: piece is outside zone");
        return;
      }
      const nextId = (state.layoutRun.placements || []).length + 1;
      const inZoneMp = manual && manual.lastEvalContours ? manual.lastEvalContours.inZone : [];
      const inZoneContour = multiLargestOuterPoints(inZoneMp);
      const inZoneCoreMp = manual && manual.lastEvalContours ? manual.lastEvalContours.inZoneCore : [];
      const inZoneCoreContour = multiLargestOuterPoints(inZoneCoreMp);
      const coreWorldMp = manual && manual.lastEvalContours ? manual.lastEvalContours.coreWorld : [];
      const alignedCoreContour = multiLargestOuterPoints(coreWorldMp);
      const p = {
        status: "matched",
        fragmentId: nextId,
        fragmentAreaMm2: Math.max(0, gainArea),
        gainAreaMm2: Math.max(0, gainArea),
        overlapAreaMm2: Number(mm.overlapAreaMm2 || 0),
        outsideAreaMm2: Number(mm.outsideAreaMm2 || 0),
        utilizationLocal: Number(mm.utilizationLocal || 0),
        scrapAreaMm2: Number(mm.pieceAreaMm2 || 0),
        inventoryTag: String(ap.inventoryTag || ""),
        scrapPieceId: String(ap.scrapPieceId || ""),
        alignedContour: toPointList(ap.points),
        alignedCoreContour,
        alignedCoreContours: Array.isArray(coreWorldMp) ? coreWorldMp : [],
        inZoneContour,
        inZoneContours: Array.isArray(inZoneMp) ? inZoneMp : [],
        inZoneCoreContour,
        inZoneCoreContours: Array.isArray(inZoneCoreMp) ? inZoneCoreMp : [],
        inZoneCoreAreaMm2: Number(mm && mm.inZoneCoreAreaMm2 || 0)
      };
      state.layoutRun.placements = (state.layoutRun.placements || []).concat([p]);
      state.layoutRun.manual.lastMetrics = null;
      state.layoutRun.manual.lastEvalContours = null;
      state.layoutRun.manual.activePiece = null;
      state.layoutRun.manual.statusNote = gainArea > 0 ? "Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅ" : "Р·Р°С„РёРєСЃРёСЂРѕРІР°РЅ (Р±РµР· РїСЂРёСЂРѕСЃС‚Р°)";
      updateManualStatsFromPlacements();
      renderPlacementRows(state.layoutRun.placements || []);
      await recomputeInventoryManualVisibility();
      renderInventoryManualPanel();
      renderScene();
    }

    async function recomputeInventoryManualVisibility() {
      if (!isManualInventoryMode()) return false;
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      const recomputeSeq = Number(state.layoutRun.manual.recomputeSeq || 0) + 1;
      state.layoutRun.manual.recomputeSeq = recomputeSeq;
      const isStale = () => {
        const currentSeq = Number(state.layoutRun && state.layoutRun.manual && state.layoutRun.manual.recomputeSeq || 0);
        return currentSeq !== recomputeSeq;
      };
      const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements : [];
      const selectedLayout = getSelectedLayoutEntry();
      const boundZone = selectedLayout && String(selectedLayout.mode || "") === "inventory_manual"
        ? ensureManualLayoutBinding(selectedLayout)
        : null;
      const selectedZoneId = Number(
        boundZone && boundZone.id
        || state.layoutRun && state.layoutRun.selectedZoneId
        || state.selectedZoneId
        || 0
      );
      const zoneBySelectedId = (Array.isArray(state.zones) ? state.zones : []).find((z) => Number(z && z.id || 0) === selectedZoneId) || null;
      const zoneByPlacements = getManualZoneForPlacements(placements);
      const refContour = placements.length
        ? (Array.isArray(placements[placements.length - 1] && placements[placements.length - 1].alignedContour)
          ? placements[placements.length - 1].alignedContour
          : [])
        : [];
      let zone = zoneBySelectedId || zoneByPlacements || getManualZone(refContour);
      if (!zone) {
        state.layoutRun.manual.lastMetrics = {
          gainAreaMm2: 0,
          overlapAreaMm2: 0,
          outsideAreaMm2: 0,
          utilizationLocal: 0,
          coveragePct: 0,
          status: "error",
          statusReason: "manual_zone_not_selected",
          recomputeSeq
        };
        state.layoutRun.manual.statusNote = "manual_zone_not_selected";
        renderInventoryManualPanel();
        renderManualTrayIntoRoot();
        renderScene();
        return false;
      }
      if (selectedLayout && String(selectedLayout.mode || "") === "inventory_manual") {
        selectedLayout.boundZoneId = Number(zone && zone.id || selectedLayout.boundZoneId || 0) || null;
        selectedLayout.boundDetailId = Number(zone && zone.detailId || selectedLayout.boundDetailId || 0) || null;
      }
      state.layoutRun.selectedZoneId = Number(zone && zone.id || selectedZoneId || 0) || null;
      await ensureManualPlacementsCoreContours();
      const toFlatContour = (raw) => {
        const out = [];
        const push = (x, y) => {
          const xn = Number(x);
          const yn = Number(y);
          if (Number.isFinite(xn) && Number.isFinite(yn)) out.push({ x: xn, y: yn });
        };
        const walk = (node) => {
          if (!node) return;
          if (Array.isArray(node)) {
            if (node.length >= 2 && Number.isFinite(Number(node[0])) && Number.isFinite(Number(node[1]))) {
              push(node[0], node[1]);
              return;
            }
            for (const child of node) walk(child);
            return;
          }
          if (typeof node === "object" && node.x !== undefined && node.y !== undefined) {
            push(node.x, node.y);
          }
        };
        walk(raw);
        return out;
      };
      // Manual mode: evaluate all actually placed contours, even if status got lost.
      const placementsForEval = placements
        .map((p) => {
          const alignedSingle = toFlatContour(p && p.alignedContour);
          const alignedMulti = toFlatContour(p && p.alignedContours);
          const alignedContour = alignedSingle.length >= 3 ? alignedSingle : (alignedMulti.length >= 3 ? alignedMulti : []);
          if (alignedContour.length < 3) return null;
          return { ...p, alignedContour, status: "matched" };
        })
        .filter(Boolean);
      const debugPlacementsPreview = placementsForEval.map((p, idx) => ({
        index: idx,
        pieceId: String(p && p.scrapPieceId || ""),
        inventoryTag: String(p && p.inventoryTag || ""),
        alignOffsetX: Number(p && p.alignOffsetX || 0),
        alignOffsetY: Number(p && p.alignOffsetY || 0),
        rotationDeg: Number(p && p.alignRotationDeg || 0),
        bboxWorld: contourBBox(p && p.alignedContour)
      }));
      const callRecomputeForZone = async (z) => {
        return api("/api/layout/manual/recompute", "POST", {
          zone: { id: z.id, points: z.points || [] },
          selectedZoneId: Number(z && z.id || selectedZoneId || 0) || null,
          placements: placementsForEval,
          pieceSeamReserveMm: getCurrentManualAllowanceMm(),
          layerPolicy: "first_on_top",
          minAreaMm2: 1,
          rasterMm: 2,
          debugManual: true
        });
      };
      let res = null;
      try {
        res = await callRecomputeForZone(zone);
      } catch (err) {
        res = { ok: false, error: String(err && err.message ? err.message : "manual_recompute_request_failed") };
      }
      if (isStale()) return false;
      const looksImpossibleZero = !!(res && res.ok && placementsForEval.length > 0 && Number(res.visibleMetrics && res.visibleMetrics.usefulAreaMm2 || 0) <= 1e-9 && Number(res.visibleMetrics && res.visibleMetrics.selectedPiecesAreaMm2 || 0) <= 1e-9);
      // Manual layouts are bound to a zone, but saved bindings can drift after reopening
      // or switching between multiple manual layouts. If a recompute returns impossible all-zero
      // metrics while pieces are visibly placed, retry against the zone inferred from placements.
      const allowZoneFallbackDiagnostics = !!zoneByPlacements && Number(zoneByPlacements && zoneByPlacements.id || 0) > 0;
      let usedZoneFallback = false;
      let recomputeDebug = null;
      if (looksImpossibleZero && allowZoneFallbackDiagnostics) {
        const placementZoneId = Number(zoneByPlacements && zoneByPlacements.id || 0);
        const selectedZoneNumericId = Number(zone && zone.id || 0);
        if (placementZoneId > 0 && placementZoneId !== selectedZoneNumericId) {
          try {
            const zz = await callRecomputeForZone(zoneByPlacements);
            if (isStale()) return false;
            const useful = Number(zz && zz.visibleMetrics && zz.visibleMetrics.usefulAreaMm2 || 0);
            const inZone = Number(zz && zz.visibleMetrics && zz.visibleMetrics.selectedInZoneAreaMm2 || 0);
            if (zz && zz.ok && (useful > 1e-9 || inZone > 1e-9 || (Array.isArray(zz.fragments) && zz.fragments.length > 0))) {
              res = zz;
              zone = zoneByPlacements;
              state.layoutRun.selectedZoneId = placementZoneId;
              state.selectedZoneId = placementZoneId;
              if (selectedLayout && String(selectedLayout.mode || "") === "inventory_manual") {
                selectedLayout.boundZoneId = placementZoneId;
                selectedLayout.boundDetailId = Number(zoneByPlacements && zoneByPlacements.detailId || selectedLayout.boundDetailId || 0) || null;
              }
              state.layoutRun.manual.statusNote = `СЂСѓС‡РЅР°СЏ РІС‹РєР»Р°РґРєР° РїРµСЂРµРїСЂРёРІСЏР·Р°РЅР° Рє Р·РѕРЅРµ ${placementZoneId}`;
              usedZoneFallback = true;
            }
          } catch (_) {}
        }
        if (usedZoneFallback) {
          usedZoneFallback = true;
          console.warn("[manual/recompute][front] impossible zero fixed by zone fallback", {
            originalSelectedZoneId: selectedZoneId,
            selectedZoneId: Number(zone && zone.id || 0),
            usefulAreaMm2: Number(res.visibleMetrics && res.visibleMetrics.usefulAreaMm2 || 0),
            selectedInZoneAreaMm2: Number(res.visibleMetrics && res.visibleMetrics.selectedInZoneAreaMm2 || 0),
            placements: placementsForEval.length
          });
        }
      }
      if (looksImpossibleZero) {
        console.warn("[manual/recompute][front] manual_recompute_selected_zone_mismatch", {
          selectedZoneId,
          recomputeZoneId: Number(zone && zone.id || 0),
          placements: placementsForEval.length,
          usedZoneFallback
        });
      }
      try {
        const debug = res && res.debug && typeof res.debug === "object" ? res.debug : null;
        if (debug) {
          recomputeDebug = debug;
          debug.usedZoneFallback = usedZoneFallback;
          debug.selectedZoneId = selectedZoneId;
          debug.recomputeZoneId = Number(zone && zone.id || 0);
          const firstScene = debugPlacementsPreview[0] || null;
          const firstEval = Array.isArray(debug.placements) ? (debug.placements[0] || null) : null;
          console.info("[manual/recompute][front] payload placements:", debugPlacementsPreview.length, debugPlacementsPreview);
          console.info("[manual/recompute][front] first placement scene vs evaluated:", { firstScene, firstEval });
          console.info("[manual/recompute][front] backend debug:", debug);
          if (state.layoutRun && state.layoutRun.manual) state.layoutRun.manual.lastRecomputeDiagnostics = debug;
        }
      } catch (_) {}
      if (isStale()) return false;
      if (!res || !res.ok) {
        state.layoutRun.manual.lastMetrics = {
          gainAreaMm2: 0,
          overlapAreaMm2: 0,
          outsideAreaMm2: 0,
          utilizationLocal: 0,
          coveragePct: 0,
          status: "error",
          statusReason: String(res && (res.error || res.errorCode) || "manual_recompute_failed"),
          recomputeSeq
        };
        state.layoutRun.manual.statusNote = "РѕС†РµРЅРєР° РЅРµ РїРѕР»СѓС‡РµРЅР°";
        renderInventoryManualPanel();
        renderManualTrayIntoRoot();
        renderScene();
        return false;
      }
      state.layoutRun.fragments = Array.isArray(res.fragments) ? res.fragments : [];
      const visibleContours = Array.isArray(res.visibleContours) ? res.visibleContours : [];
      const hasBackendSeamContours = Array.isArray(res.seamVisibleContours);
      const seamVisibleContours = hasBackendSeamContours ? res.seamVisibleContours : visibleContours;
      const seamGeometrySource = String(res.seamGeometrySource || (hasBackendSeamContours ? "backend_seam" : "visible"));
      const manualApplied = isManualInventoryMode() && String(state.layoutRun && state.layoutRun.status || "") === "applied";
      const isDirectInventory = isInventoryLikeLayoutMode(state.layoutMode) && !isManualInventoryMode();
      let seamSegments = [];
      const seamDiag = {};
      let seamSourceResolved = manualApplied ? "applied_fragments" : (isDirectInventory ? "direct_core" : "disabled_before_apply");
      if (manualApplied) {
        const appliedFragments = Array.isArray(res.fragments) ? res.fragments : [];
        seamSegments = computeSeamSegmentsFromAppliedFragments(appliedFragments, {
          minLenMm: 3,
          tolDistMm: 2.5,
          tolParallel: 0.35
        }, seamDiag);
        if (!Array.isArray(seamSegments) || seamSegments.length === 0) {
          seamSegments = computeSeamSegmentsFromVisibleContours(Array.isArray(seamVisibleContours) ? seamVisibleContours : [], {
            minLenMm: 3,
            tolDistMm: 2.5,
            tolParallel: 0.35
          }, seamDiag);
        }
        seamSourceResolved = `applied_fragments:${seamGeometrySource}`;
      } else if (!isDirectInventory && Array.isArray(res.fragments) && res.fragments.length >= 2) {
        // Regular layout вЂ” compute shared seam segments between adjacent fragments.
        seamSegments = computeSeamSegmentsFromAppliedFragments(res.fragments, {
          minLenMm: 3,
          tolDistMm: 2.5,
          tolParallel: 0.35
        }, seamDiag);
        seamSourceResolved = `regular:${seamGeometrySource}`;
      } else if (isDirectInventory) {
        // Seams from core geometry: adjacent core contours are ~2Г—seam_allowance apart,
        // so tolDistMm must span that gap (typically 24mm for 12mm allowance).
        const coreSeamContours = Array.isArray(res.seamVisibleContours) ? res.seamVisibleContours : seamVisibleContours;
        console.log("[seam-debug] directInventory seamVisibleContours:", coreSeamContours && coreSeamContours.length, "hasBackend:", Array.isArray(res.seamVisibleContours));
        seamSegments = computeSeamSegmentsFromVisibleContours(coreSeamContours, {
          minLenMm: 5,
          tolDistMm: 28,
          tolParallel: 0.35
        }, seamDiag);
        console.log("[seam-debug] result segments:", seamSegments && seamSegments.length, "diag:", JSON.stringify(seamDiag).slice(0, 200));
        seamSourceResolved = `direct_core:${seamGeometrySource}`;
      }
      if (seamSegments.length > 0) {
        const beforeBoundaryDrop = Array.isArray(seamSegments) ? seamSegments.length : 0;
        seamSegments = (Array.isArray(seamSegments) ? seamSegments : []).filter((seg) => !seamOnZoneBoundary(seg, zone && zone.points, 1.6));
        seamDiag.boundaryDropped = Math.max(0, beforeBoundaryDrop - seamSegments.length);
      }
      const coverageContours = manualApplied
        ? (Array.isArray(res.fragments)
          ? res.fragments
              .map((f) => normalizeContourArray((f && (f.points || f.cleanPoints || f.seamPoints)) || []))
              .filter((poly) => Array.isArray(poly) && poly.length >= 3)
          : [])
        : visibleContours;
      const coverageHoles = computeCoverageHoles(zone && zone.points, coverageContours);
      state.layoutRun.previewLayers = {
        pieceIntersections: Array.isArray(res.pieceIntersections) ? res.pieceIntersections : [],
        visibleArea: visibleContours,
        coverageHoles,
        seams: seamSegments
      };
      const vm = res.visibleMetrics || {};
      const zoneArea = Math.max(0, Number(polygonArea(zone.points || []) || 0));
      const usefulArea = Number(vm.usefulAreaMm2 || 0);
      const selectedPiecesArea = Number(vm.selectedPiecesAreaMm2 || 0);
      const selectedInZoneArea = Number(vm.selectedInZoneAreaMm2 || 0);
      const overlapArea = Number(vm.overlapAreaMm2 || 0);
      const outsideArea = Math.max(0, selectedPiecesArea - selectedInZoneArea);
      const utilizationLocal = selectedPiecesArea > 0 ? (usefulArea / selectedPiecesArea) : 0;
      const coveragePct = zoneArea > 0 ? (usefulArea / zoneArea) * 100 : 0;
      const seamsCount = Array.isArray(seamSegments) ? seamSegments.length : 0;
      const seamsTotalLengthMm = (Array.isArray(seamSegments) ? seamSegments : []).reduce((acc, s) => acc + Number(s && s.lengthMm || 0), 0);
      const seamItems = (Array.isArray(seamSegments) ? seamSegments : []).map((s, idx) => {
        const pts = Array.isArray(s && s.points) ? s.points : [];
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const p of pts) {
          const x = Number(p && p.x);
          const y = Number(p && p.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        const hasBBox = Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY);
        return {
          index: idx,
          pointCount: pts.length,
          bbox: hasBBox ? {
            minX: Math.round(minX * 1000) / 1000,
            minY: Math.round(minY * 1000) / 1000,
            maxX: Math.round(maxX * 1000) / 1000,
            maxY: Math.round(maxY * 1000) / 1000,
            width: Math.round((maxX - minX) * 1000) / 1000,
            height: Math.round((maxY - minY) * 1000) / 1000
          } : null
        };
      });
      state.layoutRun.manual.lastMetrics = {
        gainAreaMm2: usefulArea,
        overlapAreaMm2: overlapArea,
        outsideAreaMm2: outsideArea,
        utilizationLocal,
        coveragePct,
        seamsCount,
        seamsTotalLengthMm,
        status: "ok",
        recomputeSeq
      };
      state.layoutRun.manual.lastSeamDebug = {
        source: seamSourceResolved,
        seamContoursCount: Array.isArray(seamVisibleContours) ? seamVisibleContours.length : 0,
        seamsCount,
        fragmentsCount: Number(seamDiag.fragmentsCount || 0),
        candidatePairs: Number(seamDiag.candidatePairs || 0),
        acceptedSeams: Number(seamDiag.acceptedSeams || 0),
        boundaryDropped: Number(seamDiag.boundaryDropped || 0),
        rejectReasons: seamDiag.rejectReasons || {},
        fragments: Array.isArray(seamDiag.fragments) ? seamDiag.fragments : [],
        pairSamples: Array.isArray(seamDiag.pairSamples) ? seamDiag.pairSamples : [],
        seamItems,
        seamsTotalLengthMm: Math.round(seamsTotalLengthMm * 1000) / 1000,
        sample: seamsCount > 0 ? seamSegments[0] : null,
        usedZoneFallback: !!usedZoneFallback,
        selectedZoneId: Number(selectedZoneId || 0),
        recomputeZoneId: Number(zone && zone.id || 0),
        zoneByPlacementsId: Number(zoneByPlacements && zoneByPlacements.id || 0),
        layerEnabled: !!(state.layers && state.layers.visibleCore),
        renderedSeams: 0
      };
      if (recomputeDebug && Array.isArray(recomputeDebug.seamFragmentFlow)) {
        const flow = recomputeDebug.seamFragmentFlow;
        const byReason = {};
        let zeroVisible = 0;
        for (const it of flow) {
          if (Number(it && it.visibleAreaMm2 || 0) <= 1e-9) zeroVisible += 1;
          const r = String(it && it.droppedReason || "");
          if (r) byReason[r] = Number(byReason[r] || 0) + 1;
        }
        state.layoutRun.manual.lastSeamDebug.fragmentFlowSummary = {
          items: flow.length,
          zeroVisible,
          byReason
        };
      }
      console.info("[manual/seams][debug]", state.layoutRun.manual.lastSeamDebug);
      state.layoutRun.manual.statusNote = "РѕС†РµРЅРєР° РѕР±РЅРѕРІР»РµРЅР°";
      byId("invUsefulArea").textContent = Number(vm.usefulAreaMm2 || 0).toFixed(1);
      byId("invUsedScrapArea").textContent = Number(vm.selectedInZoneAreaMm2 || 0).toFixed(1);
      byId("invScrapUtilization").textContent = Number(vm.utilizationPct || 0).toFixed(2);
      byId("invOverlapArea").textContent = Number(vm.overlapAreaMm2 || 0).toFixed(1);
      renderInventoryManualPanel();
      renderManualTrayIntoRoot();
      renderScene();
      return true;
    }

    async function requestManualRecomputeFromUi() {
      if (!isManualInventoryMode()) return false;
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      const manual = state.layoutRun.manual;
      manual.recomputeUiQueue = Math.max(0, Number(manual.recomputeUiQueue || 0)) + 1;
      if (manual.recomputeUiRunning) return true;
      manual.recomputeUiRunning = true;
      let ok = true;
      try {
        while (Number(manual.recomputeUiQueue || 0) > 0) {
          manual.recomputeUiQueue = Math.max(0, Number(manual.recomputeUiQueue || 0) - 1);
          const res = await recomputeInventoryManualVisibility();
          if (res === false) ok = false;
        }
      } finally {
        manual.recomputeUiRunning = false;
        manual.recomputeUiQueue = 0;
      }
      return ok;
    }

    async function applyInventoryManualNow() {
      if (!isManualInventoryMode()) return false;
      state.layoutRun.status = "applied";
      const recomputeOk = await recomputeInventoryManualVisibility();
      if (recomputeOk === false) return false;
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      state.layoutRun.manual.activePiece = null;
      state.layoutRun.manual.lastEvalContours = null;
      state.layoutRun.manual.selectedCandidateTag = "";
      const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
      state.layoutRun.manual.statusNote = placements.length
        ? `РїСЂРёРјРµРЅРµРЅРѕ: ${placements.length} РєСѓСЃРєРѕРІ`
        : "РїСЂРёРјРµРЅРµРЅРѕ";
      const selectedManualLayout = Array.isArray(state.layouts)
        ? state.layouts.find((x) => Number(x && x.id || 0) === Number(state.selectedLayoutId || 0) && String(x && x.mode || "") === "inventory_manual")
        : null;
      let autosaveOk = false;
      if (selectedManualLayout) {
        try {
          const saveRes = await saveLayoutEntry(selectedManualLayout);
          autosaveOk = !!(saveRes && saveRes.ok);
        } catch (_) {
          autosaveOk = false;
        }
      }
      // Commit placements to furlab-access traceability log
      if (placements.length > 0) {
        try {
          const zone = state.zones.find((z) => Number(z && z.id) === Number(state.selectedZoneId));
          const commitPayload = {
            runRef: String(selectedManualLayout && selectedManualLayout.persistedRunId || ""),
            zoneName: String(zone && zone.name || String(state.selectedZoneId || "")),
            placements: placements.map((p) => {
              const contour = Array.isArray(p.alignedContour) ? p.alignedContour : [];
              const cx = contour.length ? contour.reduce((s, pt) => s + (pt.x || 0), 0) / contour.length : 0;
              const cy = contour.length ? contour.reduce((s, pt) => s + (pt.y || 0), 0) / contour.length : 0;
              return {
                inventoryTag: String(p.inventoryTag || ""),
                scrapPieceId: String(p.scrapPieceId || ""),
                rotationDeg: Number.isFinite(Number(p.rotationDeg || p.alignRotationDeg)) ? Number(p.rotationDeg || p.alignRotationDeg) : 0,
                offsetXmm: Math.round(cx * 10) / 10,
                offsetYmm: Math.round(cy * 10) / 10,
                resultContourSnapshot: contour.length ? JSON.stringify(contour) : null
              };
            })
          };
          await api("/api/ac-proxy/layout-runs/commit", "POST", commitPayload, 10000);
        } catch (_) {
          // non-critical вЂ” traceability commit failure should not block apply
        }
      }
      renderInventoryManualPanel();
      renderManualTrayIntoRoot();
      const workspaceInfo = byId("workspaceInfo");
      if (workspaceInfo) {
        workspaceInfo.textContent = autosaveOk
          ? `Р СѓС‡РЅР°СЏ РІС‹РєР»Р°РґРєР° РїСЂРёРјРµРЅРµРЅР° Рё СЃРѕС…СЂР°РЅРµРЅР°: ${placements.length} РєСѓСЃРєРѕРІ`
          : `Р СѓС‡РЅР°СЏ РІС‹РєР»Р°РґРєР° РїСЂРёРјРµРЅРµРЅР°: ${placements.length} РєСѓСЃРєРѕРІ`;
      }
      const step2Backdrop = byId("inventoryStep2Backdrop");
      if (step2Backdrop && step2Backdrop.style.display === "flex") closeInventoryStep2();
      renderScene();
      return true;
    }

    function updateManualStatsFromPlacements() {
      if (!isManualInventoryMode()) return;
      const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements : [];
      byId("invTotalFragments").textContent = String(placements.length);
      const gain = placements.reduce((a, p) => a + Number(p && p.gainAreaMm2 || 0), 0);
      const pieceArea = placements.reduce((a, p) => a + Number(p && p.scrapAreaMm2 || 0), 0);
      const overlap = placements.reduce((a, p) => a + Number(p && p.overlapAreaMm2 || 0), 0);
      const outside = placements.reduce((a, p) => a + Number(p && p.outsideAreaMm2 || 0), 0);
      byId("invUsefulArea").textContent = gain.toFixed(1);
      byId("invUsedScrapArea").textContent = pieceArea.toFixed(1);
      byId("invScrapUtilization").textContent = pieceArea > 0 ? ((gain / pieceArea) * 100).toFixed(2) : "0.00";
      byId("invScrapWaste").textContent = pieceArea > 0 ? (100 - ((gain / pieceArea) * 100)).toFixed(2) : "0.00";
      byId("invOverlapArea").textContent = overlap.toFixed(1);
      byId("invRejectedOutside").textContent = outside.toFixed(0);
    }

    async function requestInventoryManualSuggestions() {
      if (!isManualInventoryMode()) return;
      const selectedLayout = getSelectedLayoutEntry();
      const boundZoneId = Number(selectedLayout && String(selectedLayout.mode || "") === "inventory_manual" ? selectedLayout.boundZoneId : 0) || 0;
      const zone = state.zones.find((z) => Number(z.id) === Number(boundZoneId || state.layoutRun.selectedZoneId || state.selectedZoneId));
      if (!zone) return;
      const coveredContours = (state.layoutRun.fragments || [])
        .map((f) => Array.isArray(f && f.points) ? f.points : [])
        .filter((pts) => pts.length >= 3);
      const res = await api("/api/layout/manual/suggest", "POST", {
        zone: { id: zone.id, points: zone.points || [] },
        axis: state.layoutRun.lastAxis || "y",
        candidates: state.layoutRun.candidatePool || [],
        constraints: state.layoutRun.lastConstraints || {},
        filters: state.layoutRun.lastFilters || {},
        options: INVENTORY_OPTIMIZATION_PROFILE.options || {},
        excludeInventoryTags: [],
        coveredContours,
        suggestCount: 5
      });
      if (!res || !res.ok) return;
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      state.layoutRun.manual.suggestions = Array.isArray(res.suggestions) ? res.suggestions : [];
      renderInventoryManualPanel();
    }

    async function applyInventoryManualSuggestion(index) {
      if (!isManualInventoryMode()) return;
      const list = Array.isArray(state.layoutRun && state.layoutRun.manual && state.layoutRun.manual.suggestions)
        ? state.layoutRun.manual.suggestions
        : [];
      const s = list[Number(index)];
      if (!s || !s.placement) return;
      const p = { ...s.placement, status: "matched" };
      const nextId = (state.layoutRun.placements || []).length + 1;
      if (!Number.isFinite(Number(p.fragmentId))) p.fragmentId = nextId;
      if (!Number.isFinite(Number(p.fragmentAreaMm2))) p.fragmentAreaMm2 = Number(p.gainAreaMm2 || 0);
      state.layoutRun.placements = (state.layoutRun.placements || []).concat([p]);
      const fr = s.fragment && Array.isArray(s.fragment.points)
        ? { id: Number(p.fragmentId), points: s.fragment.points, areaMm2: Number(s.fragment.areaMm2 || p.fragmentAreaMm2 || 0) }
        : null;
      if (fr) state.layoutRun.fragments = (state.layoutRun.fragments || []).concat([fr]);
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      state.layoutRun.manual.lastMetrics = s.metrics || null;
      updateManualStatsFromPlacements();
      renderPlacementRows(state.layoutRun.placements || []);
      renderInventoryManualPanel();
      await requestManualRecomputeFromUi();
    }

    function removeInventoryManualPlacementByIndex(index, noteText) {
      if (!isManualInventoryMode()) return false;
      const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements.slice() : [];
      const idx = Number(index);
      if (!Number.isFinite(idx) || idx < 0 || idx >= placements.length) return false;
      const removed = placements[idx];
      state.layoutRun.placements = placements.filter((_, i) => i !== idx);
      const fragments = Array.isArray(state.layoutRun.fragments) ? state.layoutRun.fragments.slice() : [];
      const pid = Number(removed && removed.fragmentId || 0);
      state.layoutRun.fragments = fragments.filter((f) => Number(f && f.id || 0) !== pid);
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      const nextSel = Math.min(idx, Math.max(0, (state.layoutRun.placements || []).length - 1));
      state.layoutRun.manual.selectedPlacementIndex = (state.layoutRun.placements || []).length ? nextSel : -1;
      state.layoutRun.manual.statusNote = noteText || "РєСѓСЃРѕРє СѓРґР°Р»РµРЅ";
      state.layoutRun.manual.lastMetrics = null;
      updateManualStatsFromPlacements();
      renderPlacementRows(state.layoutRun.placements || []);
      renderInventoryManualPanel();
      renderManualTrayIntoRoot();
      renderScene();
      void requestManualRecomputeFromUi();
      return true;
    }

    function moveInventoryManualPlacementZ(index, direction) {
      if (!isManualInventoryMode()) return false;
      const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements.slice() : [];
      const idx = Number(index);
      const dir = Number(direction);
      if (!Number.isFinite(idx) || !Number.isFinite(dir) || idx < 0 || idx >= placements.length) return false;
      const targetIdx = idx + (dir > 0 ? 1 : -1);
      if (targetIdx < 0 || targetIdx >= placements.length) return false;
      const tmp = placements[idx];
      placements[idx] = placements[targetIdx];
      placements[targetIdx] = tmp;
      state.layoutRun.placements = placements;
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      state.layoutRun.manual.selectedPlacementIndex = targetIdx;
      state.layoutRun.manual.statusNote = dir > 0 ? "РєСѓСЃРѕРє РїРѕРґРЅСЏС‚ РїРѕ СЃР»РѕСЋ" : "РєСѓСЃРѕРє РѕРїСѓС‰РµРЅ РїРѕ СЃР»РѕСЋ";
      state.layoutRun.manual.lastMetrics = null;
      renderPlacementRows(state.layoutRun.placements || []);
      renderInventoryManualPanel();
      renderScene();
      void requestManualRecomputeFromUi();
      return true;
    }

    function moveInventoryManualPlacementToEdge(index, where) {
      if (!isManualInventoryMode()) return false;
      const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements.slice() : [];
      const idx = Number(index);
      if (!Number.isFinite(idx) || idx < 0 || idx >= placements.length) return false;
      const item = placements[idx];
      placements.splice(idx, 1);
      let targetIdx = 0;
      if (String(where || "") === "back") {
        placements.push(item);
        targetIdx = placements.length - 1;
      } else {
        placements.unshift(item);
        targetIdx = 0;
      }
      state.layoutRun.placements = placements;
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      state.layoutRun.manual.selectedPlacementIndex = targetIdx;
      state.layoutRun.manual.statusNote = String(where || "") === "back"
        ? "РєСѓСЃРѕРє РѕС‚РїСЂР°РІР»РµРЅ РЅР°Р·Р°Рґ РїРѕ СЃР»РѕСЋ"
        : "РєСѓСЃРѕРє РїРѕРґРЅСЏС‚ РЅР° РїРµСЂРµРґРЅРёР№ РїР»Р°РЅ";
      state.layoutRun.manual.lastMetrics = null;
      renderPlacementRows(state.layoutRun.placements || []);
      renderInventoryManualPanel();
      renderScene();
      void requestManualRecomputeFromUi();
      return true;
    }

    function rotateInventoryManualPlacement(index, deltaDeg) {
      if (!isManualInventoryMode()) return false;
      const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements : [];
      const idx = Number(index);
      const dd = Number(deltaDeg);
      if (!Number.isFinite(idx) || idx < 0 || idx >= placements.length || !Number.isFinite(dd) || Math.abs(dd) < 1e-9) return false;
      const pl = placements[idx];
      const contour = Array.isArray(pl && pl.alignedContour) ? pl.alignedContour : [];
      if (contour.length < 3) return false;
      const center = centroid(contour);
      const rad = (dd * Math.PI) / 180;
      const toPointObj = (q) => {
        if (Array.isArray(q) && q.length >= 2) {
          const x = Number(q[0]);
          const y = Number(q[1]);
          if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
        }
        const x = Number(q && q.x);
        const y = Number(q && q.y);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
        return null;
      };
      const isPointLike = (v) => !!toPointObj(v);
      const rotateOne = (list) => {
        if (!Array.isArray(list)) return list;
        return list.map((q) => {
          const src = toPointObj(q) || { x: Number(q && q.x), y: Number(q && q.y) };
          const out = rotatePoints([{ x: Number(src.x), y: Number(src.y) }], rad, center);
          return (Array.isArray(out) && out[0]) ? out[0] : src;
        }).filter((q) => Number.isFinite(Number(q && q.x)) && Number.isFinite(Number(q && q.y)));
      };
      const rotatePolyOrContour = (poly) => {
        if (!Array.isArray(poly) || !poly.length) return poly;
        if (Array.isArray(poly[0]) && (poly[0].length === 0 || isPointLike(poly[0][0]))) {
          return poly.map((ring) => rotateOne(ring));
        }
        return rotateOne(poly);
      };
      const rotateMany = (multi) => Array.isArray(multi) ? multi.map((poly) => rotatePolyOrContour(poly)) : multi;
      pl.alignedContour = rotateOne(pl.alignedContour);
      pl.inZoneContour = rotateOne(pl.inZoneContour);
      pl.alignedCoreContour = rotateOne(pl.alignedCoreContour);
      pl.inZoneCoreContour = rotateOne(pl.inZoneCoreContour);
      pl.usedVisibleContour = rotateOne(pl.usedVisibleContour);
      pl.alignedCoreContours = rotateMany(pl.alignedCoreContours);
      pl.inZoneContours = rotateMany(pl.inZoneContours);
      pl.inZoneCoreContours = rotateMany(pl.inZoneCoreContours);
      pl.usedVisibleContours = rotateMany(pl.usedVisibleContours);
      const prevRot = Number(pl.alignRotationDeg || 0);
      pl.alignRotationDeg = prevRot + dd;
      const baseNap = Number.isFinite(Number(pl.napDirectionDeg)) ? Number(pl.napDirectionDeg) : Number(state.layoutRun.lastNapDirectionDeg || DEFAULT_NAP_DIRECTION_DEG);
      pl.napEffectiveDeg = baseNap + Number(pl.alignRotationDeg || 0);
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      state.layoutRun.manual.selectedPlacementIndex = idx;
      state.layoutRun.manual.statusNote = "РєСѓСЃРѕРє РїРѕРІРµСЂРЅСѓС‚";
      state.layoutRun.manual.lastMetrics = null;
      renderPlacementRows(state.layoutRun.placements || []);
      renderInventoryManualPanel();
      renderScene();
      void requestManualRecomputeFromUi();
      return true;
    }

    function pushManualUndoCommand(cmd) {
      if (!state.layoutRun) return;
      if (!Array.isArray(state.layoutRun.manualUndoStack)) state.layoutRun.manualUndoStack = [];
      state.layoutRun.manualUndoStack.push(cmd);
      state.layoutRun.manualRedoStack = [];
    }

    function applyManualMoveGeom(idx, geom) {
      const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
      const pl = Number.isFinite(idx) && idx >= 0 ? placements[idx] : null;
      if (!pl || !geom) return;
      pl.alignedContour = Array.isArray(geom.alignedContour) ? geom.alignedContour.map((p) => ({ ...p })) : pl.alignedContour;
      if (Array.isArray(geom.inZoneContour)) pl.inZoneContour = geom.inZoneContour.map((p) => ({ ...p }));
      if (Array.isArray(geom.inZoneCoreContour)) pl.inZoneCoreContour = geom.inZoneCoreContour.map((p) => ({ ...p }));
    }

    async function undoInventoryManualPlacement() {
      if (!isManualInventoryMode()) return;
      const undoStack = Array.isArray(state.layoutRun && state.layoutRun.manualUndoStack) ? state.layoutRun.manualUndoStack : [];
      if (undoStack.length > 0) {
        const cmd = undoStack.pop();
        if (!Array.isArray(state.layoutRun.manualRedoStack)) state.layoutRun.manualRedoStack = [];
        state.layoutRun.manualRedoStack.push(cmd);
        if (cmd.type === "move-placement") {
          applyManualMoveGeom(cmd.idx, cmd.before);
          markLayoutDirty();
          renderScene();
        } else if (cmd.type === "remove-placement") {
          state.layoutRun.placements.splice(cmd.idx, 0, cmd.placement);
          markLayoutDirty();
          renderScene();
          renderPropertyEditor();
        }
        return;
      }
      // fallback: remove last placement
      const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements.slice() : [];
      if (!placements.length) return;
      removeInventoryManualPlacementByIndex(placements.length - 1, "РїРѕСЃР»РµРґРЅРёР№ РєСѓСЃРѕРє СѓРґР°Р»РµРЅ (Undo)");
    }

    function redoInventoryManualPlacement() {
      if (!isManualInventoryMode()) return;
      const redoStack = Array.isArray(state.layoutRun && state.layoutRun.manualRedoStack) ? state.layoutRun.manualRedoStack : [];
      if (!redoStack.length) return;
      const cmd = redoStack.pop();
      if (!Array.isArray(state.layoutRun.manualUndoStack)) state.layoutRun.manualUndoStack = [];
      state.layoutRun.manualUndoStack.push(cmd);
      if (cmd.type === "move-placement") {
        applyManualMoveGeom(cmd.idx, cmd.after);
        markLayoutDirty();
        renderScene();
      } else if (cmd.type === "remove-placement") {
        state.layoutRun.placements.splice(cmd.idx, 1);
        markLayoutDirty();
        renderScene();
        renderPropertyEditor();
      }
    }

    function buildManualTraySections(items) {
      const arr = Array.isArray(items) ? items.slice() : [];
      const sizesCm = arr
        .map((c) => getManualCandidateSizeCm(c))
        .filter((a) => Number.isFinite(a))
        .sort((a, b) => a - b);
      const pickQ = (q) => {
        if (!sizesCm.length) return 0;
        const pos = Math.max(0, Math.min(1, q)) * (sizesCm.length - 1);
        const lo = Math.floor(pos);
        const hi = Math.ceil(pos);
        if (lo === hi) return sizesCm[lo];
        const t = pos - lo;
        return sizesCm[lo] * (1 - t) + sizesCm[hi] * t;
      };
      const q33 = pickQ(0.33);
      const q66 = pickQ(0.66);
      const large = [];
      const medium = [];
      const small = [];
      for (const c of arr) {
        const s = Number(getManualCandidateSizeCm(c) || 0);
        if (s >= q66) large.push(c);
        else if (s <= q33) small.push(c);
        else medium.push(c);
      }
      return { large, medium, small, q33Cm: q33, q66Cm: q66 };
    }

    function getManualTrayThumbSvg(candidate, referenceSizeMm) {
      const pts = toPointList(parseScrapContourPoints(candidate && candidate.scrapContour));
      if (pts.length < 3) {
        return '<svg class="manual-piece-thumb" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"></svg>';
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const vw = 100;
      const vh = 100;
      const pad = 4;
      const localMax = Math.max(w, h);
      // Keep previews visually large; only lightly normalize very small pieces inside section.
      const refRaw = Number(referenceSizeMm || 0);
      const ref = Math.max(1, Number.isFinite(refRaw) && refRaw > 0 ? Math.min(refRaw, localMax * 1.15) : localMax);
      const sx = (vw - pad * 2) / ref;
      const sy = (vh - pad * 2) / ref;
      const s = Math.max(0.0001, Math.min(sx, sy));
      const ox = pad + (vw - pad * 2 - w * s) * 0.5;
      const oy = pad + (vh - pad * 2 - h * s) * 0.5;
      const d = pts.map((p, i) => {
        const x = (ox + (p.x - minX) * s).toFixed(2);
        const y = (vh - (oy + (p.y - minY) * s)).toFixed(2);
        return `${i === 0 ? "M" : "L"}${x} ${y}`;
      }).join(" ") + " Z";
      return `<svg class="manual-piece-thumb" viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="rgba(0,0,0,0.03)" stroke="#444" stroke-width="1"/></svg>`;
    }

    function getManualCandidateSizeCm(candidate) {
      const pts = toPointList(parseScrapContourPoints(candidate && candidate.scrapContour));
      if (pts.length >= 3) {
        const bb = polygonBBox(pts);
        if (bb) {
          const maxMm = Math.max(Number(bb.width || 0), Number(bb.height || 0));
          if (Number.isFinite(maxMm) && maxMm > 0) return maxMm / 10;
        }
      }
      const area = Number(candidate && candidate.areaMm2 || 0);
      if (!Number.isFinite(area) || area <= 0) return 0;
      // Fallback: equivalent square side in cm.
      return Math.sqrt(area) / 10;
    }

    function formatSectionRangeCm(kind, sections) {
      const q33 = Number(sections && sections.q33Cm || 0);
      const q66 = Number(sections && sections.q66Cm || 0);
      const unitCm = t("unit_cm", null, "cm");
      if (!(q33 > 0) || !(q66 > 0)) return "(\u2014)";
      if (kind === "small") return `(<=${q33.toFixed(1)} ${unitCm})`;
      if (kind === "large") return `(>=${q66.toFixed(1)} ${unitCm})`;
      return `(${q33.toFixed(1)}-${q66.toFixed(1)} ${unitCm})`;
    }

    function renderManualTrayIntoRoot() {
      const host = byId("manualTrayDock");
      if (!host) return;
      // Ensure fixed structure: resize handle + content div
      if (!byId("manualTrayResizeHandle")) {
        const h = document.createElement("div");
        h.className = "manual-tray-resize-handle";
        h.id = "manualTrayResizeHandle";
        host.insertBefore(h, host.firstChild);
        initManualTrayResizeHandle(h, host);
      }
      if (!byId("manualTrayContent")) {
        const c = document.createElement("div");
        c.id = "manualTrayContent";
        host.appendChild(c);
      }
      if (!isManualInventoryMode()) {
        host.classList.remove("active");
        const c = byId("manualTrayContent");
        if (c) c.innerHTML = "";
        host.style.left = "10px";
        host.style.right = "10px";
        host.style.bottom = "10px";
        host.style.top = "auto";
        host.style.width = "auto";
        return;
      }
      host.classList.add("active");
      const poolAll = Array.isArray(state.layoutRun && state.layoutRun.candidatePool) ? state.layoutRun.candidatePool : [];
      const usedCounts = new Map();
      const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
      for (const p of placements) {
        if (!p || String(p.status || "") !== "matched") continue;
        const tag = String(p.inventoryTag || p.id || "").trim();
        if (!tag) continue;
        usedCounts.set(tag, Number(usedCounts.get(tag) || 0) + 1);
      }
      const consumed = new Map();
      const pool = [];
      for (const c of poolAll) {
        const tag = String(c && (c.inventoryTag || c.id) || "").trim();
        if (!tag) {
          pool.push(c);
          continue;
        }
        const used = Number(usedCounts.get(tag) || 0);
        const seen = Number(consumed.get(tag) || 0);
        if (seen < used) {
          consumed.set(tag, seen + 1);
          continue;
        }
        pool.push(c);
      }
      if (!pool.length) {
        host.innerHTML = "";
        return;
      }
      const sections = buildManualTraySections(pool);
      const maxSectionSizeMm = (list) => {
        const arr = Array.isArray(list) ? list : [];
        let maxMm = 0;
        for (const c of arr) {
          const mm = Number(getManualCandidateSizeCm(c) || 0) * 10;
          if (Number.isFinite(mm) && mm > maxMm) maxMm = mm;
        }
        return maxMm > 0 ? maxMm : 1;
      };
      const sectionScaleMm = {
        large: maxSectionSizeMm(sections.large),
        medium: maxSectionSizeMm(sections.medium),
        small: maxSectionSizeMm(sections.small)
      };
      state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
      const selectedTag = String(state.layoutRun.manual.selectedCandidateTag || "");
      const selectedPlacementIndex = Number(state.layoutRun.manual.selectedPlacementIndex);
      const mm = state.layoutRun.manual && state.layoutRun.manual.lastMetrics ? state.layoutRun.manual.lastMetrics : null;
      const placedCount = Array.isArray(state.layoutRun && state.layoutRun.placements)
        ? state.layoutRun.placements.filter((p) => Array.isArray(p && p.alignedContour) && p.alignedContour.length >= 3).length
        : 0;
      const zoneForMetrics = getManualZoneForPlacements(state.layoutRun && state.layoutRun.placements) || getManualZone();
      const zoneAreaForMetrics = zoneForMetrics ? Math.max(0, Number(polygonArea(zoneForMetrics.points || []) || 0)) : 0;
      const metricsLine = mm
        ? (
          t(
            "manual_metrics_line",
            {
              pieces: placedCount,
              coverage: Number(mm.coveragePct || 0).toFixed(2),
              gain: Number(mm.gainAreaMm2 || 0).toFixed(1),
              overlap: Number(mm.overlapAreaMm2 || 0).toFixed(1),
              outside: Number(mm.outsideAreaMm2 || 0).toFixed(1),
              util: (Number(mm.utilizationLocal || 0) * 100).toFixed(2),
              zoneArea: zoneAreaForMetrics.toFixed(1),
              status: String(mm.status || "ok"),
              reason: mm.statusReason ? ` (${String(mm.statusReason)})` : ""
            },
            `РћС†РµРЅРєР°: РєСѓСЃРєРѕРІ=${placedCount} | РїРѕРєСЂС‹С‚РёРµ=${Number(mm.coveragePct || 0).toFixed(2)}% | РїРѕР»РµР·РЅРѕ=${Number(mm.gainAreaMm2 || 0).toFixed(1)} РјРјВІ | Р·РѕРЅР°=${zoneAreaForMetrics.toFixed(1)} РјРјВІ | РїРµСЂРµРєСЂС‹С‚РёРµ=${Number(mm.overlapAreaMm2 || 0).toFixed(1)} РјРјВІ | outside=${Number(mm.outsideAreaMm2 || 0).toFixed(1)} РјРјВІ | util=${(Number(mm.utilizationLocal || 0) * 100).toFixed(2)}%`
          )
          + ((String(mm.status || "ok") !== "ok")
            ? ` | status=${String(mm.status || "")}${mm.statusReason ? ` (${String(mm.statusReason)})` : ""}`
            : "")
        )
        : t("manual_metrics_prompt", { pieces: placedCount }, `РћС†РµРЅРєР°: РєСѓСЃРєРѕРІ=${placedCount} | РЅР°Р¶РјРёС‚Рµ "РћС†РµРЅРёС‚СЊ"`);
      const selectedPlacement = Number.isFinite(selectedPlacementIndex) && selectedPlacementIndex >= 0 && selectedPlacementIndex < placements.length
        ? placements[selectedPlacementIndex]
        : null;
      const selectedInfoLine = selectedPlacement
        ? `Р’С‹Р±СЂР°РЅ: ${String(selectedPlacement.inventoryTag || selectedPlacement.scrapPieceId || `#${selectedPlacementIndex + 1}`)} | СѓРіРѕР»=${Number(selectedPlacement.alignRotationDeg || 0).toFixed(1)}В° | СЃР»РѕР№=${selectedPlacementIndex + 1}/${placements.length}`
        : "Р’С‹Р±СЂР°РЅ: РЅРµС‚";
      const seamDbg = state.layoutRun && state.layoutRun.manual && state.layoutRun.manual.lastSeamDebug
        ? state.layoutRun.manual.lastSeamDebug
        : null;
      const seamRejectSummary = (() => {
        const rej = seamDbg && seamDbg.rejectReasons && typeof seamDbg.rejectReasons === "object"
          ? seamDbg.rejectReasons
          : null;
        if (!rej) return "";
        const order = ["same_owner", "disjoint", "point_touch_only", "shared_border_too_short", "not_collinear"];
        const parts = [];
        for (const key of order) {
          const count = Number(rej[key] || 0);
          if (count > 0) parts.push(`${key}=${count}`);
        }
        return parts.length ? ` | reject=${parts.join(",")}` : "";
      })();
      const seamDebugLine = seamDbg
        ? `РЁРІС‹: built=${Number(seamDbg.seamsCount || 0)} | rendered=${Number(seamDbg.renderedSeams || 0)} | seamContours=${Number(seamDbg.seamContoursCount || 0)} | frags=${Number(seamDbg.fragmentsCount || 0)} | pairs=${Number(seamDbg.candidatePairs || 0)} | source=${String(seamDbg.source || "unknown")} | layer=${(state.layers && state.layers.visibleCore) ? "on" : "off"} | selectedZone=${Number(seamDbg.selectedZoneId || 0)} | recomputeZone=${Number(seamDbg.recomputeZoneId || 0)} | zoneByPlacements=${Number(seamDbg.zoneByPlacementsId || 0)}${seamDbg.usedZoneFallback ? " | rebind=1" : ""}${seamRejectSummary}${(Number(seamDbg.fragmentsCount||0)<2 || Number(seamDbg.candidatePairs||0)<1) ? " | no_seams_reason=not_enough_fragments_or_pairs" : ""}`
        : "";
      const seamFlowSummary = (() => {
        const s = seamDbg && seamDbg.fragmentFlowSummary && typeof seamDbg.fragmentFlowSummary === "object"
          ? seamDbg.fragmentFlowSummary
          : null;
        if (!s) return "";
        const reasonsObj = s.byReason && typeof s.byReason === "object" ? s.byReason : {};
        const reasonKeys = Object.keys(reasonsObj).filter((k) => Number(reasonsObj[k] || 0) > 0).sort();
        const reasons = reasonKeys.map((k) => `${k}=${Number(reasonsObj[k] || 0)}`).join(",");
        return `coreFlow: items=${Number(s.items || 0)} | zeroVisible=${Number(s.zeroVisible || 0)}${reasons ? ` | reasons=${reasons}` : ""}`;
      })();
      const seamExcludedSummary = (() => {
        const diagnostics = state.layoutRun && state.layoutRun.manual && state.layoutRun.manual.lastRecomputeDiagnostics
          ? state.layoutRun.manual.lastRecomputeDiagnostics
          : null;
        const placementsAll = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
        const flow = diagnostics && Array.isArray(diagnostics.seamFragmentFlow) ? diagnostics.seamFragmentFlow : [];
        if (!placementsAll.length) return "";
        const excluded = [];
        const flowByKey = new Map();
        for (const it of flow) {
          const key = `${String(it && it.pieceId || "")}|${String(it && it.inventoryTag || "")}|${Number(it && it.placementIndex || -1)}`;
          flowByKey.set(key, it);
        }
        for (let i = 0; i < placementsAll.length; i += 1) {
          const p = placementsAll[i] || {};
          const key = `${String(p.scrapPieceId || "")}|${String(p.inventoryTag || "")}|${i}`;
          const tag = String(p.inventoryTag || p.scrapPieceId || `#${i + 1}`);
          const st = String(p.status || "");
          const flowRec = flowByKey.get(key) || null;
          if (st !== "matched") {
            excluded.push(`${tag}:status=${st || "unknown"}`);
            continue;
          }
          if (!flowRec) {
            excluded.push(`${tag}:missing_in_core_flow`);
            continue;
          }
          const added = Number(flowRec.fragmentsAdded || 0);
          const reason = String(flowRec.droppedReason || "");
          if (added <= 0) {
            excluded.push(`${tag}:${reason || "no_fragment_after_cleanup_or_thresholds"}`);
          }
        }
        return excluded.length ? `excluded(${excluded.length}): ${excluded.join(" | ")}` : "";
      })();
      const trayOpen = (state.layoutRun.manual.trayOpen && typeof state.layoutRun.manual.trayOpen === "object")
        ? state.layoutRun.manual.trayOpen
        : { large: false, medium: false, small: false, all: false };
      state.layoutRun.manual.trayOpen = trayOpen;
      const contentEl = byId("manualTrayContent") || host;
      if (manualTrayView && typeof manualTrayView.renderHtml === "function") {
        contentEl.innerHTML = manualTrayView.renderHtml({
          sections,
          trayOpen,
          debugOpen: !!(state.layoutRun.manual && state.layoutRun.manual.debugOpen),
          selectedTag,
          metricsLine,
          selectedInfoLine,
          seamDebugLine,
          seamFlowSummary,
          seamExcludedSummary,
          rotateStepDeg: Math.max(1, Math.round(Number((state.layoutRun && state.layoutRun.manual && state.layoutRun.manual.rotateStepDeg) || 5))),
          getThumbSvg: (c, sectionKey) => getManualTrayThumbSvg(c, sectionScaleMm[String(sectionKey || "")] || 0),
          formatSectionRangeCm: (kind, sectionsInput) => formatSectionRangeCm(kind, sectionsInput),
          noDataHtml: `<div class="tree-empty">${t("no_data", null, "-")}</div>`
        });
      } else {
        contentEl.innerHTML = '';
      }
      contentEl.querySelectorAll("button[data-manual-toolbar]").forEach((btn) => {
        btn.onclick = async () => {
          const action = String(btn.getAttribute("data-manual-toolbar") || "");
          try {
            if (action === "recompute") {
              await requestManualRecomputeFromUi();
              return;
            }
            if (action === "apply") {
              await applyInventoryManualNow();
              return;
            }
            const selIdx = Number(state.layoutRun && state.layoutRun.manual && state.layoutRun.manual.selectedPlacementIndex);
            const rotStep = Math.max(1, Math.round(Number((state.layoutRun && state.layoutRun.manual && state.layoutRun.manual.rotateStepDeg) || 5)));
            if (!Number.isFinite(selIdx) || selIdx < 0) return;
            if (action === "rotate-left") {
              rotateInventoryManualPlacement(selIdx, -rotStep);
              return;
            }
            if (action === "rotate-right") {
              rotateInventoryManualPlacement(selIdx, rotStep);
              return;
            }
            if (action === "z-up") {
              moveInventoryManualPlacementZ(selIdx, -1);
              return;
            }
            if (action === "z-down") {
              moveInventoryManualPlacementZ(selIdx, +1);
              return;
            }
            if (action === "z-front") {
              moveInventoryManualPlacementToEdge(selIdx, "front");
              return;
            }
            if (action === "z-back") {
              moveInventoryManualPlacementToEdge(selIdx, "back");
              return;
            }
            if (action === "rotate-step-plus") {
              state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
              state.layoutRun.manual.rotateStepDeg = Math.min(90, rotStep + 1);
              renderManualTrayIntoRoot();
              return;
            }
            if (action === "rotate-step-minus") {
              state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
              state.layoutRun.manual.rotateStepDeg = Math.max(1, rotStep - 1);
              renderManualTrayIntoRoot();
            }
          } catch (err) {
            const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
            if (manual) {
              manual.statusNote = String(err && err.message ? err.message : "manual_toolbar_action_failed");
            }
            renderInventoryManualPanel();
            renderManualTrayIntoRoot();
          }
        };
      });
      contentEl.querySelectorAll("button[data-manual-toggle]").forEach((btn) => {
        btn.onclick = () => {
          const key = String(btn.getAttribute("data-manual-toggle") || "");
          if (!key) return;
          trayOpen[key] = !trayOpen[key];
          renderManualTrayIntoRoot();
        };
      });
      contentEl.querySelectorAll("button[data-manual-debug-toggle]").forEach((btn) => {
        btn.onclick = () => {
          state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
          state.layoutRun.manual.debugOpen = !state.layoutRun.manual.debugOpen;
          renderManualTrayIntoRoot();
        };
      });
      contentEl.querySelectorAll("button[data-manual-piece]").forEach((btn) => {
        btn.ondragstart = (e) => {
          const tag = String(btn.getAttribute("data-manual-piece") || "");
          if (!tag || !e.dataTransfer) return;
          e.dataTransfer.setData("text/manual-piece-tag", tag);
          e.dataTransfer.effectAllowed = "copy";
        };
      });
      ensureManualTrayDragBehavior();
      ensureManualTrayDnD();
    }

    function ensureManualTrayDragBehavior() {
      if (manualTrayInteractions && typeof manualTrayInteractions.ensureDragBehavior === "function") {
        manualTrayInteractions.ensureDragBehavior();
      }
    }


    function ensureManualTrayDnD() {
      if (manualTrayInteractions && typeof manualTrayInteractions.ensureDnD === "function") {
        manualTrayInteractions.ensureDnD();
      }
    }

    function initManualTrayResizeHandle(handle, dock) {
      if (!handle || !dock) return;
      if (handle._resizeInited) return;
      handle._resizeInited = true;
      let startY = 0;
      let startHeight = 0;
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        startY = e.clientY;
        startHeight = dock.offsetHeight;
        const onMove = (ev) => {
          const dy = startY - ev.clientY;
          const newH = Math.max(80, Math.min(window.innerHeight * 0.85, startHeight + dy));
          dock.style.height = newH + "px";
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    function parseScrapContourPoints(scrapContourText) {
      if (!scrapContourText) return [];
      try {
        const parsed = JSON.parse(String(scrapContourText));
        const arr = Array.isArray(parsed && parsed.path) ? parsed.path : [];
        const out = [];
        for (const p of arr) {
          const x = Number(p && p.x);
          const y = Number(p && p.y);
          if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
        }
        return out;
      } catch (_) {
        return [];
      }
    }

    function translatePoints(points, dx, dy) {
      return (points || []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
    }

    function rotatePoints(points, angleRad, center) {
      const c = center || { x: 0, y: 0 };
      const ca = Math.cos(angleRad);
      const sa = Math.sin(angleRad);
      return (points || []).map((p) => {
        const x = p.x - c.x;
        const y = p.y - c.y;
        return {
          x: c.x + x * ca - y * sa,
          y: c.y + x * sa + y * ca
        };
      });
    }

    function dominantAxisAngle(points) {
      const pts = Array.isArray(points) ? points : [];
      if (pts.length < 2) return 0;
      const c = centroid(pts);
      let sxx = 0, sxy = 0, syy = 0;
      for (const p of pts) {
        const x = p.x - c.x;
        const y = p.y - c.y;
        sxx += x * x;
        sxy += x * y;
        syy += y * y;
      }
      // Principal direction of covariance matrix.
      return 0.5 * Math.atan2(2 * sxy, sxx - syy);
    }

    function rectPointsCentered(cx, cy, w, h) {
      const hw = Math.max(1, Number(w || 0)) * 0.5;
      const hh = Math.max(1, Number(h || 0)) * 0.5;
      return [
        { x: cx - hw, y: cy - hh },
        { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh },
        { x: cx - hw, y: cy + hh },
        { x: cx - hw, y: cy - hh }
      ];
    }

    function drawNapArrow(layer, centerWorld, angleDeg, lengthMm) {
      const len = Math.max(10, Number(lengthMm || 18));
      const safeAngle = Number.isFinite(Number(angleDeg)) ? Number(angleDeg) : DEFAULT_NAP_DIRECTION_DEG;
      const a = (safeAngle * Math.PI) / 180;
      // Angle contract: 0deg from +X, clockwise, Y-down (UI/DB).
      // World space here is Y-up, so Y component must be inverted for drawing.
      const p1 = { x: centerWorld.x - Math.cos(a) * len * 0.5, y: centerWorld.y + Math.sin(a) * len * 0.5 };
      const p2 = { x: centerWorld.x + Math.cos(a) * len * 0.5, y: centerWorld.y - Math.sin(a) * len * 0.5 };
      const s1 = worldToScreen(p1);
      const s2 = worldToScreen(p2);
      layer.add(new Konva.Arrow({
        points: [s1.x, s1.y, s2.x, s2.y],
        stroke: ENGINEERING_STYLES.napArrow.stroke,
        fill: ENGINEERING_STYLES.napArrow.fill,
        pointerLength: 6,
        pointerWidth: 5,
        strokeWidth: ENGINEERING_STYLES.napArrow.strokeWidth
      }));
    }

    function getLayoutModeTitle(mode) {
      const layoutModeApi = window.FurLabLayoutModes || {};
      if (typeof layoutModeApi.getLayoutModeTitle === "function") {
        return layoutModeApi.getLayoutModeTitle(mode);
      }
      return String(mode || "");
    }
    function isInventoryLikeLayoutMode(mode) {
      const layoutModeApi = window.FurLabLayoutModes || {};
      if (typeof layoutModeApi.isInventoryLikeLayoutMode === "function") {
        return !!layoutModeApi.isInventoryLikeLayoutMode(mode);
      }
      return String(mode || "") === "inventory";
    }
    function getLayoutModeCatalog() {
      const layoutModeApi = window.FurLabLayoutModes || {};
      if (typeof layoutModeApi.getLayoutModeCatalog === "function") {
        return layoutModeApi.getLayoutModeCatalog();
      }
      return [];
    }
    function getLayoutModeThumbSvg(mode, large) {
      const layoutModeApi = window.FurLabLayoutModes || {};
      if (typeof layoutModeApi.getLayoutModeThumbSvg === "function") {
        return layoutModeApi.getLayoutModeThumbSvg(mode, large);
      }
      return "";
    }
    const layoutTypePickerApi = window.FurLabLayoutTypePicker || {};
    const layoutTypePicker = (typeof layoutTypePickerApi.createLayoutTypePicker === "function")
      ? layoutTypePickerApi.createLayoutTypePicker({
        byId,
        getLibraryMode: () => String(state.libraryPickerMode || "layouts"),
        setLibraryMode: (mode) => {
          state.libraryPickerMode = String(mode || "layouts");
        },
        getCatalog: (libraryMode) => {
          const mode = String(libraryMode || "layouts");
          if (mode === "materials") return Array.isArray(state.furMaterialsCatalog) ? state.furMaterialsCatalog : [];
          if (mode === "processing") return [];
          return getLayoutModeCatalog();
        },
        getCardHtml: (libraryMode, item) => {
          const mode = String(libraryMode || "layouts");
          if (mode === "materials") {
            const swatchSvg = buildMaterialPreviewSvgMarkup(item);
            const debugText = describeMaterialPatternDebug(item);
            return `
                <div class="layout-type-thumb material-type-thumb"><div class="material-type-swatch material-type-swatch-inline">${swatchSvg}</div></div>
                <div class="layout-type-title">${escapeHtml(String(item && item.species || item && item.name || "-"))}</div>
                <div class="layout-type-debug">${escapeHtml(debugText)}</div>
              `;
          }
          const itemMode = String(item && item.mode || "");
          return `${getLayoutModeThumbSvg(itemMode, true)}<div class="layout-type-title">${String(item && item.title || itemMode)}</div>`;
        },
        getItemKey: (libraryMode, item) => String(String(libraryMode || "layouts") === "materials" ? (item && item.id || "") : (item && item.mode || "")),
        getPreferredKey: (libraryMode) => {
          const mode = String(libraryMode || "layouts");
          if (mode === "materials") {
            if (state.pendingZoneMaterialZoneId) {
              const zone = state.zones.find((item) => Number(item && item.id || 0) === Number(state.pendingZoneMaterialZoneId || 0)) || null;
              return String(zone && zone.materialId || state.selectedMaterialId || "");
            }
            return String(state.selectedMaterialId || "");
          }
          const selectedLayout = Array.isArray(state.layouts)
            ? (state.layouts.find((x) => Number(x.id || 0) === Number(state.selectedLayoutId || 0)) || null)
            : null;
          return String((selectedLayout && selectedLayout.mode) || state.layoutMode || "");
        },
        getAddButtonLabel: (libraryMode) => String(libraryMode || "layouts") === "materials" ? "Р’С‹Р±СЂР°С‚СЊ РјРµС…" : "Р’С‹Р±СЂР°С‚СЊ"
      })
      : null;
    function openLayoutTypePicker() {
      state.libraryPickerMode = "layouts";
      state.pendingZoneMaterialZoneId = null;
      if (layoutTypePicker && typeof layoutTypePicker.open === "function") {
        layoutTypePicker.open();
        return;
      }
      byId("layoutTypeBackdrop").style.display = "flex";
    }
    function closeLayoutTypePicker() {
      state.pendingZoneMaterialZoneId = null;
      if (layoutTypePicker && typeof layoutTypePicker.close === "function") {
        layoutTypePicker.close();
        return;
      }
      byId("layoutTypeBackdrop").style.display = "none";
    }
    function addLayoutByMode(mode) {
      saveCurrentLayoutRuntimeSnapshot();
      const catalog = getLayoutModeCatalog();
      const normalizedMode = String(mode || "").trim();
      const picked = catalog.find((x) => String(x && x.mode || "") === normalizedMode);
      if (!picked) {
        byId("workspaceInfo").textContent = t("mode_pick_error", { mode: normalizedMode || "-" }, `Mode selection error: ${normalizedMode || "-"}`);
        return;
      }
      if ((!Array.isArray(state.zones) || state.zones.length === 0) && Array.isArray(state.details) && state.details.length > 0) {
        initZonesFromDetails();
      }
      const id = state.nextLayoutId++;
      const selectedZone = (Array.isArray(state.zones) ? state.zones : []).find((z) => Number(z && z.id || 0) === Number(state.selectedZoneId || 0))
        || ((Array.isArray(state.zones) ? state.zones : [])[0] || null);
      const selectedZoneId = Number(selectedZone && selectedZone.id || 0) || null;
      const selectedDetailId = Number(selectedZone && selectedZone.detailId || state.selectedDetailId || 0) || null;
      if (selectedZoneId) {
        // Intarsia layouts coexist with regular layouts on the same zone вЂ” only block if a non-intarsia layout already occupies it
        const occupiedBy = (Array.isArray(state.layouts) ? state.layouts : []).find((x) =>
          x && Number(x.boundZoneId || 0) === selectedZoneId
          && String(x.mode || "") !== "intarsia"
          && normalizedMode !== "intarsia"
        );
        if (occupiedBy) {
          const zoneName = String(selectedZone && selectedZone.name || `Р—РѕРЅР° ${selectedZoneId}`);
          const msg = byId("zoneOccupiedMessage");
          if (msg) msg.textContent = `Р—РѕРЅР° "${zoneName}" СѓР¶Рµ Р·Р°РЅСЏС‚Р° РІС‹РєР»Р°РґРєРѕР№ "${String(occupiedBy.name || "-")}". РЈРґР°Р»РёС‚Рµ РµС‘ РёР»Рё РІС‹Р±РµСЂРёС‚Рµ РґСЂСѓРіСѓСЋ Р·РѕРЅСѓ.`;
          const bd = byId("zoneOccupiedBackdrop");
          if (bd) bd.style.display = "flex";
          closeLayoutTypePicker();
          state.nextLayoutId--;
          return null;
        }
      }
      const existingDraft = (Array.isArray(state.layouts) ? state.layouts : []).find((x) =>
        x
        && !x.persistedRunId
        && String(x.mode || "") === normalizedMode
        && Number(x.boundZoneId || 0) === Number(selectedZoneId || 0)
        && Number(x.boundDetailId || 0) === Number(selectedDetailId || 0)
      );
      if (existingDraft) {
        void openLayoutEntry(existingDraft);
        byId("workspaceInfo").textContent = "РСЃРїРѕР»СЊР·СѓРµРј СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ С‡РµСЂРЅРѕРІРёРє РІС‹РєР»Р°РґРєРё РґР»СЏ РІС‹Р±СЂР°РЅРЅРѕР№ Р·РѕРЅС‹.";
        return existingDraft;
      }
      const entry = {
        id,
        mode: picked.mode,
        name: `${picked.title} ${id}`,
        boundZoneId: selectedZoneId,
        boundDetailId: selectedDetailId,
        isDirty: true
      };
      state.layouts.push(entry);
      void openLayoutEntry(entry);
      return entry;
    }
    function getSelectedLayoutEntry() {
      return Array.isArray(state.layouts)
        ? (state.layouts.find((x) => Number(x && x.id || 0) === Number(state.selectedLayoutId || 0)) || null)
        : null;
    }
    function resolveZoneById(zoneId) {
      const zid = Number(zoneId || 0);
      if (!zid) return null;
      return (Array.isArray(state.zones) ? state.zones : []).find((z) => Number(z && z.id || 0) === zid) || null;
    }
    function resolvePreferredZoneByDetail(detailId) {
      const did = Number(detailId || 0);
      if (!did) return null;
      return (Array.isArray(state.zones) ? state.zones : []).find((z) => Number(z && z.detailId || 0) === did) || null;
    }
    function ensureManualLayoutBinding(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e || String(e.mode || "") !== "inventory_manual") return null;
      let zone = resolveZoneById(e.boundZoneId) || resolveZoneById(state.selectedZoneId) || null;
      if (!zone) zone = (Array.isArray(state.zones) ? state.zones : [])[0] || null;
      if (!zone) return null;
      e.boundZoneId = Number(zone.id || 0) || null;
      e.boundDetailId = Number(zone.detailId || state.selectedDetailId || 0) || null;
      return zone;
    }
    function isLocalRuntimeLayoutMode(mode) {
      const normalizedMode = String(mode || "").trim();
      return normalizedMode === "inventory_manual" || normalizedMode === "longitudinal" || normalizedMode === "shifted" || normalizedMode === "transverse" || normalizedMode === "radial" || normalizedMode === "intarsia";
    }
    function ensureLocalRuntimeLayoutBinding(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e || !isLocalRuntimeLayoutMode(e.mode)) return null;
      if (String(e.mode || "") === "inventory_manual") return ensureManualLayoutBinding(e);
      let zone = resolveZoneById(e.boundZoneId) || resolveZoneById(state.selectedZoneId) || null;
      if (!zone) zone = (Array.isArray(state.zones) ? state.zones : [])[0] || null;
      if (!zone) return null;
      e.boundZoneId = Number(zone.id || 0) || null;
      e.boundDetailId = Number(zone.detailId || state.selectedDetailId || 0) || null;
      return zone;
    }
    function buildManualLayoutSnapshot() {
      const lr = state.layoutRun && typeof state.layoutRun === "object" ? state.layoutRun : {};
      const selectedLayout = getSelectedLayoutEntry();
      const boundZoneId = Number(selectedLayout && String(selectedLayout.mode || "") === "inventory_manual" ? selectedLayout.boundZoneId : 0) || 0;
      const boundDetailId = Number(selectedLayout && String(selectedLayout.mode || "") === "inventory_manual" ? selectedLayout.boundDetailId : 0) || 0;
      const snapshot = {
        selectedZoneId: Number(boundZoneId || lr.selectedZoneId || state.selectedZoneId || 0) || null,
        selectedDetailId: Number(boundDetailId || state.selectedDetailId || 0) || null,
        layoutRun: {
          active: !!lr.active,
          status: String(lr.status || "preview"),
          fillType: String(lr.fillType || "voronoi"),
          strategy: String(lr.strategy || "inventory_manual"),
          inventoryScenario: String(lr.inventoryScenario || "A"),
          selectedZoneId: Number(boundZoneId || lr.selectedZoneId || state.selectedZoneId || 0) || null,
          allowanceMm: Number(parseLocaleNumber(lr.allowanceMm, 12) || 12),
          placements: Array.isArray(lr.placements) ? lr.placements : [],
          fragments: Array.isArray(lr.fragments) ? lr.fragments : [],
          previewLayers: lr.previewLayers && typeof lr.previewLayers === "object" ? lr.previewLayers : { pieceIntersections: [], visibleArea: [], seams: [] },
          splitEvents: Array.isArray(lr.splitEvents) ? lr.splitEvents : [],
          stats: lr.stats && typeof lr.stats === "object" ? lr.stats : { violations: 0, intersections: 0, uncovered: 0 },
          candidatePool: Array.isArray(lr.candidatePool) ? lr.candidatePool : [],
          lastFilters: lr.lastFilters && typeof lr.lastFilters === "object" ? lr.lastFilters : {},
          lastConstraints: lr.lastConstraints && typeof lr.lastConstraints === "object" ? lr.lastConstraints : {},
          lastAxis: String(lr.lastAxis || "y"),
          lastNapDirectionDeg: Number(lr.lastNapDirectionDeg || DEFAULT_NAP_DIRECTION_DEG),
          lastSeed: Number(lr.lastSeed || 0) || null,
          paramsSnapshot: lr.paramsSnapshot && typeof lr.paramsSnapshot === "object" ? lr.paramsSnapshot : null,
          resultStatus: String(lr.resultStatus || "ok"),
          failedReason: lr.failedReason || null,
          manual: lr.manual && typeof lr.manual === "object" ? lr.manual : {}
        }
      };
      return JSON.parse(JSON.stringify(snapshot));
    }
    function buildEmptyManualLayoutSnapshot() {
      const selectedLayout = getSelectedLayoutEntry();
      const selectedZoneId = Number(selectedLayout && selectedLayout.boundZoneId || state.selectedZoneId || 0) || null;
      const selectedDetailId = Number(selectedLayout && selectedLayout.boundDetailId || state.selectedDetailId || 0) || null;
      return {
        selectedZoneId,
        selectedDetailId,
        layoutRun: {
          active: true,
          status: "preview",
          fillType: "voronoi",
          strategy: "inventory_manual",
          inventoryScenario: "A",
          selectedZoneId,
          allowanceMm: Number(parseLocaleNumber(getCurrentManualAllowanceMm(), 12) || 12),
          placements: [],
          fragments: [],
          previewLayers: { pieceIntersections: [], visibleArea: [], coverageHoles: [], seams: [] },
          splitEvents: [],
          stats: { violations: 0, intersections: 0, uncovered: 1 },
          candidatePool: [],
          lastFilters: {},
          lastConstraints: {},
          lastAxis: "y",
          lastNapDirectionDeg: DEFAULT_NAP_DIRECTION_DEG,
          lastSeed: null,
          paramsSnapshot: null,
          resultStatus: "ok",
          failedReason: null,
          manual: {
            suggestions: [],
            lastMetrics: null,
            selectedCandidateTag: "",
            activePiece: null,
            lastEvalContours: null,
            statusNote: "РЅРµС‚ Р°РєС‚РёРІРЅРѕРіРѕ",
            selectedPlacementIndex: -1
          }
        }
      };
    }
    function buildFragmentOnlyLayoutSnapshot(mode) {
      const normalizedMode = String(mode || "").trim();
      const lr = state.layoutRun && typeof state.layoutRun === "object" ? state.layoutRun : {};
      const selectedLayout = getSelectedLayoutEntry();
      const boundZoneId = Number(
        selectedLayout
        && String(selectedLayout.mode || "") === normalizedMode
        && selectedLayout.boundZoneId
        || lr.selectedZoneId
        || state.selectedZoneId
        || 0
      ) || 0;
      const boundDetailId = Number(
        selectedLayout
        && String(selectedLayout.mode || "") === normalizedMode
        && selectedLayout.boundDetailId
        || state.selectedDetailId
        || 0
      ) || 0;
      const snapshot = {
        selectedZoneId: boundZoneId || null,
        selectedDetailId: boundDetailId || null,
        intarsiaSvgFragments: Array.isArray(state.intarsiaSvgFragments) ? state.intarsiaSvgFragments : null,
        intarsiaSvgFileName: state.intarsiaSvgFileName || null,
        layoutRun: {
          active: !!lr.active,
          status: String(lr.status || "preview"),
          fillType: String(lr.fillType || "regular"),
          strategy: String(lr.strategy || normalizedMode),
          inventoryScenario: String(lr.inventoryScenario || ""),
          selectedZoneId: boundZoneId || null,
          allowanceMm: Number(parseLocaleNumber(lr.allowanceMm, 12) || 12),
          placements: [],
          fragments: Array.isArray(lr.fragments) ? lr.fragments : [],
          previewLayers: lr.previewLayers && typeof lr.previewLayers === "object"
            ? lr.previewLayers
            : { pieceIntersections: [], visibleArea: [], coverageHoles: [], seams: [] },
          splitEvents: Array.isArray(lr.splitEvents) ? lr.splitEvents : [],
          stats: lr.stats && typeof lr.stats === "object"
            ? lr.stats
            : { fragmentsTotal: Array.isArray(lr.fragments) ? lr.fragments.length : 0 },
          candidatePool: [],
          lastFilters: {},
          lastConstraints: {},
          lastAxis: String(lr.lastAxis || "y"),
          lastNapDirectionDeg: Number(lr.lastNapDirectionDeg || DEFAULT_NAP_DIRECTION_DEG),
          lastSeed: Number(lr.lastSeed || 0) || null,
          paramsSnapshot: lr.paramsSnapshot && typeof lr.paramsSnapshot === "object" ? lr.paramsSnapshot : null,
          resultStatus: String(lr.resultStatus || "ok"),
          failedReason: lr.failedReason || null,
          manual: {}
        }
      };
      return JSON.parse(JSON.stringify(snapshot));
    }
    function buildEmptyFragmentOnlyLayoutSnapshot(mode, entry) {
      const normalizedMode = String(mode || "").trim();
      const e = entry && typeof entry === "object" ? entry : getSelectedLayoutEntry();
      const selectedZoneId = Number(e && e.boundZoneId || state.selectedZoneId || 0) || null;
      const selectedDetailId = Number(e && e.boundDetailId || state.selectedDetailId || 0) || null;
      return {
        selectedZoneId,
        selectedDetailId,
        layoutRun: {
          active: false,
          status: "idle",
          fillType: "regular",
          strategy: normalizedMode,
          inventoryScenario: "",
          selectedZoneId,
          allowanceMm: Number(parseLocaleNumber(state.layoutRun && state.layoutRun.allowanceMm, 12) || 12),
          placements: [],
          fragments: [],
          previewLayers: { pieceIntersections: [], visibleArea: [], coverageHoles: [], seams: [] },
          splitEvents: [],
          stats: { fragmentsTotal: 0 },
          candidatePool: [],
          lastFilters: {},
          lastConstraints: {},
          lastAxis: "y",
          lastNapDirectionDeg: DEFAULT_NAP_DIRECTION_DEG,
          lastSeed: null,
          paramsSnapshot: { options: { rows: 5, cols: 5, axisCount: 1, angleDeg: 45, bandStepMm: 120, shiftPercent: 50, ringCount: 4, sectorCount: 8, rotationDeg: 0, innerRadiusMm: 0, centerMode: "auto", centerX: 0, centerY: 0, gapX: 0, gapY: 0, cornerRadius: 0 } },
          resultStatus: "ok",
          failedReason: null,
          manual: {}
        }
      };
    }
    function syncFragmentOnlyControlsFromSnapshot(snapshot) {
      const options = snapshot && snapshot.layoutRun && snapshot.layoutRun.paramsSnapshot && snapshot.layoutRun.paramsSnapshot.options
        ? snapshot.layoutRun.paramsSnapshot.options
        : (snapshot && snapshot.layoutRun && snapshot.layoutRun.options ? snapshot.layoutRun.options : null);
      if (!options || typeof options !== "object") return;
      if (byId("fillRows") && Number.isFinite(Number(options.rows))) byId("fillRows").value = String(Number(options.rows));
      if (byId("fillCols") && Number.isFinite(Number(options.cols))) byId("fillCols").value = String(Number(options.cols));
      if (byId("fillAxisCount") && Number.isFinite(Number(options.axisCount))) byId("fillAxisCount").value = String(Number(options.axisCount));
      if (byId("fillBandStep") && Number.isFinite(Number(options.bandStepMm))) byId("fillBandStep").value = String(Number(options.bandStepMm));
      if (byId("fillRingCount") && Number.isFinite(Number(options.ringCount))) byId("fillRingCount").value = String(Number(options.ringCount));
      if (byId("fillSectorCount") && Number.isFinite(Number(options.sectorCount))) byId("fillSectorCount").value = String(Number(options.sectorCount));
      if (byId("fillSectorRotationDeg") && Number.isFinite(Number(options.rotationDeg))) byId("fillSectorRotationDeg").value = String(Number(options.rotationDeg));
      if (byId("fillInnerRadiusMm") && Number.isFinite(Number(options.innerRadiusMm))) byId("fillInnerRadiusMm").value = String(Number(options.innerRadiusMm));
      if (byId("fillCenterMode") && typeof options.centerMode === "string") byId("fillCenterMode").value = String(options.centerMode);
      if (byId("fillCenterX") && Number.isFinite(Number(options.centerX))) byId("fillCenterX").value = String(Number(options.centerX));
      if (byId("fillCenterY") && Number.isFinite(Number(options.centerY))) byId("fillCenterY").value = String(Number(options.centerY));
      if (byId("fillGapX") && Number.isFinite(Number(options.gapX))) byId("fillGapX").value = String(Number(options.gapX));
      if (byId("fillGapY") && Number.isFinite(Number(options.gapY))) byId("fillGapY").value = String(Number(options.gapY));
      if (byId("fillCornerRadius") && Number.isFinite(Number(options.cornerRadius))) byId("fillCornerRadius").value = String(Number(options.cornerRadius));
      if (byId("fillAngleDeg") && Number.isFinite(Number(options.angleDeg))) byId("fillAngleDeg").value = String(Number(options.angleDeg));
      if (byId("fillShiftPercent") && Number.isFinite(Number(options.shiftPercent))) byId("fillShiftPercent").value = String(Number(options.shiftPercent));
      const nr = snapshot && snapshot.layoutRun && snapshot.layoutRun.paramsSnapshot && snapshot.layoutRun.paramsSnapshot.inputs && snapshot.layoutRun.paramsSnapshot.inputs.normalizeRules;
      if (nr && typeof nr === "object") {
        if (byId("fragmentMinAlongMm") && Number.isFinite(Number(nr.fragmentMinAlongMm))) byId("fragmentMinAlongMm").value = String(Number(nr.fragmentMinAlongMm));
        if (byId("fragmentMinAcrossMm") && Number.isFinite(Number(nr.fragmentMinAcrossMm))) byId("fragmentMinAcrossMm").value = String(Number(nr.fragmentMinAcrossMm));
      }
    }
    function hasFragmentOnlySnapshotData(snapshot) {
      const frags = Array.isArray(snapshot && snapshot.layoutRun && snapshot.layoutRun.fragments)
        ? snapshot.layoutRun.fragments
        : [];
      return frags.length > 0;
    }
    function markLayoutDirty(entry, dirty = true) {
      const e = entry && typeof entry === "object" ? entry : getSelectedLayoutEntry();
      if (!e) return;
      e.isDirty = !!dirty;
    }
    let radialCenterPreviewTimer = null;
    const getZoneBounds = (pts) => window.FurLabUtils.getZoneBounds(pts);
    const getZoneCenterPoint = (z) => window.FurLabUtils.getZoneCenterPoint(z);
    function isLayoutEditEnabledInScene(entry) {
      const layout = entry && typeof entry === "object" ? entry : getSelectedLayoutEntry();
      if (!layout) return true;
      const ui = state.propertyEditorUi && typeof state.propertyEditorUi === "object" ? state.propertyEditorUi : null;
      const map = ui && ui.layoutEdit && typeof ui.layoutEdit === "object" ? ui.layoutEdit : null;
      const key = String(layout.id || "");
      if (!map || !key || !Object.prototype.hasOwnProperty.call(map, key)) return false;
      return !!map[key];
    }
    function resolveCurrentRadialZone() {
      const selectedLayout = getSelectedLayoutEntry();
      const boundZoneId = Number(selectedLayout && String(selectedLayout.mode || "") === "radial" ? selectedLayout.boundZoneId : 0) || 0;
      const runZoneId = Number(state.layoutRun && state.layoutRun.selectedZoneId || 0) || 0;
      const selectedZoneId = Number(state.selectedZoneId || 0) || 0;
      return resolveZoneById(boundZoneId) || resolveZoneById(runZoneId) || resolveZoneById(selectedZoneId) || null;
    }
    function getRadialCenterModeValue() {
      const modeFromDom = byId("fillCenterMode");
      const mode = String(
        (modeFromDom && modeFromDom.value)
        || (state.layoutRun && state.layoutRun.paramsSnapshot && state.layoutRun.paramsSnapshot.options && state.layoutRun.paramsSnapshot.options.centerMode)
        || "auto"
      );
      return mode === "manual" ? "manual" : "auto";
    }
    function syncRadialCenterFieldValues(x, y) {
      const nx = Number.isFinite(Number(x)) ? Math.round(Number(x) * 10) / 10 : 0;
      const ny = Number.isFinite(Number(y)) ? Math.round(Number(y) * 10) / 10 : 0;
      const hiddenX = byId("fillCenterX");
      const hiddenY = byId("fillCenterY");
      const visibleX = byId("layoutCenterXInput");
      const visibleY = byId("layoutCenterYInput");
      if (hiddenX) hiddenX.value = String(nx);
      if (hiddenY) hiddenY.value = String(ny);
      if (visibleX) visibleX.value = String(nx);
      if (visibleY) visibleY.value = String(ny);
      const selectedLayout = getSelectedLayoutEntry();
      if (selectedLayout && String(selectedLayout.mode || "") === "radial") {
        markLayoutDirty(selectedLayout, true);
      }
    }
    function scheduleRadialCenterPreview() {
      if (radialCenterPreviewTimer) clearTimeout(radialCenterPreviewTimer);
      radialCenterPreviewTimer = setTimeout(() => {
        radialCenterPreviewTimer = null;
        void previewFragmentOnlyLayout("radial");
      }, 180);
    }
    function setRadialManualCenter(worldPoint, options = {}) {
      const p = worldPoint && typeof worldPoint === "object" ? worldPoint : null;
      if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) return;
      const fillCenterMode = byId("fillCenterMode");
      if (fillCenterMode && String(fillCenterMode.value || "auto") !== "manual") return;
      syncRadialCenterFieldValues(Number(p.x), Number(p.y));
      const info = byId("workspaceInfo");
      if (info) info.textContent = `Р Р°РґРёР°Р»СЊРЅР°СЏ: С†РµРЅС‚СЂ (${Math.round(Number(p.x) * 10) / 10}; ${Math.round(Number(p.y) * 10) / 10}) РјРј`;
      renderPropertyEditor();
      renderScene();
      if (options && options.preview === false) return;
      scheduleRadialCenterPreview();
    }
    function getRenderableRadialCenterHandle() {
      const selectedLayout = getSelectedLayoutEntry();
      if (!selectedLayout || String(selectedLayout.mode || "") !== "radial") return null;
      if (getRadialCenterModeValue() !== "manual") return null;
      const zone = resolveCurrentRadialZone();
      if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) return null;
      const autoCenter = getZoneCenterPoint(zone);
      let centerX = Number((byId("fillCenterX") && byId("fillCenterX").value) || NaN);
      let centerY = Number((byId("fillCenterY") && byId("fillCenterY").value) || NaN);
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
        centerX = Number(selectedLayout && selectedLayout.runtimeSnapshot && selectedLayout.runtimeSnapshot.layoutRun && selectedLayout.runtimeSnapshot.layoutRun.paramsSnapshot && selectedLayout.runtimeSnapshot.layoutRun.paramsSnapshot.options && selectedLayout.runtimeSnapshot.layoutRun.paramsSnapshot.options.centerX);
        centerY = Number(selectedLayout && selectedLayout.runtimeSnapshot && selectedLayout.runtimeSnapshot.layoutRun && selectedLayout.runtimeSnapshot.layoutRun.paramsSnapshot && selectedLayout.runtimeSnapshot.layoutRun.paramsSnapshot.options && selectedLayout.runtimeSnapshot.layoutRun.paramsSnapshot.options.centerY);
      }
      if ((!Number.isFinite(centerX) || !Number.isFinite(centerY)) && autoCenter) {
        centerX = autoCenter.x;
        centerY = autoCenter.y;
      }
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return null;
        return {
          zone,
          point: { x: centerX, y: centerY },
          editable: isLayoutEditEnabledInScene(selectedLayout)
      };
    }
    function saveCurrentManualRuntimeSnapshot() {
      const current = getSelectedLayoutEntry();
      if (!current || String(current.mode || "") !== "inventory_manual") return;
      ensureManualLayoutBinding(current);
      current.runtimeSnapshot = buildManualLayoutSnapshot();
    }
    function readFragmentOptionsFromDom() {
      const g = (id, fallback) => { const el = byId(id); return el ? Number(el.value) : fallback; };
      const s = (id, fallback) => { const el = byId(id); return el ? String(el.value) : fallback; };
      return {
        rows: g("fillRows", 5),
        cols: g("fillCols", 5),
        axisCount: g("fillAxisCount", 1),
        angleDeg: g("fillAngleDeg", 45),
        bandStepMm: g("fillBandStep", 120),
        shiftPercent: g("fillShiftPercent", 50),
        ringCount: g("fillRingCount", 4),
        sectorCount: g("fillSectorCount", 8),
        rotationDeg: g("fillSectorRotationDeg", 0),
        innerRadiusMm: g("fillInnerRadiusMm", 0),
        centerMode: s("fillCenterMode", "auto"),
        centerX: g("fillCenterX", 0),
        centerY: g("fillCenterY", 0),
        gapX: g("fillGapX", 0),
        gapY: g("fillGapY", 0),
        cornerRadius: g("fillCornerRadius", 0)
      };
    }
    function saveCurrentLayoutRuntimeSnapshot() {
      const current = getSelectedLayoutEntry();
      if (!current || !isLocalRuntimeLayoutMode(current.mode)) return;
      ensureLocalRuntimeLayoutBinding(current);
      if (String(current.mode || "") === "inventory_manual") {
        current.runtimeSnapshot = buildManualLayoutSnapshot();
        return;
      }
      if (isFragmentOnlyLayoutMode(current.mode)) {
        if (!state.layoutRun) state.layoutRun = {};
        if (!state.layoutRun.paramsSnapshot || typeof state.layoutRun.paramsSnapshot !== "object") {
          state.layoutRun.paramsSnapshot = {};
        }
        state.layoutRun.paramsSnapshot.options = readFragmentOptionsFromDom();
        current.runtimeSnapshot = buildFragmentOnlyLayoutSnapshot(String(current.mode || ""));
      }
      if (isIntarsiaLayoutMode(current.mode)) {
        current.runtimeSnapshot = buildFragmentOnlyLayoutSnapshot("intarsia");
      }
    }
    function clearActiveLayoutRuntime() {
      const currentMode = String(state.layoutMode || "").trim();
      const empty = currentMode === "inventory_manual"
        ? buildEmptyManualLayoutSnapshot()
        : buildEmptyFragmentOnlyLayoutSnapshot(currentMode, null);
      state.layoutRun = {
        ...state.layoutRun,
        ...(empty && empty.layoutRun && typeof empty.layoutRun === "object" ? empty.layoutRun : {})
      };
      state.layoutRun.active = false;
      state.layoutRun.status = "idle";
      state.layoutRun.fragments = [];
      state.layoutRun.placements = [];
      state.layoutRun.candidatePool = [];
      state.layoutRun.splitEvents = [];
      state.layoutRun.topChoicesByFragment = {};
      state.layoutRun.selectedPlacementFragmentId = null;
      state.layoutRun.previewLayers = { pieceIntersections: [], visibleArea: [], coverageHoles: [], seams: [] };
      state.layoutRun.manual = {
        suggestions: [],
        lastMetrics: null,
        selectedCandidateTag: "",
        activePiece: null,
        lastEvalContours: null,
        statusNote: "",
        selectedPlacementIndex: -1
      };
      state.selectedFragmentId = null;
      renderPlacementRows([]);
      renderSplitEvents([]);
    }
    function applyManualLayoutSnapshot(snapshot) {
      const snap = snapshot && typeof snapshot === "object" ? snapshot : buildEmptyManualLayoutSnapshot();
      const base = state.layoutRun && typeof state.layoutRun === "object" ? state.layoutRun : {};
      const nextLayoutRunRaw = snap.layoutRun && typeof snap.layoutRun === "object" ? snap.layoutRun : {};
      // Preserve existing placements if incoming snapshot has none (avoids wiping on re-open)
      const _incomingPlacements = Array.isArray(nextLayoutRunRaw.placements) ? nextLayoutRunRaw.placements : null;
      const _basePlacements = Array.isArray(base.placements) ? base.placements : [];
      state.layoutRun = {
        ...base,
        ...nextLayoutRunRaw,
        placements: (_incomingPlacements && _incomingPlacements.length > 0) ? _incomingPlacements : _basePlacements,
        manual: {
          ...(base.manual && typeof base.manual === "object" ? base.manual : {}),
          ...(nextLayoutRunRaw.manual && typeof nextLayoutRunRaw.manual === "object" ? nextLayoutRunRaw.manual : {})
        }
      };
      const zoneId = Number(snap.selectedZoneId || state.layoutRun.selectedZoneId || 0);
      if (zoneId > 0) state.selectedZoneId = zoneId;
      const detailId = Number(snap.selectedDetailId || 0);
      if (detailId > 0) state.selectedDetailId = detailId;
      const selectedLayout = getSelectedLayoutEntry();
      if (selectedLayout && String(selectedLayout.mode || "") === "inventory_manual") {
        if (zoneId > 0) selectedLayout.boundZoneId = zoneId;
        if (detailId > 0) selectedLayout.boundDetailId = detailId;
      }
      if (!Array.isArray(state.layoutRun.placements)) state.layoutRun.placements = [];
      if (!Array.isArray(state.layoutRun.fragments)) state.layoutRun.fragments = [];
      if (!state.layoutRun.previewLayers || typeof state.layoutRun.previewLayers !== "object") {
        state.layoutRun.previewLayers = { pieceIntersections: [], visibleArea: [], coverageHoles: [], seams: [] };
      }
      if (!Array.isArray(state.layoutRun.previewLayers.seams)) state.layoutRun.previewLayers.seams = [];
      if (!Array.isArray(state.layoutRun.candidatePool)) state.layoutRun.candidatePool = [];
      // Ensure contour layers are on вЂ” same as the layout worker does at line ~9018
      state.layers.pfullZ = true;
      state.layers.pcoreZ = true;
      const _pfullChk = byId("layerPfullZ"); if (_pfullChk) _pfullChk.checked = true;
      const _pcoreChk = byId("layerPcoreZ"); if (_pcoreChk) _pcoreChk.checked = true;
      // Recompute eroded core contours with current seamMm (snapshot may have been saved with seamMm=0)
      void (async () => {
        try { await ensureManualPlacementsCoreContours(); } catch (_) {}
        renderAll();
      })();
      renderPlacementRows(state.layoutRun.placements || []);
      renderSplitEvents(state.layoutRun.splitEvents || []);
      renderInventoryManualPanel();
      // Auto-fetch candidates when pool is empty on layout select
      const _poolEmpty = state.layoutRun.candidatePool.length === 0;
      const _layoutActive = state.layoutRun.active === true || Array.isArray(state.layoutRun.placements) && state.layoutRun.placements.length > 0;
      if (_poolEmpty && _layoutActive) {
        void (async () => {
          try {
            const zone = state.zones.find((z) => Number(z && z.id) === Number(state.layoutRun.selectedZoneId || state.selectedZoneId));
            if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) return;
            const filters = state.layoutRun.lastFilters && typeof state.layoutRun.lastFilters === "object" ? state.layoutRun.lastFilters : {};
            const res = await api("/api/inventory/candidates", "POST", {
              zone: { id: zone.id, points: zone.points },
              napDirectionDeg: state.layoutRun.lastNapDirectionDeg || null,
              napToleranceDeg: 45,
              onlyAvailable: true,
              includeScrapContour: true,
              materialId: filters.materialId || undefined,
              maxCandidates: 300
            });
            if (res && res.ok && Array.isArray(res.items)) {
              state.layoutRun.candidatePool = res.items;
              renderInventoryManualPanel();
            }
          } catch (_) {}
        })();
      }
    }
    function applyFragmentOnlyLayoutSnapshot(mode, snapshot, entry) {
      const normalizedMode = String(mode || "").trim();
      const snap = snapshot && typeof snapshot === "object"
        ? snapshot
        : buildEmptyFragmentOnlyLayoutSnapshot(normalizedMode, entry);
      const base = state.layoutRun && typeof state.layoutRun === "object" ? state.layoutRun : {};
      const nextLayoutRunRaw = snap.layoutRun && typeof snap.layoutRun === "object" ? snap.layoutRun : {};
      state.layoutRun = {
        ...base,
        ...nextLayoutRunRaw,
        strategy: normalizedMode,
        fillType: nextLayoutRunRaw.fillType || "regular",
        placements: [],
        candidatePool: [],
        manual: {}
      };
      // РРЅС‚Р°СЂСЃРёСЏ вЂ” РѕС‚РґРµР»СЊРЅС‹Р№ СЂРµР¶РёРј: РЅРµ РїРµСЂРµРЅРѕСЃРёРј РµС‘ active=true РІ РґСЂСѓРіРёРµ СЂР°СЃРєР»Р°РґРєРё
      if (normalizedMode !== "intarsia" && !nextLayoutRunRaw.active) {
        state.layoutRun.active = false;
      }
      if (snap.intarsiaSvgFragments !== undefined) {
        state.intarsiaSvgFragments = Array.isArray(snap.intarsiaSvgFragments) ? snap.intarsiaSvgFragments : null;
        if (Array.isArray(state.intarsiaSvgFragments) && state.intarsiaSvgFragments.length > 0) {
          state.layoutRun.fillType = "import_svg";
        }
      }
      if (snap.intarsiaSvgFileName !== undefined) {
        state.intarsiaSvgFileName = snap.intarsiaSvgFileName || null;
      }
      const zoneId = Number(snap.selectedZoneId || state.layoutRun.selectedZoneId || 0);
      if (zoneId > 0) state.selectedZoneId = zoneId;
      const detailId = Number(snap.selectedDetailId || 0);
      if (detailId > 0) state.selectedDetailId = detailId;
      const selectedLayout = entry && typeof entry === "object" ? entry : getSelectedLayoutEntry();
      if (selectedLayout && String(selectedLayout.mode || "") === normalizedMode) {
        if (zoneId > 0) selectedLayout.boundZoneId = zoneId;
        if (detailId > 0) selectedLayout.boundDetailId = detailId;
      }
      syncFragmentOnlyControlsFromSnapshot(snap);
      // Sync fillGridMode for intarsia
      if (normalizedMode === "intarsia") {
        // Restore intarsiaSvgFragments from layoutRun.fragments if not in snapshot (legacy snapshots)
        if (!Array.isArray(state.intarsiaSvgFragments) || !state.intarsiaSvgFragments.length) {
          const frags = Array.isArray(state.layoutRun.fragments) ? state.layoutRun.fragments : [];
          if (frags.length > 0) {
            state.intarsiaSvgFragments = frags.map((f) => ({ id: f.id, points: Array.isArray(f.points) ? f.points.slice() : [] }));
            state.layoutRun.fillType = "import_svg";
            if (!state.intarsiaSvgFileName) state.intarsiaSvgFileName = "РёРјРїРѕСЂС‚РёСЂРѕРІР°РЅРѕ";
          }
        }
        // Force fillType if fragments exist
        if (Array.isArray(state.intarsiaSvgFragments) && state.intarsiaSvgFragments.length > 0) {
          state.layoutRun.fillType = "import_svg";
        }
        const modeEl = byId("fillGridMode");
        if (modeEl) {
          modeEl.value = state.layoutRun.fillType === "import_svg" ? "import_svg" : "grid";
          syncGridModeUi && syncGridModeUi();
        }
      }
      if (!Array.isArray(state.layoutRun.fragments)) state.layoutRun.fragments = [];
      if (!state.layoutRun.previewLayers || typeof state.layoutRun.previewLayers !== "object") {
        state.layoutRun.previewLayers = { pieceIntersections: [], visibleArea: [], coverageHoles: [], seams: [] };
      }
      if (!Array.isArray(state.layoutRun.previewLayers.seams)) state.layoutRun.previewLayers.seams = [];
      renderPlacementRows([]);
      renderSplitEvents(state.layoutRun.splitEvents || []);
    }
    async function saveLayoutEntry(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e) return { ok: false, error: "layout_entry_required" };
      saveCurrentLayoutRuntimeSnapshot();
      if (isIntarsiaLayoutMode(e.mode)) {
        const payload = {
          id: e.persistedRunId || null,
          name: String(e.name || "РРЅС‚Р°СЂСЃРёСЏ"),
          mode: "intarsia",
          selectedZoneId: Number(e.boundZoneId || state.layoutRun && state.layoutRun.selectedZoneId || state.selectedZoneId || 0) || null,
          snapshot: buildFragmentOnlyLayoutSnapshot("intarsia")
        };
        const res = await api("/api/layout/manual/runs/save", "POST", payload);
        if (res && res.ok && res.item) {
          e.persistedRunId = String(res.item.id || "");
          e.persistedAt = Number(res.item.updatedAt || Date.now());
          e.runtimeSnapshot = JSON.parse(JSON.stringify(payload.snapshot));
          e.isDirty = false;
          byId("workspaceInfo").textContent = `Р’С‹РєР»Р°РґРєР° СЃРѕС…СЂР°РЅРµРЅР° (${e.name || "-"})`;
          renderDetailZoneTree();
          renderPropertyEditor();
        } else {
          byId("workspaceInfo").textContent = `РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ: ${String(res && res.error || "unknown")}`;
        }
        return res;
      }
      if (isFragmentOnlyLayoutMode(e.mode)) {
        const normalizedMode = String(e.mode || "");
        const payload = {
          id: e.persistedRunId || null,
          name: String(e.name || getLayoutModeTitle(normalizedMode)),
          mode: normalizedMode,
          selectedZoneId: Number(e.boundZoneId || state.layoutRun && state.layoutRun.selectedZoneId || state.selectedZoneId || 0) || null,
          snapshot: buildFragmentOnlyLayoutSnapshot(normalizedMode)
        };
        const res = await api("/api/layout/manual/runs/save", "POST", payload);
        if (res && res.ok && res.item) {
          e.persistedRunId = String(res.item.id || "");
          e.persistedAt = Number(res.item.updatedAt || Date.now());
          e.runtimeSnapshot = JSON.parse(JSON.stringify(payload.snapshot));
          e.isDirty = false;
          byId("workspaceInfo").textContent = `Р’С‹РєР»Р°РґРєР° СЃРѕС…СЂР°РЅРµРЅР° (${e.name || "-"})`;
          renderDetailZoneTree();
          renderPropertyEditor();
        } else {
          byId("workspaceInfo").textContent = `РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ: ${String(res && res.error || "unknown")}`;
        }
        return res;
      }
      if (String(e.mode || "") !== "inventory_manual") return { ok: false, error: "manual_mode_only" };
      const boundZone = ensureManualLayoutBinding(e);
      const payload = {
        id: e.persistedRunId || null,
        name: String(e.name || "Р СѓС‡РЅР°СЏ РІС‹РєР»Р°РґРєР°"),
        mode: "inventory_manual",
        selectedZoneId: Number(boundZone && boundZone.id || state.layoutRun && state.layoutRun.selectedZoneId || state.selectedZoneId || 0) || null,
        snapshot: buildManualLayoutSnapshot()
      };
      const res = await api("/api/layout/manual/runs/save", "POST", payload);
      if (res && res.ok && res.item) {
        e.persistedRunId = String(res.item.id || "");
        e.persistedAt = Number(res.item.updatedAt || Date.now());
        e.isDirty = false;
        byId("workspaceInfo").textContent = `Р’С‹РєР»Р°РґРєР° СЃРѕС…СЂР°РЅРµРЅР° (${e.name || "-"})`;
        renderDetailZoneTree();
        renderPropertyEditor();
      } else {
        byId("workspaceInfo").textContent = `РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ: ${String(res && res.error || "unknown")}`;
      }
      return res;
    }
    function selectLayoutEntry(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e) return;
      saveCurrentLayoutRuntimeSnapshot();
      state.selectedLayoutId = e.id;
      applyLayoutMode(e.mode);
      // Apply stored snapshot if available вЂ” but don't build/apply empty snapshot (avoids reset)
      const snap = e.runtimeSnapshot && typeof e.runtimeSnapshot === "object" ? e.runtimeSnapshot : null;
      if (snap) {
        if (isFragmentOnlyLayoutMode(e.mode) || isIntarsiaLayoutMode(e.mode)) {
          applyFragmentOnlyLayoutSnapshot(String(e.mode || ""), snap, e);
        } else if (String(e.mode || "") === "inventory_manual") {
          applyManualLayoutSnapshot(snap);
        }
      } else if (isLocalRuntimeLayoutMode(e.mode)) {
        const boundZone = ensureLocalRuntimeLayoutBinding(e);
        if (boundZone) {
          state.selectedZoneId = Number(boundZone.id || 0) || null;
          state.selectedDetailId = Number(boundZone.detailId || state.selectedDetailId || 0) || state.selectedDetailId;
          if (state.layoutRun && typeof state.layoutRun === "object") {
            state.layoutRun.selectedZoneId = Number(boundZone.id || 0) || null;
          }
        }
      }
      renderLayoutModeSwitch();
      renderDetailZoneTree();
      renderPropertyEditor();
      renderZoneToolPalette();
      renderScene();
    }

    async function openLayoutEntry(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e) return;
      saveCurrentLayoutRuntimeSnapshot();
      state.selectedLayoutId = e.id;
      // Enable edit mode for this layout when explicitly opening via pencil button
      if (!state.propertyEditorUi || typeof state.propertyEditorUi !== "object") state.propertyEditorUi = {};
      if (!state.propertyEditorUi.layoutEdit || typeof state.propertyEditorUi.layoutEdit !== "object") state.propertyEditorUi.layoutEdit = {};
      state.propertyEditorUi.layoutEdit[String(e.id || "")] = true;
      applyLayoutMode(e.mode);
      if (isLocalRuntimeLayoutMode(e.mode)) {
        const boundZone = ensureLocalRuntimeLayoutBinding(e);
        if (boundZone) {
          state.selectedZoneId = Number(boundZone.id || 0) || null;
          state.selectedDetailId = Number(boundZone.detailId || state.selectedDetailId || 0) || state.selectedDetailId;
          if (state.layoutRun && typeof state.layoutRun === "object") {
            state.layoutRun.selectedZoneId = Number(boundZone.id || 0) || null;
          }
        }
      }
      if ((String(e.mode || "") === "inventory_manual" || isFragmentOnlyLayoutMode(e.mode) || isIntarsiaLayoutMode(e.mode)) && e.persistedRunId) {
        const res = await api("/api/layout/manual/runs/load", "POST", { id: e.persistedRunId });
        if (res && res.ok && res.item && res.item.snapshot && typeof res.item.snapshot === "object") {
          e.runtimeSnapshot = JSON.parse(JSON.stringify(res.item.snapshot));
          e.persistedAt = Number(res.item.updatedAt || Date.now());
          e.isDirty = false;
          if (String(e.mode || "") === "inventory_manual") applyManualLayoutSnapshot(e.runtimeSnapshot);
          else applyFragmentOnlyLayoutSnapshot(String(e.mode || ""), e.runtimeSnapshot, e);
          byId("workspaceInfo").textContent = `Р’С‹РєР»Р°РґРєР° РѕС‚РєСЂС‹С‚Р° (${e.name || "-"})`;
        } else {
          byId("workspaceInfo").textContent = `РћС€РёР±РєР° РѕС‚РєСЂС‹С‚РёСЏ: ${String(res && res.error || "unknown")}`;
        }
      } else if (isIntarsiaLayoutMode(e.mode)) {
        const snapshot = (e.runtimeSnapshot && typeof e.runtimeSnapshot === "object")
          ? e.runtimeSnapshot
          : buildEmptyFragmentOnlyLayoutSnapshot("intarsia", e);
        if (!e.runtimeSnapshot) e.runtimeSnapshot = JSON.parse(JSON.stringify(snapshot));
        applyFragmentOnlyLayoutSnapshot("intarsia", snapshot, e);
      } else if (String(e.mode || "") === "inventory_manual") {
        const snapshot = (e.runtimeSnapshot && typeof e.runtimeSnapshot === "object")
          ? e.runtimeSnapshot
          : buildEmptyManualLayoutSnapshot();
        if (!e.runtimeSnapshot) e.runtimeSnapshot = JSON.parse(JSON.stringify(snapshot));
        applyManualLayoutSnapshot(snapshot);
      } else if (isFragmentOnlyLayoutMode(e.mode)) {
        const normalizedMode = String(e.mode || "");
        const snapshot = (e.runtimeSnapshot && typeof e.runtimeSnapshot === "object")
          ? e.runtimeSnapshot
          : buildEmptyFragmentOnlyLayoutSnapshot(normalizedMode, e);
        if (!e.runtimeSnapshot) e.runtimeSnapshot = JSON.parse(JSON.stringify(snapshot));
        applyFragmentOnlyLayoutSnapshot(normalizedMode, snapshot, e);
      }
      syncLayersFromCheckboxes();
      renderLayoutModeSwitch();
      renderDetailZoneTree();
      renderPropertyEditor();
      renderZoneToolPalette();
      renderScene();
      if (isFragmentOnlyLayoutMode(e.mode)) {
        const boundZone = resolveZoneById(e.boundZoneId || state.selectedZoneId || 0);
        if (boundZone && Array.isArray(boundZone.points) && boundZone.points.length >= 3) {
          fitPointsToView(boundZone.points);
          renderScene();
        }
      }
      if (isFragmentOnlyLayoutMode(e.mode)) {
        const normalizedMode = String(e.mode || "");
        const needsFreshPreview = !hasFragmentOnlySnapshotData(e.runtimeSnapshot)
          || isFragmentOnlySnapshotStale(normalizedMode, e.runtimeSnapshot);
        if (needsFreshPreview) {
          await previewFragmentOnlyLayout(normalizedMode);
          // Immediately persist snapshot so it's visible as background even if user
          // switches to another layout before saveCurrentLayoutRuntimeSnapshot fires.
          if (Number(state.selectedLayoutId) === Number(e.id)) {
            e.runtimeSnapshot = buildFragmentOnlyLayoutSnapshot(normalizedMode);
            renderScene();
          }
        }
      }
      if (String(e.mode || "") === "intarsia" && Array.isArray(state.intarsiaSvgFragments) && state.intarsiaSvgFragments.length > 0) {
        previewIntarsiaFragmentsDraft();
      }
    }
    async function deleteLayoutEntry(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e) return;
      const wasSelected = Number(state.selectedLayoutId || 0) === Number(e.id || 0);
      if (e.persistedRunId) {
        const res = await api("/api/layout/manual/runs/delete", "POST", { id: e.persistedRunId });
        const notFound = String(res && res.error || "") === "not_found";
        if ((!res || !res.ok) && !notFound) {
          byId("workspaceInfo").textContent = `РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ: ${String(res && res.error || "unknown")}`;
          return;
        }
        if (notFound) {
          byId("workspaceInfo").textContent = "РЎРѕС…СЂР°РЅС‘РЅРЅР°СЏ РІС‹РєР»Р°РґРєР° СѓР¶Рµ РѕС‚СЃСѓС‚СЃС‚РІРѕРІР°Р»Р° РІ С…СЂР°РЅРёР»РёС‰Рµ. РЈРґР°Р»СЏРµРј Р»РѕРєР°Р»СЊРЅСѓСЋ РєР°СЂС‚РѕС‡РєСѓ.";
        }
      }
      state.layouts = state.layouts.filter((x) => Number(x.id) !== Number(e.id));
      if (wasSelected) {
        const next = state.layouts[0] || null;
        if (next) {
          await openLayoutEntry(next);
        } else {
          state.selectedLayoutId = null;
          clearActiveLayoutRuntime();
          renderLayoutModeSwitch();
          renderDetailZoneTree();
          renderPropertyEditor();
          renderScene();
        }
        return;
      }
      renderLayoutModeSwitch();
      renderDetailZoneTree();
      renderPropertyEditor();
      renderScene();
    }
    async function loadSavedManualRuns() {
      const res = await api("/api/layout/manual/runs", "GET");
      const items = res && res.ok && Array.isArray(res.items) ? res.items : [];
      for (const item of items) {
        let snapshot = item && item.snapshot && typeof item.snapshot === "object"
          ? JSON.parse(JSON.stringify(item.snapshot))
          : null;
        const hasSnapshotData = snapshot
          && snapshot.layoutRun
          && (Array.isArray(snapshot.layoutRun.fragments) || Array.isArray(snapshot.layoutRun.placements));
        if (!hasSnapshotData && item && item.id) {
          try {
            const loadRes = await api("/api/layout/manual/runs/load", "POST", { id: String(item.id) });
            if (loadRes && loadRes.ok && loadRes.item && loadRes.item.snapshot && typeof loadRes.item.snapshot === "object") {
              snapshot = JSON.parse(JSON.stringify(loadRes.item.snapshot));
            }
          } catch (_) {
            // Keep null snapshot; tree/reports will simply skip this run until backend is available.
          }
        }
        const snapZoneId = Number(snapshot && (snapshot.selectedZoneId || (snapshot.layoutRun && snapshot.layoutRun.selectedZoneId) || 0) || 0) || null;
        const snapDetailId = Number(snapshot && (snapshot.selectedDetailId || 0) || 0) || null;
        const id = state.nextLayoutId++;
        state.layouts.push({
          id,
          mode: String(item && item.mode || "inventory_manual"),
          name: String(item && item.name || `Р СѓС‡РЅР°СЏ РІС‹РєР»Р°РґРєР° ${id}`),
          persistedRunId: String(item && item.id || ""),
          persistedAt: Number(item && item.updatedAt || 0) || null,
          boundZoneId: snapZoneId,
          boundDetailId: snapDetailId,
          runtimeSnapshot: snapshot,
          isDirty: false
        });
      }
      if (!state.selectedLayoutId && state.layouts.length > 0) {
        state.selectedLayoutId = state.layouts[0].id;
      }
      return items.length;
    }
    function applyLayoutMode(mode) {
      state.layoutMode = String(mode || "inventory");
      state.layoutRun.fillType = (state.layoutMode === "longitudinal"
        || state.layoutMode === "shifted"
        || state.layoutMode === "transverse"
        || state.layoutMode === "radial"
        || state.layoutMode === "intarsia")
        ? "regular"
        : "voronoi";
    }

    function renderLayoutModeSwitch() {
      const root = byId("layoutModeSwitch");
      if (!root) return;
      root.querySelectorAll("button[data-panel]").forEach((btn) => {
        const panel = String(btn.getAttribute("data-panel") || "zones");
        btn.classList.toggle("active", panel === state.uiPanel);
      });
      const title = byId("rightTabsTitle");
      if (title) {
        title.textContent = state.uiPanel === "layouts"
          ? ""
          : (state.uiPanel === "materials" ? "РњРµС…РѕРІС‹Рµ РјР°С‚РµСЂРёР°Р»С‹" : "Р”РµС‚Р°Р»Рё / Р—РѕРЅС‹");
      }
    }

    function syncLayoutModeFromSelectedLayout() {
      const selectedLayout = Array.isArray(state.layouts)
        ? state.layouts.find((x) => Number(x && x.id || 0) === Number(state.selectedLayoutId || 0))
        : null;
      if (!selectedLayout) return;
      const selectedMode = String(selectedLayout.mode || "");
      if (!selectedMode) return;
      if (String(state.layoutMode || "") === selectedMode) return;
      state.layoutMode = selectedMode;
      if (state.layoutRun && typeof state.layoutRun === "object") {
        state.layoutRun.strategy = selectedMode;
      }
    }

    const FRAGMENT_ONLY_MODE_VERSIONS = {
      longitudinal: "v0.3",
      shifted: "v0.1",
      transverse: "v0.2",
      radial: "v0.1"
    };

    function isFragmentOnlyLayoutMode(mode) {
      const normalized = String(mode || "").trim();
      return normalized === "longitudinal" || normalized === "shifted" || normalized === "transverse" || normalized === "radial";
    }
    function isIntarsiaLayoutMode(mode) {
      return String(mode || "").trim() === "intarsia";
    }

    function getFragmentOnlyModeVersion(mode) {
      const normalized = String(mode || "").trim();
      return String(FRAGMENT_ONLY_MODE_VERSIONS[normalized] || "");
    }

    function isFragmentOnlySnapshotStale(mode, snapshot) {
      const expected = getFragmentOnlyModeVersion(mode);
      if (!expected) return false;
      const actual = String(
        snapshot
        && snapshot.layoutRun
        && snapshot.layoutRun.paramsSnapshot
        && snapshot.layoutRun.paramsSnapshot.layoutModeVersion
        || ""
      );
      if (actual !== expected) return true;
      // If fragments exist but none have cutPoints, the snapshot was saved before seam allowance expansion was implemented.
      const frags = Array.isArray(snapshot && snapshot.layoutRun && snapshot.layoutRun.fragments) ? snapshot.layoutRun.fragments : [];
      if (frags.length > 0 && !frags.some((f) => Array.isArray(f && f.cutPoints) && f.cutPoints.length >= 3)) return true;
      return false;
    }

    function getSelectedZoneForLayoutMode(mode) {
      const normalizedMode = String(mode || "").trim();
      if ((!Array.isArray(state.zones) || state.zones.length === 0) && Array.isArray(state.details) && state.details.length > 0) {
        initZonesFromDetails();
      }
      const selectedLayout = getSelectedLayoutEntry();
      const layoutBoundZoneId = Number(
        selectedLayout
        && String(selectedLayout.mode || "") === normalizedMode
        && selectedLayout.boundZoneId
        || 0
      ) || 0;
      const selectedZoneId = Number(state.selectedZoneId || 0) || 0;
      const selectedDetailId = Number(state.selectedDetailId || 0) || 0;
      let zone = resolveZoneById(layoutBoundZoneId);
      if (!zone && selectedZoneId > 0) {
        const candidate = resolveZoneById(selectedZoneId);
        if (candidate && (!selectedDetailId || Number(candidate.detailId || 0) === selectedDetailId)) {
          zone = candidate;
        }
      }
      if (!zone && selectedDetailId > 0) {
        zone = resolvePreferredZoneByDetail(selectedDetailId);
      }
      if (!zone && selectedZoneId > 0) {
        zone = resolveZoneById(selectedZoneId);
      }
      if (!zone) zone = (Array.isArray(state.zones) ? state.zones[0] : null) || null;
      if (!zone) return null;
      state.selectedZoneId = Number(zone.id || 0) || null;
      state.selectedDetailId = Number(zone.detailId || state.selectedDetailId || 0) || state.selectedDetailId;
      if (selectedLayout && String(selectedLayout.mode || "") === normalizedMode) {
        selectedLayout.boundZoneId = Number(zone.id || 0) || null;
        selectedLayout.boundDetailId = Number(zone.detailId || state.selectedDetailId || 0) || null;
      }
      return zone;
    }

    async function previewFragmentOnlyLayout(mode) {
      const normalizedMode = String(mode || "").trim();
      if (!isFragmentOnlyLayoutMode(normalizedMode)) {
        return { ok: false, error: "fragment_only_mode_unsupported" };
      }
      const zone = getSelectedZoneForLayoutMode(normalizedMode);
      if (!zone || !Array.isArray(zone.points) || zone.points.length < 3) {
        byId("workspaceInfo").textContent = "РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ Р·РѕРЅСѓ.";
        return { ok: false, error: "zone_not_selected" };
      }
      const selectedLayout = getSelectedLayoutEntry();
      const rows = Math.max(1, Number(byId("fillRows").value || 5));
      const cols = Math.max(1, Number(byId("fillCols").value || 5));
      const axisCount = Math.max(0, Math.min(6, Number((byId("fillAxisCount") && byId("fillAxisCount").value) || 1)));
      const angleDeg = Math.max(-89, Math.min(89, Number((byId("fillAngleDeg") && byId("fillAngleDeg").value) || 45)));
      const bandStepMm = Math.max(10, Math.min(5000, Number((byId("fillBandStep") && byId("fillBandStep").value) || 120)));
      const shiftPercent = Math.max(-100, Math.min(100, Number((byId("fillShiftPercent") && byId("fillShiftPercent").value) || 50)));
      const ringCount = Math.max(1, Math.min(20, Number((byId("fillRingCount") && byId("fillRingCount").value) || 4)));
      const sectorCount = Math.max(1, Math.min(36, Number((byId("fillSectorCount") && byId("fillSectorCount").value) || 8)));
      const rotationDeg = Math.max(-360, Math.min(360, Number((byId("fillSectorRotationDeg") && byId("fillSectorRotationDeg").value) || 0)));
      const innerRadiusMm = Math.max(0, Number((byId("fillInnerRadiusMm") && byId("fillInnerRadiusMm").value) || 0));
      const centerMode = String((byId("fillCenterMode") && byId("fillCenterMode").value) || "auto");
      const centerX = Number((byId("fillCenterX") && byId("fillCenterX").value) || 0);
      const centerY = Number((byId("fillCenterY") && byId("fillCenterY").value) || 0);
      const gapX = Math.max(0, Number(byId("fillGapX").value || 0));
      const gapY = Math.max(0, Number(byId("fillGapY").value || 0));
      const cornerRadius = Math.max(0, Number(byId("fillCornerRadius").value || 0));
      const allowanceMm = Number(parseLocaleNumber(state.layoutRun && state.layoutRun.allowanceMm, 12) || 12);
      const zoneMaterial = zone.materialId ? getFurMaterialById(zone.materialId) : null;
      const matMaxAlongMm = zoneMaterial && Number.isFinite(Number(zoneMaterial.maxLengthMm)) ? Number(zoneMaterial.maxLengthMm) : null;
      const matMaxAcrossMm = zoneMaterial && Number.isFinite(Number(zoneMaterial.maxWidthMm)) ? Number(zoneMaterial.maxWidthMm) : null;
      const constraintsRow = byId("fragmentSizeConstraintsRow");
      if (constraintsRow) constraintsRow.style.display = "";
      const maxAlongEl = byId("fragmentMaxAlongMm");
      const maxAcrossEl = byId("fragmentMaxAcrossMm");
      if (maxAlongEl) { if (matMaxAlongMm !== null) { maxAlongEl.value = String(matMaxAlongMm); } else { maxAlongEl.value = ""; } }
      if (maxAcrossEl) { if (matMaxAcrossMm !== null) { maxAcrossEl.value = String(matMaxAcrossMm); } else { maxAcrossEl.value = ""; } }
      const fragmentMinAlongMm = Math.max(0, Number((byId("fragmentMinAlongMm") && byId("fragmentMinAlongMm").value) || 60));
      const fragmentMinAcrossMm = Math.max(0, Number((byId("fragmentMinAcrossMm") && byId("fragmentMinAcrossMm").value) || 60));
      const fragmentMaxAlongMm = matMaxAlongMm !== null ? matMaxAlongMm : null;
      const fragmentMaxAcrossMm = matMaxAcrossMm !== null ? matMaxAcrossMm : null;
      const payload = {
        layoutType: normalizedMode,
        zone: {
          id: zone.id,
          points: Array.isArray(zone.points) ? zone.points : []
        },
        inputs: {
          normalizeRules: {
            minFragmentWidthMm: 0,
            minFragmentLengthMm: 0,
            mergeSmallFragments: false,
            seamAllowanceReserveMm: allowanceMm,
            fragmentMinAlongMm,
            fragmentMinAcrossMm,
            fragmentMaxAlongMm,
            fragmentMaxAcrossMm
          }
        },
        options: {
          rows,
          cols,
          axisCount,
          angleDeg,
          bandStepMm,
          shiftPercent,
          ringCount,
          sectorCount,
          rotationDeg,
          innerRadiusMm,
          centerMode,
          centerX,
          centerY,
          gapX,
          gapY,
          cornerRadius,
          variability: normalizedMode === "longitudinal" ? 0 : undefined
        },
        seed: Date.now()
      };
      byId("workspaceInfo").textContent = "Р“РµРЅРµСЂРёСЂСѓРµРј РІС‹РєР»Р°РґРєСѓ...";
      const res = await api("/api/layout/modes/preview", "POST", payload, 45000);
      if (!res || res.ok !== true) {
        byId("workspaceInfo").textContent = `РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё: ${String(res && (res.message || res.error) || "unknown")}`;
        return res || { ok: false, error: "preview_failed" };
      }
      previewToken = "";
      state.layoutRun.active = true;
      state.layoutRun.status = "preview";
      state.layoutRun.fillType = "regular";
      state.layoutRun.strategy = normalizedMode;
      state.layoutRun.inventoryScenario = "";
      state.layoutRun.selectedZoneId = Number(zone.id || 0) || null;
      state.layoutRun.allowanceMm = allowanceMm;
      state.layoutRun.fragments = Array.isArray(res.fragments) ? res.fragments : [];
      state.layoutRun.placements = [];
      state.layoutRun.candidatePool = [];
      const _fragmentCoverContours = (Array.isArray(res.fragments) ? res.fragments : [])
        .map((f) => normalizeContourArray((f && (f.points || f.cleanPoints || f.seamPoints)) || []))
        .filter((poly) => Array.isArray(poly) && poly.length >= 3);
      const _coverageHoles = computeCoverageHoles(zone.points, _fragmentCoverContours);
      state.layoutRun.previewLayers = { pieceIntersections: [], visibleArea: _fragmentCoverContours, coverageHoles: _coverageHoles, seams: [] };
      state.layoutRun.splitEvents = [];
      state.layoutRun.stats = res && res.stats && typeof res.stats === "object"
        ? res.stats
        : { fragmentsTotal: Array.isArray(res.fragments) ? res.fragments.length : 0 };
      state.layoutRun.paramsSnapshot = {
        layoutType: normalizedMode,
        layoutModeVersion: getFragmentOnlyModeVersion(normalizedMode),
        zoneId: Number(zone.id || 0) || null,
        options: payload.options,
        inputs: payload.inputs
      };
      state.layoutRun.resultStatus = String(res.resultStatus || "ok");
      state.layoutRun.failedReason = res.failedReason || null;
      state.layoutRun.serverPreview = res;
      state.selectedFragmentId = null;
      if (selectedLayout && String(selectedLayout.mode || "") === normalizedMode) {
        selectedLayout.boundZoneId = Number(zone.id || 0) || null;
        selectedLayout.boundDetailId = Number(zone.detailId || state.selectedDetailId || 0) || null;
        selectedLayout.runtimeSnapshot = buildFragmentOnlyLayoutSnapshot(normalizedMode);
        selectedLayout.isDirty = true;
      }
      renderPlacementRows([]);
      renderSplitEvents([]);
      renderDetailZoneTree();
      renderPropertyEditor();
      renderScene();
      byId("workspaceInfo").textContent = normalizedMode === "transverse"
        ? `${getLayoutModeTitle(normalizedMode)}: ${state.layoutRun.fragments.length} С„СЂР°РіРјРµРЅС‚РѕРІ (РѕСЃРё ${axisCount}, С€Р°Рі ${bandStepMm} РјРј, СѓРіРѕР» ${angleDeg}В°)`
        : (normalizedMode === "radial"
          ? `${getLayoutModeTitle(normalizedMode)}: ${state.layoutRun.fragments.length} С„СЂР°РіРјРµРЅС‚РѕРІ (РєРѕР»СЊС†Р° ${ringCount}, СЃРµРєС‚РѕСЂС‹ ${sectorCount}, РїРѕРІРѕСЂРѕС‚ ${rotationDeg}В°)`
        : (normalizedMode === "shifted"
          ? `${getLayoutModeTitle(normalizedMode)}: ${state.layoutRun.fragments.length} С„СЂР°РіРјРµРЅС‚РѕРІ (СЃРµС‚РєР° ${rows}x${cols}, СЃРјРµС‰РµРЅРёРµ ${shiftPercent}%)`
          : `${getLayoutModeTitle(normalizedMode)}: ${state.layoutRun.fragments.length} С„СЂР°РіРјРµРЅС‚РѕРІ (СЃРµС‚РєР° ${rows}x${cols})`));
      return res;
    }

    function openInventoryStep1(forcedMode) {
      const modeOverride = String(forcedMode || "").trim();
      if (modeOverride) {
        state.layoutMode = modeOverride;
        if (state.layoutRun && typeof state.layoutRun === "object") {
          state.layoutRun.strategy = modeOverride;
        }
      } else {
        syncLayoutModeFromSelectedLayout();
      }
      if (isFragmentOnlyLayoutMode(state.layoutMode)) {
        void previewFragmentOnlyLayout(state.layoutMode);
        return;
      }
      if (!state.selectedZoneId) {
        const firstZone = Array.isArray(state.zones) ? state.zones[0] : null;
        if (firstZone && Number.isFinite(Number(firstZone.id))) {
          state.selectedZoneId = Number(firstZone.id);
        } else {
          byId("workspaceInfo").textContent = "РЎРЅР°С‡Р°Р»Р° РІС‹Р±РµСЂРёС‚Рµ Р·РѕРЅСѓ.";
          return;
        }
      }
          byId("invDebugInfo").textContent = t("manual_mode_active", null, "Manual mode is active");
          byId("invUsedTags").textContent = `(${t("no_data", null, "none")})`;
      renderSplitEvents([]);
      byId("fillType").value = isInventoryLikeLayoutMode(state.layoutMode)
        ? "voronoi"
        : (state.layoutRun.fillType || "voronoi");
      byId("inventoryScenario").value = "A";
      if (byId("invAllowanceMm")) {
        byId("invAllowanceMm").value = Number(parseLocaleNumber(state.layoutRun && state.layoutRun.allowanceMm, 12)).toFixed(1);
      }
      const savedNapTol = Number(
        state.layoutRun
        && state.layoutRun.lastConstraints
        && state.layoutRun.lastConstraints.napToleranceDeg
      );
      if (Number.isFinite(savedNapTol)) {
        setNapToleranceInputValue(savedNapTol, true);
      } else if (byId("invNapTol")) {
        byId("invNapTol").dataset.userTouched = "0";
        if (state.layoutRun && typeof state.layoutRun === "object") {
          state.layoutRun.__napTolTouchedByUser = false;
        }
      }
      intarsiaStepPhase = 1;
      syncFillTypeUi();
      const fillGridModeEl = byId("fillGridMode");
      if (fillGridModeEl) fillGridModeEl.onchange = () => { syncGridModeUi(); if (state.layoutMode === "intarsia") previewIntarsiaFragmentsDraft(); };
      const fillCenterModeEl = byId("fillCenterMode");
      if (fillCenterModeEl) fillCenterModeEl.onchange = () => syncGridModeUi();
      const svgPickBtn = byId("intarsiaSvgPickBtn");
      const svgFileInput = byId("intarsiaSvgFileInput");
      const svgClearBtn = byId("intarsiaSvgClearBtn");
      if (svgPickBtn && svgFileInput) {
        svgPickBtn.onclick = () => svgFileInput.click();
        svgFileInput.onchange = () => {
          const file = svgFileInput.files && svgFileInput.files[0];
          const statusEl = byId("intarsiaSvgStatus");
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const scaleEl = byId("intarsiaSvgScale");
            const manualScale = scaleEl ? Number(scaleEl.value) : 1;
            const result = parseSvgContours(ev.target.result, manualScale);
            if (result.error) {
              if (statusEl) statusEl.textContent = `РћС€РёР±РєР°: ${result.error}`;
              return;
            }
            if (!result.contours.length) {
              if (statusEl) statusEl.textContent = "РљРѕРЅС‚СѓСЂС‹ РЅРµ РЅР°Р№РґРµРЅС‹ РІ SVG";
              return;
            }
            const existingFrags = Array.isArray(state.intarsiaSvgFragments) ? state.intarsiaSvgFragments : [];
            const maxFragId = existingFrags.reduce((m, f) => Math.max(m, Number(f && f.id || 0)), 0);
            const addedFrags = result.contours.map((pts, i) => ({ id: maxFragId + i + 1, points: pts }));
            state.intarsiaSvgFragments = existingFrags.concat(addedFrags);
            if (statusEl) statusEl.textContent = `Р”РѕР±Р°РІР»РµРЅРѕ ${result.contours.length} РєРѕРЅС‚СѓСЂРѕРІ, РІСЃРµРіРѕ ${state.intarsiaSvgFragments.length} (РјР°СЃС€С‚Р°Р± ${result.autoScale.toFixed(4)} РјРј/РµРґ.)`;
            if (svgClearBtn) svgClearBtn.style.display = "";
            if (state.layoutMode === "intarsia") previewIntarsiaFragmentsDraft();
          };
          reader.readAsText(file);
          svgFileInput.value = "";
        };
      }
      if (svgClearBtn) {
        svgClearBtn.onclick = () => {
          state.intarsiaSvgFragments = null;
          const statusEl = byId("intarsiaSvgStatus");
          if (statusEl) statusEl.textContent = "Р¤Р°Р№Р» РЅРµ РІС‹Р±СЂР°РЅ";
          svgClearBtn.style.display = "none";
          if (state.layoutMode === "intarsia") previewIntarsiaFragmentsDraft();
        };
      }
      byId("inventoryStep1Backdrop").style.display = "flex";
      ensureInventoryStep1ModalPosition();
      if (state.layoutMode === "intarsia") {
        previewIntarsiaFragmentsDraft();
      }
    }
    function closeInventoryStep1() { byId("inventoryStep1Backdrop").style.display = "none"; }
    function showInventoryProgress() {
      byId("inventoryProgressBackdrop").style.display = "flex";
      resetInventoryProgressMonotonic();
      if (inventoryProgressView && typeof inventoryProgressView.resetSteps === "function") inventoryProgressView.resetSteps();
      if (inventoryProgressView && typeof inventoryProgressView.resetKpis === "function") inventoryProgressView.resetKpis();
      inventoryProgressLastTs = 0;
      inventoryProgressLastSig = "";
      inventoryLiveHistory = [];
      inventoryLiveLastPhase = "";
      inventoryLiveLastReason = "";
      inventoryLiveLastEvalBucket = -1;
      inventoryLiveLastRenderAt = 0;
      if (inventoryProgressController && typeof inventoryProgressController.setHadEvent === "function") {
        inventoryProgressController.setHadEvent(false);
      }
      updateInventoryProgressKpis({});
      setInventoryProgressStatus("РћР¶РёРґР°РЅРёРµ С‚РµР»РµРјРµС‚СЂРёРё...");
      inventoryProgressStartedAt = Date.now();
      updateInventoryProgressTimer();
      if (inventoryProgressTimerId) clearInterval(inventoryProgressTimerId);
      inventoryProgressTimerId = setInterval(updateInventoryProgressTimer, 250);
    }
    function hideInventoryProgress() {
      stopServerPreviewProgressTicker();
      byId("inventoryProgressBackdrop").style.display = "none";
      resetInventoryProgressMonotonic();
      if (inventoryProgressTimerId) {
        clearInterval(inventoryProgressTimerId);
        inventoryProgressTimerId = null;
      }
      if (inventoryProgressView && typeof inventoryProgressView.resetSteps === "function") inventoryProgressView.resetSteps();
      inventoryProgressStartedAt = 0;
      setInventoryProgressStatus("РћР¶РёРґР°РЅРёРµ С‚РµР»РµРјРµС‚СЂРёРё...");
    }
    function openInventoryStep2() {
      byId("inventoryStep2Backdrop").style.display = "flex";
      prepareInventoryStep2Modal();
      syncInventoryStep2ModeUi();
      renderInventoryManualPanel();
    }
    function closeInventoryStep2() { byId("inventoryStep2Backdrop").style.display = "none"; }
    function openReplaceCandidateModal() { byId("replaceCandidateBackdrop").style.display = "flex"; }
    function closeReplaceCandidateModal() { byId("replaceCandidateBackdrop").style.display = "none"; }

    function previewIntarsiaFragmentsDraft() {
      if (intarsiaPreview && typeof intarsiaPreview.previewIntarsiaFragmentsDraft === "function") {
        intarsiaPreview.previewIntarsiaFragmentsDraft();
      }
    }

    function finishIntarsiaContour() {
      const pts = Array.isArray(state.draftIntarsiaContour) ? state.draftIntarsiaContour : [];
      if (pts.length < 3) return;
      if (!Array.isArray(state.intarsiaSvgFragments)) state.intarsiaSvgFragments = [];
      const newId = Date.now();
      state.intarsiaSvgFragments.push({ id: newId, points: pts.slice() });
      state.draftIntarsiaContour = [];
      const modeEl = byId("fillGridMode");
      if (modeEl) modeEl.value = "import_svg";
      previewIntarsiaFragmentsDraft();
      setWorkspaceTool("select");
      byId("workspaceInfo").textContent = "";
      rerenderPropEditor();
    }

    async function runInventoryPickFlow(options = {}) {
      const intarsiaAssignOnly = !!(options && options.intarsiaAssignOnly);
      const runSeq = ++inventoryRunSeq;
      const isStaleRun = () => runSeq !== inventoryRunSeq;
      const intarsiaStart = state.layoutMode === "intarsia" && !intarsiaAssignOnly;
      if (!intarsiaStart) closeInventoryStep1();
      resetInventoryProgressMonotonic();
      setInventoryProgress(0, t("progress_prepare", null, "РџРѕРґРіРѕС‚РѕРІРєР° СЂР°СЃС‡РµС‚Р°"), { allowDecrease: true });
      showInventoryProgress();
      try {
        const zone = state.zones.find((z) => Number(z && z.id) === Number(state.selectedZoneId));
        if (!zone) throw new Error("zone_not_selected");
        const axis = state.layoutMode === "transverse" ? "x" : "y";
        const zoneNapDirectionDeg = getZoneNapDirectionDeg(zone);
        const fillType = String(byId("fillType").value || "voronoi");
        const inventoryScenario = "A";
        const inventoryLikeMode = isInventoryLikeLayoutMode(state.layoutMode);
        const manualMode = state.layoutMode === "inventory_manual";
        const intarsiaMode = state.layoutMode === "intarsia";
        const useDirectInventoryScenarioA = inventoryLikeMode && inventoryScenario === "A";
        const optimizationPreset = INVENTORY_OPTIMIZATION_PROFILE;
        const opt = optimizationPreset.options || {};
        const seed = Date.now();
        const qualityMode = "strict";
        const rasterMm = 2;
        if (intarsiaMode && !intarsiaAssignOnly) {
          setInventoryProgress(35, "\u0418\u043d\u0442\u0430\u0440\u0441\u0438\u044f / \u0428\u0430\u0433 1: \u043d\u0430\u0440\u0435\u0437\u043a\u0430 \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u043e\u0432");
          previewIntarsiaFragmentsDraft();
          if (isStaleRun()) return;
          setInventoryProgress(100, "\u0418\u043d\u0442\u0430\u0440\u0441\u0438\u044f / \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u044b \u0433\u043e\u0442\u043e\u0432\u044b");
          hideInventoryProgress();
          setIntarsiaStepPhase(2);
          return;
        }
        const fragmentMinAlongMm = Math.max(0, Number((byId("fragmentMinAlongMm") && byId("fragmentMinAlongMm").value) || 60));
        const fragmentMinAcrossMm = Math.max(0, Number((byId("fragmentMinAcrossMm") && byId("fragmentMinAcrossMm").value) || 60));
        const zoneMaterial = zone.materialId ? getFurMaterialById(zone.materialId) : null;
        const fragmentMaxAlongMm = (zoneMaterial && Number.isFinite(Number(zoneMaterial.maxLengthMm))) ? Number(zoneMaterial.maxLengthMm) : null;
        const fragmentMaxAcrossMm = (zoneMaterial && Number.isFinite(Number(zoneMaterial.maxWidthMm))) ? Number(zoneMaterial.maxWidthMm) : null;

        if (manualMode) {
          setInventoryProgress(3, t("progress_manual_init", null, "Manual mode / initialization"));
          addInventoryProgressNote(t("note_manual_start", null, "Manual pick started: preparing workspace."));
        }

        // Worker bootstrap (grid/bitset prepass) with real progress updates.
        try {
          if (manualMode) {
            setInventoryProgress(10, "Worker: bootstrap");
            addInventoryProgressNote(t("note_worker_raster_init", null, "Worker: raster initialization."));
          }
          const pre = await runCoverWorkerJob(
            "bootstrap",
            zone.points || [],
            { qualityMode, rasterMm, seed, stepBudgetMs: 12, padCells: 2 },
            [],
            (msg) => {
              const pct = Math.min(35, Number(msg.progressPercent || 0) * 0.35);
              const title = String(msg.phase || "РџРѕРґРіРѕС‚РѕРІРєР°");
              setInventoryProgress(pct, `Worker: ${title}`);
            }
          );
          if (isStaleRun()) return;
          if (pre && pre.gridSpec) state.layoutRun.workerGridSpec = pre.gridSpec;
          if (manualMode) {
            setInventoryProgress(28, "Worker: bootstrap");
            addInventoryProgressNote(t("note_worker_ready", null, "Worker ready."));
          }
        } catch (_) {
          // Fallback silently to server flow when worker is unavailable.
          if (isStaleRun()) return;
          if (manualMode) addInventoryProgressNote(t("note_worker_unavailable", null, "Worker unavailable, continuing without it."));
        }

        setInventoryProgress(40, t("progress_request_candidates", null, "Requesting candidates from DB"));
        if (manualMode) addInventoryProgressNote(t("note_request_candidates", null, "Requesting candidates from DB."));
        const common = {
          zone: { id: zone.id, points: zone.points || [] },
          directInventory: useDirectInventoryScenarioA,
          regularCompatibility: !!(intarsiaMode && intarsiaAssignOnly),
          thresholdBasis: (intarsiaMode && intarsiaAssignOnly) ? buildCurrentFragmentThresholdBasis() : null,
          axis,
          // For scenario A (direct inventory layout) we must allow tiny scraps too,
          // otherwise last holes can never be closed.
          minAreaMm2: Number(byId("invMinArea").value || 0),
          // In scenario A we do not pre-filter candidates by nap at fetch stage.
          // Nap is enforced during placement with allowed rotation tolerance.
          napDirectionDeg: (useDirectInventoryScenarioA || (intarsiaMode && intarsiaAssignOnly)) ? null : zoneNapDirectionDeg,
          napToleranceDeg: getEffectiveNapToleranceDegForCurrentRun(),
          // Coverage-first mode: for scenario A fetch a much wider pool.
          maxCandidates: Number(byId("invLimit").value || 300)
        };
        const candidatesRes = await api("/api/inventory/candidates", "POST", {
          ...common,
          onlyAvailable: true,
          includeScrapContour: true,
          materialId: manualMode ? (String((byId("invFurMaterialFilter") && byId("invFurMaterialFilter").value) || state.manualFurMaterialFilterId || "").trim() || undefined) : undefined
        });
        if (isStaleRun()) return;
        if (!candidatesRes.ok) throw new Error(candidatesRes.error || "candidates_failed");
        if (manualMode) {
          const cnt = Array.isArray(candidatesRes.items) ? candidatesRes.items.length : 0;
          setInventoryProgress(56, t("progress_request_candidates", null, "Requesting candidates from DB"));
          addInventoryProgressNote(t("note_candidates_received", { count: cnt }, `Candidates received: ${cnt}.`));
        }
        const workerCandidates = Array.isArray(candidatesRes.items)
          ? candidatesRes.items.map((c) => ({
              id: c && c.id,
              inventoryTag: c && c.inventoryTag,
              scrapContour: c && c.scrapContour
            }))
          : [];
        let prerankedCandidates = Array.isArray(candidatesRes.items) ? candidatesRes.items.slice() : [];
        try {
          setInventoryProgress(54, t("progress_worker_raster_prerank", null, "Worker / raster + pre-rank"));
          if (manualMode) addInventoryProgressNote(t("note_worker_prerank", null, "Worker: candidate pre-rank."));
          const preRankRes = await runCoverWorkerJob(
            "prerank",
            zone.points || [],
            { qualityMode, rasterMm, seed, stepBudgetMs: 12, padCells: 2 },
            workerCandidates,
            (msg) => {
              const base = 40;
              const span = 25;
              const pct = Math.min(65, base + (Number(msg.progressPercent || 0) / 100) * span);
              setInventoryProgress(pct, `Worker: ${String(msg.phase || "prerank")}`);
            }
          );
          if (isStaleRun()) return;
          if (preRankRes && Array.isArray(preRankRes.prerank) && preRankRes.prerank.length) {
            const rankMap = new Map();
            preRankRes.prerank.forEach((r, idx) => {
              const key = String(r.inventoryTag || r.id || "");
              if (key) rankMap.set(key, { idx, score: Number(r.score || 0) });
            });
            prerankedCandidates.sort((a, b) => {
              const ka = String((a && (a.inventoryTag || a.id)) || "");
              const kb = String((b && (b.inventoryTag || b.id)) || "");
              const ra = rankMap.has(ka) ? rankMap.get(ka).idx : 1e9;
              const rb = rankMap.has(kb) ? rankMap.get(kb).idx : 1e9;
              if (ra !== rb) return ra - rb;
              const sa = rankMap.has(ka) ? rankMap.get(ka).score : -1e9;
              const sb = rankMap.has(kb) ? rankMap.get(kb).score : -1e9;
              return sb - sa;
            });
          }
          if (manualMode) {
            setInventoryProgress(66, "Worker: pre-rank");
            addInventoryProgressNote(t("progress_worker_prerank_done", null, "Pre-rank completed."));
          }
        } catch (_) {
          // Keep server candidate order if worker pre-rank fails.
          if (isStaleRun()) return;
          if (manualMode) addInventoryProgressNote(t("note_prerank_skipped", null, "Pre-rank skipped, using DB order."));
        }
        try {
          const usage = state.tagUsage && typeof state.tagUsage === "object" ? state.tagUsage : {};
          prerankedCandidates = prerankedCandidates
            .map((c, idx) => {
              const tag = String((c && (c.inventoryTag || c.id)) || "");
              const used = Number(usage[tag] || 0);
              return { c, idx, used };
            })
            .sort((a, b) => {
              if (a.used !== b.used) return a.used - b.used;
              return a.idx - b.idx;
            })
            .map((x) => x.c);
        } catch (_) {}

        if (manualMode) {
          stopServerPreviewProgressTicker();
          closeInventoryProgressStream();
          setInventoryProgress(82, t("progress_manual_tray_prepare", null, "Manual mode / tray preparation"));
          addInventoryProgressNote(t("note_prepare_manual_tray", null, "Preparing tray for manual layout."));
          state.layoutRun.fragments = [];
          state.layoutRun.active = true;
          state.layoutRun.status = "preview";
          state.layoutRun.fillType = fillType;
          state.layoutRun.strategy = state.layoutMode;
          state.layoutRun.inventoryScenario = inventoryScenario;
          state.layoutRun.selectedZoneId = zone.id;
          if (!Array.isArray(state.layoutRun.placements) || state.layoutRun.placements.length === 0) {
            state.layoutRun.placements = [];
          }
          state.layoutRun.topChoicesByFragment = {};
          state.layoutRun.selectedPlacementFragmentId = null;
          state.layoutRun.candidatePool = prerankedCandidates;
          state.layoutRun.lastFilters = { materialId: "", allowedStatuses: [] };
          state.layoutRun.lastConstraints = {
            napDirectionDeg: zoneNapDirectionDeg,
            napToleranceDeg: getEffectiveNapToleranceDegForCurrentRun(),
            napPolicy: "normal",
            napWeight: 1.0,
            allowFlip180: false,
            minAlongMm: fragmentMinAlongMm || null,
            maxAlongMm: fragmentMaxAlongMm || null,
            minAcrossMm: fragmentMinAcrossMm || null,
            maxAcrossMm: fragmentMaxAcrossMm || null,
            minAreaMm2: Number(byId("invMinArea").value || 0),
            maxAreaMm2: null,
            minCoverageRatio: 0.75
          };
          state.layoutRun.lastAxis = axis;
          state.layoutRun.lastNapDirectionDeg = zoneNapDirectionDeg;
          state.layoutRun.lastSeed = Number(seed);
          {
            const prevAllowance = parseLocaleNumber(state.layoutRun && state.layoutRun.allowanceMm, 12);
            const nextAllowance = getCurrentManualAllowanceMm();
            state.layoutRun.allowanceMm = (Number(nextAllowance) > 0)
              ? Number(nextAllowance)
              : ((Number(prevAllowance) > 0) ? Number(prevAllowance) : 12);
          }
          state.layoutRun.previewLayers = { pieceIntersections: [], visibleArea: [], coverageHoles: [] };
          state.layoutRun.splitEvents = [];
          state.layoutRun.stats = { violations: 0, intersections: 0, uncovered: 1 };
          state.layoutRun.manual = {
            suggestions: [],
            lastMetrics: null,
            selectedCandidateTag: "",
            activePiece: null,
            lastEvalContours: null,
            statusNote: "РЅРµС‚ Р°РєС‚РёРІРЅРѕРіРѕ",
            selectedPlacementIndex: -1
          };
          byId("invTotalFragments").textContent = "0";
          byId("invViolations").textContent = "0";
          byId("invIntersections").textContent = "0";
          byId("invUncovered").textContent = "1";
          byId("invCoveragePercent").textContent = "0.00";
          byId("invResidualArea").textContent = Number(polygonArea(zone.points || []) || 0).toFixed(1);
          byId("invUsefulArea").textContent = "0.0";
          byId("invUsedScrapArea").textContent = "0.0";
          byId("invScrapUtilization").textContent = "0.00";
          byId("invScrapWaste").textContent = "100.00";
          byId("invOverlapArea").textContent = "0.0";
          byId("invCandidateAreaBudget").textContent = "0.0";
          byId("invDbCandidates").textContent = String(Array.isArray(prerankedCandidates) ? prerankedCandidates.length : 0);
          byId("invCompatibleCandidates").textContent = String(Array.isArray(prerankedCandidates) ? prerankedCandidates.length : 0);
          byId("invStrategyUsed").textContent = "manual";
          byId("invMatchedPct").textContent = "0.00";
          byId("invKpiCoveragePct").textContent = "0.00";
          byId("invTailCoverageStart").textContent = "-";
          byId("invTailOversizeAlpha").textContent = "-";
          byId("invRejectedOversize").textContent = "0";
          byId("invRejectedOverlap").textContent = "0";
          byId("invRejectedLowGain").textContent = "0";
          byId("invRejectedOutside").textContent = "0";
          byId("invDebugInfo").textContent = t("manual_mode_active", null, "Manual mode is active");
          byId("invUsedTags").textContent = `(${t("no_data", null, "none")})`;
          renderPlacementRows(Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements : []);
          renderSplitEvents([]);
          // Ensure contours + seam reserve layers are visible in manual mode
          state.layers.pfullZ = true;
          state.layers.pcoreZ = true;
          const _pfullChk = byId("layerPfullZ"); if (_pfullChk) _pfullChk.checked = true;
          const _pcoreChk = byId("layerPcoreZ"); if (_pcoreChk) _pcoreChk.checked = true;
          renderInventoryManualPanel();
          openInventoryStep2();
          if (isStaleRun()) return;
          setInventoryProgress(100, "Р СѓС‡РЅРѕР№ СЂРµР¶РёРј / РіРѕС‚РѕРІРѕ");
            addInventoryProgressNote(t("note_worker_raster_init", null, "Worker: raster initialization."));
          hideInventoryProgress();
          renderScene();
          return;
        }

        setInventoryProgress(68, t("progress_server_preview", null, "Server preview calculation"));
        startServerPreviewProgressTicker();
        const progressToken = createProgressToken();
        openInventoryProgressStream(progressToken);
        const placementStrategy = (inventoryLikeMode)
          ? "bestFit"
          : String(byId("placementStrategy").value || "bestFit");
        const filters = {
          materialId: "",
          allowedStatuses: []
        };
        const isRegularIntarsiaAssignOnly = !!(intarsiaMode && intarsiaAssignOnly);
        const constraints = {
          napDirectionDeg: zoneNapDirectionDeg,
          napToleranceDeg: getEffectiveNapToleranceDegForCurrentRun(),
          napPolicy: "normal",
          napWeight: 1.0,
          allowFlip180: false,
          minAlongMm: fragmentMinAlongMm || null,
          maxAlongMm: fragmentMaxAlongMm || null,
          minAcrossMm: fragmentMinAcrossMm || null,
          maxAcrossMm: fragmentMaxAcrossMm || null,
          minAreaMm2: Number(byId("invMinArea").value || 0),
          maxAreaMm2: null,
          minCoverageRatio: 0.75,
          minFitScore: isRegularIntarsiaAssignOnly ? 8 : 68,
          maxCandidatesPerFragment: 22,
          requireScrapContour: true
        };
        const seamAllowanceReserveMm = parseLocaleNumber(state.layoutRun && state.layoutRun.allowanceMm, null);
        const normalizeRules = {
          minFragmentWidthMm: Number(byId("minFragmentWidthMm").value || 0),
          minFragmentLengthMm: Number(byId("minFragmentLengthMm").value || 0),
          simplifyToleranceMm: null,
          mergeSmallFragments: false,
          seamAllowanceReserveMm: Number.isFinite(seamAllowanceReserveMm) ? seamAllowanceReserveMm : null
        };
        const isAssignOnlyScenario = inventoryLikeMode && inventoryScenario === "B";
        const previewTimeoutMs = useDirectInventoryScenarioA
          ? Math.max(45000, Math.min(180000, Number(opt.hardMaxSolveMs || 90000) + 15000))
          : ((intarsiaMode && intarsiaAssignOnly) ? 300000 : (isAssignOnlyScenario ? 120000 : 30000));
        byId("invDbCandidates").textContent = String(Array.isArray(prerankedCandidates) ? prerankedCandidates.length : 0);
        byId("invCompatibleCandidates").textContent = "вЂ¦";
        setInventoryProgressStatus(
          intarsiaMode && intarsiaAssignOnly
            ? "РЎРµСЂРІРµСЂРЅС‹Р№ РїРѕРґР±РѕСЂ РїРѕ С„СЂР°РіРјРµРЅС‚Р°Рј Р·Р°РїСѓС‰РµРЅ. РќР° СЃР»РѕР¶РЅРѕРј РєРµР№СЃРµ СЂР°СЃС‡С‘С‚ РјРѕР¶РµС‚ Р·Р°РЅСЏС‚СЊ РґРѕ 1 РјРёРЅСѓС‚С‹."
            : "РЎРµСЂРІРµСЂРЅС‹Р№ СЂР°СЃС‡С‘С‚ Р·Р°РїСѓС‰РµРЅ. РћР¶РёРґР°РµРј С‚РµР»РµРјРµС‚СЂРёСЋ."
        );
        const basePreviewPayload = {
          ...common,
          progressToken,
          fillType,
          directInventory: useDirectInventoryScenarioA,
          assignOnly: isAssignOnlyScenario,
          fragments: isAssignOnlyScenario
            ? ((state.layoutRun.active && Number(state.layoutRun.selectedZoneId || 0) === Number(zone.id))
              ? (state.layoutRun.fragments || [])
              : [])
            : [],
          placementStrategy,
          density: toScale10(byId("fillDensity").value, 5),
          variability: toScale10(byId("fillVariability").value, 5),
          anisotropy: toScale10(byId("fillAnisotropy").value, 5),
          rows: Number(byId("fillRows").value || 5),
          cols: Number(byId("fillCols").value || 5),
          gapX: Number(byId("fillGapX").value || 0),
          gapY: Number(byId("fillGapY").value || 0),
          cornerRadius: Number(byId("fillCornerRadius").value || 0),
          minFragmentWidthMm: Number(byId("minFragmentWidthMm").value || 0) || 0,
          minFragmentLengthMm: Number(byId("minFragmentLengthMm").value || 0) || 0,
          seamAllowanceReserveMm: Number.isFinite(seamAllowanceReserveMm) ? seamAllowanceReserveMm : 0,
          strictCoverage: useDirectInventoryScenarioA ? !!opt.strictCoverage : true,
          strictCoverageHard: useDirectInventoryScenarioA ? (opt.strictCoverageHard === true) : false,
          coverageTarget: useDirectInventoryScenarioA ? Number(opt.coverageTarget || 0.99999) : 0.99999,
          coverageEps: useDirectInventoryScenarioA ? Number(opt.coverageEps || 0.0005) : 0.0005,
          modeId: state.layoutMode === "inventory_split_return" ? "inventory_split_return" : undefined,
          splitReturnEnabled: state.layoutMode === "inventory_split_return",
          objectiveMode: useDirectInventoryScenarioA ? String(opt.objectiveMode || "default") : undefined,
          objectiveMinEfficiency: useDirectInventoryScenarioA ? Number(opt.objectiveMinEfficiency || 0.82) : undefined,
          objectivePiecePenalty: useDirectInventoryScenarioA ? Number(opt.objectivePiecePenalty || 0.18) : undefined,
          objectiveFragmentPenalty: useDirectInventoryScenarioA ? Number(opt.objectiveFragmentPenalty || 0.28) : undefined,
          minEfficiencyBase: useDirectInventoryScenarioA ? Number(opt.minEfficiencyBase || 0.20) : undefined,
          phaseAEndCoverage: useDirectInventoryScenarioA ? Number(opt.phaseAEndCoverage || 0.22) : undefined,
          phaseAInsideMin: useDirectInventoryScenarioA ? Number(opt.phaseAInsideMin || 0.90) : undefined,
          phaseAMaxOverlap: useDirectInventoryScenarioA ? Number(opt.phaseAMaxOverlap || 0.08) : undefined,
          phaseBEfficiencyMin: useDirectInventoryScenarioA ? Number(opt.phaseBEfficiencyMin || 0.42) : undefined,
          phaseAMinPieces: useDirectInventoryScenarioA ? Number(opt.phaseAMinPieces || 1) : undefined,
          phaseAMinGainMm2: useDirectInventoryScenarioA ? Number(opt.phaseAMinGainMm2 || 4000) : undefined,
          phaseAMinGainShare: useDirectInventoryScenarioA ? Number(opt.phaseAMinGainShare || 0.03) : undefined,
          minGainVisibleMm2: useDirectInventoryScenarioA ? (() => { const w = Number(byId("minFragmentWidthMm").value || 0); const l = Number(byId("minFragmentLengthMm").value || 0); return (w > 0 && l > 0) ? w * l : Number(opt.minGainVisibleMm2 || 10000); })() : undefined,
          minSpanMm: useDirectInventoryScenarioA ? (() => { const w = Number(byId("minFragmentWidthMm").value || 0); const l = Number(byId("minFragmentLengthMm").value || 0); return Math.max(w, l) > 0 ? Math.max(w, l) : Number(opt.minSpanMm || 100); })() : undefined,
          solverMode: useDirectInventoryScenarioA ? String(opt.solverMode || "phasedV1") : "legacyBoolean",
          maxSolveMs: useDirectInventoryScenarioA ? Number(opt.maxSolveMs || 60000) : 22000,
          hardMaxSolveMs: useDirectInventoryScenarioA ? Number(opt.hardMaxSolveMs || 180000) : 22000,
          maxPieces: useDirectInventoryScenarioA ? Number(opt.maxPieces || 240) : 48,
          maxPointsPerCandidate: useDirectInventoryScenarioA ? Number(opt.maxPointsPerCandidate || 120) : 90,
          minGainAreaMm2: useDirectInventoryScenarioA ? Number(opt.minGainAreaMm2 || 1) : undefined,
          enforceMinGainByArea: useDirectInventoryScenarioA ? (opt.enforceMinGainByArea !== false) : undefined,
          coverageFirst: useDirectInventoryScenarioA ? !!opt.coverageFirst : undefined,
          enforceTimeBudget: useDirectInventoryScenarioA ? !!opt.enforceTimeBudget : true,
          maxRepairAttempts: useDirectInventoryScenarioA ? Number(opt.maxRepairAttempts || 4) : undefined,
          repairWindow: useDirectInventoryScenarioA ? Number(opt.repairWindow || 28) : undefined,
          tailCoverageStart: useDirectInventoryScenarioA ? Number(opt.tailCoverageStart || 0.93) : undefined,
          tailResidualRatio: useDirectInventoryScenarioA ? Number(opt.tailResidualRatio || 0.03) : undefined,
          tailResidualLooseRatio: useDirectInventoryScenarioA ? Number(opt.tailResidualLooseRatio || 0.015) : undefined,
          tailMinEfficiency: useDirectInventoryScenarioA ? Number(opt.tailMinEfficiency || 0.30) : undefined,
          tailMinEfficiencyLoose: useDirectInventoryScenarioA ? Number(opt.tailMinEfficiencyLoose || 0.18) : undefined,
          pocketModeStartRatio: useDirectInventoryScenarioA ? Number(opt.pocketModeStartRatio || 0.08) : undefined,
          pocketAreaK: useDirectInventoryScenarioA ? Number(opt.pocketAreaK || 2.4) : undefined,
          tailOversizeAlpha: useDirectInventoryScenarioA ? Number(opt.tailOversizeAlpha || 2.4) : undefined,
          tailStallTrigger: useDirectInventoryScenarioA ? Number(opt.tailStallTrigger || 3) : undefined,
          tailPenaltyBoost: useDirectInventoryScenarioA ? Number(opt.tailPenaltyBoost || 2.2) : undefined,
          tailMaxPlacements: useDirectInventoryScenarioA ? Number(opt.tailMaxPlacements || 14) : undefined,
          tailCapResidualRatio: useDirectInventoryScenarioA ? Number(opt.tailCapResidualRatio || 0.03) : undefined,
          tailMinGainShare: useDirectInventoryScenarioA ? Number(opt.tailMinGainShare || 0.22) : undefined,
          tailMinGainCapMm2: useDirectInventoryScenarioA ? Number(opt.tailMinGainCapMm2 || 280) : undefined,
          layerPolicy: useDirectInventoryScenarioA ? String(opt.layerPolicy || "first_on_top") : undefined,
          maxPieceOverlap: useDirectInventoryScenarioA ? Number(opt.maxPieceOverlap || 0.95) : undefined,
          overlapPenalty: useDirectInventoryScenarioA ? Number(opt.overlapPenalty || 0.25) : undefined,
          outsidePenalty: useDirectInventoryScenarioA ? Number(opt.outsidePenalty || 0.05) : undefined,
          minInsideRatio: useDirectInventoryScenarioA ? Number(opt.minInsideRatio || 0.01) : undefined,
          qualityMode,
          rasterMm,
          seed,
          filters,
          constraints,
          normalizeRules,
          candidates: prerankedCandidates
        };
        let previewRes;
        let assignOnlyBaseFragments = null;
        if (intarsiaMode && intarsiaAssignOnly) {
        setInventoryProgress(68, t("progress_server_preview", null, "Server preview calculation"));
          let stageFragments = Array.isArray(state.layoutRun.fragments)
            ? state.layoutRun.fragments.map((f, idx) => ({
              id: Number(f && f.id) || (idx + 1),
              points: Array.isArray(f && f.points) ? f.points : []
            }))
            : [];
          if (!stageFragments.length) {
            const splitRes = generateFragmentsForZone(zone.points || [], {
              fillType: "regular",
              rows: Number(byId("fillRows").value || 5),
              cols: Number(byId("fillCols").value || 5),
              gapX: Number(byId("fillGapX").value || 0),
              gapY: Number(byId("fillGapY").value || 0),
              cornerRadius: Number(byId("fillCornerRadius").value || 0),
              variability: 0
            });
            stageFragments = Array.isArray(splitRes && splitRes.fragments) ? splitRes.fragments : [];
          }
          if (!stageFragments.length) throw new Error("intarsia_split_empty");
          byId("invTotalFragments").textContent = String(stageFragments.length);
          updateInventoryProgressKpis({ pieces: stageFragments.length });
          assignOnlyBaseFragments = stageFragments.map((f, idx) => ({
            id: Number(f && f.id) || (idx + 1),
            points: Array.isArray(f && f.points) ? f.points : []
          }));
          previewRes = await api(`/api/layout/fill/preview?progressToken=${encodeURIComponent(progressToken)}`, "POST", {
            ...basePreviewPayload,
            fillType: "regular",
            assignOnly: true,
            directInventory: false,
            fragments: stageFragments
          }, previewTimeoutMs);
        } else {
          previewRes = await api(`/api/layout/fill/preview?progressToken=${encodeURIComponent(progressToken)}`, "POST", basePreviewPayload, previewTimeoutMs);
        }
        if (isStaleRun()) return;
        if (!previewRes.ok) throw new Error(previewRes.error || "preview_failed");
        stopServerPreviewProgressTicker();
        closeInventoryProgressStream();
        if (inventoryLikeMode && inventoryScenario === "B" && (!Array.isArray(previewRes.fragments) || previewRes.fragments.length === 0)) {
          throw new Error("fragments_required_for_mode_b");
        }

        setInventoryProgress(96, t("progress_result_build", null, "Building result"));
        const previewFragments = Array.isArray(previewRes.fragments)
          ? previewRes.fragments.map((f, idx) => ({
            ...f,
            id: Number(f && f.id) || (idx + 1),
            points: Array.isArray(f && f.points) ? f.points : [],
            ownerPlacementIndex: Number.isFinite(Number(f && f.ownerPlacementIndex))
              ? Number(f.ownerPlacementIndex)
              : null,
            ownerPlacementId: Number.isFinite(Number(f && f.ownerPlacementId))
              ? Number(f.ownerPlacementId)
              : null
          }))
          : [];
        if (intarsiaMode && intarsiaAssignOnly && Array.isArray(assignOnlyBaseFragments) && assignOnlyBaseFragments.length) {
          // In intarsia step-2 we keep UI fragment geometry from step-1 regular grid.
          // Preview fragments may contain transformed/matched contours and must not replace the grid view.
          state.layoutRun.fragments = assignOnlyBaseFragments;
          state.layoutRun.matchedFragmentGeometry = previewFragments;
          state.layers.pieceBorders = true;
          const _pbChk = byId("layerPieceBorders"); if (_pbChk) _pbChk.checked = true;
        } else {
          state.layoutRun.fragments = previewFragments;
          state.layoutRun.matchedFragmentGeometry = null;
        }
        state.layoutRun.active = true;
        state.layoutRun.status = "preview";
        state.layoutRun.fillType = fillType;
        state.layoutRun.strategy = state.layoutMode;
        state.layoutRun.inventoryScenario = inventoryScenario;
        state.layoutRun.selectedZoneId = zone.id;
        state.layoutRun.placements = Array.isArray(previewRes.placements) ? previewRes.placements : [];
        state.layoutRun.candidatePool = prerankedCandidates;
        state.layoutRun.resultStatus = String(previewRes.resultStatus || "ok");
        state.layoutRun.failedReason = previewRes.failedReason || null;
        state.layoutRun.algorithmTrace = previewRes.algorithmTrace || null;
        state.layoutRun.paramsSnapshot = previewRes.paramsSnapshot && typeof previewRes.paramsSnapshot === "object"
          ? previewRes.paramsSnapshot
          : null;
        state.layoutRun.lastFilters = filters;
        state.layoutRun.lastConstraints = constraints;
        state.layoutRun.lastAxis = axis;
        state.layoutRun.lastNapDirectionDeg = zoneNapDirectionDeg;
        state.layoutRun.lastSeed = Number(previewRes.seedUsed || seed);
        state.layoutRun.gridSpec = previewRes.gridSpec || null;
        state.layoutRun.previewLayers = previewRes.previewLayers && typeof previewRes.previewLayers === "object"
          ? previewRes.previewLayers
          : { pieceIntersections: [], visibleArea: [] };
        state.layoutRun.splitEvents = Array.isArray(previewRes.splitEvents) ? previewRes.splitEvents : [];
        state.selectedFragmentId = null;
        state.layoutRun.stats = previewRes.stats || { violations: 0, intersections: 0, uncovered: 0 };
        byId("invTotalFragments").textContent = String(state.layoutRun.fragments.length);
        byId("invViolations").textContent = String(state.layoutRun.stats.violations || 0);
        byId("invIntersections").textContent = String(state.layoutRun.stats.intersections || 0);
        byId("invUncovered").textContent = String(state.layoutRun.stats.uncovered || 0);
        byId("invCoveragePercent").textContent = Number(previewRes.coveragePercent || 0).toFixed(2);
        byId("invResidualArea").textContent = Number(previewRes.residualAreaMm2 || 0).toFixed(1);
        const scrapUsage = previewRes.scrapUsage && typeof previewRes.scrapUsage === "object" ? previewRes.scrapUsage : {};
        const visibleMetrics = previewRes.visibleMetrics && typeof previewRes.visibleMetrics === "object" ? previewRes.visibleMetrics : {};
        const diagnostics = previewRes.diagnostics && typeof previewRes.diagnostics === "object" ? previewRes.diagnostics : {};
        const usefulAreaMm2 = Number(
          Number.isFinite(Number(visibleMetrics.usefulAreaMm2))
            ? visibleMetrics.usefulAreaMm2
            : (previewRes.usedAreaMm2 || scrapUsage.usefulAreaMm2 || 0)
        );
        const selectedInZoneAreaMm2 = Number(
          Number.isFinite(Number(visibleMetrics.selectedInZoneAreaMm2))
            ? visibleMetrics.selectedInZoneAreaMm2
            : (previewRes.selectedInZoneAreaMm2 || previewRes.selectedPiecesAreaMm2 || scrapUsage.usedScrapAreaMm2 || 0)
        );
        const overlapAreaMm2 = Number(
          Number.isFinite(Number(visibleMetrics.overlapAreaMm2))
            ? visibleMetrics.overlapAreaMm2
            : (previewRes.overlapAreaMm2 || 0)
        );
        const utilizationPct = Number(
          Number.isFinite(Number(visibleMetrics.utilizationPct))
            ? visibleMetrics.utilizationPct
            : (previewRes.utilizationPct || scrapUsage.scrapUtilizationPercent || 0)
        );
        const wastePct = Number(Number.isFinite(Number(previewRes.wastePct)) ? previewRes.wastePct : (100 - utilizationPct));
        byId("invUsefulArea").textContent = usefulAreaMm2.toFixed(1);
        byId("invUsedScrapArea").textContent = selectedInZoneAreaMm2.toFixed(1);
        byId("invScrapUtilization").textContent = utilizationPct.toFixed(2);
        byId("invScrapWaste").textContent = Math.max(0, wastePct).toFixed(2);
        byId("invOverlapArea").textContent = overlapAreaMm2.toFixed(1);
        byId("invCandidateAreaBudget").textContent = Number(previewRes.candidateAreaBudgetMm2 || 0).toFixed(1);
        byId("invDbCandidates").textContent = String(Number(candidatesRes.sourceCandidatesTotal || candidatesRes.dbCandidates || 0));
        byId("invCompatibleCandidates").textContent = String(Number(previewRes.compatibleCandidates || 0));
        const kpi = previewRes.kpi && typeof previewRes.kpi === "object" ? previewRes.kpi : {};
        byId("invStrategyUsed").textContent = String(kpi.strategyUsed || previewRes.placementStrategy || "-");
        byId("invMatchedPct").textContent = Number(kpi.matchedPct || 0).toFixed(2);
        byId("invKpiCoveragePct").textContent = Number(kpi.coveragePct || previewRes.coveragePercent || 0).toFixed(2);
        const opts = previewRes.paramsSnapshot && previewRes.paramsSnapshot.options
          ? previewRes.paramsSnapshot.options
          : {};
        const tailCoverageStartVal = Number.isFinite(Number(opts.tailCoverageStart))
          ? Number(opts.tailCoverageStart)
          : Number(opt.tailCoverageStart || 0.93);
        const tailOversizeAlphaVal = Number.isFinite(Number(opts.tailOversizeAlpha))
          ? Number(opts.tailOversizeAlpha)
          : Number(opt.tailOversizeAlpha || 2.4);
        byId("invTailCoverageStart").textContent = tailCoverageStartVal.toFixed(3);
        byId("invTailOversizeAlpha").textContent = tailOversizeAlphaVal.toFixed(2);
        const warningsText = Array.isArray(previewRes.warnings) && previewRes.warnings.length
          ? previewRes.warnings.join("\n")
          : "OK";
        const trace = previewRes.algorithmTrace && previewRes.algorithmTrace.steps
          ? previewRes.algorithmTrace.steps
          : null;
        const rej = trace && trace.placement_search && trace.placement_search.rejected
          ? trace.placement_search.rejected
          : {};
        byId("invRejectedOversize").textContent = String(Number(rej.oversize || 0));
        byId("invRejectedOverlap").textContent = String(Number(rej.overlap || 0));
        byId("invRejectedLowGain").textContent = String(Number(rej.lowGain || 0));
        byId("invRejectedOutside").textContent = String(Number(rej.outside || 0));
        appendServerTraceProgress(trace);
        const matchedCount = Array.isArray(state.layoutRun.placements)
          ? state.layoutRun.placements.filter((p) => String(p && p.status || "") === "matched").length
          : 0;
        const progressUtilizationPct = Number(
          Number.isFinite(Number(visibleMetrics && visibleMetrics.utilizationPct))
            ? visibleMetrics.utilizationPct
            : (previewRes.utilizationPct || scrapUsage.scrapUtilizationPercent || 0)
        );
        updateInventoryProgressKpis({
          pieces: matchedCount,
          coverage: Number(previewRes.coveragePercent || 0),
          utilization: Number(progressUtilizationPct),
          tail: Number(
            Number.isFinite(Number(diagnostics.outsideShareOfSelectedPct))
              ? diagnostics.outsideShareOfSelectedPct
              : (scrapUsage.scrapWastePercent || 0)
          )
        });
        const traceText = trace
          ? [
              `trace.candidate_pool.compatible=${Number(trace.candidate_pool && trace.candidate_pool.compatible || 0)}`,
              `trace.candidate_pool.templates=${Number(trace.candidate_pool && trace.candidate_pool.templates || 0)}`,
              `trace.placement_search.evaluated=${Number(trace.placement_search && trace.placement_search.evaluated || 0)}`,
              `trace.placement_search.placed=${Number(trace.placement_search && trace.placement_search.placed || 0)}`,
              `trace.strict_final_check.fullCoverageOk=${!!(trace.strict_final_check && trace.strict_final_check.fullCoverageOk)}`
            ].join("\n")
          : "";
        const funnel = candidatesRes && candidatesRes.poolFunnel && typeof candidatesRes.poolFunnel === "object"
          ? candidatesRes.poolFunnel
          : null;
        const funnelThresholds = funnel && funnel.thresholds && typeof funnel.thresholds === "object"
          ? funnel.thresholds
          : null;
        const funnelBasis = funnel && funnel.thresholdBasis && typeof funnel.thresholdBasis === "object"
          ? funnel.thresholdBasis
          : null;
        const funnelRejected = funnel && funnel.rejected && typeof funnel.rejected === "object"
          ? funnel.rejected
          : null;
        const funnelText = funnel
          ? [
              `pool.totalSource=${Number(funnel.totalSource || 0)}`,
              `pool.afterStatus=${Number(funnel.afterStatus || 0)}`,
              `pool.afterMaterial=${Number(funnel.afterMaterial || 0)}`,
              `pool.afterContour=${Number(funnel.afterContour || 0)}`,
              `pool.afterQuality=${Number(funnel.afterQuality || 0)}`,
              `pool.afterNap=${Number(funnel.afterNap || 0)}`,
              `pool.afterAreaBBoxSpan=${Number(funnel.afterAreaBBoxSpan || 0)}`,
              `pool.afterScoring=${Number(funnel.afterScoring || 0)}`,
              `pool.poolCandidates=${Number(funnel.poolCandidates || 0)}`,
              funnelBasis ? `pool.thresholdBasis=${String(funnelBasis.source || funnelBasis.kind || "-")}` : "",
              funnelThresholds ? `pool.threshold.minAreaMm2=${Number(funnelThresholds.minAreaMm2 || 0)}` : "",
              funnelThresholds ? `pool.threshold.minWidthMm=${Number(funnelThresholds.minWidthMm || 0)}` : "",
              funnelThresholds ? `pool.threshold.minHeightMm=${Number(funnelThresholds.minHeightMm || 0)}` : "",
              funnelThresholds ? `pool.threshold.minSpanMm=${Number(funnelThresholds.minSpanMm || 0)}` : "",
              funnelRejected
                ? Object.keys(funnelRejected).sort().map((k) => `pool.reject.${k}=${Number(funnelRejected[k] || 0)}`).join("\n")
                : ""
            ].filter(Boolean).join("\n")
          : "";
        const compat = diagnostics && diagnostics.compatibilityBreakdown && typeof diagnostics.compatibilityBreakdown === "object"
          ? diagnostics.compatibilityBreakdown
          : null;
        const compatRejected = compat && compat.rejected && typeof compat.rejected === "object"
          ? compat.rejected
          : null;
        const compatText = compat
          ? [
              `compat.input=${Number(compat.input || 0)}`,
              `compat.compatible=${Number(compat.compatible || 0)}`,
              compatRejected
                ? Object.keys(compatRejected).sort().map((k) => `compat.reject.${k}=${Number(compatRejected[k] || 0)}`).join("\n")
                : ""
            ].filter(Boolean).join("\n")
          : "";
        const placementBreakdown = diagnostics && diagnostics.placementBreakdown && typeof diagnostics.placementBreakdown === "object"
          ? diagnostics.placementBreakdown
          : null;
        state.layoutRun.topChoicesByFragment = placementBreakdown && placementBreakdown.topChoicesByFragment && typeof placementBreakdown.topChoicesByFragment === "object"
          ? placementBreakdown.topChoicesByFragment
          : {};
        state.layoutRun.selectedPlacementFragmentId = null;
        function pushPlacementMetric(lines, prefix, value) {
          if (!value || typeof value !== "object") return;
          for (const key of Object.keys(value).sort()) {
            const child = value[key];
            if (child && typeof child === "object" && !Array.isArray(child)) {
              pushPlacementMetric(lines, `${prefix}.${key}`, child);
              continue;
            }
            if (typeof child === "number" || (typeof child === "string" && child.trim() !== "" && Number.isFinite(Number(child)))) {
              lines.push(`${prefix}.${key}=${Number(child)}`);
            }
          }
        }
        const placementText = (() => {
          if (!placementBreakdown) return "";
          const lines = [];
          for (const k of Object.keys(placementBreakdown).sort()) {
            const v = placementBreakdown[k];
            if (k === "rejected" && v && typeof v === "object") {
              for (const rk of Object.keys(v).sort()) {
                lines.push(`place.reject.${rk}=${Number(v[rk] || 0)}`);
              }
              continue;
            }
            if (k === "rejectedSamples" && v && typeof v === "object") {
              const sampleKinds = Object.keys(v).sort();
              const sampleTotal = sampleKinds.reduce((acc, sk) => {
                const arr = Array.isArray(v[sk]) ? v[sk] : [];
                return acc + arr.length;
              }, 0);
              lines.push(`place.rejectedSamples.total=${sampleTotal}`);
              for (const sk of sampleKinds) {
                const arr = Array.isArray(v[sk]) ? v[sk] : [];
                lines.push(`place.rejectedSamples.${sk}=${arr.length}`);
              }
              continue;
            }
            if (k === "primaryRejected" && v && typeof v === "object") {
              for (const rk of Object.keys(v).sort()) {
                lines.push(`place.primaryReject.${rk}=${Number(v[rk] || 0)}`);
              }
              continue;
            }
            if ((k === "fragmentCoverageWorst" || k === "primaryFragmentCoverageWorst") && Array.isArray(v)) {
              v.slice(0, 5).forEach((row, idx) => {
                if (!row || typeof row !== "object") return;
                const fid = Number(row.fragmentId || 0);
                const cov = Number(row.coverageRatio || 0);
                const pieces = Number(row.piecesUsed || 0);
                lines.push(`place.${k}.${idx + 1}=frag:${fid};cov:${cov.toFixed(3)};pieces:${pieces}`);
              });
              continue;
            }
            if (v && typeof v === "object" && !Array.isArray(v)) {
              pushPlacementMetric(lines, `place.${k}`, v);
              continue;
            }
            if (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))) {
              lines.push(`place.${k}=${Number(v)}`);
            }
          }
          return lines.join("\n");
        })();
        byId("invDebugInfo").textContent = [traceText, compatText, placementText].filter(Boolean).join("\n");
        byId("invUsedTags").textContent = Array.isArray(previewRes.usedInventoryTags) && previewRes.usedInventoryTags.length
          ? previewRes.usedInventoryTags.join("\n")
          : `(${t("no_data", null, "none")})`;
        if (Array.isArray(previewRes.usedInventoryTags) && previewRes.usedInventoryTags.length) {
          if (!state.tagUsage || typeof state.tagUsage !== "object") state.tagUsage = {};
          for (const tagRaw of previewRes.usedInventoryTags) {
            const tag = String(tagRaw || "").trim();
            if (!tag) continue;
            state.tagUsage[tag] = Number(state.tagUsage[tag] || 0) + 1;
          }
          const keys = Object.keys(state.tagUsage);
          if (keys.length > 800) {
            for (const k of keys) {
              state.tagUsage[k] = Math.max(0, Number(state.tagUsage[k] || 0) - 1);
              if (state.tagUsage[k] <= 0) delete state.tagUsage[k];
            }
          }
        }
        renderPlacementRows(state.layoutRun.placements);
        renderSplitEvents(state.layoutRun.splitEvents);
        byId("workspaceInfo").textContent = `РљР°РЅРґРёРґР°С‚С‹: ${Number(candidatesRes.matchedCandidates || 0)}, С„СЂР°РіРјРµРЅС‚С‹: ${state.layoutRun.fragments.length}, seed=${state.layoutRun.lastSeed}`;
        const canApply = !(
          (state.layoutMode === "inventory" || state.layoutMode === "inventory_split_return") &&
          inventoryScenario === "A" &&
          (
            Number(state.layoutRun.stats.violations || 0) > 0 ||
            String(state.layoutRun.resultStatus || "ok") !== "ok"
          )
        ) || isManualInventoryMode();
        const applyBtn = byId("inventoryStep2ApplyBtn");
        if (applyBtn) {
          applyBtn.disabled = !canApply;
          applyBtn.title = canApply
            ? ""
            : t(
              "apply_requires_coverage",
              { reason: state.layoutRun.failedReason ? ` (${state.layoutRun.failedReason})` : "" },
              `Cannot apply: 100% coverage is required${state.layoutRun.failedReason ? ` (${state.layoutRun.failedReason})` : ""}`
            );
        }
        setInventoryProgress(100, t("progress_done", null, "Done"));
        openInventoryStep2();
        renderScene();
      } catch (err) {
        if (isStaleRun()) return;
        stopServerPreviewProgressTicker();
        closeInventoryProgressStream();
        const msg = err && err.message ? err.message : String(err);
        byId("workspaceInfo").textContent = `РћС€РёР±РєР° РїРѕРґР±РѕСЂР°: ${msg}`;
        byId("invTotalFragments").textContent = "0";
        byId("invViolations").textContent = "0";
        byId("invIntersections").textContent = "0";
        byId("invUncovered").textContent = "0";
        byId("invCoveragePercent").textContent = "0";
        byId("invResidualArea").textContent = "0";
        byId("invUsefulArea").textContent = "0";
        byId("invUsedScrapArea").textContent = "0";
        byId("invScrapUtilization").textContent = "0";
        byId("invScrapWaste").textContent = "0";
        byId("invOverlapArea").textContent = "0";
        byId("invCandidateAreaBudget").textContent = "0";
        byId("invDbCandidates").textContent = "0";
        byId("invCompatibleCandidates").textContent = "0";
        byId("invStrategyUsed").textContent = "-";
        byId("invMatchedPct").textContent = "0.00";
        byId("invKpiCoveragePct").textContent = "0.00";
        byId("invTailCoverageStart").textContent = "-";
        byId("invTailOversizeAlpha").textContent = "-";
        byId("invRejectedOversize").textContent = "0";
        byId("invRejectedOverlap").textContent = "0";
        byId("invRejectedLowGain").textContent = "0";
        byId("invRejectedOutside").textContent = "0";
        if (inventoryProgressView && typeof inventoryProgressView.resetKpis === "function") inventoryProgressView.resetKpis();
        updateInventoryProgressKpis({});
        setInventoryProgressStatus(`РћС€РёР±РєР°: ${msg}`);
          byId("invUsedTags").textContent = `(${t("no_data", null, "none")})`;
        byId("invDebugInfo").textContent = `РћС€РёР±РєР°: ${msg}`;
        const applyBtn = byId("inventoryStep2ApplyBtn");
        if (applyBtn) {
          applyBtn.disabled = true;
          applyBtn.title = "РќРµР»СЊР·СЏ РїСЂРёРјРµРЅРёС‚СЊ РёР·-Р·Р° РѕС€РёР±РєРё РїРѕРґР±РѕСЂР°";
        }
        state.layoutRun.placements = [];
        state.layoutRun.topChoicesByFragment = {};
        state.layoutRun.selectedPlacementFragmentId = null;
        state.layoutRun.previewLayers = { pieceIntersections: [], visibleArea: [], coverageHoles: [] };
        state.layoutRun.splitEvents = [];
        state.selectedFragmentId = null;
        renderPlacementRows([]);
        renderSplitEvents([]);
        openInventoryStep2();
      } finally {
        if (isStaleRun()) return;
        closeInventoryProgressStream();
        setTimeout(() => hideInventoryProgress(), 120);
      }
    }

    function renderPropertyEditor() {
      if (propertyEditorView && typeof propertyEditorView.renderPropertyEditor === "function") {
        propertyEditorView.renderPropertyEditor();
      }
    }

    function syncLayerLegendCounters() {
      if (layerLegend && typeof layerLegend.syncCounters === "function") {
        layerLegend.syncCounters();
        return;
      }
      const fragmentsCount = Array.isArray(state.layoutRun && state.layoutRun.fragments)
        ? state.layoutRun.fragments.length
        : 0;
      const matchedPiecesCount = Array.isArray(state.layoutRun && state.layoutRun.placements)
        ? state.layoutRun.placements.filter((p) => String(p && p.status || "") === "matched").length
        : 0;
      const fragLabel = byId("layerPieceBordersLabel");
      const pieceLabel = byId("layerAssignedPiecesLabel");
      const pieceToggle = byId("layerAssignedPieces");
      if (fragLabel) {
        const manualBeforeApply = isManualInventoryMode() && String(state.layoutRun && state.layoutRun.status || "") !== "applied";
        fragLabel.textContent = t("layer_fragments_label", null, "Р¤СЂР°РіРјРµРЅС‚С‹");
      }
      if (pieceLabel) pieceLabel.textContent = `${t("layer_pieces_label", null, "РџРѕРґРѕР±СЂР°РЅРЅС‹Рµ РєСѓСЃРєРё")} (${matchedPiecesCount})`;
      if (pieceToggle) {
        pieceToggle.title = matchedPiecesCount > 0
          ? ""
          : t("layer_no_matched_pieces", null, "Р’ С‚РµРєСѓС‰РµРј СЂРµР·СѓР»СЊС‚Р°С‚Рµ РЅРµС‚ РїРѕРґРѕР±СЂР°РЅРЅС‹С… РєСѓСЃРєРѕРІ");
      }
    }

    function renderScene() {
      try { _renderScene(); } catch (err) {
        console.error("[renderScene]", err);
        const info = byId("workspaceInfo");
        if (info) info.textContent = `[render error] ${err && err.message || err}`;
      }
    }
    function _renderScene() {
      invalidateDetailBoundaryCache();
      layerGuides.destroyChildren();
      layerContent.destroyChildren();
      layerOverlay.destroyChildren();
      layerSelection.destroyChildren();
      syncLayerLegendCounters();
      const compactZprj = previewSourceType === "zprj" && state.view.zprjCompactView === true;
      const showGuidesEffective = compactZprj ? false : state.layers.guides;
      const showLabelsEffective = compactZprj ? false : state.view.showDetailLabels;

      if (showGuidesEffective) {
        const niceSteps = [1, 2, 5];
        const targetMinorPx = 30;
        const minMinorPx = 14;
        const pxPerMm = Math.max(1e-6, Number(state.viewport && state.viewport.scale || 1));
        const targetMinorMm = targetMinorPx / pxPerMm;
        let minorStepMm = 1;
        let exp = Math.floor(Math.log10(Math.max(1e-6, targetMinorMm)));
        let best = Infinity;
        for (let e = exp - 1; e <= exp + 2; e++) {
          const pow10 = Math.pow(10, e);
          for (const b of niceSteps) {
            const s = b * pow10;
            if (!(s > 0)) continue;
            const err = Math.abs(s - targetMinorMm);
            if (err < best) {
              best = err;
              minorStepMm = s;
            }
          }
        }
        const majorStepMm = minorStepMm * 5;
        const showMinor = minorStepMm * pxPerMm >= minMinorPx;
        const wA = screenToWorld(0, 0);
        const wB = screenToWorld(W, H);
        const minX = Math.min(Number(wA && wA.x || 0), Number(wB && wB.x || 0));
        const maxX = Math.max(Number(wA && wA.x || 0), Number(wB && wB.x || 0));
        const minY = Math.min(Number(wA && wA.y || 0), Number(wB && wB.y || 0));
        const maxY = Math.max(Number(wA && wA.y || 0), Number(wB && wB.y || 0));
        const startXMinor = Math.floor(minX / minorStepMm) * minorStepMm;
        const endXMinor = Math.ceil(maxX / minorStepMm) * minorStepMm;
        const startYMinor = Math.floor(minY / minorStepMm) * minorStepMm;
        const endYMinor = Math.ceil(maxY / minorStepMm) * minorStepMm;
        const startXMajor = Math.floor(minX / majorStepMm) * majorStepMm;
        const endXMajor = Math.ceil(maxX / majorStepMm) * majorStepMm;
        const startYMajor = Math.floor(minY / majorStepMm) * majorStepMm;
        const endYMajor = Math.ceil(maxY / majorStepMm) * majorStepMm;
        if (showMinor) {
          for (let x = startXMinor; x <= endXMinor + 1e-9; x += minorStepMm) {
            layerGuides.add(new Konva.Line({
              points: linePoints([{ x, y: minY }, { x, y: maxY }]),
              stroke: ENGINEERING_STYLES.guides.minorStroke || ENGINEERING_STYLES.guides.stroke,
              strokeWidth: Number(ENGINEERING_STYLES.guides.minorWidth || ENGINEERING_STYLES.guides.strokeWidth || 0.75)
            }));
          }
          for (let y = startYMinor; y <= endYMinor + 1e-9; y += minorStepMm) {
            layerGuides.add(new Konva.Line({
              points: linePoints([{ x: minX, y }, { x: maxX, y }]),
              stroke: ENGINEERING_STYLES.guides.minorStroke || ENGINEERING_STYLES.guides.stroke,
              strokeWidth: Number(ENGINEERING_STYLES.guides.minorWidth || ENGINEERING_STYLES.guides.strokeWidth || 0.75)
            }));
          }
        }
        for (let x = startXMajor; x <= endXMajor + 1e-9; x += majorStepMm) {
          layerGuides.add(new Konva.Line({
            points: linePoints([{ x, y: minY }, { x, y: maxY }]),
            stroke: ENGINEERING_STYLES.guides.majorStroke || ENGINEERING_STYLES.guides.stroke,
            strokeWidth: Number(ENGINEERING_STYLES.guides.majorWidth || ENGINEERING_STYLES.guides.strokeWidth || 1)
          }));
        }
        for (let y = startYMajor; y <= endYMajor + 1e-9; y += majorStepMm) {
          layerGuides.add(new Konva.Line({
            points: linePoints([{ x: minX, y }, { x: maxX, y }]),
            stroke: ENGINEERING_STYLES.guides.majorStroke || ENGINEERING_STYLES.guides.stroke,
            strokeWidth: Number(ENGINEERING_STYLES.guides.majorWidth || ENGINEERING_STYLES.guides.strokeWidth || 1)
          }));
        }
      }

      const renderEntities = getRenderablePatternEntities();
      state.renderEntities = renderEntities;
      // Recompute detail list only when we truly have renderable geometry.
      // This prevents accidental tree reset to "РќРµС‚ РґРµС‚Р°Р»РµР№" on transient renders.
      if (Array.isArray(renderEntities) && renderEntities.length > 0) {
        const candNames = state.patternGeometry && state.patternGeometry.meta && Array.isArray(state.patternGeometry.meta.patternNames)
          ? state.patternGeometry.meta.patternNames
          : [];
        const newDetails = computeDetailsFromEntities(renderEntities, candNames);
        const selectedStillExists = newDetails.some((d) => d.id === state.selectedDetailId);
        state.details = newDetails;
        if (!selectedStillExists) state.selectedDetailId = state.details.length ? state.details[0].id : null;
      } else if ((!Array.isArray(state.details) || state.details.length === 0) && Array.isArray(state.zones) && state.zones.length > 0) {
        // Restore detail groups from existing zones if geometry is temporarily unavailable.
        const byId = new Map();
        for (const z of state.zones) {
          const did = Number(z && z.detailId || 0);
          if (!did || byId.has(did)) continue;
          byId.set(did, { id: did, name: `Р”РµС‚Р°Р»СЊ ${did}`, bbox: null, area: 0, points: 0, entity: null });
        }
        state.details = Array.from(byId.values()).sort((a, b) => a.id - b.id);
        if (!state.details.some((d) => d.id === state.selectedDetailId)) {
          state.selectedDetailId = state.details.length ? state.details[0].id : null;
        }
      }
      renderDetailZoneTree();
      renderPropertyEditor();
      updateProjectUi();
      const selectedDetail = state.details.find((d) => d.id === state.selectedDetailId) || null;
      if (state.layers.pattern && renderEntities.length > 0) {
        for (const e of renderEntities) {
          const isSelected = !!(selectedDetail && e === selectedDetail.entity);
          if (isSelected && state.view.highlightSelectedDetail) continue;
          layerPattern.add(new Konva.Line({
            points: linePoints(e.points || []),
            stroke: ENGINEERING_STYLES.pattern.stroke,
            strokeWidth: ENGINEERING_STYLES.pattern.strokeWidth,
            closed: !!e.closed
          }));
        }
        if (selectedDetail && selectedDetail.entity && state.view.highlightSelectedDetail) {
          const e = selectedDetail.entity;
          layerPattern.add(new Konva.Line({
            points: linePoints(e.points || []),
            stroke: ENGINEERING_STYLES.pattern.selectedStroke || ENGINEERING_STYLES.selection.stroke,
            strokeWidth: ENGINEERING_STYLES.pattern.selectedStrokeWidth || ENGINEERING_STYLES.selection.strokeWidth,
            closed: !!e.closed
          }));
          if (e.smartCloseBridge && e.smartCloseBridge.from && e.smartCloseBridge.to) {
            const b1 = worldToScreen(e.smartCloseBridge.from);
            const b2 = worldToScreen(e.smartCloseBridge.to);
            layerPattern.add(new Konva.Line({
              points: [b1.x, b1.y, b2.x, b2.y],
              stroke: ENGINEERING_STYLES.smartCloseBridge.stroke,
              strokeWidth: ENGINEERING_STYLES.smartCloseBridge.strokeWidth,
              dash: ENGINEERING_STYLES.smartCloseBridge.dash
            }));
          }
        }
      }

      if (showLabelsEffective && state.details.length > 0) {
        for (const d of state.details) {
          if (!d.bbox) continue;
          const cx = d.bbox.minX + d.bbox.width / 2;
          const cy = d.bbox.minY + d.bbox.height / 2;
          const s = worldToScreen({ x: cx, y: cy });
          const lbl = new Konva.Text({
            x: s.x,
            y: s.y,
            text: d.name,
            fontSize: 12,
            fill: d.id === state.selectedDetailId ? "#0b63ce" : "#444",
            listening: false
          });
          lbl.offsetX(lbl.width() / 2);
          lbl.offsetY(lbl.height() / 2);
          layerPattern.add(lbl);
        }
      }

      const activeLayoutZoneId = Number(state.layoutRun && state.layoutRun.selectedZoneId || 0);
      const hasManualPlacements = isManualInventoryMode() && Array.isArray(state.layoutRun.placements) && state.layoutRun.placements.length > 0;
      const hasActiveLayoutOnZone = !!(state.layoutRun.active && activeLayoutZoneId > 0) || hasManualPlacements;
      let deferredManualSeamSegments = [];

      function drawSnapshotFragments(snapshot, options = {}) {
        const snap = snapshot && typeof snapshot === "object" ? snapshot : null;
        const lr = snap && snap.layoutRun && typeof snap.layoutRun === "object" ? snap.layoutRun : null;
        const fragments = Array.isArray(lr && lr.fragments) ? lr.fragments : [];
        if (!fragments.length) return;
        const stroke = String(options.stroke || (ENGINEERING_STYLES.fragments && ENGINEERING_STYLES.fragments.stroke) || "#0b63ce");
        const strokeWidth = Number.isFinite(Number(options.strokeWidth)) ? Number(options.strokeWidth) : 1;
        const fill = String(options.fill || "rgba(11,99,206,0.06)");
        for (const frag of fragments) {
          if (!Array.isArray(frag && frag.points) || frag.points.length < 3) continue;
          const _snapCr = Number(frag.cornerRadius || 0);
          let _snapPts = frag.points;
          if (_snapCr > 0) {
            const _sxs = _snapPts.map((q) => q.x), _sys = _snapPts.map((q) => q.y);
            _snapPts = buildRoundedRectPolygon(Math.min(..._sxs), Math.min(..._sys), Math.max(..._sxs), Math.max(..._sys), _snapCr);
          }
          layerFragments.add(new Konva.Line({
            points: linePoints(_snapPts),
            stroke,
            strokeWidth,
            fill,
            closed: true,
            listening: false
          }));
        }
      }

      const selectedLayoutIdNum = Number(state.selectedLayoutId || 0) || 0;
      const backgroundLayouts = (Array.isArray(state.layouts) ? state.layouts : [])
        .filter((entry) => {
          const isSelected = Number(entry && entry.id || 0) === selectedLayoutIdNum;
          return !isSelected || !hasActiveLayoutOnZone;
        })
        .map((entry) => ({ entry, snapshot: getLayoutSnapshotForReports(entry) }))
        .filter((item) => {
          if (!item || !item.snapshot || !item.snapshot.layoutRun) return false;
          const lr = item.snapshot.layoutRun;
          const hasFragments = Array.isArray(lr.fragments) && lr.fragments.length > 0;
          const hasPlacements = Array.isArray(lr.placements) && lr.placements.some((p) => Array.isArray(p && p.alignedContour) && p.alignedContour.length >= 3);
          return hasFragments || hasPlacements;
        });
      const _bgStroke = "rgba(11,99,206,0.55)";
      const _bgFill = "rgba(11,99,206,0.04)";
      for (const item of backgroundLayouts) {
        const isManualBg = String(item.entry && item.entry.mode || "") === "inventory_manual";
        if (state.layers.pieceBorders) drawSnapshotFragments(item.snapshot, { stroke: _bgStroke, strokeWidth: 1, fill: _bgFill });
        if (state.layers && state.layers.pfullZ && !isManualBg) {
          const lr = item.snapshot.layoutRun;
          if (Array.isArray(lr.placements)) {
            for (const p of lr.placements) {
              const pts = (Array.isArray(p && p.inZoneContour) && p.inZoneContour.length >= 3)
                ? p.inZoneContour
                : (Array.isArray(p && p.alignedContour) && p.alignedContour.length >= 3 ? p.alignedContour : null);
              if (!pts) continue;
              layerFragments.add(new Konva.Line({ points: linePoints(pts), stroke: _bgStroke, strokeWidth: 1, fill: "rgba(0,0,0,0)", closed: true, listening: false }));
            }
          }
        }
      }

      if (hasActiveLayoutOnZone) {
        let selectedFragObj = null;
        const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
        const manualBeforeApply = isManualInventoryMode() && String(state.layoutRun && state.layoutRun.status || "") !== "applied";
        const selectedPlacementIndex = Number(manual && manual.selectedPlacementIndex);
        const isDraggingManualPlacement = !!(state.drag && state.drag.isDown && state.drag.mode === "manual-placement-move");
        const dragScrapPieceId = isDraggingManualPlacement ? String(state.drag.manualDragScrapPieceId || "") : "";
        const dragDx = isDraggingManualPlacement ? Number(state.drag.manualDragDx || 0) : 0;
        const dragDy = isDraggingManualPlacement ? Number(state.drag.manualDragDy || 0) : 0;
        const fragmentsList = manualBeforeApply ? [] : (Array.isArray(state.layoutRun.fragments) ? state.layoutRun.fragments : []);
        const matchedPlacements = Array.isArray(state.layoutRun.placements)
          ? state.layoutRun.placements
            .map((p, idx) => (p ? { ...p, __placementIndex: idx } : null))
            .filter((p) => {
              if (!p) return false;
              const status = String(p.status || "");
              if (status === "matched") return true;
              const hasGeom =
                (Array.isArray(p.inZoneContour) && p.inZoneContour.length >= 3) ||
                (Array.isArray(p.inZoneContours) && p.inZoneContours.length > 0) ||
                (Array.isArray(p.alignedCoreContour) && p.alignedCoreContour.length >= 3) ||
                (Array.isArray(p.alignedCoreContours) && p.alignedCoreContours.length > 0) ||
                (Array.isArray(p.inZoneCoreContour) && p.inZoneCoreContour.length >= 3) ||
                (Array.isArray(p.inZoneCoreContours) && p.inZoneCoreContours.length > 0) ||
                (Array.isArray(p.alignedContour) && p.alignedContour.length >= 3);
              return hasGeom;
            })
          : [];
        const showAssignedPieces = state.layers.assignedPieces !== false;
        function fragmentOwnedByPlacement(frag, pl) {
          if (!frag || !pl) return false;
          const ownerIdx = Number(frag.ownerPlacementIndex);
          const ownerId = Number(frag.ownerPlacementId);
          const plIdx = Number(pl && pl.__placementIndex);
          const plFragId = Number(pl && pl.fragmentId);
          if (Number.isFinite(ownerIdx) && Number.isFinite(plIdx) && ownerIdx === plIdx) return true;
          if (Number.isFinite(ownerId) && Number.isFinite(plFragId) && ownerId === plFragId) return true;
          return false;
        }
        function normalizeContourArray(raw) {
          const pts = (Array.isArray(raw) ? raw : [])
            .map((q) => ({ x: Number(q && q.x), y: Number(q && q.y) }))
            .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
          return pts.length >= 3 ? pts : null;
        }
        function toContours(rawSingle, rawMulti) {
          const out = [];
          const single = normalizeContourArray(rawSingle);
          if (single) out.push(single);
          if (Array.isArray(rawMulti)) {
            for (const poly of rawMulti) {
              const pts = normalizeContourArray(poly);
              if (pts) out.push(pts);
            }
          }
          return out;
        }
        const manualWholePieceMode = isManualInventoryMode();
        for (const pl of matchedPlacements) {
          const placementIndex = Number(pl && pl.__placementIndex);
          let contours = manualWholePieceMode
            ? toContours(pl.alignedContour, null)
            : toContours(pl.inZoneContour, pl.inZoneContours);
          let coreContours = manualWholePieceMode
            ? toContours(pl.alignedCoreContour, pl.alignedCoreContours)
            : toContours(pl.inZoneCoreContour, pl.inZoneCoreContours);
          if (!coreContours.length) {
            coreContours = manualWholePieceMode
              ? toContours(pl.inZoneCoreContour, pl.inZoneCoreContours)
              : toContours(pl.alignedCoreContour, pl.alignedCoreContours);
          }
          let usedVisibleContours = toContours(pl.usedVisibleContour, pl.usedVisibleContours);
          if (!contours.length && Array.isArray(pl.alignedContour) && pl.alignedContour.length >= 3) {
            const aligned = normalizeContourArray(pl.alignedContour);
            if (aligned) contours.push(aligned);
          }
          // Fallback for assign-only runs where piece contour is not materialized:
          // synthesize an irregular contour from source scrap + placement transform.
          if (!contours.length) {
            const scrap = parseScrapContourPoints(pl && pl.scrapContour);
            const fragId = Number(pl && pl.fragmentId || 0);
            const frag = fragmentsList.find((f) => Number(f && f.id || 0) === fragId) || null;
            if (scrap.length >= 3 && frag && Array.isArray(frag.points) && frag.points.length >= 3) {
              const src = normalizeContourArray(scrap);
              if (src) {
                let syn = src;
                const srcCenter = centroid(syn);
                const rotDeg = Number(pl && pl.alignRotationDeg);
                if (Number.isFinite(rotDeg) && Math.abs(rotDeg) > 1e-6) {
                  syn = rotatePoints(syn, (rotDeg * Math.PI) / 180, srcCenter);
                }
                const fragCenter = centroid(frag.points);
                const synCenter = centroid(syn);
                syn = translatePoints(syn, fragCenter.x - synCenter.x, fragCenter.y - synCenter.y);
                if (syn.length >= 3) contours = [syn];
              }
            }
          }
          if (!contours.length && !coreContours.length) continue;
          const isSelPlacement = isManualInventoryMode() && Number.isFinite(selectedPlacementIndex) && placementIndex === selectedPlacementIndex;
          if (showAssignedPieces && state.layers.pfullZ && contours.length) {
            const ic = ENGINEERING_STYLES.inventoryContours || {};
            const pieceStroke = isSelPlacement ? (ic.selectedStroke || "#914734") : (ic.stroke || "rgba(189,87,39,0.85)");
            const pieceStrokeWidth = isSelPlacement ? (ic.selectedStrokeWidth || 1.4) : (ic.strokeWidth || 1.0);
            for (const contour of contours) {
              layerPreview.add(new Konva.Line({
                points: linePoints(contour),
                stroke: pieceStroke,
                strokeWidth: pieceStrokeWidth,
                // In manual mode contours = alignedContour (full piece, extends outside zone, heavily overlapping).
                // Use very low opacity to stay visible without accumulating dark when many pieces overlap.
                fill: manualWholePieceMode
                  ? (isSelPlacement ? "rgba(189,87,39,0.15)" : "rgba(189,87,39,0.03)")
                  : (isSelPlacement ? (ic.selectedFill || "rgba(189,87,39,0.12)") : (ic.fill || "rgba(189,87,39,0.06)")),
                closed: true
              }));
            }
          }
          const isDirectInv = isInventoryLikeLayoutMode(state.layoutMode) && !isManualInventoryMode();
          if (showAssignedPieces && state.layers.usedGain && usedVisibleContours.length && !isDirectInv) {
            const _up = ENGINEERING_STYLES.usedPart || {};
            for (const usedVisibleContour of usedVisibleContours) {
              layerPreview.add(new Konva.Line({
                points: linePoints(usedVisibleContour),
                stroke: _up.stroke || "#914734",
                strokeWidth: isSelPlacement ? (_up.selectedStrokeWidth || 1.6) : (_up.strokeWidth || 1.25),
                fill: _up.fill || "rgba(145,71,52,0.10)",
                closed: true
              }));
            }
          }
          if (showAssignedPieces && state.layers.pcoreZ && coreContours.length) {
            const _al = ENGINEERING_STYLES.allowances || {};
            for (const coreContour of coreContours) {
              layerPreview.add(new Konva.Line({
                points: linePoints(coreContour),
                stroke: _al.stroke || "rgba(189,87,39,0.9)",
                strokeWidth: _al.strokeWidth || 1.2,
                fill: "rgba(0,0,0,0)",
                dash: Array.isArray(_al.dash) ? _al.dash : [6, 3],
                closed: true
              }));
            }
          }
          if (isSelPlacement) {
            const napCenterContour =
              (Array.isArray(pl && pl.inZoneContour) && pl.inZoneContour.length >= 3
                ? pl.inZoneContour
                : (Array.isArray(pl && pl.alignedContour) && pl.alignedContour.length >= 3 ? pl.alignedContour : null));
            if (Array.isArray(napCenterContour) && napCenterContour.length >= 3) {
              const napCenter = centroid(napCenterContour);
              const zoneForNap = getManualZone(napCenterContour);
              const zoneNap = zoneForNap ? getZoneNapDirectionDeg(zoneForNap) : DEFAULT_NAP_DIRECTION_DEG;
              const baseNap = Number.isFinite(Number(pl && pl.napDirectionDeg))
                ? Number(pl.napDirectionDeg)
                : Number(zoneNap);
              const alignRotDeg = Number.isFinite(Number(pl && pl.alignRotationDeg))
                ? Number(pl.alignRotationDeg)
                : 0;
              const effNap = Number.isFinite(Number(pl && pl.napEffectiveDeg))
                ? Number(pl.napEffectiveDeg)
                : (baseNap + alignRotDeg);
              drawNapArrow(layerSelection, napCenter, effNap, 26);
            }
          }
        }
        if (showAssignedPieces && state.layers.splitLeftovers && String(state.layoutMode || "") === "inventory_split_return") {
          const splitEvents = Array.isArray(state.layoutRun && state.layoutRun.splitEvents) ? state.layoutRun.splitEvents : [];
          for (const ev of splitEvents) {
            const leftovers = [];
            if (Array.isArray(ev && ev.leftoverWorldContours)) {
              for (const poly of ev.leftoverWorldContours) {
                if (!Array.isArray(poly)) continue;
                const pts = poly
                  .map((q) => ({ x: Number(q && q.x), y: Number(q && q.y) }))
                  .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
                if (pts.length >= 3) leftovers.push(pts);
              }
            } else if (Array.isArray(ev && ev.leftoverWorldContour)) {
              const pts = ev.leftoverWorldContour
                .map((q) => ({ x: Number(q && q.x), y: Number(q && q.y) }))
                .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
              if (pts.length >= 3) leftovers.push(pts);
            }
            for (const pts of leftovers) {
              layerPreview.add(new Konva.Line({
                points: linePoints(pts),
                stroke: ENGINEERING_STYLES.splitLeftovers.stroke,
                strokeWidth: ENGINEERING_STYLES.splitLeftovers.strokeWidth,
                dash: ENGINEERING_STYLES.splitLeftovers.dash,
                fill: ENGINEERING_STYLES.splitLeftovers.fill,
                closed: true
              }));
            }
          }
        }
        if (state.layers.visibleCore) {
          const seamSegments = state.layoutRun && state.layoutRun.previewLayers && Array.isArray(state.layoutRun.previewLayers.seams)
            ? state.layoutRun.previewLayers.seams
            : [];
          deferredManualSeamSegments = seamSegments;
        }
        if (isManualInventoryMode()) {
          const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
          const ap = manual && manual.activePiece ? manual.activePiece : null;
          if (ap && Array.isArray(ap.points) && ap.points.length >= 3) {
            layerPreview.add(new Konva.Line({
              points: linePoints(ap.points),
              stroke: ENGINEERING_STYLES.manualActivePiece.stroke,
              strokeWidth: ENGINEERING_STYLES.manualActivePiece.strokeWidth,
              dash: ENGINEERING_STYLES.manualActivePiece.dash,
              fill: ENGINEERING_STYLES.manualActivePiece.fill,
              closed: true
            }));
            const mm = manual && manual.lastMetrics ? manual.lastMetrics : null;
            const isTiny = String(mm && mm.status || "") === "tiny_fragment";
            if (manual && manual.lastEvalContours && Array.isArray(manual.lastEvalContours.gainVisible)) {
              const gain = multiLargestOuterPoints(manual.lastEvalContours.gainVisible);
              if (gain.length >= 3) {
                layerPreview.add(new Konva.Line({
                  points: linePoints(gain),
                  stroke: isTiny ? ENGINEERING_STYLES.manualGainTiny.stroke : ENGINEERING_STYLES.manualGainOk.stroke,
                  strokeWidth: isTiny ? ENGINEERING_STYLES.manualGainTiny.strokeWidth : ENGINEERING_STYLES.manualGainOk.strokeWidth,
                  fill: isTiny ? ENGINEERING_STYLES.manualGainTiny.fill : ENGINEERING_STYLES.manualGainOk.fill,
                  closed: true
                }));
              }
            }
            if (state.layers.pcoreZ && manual && manual.lastEvalContours) {
              const coreMp = Array.isArray(manual.lastEvalContours.coreWorld) ? manual.lastEvalContours.coreWorld : [];
              const core = multiLargestOuterPoints(coreMp);
              if (core.length >= 3) {
                layerPreview.add(new Konva.Line({
                  points: linePoints(core),
                  stroke: ENGINEERING_STYLES.allowances.stroke,
                  strokeWidth: ENGINEERING_STYLES.allowances.strokeWidth,
                  fill: ENGINEERING_STYLES.allowances.fill,
                  closed: true
                }));
              }
            }
            const cc = centroid(ap.points);
            const zoneForNap = getManualZone(ap.points);
            const zoneNap = zoneForNap ? getZoneNapDirectionDeg(zoneForNap) : DEFAULT_NAP_DIRECTION_DEG;
            const activeNap = Number.isFinite(Number(ap && ap.napDirectionDeg))
              ? Number(ap.napDirectionDeg)
              : (Number.isFinite(Number(ap && ap.candidate && ap.candidate.napDirectionDeg))
                  ? Number(ap.candidate.napDirectionDeg)
                  : Number(zoneNap));
            drawNapArrow(layerSelection, cc, activeNap, 24);
            const cs = worldToScreen(cc);
            layerPreview.add(new Konva.Text({
              x: cs.x + 6,
              y: cs.y + 6,
              text: String(ap.inventoryTag || "СЂСѓС‡РЅРѕР№ РєСѓСЃРѕРє"),
              fontSize: 12,
              fill: "#0b63ce",
              listening: false
            }));
          }
        }
        const selectedFragmentIdNum = state.selectedFragmentId !== null ? Number(state.selectedFragmentId) : null;
        if (selectedFragmentIdNum !== null && Number.isFinite(selectedFragmentIdNum)) {
          selectedFragObj = fragmentsList.find((f) => Number(f && f.id || 0) === selectedFragmentIdNum) || null;
        }
        const isIntarsiaSvgMode = state.layoutMode === "intarsia" && state.layoutRun.fillType === "import_svg";
        if (state.layers.pieceBorders) {
          const _hasMaterialZones = state.layers.zoneMaterials && state.zones.some((z) => z && z.materialId);
          for (const frag of fragmentsList) {
            if (!Array.isArray(frag.points) || frag.points.length < 3) continue;
            const fragId = Number(frag.id || 0);
            const isSelectedFrag = selectedFragmentIdNum !== null && fragId === selectedFragmentIdNum;
            const _fst = ENGINEERING_STYLES.fragments || {};
            const fragIsDragged = isDraggingManualPlacement && dragScrapPieceId !== "" && String(frag.scrapPieceId || "") === dragScrapPieceId;
            const fragPoints = fragIsDragged
              ? frag.points.map((q) => ({ x: q.x + dragDx, y: q.y + dragDy }))
              : frag.points;
            const fragCornerRadius = Number(frag.cornerRadius || 0);
            let renderPoints = fragPoints;
            if (fragCornerRadius > 0) {
              const _xs = fragPoints.map((q) => q.x), _ys = fragPoints.map((q) => q.y);
              renderPoints = buildRoundedRectPolygon(Math.min(..._xs), Math.min(..._ys), Math.max(..._xs), Math.max(..._ys), fragCornerRadius);
            }
            const fragStroke = isSelectedFrag
              ? "#0050C8"
              : (_hasMaterialZones ? "rgba(0,60,180,0.80)" : (_fst.stroke || "#0076D6"));
            const shape = new Konva.Line({
              points: linePoints(renderPoints),
              stroke: fragStroke,
              strokeWidth: isSelectedFrag ? 2.5 : (_hasMaterialZones ? 1.4 : (_fst.strokeWidth || 1.25)),
              fill: isSelectedFrag
                ? "rgba(0,100,220,0.22)"
                : (_hasMaterialZones ? "rgba(0,0,0,0)" : (_fst.fill || "rgba(0,118,214,0.08)")),
              closed: true,
              listening: false,
              name: `frag-${fragId}`
            });
            layerFragments.add(shape);
            // Cut boundary (outer cut line with seam allowance) вЂ” only for manual/inventory modes.
            // In regular layout the shared seam segments are computed separately and drawn below.
            if (state.layers.visibleCore && isManualInventoryMode() && Array.isArray(frag.cutPoints) && frag.cutPoints.length >= 3) {
              const cutPoints = fragIsDragged
                ? frag.cutPoints.map((q) => ({ x: q.x + dragDx, y: q.y + dragDy }))
                : frag.cutPoints;
              layerFragments.add(new Konva.Line({
                points: linePoints(cutPoints),
                stroke: ENGINEERING_STYLES.seams.stroke,
                strokeWidth: ENGINEERING_STYLES.seams.strokeWidth,
                dash: ENGINEERING_STYLES.seams.dash,
                fill: "rgba(0,0,0,0)",
                closed: true,
                listening: false
              }));
            }
          }
        }
        // Scale/rotate handles for selected intarsia SVG fragment
        if (!isIntarsiaSvgMode || !selectedFragObj) state.intarsiaHandles = null;
        if (isIntarsiaSvgMode && selectedFragObj && Array.isArray(selectedFragObj.points) && selectedFragObj.points.length >= 3) {
          const pts = selectedFragObj.points;
          const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
          const bMinX = Math.min(...xs), bMaxX = Math.max(...xs);
          const bMinY = Math.min(...ys), bMaxY = Math.max(...ys);
          const bCx = (bMinX + bMaxX) / 2, bCy = (bMinY + bMaxY) / 2;
          const bboxPts = [{x:bMinX,y:bMinY},{x:bMaxX,y:bMinY},{x:bMaxX,y:bMaxY},{x:bMinX,y:bMaxY}];
          layerSelection.add(new Konva.Line({ points: linePoints(bboxPts), stroke: "#0076D6", strokeWidth: 1, dash: [4,3], fill: "rgba(0,0,0,0)", closed: true, listening: false }));
          const handleR = 6;
          // Y-axis is flipped: bMinY=bottom on screen, bMaxY=top on screen
          // cursors must match visual screen corners
          const corners = [
            {x: bMinX, y: bMinY, cursor: "nesw-resize"}, // screen bottom-left = SW
            {x: bMaxX, y: bMinY, cursor: "nwse-resize"}, // screen bottom-right = SE
            {x: bMaxX, y: bMaxY, cursor: "nesw-resize"}, // screen top-right = NE
            {x: bMinX, y: bMaxY, cursor: "nwse-resize"}  // screen top-left = NW
          ];
          corners.forEach((corner) => {
            const sc = worldToScreen(corner);
            layerSelection.add(new Konva.Circle({ x: sc.x, y: sc.y, radius: handleR, fill: "#fff", stroke: "#0076D6", strokeWidth: 1.5, listening: false }));
          });

          // Rotation handle вЂ” circle above top-center, connected by a line
          const rotHandleWorld = { x: bCx, y: bMaxY + (bMaxY - bMinY) * 0.25 + 8 };
          const rotHandleScreen = worldToScreen(rotHandleWorld);
          const topCenterScreen = worldToScreen({ x: bCx, y: bMaxY });
          layerSelection.add(new Konva.Line({ points: [topCenterScreen.x, topCenterScreen.y, rotHandleScreen.x, rotHandleScreen.y], stroke: "#0076D6", strokeWidth: 1, listening: false }));
          layerSelection.add(new Konva.Circle({ x: rotHandleScreen.x, y: rotHandleScreen.y, radius: 6, fill: "#fff", stroke: "#0076D6", strokeWidth: 1.5, listening: false }));

          // Store handle positions for stage-interactions hit-testing
          state.intarsiaHandles = {
            fragObj: selectedFragObj,
            bCx, bCy, bMinX, bMaxX, bMinY, bMaxY,
            corners,
            rotHandleWorld
          };
        }
        if (selectedFragObj && Array.isArray(state.layoutRun.placements) && state.layers.selection) {
          const pl = findPlacementForFragment(selectedFragObj);
          const fc = centroid(selectedFragObj.points || []);
          let overlay = Array.isArray(pl && pl.alignedContour) && (pl.alignedContour || []).length >= 3
            ? (pl.alignedContour || []).map((p) => ({ x: Number(p && p.x), y: Number(p && p.y) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
            : parseScrapContourPoints(pl && pl.scrapContour);
          let rotateDeltaRad = 0;
          if (overlay.length >= 3 && !(Array.isArray(pl && pl.alignedContour) && (pl.alignedContour || []).length >= 3)) {
            const sc = centroid(overlay);
            const scrapAngle = dominantAxisAngle(overlay);
            const fragAngle = dominantAxisAngle(selectedFragObj.points || []);
            // Align major axis of scrap contour with fragment axis.
            rotateDeltaRad = fragAngle - scrapAngle;
            overlay = rotatePoints(overlay, rotateDeltaRad, sc);
            const rc = centroid(overlay);
            overlay = translatePoints(overlay, fc.x - rc.x, fc.y - rc.y);
          }
          if (overlay.length >= 3) {
            const _fo = ENGINEERING_STYLES.fragmentOverlay || {};
            layerFragments.add(new Konva.Line({
              points: linePoints(overlay),
              stroke: _fo.stroke || "#6a6a6a",
              strokeWidth: _fo.strokeWidth || 2,
              dash: _fo.dash || [5, 4],
              fill: _fo.fill || "rgba(120,120,120,0.15)",
              closed: true
            }));
          }
          if (pl) {
            const baseNap = Number.isFinite(Number(pl.napDirectionDeg))
              ? Number(pl.napDirectionDeg)
              : Number(state.layoutRun.lastNapDirectionDeg || DEFAULT_NAP_DIRECTION_DEG);
            const alignRotDeg = Number.isFinite(Number(pl.alignRotationDeg))
              ? Number(pl.alignRotationDeg)
              : 0;
            const effNap = Number.isFinite(Number(pl.napEffectiveDeg))
              ? Number(pl.napEffectiveDeg)
              : (baseNap + alignRotDeg);
            drawNapArrow(layerFragments, fc, effNap, 18);
          }

          // Show measurements for selected fragment (edge lengths), similar to desktop prototype.
          const fp = Array.isArray(selectedFragObj.points) ? selectedFragObj.points : [];
          if (fp.length >= 3) {
            for (let i = 0; i < fp.length; i++) {
              const a = fp[i];
              const b = fp[(i + 1) % fp.length];
              const mx = (a.x + b.x) * 0.5;
              const my = (a.y + b.y) * 0.5;
              const segLen = Math.hypot(b.x - a.x, b.y - a.y);
              const sm = worldToScreen({ x: mx, y: my });
              layerSelection.add(new Konva.Text({
                x: sm.x + 4,
                y: sm.y - 10,
                text: `${Math.round(segLen)}`,
                fontSize: 11,
                fill: "#444",
                listening: false
              }));
            }
          }
        }
      }

      // Render intarsia pen draft contour
      if (Array.isArray(state.draftIntarsiaContour) && state.draftIntarsiaContour.length > 0) {
        const dpts = state.draftIntarsiaContour;
        const screenPts = dpts.flatMap((p) => { const s = worldToScreen(p); return [s.x, s.y]; });
        if (screenPts.length >= 4) {
          layerFragments.add(new Konva.Line({
            points: screenPts,
            stroke: "#e65000",
            strokeWidth: 1.5,
            dash: [6, 4],
            closed: false,
            listening: false
          }));
        }
        // Dot markers for placed points
        for (const p of dpts) {
          const s = worldToScreen(p);
          layerFragments.add(new Konva.Circle({ x: s.x, y: s.y, radius: 4, fill: "#e65000", listening: false }));
        }
        // Closing line hint (first to last point)
        if (dpts.length >= 3) {
          const s0 = worldToScreen(dpts[0]);
          const sN = worldToScreen(dpts[dpts.length - 1]);
          layerFragments.add(new Konva.Line({
            points: [sN.x, sN.y, s0.x, s0.y],
            stroke: "#e65000",
            strokeWidth: 1,
            dash: [3, 5],
            closed: false,
            listening: false,
            opacity: 0.5
          }));
        }
      }

      if (state.layers.visibleArea && hasActiveLayoutOnZone) {
        const visiblePolys = state.layoutRun.previewLayers && Array.isArray(state.layoutRun.previewLayers.visibleArea)
          ? state.layoutRun.previewLayers.visibleArea
          : [];
        for (const poly of visiblePolys) {
          const pts = Array.isArray(poly && poly.points) ? poly.points : [];
          if (pts.length < 3) continue;
          layerVisibleArea.add(new Konva.Line({
            points: linePoints(pts),
            stroke: ENGINEERING_STYLES.visibleArea.stroke,
            strokeWidth: ENGINEERING_STYLES.visibleArea.strokeWidth,
            fill: ENGINEERING_STYLES.visibleArea.fill,
            closed: true
          }));
        }
      }

      if (state.layers.coverageHoles && hasActiveLayoutOnZone) {
        const holePolys = state.layoutRun.previewLayers && Array.isArray(state.layoutRun.previewLayers.coverageHoles)
          ? state.layoutRun.previewLayers.coverageHoles
          : [];
        for (const poly of holePolys) {
          const pts = Array.isArray(poly && poly.points) ? poly.points : (Array.isArray(poly) ? poly : []);
          if (pts.length < 3) continue;
          layerVisibleArea.add(new Konva.Line({
            points: linePoints(pts),
            stroke: ENGINEERING_STYLES.coverageHoles.stroke,
            strokeWidth: ENGINEERING_STYLES.coverageHoles.strokeWidth,
            fill: ENGINEERING_STYLES.coverageHoles.fill,
            closed: true
          }));
        }
      }

      if (state.layers.pieceIntersections && hasActiveLayoutOnZone) {
        const interPolys = state.layoutRun.previewLayers && Array.isArray(state.layoutRun.previewLayers.pieceIntersections)
          ? state.layoutRun.previewLayers.pieceIntersections
          : [];
        for (const poly of interPolys) {
          const pts = Array.isArray(poly && poly.points) ? poly.points : [];
          if (pts.length < 3) continue;
          layerPreview.add(new Konva.Line({
            points: linePoints(pts),
            stroke: ENGINEERING_STYLES.intersections.stroke,
            strokeWidth: ENGINEERING_STYLES.intersections.strokeWidth,
            fill: ENGINEERING_STYLES.intersections.fill,
            closed: true
          }));
        }
      }

      if (state.layers.zones) {
        if (state.layers.zoneMaterials && (!Array.isArray(state.furMaterialsCatalog) || state.furMaterialsCatalog.length === 0) && state.zones.some((z) => z && z.materialId)) {
          loadFurMaterialsCatalog().then(() => { renderScene(); renderPropertyEditor(); }).catch(() => {});
        }
        for (const z of state.zones) {
          const zoneMaterial = state.layers.zoneMaterials ? getFurMaterialById(z && z.materialId) : null;
          if (zoneMaterial) {
            addZoneMaterialOverlay(layerZones, z, getZoneMaterialVisual(zoneMaterial));
          }
          const selected = Number(z && z.id) === Number(state.selectedZoneId);
          const editingZone = selected && ["edit-vertex", "add-vertex", "smooth-vertex", "curve-vertex", "split-zone"].includes(String(state.tool || ""));
          const zoneStroke = editingZone
            ? (ENGINEERING_STYLES.zones.activeEditStroke || ENGINEERING_STYLES.zones.selectedStroke || ENGINEERING_STYLES.zones.stroke)
            : selected
              ? (ENGINEERING_STYLES.zones.selectedStroke || ENGINEERING_STYLES.zones.stroke)
              : ENGINEERING_STYLES.zones.stroke;
          const zoneFill = editingZone
            ? (zoneMaterial ? "rgba(250,235,200,0.82)" : (ENGINEERING_STYLES.zones.activeEditFill || ENGINEERING_STYLES.zones.selectedFill || ENGINEERING_STYLES.zones.fill || "rgba(0,0,0,0)"))
            : selected
              ? (zoneMaterial ? "rgba(250,238,210,0.78)" : (ENGINEERING_STYLES.zones.selectedFill || ENGINEERING_STYLES.zones.fill || "rgba(0,0,0,0)"))
              : zoneMaterial
                ? "rgba(250,244,235,0.72)"
                : (ENGINEERING_STYLES.zones.fill || "rgba(0,0,0,0)");
          const zoneStrokeWidth = editingZone
            ? Number(ENGINEERING_STYLES.zones.activeEditStrokeWidth || ENGINEERING_STYLES.zones.selectedStrokeWidth || ENGINEERING_STYLES.zones.strokeWidth || 1.2)
            : selected
              ? Number(ENGINEERING_STYLES.zones.selectedStrokeWidth || ENGINEERING_STYLES.zones.strokeWidth || 1.2)
              : Number(ENGINEERING_STYLES.zones.strokeWidth || 1.2);
          layerZones.add(new Konva.Line({
            points: linePoints(z.points),
            stroke: zoneStroke,
            fill: zoneFill,
            strokeWidth: zoneStrokeWidth,
            closed: true
          }));
          if (Array.isArray(z.points) && z.points.length >= 3) {
            const c = centroid(z.points);
            drawNapArrow(layerZones, c, getZoneNapDirectionDeg(z), selected ? 34 : 24);
          }
        }
      }

      const radialCenterHandle = getRenderableRadialCenterHandle();
      if (radialCenterHandle && radialCenterHandle.point) {
        const s = worldToScreen(radialCenterHandle.point);
        const marker = new Konva.Group({
          x: s.x,
          y: s.y,
          draggable: !!radialCenterHandle.editable,
          name: "radial-center-handle"
        });
        marker.add(new Konva.Circle({
          x: 0,
          y: 0,
          radius: 10,
          fill: "rgba(11,99,206,0.05)",
          stroke: "rgba(0,0,0,0)"
        }));
        marker.add(new Konva.Line({
          points: [-8, 0, 8, 0],
          stroke: "#0b63ce",
          strokeWidth: 1.25,
          listening: false
        }));
        marker.add(new Konva.Line({
          points: [0, -8, 0, 8],
          stroke: "#0b63ce",
          strokeWidth: 1.25,
          listening: false
        }));
        marker.add(new Konva.Circle({
          x: 0,
          y: 0,
          radius: 4,
          fill: "#ffffff",
          stroke: "#0b63ce",
          strokeWidth: 1.25,
          listening: false
        }));
        marker.on("mouseenter", () => setWorkspaceCursor(radialCenterHandle.editable ? "grab" : ""));
        marker.on("mouseleave", () => {
          if (!state.drag.isDown) setWorkspaceCursor("");
        });
        marker.on("dragstart", () => setWorkspaceCursor("grabbing"));
        marker.on("dragmove", () => {
          const world = screenToWorld(marker.x(), marker.y());
          syncRadialCenterFieldValues(world.x, world.y);
          const info = byId("workspaceInfo");
          if (info) info.textContent = `Р Р°РґРёР°Р»СЊРЅР°СЏ: С†РµРЅС‚СЂ (${Math.round(world.x * 10) / 10}; ${Math.round(world.y * 10) / 10}) РјРј`;
        });
        marker.on("dragend", () => {
          const world = screenToWorld(marker.x(), marker.y());
          syncRadialCenterFieldValues(world.x, world.y);
          setWorkspaceCursor("grab");
          scheduleRadialCenterPreview();
        });
        layerSelection.add(marker);
      }

      let renderedManualSeams = 0;
      if (state.layers.visibleCore && Array.isArray(deferredManualSeamSegments) && deferredManualSeamSegments.length) {
        for (const seam of deferredManualSeamSegments) {
          const pts = Array.isArray(seam && seam.points) ? seam.points : [];
          if (pts.length < 2) continue;
          layerSelection.add(new Konva.Line({
            points: linePoints(pts),
            stroke: ENGINEERING_STYLES.seams.stroke,
            strokeWidth: Math.max(2, Number(ENGINEERING_STYLES.seams.strokeWidth || 1.5)),
            dash: ENGINEERING_STYLES.seams.dash,
            lineCap: "round",
            lineJoin: "round",
            fill: "rgba(0,0,0,0)",
            closed: false,
            listening: false
          }));
          renderedManualSeams += 1;
        }
      }
      if (isManualInventoryMode()) {
        const manualDbg = state.layoutRun && state.layoutRun.manual && state.layoutRun.manual.lastSeamDebug
          ? state.layoutRun.manual.lastSeamDebug
          : null;
        if (manualDbg) {
          manualDbg.layerEnabled = !!(state.layers && state.layers.visibleCore);
          manualDbg.renderedSeams = renderedManualSeams;
        }
      }

      if (state.draftZone.length > 0) {
        layerZones.add(new Konva.Line({ points: linePoints(state.draftZone), stroke: ENGINEERING_STYLES.zones.stroke, strokeWidth: ENGINEERING_STYLES.zones.strokeWidth, closed: false }));
      }
      if (Array.isArray(state.draftSplitLine) && state.draftSplitLine.length > 0) {
        if (state.draftSplitLine.length >= 2) {
          layerZones.add(new Konva.Line({
            points: linePoints(state.draftSplitLine),
            stroke: "#444",
            strokeWidth: 1,
            dash: [4, 4],
            closed: false
          }));
        }
        state.draftSplitLine.forEach((pt, idx) => {
          if (!pt || !Number.isFinite(Number(pt.x)) || !Number.isFinite(Number(pt.y))) return;
          const s = worldToScreen(pt);
          layerSelection.add(new Konva.Rect({
            x: Number(s.x) - (idx === 0 ? 8 : 7),
            y: Number(s.y) - (idx === 0 ? 8 : 7),
            width: idx === 0 ? 16 : 14,
            height: idx === 0 ? 16 : 14,
            cornerRadius: 2,
            fill: "rgba(255,255,255,0.94)",
            stroke: "#0b63ce",
            strokeWidth: 1.5,
            listening: false
          }));
          layerSelection.add(new Konva.Rect({
            x: Number(s.x) - (idx === 0 ? 3.5 : 3),
            y: Number(s.y) - (idx === 0 ? 3.5 : 3),
            width: idx === 0 ? 7 : 6,
            height: idx === 0 ? 7 : 6,
            cornerRadius: 1,
            fill: idx === 0 ? "#0b63ce" : "#ffd24a",
            stroke: idx === 0 ? "#084d9e" : "#7a5600",
            strokeWidth: 1,
            listening: false
          }));
        });
      }

      if (state.layers.selection) {
        const z = state.zones.find((x) => x.id === state.selectedZoneId);
        if (z && (state.tool === "edit-vertex" || state.tool === "add-vertex" || state.tool === "smooth-vertex" || state.tool === "curve-vertex")) {
          const hover = state.hover && typeof state.hover === "object" ? state.hover : null;
          const hoveredVertexIndex = hover && Number(hover.zoneId || 0) === Number(z.id || 0) ? Number(hover.vertexIndex) : null;
          const hoveredEdgePoint = hover && Number(hover.zoneId || 0) === Number(z.id || 0) && hover.edgePoint ? hover.edgePoint : null;
          for (let vertexIndex = 0; vertexIndex < z.points.length; vertexIndex++) {
            const p = z.points[vertexIndex];
            const s = worldToScreen(p);
            const boundaryVertex = isZoneVertexOnDetailBoundary(z, vertexIndex);
            const activeVertex = Number(vertexIndex) === Number(state.selectedVertexIndex);
            const hoveredVertex = Number(vertexIndex) === Number(hoveredVertexIndex);
            if (activeVertex) {
              layerSelection.add(new Konva.Circle({
                x: s.x,
                y: s.y,
                radius: 10,
                fill: "rgba(255,210,74,0.18)",
                stroke: "rgba(0,0,0,0)",
                listening: false
              }));
            }
            layerSelection.add(new Konva.Circle({
              x: s.x,
              y: s.y,
              radius: activeVertex ? 7.5 : (hoveredVertex ? 6.5 : (boundaryVertex ? 5.5 : 4)),
              fill: activeVertex ? "#ffd24a" : (hoveredVertex ? "#ffe79a" : (boundaryVertex ? "#ffffff" : ENGINEERING_STYLES.selection.pointFill)),
              stroke: activeVertex ? "#7a5600" : (hoveredVertex ? "#8a6a12" : (boundaryVertex ? "#0b63ce" : "rgba(0,0,0,0)")),
              strokeWidth: activeVertex ? 1.6 : (hoveredVertex ? 1.4 : (boundaryVertex ? 1.4 : 0))
            }));
            if (!activeVertex) {
              layerSelection.add(new Konva.Circle({
                x: s.x,
                y: s.y,
                radius: hoveredVertex ? 1.7 : 1.4,
                fill: hoveredVertex ? "#6f540b" : (boundaryVertex ? "#0b63ce" : "#ffffff"),
                stroke: "rgba(0,0,0,0)",
                listening: false
              }));
            } else {
              layerSelection.add(new Konva.Circle({
                x: s.x,
                y: s.y,
                radius: 2,
                fill: "#5c3c00",
                stroke: "rgba(0,0,0,0)",
                listening: false
              }));
            }
          }
          if (state.tool === "add-vertex" && hoveredEdgePoint) {
            const hs = worldToScreen(hoveredEdgePoint);
            layerSelection.add(new Konva.Circle({
              x: hs.x,
              y: hs.y,
              radius: 8,
              fill: "rgba(11,99,206,0.10)",
              stroke: "rgba(0,0,0,0)",
              listening: false
            }));
            layerSelection.add(new Konva.Circle({
              x: hs.x,
              y: hs.y,
              radius: 4.5,
              fill: "#ffffff",
              stroke: "#0b63ce",
              strokeWidth: 1.5,
              listening: false
            }));
            layerSelection.add(new Konva.Line({
              points: [hs.x - 4, hs.y, hs.x + 4, hs.y, hs.x, hs.y - 4, hs.x, hs.y + 4],
              stroke: "#0b63ce",
              strokeWidth: 1.15,
              lineCap: "round",
              listening: false
            }));
          }
        }
        const curveCtx = getCurveEditContext();
        if (curveCtx) {
          const center = worldToScreen(curveCtx.cur);
          const prevHandle = worldToScreen(curveCtx.handlePrev);
          const nextHandle = worldToScreen(curveCtx.handleNext);
          const guideStroke = "rgba(9,71,145,0.55)";
          const handleStroke = "#094791";
          const handleFill = "#ffffff";
          layerSelection.add(new Konva.Line({
            points: [center.x, center.y, prevHandle.x, prevHandle.y],
            stroke: guideStroke,
            strokeWidth: 1.25,
            dash: [4, 4],
            listening: false
          }));
          layerSelection.add(new Konva.Line({
            points: [center.x, center.y, nextHandle.x, nextHandle.y],
            stroke: guideStroke,
            strokeWidth: 1.25,
            dash: [4, 4],
            listening: false
          }));
          for (const handle of [
            { name: "curve-handle-prev", point: prevHandle, vector: curveCtx.uPrev },
            { name: "curve-handle-next", point: nextHandle, vector: curveCtx.uNext }
          ]) {
            const marker = new Konva.Group({
              x: handle.point.x,
              y: handle.point.y,
              draggable: true,
              name: handle.name
            });
            marker.add(new Konva.Circle({
              x: 0,
              y: 0,
              radius: 9,
              fill: "rgba(9,71,145,0.09)",
              stroke: "rgba(0,0,0,0)"
            }));
            marker.add(new Konva.Circle({
              x: 0,
              y: 0,
              radius: 5.5,
              fill: handleFill,
              stroke: handleStroke,
              strokeWidth: 1.5,
              listening: false
            }));
            marker.on("mouseenter", () => setWorkspaceCursor("grab"));
            marker.on("mouseleave", () => {
              if (!state.drag.isDown) setWorkspaceCursor("");
            });
            marker.on("dragstart", () => setWorkspaceCursor("grabbing"));
            marker.on("dragmove", () => {
              const world = screenToWorld(marker.x(), marker.y());
              const dx = world.x - curveCtx.cur.x;
              const dy = world.y - curveCtx.cur.y;
              const projection = Math.max(0, dx * handle.vector.x + dy * handle.vector.y);
              const nextStrength = Math.max(0.08, Math.min(0.48, projection / Math.max(1e-6, curveCtx.minLen)));
              if (applyCurveEditPreview(nextStrength)) {
                const info = byId("workspaceInfo");
                if (info) info.textContent = `РљСЂРёРІРёР·РЅР°: ${nextStrength.toFixed(2)}`;
                renderScene();
              }
            });
            marker.on("dragend", () => {
              commitCurveEdit();
              setWorkspaceCursor("grab");
              renderScene();
            });
            layerSelection.add(marker);
          }
          layerSelection.add(new Konva.Circle({
            x: center.x,
            y: center.y,
            radius: 5,
            fill: "#094791",
            stroke: "#ffffff",
            strokeWidth: 1.4,
            listening: false
          }));
        }
        for (const p of state.draftZone) {
          const s = worldToScreen(p);
          layerSelection.add(new Konva.Circle({ x: s.x, y: s.y, radius: 3, fill: "#000000" }));
        }
      }

      try {
        if (state.debugVertex && state.debugVertex.enabled && state.debugVertex.last && ["edit-vertex", "add-vertex", "smooth-vertex", "curve-vertex"].includes(String(state.tool || ""))) {
          layerUi.add(new Konva.Label({
            x: 14,
            y: 14,
            listening: false
          }).add(new Konva.Tag({
            fill: "rgba(255,255,255,0.92)",
            stroke: "rgba(0,0,0,0.18)",
            strokeWidth: 1,
            cornerRadius: 4
          })).add(new Konva.Text({
            text: String(state.debugVertex.last || ""),
            fontSize: 11,
            fontFamily: "Iosevka, monospace",
            fill: "#222",
            padding: 6
          })));
        }
      } catch (_) {}

      layerGuides.draw();
      layerContent.draw();
      layerOverlay.draw();
      layerSelection.draw();
      updateReportsButtonState();

      const workspaceInfo = byId("workspaceInfo");
      if (workspaceInfo) workspaceInfo.textContent = "";
    }

    // Auto show/hide workspaceInfo based on content
    (function setupWorkspaceInfoVisibility() {
      const el = byId("workspaceInfo");
      if (!el) return;
      const update = () => { el.style.display = el.textContent.trim() ? "" : "none"; };
      update();
      new MutationObserver(update).observe(el, { childList: true, characterData: true, subtree: true });
    })();

    const api = (typeof window.furlabApi === "function")
      ? window.furlabApi
      : async function(path, method, body, timeoutMs) {
          const ctrl = new AbortController();
          const ms = Math.max(1000, Number(timeoutMs || 45000));
          const t = setTimeout(() => ctrl.abort(), ms);
          try {
            const res = await fetch(path, {
              method,
              headers: { "Content-Type": "application/json" },
              body: body ? JSON.stringify(body) : undefined,
              signal: ctrl.signal
            });
            return await res.json();
          } finally {
            clearTimeout(t);
          }
        };
function refreshSelectionInfo() {
      byId("selectionInfo").textContent = `selected: ${selectedIndexes.size}`;
    }
    function updateModeUi() {
      const zprj = previewSourceType === "zprj";
      byId("zprjSettingsPanel").style.display = zprj ? "block" : "none";
    }

    function arrayBufferToBase64(buf) {
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      let out = "";
      for (let i = 0; i < bytes.length; i += chunk) {
        const part = bytes.subarray(i, i + chunk);
        out += String.fromCharCode.apply(null, Array.from(part));
      }
      return btoa(out);
    }

    async function runPreviewDxfUpload(fileList) {
      const files = Array.from(fileList || []).filter((f) => /\.dxf$/i.test(String(f && f.name || "")));
      if (!files.length) {
        show("discoverOut", { ok: false, error: "no_dxf_files_selected" });
        return;
      }
      const payloadFiles = [];
      for (const f of files) {
        const arr = await f.arrayBuffer();
        payloadFiles.push({
          name: String(f.name || "upload.dxf"),
          dataBase64: arrayBufferToBase64(arr)
        });
      }
      const json = await api("/api/import/dxf/preview-upload", "POST", { files: payloadFiles }, 10 * 60 * 1000);
      show("discoverOut", json);
      if (!json.ok) return;
      previewSourceType = "dxf";
      updateModeUi();
      previewToken = json.token || "";
      previewItems = Array.isArray(json.items) ? json.items : [];
      selectedIndexes = new Set(); activePreviewIndex = null;
      renderPreviewTable();
      const firstReady = previewItems.filter((x) => x && x.isReadyForCommit === true);
      if (firstReady.length) {
        await autoLoadFirstGeometry(firstReady);
      } else {
        state.patternGeometry = null; renderScene();
        byId("workspaceInfo").textContent = "DXF upload preview loaded (no ready geometry items)";
      }
      show("previewOut", json);
    }

    async function loadGeometryForIndex(idx) {
      activePreviewIndex = idx;
      renderPreviewTable();
      try {
        const item = previewItems.find((x) => Number(x && x.previewIndex) === Number(idx)) || null;
        const json = await api("/api/import/dxf/geometry", "POST", {
          token: previewToken,
          previewIndex: idx,
          item: item ? {
            previewIndex: Number(item.previewIndex),
            sourcePath: String(item.sourcePath || ""),
            geometryPath: String(item.geometryPath || ""),
            geometryFormat: String(item.geometryFormat || ""),
            sizeBytes: Number(item.sizeBytes || 0),
            modifiedAt: String(item.modifiedAt || "")
          } : null
        });
        if (!json.ok) {
          state.patternGeometry = null;
          renderScene();
          byId("workspaceInfo").textContent = `geometry error: ${json.error || "unknown"} (idx=${idx})`;
          return false;
        }
        state.patternGeometry = json.geometry;
        state.loadedProjectWorkspaceKey = null;
        // Fresh DXF import вЂ” clean slate, no zones or layouts from previous sessions
        state.zones = [];
        state.layouts = [];
        state.selectedLayoutId = null;
        state.nextLayoutId = 1;
        state.activeProjectId = null;
        state.activeProjectName = null;
        state.selectedZoneId = null;
        state.selectedDetailId = null;
        clearActiveLayoutRuntime();
        fitPatternToView();
        updateProjectUi();
        renderLayoutModeSwitch();
        renderScene(); // populates state.details from geometry
        initZonesFromDetails(); // now state.details is ready
        state.nextZoneId = (Array.isArray(state.zones) ? state.zones : []).reduce((max, z) => Math.max(max, Number(z && z.id || 0)), 0) + 1;
        state.selectedZoneId = null;
        state.selectedDetailId = null;
        renderDetailZoneTree();
        renderPropertyEditor();
        renderScene();
        void persistZonesForCurrentWorkspace();
        return true;
      } catch (e) {
        state.patternGeometry = null;
        renderScene();
        byId("workspaceInfo").textContent = `geometry request failed (idx=${idx}): ${e && e.message ? e.message : "unknown"}`;
        return false;
      }
    }

    async function autoLoadFirstGeometry(candidates) {
      const seen = new Set();
      const queue = [];
      for (const c of candidates || []) {
        const idx = Number(c && c.previewIndex);
        if (!Number.isFinite(idx) || seen.has(idx)) continue;
        seen.add(idx);
        queue.push(idx);
      }
      for (const idx of queue) {
        selectedIndexes = new Set([idx]);
        refreshSelectionInfo();
        const ok = await loadGeometryForIndex(idx);
        if (ok) return true;
      }
      state.patternGeometry = null;
      state.details = [];
      state.selectedDetailId = null;
      renderScene();
      return false;
    }

    function renderPreviewTable() {
      const body = byId("previewTableBody"); body.innerHTML = "";
      const hasItems = previewItems.length > 0;
      byId("previewTableWrap").style.display = hasItems ? "block" : "none";
      byId("importActionsRow").style.display = hasItems ? "flex" : "none";
      byId("previewEmptyHint").style.display = hasItems ? "none" : "flex";
      if (!previewItems.length) {
        refreshSelectionInfo();
        return;
      }
      for (const item of previewItems) {
        const idx = Number(item.previewIndex), checked = selectedIndexes.has(idx);
        const entities = Number(
          (item.dxfSummary && item.dxfSummary.entities) ||
          (item.pacSummary && item.pacSummary.entityCount) ||
          (item.posSummary && item.posSummary.entityCount) ||
          0
        );
        const errorText = safeText(item.error || "");
        const tr = document.createElement("tr"); if (activePreviewIndex === idx) tr.className = "active";
        tr.innerHTML = `
          <td><input type="checkbox" data-idx="${idx}" ${checked ? "checked" : ""}></td>
          <td class="col-idx">${idx}</td>
          <td><div>${safeText(item.partName || item.fileName)}</div><div class="muted">${safeText(item.sourcePath)}</div></td>
          <td class="${item.isReadyForCommit ? "ok" : "muted"}">${item.isReadyForCommit ? "yes" : "-"}</td>
          <td>${Number(item.sizeBytes || 0)}</td>
          <td>${entities}</td>
          <td class="${errorText ? "bad" : "muted"}">${errorText || "-"}</td>
        `;
        tr.addEventListener("click", (e) => {
          const tag = String(e.target && e.target.tagName || "").toLowerCase();
          if (tag === "input") return;
          selectedIndexes = new Set([idx]); refreshSelectionInfo();
          if (previewSourceType === "dxf" || item.geometryAvailable === true) {
            void loadGeometryForIndex(idx);
          } else {
            activePreviewIndex = idx;
            renderPreviewTable();
            state.patternGeometry = null;
            state.details = [];
            state.selectedDetailId = null;
            renderScene();
            byId("workspaceInfo").textContent = "ZPRJ preview selected (no geometry available for this item)";
          }
        });
        body.appendChild(tr);
      }
      body.querySelectorAll("input[type=checkbox]").forEach((el) => {
        el.addEventListener("change", (e) => {
          const idx = Number(e.target.getAttribute("data-idx"));
          if (e.target.checked) selectedIndexes.add(idx); else selectedIndexes.delete(idx);
          refreshSelectionInfo();
        });
      });
      refreshSelectionInfo();
    }

    function setupRightPanelResize() {
      const splitter = byId("rightPanelSplitter");
      if (!splitter) return;
      const panel = splitter.parentElement;
      const top = panel ? panel.querySelector(".right-top") : null;
      const bottom = panel ? panel.querySelector(".right-bottom") : null;
      if (!panel || !top || !bottom) return;

      let dragging = false;
      let startY = 0;
      let startTop = 0;

      splitter.addEventListener("mousedown", (e) => {
        dragging = true;
        startY = e.clientY;
        startTop = top.getBoundingClientRect().height;
        document.body.style.userSelect = "none";
        e.preventDefault();
      });

      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const panelH = panel.getBoundingClientRect().height;
        const splitterH = splitter.getBoundingClientRect().height || 8;
        const minTop = 140;
        const minBottom = 120;
        const maxTop = Math.max(minTop, panelH - splitterH - minBottom);
        const nextTop = Math.max(minTop, Math.min(maxTop, startTop + (e.clientY - startY)));
        top.style.height = `${Math.round(nextTop)}px`;
      });

      window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = "";
      });
    }

    function ensureToolUiState() {
      state.toolUi = state.toolUi && typeof state.toolUi === "object" ? state.toolUi : {};
      state.toolUi.penSubtool = String(state.toolUi.penSubtool || "split-zone");
      state.toolUi.polygonSubtool = String(state.toolUi.polygonSubtool || "draw-zone");
      return state.toolUi;
    }

    function closeZoneToolMenus() {
      const penMenu = byId("zoneToolPenMenu");
      const polygonMenu = byId("zoneToolPolygonMenu");
      const penGroup = byId("zoneToolPenBtn") && byId("zoneToolPenBtn").closest(".zone-tool-group");
      const polygonGroup = byId("zoneToolPolygonBtn") && byId("zoneToolPolygonBtn").closest(".zone-tool-group");
      if (penMenu) penMenu.hidden = true;
      if (polygonMenu) polygonMenu.hidden = true;
      if (penGroup) penGroup.classList.remove("is-open");
      if (polygonGroup) polygonGroup.classList.remove("is-open");
    }

    function setWorkspaceTool(nextTool, options = {}) {
      const ui = ensureToolUiState();
      const prevTool = String(state.tool || "select");
      const normalized = String(nextTool || "select");
      if (prevTool === "curve-vertex" && normalized !== "curve-vertex") {
        clearCurveEdit({ restore: true });
      }
      if (!isVertexEditingTool(normalized)) state.selectedVertexIndex = null;
      state.tool = normalized;
      if (normalized !== "draw-zone") state.draftZone = [];
      if (normalized !== "split-zone") state.draftSplitLine = [];
      if (normalized === "split-zone" || normalized === "add-vertex" || normalized === "edit-vertex" || normalized === "curve-vertex" || normalized === "smooth-vertex") ui.penSubtool = normalized;
      if (normalized === "draw-zone" || normalized === "draw-rect" || normalized === "draw-ellipse") ui.polygonSubtool = normalized;
      const toolSelect = byId("toolSelect");
      if (toolSelect && String(toolSelect.value || "") !== normalized) toolSelect.value = normalized;
      renderZoneToolPalette();
      if (!state.drag.isDown || state.drag.mode !== "pan") setWorkspaceCursor("");
      if (!options.skipRender) renderScene();
    }

    function renderZoneToolPalette() {
      const ui = ensureToolUiState();
      const selectBtn = byId("zoneToolSelectBtn");
      const penBtn = byId("zoneToolPenBtn");
      const polygonBtn = byId("zoneToolPolygonBtn");
      const syncStandaloneButtonIcon = (button, active) => {
        if (!button) return;
        const btnImg = button.querySelector("img");
        if (!btnImg) return;
        const normalSrc = String(button.getAttribute("data-icon") || btnImg.getAttribute("src") || "").trim();
        const activeSrc = String(button.getAttribute("data-active-icon") || "").trim();
        const nextSrc = active && activeSrc ? activeSrc : normalSrc;
        if (nextSrc) btnImg.setAttribute("src", nextSrc);
      };
      const syncGroupButtonIcon = (groupName, currentTool, button) => {
        if (!button) return;
        const activeItem = document.querySelector(`.zone-tool-submenu-item[data-group='${groupName}'][data-tool='${currentTool}']`);
        if (!activeItem) return;
        const itemImg = activeItem.querySelector("img");
        const itemLabel = activeItem.querySelector("span:not(.zone-tool-shortcut)");
        const btnImg = button.querySelector("img");
        const largeIcon = String(activeItem.getAttribute("data-large-icon") || "").trim();
        const activeLargeIcon = String(activeItem.getAttribute("data-active-large-icon") || "").trim();
        const buttonActive = button.classList.contains("is-active");
        const nextSrc = (buttonActive ? activeLargeIcon : "") || largeIcon || (itemImg && itemImg.getAttribute("src")) || "";
        if (btnImg && nextSrc) {
          btnImg.setAttribute("src", nextSrc);
        }
        if (itemLabel) {
          const title = String(itemLabel.textContent || "").trim();
          if (title) button.setAttribute("title", title);
        }
      };
      const currentTool = String(state.tool || "");
      const selectActive = currentTool === "select";
      const penActive = ["split-zone", "add-vertex", "edit-vertex", "curve-vertex", "smooth-vertex"].includes(currentTool);
      const polygonActive = ["draw-zone", "draw-rect", "draw-ellipse"].includes(currentTool);
      const intarsiaPenActive = currentTool === "intarsia-pen";
      const intarsiaPenBtn = byId("zoneToolIntarsiaPenBtn");
      const isIntarsiaLayout = state.layoutMode === "intarsia";
      if (intarsiaPenBtn) intarsiaPenBtn.style.display = isIntarsiaLayout ? "" : "none";
      if (selectBtn) selectBtn.classList.remove("is-active");
      if (penBtn) penBtn.classList.remove("is-active");
      if (polygonBtn) polygonBtn.classList.remove("is-active");
      if (intarsiaPenBtn) intarsiaPenBtn.classList.remove("is-active");
      if (selectBtn && selectActive) selectBtn.classList.add("is-active");
      if (penBtn && penActive) penBtn.classList.add("is-active");
      if (polygonBtn && polygonActive) polygonBtn.classList.add("is-active");
      if (intarsiaPenBtn && intarsiaPenActive) intarsiaPenBtn.classList.add("is-active");
      if (intarsiaPenBtn) {
        const btnImg = intarsiaPenBtn.querySelector("img");
        if (btnImg) btnImg.src = intarsiaPenActive ? "/assets/tool-icons/intarsia-pen-active.svg" : "/assets/tool-icons/intarsia-pen.svg";
      }
      document.querySelectorAll(".zone-tool-submenu-item[data-group='pen']").forEach((node) => {
        node.classList.toggle("is-active", String(node.getAttribute("data-tool") || "") === String(ui.penSubtool || ""));
      });
      document.querySelectorAll(".zone-tool-submenu-item[data-group='polygon']").forEach((node) => {
        node.classList.toggle("is-active", String(node.getAttribute("data-tool") || "") === String(ui.polygonSubtool || ""));
      });
      syncStandaloneButtonIcon(selectBtn, selectActive);
      syncGroupButtonIcon("pen", String(ui.penSubtool || ""), penBtn);
      syncGroupButtonIcon("polygon", String(ui.polygonSubtool || ""), polygonBtn);
    }

    function bindZoneToolPalette() {
      ensureToolUiState();
      const palette = byId("zoneToolPalette");
      if (!palette) return;
      const selectBtn = byId("zoneToolSelectBtn");
      const penBtn = byId("zoneToolPenBtn");
      const polygonBtn = byId("zoneToolPolygonBtn");
      const penMenu = byId("zoneToolPenMenu");
      const polygonMenu = byId("zoneToolPolygonMenu");
      const penGroup = penBtn ? penBtn.closest(".zone-tool-group") : null;
      const polygonGroup = polygonBtn ? polygonBtn.closest(".zone-tool-group") : null;

      const openGroupMenu = (groupName) => {
        const isPen = groupName === "pen";
        if (penMenu) penMenu.hidden = !isPen;
        if (polygonMenu) polygonMenu.hidden = isPen;
        if (penGroup) penGroup.classList.toggle("is-open", isPen);
        if (polygonGroup) polygonGroup.classList.toggle("is-open", !isPen);
      };

      if (selectBtn) {
        selectBtn.addEventListener("click", () => {
          closeZoneToolMenus();
          setWorkspaceTool("select");
        });
      }
      if (penBtn) {
        penBtn.addEventListener("click", () => {
          if (penMenu && !penMenu.hidden) {
            closeZoneToolMenus();
          } else {
            openGroupMenu("pen");
          }
          renderZoneToolPalette();
        });
      }
      if (polygonBtn) {
        polygonBtn.addEventListener("click", () => {
          if (polygonMenu && !polygonMenu.hidden) {
            closeZoneToolMenus();
          } else {
            openGroupMenu("polygon");
          }
          renderZoneToolPalette();
        });
      }
      palette.querySelectorAll(".zone-tool-submenu-item").forEach((node) => {
        node.addEventListener("click", () => {
          if (node.disabled || node.classList.contains("is-disabled")) return;
          const tool = String(node.getAttribute("data-tool") || "");
          closeZoneToolMenus();
          setWorkspaceTool(tool);
        });
      });
      document.addEventListener("click", (e) => {
        if (!palette.contains(e.target)) closeZoneToolMenus();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeZoneToolMenus();
      });
      const intarsiaPenBtn = byId("zoneToolIntarsiaPenBtn");
      if (intarsiaPenBtn) {
        intarsiaPenBtn.addEventListener("click", () => {
          closeZoneToolMenus();
          setWorkspaceTool(state.tool === "intarsia-pen" ? "select" : "intarsia-pen");
        });
      }
      renderZoneToolPalette();
      setWorkspaceCursor("");
    }

    byId("toolSelect").onchange = (e) => setWorkspaceTool(String(e.target.value || "select"), { skipRender: false });
    bindZoneToolPalette();
    const uiBindingsApi = window.FurLabUiBindings || {};
    const uiBindings = (typeof uiBindingsApi.createUiBindings === "function")
      ? uiBindingsApi.createUiBindings({
        byId,
        api: (url, method, body, timeoutMs) => api(url, method, body, timeoutMs),
        state,
        renderScene: () => renderScene(),
        clampInputNumber: (id, min, max, fallback) => clampInputNumber(id, min, max, fallback),
        previewIntarsiaFragmentsDraft: () => previewIntarsiaFragmentsDraft(),
        setIntarsiaStepPhase: (phase) => setIntarsiaStepPhase(phase),
        runInventoryPickFlow: (options) => runInventoryPickFlow(options),
        closeInventoryStep1: () => closeInventoryStep1(),
        closeInventoryStep2: () => closeInventoryStep2(),
        openInventoryStep1: () => openInventoryStep1(),
        buildOracleCaseFromCurrentPreview: () => buildOracleCaseFromCurrentPreview(),
        downloadJsonFile: (fileName, obj) => downloadJsonFile(fileName, obj),
        requestInventoryManualSuggestions: () => requestInventoryManualSuggestions(),
        recomputeInventoryManualVisibility: () => requestManualRecomputeFromUi(),
        undoInventoryManualPlacement: () => undoInventoryManualPlacement(),
        closeReplaceCandidateModal: () => closeReplaceCandidateModal(),
        closeLayoutTypePicker: () => closeLayoutTypePicker(),
        layoutTypePicker,
        addLayoutByMode: (mode) => addLayoutByMode(mode),
        addMaterialById: (materialId) => addMaterialById(materialId),
        isManualInventoryMode: () => isManualInventoryMode(),
        renderLayoutModeSwitch: () => renderLayoutModeSwitch(),
        renderDetailZoneTree: () => renderDetailZoneTree(),
        renderPropertyEditor: () => renderPropertyEditor(),
        syncFillTypeUi: () => syncFillTypeUi(),
        getPreviewToken: () => previewToken
      })
      : null;
    if (uiBindings && typeof uiBindings.bindMainControls === "function") {
      uiBindings.bindMainControls();
    }
    // Sync layer state from DOM checkboxes (checked attr = default visible)
    const LAYER_MAP = [
      ["layerPattern", "pattern"], ["layerZones", "zones"], ["layerZoneMaterials", "zoneMaterials"],
      ["layerSelection", "selection"], ["layerGuides", "guides"], ["layerVisibleArea", "visibleArea"],
      ["layerPieceIntersections", "pieceIntersections"], ["layerPieceBorders", "pieceBorders"],
      ["layerAssignedPieces", "assignedPieces"], ["layerPfullZ", "pfullZ"],
      ["layerUsedGain", "usedGain"], ["layerPcoreZ", "pcoreZ"], ["layerVisibleCore", "visibleCore"],
      ["layerSplitLeftovers", "splitLeftovers"], ["layerCoverageHoles", "coverageHoles"],
    ];
    function syncLayersFromCheckboxes() {
      for (const [id, key] of LAYER_MAP) {
        const el = byId(id);
        if (el) state.layers[key] = !!el.checked;
      }
    }
    syncLayersFromCheckboxes();
    const reportsBtn = byId("reportsBtn");
    if (reportsBtn) reportsBtn.onclick = () => openReportsModal();
    const reportsCloseBtn = byId("reportsCloseBtn");
    if (reportsCloseBtn) reportsCloseBtn.onclick = () => closeReportsModal();
    const reportsCloseFooterBtn = byId("reportsCloseFooterBtn");
    if (reportsCloseFooterBtn) reportsCloseFooterBtn.onclick = () => closeReportsModal();
    const reportsBackdrop = byId("reportsBackdrop");
    if (reportsBackdrop) {
      reportsBackdrop.addEventListener("click", (e) => {
        if (e.target === reportsBackdrop) closeReportsModal();
      });
    }
    const zoneMaterialCloseBtn = byId("zoneMaterialCloseBtn");
    if (zoneMaterialCloseBtn) zoneMaterialCloseBtn.onclick = () => closeZoneMaterialModal();
    const zoneMaterialCancelBtn = byId("zoneMaterialCancelBtn");
    if (zoneMaterialCancelBtn) zoneMaterialCancelBtn.onclick = () => closeZoneMaterialModal();
    const zoneMaterialApplyBtn = byId("zoneMaterialApplyBtn");
    if (zoneMaterialApplyBtn) {
      zoneMaterialApplyBtn.onclick = async () => {
        const zoneId = Number(state.pendingZoneMaterialZoneId || 0) || 0;
        const zone = state.zones.find((item) => Number(item && item.id || 0) === zoneId) || null;
        const select = byId("zoneMaterialSelect");
        if (!zone || !select) {
          closeZoneMaterialModal();
          return;
        }
        const items = await loadMaterialsDict();
        const pickedId = String(select.value || "").trim();
        const material = pickedId
          ? (items.find((item) => String(item.id || "") === pickedId) || { id: pickedId, name: pickedId })
          : { id: null, name: null };
        const json = await assignMaterialToZone(zone, material);
        if (!json || !json.ok) {
          byId("workspaceInfo").textContent = `РћС€РёР±РєР° РЅР°Р·РЅР°С‡РµРЅРёСЏ РјР°С‚РµСЂРёР°Р»Р°: ${String(json && json.error || "unknown")}`;
          return;
        }
        closeZoneMaterialModal();
      };
    }
    const zoneMaterialBackdrop = byId("zoneMaterialBackdrop");
    if (zoneMaterialBackdrop) {
      zoneMaterialBackdrop.addEventListener("click", (e) => {
        if (e.target === zoneMaterialBackdrop) closeZoneMaterialModal();
      });
    }

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const reportsBackdrop = byId("reportsBackdrop");
        if (reportsBackdrop && reportsBackdrop.style.display === "flex") {
          closeReportsModal();
          return;
        }
        if (Array.isArray(state.draftZone) && state.draftZone.length > 0) {
          state.draftZone = [];
          byId("workspaceInfo").textContent = "";
          renderScene();
          return;
        }
        if (Array.isArray(state.draftSplitLine) && state.draftSplitLine.length > 0) {
          state.draftSplitLine = [];
          byId("workspaceInfo").textContent = "";
          renderScene();
          return;
        }
        if (Array.isArray(state.draftIntarsiaContour) && state.draftIntarsiaContour.length > 0) {
          state.draftIntarsiaContour = [];
          byId("workspaceInfo").textContent = "";
          renderScene();
          return;
        }
      }
      const target = e.target;
      const tag = target && target.tagName ? String(target.tagName).toUpperCase() : "";
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!(target && target.isContentEditable);
      if (!isTyping && e.key === "Enter" && state.tool === "intarsia-pen") {
        if (Array.isArray(state.draftIntarsiaContour) && state.draftIntarsiaContour.length >= 3) {
          finishIntarsiaContour();
        }
        return;
      }
      const ctrlOrMeta = !!(e.ctrlKey || e.metaKey);

      if (!isTyping && ctrlOrMeta && !e.altKey && !isManualInventoryMode()) {
        const key = String(e.key || "").toLowerCase();
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }
        if ((key === "y") || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          redo();
          return;
        }
        if (e.shiftKey && e.code === "KeyM") {
          const zone = state.zones.find((z) => Number(z && z.id || 0) === Number(state.selectedZoneId || 0)) || null;
          if (zone) {
            e.preventDefault();
            void loadMaterialsDict().then((items) => openZoneMaterialModal(zone, items)).catch(() => {});
            return;
          }
        }
      }

      if (!isTyping && !ctrlOrMeta && !e.altKey) {
        const code = String(e.code || "");
        if (code === "KeyL") {
          e.preventDefault();
          setWorkspaceTool("split-zone");
          return;
        }
        if (code === "KeyX") {
          e.preventDefault();
          setWorkspaceTool("add-vertex");
          return;
        }
        if (code === "KeyV") {
          e.preventDefault();
          setWorkspaceTool("edit-vertex");
          return;
        }
        if (code === "KeyC") {
          e.preventDefault();
          setWorkspaceTool("curve-vertex");
          return;
        }
        if (code === "KeyS") {
          e.preventDefault();
          setWorkspaceTool("smooth-vertex");
          return;
        }
        if (code === "KeyR") {
          e.preventDefault();
          setWorkspaceTool("draw-rect");
          return;
        }
        if (code === "KeyE") {
          e.preventDefault();
          setWorkspaceTool("draw-ellipse");
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && isVertexEditingTool(state.tool)) {
          if (removeSelectedZoneVertex()) {
            e.preventDefault();
            return;
          }
        }
        if ((e.key === "Delete" || e.key === "Backspace") && state.layoutMode === "intarsia" && state.selectedFragmentId != null) {
          const delId = Number(state.selectedFragmentId);
          let deleted = false;
          if (Array.isArray(state.intarsiaSvgFragments)) {
            const before = state.intarsiaSvgFragments.length;
            state.intarsiaSvgFragments = state.intarsiaSvgFragments.filter((f) => Number(f && f.id || 0) !== delId);
            if (state.intarsiaSvgFragments.length < before) deleted = true;
          }
          if (Array.isArray(state.layoutRun && state.layoutRun.fragments)) {
            const before = state.layoutRun.fragments.length;
            state.layoutRun.fragments = state.layoutRun.fragments.filter((f) => Number(f && f.id || 0) !== delId);
            if (state.layoutRun.fragments.length < before) deleted = true;
          }
          if (deleted) {
            state.selectedFragmentId = null;
            e.preventDefault();
            renderScene();
            return;
          }
        }
        if (e.key === "Enter" && String(state.tool || "") === "split-zone" && Array.isArray(state.draftSplitLine) && state.draftSplitLine.length >= 2) {
          e.preventDefault();
          void commitDraftSplitLine();
          return;
        }
        if (e.key === "Enter" && String(state.tool || "") === "draw-zone" && Array.isArray(state.draftZone) && state.draftZone.length >= 3) {
          e.preventDefault();
          const created = createZoneFromPoints(state.draftZone);
          if (created) setWorkspaceTool("select");
          return;
        }
      }

      if (isManualInventoryMode() && !isTyping) {
        if (ctrlOrMeta && String(e.key || "").toLowerCase() === "z" && !e.shiftKey) {
          e.preventDefault();
          void undoInventoryManualPlacement();
          return;
        }
        if (ctrlOrMeta && (String(e.key || "").toLowerCase() === "y" || (String(e.key || "").toLowerCase() === "z" && e.shiftKey))) {
          e.preventDefault();
          redoInventoryManualPlacement();
          return;
        }
        if (ctrlOrMeta && String(e.key || "").toLowerCase() === "e") {
          e.preventDefault();
          void requestManualRecomputeFromUi();
          return;
        }
        if (ctrlOrMeta && e.code === "BracketRight") {
          const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
          const selIdx = Number(manual && manual.selectedPlacementIndex);
          if (Number.isFinite(selIdx) && selIdx >= 0) {
            e.preventDefault();
            moveInventoryManualPlacementZ(selIdx, +1);
            return;
          }
        }
        if (ctrlOrMeta && e.code === "BracketLeft") {
          const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
          const selIdx = Number(manual && manual.selectedPlacementIndex);
          if (Number.isFinite(selIdx) && selIdx >= 0) {
            e.preventDefault();
            moveInventoryManualPlacementZ(selIdx, -1);
            return;
          }
        }
        if (!ctrlOrMeta && (e.key === "Delete" || e.key === "Backspace")) {
          const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
          const selIdx = Number(manual && manual.selectedPlacementIndex);
          if (Number.isFinite(selIdx) && selIdx >= 0) {
            e.preventDefault();
            removeInventoryManualPlacementByIndex(selIdx, "РєСѓСЃРѕРє СѓРґР°Р»РµРЅ");
            return;
          }
        }
        if (!ctrlOrMeta && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowDown" ? -step : e.key === "ArrowUp" ? step : 0;
          const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
          const ap = manual && manual.activePiece ? manual.activePiece : null;
          if (ap && Array.isArray(ap.points) && ap.points.length >= 3) {
            e.preventDefault();
            const moved = translatePoints(ap.points, dx, dy);
            updateManualActivePiecePoints(moved);
            renderScene();
            void evaluateManualActivePieceNow();
            return;
          }
          const selIdx = Number(manual && manual.selectedPlacementIndex);
          const placements = Array.isArray(state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
          const pl = Number.isFinite(selIdx) && selIdx >= 0 ? placements[selIdx] : null;
          if (pl && Array.isArray(pl.alignedContour) && pl.alignedContour.length >= 3) {
            e.preventDefault();
            const geomBefore = { alignedContour: pl.alignedContour.map((p) => ({ ...p })), inZoneContour: Array.isArray(pl.inZoneContour) ? pl.inZoneContour.map((p) => ({ ...p })) : null, inZoneCoreContour: Array.isArray(pl.inZoneCoreContour) ? pl.inZoneCoreContour.map((p) => ({ ...p })) : null };
            pl.alignedContour = translatePoints(pl.alignedContour, dx, dy);
            if (Array.isArray(pl.inZoneContour)) pl.inZoneContour = translatePoints(pl.inZoneContour, dx, dy);
            if (Array.isArray(pl.inZoneCoreContour)) pl.inZoneCoreContour = translatePoints(pl.inZoneCoreContour, dx, dy);
            const geomAfter = { alignedContour: pl.alignedContour.map((p) => ({ ...p })), inZoneContour: Array.isArray(pl.inZoneContour) ? pl.inZoneContour.map((p) => ({ ...p })) : null, inZoneCoreContour: Array.isArray(pl.inZoneCoreContour) ? pl.inZoneCoreContour.map((p) => ({ ...p })) : null };
            const undoStack = Array.isArray(state.layoutRun && state.layoutRun.manualUndoStack) ? state.layoutRun.manualUndoStack : [];
            const last = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
            const now = Date.now();
            if (last && last.type === "move-placement" && last.idx === selIdx && (now - (last.ts || 0)) < 800) {
              last.after = geomAfter;
              last.ts = now;
            } else {
              pushManualUndoCommand({ type: "move-placement", idx: selIdx, before: geomBefore, after: geomAfter, ts: now });
            }
            markLayoutDirty();
            renderScene();
            return;
          }
        }
      }

      if (!isTyping && e.code === "Space") {
        state.keys.space = true;
        if (!state.drag.isDown || state.drag.mode !== "pan") setWorkspaceCursor("grab");
        e.preventDefault();
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.keys.shift = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        state.keys.space = false;
        if (!state.drag.isDown || state.drag.mode !== "pan") setWorkspaceCursor("");
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") state.keys.shift = false;
    });
    window.addEventListener("blur", () => {
      state.keys.space = false;
      state.keys.shift = false;
      setWorkspaceCursor("");
    });

    const stageInteractionsApi = window.FurLabStageInteractions || {};
    const stageInteractions = (typeof stageInteractionsApi.createStageInteractions === "function")
      ? stageInteractionsApi.createStageInteractions({
        stage,
        state,
        screenToWorld: (x, y) => screenToWorld(x, y),
        renderScene: () => renderScene(),
        isManualInventoryMode: () => isManualInventoryMode(),
        centroid: (points) => centroid(points),
        rotatePoints: (points, angleRad, center) => rotatePoints(points, angleRad, center),
        updateManualActivePiecePoints: (nextPoints) => updateManualActivePiecePoints(nextPoints),
        renderInventoryManualPanel: () => renderInventoryManualPanel(),
        setWorkspaceCursor: (mode) => setWorkspaceCursor(mode),
        findManualPlacementAt: (worldPoint) => findManualPlacementAt(worldPoint),
        pointInPolygon: (point, polygon) => pointInPolygon(point, polygon),
        findLayoutFragmentAt: (worldPoint) => findLayoutFragmentAt(worldPoint),
        findZoneAt: (worldPoint) => findZoneAt(worldPoint),
        findDetailAt: (worldPoint, thresholdPx) => findDetailAt(worldPoint, thresholdPx),
        findVertexAt: (worldPoint) => findVertexAt(worldPoint),
        findNearestVertexInSelectedZone: (worldPoint) => findNearestVertexInSelectedZone(worldPoint),
        isZoneVertexOnSharedBoundary: (zone, vertexIndex, thresholdPx) => isZoneVertexOnSharedBoundary(zone, vertexIndex, thresholdPx),
        findSharedBoundaryVertexLinks: (zone, vertexIndex, thresholdPx) => findSharedBoundaryVertexLinks(zone, vertexIndex, thresholdPx),
        buildRectZonePoints: (a, b) => buildRectZonePoints(a, b),
        buildEllipseZonePoints: (a, b, segments) => buildEllipseZonePoints(a, b, segments),
        createZoneFromPoints: (points, options) => createZoneFromPoints(points, options),
        setWorkspaceTool: (tool) => setWorkspaceTool(tool),
        smoothZoneVertexPoints: (points, vertexIndex, strength) => smoothZoneVertexPoints(points, vertexIndex, strength),
        beginCurveEdit: (zone, vertexIndex, strength) => beginCurveEdit(zone, vertexIndex, strength),
        clearCurveEdit: (options) => clearCurveEdit(options),
        pushCommand: (cmd) => pushCommand(cmd),
        recomputeInventoryManualVisibility: () => requestManualRecomputeFromUi(),
        isRadialManualCenterMode: () => {
          const selectedLayout = getSelectedLayoutEntry();
          return !!(
            selectedLayout
            && String(selectedLayout.mode || "") === "radial"
            && getRadialCenterModeValue() === "manual"
            && isLayoutEditEnabledInScene(selectedLayout)
          );
        },
        setRadialManualCenter: (worldPoint, options) => setRadialManualCenter(worldPoint, options),
        onZoneGeometryChanged: () => { void persistZonesForCurrentWorkspace(); },
        requestZoneSplit: async (fromPoint, toPoint) => splitSelectedZoneByLine(fromPoint, toPoint),
        openZoneContextMenuAt: (payload) => openZoneContextMenu(payload),
        openIntarsiaFragmentContextMenuAt: (payload) => openIntarsiaFragmentContextMenu(payload),
        setWorkspaceInfo: (text) => {
          const info = byId("workspaceInfo");
          if (info) info.textContent = String(text || "");
        },
        onZoneSelected: (zone) => {
          const zoneId = Number(zone && zone.id || 0);
          if (!zoneId) return;
          if (detailZoneTreeView && typeof detailZoneTreeView.scrollSelectedZoneIntoView === "function") {
            detailZoneTreeView.scrollSelectedZoneIntoView();
          }
          // Don't auto-switch layout while in manual mode or active layout editing вЂ”
          // openLayoutEntry reloads snapshot and would discard unsaved placements.
          if (isManualInventoryMode()) return;
          const activeEntry = getSelectedLayoutEntry();
          // Only block auto-switch for manual mode вЂ” fragment-only modes have no unsaved placements
          if (activeEntry && String(activeEntry.mode || "") === "inventory_manual") return;
          const layoutForZone = (Array.isArray(state.layouts) ? state.layouts : [])
            .find((e) => Number(e && e.boundZoneId || 0) === zoneId);
          if (layoutForZone && Number(layoutForZone.id) !== Number(state.selectedLayoutId || 0)) {
            selectLayoutEntry(layoutForZone);
          }
        },
        onManualPlacementMoved: (idx, geomBefore, geomAfter) => {
          pushManualUndoCommand({ type: "move-placement", idx, before: geomBefore, after: geomAfter });
        },
        finishIntarsiaContour: () => finishIntarsiaContour(),
        byId,
        getCanvasHeight: () => H
      })
      : null;

    if (stageInteractions && typeof stageInteractions.attach === "function") {
      stageInteractions.attach();
    }


    const importPreviewControllerApi = window.FurLabImportPreviewController || {};
    const importPreviewController = (typeof importPreviewControllerApi.createImportPreviewController === "function")
      ? importPreviewControllerApi.createImportPreviewController({
        byId,
        api: (...args) => api(...args),
        show: (...args) => show(...args),
        updateModeUi: () => updateModeUi(),
        renderPreviewTable: () => renderPreviewTable(),
        autoLoadFirstGeometry: (candidates) => autoLoadFirstGeometry(candidates),
        refreshSelectionInfo: () => refreshSelectionInfo(),
        renderScene: () => renderScene(),
        runPreviewDxfUpload: (files) => runPreviewDxfUpload(files),
        getPatternState: () => state,
        getDiscoveredFiles: () => discoveredFiles,
        setDiscoveredFiles: (next) => { discoveredFiles = Array.isArray(next) ? next : []; },
        setDiscoveredZprjFile: (next) => { discoveredZprjFile = String(next || ""); },
        setPreviewSourceType: (next) => { previewSourceType = String(next || "dxf"); },
        setPreviewToken: (next) => { previewToken = String(next || ""); },
        setPreviewItems: (next) => { previewItems = Array.isArray(next) ? next : []; },
        setSelectedIndexes: (next) => { selectedIndexes = next instanceof Set ? next : new Set(); },
        setActivePreviewIndex: (next) => { activePreviewIndex = Number.isFinite(Number(next)) ? Number(next) : null; }
      })
      : null;
    const syncImportModeUi = () => {
      if (importPreviewController && typeof importPreviewController.syncImportModeUi === "function") {
        importPreviewController.syncImportModeUi();
      }
    };
    if (importPreviewController && typeof importPreviewController.bind === "function") {
      importPreviewController.bind();
    }

    byId("partsBtn").onclick = async () => {
      const res = await fetch("/api/project/parts");
      const json = await res.json();
      show("partsOut", json);
    };

    setupRightPanelResize();
    setupInventoryStep1Drag();
    prepareInventoryStep2Modal();
    renderLayoutModeSwitch();
    syncFillTypeUi();
    byId("importMode").onchange = syncImportModeUi;
    syncImportModeUi();
    refreshBuildTag();
    renderScene();
    updateModeUi();
    window.FurLabResetCurrentZones = () => resetZonesForCurrentWorkspace();

    // в”Ђв”Ђ Project management в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ


    async function loadProject(id) {
      const res = await api("/api/projects/load", "POST", { id }, 30000);
      if (!res || !res.ok) throw new Error(res && res.error || "load_failed");
      const project = res.item;

      // Restore detail geometry from saved parts so validation and workspace key work
      // even when the pattern file has not been re-imported in this session
      const savedParts = Array.isArray(project.parts) ? project.parts : [];
      if (savedParts.some((p) => Array.isArray(p.points) && p.points.length >= 3)) {
        state.details = savedParts
          .filter((p) => Number(p.id) > 0 && Array.isArray(p.points) && p.points.length >= 3)
          .map((p) => ({
            id: Number(p.id),
            name: String(p.name || `Р”РµС‚Р°Р»СЊ ${p.id}`),
            entity: { points: p.points, closed: true },
            bbox: (() => {
              const pts = p.points;
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const pt of pts) { minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y); }
              return Number.isFinite(minX) ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY } : null;
            })(),
            area: 0, points: p.points.length
          }));
      }

      // Restore pattern geometry (Р»РµРєР°Р»Р°) if saved with the project
      if (project.patternGeometry && Array.isArray(project.patternGeometry.entities)) {
        state.patternGeometry = project.patternGeometry;
      }

      // Restore project materials
      if (Array.isArray(project.projectMaterials) && project.projectMaterials.length > 0) {
        state.projectMaterials = project.projectMaterials;
      }
      // Pre-load fur catalog if any zones have materials so rendering doesn't lag on first renderScene
      if ((Array.isArray(project.zones) ? project.zones : []).some((z) => z && z.materialId)) {
        void loadFurMaterialsCatalog();
      }
      // Migrate: resolve any materialIds on zones that are missing from projectMaterials
      void (async () => {
        const existing = new Set((Array.isArray(state.projectMaterials) ? state.projectMaterials : []).map(m => String(m.id || "")));
        const missing = [...new Set((Array.isArray(project.zones) ? project.zones : []).map(z => String(z.materialId || "")).filter(id => id && !existing.has(id)))];
        for (const mid of missing) {
          // Try zone's own materialName first (already stored on the zone)
          const zoneWithName = (Array.isArray(project.zones) ? project.zones : []).find(z => String(z.materialId || "") === mid && String(z.materialName || "").trim());
          if (zoneWithName) {
            ensureProjectMaterialEntry({ id: mid, name: String(zoneWithName.materialName) });
            continue;
          }
          // Fall back to loading from server
          const mat = typeof loadFurMaterialDetails === "function" ? await loadFurMaterialDetails(mid) : null;
          ensureProjectMaterialEntry(mat || { id: mid, name: mid });
        }
        renderDetailZoneTree();
      })();

      // Restore zones and lock workspace key so zone operations use the correct store key
      // even when pattern geometry is not loaded in this session
      state.loadedProjectWorkspaceKey = String(project.workspaceKey || "") || null;
      state.zones = Array.isArray(project.zones) ? project.zones.map((z) => ({ ...z })) : [];
      state.nextZoneId = state.zones.reduce((max, z) => Math.max(max, Number(z.id || 0)), 0) + 1;
      state.selectedZoneId = null;
      state.selectedFragmentId = null;
      // Sync loaded zones into zone_store so server-side operations (delete, validate) work correctly
      if (state.loadedProjectWorkspaceKey && state.zones.length > 0) {
        void api("/api/zones/save", "POST", { workspaceKey: state.loadedProjectWorkspaceKey, zones: state.zones }, 20000);
      }

      // Restore layouts
      state.layouts = [];
      state.nextLayoutId = 1;
      for (const lay of (Array.isArray(project.layouts) ? project.layouts : [])) {
        const lastRun = Array.isArray(lay.runs) && lay.runs.length ? lay.runs[lay.runs.length - 1] : null;
        const savedParams = (lastRun && lastRun.paramsSnapshot) || {};
        // Support both old format (patternParams nested) and new format (flat)
        const restoredParamsSnapshot = savedParams.patternParams && typeof savedParams.patternParams === "object"
          ? savedParams.patternParams
          : savedParams;
        // Ensure layoutModeVersion is present so isFragmentOnlySnapshotStale doesn't force regen
        if (restoredParamsSnapshot && !restoredParamsSnapshot.layoutModeVersion) {
          restoredParamsSnapshot.layoutModeVersion = getFragmentOnlyModeVersion(lay.mode);
        }
        const snapshot = lastRun ? {
          selectedZoneId: Number(lay.zoneId || 0) || null,
          layoutRun: {
            active: true,
            status: "applied",
            strategy: String(lay.mode || "longitudinal"),
            fillType: "voronoi",
            selectedZoneId: Number(lay.zoneId || 0) || null,
            allowanceMm: Number(savedParams.normalizeRules && savedParams.normalizeRules.seamAllowanceReserveMm || 12),
            paramsSnapshot: restoredParamsSnapshot,
            fragments: Array.isArray(lastRun.resultSnapshot && lastRun.resultSnapshot.fragments) ? lastRun.resultSnapshot.fragments : [],
            placements: (Array.isArray(lastRun.scrapPlacements) ? lastRun.scrapPlacements : []).map((sp, idx) => {
              const contour = Array.isArray(sp.resultContourSnapshot) ? sp.resultContourSnapshot : [];
              return {
                id: String(sp.scrapPieceId || ""),
                fragmentId: idx + 1,
                scrapPieceId: String(sp.scrapPieceId || ""),
                inventoryTag: String(sp.inventoryTag || ""),
                rotationDeg: Number(sp.rotationDeg || 0),
                status: "matched",
                alignedContour: contour,
                alignedContourPoints: contour,
                inZoneContour: contour,
                inZoneCoreContour: Array.isArray(sp.coreContourSnapshot) && sp.coreContourSnapshot.length >= 3
                  ? sp.coreContourSnapshot
                  : [],
                gainAreaMm2: 0,
                scrapAreaMm2: 0,
                overlapAreaMm2: 0,
                outsideAreaMm2: 0,
                fragmentAreaMm2: 0
              };
            }),
            stats: (lastRun.resultSnapshot && lastRun.resultSnapshot.stats) || {},
            lastConstraints: (lastRun.paramsSnapshot && lastRun.paramsSnapshot.constraints) || {},
            lastFilters: (lastRun.paramsSnapshot && lastRun.paramsSnapshot.filters) || {},
            candidatePool: [],
            previewLayers: { pieceIntersections: [], visibleArea: [], coverageHoles: [], seams: [] },
            manual: {}
          }
        } : null;
        const id = state.nextLayoutId++;
        state.layouts.push({
          id,
          mode: String(lay.mode || "longitudinal"),
          name: String(lay.name || `Р’С‹РєР»Р°РґРєР° ${id}`),
          persistedRunId: String(lay.persistedRunId || ""),
          boundZoneId: Number(lay.zoneId || 0) || null,
          boundDetailId: null,
          runtimeSnapshot: snapshot,
          isDirty: false
        });
      }
      if (state.layouts.length > 0) {
        const firstLayout = state.layouts[0];
        state.selectedLayoutId = firstLayout.id;
        applyLayoutMode(firstLayout.mode);
        if (firstLayout.runtimeSnapshot) {
          if (String(firstLayout.mode || "") === "inventory_manual") {
            applyManualLayoutSnapshot(firstLayout.runtimeSnapshot);
          } else {
            applyFragmentOnlyLayoutSnapshot(String(firstLayout.mode || ""), firstLayout.runtimeSnapshot, firstLayout);
          }
        }
        // Kick stale-check re-preview so cutPoints are populated on load
        if (isFragmentOnlyLayoutMode(String(firstLayout.mode || ""))) {
          const _mode = String(firstLayout.mode || "");
          if (isFragmentOnlySnapshotStale(_mode, firstLayout.runtimeSnapshot)) {
            void previewFragmentOnlyLayout(_mode).then(() => {
              if (Number(state.selectedLayoutId) === Number(firstLayout.id)) {
                firstLayout.runtimeSnapshot = buildFragmentOnlyLayoutSnapshot(_mode);
                renderScene();
              }
            });
          }
        }
      }

      state.activeProjectId = project.id;
      state.activeProjectName = project.name;
      updateProjectUi();
      renderLayoutModeSwitch();
      renderDetailZoneTree();
      renderPropertyEditor();
      renderScene();
      // Fit all zone/detail geometry into view after loading
      {
        const allPoints = (Array.isArray(state.zones) ? state.zones : [])
          .flatMap((z) => Array.isArray(z && z.points) ? z.points : []);
        const allDetailPoints = (Array.isArray(state.details) ? state.details : [])
          .flatMap((d) => Array.isArray(d && d.entity && d.entity.points) ? d.entity.points : []);
        const pts = allPoints.length >= 3 ? allPoints : allDetailPoints;
        if (pts.length >= 3) { fitPointsToView(pts); renderScene(); }
      }

      // Pre-load snapshots for all layouts so they are all visible on canvas simultaneously
      for (const entry of state.layouts) {
        if (!entry.persistedRunId || entry.runtimeSnapshot) continue;
        const _entry = entry;
        void api("/api/layout/manual/runs/load", "POST", { id: _entry.persistedRunId }).then((res) => {
          if (res && res.ok && res.item && res.item.snapshot && typeof res.item.snapshot === "object") {
            _entry.runtimeSnapshot = JSON.parse(JSON.stringify(res.item.snapshot));
            _entry.persistedAt = Number(res.item.updatedAt || Date.now());
            _entry.isDirty = false;
            renderScene();
          }
        });
      }
    }

    // ---------------------------------------------------------------------------
    // Project save/load/UI — delegated to window.FurLabProject (core/project.js)
    // ---------------------------------------------------------------------------
    if (window.FurLabProject) window.FurLabProject.init({
      state,
      api,
      saveCurrentLayoutRuntimeSnapshot,
      buildZonesWorkspaceKey,
      loadProject,
    });
    const modeToLayoutType = (m) => window.FurLabProject ? window.FurLabProject.modeToLayoutType(m) : "RegularLayout";
    const serializeLayoutForProject = (e) => window.FurLabProject ? window.FurLabProject.serializeLayoutForProject(e) : {};
    const buildProjectPayload = (n, id) => window.FurLabProject ? window.FurLabProject.buildProjectPayload(n, id) : {};
    const saveProject = (n, id) => window.FurLabProject ? window.FurLabProject.saveProject(n, id) : Promise.resolve();
    const updateProjectUi = () => window.FurLabProject && window.FurLabProject.updateProjectUi();
    const openProjectPicker = () => window.FurLabProject && window.FurLabProject.openProjectPicker();

    byId("projectImportFileInput").onchange = async (e) => {
      const files = e.target.files;
      if (!files || !files.length) return;
      try {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) formData.append("files", files[i]);
        const uploadResp = await fetch("/api/import/upload", { method: "POST", body: formData });
        const pickRes = await uploadResp.json();
        if (!pickRes || !pickRes.ok || !Array.isArray(pickRes.files) || !pickRes.files.length) return;

        // ZPRJ вЂ” РѕРґРёРЅ С„Р°Р№Р», РёРґС‘С‚ С‡РµСЂРµР· zprj preview
        const isZprj = pickRes.files.length === 1 && pickRes.files[0].toLowerCase().endsWith(".zprj");
        if (isZprj) {
          const previewRes = await api("/api/import/zprj/preview", "POST", { filePath: pickRes.files[0] });
          if (!previewRes || !previewRes.ok) {
            const wi = byId("workspaceInfo"); if (wi) wi.textContent = `РћС€РёР±РєР° preview: ${previewRes && previewRes.error || "unknown"}`;
            return;
          }
          previewSourceType = "zprj";
          previewToken = previewRes.token || "";
          previewItems = Array.isArray(previewRes.items) ? previewRes.items : [];
          selectedIndexes = new Set(); activePreviewIndex = null;
          updateModeUi();
          renderPreviewTable();
          const geometryItems = previewItems.filter((x) => x && x.geometryAvailable === true);
          if (geometryItems.length) await autoLoadFirstGeometry(geometryItems);
          else { state.patternGeometry = null; renderScene(); }
          return;
        }

        // DXF / PAC / POS
        const previewRes = await api("/api/import/dxf/preview", "POST", { files: pickRes.files });
        if (!previewRes || !previewRes.ok) {
          const wi = byId("workspaceInfo"); if (wi) wi.textContent = `РћС€РёР±РєР° preview: ${previewRes && previewRes.error || "unknown"}`;
          return;
        }
        previewToken = previewRes.token || "";
        previewItems = Array.isArray(previewRes.items) ? previewRes.items : [];
        discoveredFiles = pickRes.files;
        previewSourceType = "dxf";
        selectedIndexes = new Set(); activePreviewIndex = null;
        updateModeUi();
        renderPreviewTable();
        const firstReady = previewItems.filter((x) => x && x.isReadyForCommit === true);
        if (firstReady.length) await autoLoadFirstGeometry(firstReady);
        else { state.patternGeometry = null; renderScene(); }
      } catch (e) {
        const wi = byId("workspaceInfo"); if (wi) wi.textContent = `РћС€РёР±РєР° РёРјРїРѕСЂС‚Р°: ${e && e.message ? e.message : "unknown"}`;
      }
    };


    updateProjectUi();

    // -----------------------------------------------------------------------
    // Export to CLO: "РџСЂРµРѕР±СЂР°Р·РѕРІР°С‚СЊ РІ Р»РµРєР°Р»Р°"
    // -----------------------------------------------------------------------
    // ---------------------------------------------------------------------------
    // Export to CLO — delegated to window.FurLabCloExport (core/clo-export.js)
    // ---------------------------------------------------------------------------
    if (window.FurLabCloExport) window.FurLabCloExport.init({
      state,
      api,
      saveCurrentLayoutRuntimeSnapshot,
      serializeLayoutForProject,
    });
    const buildExportBody = (s, m) => window.FurLabCloExport ? window.FurLabCloExport.buildExportBody(s, m) : {};
    const openExportCloModal = () => window.FurLabCloExport && window.FurLabCloExport.openExportCloModal();
    const exportCloPreview = () => window.FurLabCloExport && window.FurLabCloExport.exportCloPreview();
    const exportCloRun = () => window.FurLabCloExport && window.FurLabCloExport.exportCloRun();

    // On startup: show project picker if projects exist, otherwise just load manual runs
    void (async () => {
      try {
        const res = await api("/api/projects", "GET", null, 10000);
        const items = res && res.ok && Array.isArray(res.items) ? res.items : [];
        if (items.length > 0) {
          openProjectPicker();
        } else {
          // No projects yet вЂ” fall back to loading saved manual runs
          const count = await loadSavedManualRuns();
          if (count > 0) {
            renderLayoutModeSwitch();
            renderDetailZoneTree();
            renderPropertyEditor();
            renderScene();
          }
        }
      } catch (_) {}
    })();
