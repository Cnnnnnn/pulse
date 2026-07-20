/**
 * src/main/ai-leaderboard/fetcher-aa.js
 *
 * 主源2：Artificial Analysis（客观分 + 价格 + 速度）。
 * 官方 Free API（x-api-key 头，1000/天限流，强制署名）。
 * 无 key 时走官方 API 会 401，自动回退 GitHub raw 社区快照；
 * 全失败 → {ok:false}（aggregator 兜底链接管）。
 *
 * 单源失败不影响其它源；本 fetcher 内部 try/catch，失败仅返回 {ok:false}。
 */

const { fetchJson, BROWSER_UA } = require("./normalize");
const { SOURCE, toAiModel, slugifyModel, normalizeVendor } = require("./types");
const { logFetchError } = require("../games/log");

const AA_API = "https://artificialanalysis.ai/api/v2/language/models/free";
// 注: AA 不存在可信的 GitHub raw 镜像仓库, 主源失败直接走 aggregator 兜底链
const AA_GITHUB_RAW = null;

let _envLoaded = false;
let _aaKey = undefined; // undefined = 尚未探测

/**
 * 极简 .env 加载器（与 itad.js 同款范式）：
 * 仅当进程尚未有 ARTIFICIAL_ANALYSIS_API_KEY 时，从 process.cwd()/.env 读取。
 */
function loadAaKey() {
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
  } catch (err) {
    logFetchError("aa:env", err);
  }
  return _aaKey;
}

/** 取首个有限数值，否则返回默认。 */
function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** 从 evaluations 对象按候选键取首个有限数值（兼容不同字段命名）。 */
function pickEval(ev, keys, d = 0) {
  if (!ev || typeof ev !== "object") return d;
  for (const k of keys) {
    const v = ev[k];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return d;
}

/** 从 model_creator 提取 vendor string（兼容 {name} / string / 旧字段）。 */
function pickCreatorName(d) {
  const mc = d && d.model_creator;
  if (mc && typeof mc === "object" && mc.name) return String(mc.name);
  if (typeof mc === "string") return mc;
  return d && (d.creator || d.org) ? String(d.creator || d.org) : "";
}

async function fetch(opts = {}) {
  const timeoutMs = opts && opts.timeoutMs;
  const key = loadAaKey();
  const headers = { "User-Agent": BROWSER_UA, Accept: "application/json" };
  if (key) headers["x-api-key"] = key;

  try {
    const data = await fetchJson(AA_API, { timeoutMs: timeoutMs || 12000, headers });
    return {
      ok: true,
      source: "artificial-analysis",
      data,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
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
 * 把 AA 原始 payload 归一化为 AiModel[]（仅填 aa 切片）。
 *
 * AA Free tier 实际 schema (2026-07):
 *   { data: [{ id, name, slug, release_date, model_creator:{id,name},
 *              evaluations:{artificial_analysis_intelligence_index, ...coding_index, ...agentic_index},
 *              pricing:{price_1m_input_tokens, price_1m_output_tokens, ...},
 *              performance:{median_output_tokens_per_second, median_time_to_first_token_seconds, ...}
 *            }] }
 * 数学 / gpqa / hle 等字段 Free tier 不返回 → 0 (UI "暂无")。
 * blended 价 Free tier 不返回 → 用 (input + output)/2 估算。
 * @param {object} raw
 * @returns {object[]}
 */
function normalize(raw) {
  const list = Array.isArray(raw && raw.data) ? raw.data : [];
  const out = [];
  for (const d of list) {
    if (!d || !d.name) continue;
    const creatorName = pickCreatorName(d);
    const vendor = normalizeVendor(creatorName);
    const id = d.slug || slugifyModel(vendor, d.name);
    const ev = d.evaluations || d.eval || {};
    const pricing = d.pricing || {};
    const perf = d.performance || {};
    const priceIn = num(pricing.price_1m_input_tokens || pricing.input || pricing.input_per_1m);
    const priceOut = num(pricing.price_1m_output_tokens || pricing.output || pricing.output_per_1m);
    // Free tier 不给 blended — 用 (in+out)/2 兜底供 ranking.price_perf 用
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
