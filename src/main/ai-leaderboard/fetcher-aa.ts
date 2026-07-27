/**
 * src/main/ai-leaderboard/fetcher-aa.ts
 *
 * 主源2：Artificial Analysis（客观分 + 价格 + 速度）。
 * 官方 Free API（x-api-key 头，1000/天限流，强制署名）。
 * 无 key 时走官方 API 会 401；全失败 → {ok:false}（aggregator 兜底链接管）。
 *
 * 单源失败不影响其它源；本 fetcher 内部 try/catch，失败仅返回 {ok:false}。
 */

import { fetchJson, BROWSER_UA } from "./normalize";
import { SOURCE, toAiModel, slugifyModel, normalizeVendor } from "./types";
import { logFetchError } from "../games/log";

/** 取首个有限数值, 否则返回默认. ponytail: 3 fetcher 各 1 份, 不抽 (esbuild 编译陷阱). */
function num(v: any, d: number = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

const AA_API = "https://artificialanalysis.ai/api/v2/language/models/free";
/** ponytail: 翻页安全上限 — Free 日配额 1000；24h TTL 下一天通常只打一轮。 */
const AA_MAX_PAGES = 20;

let _envLoaded = false;
let _aaKey: string | undefined = undefined; // undefined = 尚未探测

/**
 * 极简 .env 加载器（与 itad.js 同款范式）：
 * 仅当进程尚未有 ARTIFICIAL_ANALYSIS_API_KEY 时，从 process.cwd()/.env 读取。
 */
function loadAaKey(): string | undefined {
  if (_envLoaded) return _aaKey;
  _envLoaded = true;
  if (process.env.ARTIFICIAL_ANALYSIS_API_KEY) {
    _aaKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
    return _aaKey;
  }
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return _aaKey;
    const txt = fs.readFileSync(envPath, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*ARTIFICIAL_ANALYSIS_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) {
        let v = m[1].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (v) {
          _aaKey = v;
          break;
        }
      }
    }
  } catch (err: any) {
    logFetchError("aa:env", err);
  }
  return _aaKey;
}

/** 从 evaluations 对象按候选键取首个有限数值（兼容不同字段命名）。 */
function pickEval(ev: any, keys: string[], d: number = 0): number {
  if (!ev || typeof ev !== "object") return d;
  for (const k of keys) {
    const v = ev[k];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return d;
}

/** 从 model_creator 提取 vendor string（兼容 {name} / string / 旧字段）。 */
function pickCreatorName(d: any): string {
  const mc = d && d.model_creator;
  if (mc && typeof mc === "object" && mc.name) return String(mc.name);
  if (typeof mc === "string") return mc;
  return d && (d.creator || d.org) ? String(d.creator || d.org) : "";
}

/** Free 官方 Cost per Task：cost_per_task.total_cost，兜底扁平 total_cost。 */
function pickCostPerTask(d: any): number {
  const cost = d && d.artificial_analysis_intelligence_index_cost;
  if (!cost || typeof cost !== "object") return 0;
  const nested = cost.cost_per_task;
  if (nested && typeof nested === "object" && nested.total_cost != null) {
    return num(nested.total_cost);
  }
  return num(cost.total_cost);
}

function pageUrl(page: number): string {
  const sep = AA_API.includes("?") ? "&" : "?";
  return `${AA_API}${sep}page=${page}`;
}

export async function fetch(opts: any = {}): Promise<any> {
  const timeoutMs = opts && opts.timeoutMs;
  const key = loadAaKey();
  const headers: Record<string, string> = { "User-Agent": BROWSER_UA, Accept: "application/json" };
  if (key) headers["x-api-key"] = key;

  try {
    const first = await fetchJson(pageUrl(1), { timeoutMs: timeoutMs || 12000, headers });
    const all: any[] = Array.isArray(first && first.data) ? [...first.data] : [];
    const pag = first && first.pagination;
    let hasMore = Boolean(pag && pag.has_more);
    let page = 1;
    // ponytail: 以 has_more 为准；total_pages 仅作硬停，缺省时靠 AA_MAX_PAGES。
    while (hasMore && page < AA_MAX_PAGES) {
      page += 1;
      if (pag && typeof pag.total_pages === "number" && page > pag.total_pages) break;
      const next = await fetchJson(pageUrl(page), { timeoutMs: timeoutMs || 12000, headers });
      if (Array.isArray(next && next.data)) all.push(...next.data);
      hasMore = Boolean(next && next.pagination && next.pagination.has_more);
      if (!hasMore) break;
    }
    return {
      ok: true,
      source: "artificial-analysis",
      data: { ...first, data: all, pagination: { ...(pag || {}), page: 1, has_more: false } },
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    // 主源失败 (无 key / 401 / 网络 / quota) → 不存在可信 raw 镜像, 直接返回 ok:false
    // aggregator 兜底链会处理 (Arena live → OR 骨架 → sample)
    logFetchError("aa", err);
    return {
      ok: false,
      source: "artificial-analysis",
      data: null,
      fetchedAt: new Date().toISOString(),
    };
  }
}

/**
 * ── Free-tier 字段限制说明 ──
 *  1. Free API 支持分页；Pulse 翻页合并（上限 AA_MAX_PAGES），仍可能少于官网图表窗。
 *  2. Headline 维: intelligence / coding / agentic / speed / price + 官方 costPerTask。
 *     math / gpqa / mmlu / hle / lcb 在 Free tier 不返回 → 恒为 0, UI 显示「暂无」。
 *  3. Capability / Openness / 多模态 Elo 属 Commercial 专属，当前未接入。
 */

/**
 * 把 AA 原始 payload 归一化为 AiModel[]（仅填 aa 切片）。
 *
 * AA Free tier 实际 schema (2026-07):
 *   { data: [{ id, name, slug, release_date, model_creator:{id,name},
 *              evaluations:{artificial_analysis_intelligence_index, ...coding_index, ...agentic_index},
 *              artificial_analysis_intelligence_index_cost:{cost_per_task:{total_cost}, total_cost?},
 *              pricing:{price_1m_input_tokens, price_1m_output_tokens, ...},
 *              performance:{median_output_tokens_per_second, median_time_to_first_token_seconds, ...}
 *            }] }
 * 数学 / gpqa / hle 等字段 Free tier 不返回 → 0 (UI "暂无")。
 * blended 价 Free tier 不返回 → 用 (input + output)/2 估算。
 * @param raw
 * @returns {object[]}
 */
export function normalize(raw: any): any[] {
  const list = Array.isArray(raw && raw.data) ? raw.data : [];
  const out: any[] = [];
  for (const d of list) {
    if (!d || !d.name) continue;
    const creatorName = pickCreatorName(d);
    const vendor = normalizeVendor(creatorName);
    // ponytail: 保留推理强度后缀进 id — 官网把 Max/Low Effort 当分条模型；
    // 跨源合并靠 normalize._mergeByName（AA 变体互吞有保护，单变体仍可挂 MD/OR）。
    const id = slugifyModel(vendor, d.name);
    const ev = d.evaluations || d.eval || {};
    const pricing = d.pricing || {};
    const perf = d.performance || {};
    const priceIn = num(pricing.price_1m_input_tokens || pricing.input || pricing.input_per_1m);
    const priceOut = num(pricing.price_1m_output_tokens || pricing.output || pricing.output_per_1m);
    // Free tier 不给 blended — 用 (in+out)/2 兜底
    const priceBlended = num(pricing.blended) || (priceIn + priceOut > 0 ? (priceIn + priceOut) / 2 : 0);
    const aa = {
      intelligenceIndex: pickEval(ev, [
        "artificial_analysis_intelligence_index",
        "intelligence_index",
        "intelligenceIndex",
        "intelligence",
      ]),
      codingIndex: pickEval(ev, [
        "artificial_analysis_coding_index",
        "coding_index",
        "codingIndex",
        "coding",
        "swe_bench",
      ]),
      agenticIndex: pickEval(ev, [
        "artificial_analysis_agentic_index",
        "agentic_index",
        "agenticIndex",
      ]),
      // Free tier 不返回: math / gpqa / mmlu / hle / lcb — 保留 0
      mathIndex: pickEval(ev, ["math_index", "mathIndex", "math"]),
      gpqa: pickEval(ev, ["gpqa", "gpqa_diamond"]),
      mmluPro: pickEval(ev, ["mmlu_pro", "mmlu"]),
      hle: pickEval(ev, ["hle"]),
      liveCodeBench: pickEval(ev, ["live_code_bench"]),
      priceInputPer1M: priceIn,
      priceOutputPer1M: priceOut,
      priceBlendedPer1M: priceBlended,
      costPerTask: pickCostPerTask(d),
      outputTokensPerSec: num(perf.median_output_tokens_per_second || d.med_speed || d.output_tokens_per_sec),
      timeToFirstTokenSec: num(perf.median_time_to_first_token_seconds || d.ttft),
      endToEndSec: num(perf.median_end_to_end_response_time_seconds),
    };
    out.push(
      toAiModel({
        id,
        name: String(d.name),
        vendor,
        vendorRaw: creatorName || null,
        category: "llm",
        aa,
        sources: { arena: SOURCE.NONE, aa: SOURCE.LIVE, openrouter: SOURCE.NONE },
      }),
    );
  }
  return out;
}

module.exports = {
  id: "artificial-analysis",
  label: "Artificial Analysis",
  requiresKey: true,
  fetch,
  normalize,
  loadAaKey,
};

export const id = "artificial-analysis";
export const label = "Artificial Analysis";
export const requiresKey = true;
