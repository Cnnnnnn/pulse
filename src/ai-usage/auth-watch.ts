/**
 * src/ai-usage/auth-watch.ts
 *
 * Pure function: 判断「某个 provider 的登录态失效了」是否该弹一条"去重新登录"提醒.
 *
 * 跟 anomaly-detect.ts 同款分工 —— 这里只做纯决策, 不发通知也不读写磁盘;
 * I/O 留给 ai-usage-refresh-scheduler (sendNotification) 与 state-store (prefs).
 *
 * 为什么需要它: codex 的凭据是 codex CLI 维护的 OAuth token (约 10 天有效). 过期后
 * Pulse **不做自动刷新** —— refresh_token 单次使用 + 轮换, 抢刷会把 CLI 手里的旧
 * token 变成 reused, 直接打断登录态. 所以只能提醒用户去终端动一次 `codex`.
 */

/**
 * 算「登录态失效」的失败原因. 不含 `api_key_missing` —— 那是"没配置过",
 * 对 minimax/glm 属于正常状态, 不该打扰用户.
 */
export const CODEX_AUTH_REASONS = [
  "codex_auth_missing",
  "token_expired",
  "auth_401",
  "auth_403",
];

/** 修好之前, 多久再提醒一次 (避免 30 分钟一次刷屏). */
export const REWARN_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** providerId → 中文显示名 (通知标题用). */
const PROVIDER_LABEL: Record<string, string> = {
  minimax: "MiniMax",
  glm: "GLM",
  codex: "Codex",
};

const REASON_LABEL: Record<string, string> = {
  codex_auth_missing: "凭据文件不存在",
  token_expired: "登录态已过期",
  auth_401: "登录态被拒绝",
  auth_403: "登录态被拒绝",
};

/**
 * 本轮该不该弹「重新登录」提醒.
 *
 * 决策规则:
 *   1. 只认「登录态失效」类 reason; 其余(含 fetch 抛异常)都不动状态
 *   2. **必须有历史快照才提醒** —— 否则说明这台机器从来没登录过/没装 codex,
 *      提醒只会变成噪音
 *   3. 去重: `authWarned[providerId]` 记上次提醒时间, 未超 REWARN_AFTER_MS 不再提醒
 *   4. 恢复: 该 provider 一旦 fetch 成功, 清掉记录 → 下次再失效会重新提醒
 *
 * @param {object} opts
 * @param {Array<{ok: boolean, provider?: string, reason?: string}>} opts.results  本轮 fetch 结果
 * @param {object} [opts.prefs]        alert prefs (读 `authWarned`)
 * @param {Record<string, boolean>} [opts.hadSnapshot]  providerId → 是否有历史成功快照
 * @param {number} [opts.now]
 * @returns {{notified: boolean, notification?: {title: string, body: string}, patch?: object}}
 */
export function decideAuthReminder({
  results,
  prefs,
  hadSnapshot,
  now = Date.now(),
}: any = {}) {
  const out: any = { notified: false };
  if (!Array.isArray(results) || results.length === 0) return out;

  const warned =
    prefs && prefs.authWarned && typeof prefs.authWarned === "object"
      ? prefs.authWarned
      : {};
  const snapshots = hadSnapshot || {};
  const nextWarned: Record<string, number> = { ...warned };
  let warnedChanged = false;

  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const pid = r.provider;
    if (typeof pid !== "string" || pid.length === 0) continue;

    // 恢复 → 清记录 (下次失效能重新提醒)
    if (r.ok === true) {
      if (typeof warned[pid] === "number") {
        delete nextWarned[pid];
        warnedChanged = true;
      }
      continue;
    }

    // 只处理「登录态失效」
    if (pid !== "codex") continue;
    if (!CODEX_AUTH_REASONS.includes(r.reason)) continue;

    // 从没成功过 → 不是"失效", 不打扰
    if (!snapshots[pid]) continue;

    const lastAt = warned[pid];
    if (typeof lastAt === "number" && now - lastAt < REWARN_AFTER_MS) continue;

    nextWarned[pid] = now;
    warnedChanged = true;
    out.notified = true;
    out.notification = {
      title: `${PROVIDER_LABEL[pid] || pid} 用量停更：${REASON_LABEL[r.reason] || "登录态失效"}`,
      body: "在终端跑一次 codex 会自动续期；仍提示重新登录则跑 codex login",
    };
  }

  // 只在真的有变化时返 patch, 避免每 30 分钟白写一次盘
  if (warnedChanged) out.patch = { authWarned: nextWarned };
  return out;
}
