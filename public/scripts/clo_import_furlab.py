# FURLAB -> CLO Import Script
# Run in CLO Python Editor: Edit > Python Script
#
# Downloads the latest export ZIP from FurLab server and creates pattern pieces.
# Usage: set FURLAB_URL to your zrok/local address, then Run.

import os
import json
import zipfile
import tempfile
import urllib.request

import fabric_api
import pattern_api

# ---- CONFIG ----
# Leave empty to auto-find the latest furlab_export_*.zip in Downloads or Desktop.
# Or set explicitly: ZIP_PATH = r"C:\Users\...\Downloads\furlab_export_2026-05-15.zip"
ZIP_PATH = r""
# ----------------

def log(msg):
    print(f"[FURLAB] {msg}")

def pick_zip_file():
    if ZIP_PATH and os.path.exists(ZIP_PATH):
        return ZIP_PATH
    # Search Downloads and Desktop for latest furlab_export_*.zip
    home = os.path.expanduser("~")
    search_dirs = [
        os.path.join(home, "Downloads"),
        os.path.join(home, "Desktop"),
        os.path.join(home, "Загрузки"),   # Russian Windows
        os.path.join(home, "Рабочий стол"),
    ]
    candidates = []
    for d in search_dirs:
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.startswith("furlab_export") and f.endswith(".zip"):
                    full = os.path.join(d, f)
                    candidates.append((os.path.getmtime(full), full))
    if candidates:
        candidates.sort(reverse=True)
        log(f"Auto-selected: {candidates[0][1]}")
        return candidates[0][1]
    log("ERROR: no furlab_export_*.zip found in Downloads or Desktop.")
    log("Save the ZIP from FurLab (button 'Экспортировать ZIP') and run this script again.")
    return None

def hex_to_rgb_norm(hex_color):
    h = hex_color.lstrip("#")
    return [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]

def main():
    ZIP_PATH = pick_zip_file()
    if not ZIP_PATH:
        log("Cancelled: no file selected.")
        return
    if not os.path.exists(ZIP_PATH):
        log(f"ERROR: ZIP not found: {ZIP_PATH}")
        return
    log(f"Loading: {ZIP_PATH}")

    # Extract ZIP to temp dir — manually to preserve UTF-8 Cyrillic filenames on Windows
    tmp_dir = tempfile.mkdtemp(prefix="furlab_")
    log(f"Extracting to: {tmp_dir}")
    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        for info in zf.infolist():
            # Decode filename: ZIP spec uses UTF-8 when flag 0x800 is set; otherwise cp437
            fname = info.filename
            if not (info.flag_bits & 0x800):
                try:
                    fname = fname.encode("cp437").decode("utf-8")
                except Exception:
                    pass
            out_path = os.path.join(tmp_dir, fname.replace("/", os.sep))
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            if not fname.endswith("/"):
                with zf.open(info) as src, open(out_path, "wb") as dst:
                    dst.write(src.read())

    # Read manifest
    manifest_path = os.path.join(tmp_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        log("ERROR: manifest.json not found in ZIP")
        return
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    entries = manifest.get("entries", [])
    log(f"Fragments: {len(entries)}")

    # Add materials (deduplicate by jfab path)
    material_index = {}   # jfabPath -> fabric index in CLO
    base_fabric_count = fabric_api.GetFabricCount(False)

    for entry in entries:
        jfab_rel = entry.get("materialJfabPath")
        if not jfab_rel or jfab_rel in material_index:
            continue
        jfab_abs = os.path.join(tmp_dir, jfab_rel.replace("/", os.sep))
        if not os.path.exists(jfab_abs):
            # Fallback: find any .jfab in materials/ dir (encoding issues)
            mat_dir = os.path.join(tmp_dir, "materials")
            fallback = None
            if os.path.isdir(mat_dir):
                jfabs = [f for f in os.listdir(mat_dir) if f.lower().endswith(".jfab")]
                if jfabs:
                    fallback = os.path.join(mat_dir, jfabs[0])
                    log(f"  jfab fallback: {jfabs[0]}")
            if not fallback:
                log(f"WARNING: jfab not found and no fallback: {jfab_rel}")
                continue
            jfab_abs = fallback
        idx = fabric_api.AddFabric(jfab_abs)
        log(f"Added fabric: {jfab_rel} -> index {idx}")
        material_index[jfab_rel] = idx

    # Debug: show available pattern_api functions
    log(f"pattern_api functions: {[x for x in dir(pattern_api) if not x.startswith('_')]}")

    # Create pattern pieces
    pattern_base = pattern_api.GetPatternCount()
    created = 0

    for i, entry in enumerate(entries):
        frag_id    = entry.get("fragmentId", f"frag_{i}")
        dxf_rel    = entry.get("dxfPath", "")
        jfab_rel   = entry.get("materialJfabPath")
        nap_deg    = float(entry.get("napDirectionDeg", 0))
        zone_id    = entry.get("zoneId", "?")

        # Points are embedded in manifest (preferred), fallback to DXF parse
        points = entry.get("points")
        if not points:
            dxf_abs = os.path.join(tmp_dir, dxf_rel.replace("/", os.sep)) if dxf_rel else None
            points = parse_dxf_contour(dxf_abs) if dxf_abs and os.path.exists(dxf_abs) else None

        if not points or len(points) < 3:
            log(f"SKIP {frag_id}: no geometry")
            continue

        # CLO expects List[Tuple[float, float, int]] — (x, y, point_type), 0 = straight
        # FurLab Y-axis is canvas (down+), CLO Y-axis is up+ — negate Y
        clo_points = [(float(p["x"]), -float(p["y"]), 0) for p in points]
        # Ensure CCW winding (CLO requirement): compute signed area, reverse if CW
        area2 = sum((clo_points[j][0] - clo_points[j-1][0]) * (clo_points[j][1] + clo_points[j-1][1])
                    for j in range(len(clo_points)))
        if area2 > 0:  # CW in Y-up system → reverse to CCW
            clo_points = list(reversed(clo_points))
        if i == 0:
            log(f"First fragment: {len(clo_points)} points, first={clo_points[0]}")

        try:
            pattern_api.CreatePatternWithPoints(clo_points)
            pat_idx = pattern_base + created
            created += 1
            log(f"Created pattern {pat_idx} for fragment {frag_id} (zone {zone_id})")

            # Set grain direction
            try:
                pattern_api.SetPatternPieceGrainDirection(pat_idx, nap_deg)
            except Exception as e:
                log(f"  grain direction warning: {e}")

            # Assign fabric
            if jfab_rel and jfab_rel in material_index:
                fab_idx = material_index[jfab_rel]
                try:
                    pattern_api.SetPatternPieceFabricIndex(pat_idx, fab_idx)
                except Exception as e:
                    log(f"  fabric assign warning: {e}")

        except Exception as e:
            log(f"ERROR creating pattern {frag_id}: {e}")

    log(f"Done. Created {created} pattern pieces.")


def parse_dxf_contour(dxf_path):
    """Parse LWPOLYLINE points from FURLAB-generated DXF (FRAGMENT_CONTOUR layer)."""
    points = []
    try:
        with open(dxf_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = [l.strip() for l in f.readlines()]

        in_polyline = False
        in_fragment_layer = False
        x = None

        i = 0
        while i < len(lines):
            if lines[i] == "0" and i + 1 < len(lines) and lines[i+1] == "LWPOLYLINE":
                in_polyline = True
                in_fragment_layer = False
                x = None
                i += 2
                continue
            if in_polyline:
                if lines[i] == "8" and i + 1 < len(lines):
                    in_fragment_layer = (lines[i+1] == "FRAGMENT_CONTOUR")
                    i += 2
                    continue
                if lines[i] == "10" and i + 1 < len(lines):
                    x = float(lines[i+1])
                    i += 2
                    continue
                if lines[i] == "20" and i + 1 < len(lines) and x is not None:
                    if in_fragment_layer:
                        points.append({"x": x, "y": float(lines[i+1])})
                    x = None
                    i += 2
                    continue
                if lines[i] == "0":
                    in_polyline = False
            i += 1
    except Exception as e:
        print(f"[FURLAB] DXF parse error {dxf_path}: {e}")
    return points


main()
