/**
 * src/main/ai-leaderboard/history.js
 *
 * 历史排名对比：读取最近一次前一天的 Arena 缓存，提取各 board 的排名快照。
 * 用于计算 rankDelta（↑↓/NEW）。
 *
 * 策略：从今天往前扫最多 7 天，找到最近一份有效缓存即停。
 * 返回 Map<modelId, {board: rank}> 供 aggregator 做 diff。
 */

const fs = require("fs");
const path = require("path");
const { cacheKey, readCache, getCacheDir } = require("./cache");
const { slugifyModel, normalizeVendor } = require("./types");

/**
 * 获取最近一次历史 Arena 排名快照。
 * @param {number} [lookbackDays=7] 最多往前扫几天
 * @returns {Map<string, object>} modelId → { [board]: { rank, score } }
 */
function getPreviousArenaRanks(lookbackDays = 7) {
  const today = new Date();
  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const key = cacheKey("arena", "all", dateStr);
    const entry = readCache(key);
    if (!entry || !entry.data) continue;
    const boards = entry.data.boards;
    if (!boards || typeof boards !== "object") continue;
    // 找到了有效历史缓存，提取排名
    const rankMap = new Map();
    for (const boardName of Object.keys(boards)) {
      const payload = boards[boardName];
      const models = Array.isArray(payload && payload.models)
        ? payload.models
        : Array.isArray(payload && payload.data)
          ? payload.data
          : [];
      for (const m of models) {
        if (!m || !m.model) continue;
        const score = Number(m.score);
        if (!Number.isFinite(score)) continue;
        const vendor = normalizeVendor(m.vendor || "");
        const id = slugifyModel(vendor, m.model);
        if (!rankMap.has(id)) rankMap.set(id, {});
        rankMap.get(id)[boardName] = {
          rank: Number(m.rank) || 0,
          score,
        };
      }
    }
    if (rankMap.size > 0) return rankMap;
  }
  return new Map();
}

/**
 * 构建最近 N 天每个模型在各 board 的「排名序列」（用于趋势 sparkline）。
 * 仅扫描有缓存的天（缺天跳过，不补 null），序列按时间升序。
 * @param {number} [nDays=14]
 * @returns {Map<string, Map<string, Array<{date:string, rank:number}>>>}
 *   modelId → (board → [{date, rank}])
 */
function getArenaRankSeriesMap(nDays = 14) {
  const today = new Date();
  const byDay = []; // [{ date, rankMap: Map<id, {board:rank}> }]，时间升序
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const key = cacheKey("arena", "all", dateStr);
    const entry = readCache(key);
    if (!entry || !entry.data || !entry.data.boards) continue;
    const boards = entry.data.boards;
    const rankMap = new Map();
    for (const boardName of Object.keys(boards)) {
      const payload = boards[boardName];
      const models = Array.isArray(payload && payload.models)
        ? payload.models
        : Array.isArray(payload && payload.data)
          ? payload.data
          : [];
      for (const m of models) {
        if (!m || !m.model) continue;
        const score = Number(m.score);
        if (!Number.isFinite(score)) continue;
        const vendor = normalizeVendor(m.vendor || "");
        const id = slugifyModel(vendor, m.model);
        if (!rankMap.has(id)) rankMap.set(id, {});
        rankMap.get(id)[boardName] = { date: dateStr, rank: Number(m.rank) || 0 };
      }
    }
    byDay.push({ date: dateStr, rankMap });
  }
  const seriesMap = new Map();
  for (const { date, rankMap } of byDay) {
    for (const [id, boardsObj] of rankMap) {
      if (!seriesMap.has(id)) seriesMap.set(id, new Map());
      const perBoard = seriesMap.get(id);
      for (const [board, info] of Object.entries(boardsObj)) {
        if (!perBoard.has(board)) perBoard.set(board, []);
        perBoard.get(board).push({ date: info.date, rank: info.rank });
      }
    }
  }
  return seriesMap;
}

/**
 * 计算排名变动。
 * @param {string} modelId
 * @param {string} board Arena board name (text/vision/code)
 * @param {number} currentRank 当前排名
 * @param {Map} prevRanks getPreviousArenaRanks() 的返回值
 * @returns {{delta: number|null, isNew: boolean}}
 *   delta > 0 表示上升（排名数字变小），< 0 表示下降，null 表示无历史数据
 */
function computeRankDelta(modelId, board, currentRank, prevRanks) {
  if (!prevRanks || prevRanks.size === 0) return { delta: null, isNew: false };
  const prev = prevRanks.get(modelId);
  if (!prev || !prev[board]) return { delta: null, isNew: true };
  const prevRank = prev[board].rank;
  if (!prevRank) return { delta: null, isNew: true };
  // rank 数字变小 = 排名上升 = 正 delta
  return { delta: prevRank - currentRank, isNew: false };
}

/**
 * 清理过期缓存文件（保留最近 N 天）。
 * @param {number} [keepDays=30]
 */
function pruneOldCache(keepDays = 30) {
  const dir = getCacheDir();
  if (!dir) return;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (!f.startsWith("ai-lb") || !f.endsWith(".json")) continue;
      const fp = path.join(dir, f);
      try {
        const stat = fs.statSync(fp);
        if (stat.mtimeMs < cutoff) fs.unlinkSync(fp);
      } catch { /* 忽略单文件错误 */ }
    }
  } catch { /* 目录不可读忽略 */ }
}

module.exports = { getPreviousArenaRanks, computeRankDelta, getArenaRankSeriesMap, pruneOldCache };
