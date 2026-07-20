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

const AA_API = "https://artificialanalysis.ai/api/v2/language/models";
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
 * @param {object} raw { data: [...] }
 * @returns {object[]}
 */
function normalize(raw) {
  const list = Array.isArray(raw && raw.data) ? raw.data : [];
  const out = [];
  for (const d of list) {
    if (!d || !d.name) continue;
    const creator = d.model_creator || d.creator || d.org || "";
    const vendor = normalizeVendor(creator);
    const id = slugifyModel(vendor, d.name);
    const ev = d.evaluations || d.eval || {};
    const pricing = d.pricing || {};
    const aa = {
      intelligenceIndex: pickEval(ev, ["intelligence_index", "intelligenceIndex", "intelligence", "index"]),
      codingIndex: pickEval(ev, ["coding_index", "codingIndex", "coding", "swe_bench", "swebench"]),
      mathIndex: pickEval(ev, ["math_index", "mathIndex", "math", "aime", "math_500"]),
      mmluPro: pickEval(ev, ["mmlu_pro", "mmluPro", "mmlu", "mmlu_5_shot"]),
      gpqa: pickEval(ev, ["gpqa", "gpqa_diamond", "gpqa_0_shot"]),
      hle: pickEval(ev, ["hle", "humanitys_last_exam"]),
      liveCodeBench: pickEval(ev, ["live_code_bench", "liveCodeBench", "lcb"]),
      priceInputPer1M: num(pricing.input || pricing.input_per_1m || pricing.price_input),
      priceOutputPer1M: num(pricing.output || pricing.output_per_1m || pricing.price_output),
      priceBlendedPer1M: num(pricing.blended || pricing.blended_per_1m || pricing.price_blended),
      outputTokensPerSec: num(d.med_speed || d.output_tokens_per_sec || d.speed),
      timeToFirstTokenSec: num(ev.time_to_first_token || ev.ttft || d.ttft),
    };
    out.push(
      toAiModel({
        id,
        name: String(d.name),
        vendor,
        vendorRaw: creator || null,
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
