/**
 * src/main/ai-leaderboard/fetcher-models-dev.js
 *
 * 主源：models.dev（开放模型目录聚合，models.dev/api.json）。
 *
 * 零 key / 零 rate limit / 静态 CDN 缓存。
 * 字段覆盖：context window、input-output 价格、modalities、tool_call / reasoning、
 * release_date、knowledge cutoff、status、open_weights、family。
 *
 * 定位：填补 AA Free tier 不返回的"元数据维度"（context / 模态 / 是否开源 / 知识截止）。
 * 不是评测榜，不能替代 AA / Arena / LiveBench 的分数 — 仅补全每个 AiModel 的 modelsdev 切片。
 *
 * 单源失败不影响其它源；本 fetcher 内部 try/catch，失败仅返回 {ok:false}。
 */

const { fetchJson, BROWSER_UA } = require("./normalize");
const { SOURCE, toAiModel, slugifyModel, normalizeVendor } = require("./types");
const { logFetchError } = require("../games/log");

const MODELS_DEV_API = "https://models.dev/api.json";

/** 取首个有限数值，否则返回默认。 */
function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** modalities → 简单 category 兜底（视频 / 图像 / 默认 llm）。 */
function inferCategory(modalities) {
  const out = (modalities && modalities.output) || [];
  if (out.includes("video")) return "video";
  if (out.includes("image")) return "image";
  return "llm";
}

/** status 字段 → license 字段粗归一（renderer 用 license 做开源/闭源筛选）。 */
function licenseFromStatus(status, openWeights) {
  if (openWeights === true) return "open";
  if (status === "deprecated") return "deprecated";
  if (status === "alpha" || status === "beta") return status;
  if (status) return String(status);
  return null;
}

async function fetch(opts = {}) {
  const timeoutMs = opts && opts.timeoutMs;
  try {
    const data = await fetchJson(MODELS_DEV_API, {
      timeoutMs: timeoutMs || 15000,
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    });
    return {
      ok: true,
      source: "models-dev",
      data,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    logFetchError("models-dev", err);
    return {
      ok: false,
      source: "models-dev",
      data: null,
      fetchedAt: new Date().toISOString(),
    };
  }
}

/**
 * 把 models.dev 原始 payload 归一化为 AiModel[]（仅填 modelsdev 切片）。
 *
 * 原始 schema (2026-07 验证, 5696 models / 167 providers):
 *   { "<provider_id>": { id, name, env[], api, doc, npm,
 *       models: { "<model_id>": {
 *         id, name, family, attachment, reasoning, reasoning_options,
 *         tool_call, structured_output, temperature, knowledge, release_date,
 *         last_updated, modalities:{input[],output[]}, open_weights,
 *         limit:{context, input, output}, cost:{input, output, cache_read, ...},
 *         status?, supported_endpoints?, ...
 *       } } } }
 *
 * 归一化原则:
 *   - 每条 model → 一条 AiModel（仅填 modelsdev 切片, 其它 slice 留给其它 fetcher 合并）
 *   - vendor = provider_id（models.dev 的 provider id 与我们 VENDOR_META 同名, normalizeVendor 会兜底）
 *   - id = slugifyModel(vendor, model.name)
 *   - cost.input/output 转 $/1M（models.dev 原始是 $/M, 数值不变, 这里统一语义为 Per1M）
 * @param {object} raw
 * @returns {object[]}
 */
function normalize(raw) {
  if (!raw || typeof raw !== "object") return [];
  // ponytail: 实测 models.dev 拉回 / 写盘都是 { data: { <provider_id>: {...} }, fetchedAt } 包裹
  // (跟 AA 同 wrapper 形状, 但 AA.data 是数组, models.dev.data 是字典). 这里把 .data 解一层.
  const root = raw.data && typeof raw.data === "object" ? raw.data : raw;
  // ponytail: 同一 model 名在 models.dev 被挂在多个 router/aggregator provider 下 (frogbot/openai/azure 等都卖 GPT-5.5).
  // 我们的合并主键 = vendor + name 归一 id; id 重复意味着两个 provider 对应同一 model — 必须只保留一份, 否则 aggregator 跨源合并会拿到错的 metadata.
  // 策略: 先扫 VENDOR_META 内的 primary provider (canonical), 再扫其它 (router), 同 id 跳过.
  const KNOWN_VENDORS = new Set([
    "openai","anthropic","google","meta","mistral","xai","deepseek","qwen","zhipu","cohere","amazon","microsoft","tencent","baichuan","moonshot","bytedance","minimax","xiaomi","zero-one","stepfun",
  ]);
  const allProviders = Object.keys(root);
  const ordered = [
    ...allProviders.filter((p) => KNOWN_VENDORS.has(p)),
    ...allProviders.filter((p) => !KNOWN_VENDORS.has(p)),
  ];
  const seen = new Set();
  const out = [];
  for (const providerId of ordered) {
    const provider = root[providerId];
    if (!provider || typeof provider !== "object") continue;
    const models = provider.models;
    if (!models || typeof models !== "object") continue;
    const providerName = provider.name || providerId;
    for (const modelId of Object.keys(models)) {
      const m = models[modelId];
      if (!m || typeof m !== "object" || !m.name) continue;
      const vendor = normalizeVendor(providerId);
      const id = slugifyModel(vendor, m.name);
      // ponytail: router 副本跟 canonical 的 id 不同 (vendor=openai vs vendor=other), 单纯 id 去重拦不住.
      // seen key 直接用归一 baseName (跨 vendor 共用): canonical 先扫先注册, router 命中跳过.
      // 末尾变体后缀 (-high/-xhigh/-preview/-instant/-pro/-thinking/-lite/-turbo/-reasoning/-chat/-max) 一并剥, 让 router 的变体副本也归一.
      const baseName = String(m.name)
        .replace(/\s*\([^)]*\)\s*$/, "")
        .replace(/[-_](high|medium|low|xhigh|preview|chat|instant|max|pro|thinking|lite|turbo|reasoning)$/i, "")
        .trim();
      const normKey = baseName.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normKey && seen.has(normKey)) continue;
      if (normKey) seen.add(normKey);
      const modalities = m.modalities && typeof m.modalities === "object" ? m.modalities : null;
      const limit = m.limit && typeof m.limit === "object" ? m.limit : {};
      const cost = m.cost && typeof m.cost === "object" ? m.cost : {};
      const out_ = {
        contextLength: num(limit.context),
        inputLimit: num(limit.input),
        outputLimit: num(limit.output),
        // models.dev cost 已是 $/M, 与 AA 切片语义一致 → Per1M
        inputCostPer1M: num(cost.input),
        outputCostPer1M: num(cost.output),
        cacheReadCostPer1M: num(cost.cache_read),
        modalities: modalities
          ? {
              input: Array.isArray(modalities.input) ? modalities.input.slice() : [],
              output: Array.isArray(modalities.output) ? modalities.output.slice() : [],
            }
          : { input: [], output: [] },
        toolCall: m.tool_call === true,
        reasoning: m.reasoning === true,
        structuredOutput: m.structured_output === true,
        openWeights: m.open_weights === true,
        knowledge: typeof m.knowledge === "string" ? m.knowledge : null,
        releaseDate: typeof m.release_date === "string" ? m.release_date : null,
        lastUpdated: typeof m.last_updated === "string" ? m.last_updated : null,
        status: typeof m.status === "string" ? m.status : null,
        family: typeof m.family === "string" ? m.family : null,
        description: typeof m.description === "string" ? m.description : null,
      };
      out.push(
        toAiModel({
          id,
          name: String(m.name),
          vendor,
          vendorRaw: providerName,
          category: inferCategory(modalities),
          license: licenseFromStatus(out_.status, out_.openWeights),
          modelsdev: out_,
          sources: {
            arena: SOURCE.NONE,
            aa: SOURCE.NONE,
            openrouter: SOURCE.NONE,
            livebench: SOURCE.NONE,
            modelsdev: SOURCE.LIVE,
          },
        }),
      );
    }
  }
  return out;
}

module.exports = {
  id: "models-dev",
  label: "Models.dev",
  requiresKey: false,
  fetch,
  normalize,
};