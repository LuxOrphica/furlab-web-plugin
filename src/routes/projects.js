"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROJECTS_DIR = "projects";

function getProjectsDir(rootDir) {
  const dir = path.join(rootDir, "data", PROJECTS_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readProjectFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    // Strip UTF-8 BOM if present
    return JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
  } catch (_) {
    return null;
  }
}

function listProjects(rootDir) {
  const dir = getProjectsDir(rootDir);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const projects = [];
  for (const f of files) {
    const p = readProjectFile(path.join(dir, f));
    if (!p || !p.id) continue;
    projects.push({
      id: p.id,
      name: p.name || "Без названия",
      createdAt: p.createdAt || 0,
      updatedAt: p.updatedAt || 0,
      workspaceKey: p.workspaceKey || "",
      zonesCount: Array.isArray(p.zones) ? p.zones.length : 0,
      layoutsCount: Array.isArray(p.layouts) ? p.layouts.length : 0
    });
  }
  return projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

async function handleProjectRoutes(req, res, reqUrl, deps) {
  const { jsonReply, readBodyJson, ROOT_DIR } = deps;

  if (req.method === "GET" && reqUrl.pathname === "/api/projects") {
    jsonReply(res, 200, { ok: true, items: listProjects(ROOT_DIR) });
    return true;
  }

  if (req.method === "POST" && reqUrl.pathname === "/api/projects/save") {
    const body = await readBodyJson(req);
    const dir = getProjectsDir(ROOT_DIR);
    const now = Date.now();
    const id = String(body.id || `proj_${now}_${crypto.randomBytes(4).toString("hex")}`).replace(/[^a-zA-Z0-9_\-]/g, "_");
    const project = {
      id,
      name: String(body.name || "Без названия").trim().slice(0, 200),
      createdAt: Number(body.createdAt) || now,
      updatedAt: now,
      workspaceKey: String(body.workspaceKey || ""),
      parts: Array.isArray(body.parts) ? body.parts : [],
      zones: Array.isArray(body.zones) ? body.zones : [],
      layouts: Array.isArray(body.layouts) ? body.layouts : [],
      patternGeometry: (body.patternGeometry && Array.isArray(body.patternGeometry.entities)) ? body.patternGeometry : null,
      projectMaterials: Array.isArray(body.projectMaterials) ? body.projectMaterials : []
    };
    const filePath = path.join(dir, `${id}.json`);
    const backup = filePath + ".backup";
    if (fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, backup); } catch (_) {}
    }
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), "utf8");
    jsonReply(res, 200, { ok: true, id, updatedAt: now });
    return true;
  }

  if (req.method === "POST" && reqUrl.pathname === "/api/projects/load") {
    const body = await readBodyJson(req);
    const id = String(body.id || "").replace(/[^a-zA-Z0-9_\-]/g, "_");
    if (!id) { jsonReply(res, 400, { ok: false, error: "id_required" }); return true; }
    const dir = getProjectsDir(ROOT_DIR);
    const filePath = path.join(dir, `${id}.json`);
    if (!fs.existsSync(filePath)) { jsonReply(res, 404, { ok: false, error: "not_found" }); return true; }
    const project = readProjectFile(filePath);
    if (!project) { jsonReply(res, 500, { ok: false, error: "read_failed" }); return true; }
    jsonReply(res, 200, { ok: true, item: project });
    return true;
  }

  if (req.method === "POST" && reqUrl.pathname === "/api/projects/delete") {
    const body = await readBodyJson(req);
    const id = String(body.id || "").replace(/[^a-zA-Z0-9_\-]/g, "_");
    if (!id) { jsonReply(res, 400, { ok: false, error: "id_required" }); return true; }
    const dir = getProjectsDir(ROOT_DIR);
    const filePath = path.join(dir, `${id}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    jsonReply(res, 200, { ok: true });
    return true;
  }

  return false;
}

module.exports = { handleProjectRoutes };
