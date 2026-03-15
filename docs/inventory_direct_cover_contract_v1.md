# Inventory Direct Cover Contract v1.1 (Aligned Decisions)

## 1. Scope
- This contract defines behavior of `Inventory Direct Cover` mode for automatic zone coverage by inventory pieces.
- Units are millimeters (`mm`) and square millimeters (`mm2`) everywhere.
- Contract language:
  - `MUST` = mandatory.
  - `SHOULD` = recommended.
  - `MAY` = optional.

## 2. Goal
- Primary business goal: cover zone `Z` to full-coverage acceptance.
- Secondary goals: minimize number of pieces, improve utilization, reduce useless overlap/outside, avoid micro-fragmented residual.

## 2.1 Zone normalization (`seamAllowanceReserveMm`)
- Input `seamAllowanceReserveMm` defines zone preprocessing before solve.
- Effective zone used in all formulas is `Zeff` (`MUST`):
  - if `seamAllowanceReserveMm > 0`: inward offset of source zone by this value;
  - if `seamAllowanceReserveMm = 0` or `null`: `Zeff = Zsource`;
  - negative reserve is invalid unless explicitly allowed by endpoint contract.
- In this document, `Z` means `Zeff`.

## 3. Terms and formulas
- `Z`: zone polygon.
- `P`: transformed piece polygon (rotation + translation, no mirror).
- `Pz = intersection(P, Z)`: in-zone part of piece.
- `R`: residual (uncovered) area, initialized as `R := Z`.
- `gain(P) = area(intersection(Pz, R))`.
- `overlap(P) = area(Pz) - gain(P)`.
- `outside(P) = area(P) - area(Pz)`.
- `util(P) = gain(P) / max(eps, area(P))`.
- `insideRatio(P) = area(Pz) / max(eps, area(P))`.
- Placement metric mapping:
  - `inZoneAreaMm2 = area(Pz)`.
  - `gainAreaMm2 = gain(P)`.
  - `overlapAreaMm2 = overlap(P)`.
  - `outsideAreaMm2 = outside(P)`.
- Geometry model (`MUST`):
  - `Z`, `R`, `Pz` MAY be `Polygon` or `MultiPolygon`, with holes.
  - `components(R)` counts only outer components (holes are not separate components).
  - component-level area/span metrics are computed on each outer component ring.

## 4. Data contract
### 4.1 Input
- Zone:
```json
{
  "zoneId": "string|number",
  "zonePoints": [{"x": 0, "y": 0}],
  "seamAllowanceReserveMm": 0
}
```
- Candidates:
```json
[
  {
    "id": "string|number",
    "inventoryTag": "string",
    "materialId": "string|null",
    "scrapStatus": "string|null",
    "scrapContour": "{\"units\":\"mm\",\"path\":[{\"x\":0,\"y\":0}]}",
    "areaMm2": 0,
    "bboxWidthMm": 0,
    "bboxHeightMm": 0
  }
]
```
- Constraints/limits:
```json
{
  "filters": {
    "materialId": "string|null",
    "allowedStatuses": ["string"],
    "requireScrapContour": true
  },
  "limits": {
    "maxPieces": 0,
    "minPieces": 0,
    "maxSolveMs": 0,
    "hardMaxSolveMs": 0
  },
  "options": {
    "strictCoverage": true,
    "coverageTarget": 0.998,
    "coverageEps": 0.002,
    "rasterMm": 2,
    "epsMm2": null
  },
  "seed": 0
}
```
- Time-limit rules (`MUST`):
  - `hardMaxSolveMs >= maxSolveMs`.
  - on `maxSolveMs` exceed: stop exploring new steps and return current `best-so-far`.
  - on `hardMaxSolveMs` exceed: hard stop and return current `best-so-far`.

### 4.2 Output
```json
{
  "ok": true,
  "fullCoverageOk": true,
  "coveredRatio": 0.0,
  "coveragePercent": 0.0,
  "residualAreaMm2": 0.0,
  "placements": [
    {
      "scrapPieceId": "string",
      "inventoryTag": "string",
      "alignedContour": [{"x": 0, "y": 0}],
      "inZoneAreaMm2": 0.0,
      "gainAreaMm2": 0.0,
      "overlapAreaMm2": 0.0,
      "outsideAreaMm2": 0.0,
      "utilization": 0.0,
      "insideRatio": 0.0,
      "score": 0.0,
      "phase": "A|B|C",
      "solveOrder": 1,
      "renderIndex": 1
    }
  ],
  "summary": {
    "piecesCount": 0,
    "selectedPiecesAreaMm2": 0.0,
    "selectedPiecesInZoneAreaMm2": 0.0,
    "selectedPiecesAreaBasis": "piece",
    "overlapAreaMm2": 0.0,
    "utilizationPct": 0.0
  },
  "algorithmTrace": {
    "version": "string",
    "steps": {
      "candidate_pool": {"input": 0, "compatible": 0, "templates": 0},
      "search": {"evaluated": 0, "placed": 0, "rejected": {"degenerate": 0, "lowGain": 0, "other": 0}},
      "post_opt": {"removeOneApplied": false, "removed": 0}
    }
  }
}
```
- Compatibility note (`MUST`):
  - this schema is behavioral contract, not a forced breaking response shape;
  - current public response remains as-is;
  - new fields are added only as optional additive blocks (for example under `placements[].placementMeta`, `algorithmTrace`, `debug`).

## 5. Mandatory invariants
- Clipping invariant (`MUST`): only `Pz` contributes to coverage.
- Residual update (`MUST`): `R := R \\ Pz` after each accepted placement.
- Overlap/outside policy (`MUST`): treated as cost/penalty, not hard-reject in normal flow.
- Determinism (`MUST`): same inputs + same `seed` => same result.
- Deterministic traversal (`MUST`):
  - candidates are stably sorted by `candidateKey` before search,
  - anchors are stably sorted (primary: distance, tie-break: x then y),
  - any randomized subsampling depends only on `seed`.
- Single-use piece invariant (`MUST`):
  - `candidateKey := id ?? inventoryTag`,
  - each `candidateKey` can be selected at most once per solve,
  - solver MUST NOT select two different candidates with the same `inventoryTag`.
- Split/return policy (`MUST`): splitting one physical piece into several placements is outside this contract and belongs to a separate mode.
- Coverage-vs-visual invariant (`MUST`):
  - coverage metrics are computed via Residual/union coverage (order-independent for covered area),
  - UI visible stacking (`visibleContours`) is post-factum rendering logic and MUST NOT affect coverage acceptance unless explicit `visible-coverage` mode is declared,
  - `solveOrder` is the placement acceptance order used by solver math,
  - `renderOrder` MAY differ for UX (for example phase/size-based visibility),
  - if UI computes `visibleContours`, placement order used for rendering MUST be explicit and deterministic,
  - if a separate top-layer visibility model is used, it MUST be controlled by explicit `stackOrderPolicy`,
  - `stackOrderPolicy` is a dedicated UI rule and MUST NOT be assumed equal to `renderIndex` by default.

## 6. Full-coverage acceptance rule
- Zone area convention (`MUST`):
  - `zoneAreaMm2 := area(Z)` where `Z` is the effective zone after `seamAllowanceReserveMm` preprocessing.
- Contracted rule (`MUST`):
  - `fullCoverageOk := coveredRatio >= (1 - coverageEps)`.
  - Optional absolute criterion MAY be used in parallel:
    - `residualAreaMm2 <= epsMm2`.
- Default tolerances:
  - `coverageEps = 0.002` (0.2%).
  - `epsMm2 = max(zoneAreaMm2 * coverageEps, rasterMm^2)`.
- `coverageTarget` coupling rule (`MUST`):
  - default `coverageTarget = 1 - coverageEps`,
  - if both are provided, solver stop condition uses `max(coverageTarget, 1 - coverageEps)`,
  - acceptance remains defined by `fullCoverageOk` rule above.
- Interpretation note: strict mathematical `coveredRatio == 1.0` is not required due to clipping/discretization/numeric geometry tails.

## 7. Optimization objective (lexicographic)
- Compare solutions by priority:
1. maximize `coveredRatio`;
2. minimize piece count `N`;
3. maximize `utilizationPct`;
4. minimize `overlapAreaMm2`;
5. minimize `selectedPiecesAreaMm2`.
- Note (`MUST`): step-level `score` is an internal heuristic ranker; final best plan at timeout/limits MUST follow lexicographic comparison from this section.
- Deterministic tie-break (`MUST`) when all priorities above are equal:
1. minimize `selectedPiecesAreaMm2`;
2. minimize `overlapAreaMm2`;
3. choose lexicographically smallest ordered `candidateKey` sequence.

## 7.1 Metric basis (fixed)
- `selectedPiecesAreaMm2 := sum(area(P))` (physical material consumed).
- `selectedPiecesInZoneAreaMm2 := sum(area(Pz))` (in-zone selected area).
- `utilizationPct := 100 * (zoneAreaMm2 - residualAreaMm2) / max(eps, selectedPiecesAreaMm2)`.

## 8. Strategy: pocket-first multi-pass
- Solver MUST provide phase-equivalent behavior:
  - Pass A: large pieces for largest residual pockets, high `insideRatio`.
  - Pass B: medium pieces for medium pockets, avoid unnecessary splitting.
  - Pass C: tail completion for small pockets with anti-oversize control.
- Implementation is flexible:
  - one dynamic engine or separate pass functions are both acceptable,
  - but each accepted placement MUST be logged with `phase: A|B|C`,
  - and phase profiles MUST have materially different thresholds/weights.
- Pocket target selection (`MUST`):
  - process residual components largest-first;
  - use deep point (pole of inaccessibility) for anchor priority.
- Phase boundary defaults (`SHOULD`, required unless overridden):
  - size classes by candidate area quantiles:
    - Pass A candidates: top 20% area,
    - Pass B candidates: middle 60% area,
    - Pass C candidates: bottom 20% area.
  - equivalent pocket-relative rule MAY be used if it produces comparable behavior and is documented.
- Anti-fragmentation requirement (`MUST`):
  - Pass A must prefer placements that maximize gain and avoid increasing residual fragmentation.
  - UX intent (`MUST`): avoid splitting into many small pieces where one/few larger pieces can cover the same pocket.
  - Residual quality terms:
    - `components(R)` = count of outer rings (polygon components) in residual multipolygon.
    - `maxSpan` = max pairwise distance between points of a residual component outer ring.
    - `micro-pocket` = residual component where `area < minPocketAreaMm2` OR `maxSpan < minPocketSpanMm`.
  - Default thresholds (`SHOULD`):
    - `minPocketSpanMm = 80`,
    - `minPocketAreaMm2 = max(8000, 0.25 * minPocketSpanMm * minPocketSpanMm)`.
  - Implementation must include at least one explicit residual-quality penalty:
    - increase of `components(R)`, or
    - creation/growth of micro-pockets.
  - This penalty is mandatory in Pass A and recommended in Pass B.
- Anti-small physical gate (`SHOULD`):
  - solver should reject or strongly penalize placements that create practically unusable tiny residual islands;
  - default guard values:
    - `minUsableResidualSpanMm = minPocketSpanMm`,
    - `minUsableResidualAreaMm2 = minPocketAreaMm2`.

## 9. Anchors and search space
- `MUST` include anchors from:
  - residual boundary (corners/edge centers/feature points),
  - deep point of current largest pocket,
  - coarse zone grid (cell centers) for obvious large placements.
- `MUST` support candidate rotations allowed by constraints.

## 10. Reject rules
- Allowed hard rejects (`MUST`):
  - degenerate geometry,
  - below phase min-gain threshold,
  - tail anti-oversize (Pass C only, see strict exception below).
- Forbidden hard rejects (`MUST NOT`):
  - normal rejection purely by overlap/outside when geometry is valid.

## 10.1 Tail oversize conflict policy (strict vs non-strict)
- Strict mode (`MUST`):
  - first try to complete without oversize (anti-oversize active as hard gate or very strong penalty);
  - last-chance oversize MAY be enabled only when `fullCoverageOk=false`, residual is small, search is stagnating or time budget is near limit, and no reasonable alternatives exist;
  - last-chance means removing hard reject only; overlap/outside penalties remain active in scoring.
  - this path MUST be logged as `tail_last_chance_used=true`.
- Non-strict mode (`MUST`):
  - tail oversize remains forbidden (or practically unreachable by scoring);
  - partial coverage is acceptable outcome.
- Default activation thresholds (`SHOULD`, required unless overridden):
  - residual small: `residualAreaMm2 <= max(4 * epsMm2, 0.01 * zoneAreaMm2)`;
  - stagnation: no accepted placement for `>= 8` iterations (or equivalent no-progress metric);
  - near timeout: `timeLeftMs <= max(2000, 0.1 * hardMaxSolveMs)`.

## 11. Scoring model
- Unified score with phase weights:
`score = +wGain*gain + wUtil*util + wInside*insideRatio - wOverlap*overlap - wOutside*outside - wPieceCount - wTailOversize*max(0, area(P)-K*gain) + wPocketCenter*proximityBonus`.
- Phase-specific weighting:
  - Pass A: high `wInside`, strong pocket-center bonus.
  - Pass C: high `wOverlap`, active tail anti-oversize.
- Lexicographic consistency (`MUST`):
  - solver MUST track `best-so-far` plan by lexicographic order from section 7,
  - on timeout/iteration limit solver MUST return `best-so-far`, not the last transient state.

## 12. Post-optimization
- After `fullCoverageOk=true`, run `remove-one` (`MUST`):
  - remove each piece if full coverage remains valid.
- Optional (`MAY`): local replacement `2-3 -> 1` if it preserves coverage and improves objective.

## 13. Observability
- `MUST` log for every accepted placement:
  - `gain/overlap/outside/util/insideRatio/score/phase`.
- `MUST` expose aggregate rejected counters by reason.

## 13.1 API compatibility policy
- Current public API MUST remain backward-compatible.
- Existing fields MUST be preserved.
- New metrics/diagnostics MUST be additive optional fields (for example `placementMeta`, `algorithmTrace`, `debug`).
- If a clean schema is needed later, it SHOULD be introduced via versioned endpoint (for example `/v2/...`) without breaking current clients.

## 13.1.1 Default render policy (`SHOULD`)
- To keep large coverage visually readable in UI, default render policy should prioritize earlier broad-cover pieces:
  - recommended default: render Pass A above Pass B above Pass C, with stable tie-break by `solveOrder`;
  - alternative policies are allowed as UI options if explicitly labeled.
- Output should include render policy metadata (for example `renderOrderPolicy`) and/or per-placement `renderIndex`.

## 13.2 Public mode policy
- Publicly exposed mode is one: `Inventory Direct Cover`.
- Internal solver backends MAY differ, but MUST conform to this contract and provide comparable outcomes.
- Backend selection is implementation detail and MUST NOT change external contract semantics.

## 14. Acceptance criteria (test level)
- AC-1: for strict feasible cases, `fullCoverageOk=true`.
- AC-2: early Pass A decisions show large-piece dominance by logged `gain` and `insideRatio`.
- AC-3: tail anti-oversize prevents giant-piece picks for tiny pockets when alternatives exist.
- AC-4: deterministic replay with same `seed` returns identical placements and metrics.

## 15. Open decisions
- None in v1.1 (all discussed decisions are fixed in this document).
