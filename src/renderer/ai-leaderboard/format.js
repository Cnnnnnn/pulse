/**
 * src/renderer/ai-leaderboard/format.js
 *
 * 数字格式化辅助（tabular-nums 友好）。
 * v3.0: 适配双视角结构，primaryValue 使用 CATEGORY_BOARD 映射。
 */

import { VENDOR_META, CATEGORY_BOARD, DIMENSION_META } from "./types.js";

/** ELO 分数：取整。 */
export function fmtScore(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return String(Math.round(Number(v)));
}

/** AA 客观指数（0-100+）：1 位小数。 */
export function fmtIndex(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(1);
}

/** 每百万 token 价格（USD）：`$x.xx /1M`。 */
export function fmtPricePer1M(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `$${Number(v).toFixed(2)} /1M`;
}

/** 上下文窗口（tokens）紧凑显示：128000 → "128K"，1050000 → "1.0M"。 */
export function fmtContext(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** 生成速度（tokens/s）。 */
export function fmtSpeed(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v))} tok/s`;
}

/** 厂商展示名。 */
export function fmtVendor(vendor) {
  if (!vendor) return "—";
  return (VENDOR_META[vendor] && VENDOR_META[vendor].label) || vendor;
}

/** 更新时间（HH:mm）。 */
export function fmtClock(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

/** 更新日期（YYYY-MM-DD）。 */
export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** 性价比 = 智能指数 / 输出价格（越高越划算）。 */
export function fmtValueRatio(aa) {
  if (!aa) return "—";
  const idx = aa.intelligenceIndex;
  const price = aa.priceOutputPer1M;
  if (idx == null || price == null || price <= 0) return "—";
  return (idx / price).toFixed(1);
}

/** LiveBench 0..100 分数 → "xx.x".  (0..1 比例 → "xx.x%"). */
export function fmtLivebench(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  // byCategory/overall 已是 0..100 (百分制). 兼容旧 0..1 输入 (除以 100 后显示 %).
  return n <= 1 ? `${(n * 100).toFixed(1)}%` : n.toFixed(1);
}

/** LB 性价比指标 (cost_per_successful_task) — <$1 显 3 位小数, >=$1 显 2 位. */
export function fmtLbCost(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  return n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

/** 票数紧凑格式化：8500 → "8.5k"，62355 → "62.4k"。 */
export function fmtVotes(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return String(n);
}

/** ponytail: 大数量紧凑格式化 (HF downloads) — 254761864 → "254.8M", 12345 → "12.3k" (v2.79.5+).
 *  跟 fmtVotes 的区别: 支持 M/B 级别 (百万/十亿), 因为 HF top 模型下载量动辄亿次. */
export function fmtDownloads(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** ponytail: HF lastModified ISO 日期紧凑显示 (v2.79.5+) — 2026-06-01T06:29:13Z → "2026-06-01".
 *  renderer 主要用相对时间, 主表格里显示精确日期不必要 — 仅显 YYYY-MM-DD. */
export function fmtHfDate(iso) {
  if (!iso) return "—";
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return s.slice(0, 10) || "—";
}

/**
 * ponytail: HF Trending 分数 (v2.79.6+) — renderer 副本 (跟 main 端 fetcher-huggingface.ts
 *  computeTrendingScore 公式一致, 不能跨进程 require). 公式: log10(dl+1) / log10(age+2).
 *  守卫: dl < 1000 / 无时间锚点 / age 越界 → null.
 * @param {number|null|undefined} downloads
 * @param {string|null|undefined} lastModified
 * @param {string|null|undefined} createdAt
 * @param {number} [now] epoch ms
 * @returns {number|null}
 */
export function computeTrendingScore(downloads, lastModified, createdAt, now) {
  const dl = Number(downloads);
  if (!Number.isFinite(dl) || dl < 1000) return null;
  const refNow = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  const dateStr =
    typeof lastModified === "string" && lastModified ? lastModified
      : typeof createdAt === "string" && createdAt ? createdAt
        : null;
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return null;
  const ageDays = (refNow - t) / 86_400_000;
  if (ageDays <= 0 || ageDays > 365) return null;
  return Math.log10(dl + 1) / Math.log10(ageDays + 2);
}

/** ponytail: Trending 分数紧凑显示 (v2.79.6+) — 7.45 → "7.45", null → "—". */
export function fmtTrending(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(2);
}

/**
 * 许可分类：open（开源权重）/ proprietary（闭源）/ unknown。
 * 仅基于 license 字符串关键词粗判，用于"仅开源权重"筛选与徽章着色。
 */
export function licenseKind(license) {
  if (!license) return "unknown";
  const s = String(license).toLowerCase();
  if (/(^|[^a-z])proprietary|closed[- ]?source/.test(s)) return "proprietary";
  if (/mit|apache|bsd|llama|community|open|gpl|mpl|free|creative|qwen|deepseek|mistral|openrail|mrl/.test(s)) {
    return "open";
  }
  return "unknown";
}

/** 许可短标签。 */
export function licenseShort(kind) {
  return kind === "open" ? "开源" : kind === "proprietary" ? "闭源" : "—";
}

/**
 * 取模型在指定维度下的排序/展示原始值。
 * @param {object} model AiModel
 * @param {string} dimension elo|intelligence|coding|agentic|speed|price|lb_*
 * @param {string} category llm|multimodal|code（决定 Arena board）
 * @returns {number|null}
 */
export function primaryValue(model, dimension, category) {
  if (dimension === "elo") {
    const board = CATEGORY_BOARD[category] || "text";
    const slice = model && model.arena && model.arena[board];
    return slice && typeof slice.score === "number" ? slice.score : null;
  }
  // lb_* 维度走 livebench 切片, sortKey 支持 dot path (e.g. "byCategory.Coding")
  if (typeof dimension === "string" && dimension.startsWith("lb_")) {
    const lb = model && model.livebench;
    if (!lb) return null;
    const meta = DIMENSION_META && DIMENSION_META[dimension];
    const key = meta && meta.sortKey;
    if (!key) return null;
    const v = key.includes(".")
      ? key.split(".").reduce((o, p) => (o ? o[p] : null), lb)
      : lb[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  // ponytail: hf_trending 走 special case (v2.79.6+) — m.huggingface 没 trendingScore 字段,
  // 实时调 computeTrendingScore. 必须在 hf_* 通用分支之前, 否则会读 hf["trendingScore"]=undefined.
  if (dimension === "hf_trending") {
    const hf = model && model.huggingface;
    if (!hf) return null;
    const ts = computeTrendingScore(hf.downloads, hf.lastModified, hf.createdAt);
    return typeof ts === "number" && Number.isFinite(ts) ? ts : null;
  }
  // ponytail: hf_license 走 special case (v2.79.6+) — 返回 rank number (0=open, 1=proprietary, 2=unknown)
  // 跟 main 端 ranking 对齐 — 字符串 (va - vb) 在 sortModels 是 NaN, 必须返数字.
  if (dimension === "hf_license") {
    const k = licenseKind(model && model.license);
    return k === "open" ? 0 : k === "proprietary" ? 1 : 2;
  }
  // ponytail: hf_* 维度 (v2.79.5+) — 走 huggingface 切片, sortKey 直接读 downloads/likes.
  if (typeof dimension === "string" && dimension.startsWith("hf_")) {
    const hf = model && model.huggingface;
    if (!hf) return null;
    const meta = DIMENSION_META && DIMENSION_META[dimension];
    const key = meta && meta.sortKey;
    if (!key) return null;
    const v = hf[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  const aa = model && model.aa;
  if (!aa) return null;
  switch (dimension) {
    case "intelligence":
      return aa.intelligenceIndex ?? null;
    case "coding":
      return aa.codingIndex ?? null;
    case "agentic":
      return aa.agenticIndex ?? null;
    case "speed":
      return aa.outputTokensPerSec ?? null;
    case "price":
      return aa.priceOutputPer1M ?? null;
    default:
      return null;
  }
}

/**
 * 按维度种类格式化主维度值。
 * @param {number|null} value
 * @param {string} dimension
 * @returns {string}
 */
export function formatPrimary(value, dimension) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  if (dimension === "elo") return fmtScore(value);
  if (dimension === "price") return fmtPricePer1M(value);
  if (dimension === "speed") return fmtSpeed(value);
  if (typeof dimension === "string" && dimension.startsWith("lb_")) return fmtLivebench(value);
  // ponytail: hf_trending (v2.79.6+) — 走 fmtTrending (2 位小数)
  if (dimension === "hf_trending") return fmtTrending(value);
  // ponytail: hf_license (v2.79.6+) — licenseKind 字符串直接显示
  if (dimension === "hf_license") return value || "—";
  // ponytail: hf_* 维度 (v2.79.5+) — 走 fmtVotes 紧凑格式 (254M → "254.0M")
  if (typeof dimension === "string" && dimension.startsWith("hf_")) return fmtDownloads(value);
  return fmtIndex(value);
}

/* ── 跨源雷达：三维轴取值与归一化 ──
 * 三轴固定量纲域（绝对归一，便于跨模型横向比较，而非相对拉伸）：
 *   Arena ELO   [1000, 1700]（与 ArenaBoardBars 同域）
 *   AA 智能指数 [0, 100]
 *   LiveBench   [0, 100]（百分制）
 */
export const ELO_MIN = 1000;
export const ELO_MAX = 1700;
export const AA_IDX_MAX = 100;
export const LB_MAX = 100;

/**
 * 取模型在「跨源雷达」三轴的原始分数。
 * Arena 轴优先用 text board ELO，否则取任一 arena board 的 score（多模态模型也可能有 text 分）。
 * @param {object|null} model
 * @returns {{arena:number|null, aa:number|null, livebench:number|null}}
 */
export function crossSourceProfile(model) {
  if (!model) return { arena: null, aa: null, livebench: null };
  const arena = model.arena && typeof model.arena === "object" ? model.arena : {};
  let arenaVal = null;
  if (arena.text && typeof arena.text.score === "number") {
    arenaVal = arena.text.score;
  } else {
    for (const k of Object.keys(arena)) {
      const s = arena[k];
      if (s && typeof s.score === "number") {
        arenaVal = s.score;
        break;
      }
    }
  }
  const aa = model.aa;
  const aaVal = aa && typeof aa.intelligenceIndex === "number" ? aa.intelligenceIndex : null;
  const lb = model.livebench;
  const lbVal = lb && typeof lb.overall === "number" ? lb.overall : null;
  return { arena: arenaVal, aa: aaVal, livebench: lbVal };
}

/** 将分数映射到 [0,1]（clamp）。null/NaN 或非法域 → null。 */
export function normalizeToUnit(v, min, max) {
  if (v == null || !Number.isFinite(v) || !(max > min)) return null;
  const t = (v - min) / (max - min);
  return Math.max(0, Math.min(1, t));
}

/**
 * 跨源雷达（厂商聚合版）：把合并后的模型列表按厂商聚合，
 * 取每个厂商在各源的最佳切片（arena 取最高 ELO / aa 取最高智能指数 / lb 取最高 overall /
 * priceOut 取最低 AA 输出价）。
 *
 * 为何按厂商而非按模型：三源模型 id 命名体系不一致（Arena 用 vendor+版本快照名、
 * AA 用发行名、LiveBench 用评测原始 id），精确 id 合并后三源几乎零交集
 * （实测 465 个模型无任何一个同时具备三切片）。而厂商名三源一致
 * （normalizeVendor 归一），故按厂商可靠对齐，规避模糊匹配的误并风险。
 *
 * @param {object[]} items 合并后的模型（含 arena/aa/livebench 切片）
 * @returns {Map<string,{arena:number|null, aa:number|null, livebench:number|null, priceOut:number|null}>}
 */
export function aggregateVendorProfiles(items) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  const push = (vendor, axis, val, mode = "max") => {
    if (val == null || !Number.isFinite(val)) return;
    if (!map.has(vendor)) map.set(vendor, { arena: null, aa: null, livebench: null, priceOut: null });
    const cur = map.get(vendor);
    if (cur[axis] == null) {
      cur[axis] = val;
      return;
    }
    cur[axis] = mode === "min" ? Math.min(cur[axis], val) : Math.max(cur[axis], val);
  };
  for (const m of items) {
    if (!m || !m.vendor) continue;
    // arena：该厂商所有 board 的最高 ELO
    let bestArena = null;
    const arena = m.arena && typeof m.arena === "object" ? m.arena : {};
    for (const k of Object.keys(arena)) {
      const s = arena[k];
      if (s && typeof s.score === "number") {
        bestArena = bestArena == null ? s.score : Math.max(bestArena, s.score);
      }
    }
    push(m.vendor, "arena", bestArena);
    const aa = m.aa;
    push(m.vendor, "aa", aa && typeof aa.intelligenceIndex === "number" ? aa.intelligenceIndex : null);
    // priceOut：该厂商旗下 AA 切片里最低的输出价（更具性价比代表性）
    push(m.vendor, "priceOut", aa && typeof aa.priceOutputPer1M === "number" ? aa.priceOutputPer1M : null, "min");
    const lb = m.livebench;
    push(m.vendor, "livebench", lb && typeof lb.overall === "number" ? lb.overall : null);
  }
  return map;
}

/**
 * 从厂商 profile 数组里按 Arena ELO 取前 n 个，作为雷达的基准上下文。
 * @param {Array<{vendor:string, arena:number|null, aa:number|null, livebench:number|null, priceOut:number|null}>} profiles
 * @param {number} n
 */
export function topVendorsByArena(profiles, n = 8) {
  return [...profiles]
    .filter((p) => p.arena != null)
    .sort((a, b) => b.arena - a.arena)
    .slice(0, n);
}

/**
 * ELO per $：厂商「最佳 Arena ELO」除以「最低 AA 输出价」，
 * 越大代表每花费一美元能买到越高的竞技水平（越划算）。
 * 守卫：缺 ELO、缺价、价 ≤ 0 均返回 null。
 * @param {{arena:number|null, priceOut:number|null}} profile
 * @returns {number|null}
 */
export function eloPerDollar(profile) {
  if (!profile) return null;
  const elo = profile.arena;
  const price = profile.priceOut;
  if (elo == null || price == null || price <= 0) return null;
  return elo / price;
}

/**
 * 从厂商 profile Map 中按 ELO per $ 降序排名。
 * @param {Map<string,{arena:number|null, aa:number|null, livebench:number|null, priceOut:number|null}>} profiles
 * @returns {Array<{vendor:string, eloPerDollar:number, arena:number, priceOut:number}>}
 */
export function rankVendorsByEloPerDollar(profiles) {
  const rows = [];
  for (const [vendor, p] of profiles) {
    const v = eloPerDollar(p);
    if (v == null) continue;
    rows.push({ vendor, eloPerDollar: v, arena: p.arena, priceOut: p.priceOut });
  }
  rows.sort((a, b) => b.eloPerDollar - a.eloPerDollar);
  return rows;
}

/**
 * 相对当前时间的中文短语.
 * @param {number} ms 上次发生时间 epoch ms
 * @param {number} [now] 当前时间 (可注入测试用)
 * @returns {string}
 */
export function fmtRelative(ms, now) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const refNow = typeof now === "number" && Number.isFinite(now) ? now : Date.now();
  const diff = refNow - ms;
  if (diff < 0) return "—";                   // 未来时间无意义
  if (diff < 60 * 1000) return "刚刚";         // < 1 min
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;   // < 1 hour
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;  // < 1 day
  // >= 1 day: return ISO date "YYYY-MM-DD" via UTC
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
