/**
 * src/main/detect-results-export.js
 *
 * C7 v2.35.0 — 检测结果导出 (JSON / CSV).
 * 数据源: state.json apps (last-known 检测结果).
 * 写出: ~/Desktop/pulse-detect-results-{ts}.{json|csv}
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

/** CSV 列 — 跟 AppRow 展示字段对齐, 不含 trace/changelog 等大字段 */
const CSV_COLUMNS = [
  "name",
  "bundle",
  "installed_version",
  "latest_version",
  "has_update",
  "status",
  "source",
  "note",
  "brew_cask",
  "ts",
];

/**
 * 从 state.apps 条目摘出可导出字段.
 * @param {object} app
 * @returns {object|null}
 */
function pickExportFields(app) {
  if (!app || typeof app !== "object" || typeof app.name !== "string") return null;
  return {
    name: app.name,
    bundle: app.bundle || "",
    installed_version: app.installed_version ?? "",
    latest_version: app.latest_version ?? "",
    has_update: Boolean(app.has_update),
    status: app.status || "",
    source: app.source || "",
    note: app.note || "",
    brew_cask: app.brew_cask || "",
    ts: typeof app.ts === "number" ? app.ts : null,
  };
}

/**
 * @param {object} state  state-store.load() 返回值
 * @param {string} [pulseVersion]
 * @returns {{ generatedAt: string, pulseVersion: string, count: number, apps: object[] }}
 */
function buildExportPayload(state, pulseVersion = "") {
  const appsObj = (state && state.apps) || {};
  const apps = Object.values(appsObj)
    .map(pickExportFields)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    generatedAt: new Date().toISOString(),
    pulseVersion: pulseVersion || "",
    count: apps.length,
    apps,
  };
}

/** RFC 4180-ish: 双引号包裹, 内部双引号加倍 */
function csvEscape(val) {
  const s = val == null ? "" : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {object[]} apps  pickExportFields 后的数组
 * @returns {string}
 */
function toCsv(apps) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of apps || []) {
    lines.push(CSV_COLUMNS.map((col) => csvEscape(row[col])).join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * @param {object} opts
 * @param {object} [opts.state]       state-store.load() 返回值
 * @param {'json'|'csv'} opts.format
 * @param {string} [opts.outputDir]   默认 ~/Desktop
 * @param {string} [opts.pulseVersion]
 * @returns {{ ok: boolean, path?: string, sizeBytes?: number, rowCount?: number, error?: string }}
 */
function exportDetectResults(opts) {
  const {
    state,
    format,
    outputDir = path.join(os.homedir(), "Desktop"),
    pulseVersion = "",
  } = opts || {};

  if (format !== "json" && format !== "csv") {
    return { ok: false, error: "bad_format" };
  }

  const payload = buildExportPayload(state, pulseVersion);
  const content = format === "json"
    ? JSON.stringify(payload, null, 2)
    : toCsv(payload.apps);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: `mkdir failed: ${err && err.message}` };
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outName = `pulse-detect-results-${ts}.${format}`;
  const outPath = path.join(outputDir, outName);

  try {
    fs.writeFileSync(outPath, content, "utf8");
  } catch (err) {
    return { ok: false, error: `write failed: ${err && err.message}` };
  }

  return {
    ok: true,
    path: outPath,
    sizeBytes: Buffer.byteLength(content, "utf8"),
    rowCount: payload.count,
  };
}

module.exports = {
  CSV_COLUMNS,
  pickExportFields,
  buildExportPayload,
  toCsv,
  exportDetectResults,
};
