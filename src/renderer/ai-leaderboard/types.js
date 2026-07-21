/**
 * src/renderer/ai-leaderboard/types.js
 *
 * v3.0 重设计：双视角信息架构。
 *
 * 视角一「Arena 社区排名」— 数据源 Arena ELO，覆盖 text/vision/code 三 board，
 *   每行必有 ELO 分数，不会出现空列。
 * 视角二「AA 深度分析」— 数据源 Artificial Analysis (Free tier)，仅覆盖 LLM 端点，
 *   提供 intelligence/coding/agentic index + speed + price。
 *
 * 约束（见架构 §4 / §5.6）：
 *  - 不依赖任何外部模块（不引入 api / store），保证纯函数可单测、绝不产生网络出口。
 *  - 所有字段默认值集中在此补全；组件与 store 严禁散落默认值。
 */

/** 数据来源标记。 */
export const SOURCE = { LIVE: "live", SAMPLE: "sample", NONE: "none" };

/* ── 双视角定义 ── */

export const VIEWS = {
  arena: {
    key: "arena",
    label: "Arena",
    segSub: "社区 ELO",
    emoji: "🏆",
    description: "社区盲测 ELO 排名",
    sourceKey: "arena",
  },
  aa: {
    key: "aa",
    label: "Artificial Analysis",
    segSub: "客观分 · 价格 · 速度",
    emoji: "📊",
    description: "Artificial Analysis 客观评测（仅 LLM）",
    sourceKey: "aa",
  },
  livebench: {
    key: "livebench",
    label: "LiveBench",
    segSub: "抗污染评测",
    emoji: "🛡️",
    description: "LiveBench 月度抗污染客观评测（仅 LLM）",
    sourceKey: "livebench",
  },
};

export const VIEW_KEYS = ["arena", "aa", "livebench"];

/* ── Arena 视角：board 子筛选 ── */

// P1：补 image/video 分榜。key 必须是 Arena board 名（text-to-image / text-to-video），
// 与 fetcher-arena.js 落盘切片键一致；category 映射到主进程 CATEGORY_META。
// 数据与 text/vision/code 同源（Arena 社区 ELO），零 AA 成本。
export const ARENA_BOARDS = {
  text: { key: "text", label: "文本", category: "llm" },
  vision: { key: "vision", label: "多模态", category: "multimodal" },
  code: { key: "code", label: "代码", category: "code" },
  image: { key: "text-to-image", label: "图像生成", category: "image" },
  video: { key: "text-to-video", label: "视频", category: "video" },
};

export const ARENA_BOARD_KEYS = ["text", "vision", "code", "image", "video"];

/* ── AA 视角：可选排序维度 ── */

export const AA_DIMENSIONS = {
  intelligence: { key: "intelligence", label: "Intelligence Index", kind: "index" },
  coding: { key: "coding", label: "Coding Index", kind: "index" },
  agentic: { key: "agentic", label: "Agentic Coding", kind: "index" },
  speed: { key: "speed", label: "Output Speed (tok/s)", kind: "speed" },
  price: { key: "price", label: "Output Price ($/1M)", kind: "price" },
};

export const AA_DIMENSION_KEYS = ["intelligence", "coding", "agentic", "speed", "price"];

/** 表头排序列 → 上下文条展示名（与 LeaderboardTable 列头文案一致） */
export const SORT_COLUMN_LABELS = {
  elo: "ELO 分数",
  ci: "置信区间",
  votes: "票数",
  intelligence: "智能指数",
  coding: "代码",
  agentic: "Agentic",
  speed: "速度",
  price: "输出价",
  valueRatio: "性价比",
  lb_overall: "综合",
  lb_coding: "Coding",
  lb_language: "Language",
  lb_instfollow: "指令遵循",
  lb_cost: "$/成功",
};

/* ── LiveBench 视角：抗污染子维度（全部 desc 默认）── */

export const LIVE_DIMENSIONS = {
  lb_overall: { key: "lb_overall", label: "Overall", kind: "livebench" },
  lb_coding: { key: "lb_coding", label: "Coding", kind: "livebench" },
  lb_language: { key: "lb_language", label: "Language", kind: "livebench" },
  lb_instfollow: { key: "lb_instfollow", label: "Instruction Following", kind: "livebench" },
};

export const LIVE_DIMENSION_KEYS = ["lb_overall", "lb_coding", "lb_language", "lb_instfollow"];

/** 升序默认的维度 (低 = 优). */
export const ASC_DEFAULT_DIMS = new Set(["price", "speed"]);

/* ── 兼容旧主进程 IPC：category/dimension 映射 ── */

/**
 * 将视角 + 子筛选映射为主进程 IPC 需要的 {category, dimension}。
 * Arena 视角：category 由 board 决定，dimension 固定 "elo"。
 * AA 视角：category 固定 "llm"，dimension 由用户选择。
 * LiveBench 视角：category 固定 "llm"，dimension 取 lb_* 之一，默认 lb_overall。
 */
export function toIpcParams(view, boardOrDim) {
  if (view === "arena") {
    const board = ARENA_BOARDS[boardOrDim] || ARENA_BOARDS.text;
    return { category: board.category, dimension: "elo" };
  }
  if (view === "livebench") {
    const dim = LIVE_DIMENSION_KEYS.includes(boardOrDim) ? boardOrDim : "lb_overall";
    return { category: "llm", dimension: dim };
  }
  const dim = AA_DIMENSIONS[boardOrDim] ? boardOrDim : "intelligence";
  return { category: "llm", dimension: dim };
}

/* ── 厂商 ── */

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
  bytedance: { key: "bytedance", label: "字节跳动" },
  minimax: { key: "minimax", label: "MiniMax" },
  xiaomi: { key: "xiaomi", label: "小米" },
  "zero-one": { key: "zero-one", label: "零一万物" },
  stepfun: { key: "stepfun", label: "阶跃星辰" },
  moonshot: { key: "moonshot", label: "月之暗面" },
  other: { key: "other", label: "其他" },
};

export const VENDOR_OPTIONS = [
  { key: "all", label: "全部厂商" },
  ...Object.values(VENDOR_META).map((v) => ({ key: v.key, label: v.label })),
];

/** 许可筛选（基于 license 字符串粗判）。 */
export const LICENSE_FILTER_OPTIONS = [
  { key: "all", label: "全部许可" },
  { key: "open", label: "仅开源权重" },
  { key: "proprietary", label: "仅闭源" },
];

/* ── 署名（AA 强制） ── */

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
  openrouter: {
    id: "openrouter",
    text: "目录骨架：OpenRouter",
    url: "https://openrouter.ai",
    required: false,
  },
  sample: {
    id: "sample",
    text: "示例数据（离线快照，非实时）",
    url: null,
    required: false,
  },
};

/* ── 归一化 ── */

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
  "step fun": "stepfun",
  "stepfun ai": "stepfun",
  "moonshot ai": "moonshot",
  "yandex": "other",
  "ibm": "other",
  "ibm research": "other",
  "ai21": "other",
  "ai-21": "other",
  "azure": "other",
};

export function normalizeVendor(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "other";
  const key = raw.trim().toLowerCase();
  if (VENDOR_META[key]) return key;
  if (VENDOR_ALIAS[key]) return VENDOR_ALIAS[key];
  return "other";
}

export function slugifyVendor(raw) {
  return normalizeVendor(raw);
}

/** board key → Arena board name（兼容 format.js primaryValue 的 category→board 查找）。 */
const CATEGORY_BOARD = {
  llm: "text",
  multimodal: "vision",
  code: "code",
  image: "text-to-image",
  video: "text-to-video",
};

export { CATEGORY_BOARD };

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
      livebench: null,
      sources: { arena: "none", aa: "none", openrouter: "none", livebench: "none" },
      isSample: false,
      fetchedAt: null,
    };
  }
  const sources = raw.sources && typeof raw.sources === "object"
    ? {
        arena: raw.sources.arena || "none",
        aa: raw.sources.aa || "none",
        openrouter: raw.sources.openrouter || "none",
        livebench: raw.sources.livebench || "none",
      }
    : { arena: "none", aa: "none", openrouter: "none", livebench: "none" };
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    name: typeof raw.name === "string" ? raw.name : "",
    vendor: normalizeVendor(raw.vendor),
    vendorRaw: typeof raw.vendorRaw === "string" ? raw.vendorRaw : null,
    category: raw.category || "llm",
    license: typeof raw.license === "string" ? raw.license : null,
    arena: raw.arena && typeof raw.arena === "object" ? raw.arena : {},
    aa: raw.aa && typeof raw.aa === "object" ? raw.aa : null,
    openrouter: raw.openrouter && typeof raw.openrouter === "object" ? raw.openrouter : null,
    livebench: raw.livebench && typeof raw.livebench === "object" ? raw.livebench : null,
    sources,
    isSample: !!raw.isSample,
    fetchedAt: typeof raw.fetchedAt === "string" ? raw.fetchedAt : null,
    rankDelta: typeof raw.rankDelta === "number" ? raw.rankDelta : null,
    isNew: !!raw.isNew,
    rankSeries: Array.isArray(raw.rankSeries) ? raw.rankSeries : null,
  };
}

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
      livebench: Number.isFinite(sc.livebench) ? sc.livebench : 0,
    },
    attribution,
    stale: !!res.stale,
    fromCache: !!res.fromCache,
    fetchedAt: typeof res.fetchedAt === "string" ? res.fetchedAt : null,
    lastUpdated: typeof res.lastUpdated === "string" ? res.lastUpdated : null,
    count: typeof res.count === "number" ? res.count : items.length,
    error: typeof res.error === "string" ? res.error : null,
  };
}
