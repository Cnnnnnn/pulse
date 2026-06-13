/**
 * src/ai-sessions/sqlite-helper.js
 *
 * minimax-code: node:sqlite 与 sqlite3 CLI 兜底.
 */

const fs = require("fs");
const { spawn } = require("child_process");
const { SILENT_LOG } = require("./session-log");

/**
 * @param {{ info?: Function, warn?: Function, error?: Function }} [log]
 */
function loadNodeSqlite(log = SILENT_LOG) {
  try {
    const sqlite = require("node:sqlite");
    return { sqlite, source: "node:sqlite" };
  } catch (err) {
    if (log.warn) log.warn(`node:sqlite load failed: ${err.message}`);
    return null;
  }
}

/**
 * @param {string} sqlitePath
 * @param {string} sql
 * @param {{ separator?: string, rejectOnError?: boolean, log?: object }} [opts]
 */
function runSqliteCli(sqlitePath, sql, opts = {}) {
  const { separator = "\t", rejectOnError = false, log = SILENT_LOG } = opts;
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "sqlite3",
      ["-separator", separator, sqlitePath, sql],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => {
      if (rejectOnError) reject(err);
      else {
        if (log.warn) log.warn(`sqlite3 CLI spawn failed: ${err.message}`);
        resolve({ stdout: "", stderr: err.message, code: 1 });
      }
    });
    proc.on("close", (code) => {
      if (code !== 0 && rejectOnError) {
        reject(
          new Error(
            `sqlite3 CLI exited code=${code}: ${stderr.slice(0, 200)}`,
          ),
        );
        return;
      }
      if (code !== 0 && log.warn) {
        log.warn(`sqlite3 CLI exited code=${code}: ${stderr.slice(0, 200)}`);
      }
      resolve({ stdout, stderr, code: code || 0 });
    });
  });
}

async function listSessionsViaCli(sqlitePath, log = SILENT_LOG) {
  const sql =
    "SELECT session_id, title, workspace_dir, effective_model, status, created_at, updated_at, framework_type FROM sessions ORDER BY updated_at DESC";
  const { stdout, code } = await runSqliteCli(sqlitePath, sql, { log });
  if (code !== 0) return [];
  let stat;
  try {
    stat = fs.statSync(sqlitePath);
  } catch {
    stat = null;
  }
  const rows = stdout
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line) => {
      const [
        session_id,
        title,
        workspace_dir,
        effective_model,
        status,
        created_at,
        updated_at,
        framework_type,
      ] = line.split("\t");
      return {
        session_id: session_id || "",
        title: title || "",
        workspace_dir: workspace_dir || "",
        effective_model: effective_model || "",
        status: status || "",
        created_at: created_at ? parseInt(created_at, 10) : 0,
        updated_at: updated_at ? parseInt(updated_at, 10) : 0,
        framework_type: framework_type || "",
      };
    });
  if (log.info) {
    log.info(
      `listSessions via sqlite3 CLI: ${rows.length} rows from ${sqlitePath}`,
    );
  }
  return rows.map((r) => ({
    id: r.session_id,
    file: sqlitePath,
    mtimeMs: r.updated_at > 0 ? r.updated_at : stat ? stat.mtimeMs : 0,
    sizeBytes: stat ? stat.size : 0,
    _workspaceDir: r.workspace_dir || null,
    _title: r.title || null,
    _effectiveModel: r.effective_model || null,
    _frameworkType: r.framework_type || null,
  }));
}

async function readSessionViaCli(sqlitePath, sessionId, log = SILENT_LOG) {
  const safeId = String(sessionId).replace(/'/g, "''");
  const sql = `SELECT id, msg_id, role, data, timestamp FROM session_messages WHERE session_id = '${safeId}' ORDER BY id ASC`;
  const { stdout } = await runSqliteCli(sqlitePath, sql, {
    log,
    rejectOnError: true,
  });
  const rows = stdout.split("\n").filter((l) => l.length > 0);
  const messages = [];
  for (const line of rows) {
    const parts = line.split("\t");
    const dataStr = parts[3] || "";
    const ts = parts[4] ? parseInt(parts[4], 10) : 0;
    let content = "";
    let role = parts[2] || "unknown";
    if (dataStr) {
      try {
        const data = JSON.parse(dataStr);
        role = data.role || role;
        if (typeof data.content === "string") content = data.content;
        else if (Array.isArray(data.content)) {
          content = data.content
            .map((c) => c.text || c.content || c.msg_content || c.msg_text || "")
            .filter(Boolean)
            .join("\n")
            .trim();
        } else if (typeof data.text === "string") content = data.text;
        else if (typeof data.msg_content === "string") content = data.msg_content;
        else if (Array.isArray(data.msg_content)) {
          content = data.msg_content
            .map((c) => c.text || c.content || c.msg_content || c.msg_text || "")
            .filter(Boolean)
            .join("\n")
            .trim();
        }
      } catch {
        content = dataStr;
      }
    }
    if (content) messages.push({ role, content, ts });
  }
  const tsList = messages.map((m) => m.ts).filter((t) => t > 0);
  return {
    id: sessionId,
    startedAt: tsList.length > 0 ? Math.min(...tsList) : 0,
    endedAt: tsList.length > 0 ? Math.max(...tsList) : 0,
    messages,
  };
}

module.exports = {
  loadNodeSqlite,
  runSqliteCli,
  listSessionsViaCli,
  readSessionViaCli,
};
