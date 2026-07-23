/**
 * src/main/ai-leaderboard/fetcher-openrouter.ts
 *
 * 兜底L1：OpenRouter /api/v1/models（实时目录骨架，非排名）。
 * 免鉴权。当 Arena + AA 全失败时提供「有模型但无分数」的骨架，
 * 保证 UI 不空白（渲染层对缺分字段显示「暂无」）。
 *
 * 单源失败不影响其它源；本 fetcher 内部 try/catch，失败仅返回 {ok:false}。
 */

const { fetchJson, BROWSER_UA } = require("./normalize.ts");
const { SOURCE, toAiModel, slugifyModel, normalizeVendor } = require("./types.ts");
const { logFetchError } = require("../games/log.ts");

const OR_API = "https://openrouter.ai/api/v1/models";

/** 由 architecture 模态推断 category（仅作兜底分类提示）。 */
export function inferCategoryFromArch(arch: any, d: any): string {
  const a = String(arch || "").toLowerCase();
  const name = String((d && d.name) || (d && d.id) || "").toLowerCase();
  if (a.includes("image") || name.includes("image") || name.includes("dall") || name.includes("flux")) {
    return "image";
  }
  if (a.includes("video") || name.includes("video") || name.includes("sora") || name.includes("kling")) {
    return "video";
  }
  if (a.includes("audio") || name.includes("audio") || name.includes("tts")) {
    return "multimodal";
  }
  return "llm";
}

export async function fetch(opts: any = {}): Promise<any> {
  const timeoutMs = opts && opts.timeoutMs;
  try {
    const data = await fetchJson(OR_API, {
      timeoutMs: timeoutMs || 12000,
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    });
    return {
      ok: true,
      source: "openrouter",
      data,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    logFetchError("openrouter", err);
    return {
      ok: false,
      source: "openrouter",
      data: null,
      fetchedAt: new Date().toISOString(),
    };
  }
}

/**
 * 把 OpenRouter 目录归一化为 AiModel[]（仅填 openrouter 切片）。
 * @param raw { data: [...] }
 * @returns {object[]}
 */
export function normalize(raw: any): any[] {
  const list = Array.isArray(raw && raw.data) ? raw.data : [];
  const out: any[] = [];
  for (const d of list) {
    if (!d || !d.id) continue;
    const idParts = String(d.id).split("/");
    const vendorRaw =
      idParts.length > 1 ? idParts[0] : (d.top_provider && d.top_provider.slug) || "";
    const vendor = normalizeVendor(vendorRaw);
    const name = d.name || d.id;
    const id = slugifyModel(vendor, name);
    const archModality =
      (d.architecture && (d.architecture.modality || d.architecture.input_modalities)) ||
      null;
    out.push(
      toAiModel({
        id,
        name: String(name),
        vendor,
        vendorRaw: vendorRaw || null,
        category: inferCategoryFromArch(archModality, d),
        openrouter: {
          contextLength: Number(d.context_length) || 0,
          description: d.description ? String(d.description) : null,
          architecture: archModality ? String(archModality) : null,
          topProvider:
            d.top_provider && d.top_provider.name ? String(d.top_provider.name) : null,
          // ponytail: OR pricing.prompt / completion 是 USD per token, ×1M 转 $/1M 才能跟 models.dev slice 语义对齐.
          // 字段值为 "-1" 表示 router 占位 / 未定价, 视作未知 (null).
          inputCostPer1M:
            d.pricing && d.pricing.prompt && Number(d.pricing.prompt) >= 0
              ? Number(d.pricing.prompt) * 1_000_000
              : null,
          outputCostPer1M:
            d.pricing && d.pricing.completion && Number(d.pricing.completion) >= 0
              ? Number(d.pricing.completion) * 1_000_000
              : null,
          cacheReadCostPer1M:
            d.pricing && d.pricing.input_cache_read && Number(d.pricing.input_cache_read) >= 0
              ? Number(d.pricing.input_cache_read) * 1_000_000
              : null,
        },
        sources: { arena: SOURCE.NONE, aa: SOURCE.NONE, openrouter: SOURCE.LIVE },
      }),
    );
  }
  return out;
}

module.exports = {
  id: "openrouter",
  label: "OpenRouter",
  requiresKey: false,
  fetch,
  normalize,
};

export const id = "openrouter";
export const label = "OpenRouter";
export const requiresKey = false;
