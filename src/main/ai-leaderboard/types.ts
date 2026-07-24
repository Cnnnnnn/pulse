/**
 * src/main/ai-leaderboard/types.ts
 *
 * 模块级常量 + 基础构造（单一真源）。
 * 对应 games 的 src/main/games/normalize.js 的 PLATFORM_META 常量区范式。
 *
 * 这里只放纯数据/纯函数（不引入任何网络/electron 依赖），
 * 保证可单测、且被 fetcher / aggregator / ranking 安全复用。
 */
"use strict";

export const SOURCE: Record<string, string> = { LIVE: "live", SAMPLE: "sample", NONE: "none" };

/** 模型大类 → Arena board 映射。驱动分类 tab 与排名 board。 */
export const CATEGORY_META: Record<string, any> = {
  llm: { label: "大语言模型", board: "text" },
  multimodal: { label: "多模态", board: "vision" },
  code: { label: "代码", board: "code" },
  image: { label: "图像生成", board: "text-to-image" },
  video: { label: "视频", board: "text-to-video" },
};

/** 渲染层可排序的评测维度。field 决定读哪个切片，sortKey 决定具体字段。 */
/** v2.83: 维度表按 AA Free tier 实际可填充的字段重做.
 *  之前 6 个维度 (math/reasoning/price_perf) 在 Free tier 0 覆盖, 删除.
 *  新增 agentic (AA coding 子项, 23% 覆盖) / speed (AA 性能, 大部分覆盖)
 *  / price (AA 价, 大部分覆盖).
 *  Pro/Commercial 维 (math / gpqa) 后续如需复活, 在 this 顶部加 flag 控制可见性. */
export const DIMENSION_META: Record<string, any> = {
  elo: { label: "Arena ELO", field: "arena", sortKey: "score" },
  intelligence: { label: "Intelligence Index", field: "aa", sortKey: "intelligenceIndex" },
  coding: { label: "Coding Index", field: "aa", sortKey: "codingIndex" },
  agentic: { label: "Agentic Coding", field: "aa", sortKey: "agenticIndex" },
  speed: { label: "Output Speed (tok/s)", field: "aa", sortKey: "outputTokensPerSec" },
  price: { label: "Output Price ($/1M)", field: "aa", sortKey: "priceOutputPer1M" },
  // LiveBench 抗污染客观榜 (livebench.ai GitHub Pages 静态 CSV, 月更新).
  // aggregator.fetch 拿到后此维度展示; ranking.sortValue 走 livebench 切片.
  lb_overall: {
    label: "LiveBench Overall",
    field: "livebench",
    sortKey: "overall",
  },
  lb_coding: {
    label: "LiveBench Coding",
    field: "livebench",
    sortKey: "byCategory.Coding",
  },
  lb_language: {
    label: "LiveBench Language",
    field: "livebench",
    sortKey: "byCategory.Language",
  },
  lb_instfollow: {
    label: "LiveBench Instruction Following",
    field: "livebench",
    sortKey: "byCategory.IF",
  },
  // ponytail: LiveBench byCategory 5 个全暴露 (v2.79.7+).
  // fetcher-livebench.normalize 已经在 byCategory 自动算 5 个 mean (Coding/Language/Reasoning/Math/IF),
  // 这里只是 UI 暴露, ranking.sortValue 走通用 dot path 不用改.
  lb_reasoning: {
    label: "LiveBench Reasoning",
    field: "livebench",
    sortKey: "byCategory.Reasoning",
  },
  lb_math: {
    label: "LiveBench Math",
    field: "livebench",
    sortKey: "byCategory.Math",
  },
  // ponytail: HF 社区信号维度 (v2.79.5+) — 跟现有 5 类 (Arena/AA/LB) 完全正交,
  // 走 huggingface 切片, sortKey 直接读 downloads/likes 数字.
  hf_downloads: {
    label: "HuggingFace Downloads",
    field: "huggingface",
    sortKey: "downloads",
  },
  hf_likes: {
    label: "HuggingFace Likes",
    field: "huggingface",
    sortKey: "likes",
  },
  // ponytail: HF Trending (v2.79.6+) — 新发布爆款优先.
  // sortKey "trendingScore" 是占位 (m.huggingface 里没这字段),
  // 真实计算在 ranking.ts sortValue 走 special case 调 fetcher.computeTrendingScore.
  // 为什么不存 m.huggingface.trendingScore: 现有 toEqual({downloads,likes}) 断言
  // 严格匹配 schema, 加字段会破坏. 按需算保持 schema 稳定.
  hf_trending: {
    label: "HuggingFace Trending",
    field: "huggingface",
    sortKey: "trendingScore",
  },
  // ponytail: hf_license (v2.79.6+) — 按 license 类别聚类 (open/proprietary/unknown).
  // sortKey "licenseKind" 是占位; ranking 走 special case 返回 licenseKind 字符串.
  // (跟 hf_trending 同模式 — sortValue 不依赖 DIMENSION_META.sortKey 直读字段.)
  hf_license: {
    label: "HuggingFace License",
    field: "huggingface",
    sortKey: "licenseKind",
  },
};

/** Top 20 主流厂商 + other 兜底（归一化见 normalizeVendor）。 */
export const VENDOR_META: Record<string, any> = {
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
  bytedance: { label: "字节跳动" },
  minimax: { label: "MiniMax" },
  xiaomi: { label: "小米" },
  "zero-one": { label: "零一万物" },
  stepfun: { label: "阶跃星辰" },
  other: { label: "其他" },
};

/** vendor 别名 → 归一键（覆盖常见写法 + 中英文）。
 *  v3.0: 补齐 Arena 实际出现的国产厂商 (Bytedance/MiniMax/Xiaomi/Z.ai)
 *  + 常见变体 (doubao/abab/mimo/yi-/step 等). */
export const VENDOR_ALIASES: Record<string, string> = {
  "open ai": "openai",
  gpt: "openai",
  "anthropic pbc": "anthropic",
  claude: "anthropic",
  "google deepmind": "google",
  "google llc": "google",
  gemini: "google",
  "meta ai": "meta",
  facebook: "meta",
  "mistral ai": "mistral",
  "x.ai": "xai",
  grok: "xai",
  "xai corp": "xai",
  spacexai: "xai",
  "deepseek ai": "deepseek",
  alibaba: "qwen",
  "alibaba qwen": "qwen",
  qwen: "qwen",
  tongyi: "qwen",
  "zhipu ai": "zhipu",
  chatglm: "zhipu",
  glm: "zhipu",
  "z ai": "zhipu",
  "z.ai": "zhipu",
  zai: "zhipu",
  aws: "amazon",
  "microsoft research": "microsoft",
  hunyuan: "tencent",
  "baichuan intelligent": "baichuan",
  "moonshot ai": "moonshot",
  kimi: "moonshot",
  // 字节跳动
  bytedance: "bytedance",
  "byte dance": "bytedance",
  doubao: "bytedance",
  "豆包": "bytedance",
  字节: "bytedance",
  "字节跳动": "bytedance",
  // MiniMax
  "minimax ai": "minimax",
  "稀宇": "minimax",
  "稀宇科技": "minimax",
  abab: "minimax",
  // 小米
  "xiaomi ai": "xiaomi",
  "小米": "xiaomi",
  mimo: "xiaomi",
  // 零一万物
  "01.ai": "zero-one",
  "01 ai": "zero-one",
  "零一万物": "zero-one",
  "yi-": "zero-one",
  // 阶跃星辰
  "step fun": "stepfun",
  "stepfun ai": "stepfun",
  "阶跃星辰": "stepfun",
  "阶跃": "stepfun",
  // LiveBench CSV 厂商 (livebench.ai/data 2026-06-25 release):
  // minimax / anthropic / openai / google / xai / deepseek / moonshot / z-ai / alibaba / thinking machines / meta
  // 上面别名已覆盖大多数; 这里补 LB 特有:
  "thinking machines": "other",
  "z-ai": "zhipu",
  // ponytail: HuggingFace author 是组织名 (跟 Arena/AA canonical vendor 命名不一致),
  // normalizeVendor 裸跑会全归 other, 加 HF 常见 author 变体 → 提升 vendor 归一精度.
  "google-bert": "google",
  "meta-llama": "meta",
  mistralai: "mistral",
  "deepseek-ai": "deepseek",
  "alibaba-pai": "qwen",
  "zhipu-ai": "zhipu",
  moonshotai: "moonshot",
  thudm: "zhipu", // 清华 THUDM (智谱系 — ChatGLM 等)
  baichuaninc: "baichuan",
  "01-ai": "zero-one",
  stepfunai: "stepfun",
  "tencent-hunyuan": "tencent",
  "bytedance-seed": "bytedance",
  "xiaomimimo": "xiaomi",
  salesforce: "other", // Salesforce/CodeT5 等 — 不在 VENDOR_META 厂商白名单
  "sentence-transformers": "other", // UKP Lab 组织 (top downloads 占大头但不是厂商)
  "cross-encoder": "other", // 同上
  // ponytail: HF top 200 by downloads 真实数据驱动 — 这些 author 出现频次高
  // 但都不在 VENDOR_META 厂商白名单, 加 alias 归到 other (或 meta 大厂) 让 vendor 字段更可读.
  "facebookai": "meta", // 4 — meta 新组织 (跟 "facebook" 平行)
  baai: "other", // 7 — 北京智源研究院 (BGE embedding 等是中文 embedding 行业第一)
  nvidia: "other", // 4 — 算力巨头, 但 top 模型是 Nemotron 系而非独立厂商
  "pyannote": "other", // 6 — 音频 diarization 行业标准
  intfloat: "other", // 4 — 北京智源 intfloat 系 (跟 BAAI 同源)
  distilbert: "other", // 3 — HuggingFace 自家小模型
  "comfy-org": "other", // 3 — ComfyUI 组织 (非 AI 厂商)
  timm: "other", // 2 — Ross Wightman 维护
  "nomic-ai": "other", // 2 — Nomic AI
  answerdotai: "other", // 2 — Answer.AI
  "ibm-granite": "other", // 2 — IBM Granite 系列
  ibm: "other",
  unsloth: "other", // 2 — 微调工具
  redhat: "other", // 1 — Red Hat AI
  snowflake: "other", // 1 — Snowflake
  "huggingfacetb": "other", // 1 — HF Text Embeddings Inference
  eleutherai: "other", // 1 — EleutherAI
  jinaai: "other", // 1 — Jina AI
};

/**
 * 归一化 vendor → VENDOR_META 键（未知归 other）。
 * @param raw
 * @returns {string}
 */
export function normalizeVendor(raw: any): string {
  if (!raw) return "other";
  const s = String(raw).toLowerCase().trim();
  if (!s) return "other";
  if (VENDOR_META[s]) return s;
  if (VENDOR_ALIASES[s]) return VENDOR_ALIASES[s];
  const stripped = (s as any)
    .replace(/\b(ai|llc|inc|corp|labs|research|pbc|team|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  if (stripped && VENDOR_META[stripped]) return stripped;
  if (stripped && VENDOR_ALIASES[stripped]) return VENDOR_ALIASES[stripped];
  // ponytail: 模型名前缀兜底 — LiveBench 等来源的 model 名直接以厂商起头 (gpt-5.6-sol-max / claude-4-7-xhigh / qwen3.7-max).
  // 接受: key/alias 紧接分隔符 (- 或 空格) 或直接接数字 (qwen3 / gpt5) — 后者只对厂商名 + 数字 + 非字母场景.
  // 升级路径: 想严格? 让 fetcher 自己存 vendorRaw, 此处只兜底.
  for (const key of Object.keys(VENDOR_META)) {
    if (s.startsWith(key + "-") || s.startsWith(key + " ")) return key;
    if (s.startsWith(key) && /[0-9._]/.test(s[key.length])) return key;
  }
  for (const [alias, target] of Object.entries(VENDOR_ALIASES)) {
    if (s.startsWith(alias + "-") || s.startsWith(alias + " ")) return target;
    if (s.startsWith(alias) && /[0-9._]/.test(s[alias.length])) return target;
  }
  return "other";
}

/**
 * slugify vendor（用于 id 构造与跨源匹配）。与 normalizeVendor 同归一口径。
 * @param raw
 * @returns {string}
 */
export function slugifyVendor(raw: any): string {
  return normalizeVendor(raw);
}

/**
 * 构造稳定主键：vendor + name 归一化。
 * 与 normalize.js 的 slugifyModel 同口径（这里自包含，避免循环依赖）。
 * @param vendor
 * @param name
 * @returns {string}
 */
export function makeId(vendor: any, name: any): string {
  const v = normalizeVendor(vendor).replace(/[^a-z0-9]/g, "");
  const n = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${v || "other"}-${n || "unknown"}`;
}

// fetcher 直接 require("./types.ts").slugifyModel（同 makeId 口径）。
// 集中放这里，避免 fetcher 散落跨文件依赖 normalize。
export const slugifyModel = makeId;

/**
 * 署名（AA 强制，见架构 §12）。集中放这里，renderer 也复用同结构。
 * 注意：AA 署名必须含可点击链接 https://artificialanalysis.ai/。
 */
export const ATTRIBUTION: Record<string, any> = {
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
  livebench: {
    id: "livebench",
    text: "客观基准：LiveBench (https://livebench.ai), 数据来源：官方 GitHub Pages 静态 CSV",
    url: "https://livebench.ai/",
    required: false,
  },
  "models-dev": {
    id: "models-dev",
    text: "模型元数据：Models.dev（开放目录聚合）",
    url: "https://models.dev/",
    required: false,
  },
  // ponytail: HF Hub Models API — 补全社区信号维度 (downloads/likes/活跃度/标签),
  // 跟现有 5 个源 (Arena/AA/OpenRouter/LiveBench/Models.dev) 完全正交.
  // 必填 url — 走外部链接规范.
  huggingface: {
    id: "huggingface",
    text: "社区信号：HuggingFace Hub (https://huggingface.co), 数据来源：Hub Models API（按 downloads 降序 top 5000）",
    url: "https://huggingface.co/models",
    required: false,
  },
  sample: {
    id: "sample",
    text: "示例数据（离线快照，非实时）",
    url: null,
    required: false,
  },
};

export function _sourceNorm(v: any): string {
  return v === SOURCE.LIVE || v === SOURCE.SAMPLE ? v : SOURCE.NONE;
}

/**
 * 构造一条规范化的 AiModel（缺字段补安全默认，避免 renderer 解构炸）。
 * @param raw
 * @returns {object}
 */
export function toAiModel(raw: any): any {
  const r = raw || {};
  const category = CATEGORY_META[r.category] ? r.category : "llm";
  const id = r.id != null ? String(r.id) : makeId(r.vendor, r.name);
  const sources = r.sources
    ? {
        arena: _sourceNorm(r.sources.arena),
        aa: _sourceNorm(r.sources.aa),
        openrouter: _sourceNorm(r.sources.openrouter),
        livebench: _sourceNorm(r.sources.livebench),
        modelsdev: _sourceNorm(r.sources.modelsdev),
      }
    : {
        arena: SOURCE.NONE,
        aa: SOURCE.NONE,
        openrouter: SOURCE.NONE,
        livebench: SOURCE.NONE,
        modelsdev: SOURCE.NONE,
      };
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
    livebench:
      r.livebench && typeof r.livebench === "object" ? r.livebench : null,
    modelsdev:
      r.modelsdev && typeof r.modelsdev === "object" ? r.modelsdev : null,
    // ponytail: HF 切片是 opt-in 数据源, 跟 aa/openrouter/livebench/modelsdev 同模式 —
    // 默认 null (其它 fetcher 不传则不显示), fetcher-huggingface.normalize 写入.
    huggingface:
      r.huggingface && typeof r.huggingface === "object" ? r.huggingface : null,
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
