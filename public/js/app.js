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
        maxSolveMs: 60000,
        hardMaxSolveMs: 180000,
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
        minGainVisibleMm2: 1200,
        minSpanMm: 60,
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
    function parseLocaleNumber(v, fallback = null) {
      if (v === null || v === undefined) return fallback;
      if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
      const s = String(v).trim().replace(",", ".");
      if (!s) return fallback;
      const n = Number(s);
      return Number.isFinite(n) ? n : fallback;
    }
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
    function normalizeDeg(v, fallback = DEFAULT_NAP_DIRECTION_DEG) {
      const n = parseLocaleNumber(v, fallback);
      if (!Number.isFinite(n)) return Number(fallback);
      return ((n % 360) + 360) % 360;
    }
    function getZoneNapDirectionDeg(zone) {
      return normalizeDeg(zone && zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG);
    }
    function show(id, obj) {
      const el = byId(id);
      const text = JSON.stringify(obj, null, 2);
      el.textContent = text;
      el.style.display = text ? "block" : "none";
    }
    function safeText(v) { return v === null || v === undefined ? "" : String(v); }
    function escapeHtml(v) {
      return String(v === null || v === undefined ? "" : v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    const reportsState = {
      model: null,
      selectedDetailId: null
    };
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
    function canOpenReports() {
      const layouts = Array.isArray(state && state.layouts) ? state.layouts : [];
      for (const entry of layouts) {
        const snapshot = getLayoutSnapshotForReports(entry);
        const frags = Array.isArray(snapshot && snapshot.layoutRun && snapshot.layoutRun.fragments) ? snapshot.layoutRun.fragments : [];
        const placements = Array.isArray(snapshot && snapshot.layoutRun && snapshot.layoutRun.placements) ? snapshot.layoutRun.placements : [];
        if (frags.length > 0 || placements.some((p) => String(p && p.status || "") === "matched")) return true;
      }
      const frags = Array.isArray(state && state.layoutRun && state.layoutRun.fragments) ? state.layoutRun.fragments : [];
      const placements = Array.isArray(state && state.layoutRun && state.layoutRun.placements) ? state.layoutRun.placements : [];
      return frags.length > 0 || placements.some((p) => String(p && p.status || "") === "matched");
    }
    function escapeCsv(value) {
      const s = String(value === null || value === undefined ? "" : value);
      if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }
    function napSymbolByDeg(deg) {
      const d = (((Number(deg) || 0) % 360) + 360) % 360;
      if (d >= 337.5 || d < 22.5) return "→";
      if (d < 67.5) return "↘";
      if (d < 112.5) return "↓";
      if (d < 157.5) return "↙";
      if (d < 202.5) return "←";
      if (d < 247.5) return "↖";
      if (d < 292.5) return "↑";
      return "↗";
    }
    function normalizeContourArrayForReports(raw) {
      if (typeof normalizeContourArray === "function") return normalizeContourArray(raw);
      if (!raw) return null;
      const pts = [];
      const push = (x, y) => {
        const xn = Number(x);
        const yn = Number(y);
        if (!Number.isFinite(xn) || !Number.isFinite(yn)) return;
        pts.push({ x: xn, y: yn });
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
      return pts.length >= 3 ? pts : null;
    }
    function buildReportsModel() {
      const zones = Array.isArray(state && state.zones) ? state.zones : [];
      const zoneById = new Map(zones.map((z) => [Number(z && z.id || 0), z]));
      const rows = [];
      let hiddenSmallCount = 0;
      let hiddenSmallAreaMm2 = 0;
      const layouts = Array.isArray(state && state.layouts) ? state.layouts : [];
      const selectedLayoutId = Number(state && state.selectedLayoutId || 0) || 0;
      const latestEntryByZone = new Map();
      const rankLayoutForReports = (entry, snapshot, zoneId) => {
        const isSelected = Number(entry && entry.id || 0) === selectedLayoutId;
        const isPersisted = !!(entry && entry.persistedRunId);
        const updatedAt = Number(
          entry && entry.persistedAt
          || snapshot && snapshot.updatedAt
          || snapshot && snapshot.layoutRun && snapshot.layoutRun.updatedAt
          || 0
        ) || 0;
        return [
          Number(isSelected),
          Number(isPersisted),
          updatedAt,
          Number(entry && entry.id || 0),
          Number(zoneId || 0)
        ];
      };
      const isRankGreater = (a, b) => {
        for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
          const av = Number(a[i] || 0);
          const bv = Number(b[i] || 0);
          if (av > bv) return true;
          if (av < bv) return false;
        }
        return false;
      };
      for (const entry of layouts) {
        const snapshot = getLayoutSnapshotForReports(entry);
        if (!snapshot || !snapshot.layoutRun) continue;
        const boundZoneId = Number(entry && entry.boundZoneId || snapshot.selectedZoneId || snapshot.layoutRun.selectedZoneId || 0) || 0;
        if (!boundZoneId) continue;
        const nextRank = rankLayoutForReports(entry, snapshot, boundZoneId);
        const prev = latestEntryByZone.get(boundZoneId);
        if (!prev || isRankGreater(nextRank, prev.rank)) {
          latestEntryByZone.set(boundZoneId, { entry, snapshot, rank: nextRank });
        }
      }
      for (const { entry, snapshot } of latestEntryByZone.values()) {
        const placements = Array.isArray(snapshot.layoutRun.placements) ? snapshot.layoutRun.placements : [];
        const fragments = Array.isArray(snapshot.layoutRun.fragments) ? snapshot.layoutRun.fragments : [];
        const boundZoneId = Number(entry && entry.boundZoneId || snapshot.selectedZoneId || snapshot.layoutRun.selectedZoneId || 0) || 0;
        const zone = zoneById.get(boundZoneId) || null;
        const detailId = Number(entry && entry.boundDetailId || zone && zone.detailId || snapshot.selectedDetailId || 0) || 0;
        const fragmentsSrc = fragments.length
          ? fragments
          : placements
            .map((p, i) => {
              const pts = normalizeContourArrayForReports(p && p.inZoneCoreContour) || normalizeContourArrayForReports(p && p.inZoneContour) || [];
              if (pts.length < 3) return null;
              return {
                id: i + 1,
                points: pts,
                ownerPlacementIndex: i,
                ownerPlacementId: Number(p && p.fragmentId || 0)
              };
            })
            .filter(Boolean);
        for (let i = 0; i < fragmentsSrc.length; i += 1) {
          const frag = fragmentsSrc[i] || {};
          const pl = findPlacementForFragmentInSnapshot(snapshot, frag);
          const zoneId = Number(pl && pl.zoneId || boundZoneId || 0);
          const zoneForRow = zoneById.get(zoneId) || zone || null;
          const detailForRow = Number(zoneForRow && zoneForRow.detailId || detailId || 0) || 0;
          const pts = normalizeContourArrayForReports(frag.points) || normalizeContourArrayForReports(pl && pl.inZoneCoreContour) || normalizeContourArrayForReports(pl && pl.inZoneContour) || [];
          if (pts.length < 3) continue;
          const baseNap = Number.isFinite(Number(pl && pl.napDirectionDeg))
            ? Number(pl.napDirectionDeg)
            : (Number.isFinite(Number(pl && pl.candidate && pl.candidate.napDirectionDeg))
                ? Number(pl.candidate.napDirectionDeg)
                : DEFAULT_NAP_DIRECTION_DEG);
          const alignRot = Number.isFinite(Number(pl && pl.alignRotationDeg))
            ? Number(pl.alignRotationDeg)
            : (Number.isFinite(Number(pl && pl.rotationDeg))
                ? Number(pl.rotationDeg)
                : (Number.isFinite(Number(pl && pl.rotation))
                    ? Number(pl.rotation)
                    : 0));
          const napDeg = Number.isFinite(Number(pl && pl.napEffectiveDeg))
            ? Number(pl.napEffectiveDeg)
            : (baseNap + alignRot);
          const napDegNorm = ((napDeg % 360) + 360) % 360;
          const areaMm2 = Math.max(0, Number(frag.areaMm2 || polygonArea(pts) || 0));
          if (areaMm2 > 0 && areaMm2 < REPORT_MIN_FRAGMENT_AREA_MM2) {
            hiddenSmallCount += 1;
            hiddenSmallAreaMm2 += areaMm2;
            continue;
          }
          const fragNo = i + 1;
          rows.push({
            index: rows.length + 1,
            detailId: detailForRow,
            zoneId,
            fragmentNo: fragNo,
            fragmentCode: `${detailForRow}-${zoneId}-${fragNo}`,
            napSymbol: napSymbolByDeg(napDegNorm),
            napLabel: `${napSymbolByDeg(napDegNorm)} ${Math.round(napDegNorm)}°`,
            napDeg: Math.round(napDegNorm),
            qty: 1,
            areaMm2,
            inventoryTag: String((pl && (pl.inventoryTag || pl.scrapPieceId || pl.id)) || "-"),
            points: pts,
            zonePoints: Array.isArray(zoneForRow && zoneForRow.points) ? zoneForRow.points : []
          });
        }
      }
      const detailIds = Array.from(new Set(rows.map((r) => Number(r.detailId || 0)).filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b);
      const selectedLayout = getSelectedLayoutEntry();
      const selectedZoneId = Number(
        selectedLayout && String(selectedLayout.mode || "") === "inventory_manual" && selectedLayout.boundZoneId
        || state && state.layoutRun && state.layoutRun.selectedZoneId
        || state.selectedZoneId
        || 0
      );
      const selectedZone = zones.find((z) => Number(z && z.id || 0) === selectedZoneId) || zones[0] || null;
      const selectedDetailId = Number(selectedZone && selectedZone.detailId || detailIds[0] || 1);
      return {
        rows,
        detailIds,
        selectedDetailId: detailIds.includes(selectedDetailId) ? selectedDetailId : (detailIds[0] || null),
        hiddenSmallCount,
        hiddenSmallAreaMm2
      };
    }
    function renderReportsThumb(points) {
      const pts = Array.isArray(points) ? points : [];
      if (pts.length < 3) return "-";
      let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
      for (const p of pts) {
        const x = Number(p && p.x);
        const y = Number(p && p.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return "-";
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const pad = 2;
      const vw = 36;
      const vh = 26;
      const s = Math.min((vw - pad * 2) / w, (vh - pad * 2) / h);
      const d = pts.map((p, i) => {
        const x = ((Number(p.x) - minX) * s + pad).toFixed(2);
        const y = ((maxY - Number(p.y)) * s + pad).toFixed(2);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      }).join(" ") + " Z";
      return `<svg class="reports-thumb" viewBox="0 0 36 26" aria-hidden="true"><path d="${d}" fill="none" stroke="#222" stroke-width="1"/></svg>`;
    }
    function renderReportsScheme(rows, detailId) {
      const box = byId("reportsSchemeBox");
      const title = byId("reportsSchemeTitle");
      const zone = byId("reportsSchemeZone");
      if (!box || !title || !zone) return;
      const list = Array.isArray(rows) ? rows : [];
      const first = list[0] || null;
      title.textContent = `Деталь: ${detailId || "-"}`;
      zone.textContent = `Зона: ${first ? first.zoneId : "-"}`;
      if (!first || !Array.isArray(first.zonePoints) || first.zonePoints.length < 3) {
        box.innerHTML = "";
        return;
      }
      box.scrollTop = 0;
      box.scrollLeft = 0;
      const zonePts = normalizeContourArrayForReports(first.zonePoints) || [];
      const allPts = zonePts.concat(...list.map((r) => Array.isArray(r.points) ? r.points : []));
      let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
      for (const p of allPts) {
        const x = Number(p && p.x);
        const y = Number(p && p.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const boxW = Math.max(260, Number(box.clientWidth || 300));
      const boxH = Math.max(360, Number(box.clientHeight || 430));
      const vw = Math.max(260, Math.floor(boxW - 2));
      const vh = Math.max(360, Math.floor(boxH - 2));
      const pad = 12;
      const s = Math.min((vw - pad * 2) / w, (vh - pad * 2) / h);
      const mapPt = (p) => ({ x: ((Number(p.x) - minX) * s + pad), y: ((maxY - Number(p.y)) * s + pad) });
      const pathOf = (pts) => pts.map((p, i) => {
        const q = mapPt(p);
        return `${i === 0 ? "M" : "L"}${q.x.toFixed(2)},${q.y.toFixed(2)}`;
      }).join(" ") + " Z";
      const zonePath = pathOf(zonePts);
      const fragPaths = list.map((r) => {
        const d = pathOf(r.points);
        const c = centroid(r.points);
        const cc = mapPt(c);
        return `<path d="${d}" fill="none" stroke="#222" stroke-width="1"/><text x="${cc.x.toFixed(2)}" y="${cc.y.toFixed(2)}" font-size="10" text-anchor="middle" dominant-baseline="middle">${r.fragmentNo}</text>`;
      }).join("");
      box.innerHTML = `<svg class="reports-scheme-svg" viewBox="0 0 ${vw} ${vh}" aria-label="Схема детали"><path d="${zonePath}" fill="none" stroke="#111" stroke-width="1.2"/>${fragPaths}</svg>`;
    }
    function renderReportsView(detailId) {
      const model = reportsState.model;
      if (!model) return;
      const tabsWrap = byId("reportsDetailTabs");
      const select = byId("reportsDetailSelect");
      const summary = byId("reportsSummary");
      const detailHeading = byId("reportsDetailHeading");
      const modelTitle = byId("reportsModelTitle");
      const body = byId("reportsTableBody");
      const currentDetailId = Number(detailId || model.selectedDetailId || model.detailIds[0] || 0);
      reportsState.selectedDetailId = currentDetailId;
      if (modelTitle) modelTitle.textContent = model.detailIds.length ? `(${model.detailIds.length} деталей)` : "";
      if (tabsWrap) {
        tabsWrap.innerHTML = "";
        for (const id of model.detailIds) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `reports-tab${Number(id) === currentDetailId ? " active" : ""}`;
          btn.textContent = `Деталь ${id}`;
          btn.onclick = () => renderReportsView(id);
          tabsWrap.appendChild(btn);
        }
      }
      if (select) {
        select.innerHTML = model.detailIds.map((id) => `<option value="${id}" ${Number(id) === currentDetailId ? "selected" : ""}>${id}</option>`).join("");
        select.onchange = () => renderReportsView(Number(select.value || 0));
      }
      const rows = model.rows.filter((r) => Number(r.detailId) === currentDetailId);
      const totalArea = rows.reduce((acc, r) => acc + Number(r.areaMm2 || 0), 0);
      const zoneId = rows[0] ? rows[0].zoneId : "-";
      if (detailHeading) detailHeading.textContent = `Деталь ${currentDetailId || "-"}`;
      if (summary) {
        const hiddenSmallCount = Number(model.hiddenSmallCount || 0);
        const hiddenSmallAreaMm2 = Number(model.hiddenSmallAreaMm2 || 0);
        const hiddenPart = hiddenSmallCount > 0
          ? ` | скрыто мелких: ${hiddenSmallCount} (${hiddenSmallAreaMm2.toFixed(1)} мм²)`
          : "";
        summary.textContent = `Зона: ${zoneId} | Кусков: ${rows.length} | Полезная площадь: ${totalArea.toFixed(1)} мм²${hiddenPart}`;
      }
      if (body) {
        body.innerHTML = rows.map((r) => `
          <tr>
            <td>${renderReportsThumb(r.points)}</td>
            <td>${escapeHtml(r.napLabel || r.napSymbol || "↓")}</td>
            <td>${escapeHtml(r.fragmentCode)}</td>
            <td>${r.qty}</td>
            <td>${Number(r.areaMm2 || 0).toFixed(1)}</td>
            <td>${escapeHtml(r.inventoryTag)}</td>
          </tr>`).join("");
      }
      renderReportsScheme(rows, currentDetailId);
    }
    function updateReportsButtonState() {
      const btn = byId("reportsBtn");
      if (!btn) return;
      const enabled = canOpenReports();
      btn.disabled = !enabled;
      btn.title = enabled ? "" : "Отчёты доступны после построения выкладки";
    }
    function closeReportsModal() {
      const backdrop = byId("reportsBackdrop");
      if (backdrop) backdrop.style.display = "none";
    }
    function openReportsModal() {
      if (!canOpenReports()) {
        const workspaceInfo = byId("workspaceInfo");
        if (workspaceInfo) workspaceInfo.textContent = "Отчёты доступны только после Применить.";
        return;
      }
      reportsState.model = buildReportsModel();
      renderReportsView(reportsState.model.selectedDetailId);
      const backdrop = byId("reportsBackdrop");
      if (backdrop) backdrop.style.display = "flex";
      const exportBtn = byId("reportsExportCsvBtn");
      if (exportBtn) {
        exportBtn.onclick = () => {
          const model = reportsState.model;
          const selected = Number(reportsState.selectedDetailId || 0);
          const rows = model && Array.isArray(model.rows)
            ? model.rows.filter((r) => !selected || Number(r.detailId) === selected)
            : [];
          const lines = [
            "Detail;Zone;Fragment;Qty;AreaMm2;InventoryTag;NapDeg",
            ...rows.map((r) => [
              escapeCsv(r.detailId),
              escapeCsv(r.zoneId),
              escapeCsv(r.fragmentCode),
              escapeCsv(r.qty),
              escapeCsv(Number(r.areaMm2 || 0).toFixed(1)),
              escapeCsv(r.inventoryTag),
              escapeCsv(r.napDeg)
            ].join(";"))
          ];
          const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `furlab_report_${Date.now()}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        };
      }
      const printBtn = byId("reportsPrintBtn");
      if (printBtn) printBtn.onclick = () => window.print();
    }
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
        deleteLayoutEntry: (entry) => deleteLayoutEntry(entry)
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
        openInventoryStep1: () => openInventoryStep1(),
        renderManualTrayIntoRoot: () => renderManualTrayIntoRoot(),
        saveLayoutEntry: (entry) => saveLayoutEntry(entry)
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
        el.textContent = "Ожидание телеметрии...";
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
      const tail = inventoryLiveHistory.slice(-2).join(" В· ");
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
        : Number(byId("invNapTol").value || 15);
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
    function setWorkspaceCursor(mode) {
      const el = stage && stage.container ? stage.container() : null;
      if (!el) return;
      if (mode === "grab") el.style.cursor = "grab";
      else if (mode === "grabbing") el.style.cursor = "grabbing";
      else el.style.cursor = "";
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
    const layerPattern = new Konva.Layer();
    const layerFragments = new Konva.Layer();
    const layerVisibleArea = new Konva.Layer();
    const layerPreview = new Konva.Layer();
    const layerZones = new Konva.Layer();
    const layerSelection = new Konva.Layer();
    stage.add(layerGuides); stage.add(layerPattern); stage.add(layerFragments); stage.add(layerVisibleArea); stage.add(layerPreview); stage.add(layerZones); stage.add(layerSelection);

    function worldToScreen(p) {
      return { x: p.x * state.viewport.scale + state.viewport.offsetX, y: H - (p.y * state.viewport.scale + state.viewport.offsetY) };
    }
    function screenToWorld(x, y) {
      return { x: (x - state.viewport.offsetX) / state.viewport.scale, y: ((H - y) - state.viewport.offsetY) / state.viewport.scale };
    }

    function distance2(a, b) { const dx = a.x - b.x; const dy = a.y - b.y; return dx * dx + dy * dy; }
    function pointInPolygon(point, polygon) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y, xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-9) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }
    function findZoneAt(worldPoint) {
      for (let i = state.zones.length - 1; i >= 0; i--) {
        const z = state.zones[i];
        if (z.points.length >= 3 && pointInPolygon(worldPoint, z.points)) return z;
      }
      return null;
    }
    function findVertexAt(worldPoint, thresholdPx = 8) {
      const zone = state.zones.find((z) => Number(z && z.id) === Number(state.selectedZoneId));
      if (!zone) return null;
      const thr = thresholdPx / state.viewport.scale, thr2 = thr * thr;
      for (let i = 0; i < zone.points.length; i++) if (distance2(worldPoint, zone.points[i]) <= thr2) return { zone, vertexIndex: i };
      return null;
    }
    function findLayoutFragmentAt(worldPoint) {
      if (!state.layoutRun.active) return null;
      const zoneId = Number(state.layoutRun.selectedZoneId || 0);
      if (!zoneId) return null;
      const frags = Array.isArray(state.layoutRun.fragments) ? state.layoutRun.fragments : [];
      for (let i = frags.length - 1; i >= 0; i--) {
        const f = frags[i];
        const pts = Array.isArray(f && f.points) ? f.points : [];
        if (pts.length >= 3 && pointInPolygon(worldPoint, pts)) {
          return { fragmentId: Number(f.id || 0), zoneId };
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
    function dist2PointToSegment(p, a, b) {
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const wx = p.x - a.x;
      const wy = p.y - a.y;
      const c1 = vx * wx + vy * wy;
      if (c1 <= 0) return distance2(p, a);
      const c2 = vx * vx + vy * vy;
      if (c2 <= c1) return distance2(p, b);
      const t = c1 / c2;
      const proj = { x: a.x + t * vx, y: a.y + t * vy };
      return distance2(p, proj);
    }
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

    function pushCommand(cmd) { state.history.undo.push(cmd); state.history.redo = []; }
    function executeCommand(cmd) {
      if (cmd.type === "create-zone") {
        state.zones.push({
          id: cmd.zone.id,
          name: cmd.zone.name || `Зона ${cmd.zone.id}`,
          detailId: cmd.zone.detailId || null,
          napDirectionDeg: normalizeDeg(cmd.zone.napDirectionDeg, DEFAULT_NAP_DIRECTION_DEG),
          points: cmd.zone.points.map((p) => ({ ...p }))
        });
        state.selectedZoneId = cmd.zone.id;
      } else if (cmd.type === "move-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId); if (!z) return; z.points[cmd.vertexIndex] = { ...cmd.to };
      }
    }
    function revertCommand(cmd) {
      if (cmd.type === "create-zone") {
        state.zones = state.zones.filter((z) => z.id !== cmd.zone.id);
        if (state.selectedZoneId === cmd.zone.id) state.selectedZoneId = null;
      } else if (cmd.type === "move-vertex") {
        const z = state.zones.find((x) => x.id === cmd.zoneId); if (!z) return; z.points[cmd.vertexIndex] = { ...cmd.from };
      }
    }
    function undo() { const cmd = state.history.undo.pop(); if (!cmd) return; revertCommand(cmd); state.history.redo.push(cmd); renderScene(); }
    function redo() { const cmd = state.history.redo.pop(); if (!cmd) return; executeCommand(cmd); state.history.undo.push(cmd); renderScene(); }

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
        name: `Деталь ${i + 1}`,
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

    function segmentIntersectionGlobal(a, b, c, d) {
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
          name: `Зона ${zid}`,
          detailId: d.id,
          napDirectionDeg: DEFAULT_NAP_DIRECTION_DEG,
          points: pts.map((p) => ({ x: p.x, y: p.y }))
        });
        zid++;
      }
      state.zones = newZones;
      state.nextZoneId = zid;
      state.selectedZoneId = newZones.length ? newZones[0].id : null;
      state.selectedFragmentId = null;
      if (newZones.length) state.selectedDetailId = Number(newZones[0].detailId || state.selectedDetailId || 1);
    }

    function contourThumbSvg(points, closed) {
      const pts = Array.isArray(points) ? points : [];
      if (pts.length < 2) return '<svg viewBox="0 0 28 28"></svg>';
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
      const pad = 2;
      const scale = Math.min((28 - 2 * pad) / w, (28 - 2 * pad) / h);
      const ox = (28 - w * scale) * 0.5;
      const oy = (28 - h * scale) * 0.5;
      const mapped = pts.map((p) => ({
        x: ox + (p.x - minX) * scale,
        y: 28 - (oy + (p.y - minY) * scale)
      }));
      const d = mapped
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(" ")
        + (closed ? " Z" : "");
      return `<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="none" stroke="#222" stroke-width="1.2"/></svg>`;
    }

    function renderDetailZoneTree() {
      if (detailZoneTreeView && typeof detailZoneTreeView.renderDetailZoneTree === "function") {
        detailZoneTreeView.renderDetailZoneTree();
      }
    }

    function polygonArea(points) {
      if (!Array.isArray(points) || points.length < 3) return 0;
      let sum = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        sum += (a.x * b.y - b.x * a.y);
      }
      return Math.abs(sum) * 0.5;
    }

    function polylineLength(points, closed) {
      if (!Array.isArray(points) || points.length < 2) return 0;
      let len = 0;
      for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        len += Math.hypot(dx, dy);
      }
      if (closed) {
        const dx = points[0].x - points[points.length - 1].x;
        const dy = points[0].y - points[points.length - 1].y;
        len += Math.hypot(dx, dy);
      }
      return len;
    }

    function normalizeContourArray(raw) {
      if (!raw) return null;
      const pts = [];
      const push = (x, y) => {
        const xn = Number(x);
        const yn = Number(y);
        if (!Number.isFinite(xn) || !Number.isFinite(yn)) return;
        pts.push({ x: xn, y: yn });
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
      return pts.length >= 3 ? pts : null;
    }

    function clipPolygonByHalfPlane(poly, nx, ny, c) {
      const out = [];
      if (!Array.isArray(poly) || poly.length < 3) return out;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const da = nx * a.x + ny * a.y + c;
        const db = nx * b.x + ny * b.y + c;
        const ina = da >= 0;
        const inb = db >= 0;
        if (ina && inb) {
          out.push({ x: b.x, y: b.y });
        } else if (ina && !inb) {
          const t = da / (da - db || 1e-9);
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        } else if (!ina && inb) {
          const t = da / (da - db || 1e-9);
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          out.push({ x: b.x, y: b.y });
        }
      }
      return out;
    }

    function centroid(points) {
      if (!Array.isArray(points) || points.length === 0) return { x: 0, y: 0 };
      let x = 0, y = 0;
      for (const p of points) { x += p.x; y += p.y; }
      return { x: x / points.length, y: y / points.length };
    }

    function polygonBBox(points) {
      let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
      for (const p of points || []) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    function randomPointInPolygon(poly, bbox, maxAttempts = 500) {
      for (let i = 0; i < maxAttempts; i++) {
        const x = bbox.minX + Math.random() * bbox.width;
        const y = bbox.minY + Math.random() * bbox.height;
        if (pointInPolygon({ x, y }, poly)) return { x, y };
      }
      return centroid(poly);
    }

    function clipPolygonToRect(poly, x0, y0, x1, y1) {
      let out = poly;
      out = clipPolygonByHalfPlane(out, 1, 0, -x0);  // x >= x0
      out = clipPolygonByHalfPlane(out, -1, 0, x1);  // x <= x1
      out = clipPolygonByHalfPlane(out, 0, 1, -y0);  // y >= y0
      out = clipPolygonByHalfPlane(out, 0, -1, y1);  // y <= y1
      return out;
    }

    function toBooleanMulti(points) {
      if (!Array.isArray(points) || points.length < 3) return [];
      const ring = [];
      for (const p of points) {
        const x = Number(p && p.x);
        const y = Number(p && p.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        ring.push([Number(x.toFixed(6)), Number(y.toFixed(6))]);
      }
      if (ring.length < 3) return [];
      const f = ring[0];
      const l = ring[ring.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
      if (ring.length < 4) return [];
      // polygon-clipping MultiPolygon format: [ Polygon ], Polygon: [ Ring ]
      return [[ring]];
    }

    function fromBooleanMultiOuter(mp) {
      const out = [];
      if (!Array.isArray(mp)) return out;
      for (const poly of mp) {
        if (!Array.isArray(poly) || !Array.isArray(poly[0]) || poly[0].length < 4) continue;
        const ring = poly[0];
        const pts = [];
        for (let i = 0; i < ring.length - 1; i++) {
          const p = ring[i];
          const x = Number(p && p[0]);
          const y = Number(p && p[1]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          pts.push({ x, y });
        }
        if (pts.length >= 3) out.push(pts);
      }
      return out;
    }

    function toBooleanMultiFromMultiOuter(polys) {
      const mp = [];
      for (const pts of Array.isArray(polys) ? polys : []) {
        const one = toBooleanMulti(pts);
        if (Array.isArray(one) && one.length) mp.push(...one);
      }
      return mp;
    }

    function computeCoverageHoles(zonePoints, coverContours) {
      const zonePts = normalizeContourArray(zonePoints);
      if (!zonePts) return [];
      const pc = (typeof window !== "undefined" && window.polygonClipping) ? window.polygonClipping : null;
      if (!pc || typeof pc.difference !== "function") return [];
      const zoneMp = toBooleanMulti(zonePts);
      if (!Array.isArray(zoneMp) || !zoneMp.length) return [];
      const coverList = (Array.isArray(coverContours) ? coverContours : [])
        .map((poly) => normalizeContourArray(poly))
        .filter((poly) => Array.isArray(poly) && poly.length >= 3);
      if (!coverList.length) return [zonePts];
      const coverMp = toBooleanMultiFromMultiOuter(coverList);
      if (!Array.isArray(coverMp) || !coverMp.length) return [zonePts];
      try {
        const diff = pc.difference(zoneMp, coverMp) || [];
        return fromBooleanMultiOuter(diff).filter((poly) => polygonArea(poly) > 1);
      } catch (_) {
        return [];
      }
    }

    function extractCoreMultiFromPlacement(pl) {
      if (Array.isArray(pl && pl.inZoneCoreContours) && pl.inZoneCoreContours.length > 0) {
        return pl.inZoneCoreContours;
      }
      if (Array.isArray(pl && pl.inZoneCoreContour) && pl.inZoneCoreContour.length >= 3) {
        return toBooleanMulti(pl.inZoneCoreContour);
      }
      return [];
    }

    function buildRoundedRectPolygon(x0, y0, x1, y1, radiusMm) {
      const w = Math.max(0, x1 - x0);
      const h = Math.max(0, y1 - y0);
      const rRaw = Math.max(0, Number(radiusMm || 0));
      const r = Math.max(0, Math.min(rRaw, Math.max(0, Math.min(w, h) * 0.5 - 1e-6)));
      if (!(w > 0 && h > 0)) return [];
      if (!(r > 1e-9)) {
        return [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 }
        ];
      }
      const seg = 4;
      const pts = [];
      function addArc(cx, cy, a0, a1) {
        for (let i = 0; i <= seg; i++) {
          const t = i / seg;
          const a = a0 + (a1 - a0) * t;
          pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
      }
      addArc(x1 - r, y0 + r, -Math.PI / 2, 0);
      addArc(x1 - r, y1 - r, 0, Math.PI / 2);
      addArc(x0 + r, y1 - r, Math.PI / 2, Math.PI);
      addArc(x0 + r, y0 + r, Math.PI, Math.PI * 1.5);
      return pts;
    }

    function generateVoronoiFragments(zonePoints, options) {
      const area = polygonArea(zonePoints);
      const minArea = Math.max(50, Number(options.minArea || 500));
      const density = Math.max(1, Math.min(10, Number(options.density || 5)));
      const variability = Math.max(1, Math.min(10, Number(options.variability || 5)));
      const anisotropy = Math.max(1, Math.min(10, Number(options.anisotropy || 5)));
      const limit = Math.max(8, Math.min(240, Number(options.limit || 500)));
      const targetCount = Math.max(6, Math.min(120, Math.min(limit, Math.round((area / 12000) * (0.65 + density * 0.18)))));
      const bbox = polygonBBox(zonePoints);
      const seeds = [];
      const spread = 0.15 + (variability / 10) * 0.45;
      const axis = String(options.axis || "y");
      const k = 1 + ((anisotropy - 5) / 5) * 0.8;
      for (let i = 0; i < targetCount; i++) {
        const p = randomPointInPolygon(zonePoints, bbox);
        const jx = (Math.random() - 0.5) * bbox.width * spread * 0.06;
        const jy = (Math.random() - 0.5) * bbox.height * spread * 0.06;
        seeds.push({ x: p.x + jx, y: p.y + jy });
      }
      const fragments = [];
      for (let i = 0; i < seeds.length; i++) {
        const pi = seeds[i];
        let cell = zonePoints.map((p) => ({ x: p.x, y: p.y }));
        for (let j = 0; j < seeds.length; j++) {
          if (i === j) continue;
          const pj = seeds[j];
          const dx = pj.x - pi.x;
          const dy = pj.y - pi.y;
          const midx = (pi.x + pj.x) * 0.5;
          const midy = (pi.y + pj.y) * 0.5;
          const kx = axis === "x" ? k : 1;
          const ky = axis === "y" ? k : 1;
          const nx = -(kx * kx) * dx;
          const ny = -(ky * ky) * dy;
          const c = midx * (dx * kx * kx) + midy * (dy * ky * ky);
          cell = clipPolygonByHalfPlane(cell, nx, ny, c);
          if (cell.length < 3) break;
        }
        if (cell.length < 3) continue;
        if (polygonArea(cell) < minArea) continue;
        fragments.push(cell);
      }
      return fragments;
    }

    function generateRegularFragments(zonePoints, options) {
      const bbox = polygonBBox(zonePoints);
      const axis = String(options.axis || "y");
      let rows = Math.max(2, Math.min(20, Number(options.rows || 5)));
      let cols = Math.max(2, Math.min(20, Number(options.cols || 5)));
      const gapX = Math.max(0, Number(options.gapX || options.gapXmm || 0));
      const gapY = Math.max(0, Number(options.gapY || options.gapYmm || 0));
      const cornerRadius = Math.max(0, Number(options.cornerRadius || options.cornerRadiusMm || 0));
      if (axis === "y") rows = Math.max(rows, cols);
      if (axis === "x") cols = Math.max(cols, rows);
      const variability = Math.max(0, Math.min(10, Number(options.variability || 0)));
      const minArea = Math.max(50, Number(options.minArea || 500));
      const xCuts = [bbox.minX];
      const yCuts = [bbox.minY];
      for (let c = 1; c < cols; c++) {
        const t = c / cols;
        const base = bbox.minX + t * bbox.width;
        const jitter = (Math.random() - 0.5) * bbox.width * (variability / 10) * 0.05;
        xCuts.push(base + jitter);
      }
      for (let r = 1; r < rows; r++) {
        const t = r / rows;
        const base = bbox.minY + t * bbox.height;
        const jitter = (Math.random() - 0.5) * bbox.height * (variability / 10) * 0.05;
        yCuts.push(base + jitter);
      }
      xCuts.push(bbox.maxX);
      yCuts.push(bbox.maxY);
      xCuts.sort((a, b) => a - b);
      yCuts.sort((a, b) => a - b);
      const pc = (typeof window !== "undefined" && window.polygonClipping) ? window.polygonClipping : null;
      const canBooleanClip = !!(pc && typeof pc.intersection === "function");
      const zoneMulti = canBooleanClip ? toBooleanMulti(zonePoints) : [];

      const frags = [];
      for (let ry = 0; ry < yCuts.length - 1; ry++) {
        for (let cx = 0; cx < xCuts.length - 1; cx++) {
          let x0 = xCuts[cx];
          let y0 = yCuts[ry];
          let x1 = xCuts[cx + 1];
          let y1 = yCuts[ry + 1];
          if (gapX > 0) {
            const dx = gapX * 0.5;
            if (cx > 0) x0 += dx;
            if (cx < xCuts.length - 2) x1 -= dx;
          }
          if (gapY > 0) {
            const dy = gapY * 0.5;
            if (ry > 0) y0 += dy;
            if (ry < yCuts.length - 2) y1 -= dy;
          }
          if (!(x1 > x0 && y1 > y0)) continue;
          if (canBooleanClip && Array.isArray(zoneMulti) && zoneMulti.length) {
            const base = (cornerRadius > 0)
              ? buildRoundedRectPolygon(x0, y0, x1, y1, cornerRadius)
              : [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
            const baseMulti = toBooleanMulti(base);
            if (Array.isArray(baseMulti) && baseMulti.length) {
              let mp = [];
              try { mp = pc.intersection(baseMulti, zoneMulti) || []; } catch (_) { mp = []; }
              const pieces = fromBooleanMultiOuter(mp);
              for (const piece of pieces) {
                if (polygonArea(piece) >= minArea) frags.push(piece);
              }
              continue;
            }
          }
          const clipped = clipPolygonToRect(zonePoints, x0, y0, x1, y1);
          if (!Array.isArray(clipped) || clipped.length < 3) continue;
          if (polygonArea(clipped) < minArea) continue;
          frags.push(clipped);
        }
      }
      return frags;
    }

    function generateFragmentsForZone(zonePoints, options) {
      const fillType = String(options.fillType || "voronoi");
      let polys = [];
      if (fillType === "regular") {
        polys = generateRegularFragments(zonePoints, options);
      } else {
        polys = generateVoronoiFragments(zonePoints, options);
      }
      const zoneArea = polygonArea(zonePoints);
      const totalFragmentsArea = polys.reduce((acc, p) => acc + polygonArea(p), 0);
      const uncovered = Math.max(0, zoneArea - totalFragmentsArea);
      const uncoveredRatio = zoneArea > 0 ? uncovered / zoneArea : 0;
      const violations = uncoveredRatio > 0.015 ? 1 : 0;
      return {
        fragments: polys.map((p, i) => ({ id: i + 1, points: p })),
        stats: { violations, intersections: 0, uncovered: uncoveredRatio > 0.0001 ? 1 : 0 }
      };
    }

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
      if (intarsiaMode) byId("fillType").value = "regular";
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
          ? t("scenario_hint_manual", null, "Manual layout: operator places pieces, system gives hints.")
          : (state.layoutMode === "inventory_split_return"
            ? t("scenario_hint_split", null, "Split & Return: only visible part is used, leftover returns to pool.")
            : t("scenario_hint_inventory", null, "Layout is generated directly from inventory piece contours."));
        byId("inventoryOptimizationHint").textContent = optimizationPreset.description || "";
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
        byId("inventoryStep1Title").textContent = "\u0428\u0430\u0433 1. \u0418\u043d\u0442\u0430\u0440\u0441\u0438\u044f (\u0430\u0432\u0442\u043e, \u0440\u0435\u0433\u0443\u043b\u044f\u0440\u043d\u0430\u044f \u0441\u0435\u0442\u043a\u0430)";
        if (step1IntarsiaAssignBtn) step1IntarsiaAssignBtn.style.display = "inline-block";
      } else {
        byId("fillVoronoiFields").style.display = fillType === "voronoi" ? "block" : "none";
        byId("fillRegularFields").style.display = fillType === "regular" ? "block" : "none";
        byId("inventoryOptimizationHint").textContent = "";
        byId("inventoryStep1Title").textContent = t("step1_title_fill_residual", null, "Step 1. Fill residual");
        if (step1RunBtn) step1RunBtn.textContent = t("btn_pick", null, "Pick");
        if (step1IntarsiaAssignBtn) step1IntarsiaAssignBtn.style.display = "none";
      }
      setIntarsiaStepPhase(intarsiaStepPhase);
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
        : t("manual_selected_none", null, "нет");
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
        ? `${((((selectedNapDeg % 360) + 360) % 360)).toFixed(1)}°`
        : "-";
      const noteText = manual && manual.statusNote ? String(manual.statusNote).trim() : "";

      if (stateEl) {
        stateEl.textContent = noteText
          ? `${t("manual_status_prefix", null, "Статус")}: ${noteText}`
          : `${t("manual_status_prefix", null, "Статус")}: ${t("manual_status_ready", null, "готов к размещению")}`;
      }

      if (metricsEl) {
        if (!mm) {
          metricsEl.textContent = "gain=- | util=- | статус=-";
        } else {
          const reason = String(mm.statusReason || "").trim();
          metricsEl.textContent = `gain=${Number(mm.gainAreaMm2 || 0).toFixed(0)} мм² | util=${(Number(mm.utilizationLocal || 0) * 100).toFixed(1)}% | статус=${String(mm.status || "ok")}${reason ? ` (${reason})` : ""}`;
        }
      }

      if (summaryEl) {
        const zone = getManualZone();
        const zoneArea = zone ? Math.max(0, Number(polygonArea(zone.points || []) || 0)) : 0;
        const usefulArea = placements.reduce((a, p) => a + Number(p && p.gainAreaMm2 || 0), 0);
        const coverage = zoneArea > 0 ? (usefulArea / zoneArea) * 100 : 0;
        if (placements.length <= 0) {
          summaryEl.textContent = t("manual_summary_loaded", { loaded: loadedCount }, `Лоток: ${loadedCount}`);
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
            `Лоток: ${loadedCount} | На поле: ${placements.length} | Покрытие: ${coverage.toFixed(1)}% | Выбран: ${selectedTag} | ${napPart}`
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
      function bboxDisjoint(a, b) {
        if (!a || !b) return true;
        return (
          Number(a.maxX) + 1 < Number(b.minX) ||
          Number(b.maxX) + 1 < Number(a.minX) ||
          Number(a.maxY) + 1 < Number(b.minY) ||
          Number(b.maxY) + 1 < Number(a.minY)
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
              if (maxAx + 1 < minBx || maxBx + 1 < minAx || maxAy + 1 < minBy || maxBy + 1 < minAy) continue;
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
        state.layoutRun.manual.statusNote = "оценка не получена";
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
          p.alignedCoreContours = Array.isArray(ctr.coreWorld) ? ctr.coreWorld : [];
          p.alignedCoreContour = multiLargestOuterPoints(p.alignedCoreContours);
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
        scrapPieceId: c.scrapPieceId ? String(c.scrapPieceId) : "",
        candidate: c,
        points: moved,
        center: centroid(moved),
        rotationDeg: 0
      };
      state.layoutRun.manual.statusNote = "не зафиксирован";
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
        scrapPieceId: c.scrapPieceId ? String(c.scrapPieceId) : "",
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
      state.layoutRun.manual.statusNote = "кусок добавлен (ручной режим)";
      byId("invTotalFragments").textContent = String(state.layoutRun.placements.length);
      renderPlacementRows(state.layoutRun.placements || []);
      renderInventoryManualPanel();
      renderScene();
      void requestManualRecomputeFromUi();
      // Important: when adding directly from tray, compute Pfull/Pcore metrics immediately,
      // otherwise "Припуск куска" has no geometry to render for this placement.
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
      state.layoutRun.manual.statusNote = gainArea > 0 ? "зафиксирован" : "зафиксирован (без прироста)";
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
              state.layoutRun.manual.statusNote = `ручная выкладка перепривязана к зоне ${placementZoneId}`;
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
        state.layoutRun.manual.statusNote = "оценка не получена";
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
      let seamSegments = [];
      const seamDiag = {};
      let seamSourceResolved = manualApplied ? "applied_fragments" : "disabled_before_apply";
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
        const beforeBoundaryDrop = Array.isArray(seamSegments) ? seamSegments.length : 0;
        seamSegments = (Array.isArray(seamSegments) ? seamSegments : []).filter((seg) => !seamOnZoneBoundary(seg, zone && zone.points, 1.6));
        seamDiag.boundaryDropped = Math.max(0, beforeBoundaryDrop - seamSegments.length);
        seamSourceResolved = `applied_fragments:${seamGeometrySource}`;
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
        pieceIntersections: [],
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
      state.layoutRun.manual.statusNote = "оценка обновлена";
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
        ? `применено: ${placements.length} кусков`
        : "применено";
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
      renderInventoryManualPanel();
      renderManualTrayIntoRoot();
      const workspaceInfo = byId("workspaceInfo");
      if (workspaceInfo) {
        workspaceInfo.textContent = autosaveOk
          ? `Ручная выкладка применена и сохранена: ${placements.length} кусков`
          : `Ручная выкладка применена: ${placements.length} кусков`;
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
      state.layoutRun.manual.statusNote = noteText || "кусок удален";
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
      state.layoutRun.manual.statusNote = dir > 0 ? "кусок поднят по слою" : "кусок опущен по слою";
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
        ? "кусок отправлен назад по слою"
        : "кусок поднят на передний план";
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
      state.layoutRun.manual.statusNote = "кусок повернут";
      state.layoutRun.manual.lastMetrics = null;
      renderPlacementRows(state.layoutRun.placements || []);
      renderInventoryManualPanel();
      renderScene();
      void requestManualRecomputeFromUi();
      return true;
    }

    async function undoInventoryManualPlacement() {
      if (!isManualInventoryMode()) return;
      const placements = Array.isArray(state.layoutRun.placements) ? state.layoutRun.placements.slice() : [];
      if (!placements.length) return;
      removeInventoryManualPlacementByIndex(placements.length - 1, "последний кусок удален (Undo)");
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
      if (!isManualInventoryMode()) {
        host.classList.remove("active");
        host.innerHTML = "";
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
        host.innerHTML = `<div class="tree-empty">${t("manual_tray_empty", null, "Лоток пуст")}</div>`;
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
            `Оценка: кусков=${placedCount} | покрытие=${Number(mm.coveragePct || 0).toFixed(2)}% | полезно=${Number(mm.gainAreaMm2 || 0).toFixed(1)} мм² | зона=${zoneAreaForMetrics.toFixed(1)} мм² | перекрытие=${Number(mm.overlapAreaMm2 || 0).toFixed(1)} мм² | outside=${Number(mm.outsideAreaMm2 || 0).toFixed(1)} мм² | util=${(Number(mm.utilizationLocal || 0) * 100).toFixed(2)}%`
          )
          + ((String(mm.status || "ok") !== "ok")
            ? ` | status=${String(mm.status || "")}${mm.statusReason ? ` (${String(mm.statusReason)})` : ""}`
            : "")
        )
        : t("manual_metrics_prompt", { pieces: placedCount }, `Оценка: кусков=${placedCount} | нажмите "Оценить"`);
      const selectedPlacement = Number.isFinite(selectedPlacementIndex) && selectedPlacementIndex >= 0 && selectedPlacementIndex < placements.length
        ? placements[selectedPlacementIndex]
        : null;
      const selectedInfoLine = selectedPlacement
        ? `Выбран: ${String(selectedPlacement.inventoryTag || selectedPlacement.scrapPieceId || `#${selectedPlacementIndex + 1}`)} | угол=${Number(selectedPlacement.alignRotationDeg || 0).toFixed(1)}° | слой=${selectedPlacementIndex + 1}/${placements.length}`
        : "Выбран: нет";
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
        ? `Швы: built=${Number(seamDbg.seamsCount || 0)} | rendered=${Number(seamDbg.renderedSeams || 0)} | seamContours=${Number(seamDbg.seamContoursCount || 0)} | frags=${Number(seamDbg.fragmentsCount || 0)} | pairs=${Number(seamDbg.candidatePairs || 0)} | source=${String(seamDbg.source || "unknown")} | layer=${(state.layers && state.layers.visibleCore) ? "on" : "off"} | selectedZone=${Number(seamDbg.selectedZoneId || 0)} | recomputeZone=${Number(seamDbg.recomputeZoneId || 0)} | zoneByPlacements=${Number(seamDbg.zoneByPlacementsId || 0)}${seamDbg.usedZoneFallback ? " | rebind=1" : ""}${seamRejectSummary}${(Number(seamDbg.fragmentsCount||0)<2 || Number(seamDbg.candidatePairs||0)<1) ? " | no_seams_reason=not_enough_fragments_or_pairs" : ""}`
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
        : { large: false, medium: false, small: false };
      state.layoutRun.manual.trayOpen = trayOpen;
      if (manualTrayView && typeof manualTrayView.renderHtml === "function") {
        host.innerHTML = manualTrayView.renderHtml({
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
        host.innerHTML = '<div class="tree-empty">-</div>';
      }
      host.querySelectorAll("button[data-manual-toolbar]").forEach((btn) => {
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
      host.querySelectorAll("button[data-manual-toggle]").forEach((btn) => {
        btn.onclick = () => {
          const key = String(btn.getAttribute("data-manual-toggle") || "");
          if (!key) return;
          trayOpen[key] = !trayOpen[key];
          renderManualTrayIntoRoot();
        };
      });
      host.querySelectorAll("button[data-manual-debug-toggle]").forEach((btn) => {
        btn.onclick = () => {
          state.layoutRun.manual = state.layoutRun.manual || { suggestions: [], lastMetrics: null, selectedCandidateTag: "", activePiece: null, lastEvalContours: null, statusNote: "", selectedPlacementIndex: -1 };
          state.layoutRun.manual.debugOpen = !state.layoutRun.manual.debugOpen;
          renderManualTrayIntoRoot();
        };
      });
      host.querySelectorAll("button[data-manual-piece]").forEach((btn) => {
        btn.onclick = () => {
          const tag = String(btn.getAttribute("data-manual-piece") || "");
          const pool = Array.isArray(state.layoutRun && state.layoutRun.candidatePool) ? state.layoutRun.candidatePool : [];
          const picked = pool.find((c) => String(c && (c.inventoryTag || c.id) || "") === tag) || null;
          if (!picked) return;
          addManualPlacementFromCandidate(picked);
          renderManualTrayIntoRoot();
        };
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
    function getLayoutModeThumbSvg(mode) {
      const layoutModeApi = window.FurLabLayoutModes || {};
      if (typeof layoutModeApi.getLayoutModeThumbSvg === "function") {
        return layoutModeApi.getLayoutModeThumbSvg(mode);
      }
      return "";
    }
    const layoutTypePickerApi = window.FurLabLayoutTypePicker || {};
    const layoutTypePicker = (typeof layoutTypePickerApi.createLayoutTypePicker === "function")
      ? layoutTypePickerApi.createLayoutTypePicker({
        byId,
        getCatalog: () => getLayoutModeCatalog(),
        getThumbSvg: (mode) => getLayoutModeThumbSvg(mode),
        getPreferredMode: () => {
          const selectedLayout = Array.isArray(state.layouts)
            ? (state.layouts.find((x) => Number(x.id || 0) === Number(state.selectedLayoutId || 0)) || null)
            : null;
          return String((selectedLayout && selectedLayout.mode) || state.layoutMode || "");
        }
      })
      : null;
    function openLayoutTypePicker() {
      if (layoutTypePicker && typeof layoutTypePicker.open === "function") {
        layoutTypePicker.open();
        return;
      }
      byId("layoutTypeBackdrop").style.display = "flex";
    }
    function closeLayoutTypePicker() {
      if (layoutTypePicker && typeof layoutTypePicker.close === "function") {
        layoutTypePicker.close();
        return;
      }
      byId("layoutTypeBackdrop").style.display = "none";
    }
    function addLayoutByMode(mode) {
      saveCurrentManualRuntimeSnapshot();
      const catalog = getLayoutModeCatalog();
      const normalizedMode = String(mode || "").trim();
      const picked = catalog.find((x) => String(x && x.mode || "") === normalizedMode);
      if (!picked) {
        byId("workspaceInfo").textContent = t("mode_pick_error", { mode: normalizedMode || "-" }, `Mode selection error: ${normalizedMode || "-"}`);
        return;
      }
      const id = state.nextLayoutId++;
      const selectedZone = (Array.isArray(state.zones) ? state.zones : []).find((z) => Number(z && z.id || 0) === Number(state.selectedZoneId || 0))
        || ((Array.isArray(state.zones) ? state.zones : [])[0] || null);
      const selectedZoneId = Number(selectedZone && selectedZone.id || 0) || null;
      const selectedDetailId = Number(selectedZone && selectedZone.detailId || state.selectedDetailId || 0) || null;
      const existingDraft = (Array.isArray(state.layouts) ? state.layouts : []).find((x) =>
        x
        && !x.persistedRunId
        && String(x.mode || "") === normalizedMode
        && Number(x.boundZoneId || 0) === Number(selectedZoneId || 0)
        && Number(x.boundDetailId || 0) === Number(selectedDetailId || 0)
      );
      if (existingDraft) {
        state.selectedLayoutId = existingDraft.id;
        applyLayoutMode(existingDraft.mode);
        renderLayoutModeSwitch();
        renderDetailZoneTree();
        renderPropertyEditor();
        byId("workspaceInfo").textContent = "Используем существующий черновик выкладки для выбранной зоны.";
        return existingDraft;
      }
      const entry = {
        id,
        mode: picked.mode,
        name: `${picked.title} ${id}`,
        boundZoneId: selectedZoneId,
        boundDetailId: selectedDetailId
      };
      state.layouts.push(entry);
      state.selectedLayoutId = id;
      applyLayoutMode(entry.mode);
      renderLayoutModeSwitch();
      renderDetailZoneTree();
      renderPropertyEditor();
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
            statusNote: "нет активного",
            selectedPlacementIndex: -1
          }
        }
      };
    }
    function saveCurrentManualRuntimeSnapshot() {
      const current = getSelectedLayoutEntry();
      if (!current || String(current.mode || "") !== "inventory_manual") return;
      ensureManualLayoutBinding(current);
      current.runtimeSnapshot = buildManualLayoutSnapshot();
    }
    function applyManualLayoutSnapshot(snapshot) {
      const snap = snapshot && typeof snapshot === "object" ? snapshot : buildEmptyManualLayoutSnapshot();
      const base = state.layoutRun && typeof state.layoutRun === "object" ? state.layoutRun : {};
      const nextLayoutRunRaw = snap.layoutRun && typeof snap.layoutRun === "object" ? snap.layoutRun : {};
      state.layoutRun = {
        ...base,
        ...nextLayoutRunRaw,
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
      renderPlacementRows(state.layoutRun.placements || []);
      renderSplitEvents(state.layoutRun.splitEvents || []);
      renderInventoryManualPanel();
    }
    async function saveLayoutEntry(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e) return { ok: false, error: "layout_entry_required" };
      if (String(e.mode || "") !== "inventory_manual") return { ok: false, error: "manual_mode_only" };
      const boundZone = ensureManualLayoutBinding(e);
      const payload = {
        id: e.persistedRunId || null,
        name: String(e.name || "Ручная выкладка"),
        mode: "inventory_manual",
        selectedZoneId: Number(boundZone && boundZone.id || state.layoutRun && state.layoutRun.selectedZoneId || state.selectedZoneId || 0) || null,
        snapshot: buildManualLayoutSnapshot()
      };
      const res = await api("/api/layout/manual/runs/save", "POST", payload);
      if (res && res.ok && res.item) {
        e.persistedRunId = String(res.item.id || "");
        e.persistedAt = Number(res.item.updatedAt || Date.now());
        byId("workspaceInfo").textContent = `Выкладка сохранена (${e.name || "-"})`;
        renderDetailZoneTree();
        renderPropertyEditor();
      } else {
        byId("workspaceInfo").textContent = `Ошибка сохранения: ${String(res && res.error || "unknown")}`;
      }
      return res;
    }
    async function openLayoutEntry(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e) return;
      saveCurrentManualRuntimeSnapshot();
      state.selectedLayoutId = e.id;
      applyLayoutMode(e.mode);
      if (String(e.mode || "") === "inventory_manual") {
        const boundZone = ensureManualLayoutBinding(e);
        if (boundZone) {
          state.selectedZoneId = Number(boundZone.id || 0) || null;
          state.selectedDetailId = Number(boundZone.detailId || state.selectedDetailId || 0) || state.selectedDetailId;
          if (state.layoutRun && typeof state.layoutRun === "object") {
            state.layoutRun.selectedZoneId = Number(boundZone.id || 0) || null;
          }
        }
      }
      if (String(e.mode || "") === "inventory_manual" && e.persistedRunId) {
        const res = await api("/api/layout/manual/runs/load", "POST", { id: e.persistedRunId });
        if (res && res.ok && res.item && res.item.snapshot && typeof res.item.snapshot === "object") {
          e.runtimeSnapshot = JSON.parse(JSON.stringify(res.item.snapshot));
          applyManualLayoutSnapshot(e.runtimeSnapshot);
          byId("workspaceInfo").textContent = `Выкладка открыта (${e.name || "-"})`;
        } else {
          byId("workspaceInfo").textContent = `Ошибка открытия: ${String(res && res.error || "unknown")}`;
        }
      } else if (String(e.mode || "") === "inventory_manual") {
        const snapshot = (e.runtimeSnapshot && typeof e.runtimeSnapshot === "object")
          ? e.runtimeSnapshot
          : buildEmptyManualLayoutSnapshot();
        if (!e.runtimeSnapshot) e.runtimeSnapshot = JSON.parse(JSON.stringify(snapshot));
        applyManualLayoutSnapshot(snapshot);
      }
      renderLayoutModeSwitch();
      renderDetailZoneTree();
      renderPropertyEditor();
      renderScene();
    }
    async function deleteLayoutEntry(entry) {
      const e = entry && typeof entry === "object" ? entry : null;
      if (!e) return;
      if (e.persistedRunId) {
        const res = await api("/api/layout/manual/runs/delete", "POST", { id: e.persistedRunId });
        const notFound = String(res && res.error || "") === "not_found";
        if ((!res || !res.ok) && !notFound) {
          byId("workspaceInfo").textContent = `Ошибка удаления: ${String(res && res.error || "unknown")}`;
          return;
        }
        if (notFound) {
          byId("workspaceInfo").textContent = "Сохранённая выкладка уже отсутствовала в хранилище. Удаляем локальную карточку.";
        }
      }
      state.layouts = state.layouts.filter((x) => Number(x.id) !== Number(e.id));
      if (Number(state.selectedLayoutId || 0) === Number(e.id)) {
        const next = state.layouts[0] || null;
        state.selectedLayoutId = next ? next.id : null;
        if (next) applyLayoutMode(next.mode);
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
          mode: "inventory_manual",
          name: String(item && item.name || `Ручная выкладка ${id}`),
          persistedRunId: String(item && item.id || ""),
          persistedAt: Number(item && item.updatedAt || 0) || null,
          boundZoneId: snapZoneId,
          boundDetailId: snapDetailId,
          runtimeSnapshot: snapshot
        });
      }
      if (!state.selectedLayoutId && state.layouts.length > 0) {
        state.selectedLayoutId = state.layouts[0].id;
      }
      return items.length;
    }
    function applyLayoutMode(mode) {
      state.layoutMode = String(mode || "inventory");
      state.layoutRun.fillType = (state.layoutMode === "longitudinal" || state.layoutMode === "transverse" || state.layoutMode === "intarsia")
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
      if (title) title.textContent = state.uiPanel === "layouts" ? "" : "Детали / Зоны";
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
      if (!state.selectedZoneId) {
        const firstZone = Array.isArray(state.zones) ? state.zones[0] : null;
        if (firstZone && Number.isFinite(Number(firstZone.id))) {
          state.selectedZoneId = Number(firstZone.id);
        } else {
          byId("workspaceInfo").textContent = "Сначала выберите зону.";
          return;
        }
      }
          byId("invDebugInfo").textContent = t("manual_mode_active", null, "Manual mode is active");
          byId("invUsedTags").textContent = `(${t("no_data", null, "none")})`;
      renderPlacementRows([]);
      renderSplitEvents([]);
      byId("fillType").value = isInventoryLikeLayoutMode(state.layoutMode)
        ? "voronoi"
        : (state.layoutRun.fillType || "voronoi");
      byId("inventoryScenario").value = "A";
      if (byId("invAllowanceMm")) {
        byId("invAllowanceMm").value = Number(parseLocaleNumber(state.layoutRun && state.layoutRun.allowanceMm, 12)).toFixed(1);
      }
      intarsiaStepPhase = 1;
      syncFillTypeUi();
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
      setInventoryProgressStatus("Ожидание телеметрии...");
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
      setInventoryProgressStatus("Ожидание телеметрии...");
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

    async function runInventoryPickFlow(options = {}) {
      const intarsiaAssignOnly = !!(options && options.intarsiaAssignOnly);
      const runSeq = ++inventoryRunSeq;
      const isStaleRun = () => runSeq !== inventoryRunSeq;
      const intarsiaStart = state.layoutMode === "intarsia" && !intarsiaAssignOnly;
      if (!intarsiaStart) closeInventoryStep1();
      resetInventoryProgressMonotonic();
      setInventoryProgress(0, t("progress_prepare", null, "Подготовка расчета"), { allowDecrease: true });
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
              const title = String(msg.phase || "Подготовка");
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
          napToleranceDeg: Number(byId("invNapTol").value || 15),
          // Coverage-first mode: for scenario A fetch a much wider pool.
          maxCandidates: Number(byId("invLimit").value || 300)
        };
        const candidatesRes = await api("/api/inventory/candidates", "POST", {
          ...common,
          onlyAvailable: true,
          includeScrapContour: true
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
          state.layoutRun.placements = [];
          state.layoutRun.topChoicesByFragment = {};
          state.layoutRun.selectedPlacementFragmentId = null;
          state.layoutRun.candidatePool = prerankedCandidates;
          state.layoutRun.lastFilters = { materialId: "", allowedStatuses: [] };
          state.layoutRun.lastConstraints = {
            napDirectionDeg: zoneNapDirectionDeg,
            napToleranceDeg: Number(byId("invNapTol").value || 15),
            napPolicy: "normal",
            napWeight: 1.0,
            allowFlip180: false,
            minAlongMm: null,
            maxAlongMm: null,
            minAcrossMm: null,
            maxAcrossMm: null,
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
            statusNote: "нет активного",
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
          renderPlacementRows([]);
          renderSplitEvents([]);
          renderInventoryManualPanel();
          openInventoryStep2();
          if (isStaleRun()) return;
          setInventoryProgress(100, "Ручной режим / готово");
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
        const constraints = {
          napDirectionDeg: zoneNapDirectionDeg,
          napToleranceDeg: Number(byId("invNapTol").value || 15),
          napPolicy: "normal",
          napWeight: 1.0,
          allowFlip180: false,
          minAlongMm: null,
          maxAlongMm: null,
          minAcrossMm: null,
          maxAcrossMm: null,
          minAreaMm2: Number(byId("invMinArea").value || 0),
          maxAreaMm2: null,
          minCoverageRatio: 0.75,
          minFitScore: 68,
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
          : (isAssignOnlyScenario ? 120000 : 30000);
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
          minGainVisibleMm2: useDirectInventoryScenarioA ? Number(opt.minGainVisibleMm2 || 1200) : undefined,
          minSpanMm: useDirectInventoryScenarioA ? Number(opt.minSpanMm || 60) : undefined,
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
        byId("workspaceInfo").textContent = `Кандидаты: ${Number(candidatesRes.matchedCandidates || 0)}, фрагменты: ${state.layoutRun.fragments.length}, seed=${state.layoutRun.lastSeed}`;
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
        byId("workspaceInfo").textContent = `Ошибка подбора: ${msg}`;
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
        setInventoryProgressStatus(`Ошибка: ${msg}`);
          byId("invUsedTags").textContent = `(${t("no_data", null, "none")})`;
        byId("invDebugInfo").textContent = `Ошибка: ${msg}`;
        const applyBtn = byId("inventoryStep2ApplyBtn");
        if (applyBtn) {
          applyBtn.disabled = true;
          applyBtn.title = "Нельзя применить из-за ошибки подбора";
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
        fragLabel.textContent = manualBeforeApply
          ? t("layer_working_areas_label", null, "Рабочие области")
          : t("layer_fragments_label", null, "Фрагменты");
      }
      if (pieceLabel) pieceLabel.textContent = `${t("layer_pieces_label", null, "Подобранные куски")} (${matchedPiecesCount})`;
      if (pieceToggle) {
        pieceToggle.title = matchedPiecesCount > 0
          ? ""
          : t("layer_no_matched_pieces", null, "В текущем результате нет подобранных кусков");
      }
    }

    function renderScene() {
      layerGuides.destroyChildren(); layerPattern.destroyChildren(); layerFragments.destroyChildren(); layerVisibleArea.destroyChildren(); layerPreview.destroyChildren(); layerZones.destroyChildren(); layerSelection.destroyChildren();
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
      // This prevents accidental tree reset to "Нет деталей" on transient renders.
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
          byId.set(did, { id: did, name: `Деталь ${did}`, bbox: null, area: 0, points: 0, entity: null });
        }
        state.details = Array.from(byId.values()).sort((a, b) => a.id - b.id);
        if (!state.details.some((d) => d.id === state.selectedDetailId)) {
          state.selectedDetailId = state.details.length ? state.details[0].id : null;
        }
      }
      renderDetailZoneTree();
      renderPropertyEditor();
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
            stroke: ENGINEERING_STYLES.selection.stroke,
            strokeWidth: ENGINEERING_STYLES.selection.strokeWidth,
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
      const hasActiveLayoutOnZone = !!(state.layoutRun.active && activeLayoutZoneId > 0);
      let deferredManualSeamSegments = [];

      if (hasActiveLayoutOnZone) {
        let selectedFragObj = null;
        const manual = state.layoutRun && state.layoutRun.manual ? state.layoutRun.manual : null;
        const manualBeforeApply = isManualInventoryMode() && String(state.layoutRun && state.layoutRun.status || "") !== "applied";
        const selectedPlacementIndex = Number(manual && manual.selectedPlacementIndex);
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
          let coreContours = toContours(pl.alignedCoreContour, pl.alignedCoreContours);
          if (!coreContours.length) {
            coreContours = toContours(pl.inZoneCoreContour, pl.inZoneCoreContours);
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
            for (const contour of contours) {
              layerPreview.add(new Konva.Line({
                points: linePoints(contour),
                stroke: isSelPlacement ? ENGINEERING_STYLES.inventoryContours.selectedStroke : ENGINEERING_STYLES.inventoryContours.stroke,
                strokeWidth: isSelPlacement ? ENGINEERING_STYLES.inventoryContours.selectedStrokeWidth : ENGINEERING_STYLES.inventoryContours.strokeWidth,
                fill: isSelPlacement ? ENGINEERING_STYLES.inventoryContours.selectedFill : ENGINEERING_STYLES.inventoryContours.fill,
                closed: true
              }));
            }
          }
          if (showAssignedPieces && state.layers.usedGain && usedVisibleContours.length) {
            for (const usedVisibleContour of usedVisibleContours) {
              layerPreview.add(new Konva.Line({
                points: linePoints(usedVisibleContour),
                stroke: ENGINEERING_STYLES.usedPart.stroke,
                strokeWidth: isSelPlacement ? ENGINEERING_STYLES.usedPart.selectedStrokeWidth : ENGINEERING_STYLES.usedPart.strokeWidth,
                fill: ENGINEERING_STYLES.usedPart.fill,
                closed: true
              }));
            }
          }
          if (showAssignedPieces && state.layers.pcoreZ && coreContours.length) {
            for (const coreContour of coreContours) {
              layerPreview.add(new Konva.Line({
                points: linePoints(coreContour),
                stroke: ENGINEERING_STYLES.allowances.stroke,
                strokeWidth: ENGINEERING_STYLES.allowances.strokeWidth,
                fill: ENGINEERING_STYLES.allowances.fill,
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
          const manualMode = isManualInventoryMode();
          if (manualMode) {
            const seamSegments = state.layoutRun && state.layoutRun.previewLayers && Array.isArray(state.layoutRun.previewLayers.seams)
              ? state.layoutRun.previewLayers.seams
              : [];
            deferredManualSeamSegments = Array.isArray(seamSegments) ? seamSegments : [];
          } else if (!isManualInventoryMode()) {
            const pc = (typeof window !== "undefined" && window.polygonClipping) ? window.polygonClipping : null;
            if (pc && typeof pc.union === "function" && typeof pc.difference === "function") {
              const items = matchedPlacements
                .map((pl) => {
                  const coreMp = extractCoreMultiFromPlacement(pl);
                  const areaCore = Math.max(0, Number(pl && pl.inZoneCoreAreaMm2 || 0));
                  return {
                    placementIndex: Number(pl && pl.__placementIndex || 0),
                    coreMp,
                    areaCore
                  };
                })
                .filter((x) => Array.isArray(x.coreMp) && x.coreMp.length > 0);

              const layerPolicy = String(
                (state.layoutRun && state.layoutRun.paramsSnapshot && state.layoutRun.paramsSnapshot.options && state.layoutRun.paramsSnapshot.options.layerPolicy) ||
                "first_on_top"
              ).toLowerCase();

              items.sort((a, b) => {
                if (layerPolicy === "first_on_top") {
                  return a.placementIndex - b.placementIndex;
                }
                if (Math.abs(Number(b.areaCore || 0) - Number(a.areaCore || 0)) > 1e-6) {
                  return Number(b.areaCore || 0) - Number(a.areaCore || 0);
                }
                return a.placementIndex - b.placementIndex;
              });

              let coveredAbove = [];
              for (const item of items) {
                let visibleMp = [];
                try {
                  visibleMp = Array.isArray(coveredAbove) && coveredAbove.length
                    ? (pc.difference(item.coreMp, coveredAbove) || [])
                    : item.coreMp;
                } catch (_) {
                  visibleMp = item.coreMp;
                }
                const polys = fromBooleanMultiOuter(visibleMp);
                for (const poly of polys) {
                  const pts = (Array.isArray(poly) ? poly : [])
                    .map((q) => ({ x: Number(q && q.x), y: Number(q && q.y) }))
                    .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
                  if (pts.length < 3) continue;
                  layerPreview.add(new Konva.Line({
                    points: linePoints(pts),
                    stroke: ENGINEERING_STYLES.seams.stroke,
                    strokeWidth: ENGINEERING_STYLES.seams.strokeWidth,
                    dash: ENGINEERING_STYLES.seams.dash,
                    fill: "rgba(0,0,0,0)",
                    closed: true
                  }));
                }
                try {
                  coveredAbove = Array.isArray(coveredAbove) && coveredAbove.length
                    ? (pc.union(coveredAbove, item.coreMp) || coveredAbove)
                    : item.coreMp;
                } catch (_) {}
              }
            }
          }
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
              text: String(ap.inventoryTag || "ручной кусок"),
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
        const suppressFragmentsDuringManualDrag =
          isManualInventoryMode() &&
          String(state.drag && state.drag.mode || "") === "manual-placement-move";
        if (state.layers.pieceBorders && !suppressFragmentsDuringManualDrag) {
          for (const frag of fragmentsList) {
            if (!Array.isArray(frag.points) || frag.points.length < 3) continue;
            const fragId = Number(frag.id || 0);
            const isSelectedFrag = selectedFragmentIdNum !== null && fragId === selectedFragmentIdNum;
            layerFragments.add(new Konva.Line({
              points: linePoints(frag.points),
              stroke: ENGINEERING_STYLES.fragments.stroke,
              strokeWidth: isSelectedFrag ? ENGINEERING_STYLES.fragments.selectedStrokeWidth : ENGINEERING_STYLES.fragments.strokeWidth,
              fill: isSelectedFrag ? ENGINEERING_STYLES.fragments.selectedFill : ENGINEERING_STYLES.fragments.fill,
              closed: true
            }));
          }
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
            layerFragments.add(new Konva.Line({
              points: linePoints(overlay),
              stroke: ENGINEERING_STYLES.fragmentOverlay.stroke,
              strokeWidth: ENGINEERING_STYLES.fragmentOverlay.strokeWidth,
              dash: ENGINEERING_STYLES.fragmentOverlay.dash,
              fill: ENGINEERING_STYLES.fragmentOverlay.fill,
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
        for (const z of state.zones) {
          const selected = Number(z && z.id) === Number(state.selectedZoneId);
          layerZones.add(new Konva.Line({
            points: linePoints(z.points),
            stroke: ENGINEERING_STYLES.zones.stroke,
            fill: "rgba(0,0,0,0)",
            strokeWidth: selected ? ENGINEERING_STYLES.zones.selectedStrokeWidth : ENGINEERING_STYLES.zones.strokeWidth,
            closed: true
          }));
          if (Array.isArray(z.points) && z.points.length >= 3) {
            const c = centroid(z.points);
            drawNapArrow(layerZones, c, getZoneNapDirectionDeg(z), selected ? 34 : 24);
          }
        }
      }

      let renderedManualSeams = 0;
      if (state.layers.visibleCore && isManualInventoryMode() && Array.isArray(deferredManualSeamSegments) && deferredManualSeamSegments.length) {
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

      if (state.layers.selection) {
        const z = state.zones.find((x) => x.id === state.selectedZoneId);
        if (z) {
          for (const p of z.points) {
            const s = worldToScreen(p);
            layerSelection.add(new Konva.Circle({ x: s.x, y: s.y, radius: 3, fill: ENGINEERING_STYLES.selection.pointFill }));
          }
        }
        for (const p of state.draftZone) {
          const s = worldToScreen(p);
          layerSelection.add(new Konva.Circle({ x: s.x, y: s.y, radius: 3, fill: "#000000" }));
        }
      }

      layerGuides.draw(); layerPattern.draw(); layerFragments.draw(); layerVisibleArea.draw(); layerPreview.draw(); layerZones.draw(); layerSelection.draw();
      updateReportsButtonState();

      const workspaceInfo = byId("workspaceInfo");
      if (workspaceInfo) workspaceInfo.textContent = "";
    }

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
        fitPatternToView();
        renderScene();
        initZonesFromDetails();
        renderScene();
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

    byId("toolSelect").onchange = (e) => { state.tool = String(e.target.value || "select"); renderScene(); };
    const toolbarActions = document.querySelector(".toolbar-actions");
    if (toolbarActions) {
      const closeToolbarActions = () => toolbarActions.removeAttribute("open");
      document.addEventListener("click", (e) => {
        if (!toolbarActions.open) return;
        if (!toolbarActions.contains(e.target)) closeToolbarActions();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && toolbarActions.open) closeToolbarActions();
      });
      const actionsMenu = toolbarActions.querySelector(".toolbar-actions-menu");
      if (actionsMenu) {
        actionsMenu.addEventListener("click", (e) => {
          const target = e.target;
          if (target && target.tagName === "BUTTON") closeToolbarActions();
        });
      }
    }
    byId("finishZoneBtn").onclick = () => {
      if (state.draftZone.length < 3) return;
      const zoneId = state.nextZoneId++;
      const zone = {
        id: zoneId,
        name: `Зона ${zoneId}`,
        detailId: state.selectedDetailId || null,
        napDirectionDeg: DEFAULT_NAP_DIRECTION_DEG,
        points: state.draftZone.map((p) => ({ ...p }))
      };
      const cmd = { type: "create-zone", zone };
      executeCommand(cmd); pushCommand(cmd); state.draftZone = []; renderScene();
    };
    byId("cancelZoneBtn").onclick = () => { state.draftZone = []; renderScene(); };
    byId("undoBtn").onclick = () => undo();
    byId("redoBtn").onclick = () => redo();
    byId("closeSelectedGapBtn").onclick = () => closeSelectedGapConservative();

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

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const reportsBackdrop = byId("reportsBackdrop");
        if (reportsBackdrop && reportsBackdrop.style.display === "flex") {
          closeReportsModal();
          return;
        }
      }
      const target = e.target;
      const tag = target && target.tagName ? String(target.tagName).toUpperCase() : "";
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!(target && target.isContentEditable);

      if (isManualInventoryMode() && !isTyping) {
        const ctrlOrMeta = !!(e.ctrlKey || e.metaKey);
        if (ctrlOrMeta && String(e.key || "").toLowerCase() === "z") {
          e.preventDefault();
          void undoInventoryManualPlacement();
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
            removeInventoryManualPlacementByIndex(selIdx, "кусок удален");
            return;
          }
        }
      }

      if (e.code === "Space") {
        state.keys.space = true;
        if (!state.drag.isDown || state.drag.mode !== "pan") setWorkspaceCursor("grab");
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        state.keys.space = false;
        if (!state.drag.isDown || state.drag.mode !== "pan") setWorkspaceCursor("");
      }
    });
    window.addEventListener("blur", () => {
      state.keys.space = false;
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
        pushCommand: (cmd) => pushCommand(cmd),
        recomputeInventoryManualVisibility: () => requestManualRecomputeFromUi(),
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
    void loadSavedManualRuns()
      .then((count) => {
        if (count > 0) {
          renderLayoutModeSwitch();
          renderDetailZoneTree();
          renderPropertyEditor();
          renderScene();
        }
      })
      .catch(() => {});
