// CScript (JScript/VBScript-compatible) — runs via cscript.exe
// Manages ScrapReservation records in Access DB.
//
// ScrapReservation table expected columns:
//   id             - Text/Autonumber PK (GUID preferred)
//   scrapPieceId   - Text, FK -> ScrapPiece.id
//   projectId      - Text
//   layoutId       - Text (optional, nullable)
//   reservedAt     - DateTime
//   releasedAt     - DateTime (NULL = active reservation)
//   note           - Text (optional)
//
// If the table doesn't exist, creates it automatically via DDL.
//
// Payload (JSON file, argument 2):
//   action: "reserve" | "release" | "list"
//   projectId: string
//   layoutId: string (optional, used by reserve)
//   scrapPieceIds: string[] (used by reserve)
//   releaseProjectId: string (used by release — releases all for project)
//   releaseLayoutId: string (optional, used by release — releases only for layout)

var dbPath = WScript.Arguments.length > 0 ? WScript.Arguments(0) : "";
var jsonPath = WScript.Arguments.length > 1 ? WScript.Arguments(1) : "";
if (!dbPath) { WScript.Echo('{"ok":false,"error":"db_path_required"}'); WScript.Quit(1); }
if (!jsonPath) { WScript.Echo('{"ok":false,"error":"json_path_required"}'); WScript.Quit(1); }

function esc(s) {
  if (s === null || s === undefined) return "";
  var src = String(s);
  var out = "";
  for (var i = 0; i < src.length; i++) {
    var ch = src.charAt(i);
    var code = src.charCodeAt(i);
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (code === 8) out += "\\b";
    else if (code === 9) out += "\\t";
    else if (code === 10) out += "\\n";
    else if (code === 12) out += "\\f";
    else if (code === 13) out += "\\r";
    else if (code < 32 || code > 126) {
      var hex = code.toString(16).toUpperCase();
      while (hex.length < 4) hex = "0" + hex;
      out += "\\u" + hex;
    } else out += ch;
  }
  return out;
}

function sqlText(s) { return "'" + String(s || "").replace(/'/g, "''") + "'"; }

function newGuid() {
  try {
    var g = new ActiveXObject("Scriptlet.TypeLib").Guid;
    var s = String(g || "").toUpperCase();
    var m = s.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/);
    if (m) return "{" + m[0] + "}";
  } catch (_) {}
  // fallback pseudo-guid
  var r = "";
  var chars = "0123456789ABCDEF";
  for (var i = 0; i < 32; i++) r += chars.charAt(Math.floor(Math.random() * 16));
  return "{" + r.slice(0,8) + "-" + r.slice(8,12) + "-" + r.slice(12,16) + "-" + r.slice(16,20) + "-" + r.slice(20) + "}";
}

function readUtf8(path) {
  var stm = new ActiveXObject("ADODB.Stream");
  stm.Type = 2; stm.Charset = "utf-8"; stm.Open(); stm.LoadFromFile(path);
  var txt = stm.ReadText(); stm.Close();
  return txt;
}

function toIso(v) {
  if (!v) return "";
  try { var d = new Date(v); if (!isNaN(d.getTime())) return d.toISOString(); } catch (_) {}
  return String(v);
}

function nowIso() { return new Date().toISOString(); }

function ensureTable(db) {
  // Try opening — if fails, create
  try {
    var rs = db.OpenRecordset("SELECT TOP 1 id FROM ScrapReservation;");
    rs.Close();
    return true; // table exists
  } catch (_) {}
  try {
    db.Execute(
      "CREATE TABLE ScrapReservation (" +
        "id TEXT(50) NOT NULL PRIMARY KEY, " +
        "scrapPieceId TEXT(100) NOT NULL, " +
        "projectId TEXT(100) NOT NULL, " +
        "layoutId TEXT(100), " +
        "reservedAt DATETIME NOT NULL, " +
        "releasedAt DATETIME, " +
        "note TEXT(500)" +
      ");"
    );
    return true;
  } catch (e) {
    return false;
  }
}

var daoDb = null;
try {
  var payload = eval("(" + (readUtf8(jsonPath) || "{}") + ")");
  var action = String(payload.action || "").toLowerCase().replace(/^\s+|\s+$/g, "");
  if (!action) { WScript.Echo('{"ok":false,"error":"action_required"}'); WScript.Quit(1); }

  var dao = new ActiveXObject("DAO.DBEngine.120");
  daoDb = dao.OpenDatabase(dbPath, false, false);

  var tableOk = ensureTable(daoDb);
  if (!tableOk) {
    WScript.Echo('{"ok":false,"error":"table_create_failed"}');
    WScript.Quit(1);
  }

  // ── RESERVE ──────────────────────────────────────────────────────────────
  if (action === "reserve") {
    var projectId = String(payload.projectId || "").replace(/^\s+|\s+$/g, "");
    var layoutId = String(payload.layoutId || "").replace(/^\s+|\s+$/g, "");
    var pieceIds = payload.scrapPieceIds && payload.scrapPieceIds.length ? payload.scrapPieceIds : [];
    if (!projectId) { WScript.Echo('{"ok":false,"error":"projectId_required"}'); WScript.Quit(1); }

    var nowStr = nowIso();
    var inserted = 0;
    var skipped = 0;

    for (var i = 0; i < pieceIds.length; i++) {
      var pid = String(pieceIds[i] || "").replace(/^\s+|\s+$/g, "");
      if (!pid) { skipped++; continue; }

      // Check if active reservation already exists for this piece+project
      var checkSql = "SELECT id FROM ScrapReservation WHERE scrapPieceId=" + sqlText(pid) +
        " AND projectId=" + sqlText(projectId) +
        (layoutId ? " AND layoutId=" + sqlText(layoutId) : "") +
        " AND releasedAt Is Null;";
      var rsCheck = null;
      var alreadyExists = false;
      try {
        rsCheck = daoDb.OpenRecordset(checkSql);
        alreadyExists = !rsCheck.EOF;
        rsCheck.Close();
      } catch (_) { alreadyExists = false; }

      if (alreadyExists) { skipped++; continue; }

      var newId = newGuid();
      var insertSql = "INSERT INTO ScrapReservation (id, scrapPieceId, projectId, layoutId, reservedAt, releasedAt, note) VALUES (" +
        sqlText(newId) + ", " +
        sqlText(pid) + ", " +
        sqlText(projectId) + ", " +
        (layoutId ? sqlText(layoutId) : "Null") + ", " +
        "#" + nowStr + "#, " +
        "Null, " +
        sqlText("project_save") +
      ");";
      try {
        daoDb.Execute(insertSql);
        inserted++;
      } catch (e) {
        skipped++;
      }
    }

    WScript.Echo('{"ok":true,"action":"reserve","inserted":' + inserted + ',"skipped":' + skipped + '}');

  // ── RELEASE ───────────────────────────────────────────────────────────────
  } else if (action === "release") {
    var relProjectId = String(payload.releaseProjectId || payload.projectId || "").replace(/^\s+|\s+$/g, "");
    var relLayoutId = String(payload.releaseLayoutId || payload.layoutId || "").replace(/^\s+|\s+$/g, "");
    if (!relProjectId) { WScript.Echo('{"ok":false,"error":"projectId_required"}'); WScript.Quit(1); }

    var nowStr2 = nowIso();
    var updateSql = "UPDATE ScrapReservation SET releasedAt=#" + nowStr2 + "# WHERE projectId=" + sqlText(relProjectId) +
      (relLayoutId ? " AND layoutId=" + sqlText(relLayoutId) : "") +
      " AND releasedAt Is Null;";
    var released = 0;
    try {
      daoDb.Execute(updateSql);
      released = daoDb.RecordsAffected;
    } catch (e) {
      WScript.Echo('{"ok":false,"error":"release_failed","detail":"' + esc(String(e.message || e)) + '"}');
      WScript.Quit(1);
    }
    WScript.Echo('{"ok":true,"action":"release","released":' + released + '}');

  // ── LIST ──────────────────────────────────────────────────────────────────
  } else if (action === "list") {
    var listProjectId = String(payload.projectId || "").replace(/^\s+|\s+$/g, "");
    var listSql = "SELECT id, scrapPieceId, projectId, layoutId, reservedAt, releasedAt, note FROM ScrapReservation";
    if (listProjectId) listSql += " WHERE projectId=" + sqlText(listProjectId) + " AND releasedAt Is Null";
    else listSql += " WHERE releasedAt Is Null";
    listSql += " ORDER BY reservedAt DESC;";

    var rsList = daoDb.OpenRecordset(listSql);
    var items = [];
    while (!rsList.EOF) {
      items.push(
        "{" +
          '"id":"' + esc(rsList.Fields("id").Value || "") + '",' +
          '"scrapPieceId":"' + esc(rsList.Fields("scrapPieceId").Value || "") + '",' +
          '"projectId":"' + esc(rsList.Fields("projectId").Value || "") + '",' +
          '"layoutId":"' + esc(rsList.Fields("layoutId").Value || "") + '",' +
          '"reservedAt":"' + esc(toIso(rsList.Fields("reservedAt").Value)) + '",' +
          '"note":"' + esc(rsList.Fields("note").Value || "") + '"' +
        "}"
      );
      rsList.MoveNext();
    }
    rsList.Close();
    WScript.Echo('{"ok":true,"action":"list","items":[' + items.join(",") + ']}');

  } else {
    WScript.Echo('{"ok":false,"error":"unknown_action","action":"' + esc(action) + '"}');
  }

} catch (e) {
  WScript.Echo('{"ok":false,"error":"script_error","detail":"' + esc(String(e.message || e)) + '"}');
} finally {
  try { if (daoDb) daoDb.Close(); } catch (_) {}
}
