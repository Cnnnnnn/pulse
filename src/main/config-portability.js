/**
 * src/main/config-portability.js
 *
 * P61 — 配置导入导出. 纯函数: 序列化 / 解析 / diff.
 * 4 个字段: watchlist / reminders / funds / ai_prompts
 * (不含 sidenavPrefs — 它在 renderer localStorage, 跨进程同步成本高且丢失成本低).
 *
 * 导出格式 .pulse-config.json:
 * { schemaVersion, exportedAt, pulseVersion, fields: { ...4字段 } }
 */

const CONFIG_FIELDS = ["watchlist", "reminders", "funds", "ai_prompts"];
const SCHEMA_VERSION = 1;

function countOf(val) {
  if (val == null) return 0;
  if (Array.isArray(val)) return val.length;
  if (typeof val === "object") return Object.keys(val).length;
  return 0;
}

function serializeConfig(state, pulseVersion = "") {
  const fields = {};
  for (const f of CONFIG_FIELDS) {
    const v = state && state[f];
    fields[f] = v === undefined ? null : v;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    pulseVersion,
    fields,
  };
}

function parseConfigFile(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "bad_json" };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: "bad_schema" };
  }
  if (!parsed.fields || typeof parsed.fields !== "object") {
    return { ok: false, reason: "bad_schema" };
  }
  const fieldKeys = Object.keys(parsed.fields);
  const unknownFields = fieldKeys.filter((k) => !CONFIG_FIELDS.includes(k));
  if (unknownFields.length > 0) {
    return { ok: false, reason: "unknown_fields", unknownFields };
  }
  return { ok: true, fields: parsed.fields };
}

function computeDiff(currentState, incomingFields) {
  const cur = currentState || {};
  const inc = incomingFields || {};
  return CONFIG_FIELDS.map((f) => {
    const curVal = cur[f];
    const incVal = inc[f];
    const curCount = countOf(curVal);
    const incCount = countOf(incVal);

    let status;
    let summary;
    if (incVal == null) {
      status = "removed";
      summary = "传入无此字段, 跳过";
    } else if (curVal == null) {
      status = "added";
      summary = incCount > 0 ? `新增 ${incCount} 项` : "新增 (空)";
    } else if (JSON.stringify(curVal) === JSON.stringify(incVal)) {
      status = "same";
      summary = "无变化";
    } else {
      status = "changed";
      const delta = incCount - curCount;
      summary = `内容不同${delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}`;
    }
    return { field: f, status, currentCount: curCount, incomingCount: incCount, summary };
  });
}

module.exports = {
  CONFIG_FIELDS,
  SCHEMA_VERSION,
  serializeConfig,
  parseConfigFile,
  computeDiff,
};
