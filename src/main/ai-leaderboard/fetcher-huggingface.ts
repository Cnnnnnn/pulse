/**
 * src/main/ai-leaderboard/fetcher-huggingface.ts
 *
 * 数据源：HuggingFace Hub Models API（huggingface.co/api/models）。
 *
 * 零 key / 匿名限频 ~1000/h。拉取策略：按 downloads 降序取 top 5000，覆盖
 * Pulse 关心的 20+ 主流厂商的所有模型足够（HF top 5000 已经覆盖了绝大多数
 * OpenAI / Anthropic / Google / Meta / Mistral / DeepSeek / Qwen / 智谱 /
 * 月之暗面 等基模和它们的微调/量化变体）。
 *
 * 定位：社区信号维度 — 跟现有 5 个源正交。
 *   - Arena/AA/LiveBench = 模型能力（评测分数）
 *   - models.dev / openrouter = 模型元数据（context/价格/模态）
 *   - HuggingFace = 用户信号（downloads/likes/活跃度/标签）
 *
 * 字段：downloads (月活使用量代理) / likes (社区认可) / lastModified
 * (活跃度) / pipeline_tag (任务类型) / library_name (推理库) / tags
 * (筛选标签集合, 重点: license:* / base_model:* / arxiv:*)。
 *
 * 单源失败不影响其它源；本 fetcher 内部 try/catch，失败仅返回 {ok:false}。
 *
 * ponytail: HF author 是组织名 (google-bert / meta-llama / Qwen) 不是公司名,
 * 跟 Arena/AA 用 canonical vendor 命名不一致 — 跨源合并靠 mergeModelSlices
 * 的 _normName 兜底 (Qwen3-7B vs Qwen3 7B) 把 slice 接回去.
 */

const { fetchJson, BROWSER_UA } = require("./normalize.ts");
const { SOURCE, toAiModel, slugifyModel, normalizeVendor } = require("./types.ts");
const { logFetchError } = require("../games/log.ts");

const HF_API = "https://huggingface.co/api/models";
const HF_PAGE_SIZE = 1000; // HF API 单页上限实测稳定 1000; 大页可能触发 429
const HF_TOP_N = 5000; // top N by downloads — 覆盖 20+ 主流厂商基模 + 主要变体

/** 安全取数字（HF 偶发返回 null/missing）。null/undefined 走默认。 */
export function num(v: any, d: number = 0): number {
  if (v == null) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** pipeline_tag → CATEGORY_META key（hf 涵盖范围比 models.dev 广, 重点归一）。 */
export function categoryFromPipelineTag(tag: any): string {
  const t = String(tag || "").toLowerCase();
  if (!t) return "llm";
  if (t.includes("text-to-image") || t === "image-to-image" || t === "image-classification") return "image";
  if (t.includes("text-to-video") || t === "video-classification") return "video";
  if (
    t === "text-generation" ||
    t === "text2text-generation" ||
    t === "fill-mask" ||
    t === "summarization" ||
    t === "translation" ||
    t === "conversational" ||
    t === "feature-extraction" ||
    t === "sentence-similarity" ||
    t === "text-classification" ||
    t === "zero-shot-classification" ||
    t === "token-classification" ||
    t === "question-answering" ||
    t === "table-question-answering" ||
    t === "text-ranking"
  ) {
    return "llm";
  }
  // audio / vision-classification / depth-estimation / object-detection 等暂归 multimodal 兜底
  return "multimodal";
}

/** tags 数组里挑关键标签（license / base_model / arxiv / quantized）。 */
export function summarizeTags(tags: any): any {
  if (!Array.isArray(tags)) return { license: null, baseModel: null, arxivIds: [], quantized: false };
  const licenseTags = tags.filter((t) => typeof t === "string" && t.startsWith("license:"));
  const baseModelTags = tags.filter((t) => typeof t === "string" && t.startsWith("base_model:"));
  const arxivTags = tags.filter((t) => typeof t === "string" && t.startsWith("arxiv:"));
  const isQuantized = tags.some(
    (t) => typeof t === "string" && (t.startsWith("base_model:quantized:") || t.includes("quantized")),
  );
  return {
    license: licenseTags.length ? licenseTags[0].slice("license:".length) : null,
    baseModel:
      baseModelTags.length
        ? baseModelTags[0].replace(/^base_model:(quantized:)?/, "")
        : null,
    arxivIds: arxivTags.map((t) => t.slice("arxiv:".length)).filter(Boolean),
    quantized: isQuantized,
  };
}

/**
 * 拉取一页 HF 模型列表（按 downloads 降序）。
 * @param opts
 * @param opts.skip - 跳过条数（分页用）
 * @param opts.limit - 取多少条（默认 HF_PAGE_SIZE）
 * @param opts.timeoutMs - 超时（ms）
 * @returns {Promise<any[]>} 模型数组（已过滤 gated/private）
 */
export async function fetchPage(opts: any = {}): Promise<any[]> {
  const skip = Number.isFinite(opts.skip) ? Number(opts.skip) : 0;
  const limit = Number.isFinite(opts.limit) ? Number(opts.limit) : HF_PAGE_SIZE;
  const timeoutMs = opts.timeoutMs || 15000;
  const url = `${HF_API}?sort=downloads&direction=-1&limit=${limit}&skip=${skip}&full=true`;
  const data = await fetchJson(url, {
    timeoutMs,
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
  });
  if (!Array.isArray(data)) return [];
  return data.filter((m) => m && m.id && !m.private && !m.gated);
}

/**
 * 主入口：分页拉 top HF_TOP_N 条。
 * 单源失败 → 返回 {ok:false}，不影响 aggregator 兜底链。
 * @param opts
 * @returns {Promise<{ok:boolean, source:string, data:any[]|null, fetchedAt:string, count:number}>}
 */
export async function fetch(opts: any = {}): Promise<any> {
  const topN = Number.isFinite(opts.topN) ? Number(opts.topN) : HF_TOP_N;
  const pageSize = HF_PAGE_SIZE;
  const pages = Math.ceil(topN / pageSize);
  try {
    const all: any[] = [];
    // ponytail: 串行分页避免触发 HF 限频 (~1000/h 匿名), 失败立即终止整批.
    for (let p = 0; p < pages; p++) {
      const skip = p * pageSize;
      const limit = Math.min(pageSize, topN - skip);
      const list = await fetchPage({ skip, limit, timeoutMs: opts.timeoutMs });
      all.push(...list);
      if (list.length < limit) break; // 早退：上游已无更多
      if (all.length >= topN) break;
    }
    return {
      ok: true,
      source: "huggingface",
      data: all.slice(0, topN),
      fetchedAt: new Date().toISOString(),
      count: Math.min(all.length, topN),
    };
  } catch (err) {
    logFetchError("huggingface", err);
    return {
      ok: false,
      source: "huggingface",
      data: null,
      fetchedAt: new Date().toISOString(),
      count: 0,
    };
  }
}

/**
 * 把 HF API payload 归一化为 AiModel[]（仅填 huggingface 切片）。
 *
 * 单条 schema (2026-07 验证, top 5000 by downloads):
 *   { id: "author/model", author: "author", downloads, likes, lastModified,
 *     pipeline_tag, library_name, tags[], gated, private, createdAt, ... }
 *
 * 归一化原则:
 *   - 每条 model → 一条 AiModel（仅填 huggingface 切片, 其它 slice 留给其它 fetcher 合并）
 *   - vendorRaw = author（HF 组织名; 跟其它源不一致是预期的, mergeModelSlices 兜底）
 *   - vendor = normalizeVendor(author) + VENDOR_ALIASES 兜底（google-bert → google 等）
 *   - id = slugifyModel(vendor, name), name 拆自 id 第二段（author/model）
 *   - gated / private 模型在 fetch() 阶段已过滤
 * @param raw
 * @returns {object[]}
 */
export function normalize(raw: any): any[] {
  const list = Array.isArray(raw && raw.data) ? raw.data : Array.isArray(raw) ? raw : [];
  const out: any[] = [];
  for (const m of list) {
    if (!m || !m.id) continue;
    const idStr = String(m.id);
    const slashIdx = idStr.indexOf("/");
    if (slashIdx <= 0 || slashIdx >= idStr.length - 1) continue;
    const author = String(m.author || idStr.slice(0, slashIdx) || "");
    const modelName = idStr.slice(slashIdx + 1);
    if (!modelName) continue;
    const vendor = normalizeVendor(author);
    const id = slugifyModel(vendor, modelName);
    const tagSummary = summarizeTags(m.tags);
    out.push(
      toAiModel({
        id,
        name: modelName,
        vendor,
        vendorRaw: author,
        category: categoryFromPipelineTag(m.pipeline_tag),
        // ponytail: license 顶层同步 (v2.79.5+ fix) — renderer licenseKind(m.license)
        // 走顶层 license 字段, 不读 m.huggingface.license. 没顶层 license 时 HF 视图
        // 不显示许可徽章 (跟其它 fetcher 走顶层 license 字段的口径一致).
        license: tagSummary.license,
        huggingface: {
          downloads: num(m.downloads),
          likes: num(m.likes),
          lastModified: typeof m.lastModified === "string" ? m.lastModified : null,
          createdAt: typeof m.createdAt === "string" ? m.createdAt : null,
          pipelineTag: typeof m.pipeline_tag === "string" ? m.pipeline_tag : null,
          libraryName: typeof m.library_name === "string" ? m.library_name : null,
          tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === "string").slice(0, 50) : [],
          license: tagSummary.license,
          baseModel: tagSummary.baseModel,
          arxivIds: tagSummary.arxivIds,
          quantized: tagSummary.quantized,
          author,
          repoUrl: `https://huggingface.co/${idStr}`,
        },
        sources: {
          arena: SOURCE.NONE,
          aa: SOURCE.NONE,
          openrouter: SOURCE.NONE,
          livebench: SOURCE.NONE,
          modelsdev: SOURCE.NONE,
          huggingface: SOURCE.LIVE,
        },
      }),
    );
  }
  return out;
}

module.exports = {
  id: "huggingface",
  label: "HuggingFace",
  requiresKey: false,
  fetch,
  normalize,
  // 暴露给单测
  num,
  fetchPage,
  categoryFromPipelineTag,
  summarizeTags,
  HF_API,
  HF_PAGE_SIZE,
  HF_TOP_N,
};

export const id = "huggingface";
export const label = "HuggingFace";
export const requiresKey = false;
