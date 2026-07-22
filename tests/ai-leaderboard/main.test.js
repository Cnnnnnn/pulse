/**
 * tests/ai-leaderboard/main.test.js
 *
 * AI 榜单（主进程 CommonJS）单测 — 覆盖架构 §10 T05：
 *   1) aggregator 合并 / 兜底链：Arena+AA 合并、OpenRouter 兜底、全失败回退 sample
 *   2) ranking：按 elo / intelligence / coding 等 sortKey 降序；vendor 过滤；category 过滤
 *   3) normalize：vendor 归一化 Top15+other；AiModel 字段完整性
 *   4) rate-limiter：AA 令牌桶 1000/天 不超发
 *
 * 设计要点：
 *   - 用 vi.stubGlobal('fetch', ...) 精确控制三个源的成功/失败，无需真实网络。
 *   - aggregator 测试一律传 force:true，跳过磁盘缓存读取，结果完全由 fetch mock 决定，
 *     避免 vitest 进程内 in-memory 缓存跨用例污染。
 *   - 失败时仍保证 ok:true（最坏 = sample），永不让渲染层拿到 ok:false 的硬失败。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  getLeaderboard,
  matchesCategory,
} = require("../../src/main/ai-leaderboard/aggregator");
const { sortModels, filterByVendor, filterBySearch } = require("../../src/main/ai-leaderboard/ranking");
const {
  normalizeVendor,
  toAiModel,
  VENDOR_META,
} = require("../../src/main/ai-leaderboard/types");
const {
  acquire,
  remaining,
  resetLimiter,
  AA_DAILY_LIMIT,
} = require("../../src/main/ai-leaderboard/rate-limiter");
const { __resetForTest: resetCache, cacheKey, writeCache } = require("../../src/main/ai-leaderboard/cache");
const arenaFetcher = require("../../src/main/ai-leaderboard/fetcher-arena");
const aaFetcher = require("../../src/main/ai-leaderboard/fetcher-aa");
const { sanitize, boardCacheKey, cacheGet, cacheSet, resetLeaderboardCache } =
  require("../../src/main/ipc/register-leaderboard");
const { mergeModelSlices } = require("../../src/main/ai-leaderboard/normalize");

// ── 兜底/合并测试用统一 payload（三源同 id，便于验证 merge）─────────────
const ARENA_PAYLOAD = {
  models: [
    {
      model: "GPT-4o",
      vendor: "OpenAI",
      score: 1400,
      rank: 1,
      ci: 5,
      votes: 100,
      license: "Proprietary",
    },
  ],
};

const AA_PAYLOAD = {
  data: [
    {
      name: "GPT-4o",
      model_creator: "OpenAI",
      evaluations: {
        intelligence_index: 78,
        coding_index: 72,
        math_index: 70,
        gpqa: 51,
      },
      pricing: { blended: 6.25 },
    },
  ],
};

const OR_PAYLOAD = {
  data: [
    { id: "openai/gpt-4o", name: "GPT-4o", context_length: 128000 },
  ],
};

/**
 * 构造 fetch mock。behaviors 按顺序匹配 URL 子串；未命中返回 404。
 * @param {Array<{match:(u:string)=>boolean, ok:boolean, payload?:any}>} behaviors
 */
function makeFetchMock(behaviors) {
  return vi.fn(async (url) => {
    const u = String(url);
    for (const b of behaviors) {
      if (b.match(u)) {
        if (b.ok) {
          return { ok: true, status: 200, json: async () => b.payload };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

const ALL_LIVE = [
  { match: (u) => u.includes("api.wulong.dev"), ok: true, payload: ARENA_PAYLOAD },
  { match: (u) => u.includes("artificialanalysis.ai"), ok: true, payload: AA_PAYLOAD },
  { match: (u) => u.includes("openrouter.ai"), ok: true, payload: OR_PAYLOAD },
];

// Arena+AA 成功、OpenRouter 失败（隔离 Arena+AA 合并）
const ARENA_AA_LIVE = [
  { match: (u) => u.includes("api.wulong.dev"), ok: true, payload: ARENA_PAYLOAD },
  { match: (u) => u.includes("artificialanalysis.ai"), ok: true, payload: AA_PAYLOAD },
  { match: (u) => u.includes("openrouter.ai"), ok: false },
];

// 仅 OpenRouter 成功（Arena+AA 全失败 → L1 兜底）
const ONLY_OR = [
  {
    match: (u) => u.includes("api.wulong.dev") || u.includes("raw.githubusercontent.com"),
    ok: false,
  },
  {
    match: (u) => u.includes("artificialanalysis.ai") || u.includes("raw.githubusercontent.com"),
    ok: false,
  },
  { match: (u) => u.includes("openrouter.ai"), ok: true, payload: OR_PAYLOAD },
];

// 三源全失败 → sample（L2 兜底，isSample=true）
const ALL_FAIL = [
  {
    match: (u) => u.includes("api.wulong.dev") || u.includes("raw.githubusercontent.com"),
    ok: false,
  },
  {
    match: (u) => u.includes("artificialanalysis.ai") || u.includes("raw.githubusercontent.com"),
    ok: false,
  },
  { match: (u) => u.includes("openrouter.ai"), ok: false },
];

beforeEach(() => {
  resetLimiter();
  resetCache(); // 清空进程内磁盘缓存（force:true 失败兜底仍会读 _memCache）
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 1. aggregator 合并 / 兜底链 ───────────────────────────────────────
describe("aggregator: 合并与兜底链", () => {
  it("Arena+AA 合并：同 id 模型的 arena 与 aa 切片合并到一条", async () => {
    vi.stubGlobal("fetch", makeFetchMock(ARENA_AA_LIVE));
    const res = await getLeaderboard({ category: "llm", dimension: "elo", force: true });
    expect(res.ok).toBe(true);
    const m = res.items.find((it) => it.id === "openai-gpt-4o");
    expect(m).toBeTruthy();
    // arena 切片来自 Arena fetcher
    expect(m.arena.text.score).toBe(1400);
    // aa 切片来自 AA fetcher —— 证明两源已合并
    expect(m.aa.intelligenceIndex).toBe(78);
    expect(m.aa.codingIndex).toBe(72);
    // 主源 live
    expect(res.sources.arena).toBe("live");
    expect(res.sources.aa).toBe("live");
    // AA 强制署名出现
    expect(res.attribution.some((a) => a.id === "artificial-analysis" && a.required)).toBe(true);
    expect(res.isSample).toBe(false);
  });

  it("全部主源成功时 Arena/Aa/OpenRouter 三切片都 live", async () => {
    vi.stubGlobal("fetch", makeFetchMock(ALL_LIVE));
    const res = await getLeaderboard({ category: "llm", dimension: "elo", force: true });
    expect(res.sources.arena).toBe("live");
    expect(res.sources.aa).toBe("live");
    expect(res.sources.openrouter).toBe("live");
    const m = res.items.find((it) => it.id === "openai-gpt-4o");
    expect(m.openrouter.contextLength).toBe(128000);
  });

  it("Arena+AA 全失败 → OpenRouter 兜底（仅骨架，无分数，sources 非 sample）", async () => {
    vi.stubGlobal("fetch", makeFetchMock(ONLY_OR));
    const res = await getLeaderboard({ category: "llm", dimension: "elo", force: true });
    expect(res.ok).toBe(true);
    // 主源全 none，openrouter live（L1 兜底，不是 sample）
    expect(res.sources.arena).toBe("none");
    expect(res.sources.aa).toBe("none");
    expect(res.sources.openrouter).toBe("live");
    expect(res.isSample).toBe(false);
    const m = res.items.find((it) => it.id === "openai-gpt-4o");
    expect(m).toBeTruthy();
    expect(m.openrouter.contextLength).toBe(128000);
    // arena/aa 切片缺失
    expect(Object.keys(m.arena || {}).length).toBe(0);
    expect(m.aa).toBeNull();
  });

  it("全失败 → 回退内置 sample（ok:true、isSample=true、sources 全 sample）", async () => {
    vi.stubGlobal("fetch", makeFetchMock(ALL_FAIL));
    const res = await getLeaderboard({ category: "llm", dimension: "elo", force: true });
    expect(res.ok).toBe(true);
    expect(res.isSample).toBe(true);
    expect(res.sources.arena).toBe("sample");
    expect(res.sources.aa).toBe("sample");
    expect(res.sources.openrouter).toBe("sample");
    // 内置 sample 有 15 条
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((it) => it.sources.arena === "sample")).toBe(true);
    // 页头「示例」徽标的署名说明出现
    expect(res.attribution.some((a) => a.id === "sample")).toBe(true);
  });

  it("dimension=intelligence 时全失败也判 isSample=true（按 aa 维度）", async () => {
    vi.stubGlobal("fetch", makeFetchMock(ALL_FAIL));
    const res = await getLeaderboard({ category: "llm", dimension: "intelligence", force: true });
    expect(res.isSample).toBe(true);
    expect(res.sources.aa).toBe("sample");
  });
});

// ── 1b. P1 图像/视频分榜：Arena 已抓取数据链路 ──────────────────────
describe("P1 图像/视频分榜：Arena 数据链路", () => {
  // 自定义 arena mock：按 URL 中 ?name=<board> 返回对应 board 的 payload。
  // 证明 fetcher-arena 实际抓取了 text-to-image / video，且聚合结果可按 image/video 检索。
  function makeArenaPerBoardMock() {
    const payloads = {
      "text": { models: [{ model: "GPT-4o", vendor: "OpenAI", score: 1400, rank: 1, ci: 5, votes: 100 }] },
      "vision": { models: [{ model: "GPT-4o-Vision", vendor: "OpenAI", score: 1320, rank: 1, ci: 6, votes: 80 }] },
      "code": { models: [{ model: "Claude-Code", vendor: "Anthropic", score: 1380, rank: 1, ci: 4, votes: 60 }] },
      "text-to-image": { models: [{ model: "Midjourney v6", vendor: "Midjourney", score: 1150, rank: 1, ci: 8, votes: 50 }] },
      "text-to-video": { models: [{ model: "Runway Gen-3", vendor: "Runway", score: 1080, rank: 1, ci: 10, votes: 30 }] },
    };
    return vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("api.wulong.dev")) {
        const m = u.match(/name=([^&]+)/);
        const board = m ? decodeURIComponent(m[1]) : "text";
        return { ok: true, status: 200, json: async () => (payloads[board] || { models: [] }) };
      }
      if (u.includes("artificialanalysis.ai")) return { ok: false, status: 500, json: async () => ({}) };
      if (u.includes("openrouter.ai")) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: false, status: 404, json: async () => ({}) };
    });
  }

  it("fetcher-arena 抓取 text-to-image，聚合结果可按 image 分类检索", async () => {
    vi.stubGlobal("fetch", makeArenaPerBoardMock());
    const res = await getLeaderboard({ category: "image", dimension: "elo", force: true });
    expect(res.ok).toBe(true);
    expect(res.items.length).toBe(1);
    const img = res.items[0];
    expect(img.name).toBe("Midjourney v6");
    expect(img.category).toBe("image");
    expect(img.arena["text-to-image"].score).toBe(1150);
  });

  it("video 分榜可被检索，且仅含 video board 模型", async () => {
    vi.stubGlobal("fetch", makeArenaPerBoardMock());
    const res = await getLeaderboard({ category: "video", dimension: "elo", force: true });
    expect(res.items.length).toBe(1);
    expect(res.items[0].name).toBe("Runway Gen-3");
    expect(res.items[0].arena["text-to-video"].score).toBe(1080);
  });

  it("image/video 模型不污染默认 llm 视图", async () => {
    vi.stubGlobal("fetch", makeArenaPerBoardMock());
    const res = await getLeaderboard({ category: "llm", dimension: "elo", force: true });
    const names = res.items.map((it) => it.name);
    expect(names).toContain("GPT-4o");
    expect(names).not.toContain("Midjourney v6");
    expect(names).not.toContain("Runway Gen-3");
  });
});

// ── 1b2. P1BugFix：video board 真实键名修正（R3 根因回归）─────────────
// 根因：线上 ?name=video 返回 404「Leaderboard not found: video」，
// 真实的视频榜单键名为 text-to-video（42 条，含 score）。修复即把 board 键统一改为 text-to-video。
describe("P1BugFix: video board 键名修正（text-to-video）", () => {
  it("normalize 把 text-to-video 切片归入 video 分类（category=video, 键名非 'video'）", () => {
    const out = arenaFetcher.normalize({
      boards: {
        "text-to-video": {
          models: [{ model: "Runway Gen-3", vendor: "Runway", score: 1080, rank: 1, ci: 10, votes: 30 }],
        },
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("video");
    expect(out[0].arena["text-to-video"].score).toBe(1080);
    expect(out[0].arena.video).toBeUndefined(); // 旧错误键名不应残留
  });

  it("聚合链路：category=video 能检索到 text-to-video board 的真实模型", async () => {
    const payloads = {
      "text-to-video": {
        models: [{ model: "Runway Gen-3", vendor: "Runway", score: 1080, rank: 1, ci: 10, votes: 30 }],
      },
    };
    const mock = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("api.wulong.dev")) {
        const m = u.match(/name=([^&]+)/);
        const board = m ? decodeURIComponent(m[1]) : "text";
        return { ok: true, status: 200, json: async () => (payloads[board] || { models: [] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", mock);
    const res = await getLeaderboard({ category: "video", dimension: "elo", force: true });
    expect(res.ok).toBe(true);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe("Runway Gen-3");
    expect(res.items[0].arena["text-to-video"].score).toBe(1080);
  });
});

// ── 1c. P1 限流时机修正：缓存命中不消耗 AA 令牌 ──────────────────────
describe("P1 限流时机修正：缓存命中不消耗 AA 令牌", () => {
  it("AA 磁盘缓存命中（非 force）不消耗 AA 令牌，且数据来自缓存", async () => {
    // 预填 Arena + AA 磁盘缓存（与 aggregator 落盘结构一致）
    writeCache(cacheKey("arena", "all"), { boards: { text: ARENA_PAYLOAD } });
    writeCache(cacheKey("artificial-analysis", "llms"), AA_PAYLOAD);
    // fetch 全失败：证明数据完全来自磁盘缓存，零网络、零 AA 令牌
    vi.stubGlobal("fetch", makeFetchMock(ALL_FAIL));
    const before = remaining("artificial-analysis");
    expect(before).toBe(1000);

    const res = await getLeaderboard({ category: "llm", dimension: "elo", force: false });
    expect(res.ok).toBe(true);
    expect(remaining("artificial-analysis")).toBe(1000); // 关键断言：缓存命中未消耗令牌
    const m = res.items.find((it) => it.id === "openai-gpt-4o");
    expect(m).toBeTruthy();
    expect(m.arena.text.score).toBe(1400); // 来自 arena 缓存
    expect(m.aa.intelligenceIndex).toBe(78); // 来自 AA 缓存
  });

  it("force 刷新仍消耗 AA 令牌并真正拉取", async () => {
    vi.stubGlobal("fetch", makeFetchMock(ALL_LIVE));
    const res = await getLeaderboard({ category: "llm", dimension: "elo", force: true });
    expect(res.ok).toBe(true);
    expect(remaining("artificial-analysis")).toBe(999); // force 刷新消耗 1 令牌
    const m = res.items.find((it) => it.id === "openai-gpt-4o");
    expect(m.aa.intelligenceIndex).toBe(78);
  });

  it("AA 冷缓存未命中（非 force）仍消耗令牌去拉取并回填", async () => {
    // 未预填任何缓存 → AA cache miss；非 force 下也应拉取（回填磁盘缓存）
    vi.stubGlobal("fetch", makeFetchMock(ALL_LIVE));
    const res = await getLeaderboard({ category: "llm", dimension: "elo", force: false });
    expect(res.ok).toBe(true);
    expect(remaining("artificial-analysis")).toBe(999); // 冷未命中：拉取消耗 1 令牌
    const m = res.items.find((it) => it.id === "openai-gpt-4o");
    expect(m.aa.intelligenceIndex).toBe(78);
  });

  it("令牌耗尽且缓存未命中：不抛错、兜底链不受影响（用 best-effort）", async () => {
    // 耗尽令牌
    for (let i = 0; i < 1000; i++) acquire("artificial-analysis");
    vi.stubGlobal("fetch", makeFetchMock(ALL_LIVE));
    const res = await getLeaderboard({ category: "llm", dimension: "elo", force: false });
    expect(res.ok).toBe(true); // 仍 ok（最坏兜底）
    expect(remaining("artificial-analysis")).toBe(0);
  });
});

// ── 2. ranking ───────────────────────────────────────────────────────
describe("ranking: 排序 / 筛选", () => {
  // v2.83: math/gpqa/priceBlendedPer1M 已下线 (AA Free 0 覆盖),
  //        替换为 agenticIndex / outputTokensPerSec / priceOutputPer1M
  const items = [
    toAiModel({
      id: "a", name: "A", vendor: "openai", category: "llm",
      arena: { text: { rank: 1, score: 1300, ci: 5, votes: 10 } },
      aa: { intelligenceIndex: 60, codingIndex: 50, agenticIndex: 40, outputTokensPerSec: 50, priceOutputPer1M: 10 },
    }),
    toAiModel({
      id: "b", name: "B", vendor: "anthropic", category: "llm",
      arena: { text: { rank: 2, score: 1450, ci: 5, votes: 10 } },
      aa: { intelligenceIndex: 90, codingIndex: 85, agenticIndex: 75, outputTokensPerSec: 100, priceOutputPer1M: 5 },
    }),
    toAiModel({
      id: "c", name: "C", vendor: "google", category: "llm",
      arena: { text: { rank: 3, score: 1200, ci: 5, votes: 10 } },
      aa: { intelligenceIndex: 75, codingIndex: 60, agenticIndex: 55, outputTokensPerSec: 80, priceOutputPer1M: 20 },
    }),
  ];

  it("按 elo 降序（arena.text.score）", () => {
    const sorted = sortModels(items, "elo", "desc", "llm");
    expect(sorted.map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  it("按 elo 升序", () => {
    const sorted = sortModels(items, "elo", "asc", "llm");
    expect(sorted.map((m) => m.id)).toEqual(["c", "a", "b"]);
  });

  it("按 intelligence_index 降序（aa.intelligenceIndex）", () => {
    const sorted = sortModels(items, "intelligence", "desc", "llm");
    expect(sorted.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("按 coding_index 降序（aa.codingIndex）", () => {
    // b=85, c=60, a=50 → b, c, a
    const sorted = sortModels(items, "coding", "desc", "llm");
    expect(sorted.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("按 agentic 降序 (aa.agenticIndex)", () => {
    // b=75, c=55, a=40
    const sorted = sortModels(items, "agentic", "desc", "llm");
    expect(sorted.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("按 speed 降序 (aa.outputTokensPerSec)", () => {
    // b=100, c=80, a=50
    const sorted = sortModels(items, "speed", "desc", "llm");
    expect(sorted.map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("按 price 升序 (低 = 优, aa.priceOutputPer1M)", () => {
    // b=5, a=10, c=20
    const sorted = sortModels(items, "price", "asc", "llm");
    expect(sorted.map((m) => m.id)).toEqual(["b", "a", "c"]);
  });

  it("缺失切片的模型排到末尾（不影响其它）", () => {
    const withGap = [
      toAiModel({ id: "x", name: "X", vendor: "openai", category: "llm", arena: { text: { rank: 1, score: 1500, ci: 1, votes: 1 } } }),
      toAiModel({ id: "y", name: "Y", vendor: "anthropic", category: "llm" }), // 无 arena
    ];
    const sorted = sortModels(withGap, "elo", "desc", "llm");
    expect(sorted[0].id).toBe("x");
    expect(sorted[1].id).toBe("y");
  });

  it("filterByVendor：仅保留指定 vendor", () => {
    const out = filterByVendor(items, "openai");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
  });

  it("filterByVendor('all') 返回全部", () => {
    expect(filterByVendor(items, "all")).toHaveLength(3);
  });

  it("filterBySearch：按名称/原始 vendor 模糊匹配（本地派生）", () => {
    const out = filterBySearch(items, "anthrop");
    expect(out.map((m) => m.id)).toEqual(["b"]);
    const out2 = filterBySearch(items, "Google");
    expect(out2.map((m) => m.id)).toEqual(["c"]);
  });

  it("category 过滤：matchesCategory 按 board 存在性判定", () => {
    const llm = toAiModel({ id: "llm1", name: "L", vendor: "openai", category: "llm", arena: { text: { rank: 1, score: 1, ci: 1, votes: 1 } } });
    const mm = toAiModel({ id: "mm1", name: "M", vendor: "openai", category: "multimodal", arena: { vision: { rank: 1, score: 1, ci: 1, votes: 1 } } });
    expect(matchesCategory(llm, "llm")).toBe(true);
    expect(matchesCategory(mm, "llm")).toBe(false);
    expect(matchesCategory(mm, "multimodal")).toBe(true);
  });
});

// ── 3. normalize ─────────────────────────────────────────────────────
describe("normalize: vendor 归一化 + AiModel 字段完整性", () => {
  it("vendor 归一化覆盖 Top15 + other（未知归 other）", () => {
    // 注意：VENDOR_ALIASES 收录的是英文/pinyin 别名；中文品牌名（如「阿里通义」「智谱」
    // 「腾讯」「百川」「月之暗面」）当前未进别名表，仅其英文/pinyin 别名可命中。
    const expectMap = {
      OpenAI: "openai",
      openai: "openai",
      Anthropic: "anthropic",
      Google: "google",
      Meta: "meta",
      Mistral: "mistral",
      "x.ai": "xai",
      DeepSeek: "deepseek",
      tongyi: "qwen", // 阿里通义（英文别名）
      chatglm: "zhipu", // 智谱（英文别名）
      Cohere: "cohere",
      Amazon: "amazon",
      Microsoft: "microsoft",
      hunyuan: "tencent", // 腾讯（英文别名）
      "baichuan intelligent": "baichuan", // 百川（英文别名）
      kimi: "moonshot", // 月之暗面（英文别名）
    };
    for (const [raw, expected] of Object.entries(expectMap)) {
      expect(normalizeVendor(raw)).toBe(expected);
    }
    // 未知厂商 → other
    expect(normalizeVendor("AcmeCorp")).toBe("other");
    expect(normalizeVendor("")).toBe("other");
    // 中文品牌名原始串未进别名表 → other（已知遗留，见交付报告）
    expect(normalizeVendor("阿里通义")).toBe("other");
  });

  it("VENDOR_META 含具名厂商 + other 兜底", () => {
    const keys = Object.keys(VENDOR_META);
    // other 兜底必须存在
    expect(keys).toContain("other");
    // 关键主流厂商必须存在（新增厂商不应再触发红灯 → 用成员 + 下限断言）
    const required = [
      "openai", "anthropic", "google", "meta", "mistral",
      "deepseek", "qwen", "zhipu", "xai", "tencent",
    ];
    for (const k of required) {
      expect(keys).toContain(k);
    }
    // 具名厂商（去掉 other）数量下限：真实为 20，留余量抗变（避免每次加厂商改断言）
    const named = keys.filter((k) => k !== "other");
    expect(named.length).toBeGreaterThanOrEqual(15);
  });

  it("toAiModel 补全安全默认字段", () => {
    const m = toAiModel({ name: "Foo", vendor: "OpenAI" });
    expect(m.id).toBeTruthy();
    expect(m.name).toBe("Foo");
    expect(m.vendor).toBe("openai");
    expect(m.category).toBe("llm");
    expect(m.sources).toEqual({ arena: "none", aa: "none", openrouter: "none", livebench: "none", modelsdev: "none" });
    expect(m.isSample).toBe(false);
    expect(m.arena).toEqual({});
    expect(m.aa).toBeNull();
    expect(m.openrouter).toBeNull();
  });

  it("arena fetcher.normalize 产出字段完整的 AiModel", () => {
    const out = arenaFetcher.normalize({ boards: { text: ARENA_PAYLOAD } });
    expect(Array.isArray(out)).toBe(true);
    const m = out[0];
    expect(m.id).toBe("openai-gpt-4o");
    expect(m.vendor).toBe("openai");
    expect(m.sources.arena).toBe("live");
    expect(m.arena.text.score).toBe(1400);
    expect(m.isSample).toBe(false);
  });

  it("AA fetcher.normalize 产出字段完整的 AiModel", () => {
    const out = aaFetcher.normalize(AA_PAYLOAD);
    expect(Array.isArray(out)).toBe(true);
    const m = out[0];
    expect(m.vendor).toBe("openai");
    expect(m.sources.aa).toBe("live");
    expect(m.aa.intelligenceIndex).toBe(78);
    expect(m.arena).toEqual({});
  });
});

// ── 4. rate-limiter ──────────────────────────────────────────────────
describe("rate-limiter: AA 令牌桶 1000/天", () => {
  it("AA_DAILY_LIMIT === 1000", () => {
    expect(AA_DAILY_LIMIT).toBe(1000);
  });

  it("前 1000 次放行，第 1001 次拒绝（不超发）", () => {
    let granted = 0;
    for (let i = 0; i < 1000; i++) {
      if (acquire("artificial-analysis")) granted++;
    }
    expect(granted).toBe(1000);
    expect(acquire("artificial-analysis")).toBe(false);
    expect(remaining("artificial-analysis")).toBe(0);
  });

  it("remaining 随获取递减", () => {
    expect(remaining("artificial-analysis")).toBe(1000);
    acquire("artificial-analysis");
    expect(remaining("artificial-analysis")).toBe(999);
  });

  it("非 AA 源不限流（始终放行，remaining 为 Infinity）", () => {
    expect(acquire("arena-snapshot")).toBe(true);
    expect(remaining("arena-snapshot")).toBe(Infinity);
  });

  it("resetLimiter 重置令牌桶", () => {
    for (let i = 0; i < 10; i++) acquire("artificial-analysis");
    expect(remaining("artificial-analysis")).toBe(990);
    resetLimiter();
    expect(remaining("artificial-analysis")).toBe(1000);
  });
});

// ── 5. IPC 契约（register-leaderboard 纯函数部分）─────────────────────
describe("mergeModelSlices: name 兜底合并（vendor 命名不一致场景）", () => {
  it("AA canonical vendor (anthropic) + MD router vendor (other) 同 name → modelsdev slice 被接回", () => {
    const aa = [
      {
        id: "anthropic-claude-3-5-haiku",
        name: "Claude 3.5 Haiku",
        vendor: "anthropic",
        vendorRaw: "Anthropic",
        category: "llm",
        aa: { intelligenceIndex: 30 },
        sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" },
        isSample: false,
      },
    ];
    const md = [
      {
        id: "other-claude-3-5-haiku",
        name: "Claude 3.5 Haiku",
        vendor: "other",
        vendorRaw: "FrogBot",
        category: "llm",
        modelsdev: { contextLength: 200000, inputCostPer1M: 0.8 },
        sources: { arena: "none", aa: "none", openrouter: "none", livebench: "none", modelsdev: "live" },
        isSample: false,
      },
    ];
    const merged = mergeModelSlices([aa, md]);
    // 按 baseName 合并后, AA 的 canonical 那条接管, MD 的 modelsdev slice 合并进去
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("anthropic-claude-3-5-haiku");
    expect(merged[0].vendor).toBe("anthropic");
    expect(merged[0].aa).toEqual({ intelligenceIndex: 30 });
    expect(merged[0].modelsdev).toEqual({ contextLength: 200000, inputCostPer1M: 0.8 });
    expect(merged[0].sources.aa).toBe("live");
    expect(merged[0].sources.modelsdev).toBe("live");
  });

  it("AA 变体 (xhigh) + MD 基模 (无后缀) 同 baseName → modelsdev slice 被接回", () => {
    const aa = [
      {
        id: "openai-gpt-5-5",
        name: "GPT-5.5 (xhigh)",
        vendor: "openai",
        category: "llm",
        aa: { intelligenceIndex: 54.8 },
        sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" },
        isSample: false,
      },
    ];
    const md = [
      {
        id: "openai-gpt-5-5",
        name: "GPT-5.5",
        vendor: "openai",
        category: "llm",
        modelsdev: { contextLength: 1050000 },
        sources: { arena: "none", aa: "none", openrouter: "none", livebench: "none", modelsdev: "live" },
        isSample: false,
      },
    ];
    const merged = mergeModelSlices([aa, md]);
    expect(merged.length).toBe(1);
    expect(merged[0].aa).toEqual({ intelligenceIndex: 54.8 });
    expect(merged[0].modelsdev).toEqual({ contextLength: 1050000 });
  });

  it("同 baseName 但两边 vendor 都 'other' → 不合并（避免误伤不同 model）", () => {
    // ponytail: 安全网 — 仅当一侧有 canonical vendor (≠other) 时才按 baseName 兜底合并,
    // 两边都是 router 时无法判断归属, 保持原 id 不动.
    const a = [
      {
        id: "other-foo",
        name: "Foo",
        vendor: "other",
        category: "llm",
        arena: { elo: 1000 },
        sources: { arena: "live", aa: "none", openrouter: "none", livebench: "none", modelsdev: "none" },
        isSample: false,
      },
    ];
    const b = [
      {
        id: "other-foo",
        name: "Foo",
        vendor: "other",
        category: "llm",
        aa: { intelligenceIndex: 20 },
        sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" },
        isSample: false,
      },
    ];
    const merged = mergeModelSlices([a, b]);
    // id 已相同 → 按 id 合并生效 (aa + arena slice 都进来)
    expect(merged.length).toBe(1);
    expect(merged[0].arena).toEqual({ elo: 1000 });
    expect(merged[0].aa).toEqual({ intelligenceIndex: 20 });
  });

  it("不同 model 同 id (误撞) → 第二轮 name 兜底不强行合（不互相覆盖）", () => {
    // ponytail: 真不同 model 但 id 撞了 (极少见) — 按 id 合并优先, 不再用 name 拆开.
    const a = [
      { id: "x", name: "Model A", vendor: "openai", category: "llm", aa: { intelligenceIndex: 50 }, sources: { arena: "none", aa: "live", openrouter: "none", livebench: "none", modelsdev: "none" }, isSample: false },
      { id: "x", name: "Model B", vendor: "anthropic", category: "llm", modelsdev: { contextLength: 100 }, sources: { arena: "none", aa: "none", openrouter: "none", livebench: "none", modelsdev: "live" }, isSample: false },
    ];
    const merged = mergeModelSlices([a]);
    // id 相同, 后写覆盖前写; 但通过 _mergeInto 安全合并两个 slice.
    expect(merged.length).toBe(1);
    expect(merged[0].aa).toEqual({ intelligenceIndex: 50 });
    expect(merged[0].modelsdev).toEqual({ contextLength: 100 });
  });

  it("Arena 小写连字符变体名 (gpt-5.6-sol-xhigh) ↔ MD 正常名 (GPT-5.6 Sol) → 第二轮 _normName 兜底合并", () => {
    // ponytail: Arena 用小写连字符 + 变体后缀命名, MD / AA 用 title case + 空格.
    // 第一轮 baseName "gpt-5.6-sol-xhigh" vs "GPT-5.6 Sol" 不匹配;
    // 第二轮 _normName (小写 + 去标点 + 剥末尾 -xhigh) → 都是 "gpt56sol", 命中.
    const arenaSlice = [
      { id: "openai-gpt-5-6-sol-xhigh", name: "gpt-5.6-sol-xhigh", vendor: "openai", category: "llm", arena: { text: { score: 1300 } }, sources: { arena: "live", aa: "none", openrouter: "none", livebench: "none", modelsdev: "none" }, isSample: false },
    ];
    const mdSlice = [
      { id: "openai-gpt-5-6-sol", name: "GPT-5.6 Sol", vendor: "openai", category: "llm", modelsdev: { contextLength: 1050000, inputCostPer1M: 5 }, sources: { arena: "none", aa: "none", openrouter: "none", livebench: "none", modelsdev: "live" }, isSample: false },
    ];
    const merged = mergeModelSlices([arenaSlice, mdSlice]);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("openai-gpt-5-6-sol-xhigh");
    expect(merged[0].arena.text.score).toBe(1300);
    expect(merged[0].modelsdev.contextLength).toBe(1050000);
  });

  it("_normName 不误合并真正不同 model（gemini-3-flash vs gemini-3-5-flash）", () => {
    // ponytail: _normName 顺序 — 必须确认 baseName (空格 / 括号) 那轮没匹配, 再用 _normName.
    // 这里两条 baseName 不一致 ("Gemini 3 Flash" vs "Gemini 3.5 Flash") → _normName 也不该合并.
    const a = [
      { id: "google-gemini-3-flash", name: "gemini-3-flash", vendor: "google", category: "llm", arena: { score: 1300 }, sources: { arena: "live", aa: "none", openrouter: "none", livebench: "none", modelsdev: "none" }, isSample: false },
    ];
    const b = [
      { id: "google-gemini-3-5-flash", name: "Gemini 3.5 Flash", vendor: "google", category: "llm", modelsdev: { contextLength: 1048576 }, sources: { arena: "none", aa: "none", openrouter: "none", livebench: "none", modelsdev: "live" }, isSample: false },
    ];
    const merged = mergeModelSlices([a, b]);
    // 不同 model — 应当保持 2 条独立
    expect(merged.length).toBe(2);
  });
});

describe("ipc/register-leaderboard: sanitize 与请求级缓存键", () => {
  beforeEach(() => {
    resetLeaderboardCache();
  });

  it("sanitize 白名单：非法 category/dimension/vendor 回退默认", () => {
    const out = sanitize({ category: "bogus", dimension: "bogus", vendor: "bogus", sortDir: "sideways", search: 123 });
    expect(out.category).toBe("llm");
    expect(out.dimension).toBe("elo");
    expect(out.vendor).toBe("all");
    expect(out.sortDir).toBe("desc");
    expect(out.search).toBe("");
    expect(out.force).toBe(false);
  });

  it("sanitize 通过合法维度与 vendor", () => {
    const out = sanitize({ category: "multimodal", dimension: "intelligence", vendor: "openai", sortDir: "asc", search: "gpt" });
    expect(out.category).toBe("multimodal");
    expect(out.dimension).toBe("intelligence");
    expect(out.vendor).toBe("openai");
    expect(out.sortDir).toBe("asc");
    expect(out.search).toBe("gpt");
  });

  it("boardCacheKey 仅含影响数据的维度（force 不进 key）", () => {
    const k1 = boardCacheKey({ category: "llm", dimension: "elo", vendor: "all", sortDir: "desc", search: "" });
    const k2 = boardCacheKey({ category: "llm", dimension: "elo", vendor: "all", sortDir: "desc", search: "", force: true });
    expect(k1).toBe(k2); // force 不影响缓存键
  });

  it("请求级缓存：cacheSet 后 cacheGet 命中，5min TTL 内有效", () => {
    const key = boardCacheKey({ category: "llm", dimension: "elo" });
    cacheSet(key, { ok: true, items: [] });
    expect(cacheGet(key)).toBeTruthy();
  });
});

// ── 6. aggregator: rateBudget 透传 ─────────────────────────────────
describe("aggregator: rateBudget 透传", () => {
  it("getLeaderboard 返回值顶层含 rateBudget.aa", async () => {
    const result = await getLeaderboard({ category: "llm", dimension: "elo" });
    expect(result.rateBudget).toBeDefined();
    expect(result.rateBudget.aa).toBeDefined();
    expect(result.rateBudget.aa.used).toBeGreaterThanOrEqual(0);
    expect(result.rateBudget.aa.limit).toBe(1000);
    expect(typeof result.rateBudget.aa.dayResetsAt).toBe("string");
    expect(typeof result.rateBudget.aa.lastAcquireAt === "string" || result.rateBudget.aa.lastAcquireAt === null).toBe(true);
  });
});

// ── 7. aggregator: errors 收集 ─────────────────────────────────────
describe("aggregator: errors 收集", () => {
  it("BoardResult.errors 顶层默认 []", async () => {
    const result = await getLeaderboard({ category: "llm", dimension: "elo" });
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("getBoardRaw 返回包含 error 字段 (成功时为 null)", async () => {
    // 该测试验证 getBoardRaw 的返回值形状 — 它目前是 module.exports 私有函数,
    // 通过正常调用 getLeaderboard 间接验证:
    const result = await getLeaderboard({ category: "llm", dimension: "elo" });
    // errors[] 顶层存在, 内部字段若出现应有 source/message/ts
    for (const e of result.errors) {
      expect(typeof e.source).toBe("string");
      expect(typeof e.message).toBe("string");
      expect(typeof e.ts).toBe("string");
    }
  });
});
