/**
 * src/main/ai-leaderboard/types.js
 *
 * 模块级常量 + 基础构造（单一真源）。
 * 对应 games 的 src/main/games/normalize.js 的 PLATFORM_META 常量区范式。
 *
 * 这里只放纯数据/纯函数（不引入任何网络/electron 依赖），
 * 保证可单测、且被 fetcher / aggregator / ranking 安全复用。
 */

const SOURCE = { LIVE: "live", SAMPLE: "sample", NONE: "none" };

/** 模型大类 → Arena board 映射。驱动分类 tab 与排名 board。 */
const CATEGORY_META = {
  llm: { label: "大语言模型", board: "text" },
  multimodal: { label: "多模态", board: "vision" },
  code: { label: "代码", board: "code" },
  image: { label: "图像生成", board: "text-to-image" },
  video: { label: "视频", board: "video" },
};

/** 渲染层可排序的评测维度。field 决定读哪个切片，sortKey 决定具体字段。 */
const DIMENSION_META = {
  elo: { label: "综合能力 ELO", field: "arena", sortKey: "score" },
  intelligence: { label: "智能指数", field: "aa", sortKey: "intelligenceIndex" },
  coding: { label: "代码", field: "aa", sortKey: "codingIndex" },
  math: { label: "数学", field: "aa", sortKey: "mathIndex" },
  reasoning: { label: "推理", field: "aa", sortKey: "gpqa" },
  price_perf: { label: "性价比", field: "aa", sortKey: "pricePerfProxy" },
};

/** Top 15 主流厂商 + other 兜底（归一化见 normalizeVendor）。 */
const VENDOR_META = {
  openai: { label: "OpenAI" },
  anthropic: { label: "Anthropic" },
  google: { label: "Google" },
  meta: { label: "Meta" },
  mistral: { label: "Mistral" },
  xai: { label: "xAI" },
  deepseek: { label: "DeepSeek" },
  qwen: { label: "阿里通义" },
  zhipu: { label: "智谱 GLM" },
  cohere: { label: "Cohere" },
  amazon: { label: "Amazon" },
  microsoft: { label: "Microsoft" },
  tencent: { label: "腾讯" },
  baichuan: { label: "百川" },
  moonshot: { label: "月之暗面" },
  other: { label: "其他" },
};

/** vendor 别名 → 归一键（首期覆盖常见写法 + 中英文）。 */
const VENDOR_ALIASES = {
  "open ai": "openai",
  gpt: "openai",
  "anthropic pbc": "anthropic",
  "google deepmind": "google",
  "google llc": "google",
  "meta ai": "meta",
  facebook: "meta",
  "mistral ai": "mistral",
  "x.ai": "xai",
  grok: "xai",
  "deepseek ai": "deepseek",
  alibaba: "qwen",
  "alibaba qwen": "qwen",
  tongyi: "qwen",
  "zhipu ai": "zhipu",
  chatglm: "zhipu",
  aws: "amazon",
  "microsoft research": "microsoft",
  hunyuan: "tencent",
  "baichuan intelligent": "baichuan",
  "moonshot ai": "moonshot",
  kimi: "moonshot",
};

/**
 * 归一化 vendor → VENDOR_META 键（未知归 other）。
 * @param {string|null|undefined} raw
 * @returns {string}
 */
function normalizeVendor(raw) {
  if (!raw) return "other";
  const s = String(raw).toLowerCase().trim();
  if (!s) return "other";
  if (VENDOR_META[s]) return s;
  if (VENDOR_ALIASES[s]) return VENDOR_ALIASES[s];
  const stripped = s
    .replace(/\b(ai|llc|inc|corp|labs|research|pbc|team|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  if (stripped && VENDOR_META[stripped]) return stripped;
  if (stripped && VENDOR_ALIASES[stripped]) return VENDOR_ALIASES[stripped];
  return "other";
}

/**
 * slugify vendor（用于 id 构造与跨源匹配）。与 normalizeVendor 同归一口径。
 * @param {string|null|undefined} raw
 * @returns {string}
 */
function slugifyVendor(raw) {
  return normalizeVendor(raw);
}

/**
 * 构造稳定主键：vendor + name 归一化。
 * 与 normalize.js 的 slugifyModel 同口径（这里自包含，避免循环依赖）。
 * @param {string|null|undefined} vendor
 * @param {string|null|undefined} name
 * @returns {string}
 */
function makeId(vendor, name) {
  const v = normalizeVendor(vendor).replace(/[^a-z0-9]/g, "");
  const n = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${v || "other"}-${n || "unknown"}`;
}

// fetcher 直接 require("./types").slugifyModel（同 makeId 口径）。
// 集中放这里，避免 fetcher 散落跨文件依赖 normalize。
const slugifyModel = makeId;

/**
 * 署名（AA 强制，见架构 §12）。集中放这里，renderer 也复用同结构。
 * 注意：AA 署名必须含可点击链接 https://artificialanalysis.ai/。
 */
const ATTRIBUTION = {
  "artificial-analysis": {
    id: "artificial-analysis",
    text: "数据来源：Artificial Analysis",
    url: "https://artificialanalysis.ai/",
    required: true,
  },
  "arena-snapshot": {
    id: "arena-snapshot",
    text: "社区排名：Arena AI Snapshot（MIT 许可）",
    url: "https://api.wulong.dev/arena-ai-leaderboards",
    required: false,
  },
  openrouter: {
    id: "openrouter",
    text: "目录骨架：OpenRouter",
    url: "https://openrouter.ai/",
    required: false,
  },
  sample: {
    id: "sample",
    text: "示例数据（离线快照，非实时）",
    url: null,
    required: false,
  },
};

function _sourceNorm(v) {
  return v === SOURCE.LIVE || v === SOURCE.SAMPLE ? v : SOURCE.NONE;
}

/**
 * 构造一条规范化的 AiModel（缺字段补安全默认，避免 renderer 解构炸）。
 * @param {object} raw
 * @returns {object}
 */
function toAiModel(raw) {
  const r = raw || {};
  const category = CATEGORY_META[r.category] ? r.category : "llm";
  const id = r.id != null ? String(r.id) : makeId(r.vendor, r.name);
  const sources = r.sources
    ? {
        arena: _sourceNorm(r.sources.arena),
        aa: _sourceNorm(r.sources.aa),
        openrouter: _sourceNorm(r.sources.openrouter),
      }
    : { arena: SOURCE.NONE, aa: SOURCE.NONE, openrouter: SOURCE.NONE };
  return {
    id,
    name: String(r.name || "未知模型"),
    vendor: normalizeVendor(r.vendor),
    vendorRaw: r.vendorRaw || r.vendor || null,
    category,
    license: r.license != null ? String(r.license) : null,
    arena: r.arena && typeof r.arena === "object" ? r.arena : {},
    aa: r.aa && typeof r.aa === "object" ? r.aa : null,
    openrouter:
      r.openrouter && typeof r.openrouter === "object" ? r.openrouter : null,
    sources,
    isSample: Boolean(r.isSample),
    fetchedAt: r.fetchedAt || null,
  };
}

module.exports = {
  SOURCE,
  CATEGORY_META,
  DIMENSION_META,
  VENDOR_META,
  VENDOR_ALIASES,
  ATTRIBUTION,
  normalizeVendor,
  slugifyVendor,
  makeId,
  slugifyModel,
  toAiModel,
};
