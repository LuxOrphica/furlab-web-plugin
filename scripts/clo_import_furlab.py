# FURLAB -> CLO Import Script
# Run in CLO Python Editor: Edit > Python Script
#
# Reads a FURLAB export ZIP and creates pattern pieces with fur materials.
# Usage: set ZIP_PATH below, then Run.

import os
import sys
import json
import zipfile
import tempfile

import fabric_api
import pattern_api

# ---- CONFIG ----
ZIP_PATH = r"C:\temp\furlab_export.zip"   # <-- путь к ZIP из FURLAB
# ----------------

def log(msg):
    print(f"[FURLAB] {msg}")

def hex_to_rgb_norm(hex_color):
    h = hex_color.lstrip("#")
    return [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]

def main():
    if not os.path.exists(ZIP_PATH):
        log(f"ERROR: ZIP not found: {ZIP_PATH}")
        return

    # Extract ZIP to temp dir
    tmp_dir = tempfile.mkdtemp(prefix="furlab_")
    log(f"Extracting to: {tmp_dir}")
    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        zf.extractall(tmp_dir)

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
            log(f"WARNING: jfab not found: {jfab_rel}")
            continue
        idx = fabric_api.AddFabric(jfab_abs)
        log(f"Added fabric: {jfab_rel} -> index {idx}")
        material_index[jfab_rel] = idx

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

        # CLO expects points as list of [x, y] in mm
        clo_points = [[float(p["x"]), float(p["y"])] for p in points]

        try:
            pattern_api.CreatePatternWithPoints(clo_points)
            pat_idx = pattern_base + created
            created += 1
            log(f"Created pattern {pat_idx} for fragment {frag_id} (zone {zone_id})")

            # Set grain direction
            try:
                pattern_api.SetPatternGrainDirection(pat_idx, nap_deg)
            except Exception as e:
                log(f"  grain direction warning: {e}")

            # Assign fabric
            if jfab_rel and jfab_rel in material_index:
                fab_idx = material_index[jfab_rel]
                try:
                    fabric_api.AssignFabricToPattern(pat_idx, fab_idx)
                    log(f"  assigned fabric {fab_idx}")
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
