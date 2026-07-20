/**
 * src/renderer/ai-leaderboard/types.js
 *
 * 渲染端纯类型 + 常量（单一真源，对齐 main/ai-leaderboard/types.js 形状）。
 *
 * 约束（见架构 §4 / §5.6）：
 *  - 不依赖任何外部模块（不引入 api / store），保证纯函数可单测、绝不产生网络出口。
 *  - 所有字段默认值集中在此补全；组件与 store 严禁散落默认值。
 */

/** 数据来源标记（同 games 的 'live'/'sample' 语义）。 */
export const SOURCE = { LIVE: "live", SAMPLE: "sample", NONE: "none" };

/**
 * 模型大类 → Arena board 映射 + 展示元数据。
 * 分类 Tabs 首期开启 5 个（团队拍板）：LLM / 多模态 / 代码 / 图像生成 / 视频。
 * 对应 Arena board: text / vision / code / text-to-image / video。
 */
export const CATEGORY_META = {
  llm: { key: "llm", label: "大语言模型", short: "LLM", emoji: "🧠", board: "text" },
  multimodal: { key: "multimodal", label: "多模态", short: "多模态", emoji: "👁", board: "vision" },
  code: { key: "code", label: "代码", short: "代码", emoji: "💻", board: "code" },
  image: { key: "image", label: "图像生成", short: "图像", emoji: "🎨", board: "text-to-image" },
  video: { key: "video", label: "视频", short: "视频", emoji: "🎬", board: "video" },
};

/** 分类 Tab 展示顺序（固定）。 */
export const CATEGORIES = ["llm", "multimodal", "code", "image", "video"];

/**
 * 暂未上线的分类（架构 §13 Q4：图像 / 视频榜单数据稀疏，首期占位）。
 * Tab 仍可见以保留路线图，但禁用点击、不触发请求。
 */
export const CATEGORIES_COMING_SOON = new Set(["image", "video"]);

/** 判断分类是否处于「即将上线」态。 */
export function isCategoryComingSoon(key) {
  return CATEGORIES_COMING_SOON.has(key);
}

/**
 * 评测维度元数据。
 * - kind: 决定 ModelRow 主分列如何格式化（elo 取整 / index 1 位小数 / pricePerf 代理）。
 * - sortKey: 本地 sortModels 提取排序值的字段（与 main ranking 通用处理一致）。
 */
export const DIMENSION_META = {
  elo: { key: "elo", label: "综合能力 ELO", field: "arena", sortKey: "score", kind: "elo" },
  intelligence: { key: "intelligence", label: "智能指数", field: "aa", sortKey: "intelligenceIndex", kind: "index" },
  coding: { key: "coding", label: "代码", field: "aa", sortKey: "codingIndex", kind: "index" },
  math: { key: "math", label: "数学", field: "aa", sortKey: "mathIndex", kind: "index" },
  reasoning: { key: "reasoning", label: "推理", field: "aa", sortKey: "gpqa", kind: "index" },
  price_perf: { key: "price_perf", label: "性价比", field: "aa", sortKey: "pricePerfProxy", kind: "pricePerf" },
};

/** 维度下拉顺序。 */
export const DIMENSIONS = ["elo", "intelligence", "coding", "math", "reasoning", "price_perf"];

/**
 * 厂商归一化元数据（Top 15 + other 兜底）。
 * 未知 vendor 归 'other'（筛选下拉可见）。
 */
export const VENDOR_META = {
  openai: { key: "openai", label: "OpenAI" },
  anthropic: { key: "anthropic", label: "Anthropic" },
  google: { key: "google", label: "Google" },
  meta: { key: "meta", label: "Meta" },
  mistral: { key: "mistral", label: "Mistral" },
  xai: { key: "xai", label: "xAI" },
  deepseek: { key: "deepseek", label: "DeepSeek" },
  qwen: { key: "qwen", label: "阿里通义" },
  zhipu: { key: "zhipu", label: "智谱 GLM" },
  cohere: { key: "cohere", label: "Cohere" },
  amazon: { key: "amazon", label: "Amazon" },
  microsoft: { key: "microsoft", label: "Microsoft" },
  alibaba: { key: "alibaba", label: "阿里" },
  tencent: { key: "tencent", label: "腾讯" },
  baidu: { key: "baidu", label: "百度" },
  other: { key: "other", label: "其他" },
};

/** 厂商筛选下拉选项（全部 + Top 15 + 其他）。 */
export const VENDOR_OPTIONS = [
  { key: "all", label: "全部厂商" },
  ...Object.values(VENDOR_META).map((v) => ({ key: v.key, label: v.label })),
];

/** 分类 Tab 列表（{key,label} 形态，供 FilterBar 直接 map）。 */
export const CATEGORY_LIST = CATEGORIES.map((k) => ({
  key: k,
  label: (CATEGORY_META[k] || {}).label || k,
}));

/** 维度下拉列表（{key,label} 形态）。 */
export const DIMENSION_LIST = DIMENSIONS.map((k) => ({
  key: k,
  label: (DIMENSION_META[k] || {}).label || k,
}));

/** 厂商下拉列表（不含 'all'，FilterBar 自行加「全部厂商」）。 */
export const VENDOR_LIST = Object.values(VENDOR_META).map((v) => ({
  key: v.key,
  label: v.label,
}));

/**
 * 署名清单（AA 强制，见架构 §12）。
 * 渲染层 Footer 无条件渲染 required=true 的 AA 署名（含可点击链接）。
 */
export const ATTRIBUTION = {
  "artificial-analysis": {
    id: "artificial-analysis",
    text: "数据来源：Artificial Analysis",
    url: "https://artificialanalysis.ai/",
    required: true,
  },
  "arena-snapshot": {
    id: "arena-snapshot",
    text: "社区排名：Arena AI Snapshot（MIT）",
    url: "https://api.wulong.dev",
    required: false,
  },
  "openrouter": {
    id: "openrouter",
    text: "目录骨架：OpenRouter",
    url: "https://openrouter.ai",
    required: false,
  },
  "sample": {
    id: "sample",
    text: "示例数据（离线快照，非实时）",
    url: null,
    required: false,
  },
};

/** 常见厂商别名归一（raw 中文/带空格 → VENDOR_META key）。 */
const VENDOR_ALIAS = {
  "阿里": "alibaba",
  "阿里通义": "qwen",
  "通义千问": "qwen",
  "智谱": "zhipu",
  "智谱 ai": "zhipu",
  "腾讯": "tencent",
  "百度": "baidu",
  "文心": "baidu",
  "open ai": "openai",
  "mistral ai": "mistral",
  "x-ai": "xai",
  "google deepmind": "google",
};

/**
 * 归一化 vendor（raw → VENDOR_META key）。
 * @param {any} raw
 * @returns {string} VENDOR_META key 或 'other'
 */
export function normalizeVendor(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "other";
  const key = raw.trim().toLowerCase();
  if (VENDOR_META[key]) return key;
  if (VENDOR_ALIAS[key]) return VENDOR_ALIAS[key];
  return "other";
}

/** slugifyVendor 与 normalizeVendor 语义一致（命名对齐 main）。 */
export function slugifyVendor(raw) {
  return normalizeVendor(raw);
}

/**
 * 将任意 raw 对象规整为完整 AiModel（缺字段补默认值）。
 * @param {any} raw
 * @returns {object} AiModel
 */
export function normalizeAiModel(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      id: "",
      name: "",
      vendor: "other",
      vendorRaw: null,
      category: "llm",
      license: null,
      arena: {},
      aa: null,
      openrouter: null,
      sources: { arena: "none", aa: "none", openrouter: "none" },
      isSample: false,
      fetchedAt: null,
    };
  }
  const sources = raw.sources && typeof raw.sources === "object"
    ? {
      arena: raw.sources.arena || "none",
      aa: raw.sources.aa || "none",
      openrouter: raw.sources.openrouter || "none",
    }
    : { arena: "none", aa: "none", openrouter: "none" };
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    name: typeof raw.name === "string" ? raw.name : "",
    vendor: normalizeVendor(raw.vendor),
    vendorRaw: typeof raw.vendorRaw === "string" ? raw.vendorRaw : null,
    category: CATEGORY_META[raw.category] ? raw.category : "llm",
    license: typeof raw.license === "string" ? raw.license : null,
    arena: raw.arena && typeof raw.arena === "object" ? raw.arena : {},
    aa: raw.aa && typeof raw.aa === "object" ? raw.aa : null,
    openrouter: raw.openrouter && typeof raw.openrouter === "object" ? raw.openrouter : null,
    sources,
    isSample: !!raw.isSample,
    fetchedAt: typeof raw.fetchedAt === "string" ? raw.fetchedAt : null,
  };
}

/**
 * 规整 IPC 返回的 BoardResult（防御脏数据 / 缺字段）。
 * @param {any} res
 * @returns {object} BoardResult
 */
export function normalizeBoardResult(res) {
  if (!res || typeof res !== "object") {
    return {
      ok: false,
      items: [],
      sources: {},
      attribution: [],
      stale: false,
      fromCache: false,
      fetchedAt: null,
      count: 0,
      error: "空响应",
    };
  }
  const items = Array.isArray(res.items) ? res.items.map(normalizeAiModel) : [];
  const attribution = Array.isArray(res.attribution) ? res.attribution : [];
  const sc = res.sourceCoverage && typeof res.sourceCoverage === "object" ? res.sourceCoverage : {};
  return {
    ok: res.ok !== false,
    category: res.category || "llm",
    dimension: res.dimension || "elo",
    vendor: res.vendor || "all",
    items,
    sources: res.sources && typeof res.sources === "object" ? res.sources : {},
    sourceCoverage: {
      arena: Number.isFinite(sc.arena) ? sc.arena : 0,
      aa: Number.isFinite(sc.aa) ? sc.aa : 0,
      openrouter: Number.isFinite(sc.openrouter) ? sc.openrouter : 0,
    },
    attribution,
    stale: !!res.stale,
    fromCache: !!res.fromCache,
    fetchedAt: typeof res.fetchedAt === "string" ? res.fetchedAt : null,
    count: typeof res.count === "number" ? res.count : items.length,
    error: typeof res.error === "string" ? res.error : null,
  };
}
