"use strict";

// Default nonlinear physics curves from real CLO fur export (mink)
const DEFAULT_NONLINEAR_SHEAR = [
  { lengthRatio: 1.0, stiffnessRatio: 0.04358 },
  { lengthRatio: 1.0746, stiffnessRatio: 3.417 },
  { lengthRatio: 1.1725, stiffnessRatio: 9.491 },
  { lengthRatio: 1.2485, stiffnessRatio: 15.284 }
];
const DEFAULT_NONLINEAR_STRETCH_WARP = [
  { lengthRatio: 1.0, stiffnessRatio: 0.1563 },
  { lengthRatio: 1.07, stiffnessRatio: 3.401 },
  { lengthRatio: 1.1683, stiffnessRatio: 8.112 },
  { lengthRatio: 1.2443, stiffnessRatio: 10.63 }
];
const DEFAULT_NONLINEAR_STRETCH_WEFT = [
  { lengthRatio: 1.0, stiffnessRatio: 0.0428 },
  { lengthRatio: 1.0996, stiffnessRatio: 2.761 },
  { lengthRatio: 1.1953, stiffnessRatio: 6.957 },
  { lengthRatio: 1.2663, stiffnessRatio: 9.194 }
];

function hexToRgb(hex) {
  const h = String(hex || "#888888").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [isFinite(r) ? r : 0.5, isFinite(g) ? g : 0.5, isFinite(b) ? b : 0.5, 1.0];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

/**
 * Generate a minimal CLO-compatible GLTF material file from FURLAB fur material data.
 * No geometry, no textures — just the material definition.
 *
 * @param {object} material — object from fur_materials.json
 * @returns {object} — parsed GLTF JSON ready to JSON.stringify
 */
function buildCloGltfMaterial(material) {
  const m = material && typeof material === "object" ? material : {};

  const weightGm2   = clamp(m.weightGm2 || 230, 50, 2000);
  const thicknessMm = clamp(m.thicknessMm || 0.5, 0.1, 10);
  const softness    = clamp(m.softness || 0.5, 0, 1);
  const stretch     = clamp(m.stretch || 0.7, 0, 1);
  const gloss       = clamp(m.gloss || 0.3, 0, 1);
  const colorHex    = String(m.colorHex || "#888888");

  // Physics: higher softness → lower bending stiffness
  const bendingWarp      = (1 - softness) * 10000 + 500;
  const bendingWeft      = (1 - softness) * 9000  + 500;
  const bendingBias      = (bendingWarp + bendingWeft) / 2;
  // Higher stretch → lower stretch stiffness (easier to stretch)
  const stretchWarp      = (1 - stretch) * 3000000 + 500000;
  const stretchWeft      = (1 - stretch) * 2500000 + 400000;

  const baseColor = hexToRgb(colorHex);

  const matName = String(m.name || "FurMaterial").replace(/\s+/g, "_");

  return {
    asset: { version: "2.0", generator: "FURLAB clo_gltf_generator" },
    extensionsUsed: ["CLO_materials_fabric_property", "KHR_materials_specular"],
    extensionsRequired: ["CLO_materials_fabric_property"],
    materials: [
      {
        name: matName,
        pbrMetallicRoughness: {
          baseColorFactor: baseColor,
          metallicFactor: 0.0,
          roughnessFactor: clamp(1.0 - gloss, 0, 1)
        },
        extensions: {
          CLO_materials_fabric_property: {
            physicalProperty: {
              density:                    weightGm2,
              thickness:                  thicknessMm,
              friction:                   0.03,
              internalDamping:            1e-4,
              stretchWarp,
              stretchWeft,
              bendingWarp,
              bendingWeft,
              bendingLeftBias:            bendingBias,
              bendingRightBias:           bendingBias,
              leftShear:                  1200000.0,
              rightShear:                 1200000.0,
              bucklingRatioWarp:          0.0,
              bucklingRatioWeft:          0.0,
              bucklingRatioLeftBias:      0.0,
              bucklingRatioRightBias:     0.0,
              bucklingStiffnessWarp:      0.0,
              bucklingStiffnessWeft:      0.0,
              bucklingStiffnessLeftBias:  0.0,
              bucklingStiffnessRightBias: 0.0,
              nonlinearLeftShear:         DEFAULT_NONLINEAR_SHEAR,
              nonlinearRightShear:        DEFAULT_NONLINEAR_SHEAR,
              nonlinearStretchWarp:       DEFAULT_NONLINEAR_STRETCH_WARP,
              nonlinearStretchWeft:       DEFAULT_NONLINEAR_STRETCH_WEFT
            },
            textureMapping: { type: 0 }
          },
          KHR_materials_specular: {
            specularFactor: clamp(gloss * 0.3, 0, 1)
          }
        }
      }
    ],
    // Minimal valid GLTF: one empty scene
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    accessors: [],
    bufferViews: [],
    buffers: []
  };
}

/**
 * Generate GLTF JSON string for a fur material.
 */
function generateGltfString(material) {
  return JSON.stringify(buildCloGltfMaterial(material), null, 2);
}

module.exports = { buildCloGltfMaterial, generateGltfString };
