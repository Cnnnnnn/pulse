/**
 * src/main/tray-menu-prefs.js
 *
 * Tray 菜单配置 v1.
 *
 * 单一真相: segment key 列表 (updates/ai_usage/worldcup/metals/check_action/config_action).
 * 锁死的 2 项 (打开面板 / 退出) **不进** schema,也不进 TRAY_SEGMENTS —
 * buildMenu 永远渲染,根本不读 prefs.
 *
 * state.json.tray_menu_prefs = { version: 1, segments: { [key]: boolean } }
 *
 * normalizePrefs 纯函数: 未知 key 静默丢弃,缺失 key 补默认 true,非 boolean value 补 true.
 * 锁死 key 不存在于此 schema — 锁死在 buildMenu 硬编码里.
 */

const TRAY_SEGMENTS = [
  { key: "updates", label: "🔄 检查更新" },
  { key: "ai_usage", label: "📊 AI 用量" },
  { key: "worldcup", label: "⚽ 世界杯" },
  { key: "metals", label: "💎 贵金属" },
  { key: "check_action", label: "检查更新(按钮)" },
  { key: "config_action", label: "打开配置文件" },
];

const DEFAULT_PREFS = Object.freeze({
  version: 1,
  segments: Object.freeze(
    Object.fromEntries(TRAY_SEGMENTS.map((s) => [s.key, true])),
  ),
});

/**
 * @param {unknown} input
 * @returns {{version:number, segments: Record<string, boolean>}}
 */
function normalizePrefs(input) {
  if (!input || typeof input !== "object" || !input.segments) return DEFAULT_PREFS;
  const segs = input.segments;
  if (typeof segs !== "object" || Array.isArray(segs)) return DEFAULT_PREFS;
  const out = { version: 1, segments: {} };
  for (const s of TRAY_SEGMENTS) {
    const v = segs[s.key];
    out.segments[s.key] = typeof v === "boolean" ? v : true;
  }
  return out;
}

module.exports = { TRAY_SEGMENTS, DEFAULT_PREFS, normalizePrefs };
