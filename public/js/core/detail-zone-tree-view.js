(function registerFurLabDetailZoneTreeView(globalObj) {
  const root = globalObj || (typeof window !== "undefined" ? window : globalThis);

  function createDetailZoneTreeView(deps) {
    const byId = deps && deps.byId;
    const state = deps && deps.state;
    const openLayoutTypePicker = deps && deps.openLayoutTypePicker;
    const applyLayoutMode = deps && deps.applyLayoutMode;
    const renderLayoutModeSwitch = deps && deps.renderLayoutModeSwitch;
    const renderPropertyEditor = deps && deps.renderPropertyEditor;
    const renderScene = deps && deps.renderScene;
    const fitBBoxToView = deps && deps.fitBBoxToView;
    const contourThumbSvg = deps && deps.contourThumbSvg;
    const fitPointsToView = deps && deps.fitPointsToView;
    const findPlacementForFragment = deps && deps.findPlacementForFragment;

    function renderDetailZoneTree() {
      const treeRoot = byId("detailZoneTree");
      if (!treeRoot) return;
      treeRoot.innerHTML = "";
      if (state.uiPanel === "layouts") {
        const addWrap = document.createElement("div");
        addWrap.className = "row";
        addWrap.style.marginBottom = "8px";
        const addBtn = document.createElement("button");
        addBtn.textContent = "+ Добавить выкладку";
        addBtn.addEventListener("click", () => {
          openLayoutTypePicker();
        });
        addWrap.appendChild(addBtn);
        treeRoot.appendChild(addWrap);

        if (!state.layouts.length) {
          const empty = document.createElement("div");
          empty.className = "tree-empty";
          empty.textContent = "Пока нет выкладок. Нажмите '+ Добавить выкладку'.";
          treeRoot.appendChild(empty);
          return;
        }

        for (const entry of state.layouts) {
          const card = document.createElement("div");
          card.className = "tree-detail";
          card.style.padding = "8px";

          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.gap = "8px";

          const openBtn = document.createElement("button");
          openBtn.style.flex = "1";
          openBtn.style.textAlign = "left";
          openBtn.textContent = entry.name || `(Без названия ${entry.id})`;
          if (Number(state.selectedLayoutId || 0) === Number(entry.id)) {
            openBtn.style.background = "#e0e0e0";
            openBtn.style.fontWeight = "600";
          }
          openBtn.addEventListener("click", () => {
            state.selectedLayoutId = entry.id;
            applyLayoutMode(entry.mode);
            const zone = state.zones.find((z) => Number(z.id || 0) === Number(state.selectedZoneId || 0));
            if (zone) {
              state.selectedDetailId = Number(zone.detailId || 0) || state.selectedDetailId;
            }
            renderLayoutModeSwitch();
            renderDetailZoneTree();
            renderPropertyEditor();
            renderScene();
          });

          const delBtn = document.createElement("button");
          delBtn.textContent = "x";
          delBtn.title = "Удалить выкладку";
          delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            state.layouts = state.layouts.filter((x) => Number(x.id) !== Number(entry.id));
            if (Number(state.selectedLayoutId || 0) === Number(entry.id)) {
              const next = state.layouts[0] || null;
              state.selectedLayoutId = next ? next.id : null;
              if (next) applyLayoutMode(next.mode);
            }
            renderLayoutModeSwitch();
            renderDetailZoneTree();
            renderPropertyEditor();
          });

          row.appendChild(openBtn);
          row.appendChild(delBtn);
          card.appendChild(row);

          treeRoot.appendChild(card);
        }
        return;
      }
      if (!Array.isArray(state.details) || state.details.length === 0) {
        const empty = document.createElement("div");
        empty.className = "tree-empty";
        empty.textContent = "Нет деталей";
        treeRoot.appendChild(empty);
        return;
      }

      for (const d of state.details) {
        const detailBox = document.createElement("div");
        detailBox.className = "tree-detail";
        const detailHead = document.createElement("div");
        detailHead.className = "tree-detail-head" + (state.selectedDetailId === d.id ? " active" : "");
        const detailName = document.createElement("span");
        detailName.className = "tree-detail-title";
        detailName.textContent = `Деталь ${d.id}`;
        detailHead.appendChild(detailName);
        detailHead.addEventListener("click", () => {
          state.selectedDetailId = d.id;
          fitBBoxToView(d.bbox);
          renderScene();
        });

        const zonesWrap = document.createElement("div");
        zonesWrap.className = "tree-zones";
        const zones = state.zones
          .filter((z) => Number(z.detailId || 0) === Number(d.id));
        if (zones.length === 0) {
          const zEmpty = document.createElement("div");
          zEmpty.className = "tree-empty";
          zEmpty.textContent = "зон нет";
          zonesWrap.appendChild(zEmpty);
        } else {
          for (const z of zones) {
            const zi = document.createElement("div");
            zi.className = "tree-zone" + (state.selectedZoneId === z.id ? " active" : "");
            const zrow = document.createElement("div");
            zrow.className = "zone-row";
            const zthumb = document.createElement("div");
            zthumb.className = "zone-thumb";
            zthumb.innerHTML = contourThumbSvg(z.points || [], true);
            const zname = document.createElement("div");
            zname.textContent = z.name || `Зона ${z.id}`;
            zrow.appendChild(zthumb);
            zrow.appendChild(zname);
            zi.appendChild(zrow);
            zi.addEventListener("click", (e) => {
              e.stopPropagation();
              state.selectedZoneId = z.id;
              state.selectedFragmentId = null;
              state.selectedDetailId = Number(z.detailId || d.id);
              fitPointsToView(z.points);
              renderScene();
            });
            zonesWrap.appendChild(zi);

            const zoneHasLayout = state.layoutRun.active && Number(state.layoutRun.selectedZoneId || 0) === Number(z.id);
            if (zoneHasLayout) {
              const frWrap = document.createElement("div");
              frWrap.className = "tree-fragments";
              const frags = Array.isArray(state.layoutRun.fragments) ? state.layoutRun.fragments.slice() : [];
              frags.sort((a, b) => {
                const pa = findPlacementForFragment(a);
                const pb = findPlacementForFragment(b);
                const ma = pa && pa.status === "matched" ? 1 : 0;
                const mb = pb && pb.status === "matched" ? 1 : 0;
                if (ma !== mb) return ma - mb;
                const sa = Number(pa && pa.fitScore || -1);
                const sb = Number(pb && pb.fitScore || -1);
                return sa - sb;
              });
              for (const frag of frags) {
                const fragId = Number(frag.id || 0);
                const p = findPlacementForFragment(frag);
                const item = document.createElement("div");
                item.className = "tree-fragment" + (state.selectedFragmentId === fragId ? " active" : "");
                const left = document.createElement("span");
                left.textContent = `- ${z.id}-${fragId}`;
                const right = document.createElement("span");
                right.className = "tree-frag-tag";
                if (p && p.status === "needs_attention") {
                  right.textContent = `needs_attention${Number.isFinite(Number(p.fitScore)) ? ` (${Number(p.fitScore).toFixed(1)})` : ""}`;
                  right.style.color = "#b42318";
                  item.style.background = "#fff3f2";
                } else if (p && p.inventoryTag) {
                  right.textContent = String(p.inventoryTag);
                  right.style.color = "#666";
                } else {
                  right.textContent = p && p.status ? String(p.status) : "";
                  right.style.color = "#666";
                }
                item.appendChild(left);
                item.appendChild(right);
                item.addEventListener("click", (e) => {
                  e.stopPropagation();
                  state.selectedDetailId = Number(z.detailId || d.id);
                  state.selectedZoneId = z.id;
                  state.selectedFragmentId = fragId;
                  const fragPts =
                    (Array.isArray(frag && frag.points) && frag.points.length >= 2) ? frag.points :
                    ((Array.isArray(frag && frag.fragmentContour) && frag.fragmentContour.length >= 2) ? frag.fragmentContour :
                    ((Array.isArray(p && p.alignedContour) && p.alignedContour.length >= 2) ? p.alignedContour : []));
                  fitPointsToView(fragPts);
                  renderScene();
                });
                frWrap.appendChild(item);
              }
              if (!frags.length) {
                const emptyFrag = document.createElement("div");
                emptyFrag.className = "tree-empty";
                emptyFrag.textContent = "фрагментов нет";
                frWrap.appendChild(emptyFrag);
              }
              zonesWrap.appendChild(frWrap);
            }
          }
        }

        detailBox.appendChild(detailHead);
        detailBox.appendChild(zonesWrap);
        treeRoot.appendChild(detailBox);
      }
    }

    return { renderDetailZoneTree };
  }

  root.FurLabDetailZoneTreeView = { createDetailZoneTreeView };
})(typeof window !== "undefined" ? window : globalThis);
