/**
 * src/main/ai-leaderboard/fetcher-arena.ts
 *
 * 主源1：Arena 排行榜。v2.8x 起主源为官方 HuggingFace 数据集
 *   `lmarena-ai/leaderboard-dataset`（MIT，满 blood、免 Cloudflare、免鉴权、带历史），
 *   失败回落社区快照 api.wulong.dev → GitHub raw oolong-tea-2026。
 * 覆盖 11 个 arena（text/vision/code/text-to-image/text-to-video/agent/document/search/image-edit/image-to-video/video-edit），
 * 其中 agent 拉 6 个 per-signal config 合并成 scores[]（满血 38 模型）。
 *
 * 单源失败不影响其它源（aggregator 兜底链）。本 fetcher 内部 try/catch，
 * 失败仅返回 {ok:false}，绝不向上抛。
 */

import { fetchJson, BROWSER_UA } from "./normalize";
import { SOURCE, toAiModel, slugifyModel, normalizeVendor } from "./types";
import { logFetchError } from "../games/log";

// 主端点（社区维护的 Arena 快照聚合，path 前缀是 /arena-ai-leaderboards/）
const ARENA_BASE = "https://api.wulong.dev/arena-ai-leaderboards/v1/leaderboard";
// 失败回退：社区快照 GitHub raw（先读 latest.json 拿当日日期，再按 board 拉）
const ARENA_GITHUB_RAW = "https://raw.githubusercontent.com/oolong-tea-2026/arena-ai-leaderboards/main";

const BOARDS = [
  "text", "vision", "code", "text-to-image", "text-to-video",
  // ponytail: arena.ai 现网 11 个 arena 全量接入 (v2.8x)
  "agent", "document", "search", "image-edit", "image-to-video", "video-edit",
];

// board → 模型大类（用于给合并后的模型标注 category 提示）
const BOARD_TO_CATEGORY: Record<string, string> = {
  text: "llm",
  code: "code",
  vision: "multimodal",
  "text-to-image": "image",
  "text-to-video": "video",
  // ponytail: 新增 6 个 arena 的大类映射
  agent: "llm",
  document: "llm",
  search: "llm",
  "image-edit": "image",
  "image-to-video": "video",
  "video-edit": "video",
};

// 按优先级决定 category 提示（arena 多 board 共存的模型取主 board）
const CATEGORY_PRIORITY = [
  "text", "code", "vision", "text-to-image", "text-to-video",
  "agent", "document", "search", "image-edit", "image-to-video", "video-edit",
];

/**
 * 从模型名粗猜 vendor（Arena 某些 board 不提供 vendor 字段时的兜底）。
 * @param name
 * @returns {string}
 */
function inferVendor(name: any): string {
  const n = String(name || "").toLowerCase();
  if (n.includes("gpt") || n.includes("o1") || n.includes("o3")) return "openai";
  if (n.includes("claude")) return "anthropic";
  if (n.includes("gemini")) return "google";
  if (n.includes("llama") || n.includes("muse")) return "meta";
  if (n.includes("mistral")) return "mistral";
  if (n.includes("grok")) return "xai";
  if (n.includes("deepseek")) return "deepseek";
  if (n.includes("qwen")) return "qwen";
  if (n.includes("glm")) return "zhipu";
  if (n.includes("command")) return "cohere";
  if (n.includes("hunyuan")) return "tencent";
  if (n.includes("doubao") || n.includes("seed")) return "bytedance";
  if (n.includes("abab") || n.includes("minimax")) return "minimax";
  if (n.includes("mimo")) return "xiaomi";
  if (n.includes("yi-") || n.includes("yi.")) return "zero-one";
  if (n.includes("step-") || n.includes("stepfun")) return "stepfun";
  if (n.includes("kimi") || n.includes("moonshot")) return "moonshot";
  return "";
}

/**
 * ponytail: Arena 官方数据源 — HuggingFace `lmarena-ai/leaderboard-dataset`（v2.8x 主源）。
 * lmarena 官方发布的历史快照数据集（MIT）：覆盖全部 arena + agent 6 维 per-signal 子集，
 * 满 blood（text overall 378 / agent 38），HF CDN 无 Cloudflare、免鉴权、带历史。
 * 经 datasets-server /filter(category='overall') 拉取；失败回落社区快照（wulong/GitHub raw）。
 */
const HF_DATASET = "lmarena-ai/leaderboard-dataset";
const HF_SERVER = "https://datasets-server.huggingface.co";

// board → HF config。text/vision 用 _style_control 对齐 arena.ai 默认 style-control 榜；
// code 对应 HF webdev config。
const BOARD_TO_HF: Record<string, string> = {
  text: "text_style_control",
  vision: "vision_style_control",
  code: "webdev",
  "text-to-image": "text_to_image",
  "text-to-video": "text_to_video",
  document: "document",
  search: "search",
  "image-edit": "image_edit",
  "image-to-video": "image_to_video",
  "video-edit": "video_edit",
};

// Agent 6 维：1 聚合 config（overall=Net Improvement）+ 5 per-signal config。score 为 0-1，×100 对齐快照百分位。
const AGENT_DIMENSIONS = [
  "Net Improvement", "Confirmed Success", "Praise vs Complaint",
  "Steerability", "Bash Recovery", "Tool Hallucination",
];
const AGENT_HF_CONFIGS: { config: string; dim: string }[] = [
  { config: "agent", dim: "Net Improvement" },
  { config: "agent_task_outcome_explicit", dim: "Confirmed Success" },
  { config: "agent_praise_complaint", dim: "Praise vs Complaint" },
  { config: "agent_steerability", dim: "Steerability" },
  { config: "agent_bash_recovery_steps", dim: "Bash Recovery" },
  { config: "agent_tool_hallucination", dim: "Tool Hallucination" },
];

// Text 榜 category 子榜（arena.ai 文本大类下的子排行榜）。overall 为默认；其余按需拉取合并成 categories map。
const TEXT_CATEGORY_KEYS = [
  "overall", "coding", "math", "hard", "instruction_following", "non_english",
];

// Code 榜 category 子榜（arena.ai Code 大类下：WebDev + Image-to-WebDev）。
const CODE_CATEGORY_KEYS = [
  "overall", "image_to_webdev",
];

/** 拉一个 HF config 的全部行（/filter category=<category>，分页 length=100）。 */
async function fetchHfConfig(config: string, category = "overall", timeoutMs = 8000): Promise<any[]> {
  const headers = { "User-Agent": BROWSER_UA, Accept: "application/json" };
  const where = encodeURIComponent(`"category"='${category}'`);
  const out: any[] = [];
  let offset = 0;
  for (let page = 0; page < 5; page++) {
    const url = `${HF_SERVER}/filter?dataset=${encodeURIComponent(HF_DATASET)}&config=${encodeURIComponent(config)}&split=latest&where=${where}&offset=${offset}&length=100`;
    const d = await fetchJson(url, { timeoutMs, headers });
    const rows = Array.isArray(d && d.rows) ? d.rows.map((r: any) => r.row) : [];
    out.push(...rows);
    const total = Number(d && d.num_rows_total) || 0;
    offset += rows.length;
    if (rows.length < 100 || (total && offset >= total) || rows.length === 0) break;
  }
  return out;
}

/** HF 行 → 快照兼容 model。agentStyle=true 时 score×100（对齐快照百分位量级）。 */
export function hfRowToModel(row: any, agentStyle: boolean): any {
  const model = String(row.model_name || "");
  if (!model) return null;
  const vendor = row.organization || inferVendor(model) || "";
  const license = row.license != null ? String(row.license) : null;
  const rank = Number(row.rank) || 0;
  if (agentStyle) {
    const sc = Number(row.score) || 0;
    const lo = Number(row.score_ci_lower) || 0;
    const up = Number(row.score_ci_upper) || 0;
    return { rank, model, vendor, license, _agentScore: sc * 100, _agentCi: ((up - lo) / 2) * 100, _sessions: Number(row.session_count) || 0 };
  }
  const rating = Number(row.rating) || 0;
  const lo = Number(row.rating_lower) || 0;
  const up = Number(row.rating_upper) || 0;
  return { rank, model, vendor, license, score: rating, ci: (up - lo) / 2, votes: Number(row.vote_count) || 0 };
}

/** HF 主源拉一个 board（agent 合并 6 config 成 scores[]）。失败返回 null → 走快照兜底。 */
export async function fetchOneBoardHf(board: string, timeoutMs?: number): Promise<any | null> {
  try {
    if (board === "agent") {
      // 拉 6 个 config，按 model_name 合并成 scores[]（顺序对齐 AGENT_DIMENSIONS）
      const models = new Map<string, any>();
      let lastUpdated = "";
      for (const { config, dim } of AGENT_HF_CONFIGS) {
        const rows = await fetchHfConfig(config, "overall", timeoutMs);
        for (const row of rows) {
          const m = hfRowToModel(row, true);
          if (!m) continue;
          if (!models.has(m.model)) {
            models.set(m.model, {
              rank: m.rank, model: m.model, vendor: m.vendor, license: m.license,
              sessions: m._sessions, scores: [],
            });
          }
          models.get(m.model).scores.push({ name: dim, score: m._agentScore, ci: m._agentCi });
          if (!lastUpdated && row.leaderboard_publish_date) lastUpdated = String(row.leaderboard_publish_date);
        }
      }
      const out: any[] = [];
      for (const m of models.values()) {
        m.scores.sort((a: any, b: any) => AGENT_DIMENSIONS.indexOf(a.name) - AGENT_DIMENSIONS.indexOf(b.name));
        if (m.scores.length === AGENT_DIMENSIONS.length) out.push(m); // 维度数 != 6 丢弃（防错位）
      }
      if (!out.length) return null;
      return {
        meta: { leaderboard: "agent", dimensions: AGENT_DIMENSIONS.slice(), last_updated: lastUpdated, model_count: out.length },
        models: out,
      };
    }
    if (board === "text") {
      // ponytail: 文本大类下 6 个 category 子榜，按 model_name 合并成 categories map（top-level = overall）。
      // 呼应 arena.ai 文本榜的 Overall/Coding/Math/Hard/IF/Non-English 子榜切换。
      const config = "text_style_control";
      const models = new Map<string, any>();
      let lastUpdated = "";
      await mapWithConcurrency(TEXT_CATEGORY_KEYS, 3, async (cat: string) => {
        const rows = await fetchHfConfig(config, cat, timeoutMs);
        for (const row of rows) {
          const m = hfRowToModel(row, false);
          if (!m) continue;
          if (!models.has(m.model)) {
            models.set(m.model, { rank: 0, model: m.model, vendor: m.vendor, license: m.license, score: 0, ci: 0, votes: 0, categories: {} });
          }
          const e = models.get(m.model);
          e.categories[cat] = { rank: m.rank, score: m.score, ci: m.ci, votes: m.votes };
          if (cat === "overall") { e.rank = m.rank; e.score = m.score; e.ci = m.ci; e.votes = m.votes; }
          if (!lastUpdated && row.leaderboard_publish_date) lastUpdated = String(row.leaderboard_publish_date);
        }
      });
      const out: any[] = [...models.values()].filter((m: any) => m.categories.overall);
      if (!out.length) return null;
      return { meta: { leaderboard: "text", last_updated: lastUpdated, model_count: out.length }, models: out };
    }
    if (board === "code") {
      // ponytail: Code 大类下 WebDev(overall) + Image-to-WebDev 两个 category 子榜，同 text 模式合并成 categories map。
      const config = "webdev";
      const models = new Map<string, any>();
      let lastUpdated = "";
      await mapWithConcurrency(CODE_CATEGORY_KEYS, 3, async (cat: string) => {
        const rows = await fetchHfConfig(config, cat, timeoutMs);
        for (const row of rows) {
          const m = hfRowToModel(row, false);
          if (!m) continue;
          if (!models.has(m.model)) {
            models.set(m.model, { rank: 0, model: m.model, vendor: m.vendor, license: m.license, score: 0, ci: 0, votes: 0, categories: {} });
          }
          const e = models.get(m.model);
          e.categories[cat] = { rank: m.rank, score: m.score, ci: m.ci, votes: m.votes };
          if (cat === "overall") { e.rank = m.rank; e.score = m.score; e.ci = m.ci; e.votes = m.votes; }
          if (!lastUpdated && row.leaderboard_publish_date) lastUpdated = String(row.leaderboard_publish_date);
        }
      });
      const out: any[] = [...models.values()].filter((m: any) => m.categories.overall);
      if (!out.length) return null;
      return { meta: { leaderboard: "code", last_updated: lastUpdated, model_count: out.length }, models: out };
    }
    const config = BOARD_TO_HF[board];
    if (!config) return null;
    const rows = await fetchHfConfig(config, undefined, timeoutMs);
    const models = rows.map((r: any) => hfRowToModel(r, false)).filter(Boolean);
    if (!models.length) return null;
    const lastUpdated = rows[0] && rows[0].leaderboard_publish_date ? String(rows[0].leaderboard_publish_date) : "";
    return { meta: { leaderboard: board, last_updated: lastUpdated, model_count: models.length }, models };
  } catch (err: any) {
    logFetchError(`arena-hf:${board}`, err);
    return null;
  }
}

/** 快照兜底：wulong 主 → GitHub raw 回退（agent 快照已带 scores[] 6 维截断 10 条）。 */
async function fetchOneBoardSnapshot(board: string, timeoutMs?: number): Promise<any | null> {
  const headers = { "User-Agent": BROWSER_UA, Accept: "application/json" };
  try {
    return await fetchJson(`${ARENA_BASE}?name=${encodeURIComponent(board)}`, {
      timeoutMs: timeoutMs || 9000,
      headers,
    });
  } catch (err: any) {
    // 失败回退 GitHub raw: 先读 latest.json 拿到当日日期, 再按 board 拉当天的 json
    try {
      const latest = await fetchJson(`${ARENA_GITHUB_RAW}/data/latest.json`, {
        timeoutMs: timeoutMs || 9000,
        headers,
      });
      const datePath =
        (latest && (latest.date || latest.latest || latest.path)) ||
        new Date().toISOString().slice(0, 10);
      // datePath 形如 "2026-03-21" 或 "data/2026-03-21" — 兼容两种
      const cleanDate = String(datePath).replace(/^data\//, "").replace(/\.json$/, "");
      return await fetchJson(
        `${ARENA_GITHUB_RAW}/data/${cleanDate}/${encodeURIComponent(board)}.json`,
        { timeoutMs: timeoutMs || 9000, headers },
      );
    } catch (err2: any) {
      logFetchError(`arena:${board}`, err2);
      return null;
    }
  }
}

async function fetchOneBoard(board: string, timeoutMs?: number): Promise<any | null> {
  // ponytail: 官方 HF 数据集为主源（满 blood + 稳定 + 免 Cloudflare），失败回落社区快照。
  const hf = await fetchOneBoardHf(board, timeoutMs);
  if (hf && Array.isArray(hf.models) && hf.models.length) return hf;
  return fetchOneBoardSnapshot(board, timeoutMs);
}

/**
 * 从多 board 原始快照里提取「最新的数据截止日期」。
 * 各 board payload 形如 { meta:{ last_updated:"Jul 16, 2026", fetched_at:"...ISO" }, models:[] }。
 * 取所有 board 中「日期最靠后」的 last_updated；缺失时退化为 fetched_at；再缺失返回 null。
 * @param boardsMap { [board]: payload }
 * @returns {string|null}
 */
function extractArenaLastUpdated(boardsMap: any): string | null {
  if (!boardsMap || typeof boardsMap !== "object") return null;
  let latest: { raw: string; t: number } | null = null; // { raw, t }
  for (const board of Object.keys(boardsMap)) {
    const payload = boardsMap[board];
    if (!payload || typeof payload !== "object") continue;
    const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
    const raw = meta.last_updated || meta.lastUpdated || meta.fetched_at || null;
    if (!raw || typeof raw !== "string") continue;
    const t = Date.parse(raw);
    if (Number.isFinite(t)) {
      if (latest == null || t > latest.t) latest = { raw, t };
    } else if (latest == null) {
      // 无法解析的日期串（如 "Jul 16, 2026" 在个别环境解析失败）先保留
      latest = { raw, t: -Infinity };
    }
  }
  return latest ? latest.raw : null;
}

/**
 * 拉取全部 board 的原始快照。
 * @returns {Promise<object>} RawFetchResult：{ ok, source, data:{boards, lastUpdated}, fetchedAt }
 */
/**
 * 限并发映射：避免一次性 Promise.all 11+ 个 board 触发 undici 连接池/重定向递归栈溢出。
 * 顺序派发 `limit` 个 worker，各 worker 从共享游标取任务。
 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<void> {
  let idx = 0;
  const n = items.length;
  const worker = async () => {
    while (idx < n) {
      const i = idx++;
      try { await fn(items[i], i); } catch { /* 单 board 失败不阻塞其余 */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, n) }, () => worker()));
}

/**
 * 拉取全部 board 的原始快照。
 * @returns {Promise<object>} RawFetchResult：{ ok, source, data:{boards, lastUpdated}, fetchedAt }
 */
export async function fetch(opts: any = {}): Promise<any> {
  const timeoutMs = opts && opts.timeoutMs;
  const boardsMap: Record<string, any> = {};
  let anyOk = false;
  // ponytail: 限并发 3（原 Promise.all 11 个 board 在 Electron undici 下栈溢出）。
  await mapWithConcurrency(BOARDS, 3, async (board: string) => {
    const data = await fetchOneBoard(board, timeoutMs);
    if (data && (Array.isArray(data.models) || (data.data && Array.isArray(data.data)))) {
      boardsMap[board] = data;
      anyOk = true;
    }
  });
  if (!anyOk) {
    return {
      ok: false,
      source: "arena-snapshot",
      data: null,
      fetchedAt: new Date().toISOString(),
    };
  }
  return {
    ok: true,
    source: "arena-snapshot",
    data: { boards: boardsMap, lastUpdated: extractArenaLastUpdated(boardsMap) },
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 把多 board 原始快照归一化为 AiModel[]。
 * 同一模型跨 board 合并为单条，arena 切片填充各 board 成绩。
 * @param raw { boards: { [board]: payload } }
 * @returns {object[]}
 */
export function normalize(raw: any): any[] {
  const boards = (raw && raw.boards) || {};
  const byKey = new Map<string, any>();
  for (const board of Object.keys(boards)) {
    const payload = boards[board];
    const models = Array.isArray(payload && payload.models)
      ? payload.models
      : Array.isArray(payload && payload.data)
        ? payload.data
        : [];
    for (const m of models) {
      if (!m || !m.model) continue;
      let score: number;
      let ci = 0;
      let votes = 0;
      let sessions = 0;
      let dimensions: Record<string, { score: number; ci: number }> | undefined;
      if (Array.isArray(m.scores) && m.scores.length === AGENT_DIMENSIONS.length) {
        // Agent board（RSC 满血 / 社区快照）：维度分数数组 + 会话体量，无单值 score/ci。
        dimensions = {};
        for (const s of m.scores) {
          const sName = String(s.name || "");
          const sScore = Number(s.score) || 0;
          const sCi = Number(s.ci) || 0;
          if (sName) dimensions[sName] = { score: sScore, ci: sCi };
        }
        // 头条分数取首维（Net Improvement），缺失时退化为 0
        score = m.scores[0] ? Number(m.scores[0].score) || 0 : 0;
        ci = m.scores[0] ? Number(m.scores[0].ci) || 0 : 0;
        sessions = Number(m.sessions) || 0;
      } else if (Array.isArray(m.scores) && m.scores.length) {
        // 维度数不符（非 6）→ 不信任，置 NaN 使其在下方被过滤（与 RSC 解析端一致，防错位）
        score = NaN;
      } else {
        score = Number(m.score);
        ci = Number(m.ci) || 0;
        votes = Number(m.votes) || 0;
      }
      if (!Number.isFinite(score)) continue;
      const vendorRaw = m.vendor || inferVendor(m.model) || "";
      const vendor = normalizeVendor(vendorRaw);
      const id = slugifyModel(vendor, m.model);
      const existing =
        byKey.get(id) ||
        {
          id,
          name: String(m.model),
          vendor,
          vendorRaw: vendorRaw || null,
          arena: {},
          boardsPresent: [],
        };
      existing.name = String(m.model);
      existing.vendor = vendor;
      existing.vendorRaw = vendorRaw || existing.vendorRaw;
      if (m.license != null) existing.license = m.license;
      const entry: any = {
        rank: Number(m.rank) || 0,
        score,
        ci,
        votes,
      };
      if (sessions) entry.sessions = sessions;
      if (dimensions) entry.dimensions = dimensions;
      // ponytail: text 榜 category 子榜映射（overall/coding/math/hard/instruction_following/non_english）
      if (m.categories && typeof m.categories === "object") entry.categories = m.categories;
      existing.arena[board] = entry;
      if (!existing.boardsPresent.includes(board)) existing.boardsPresent.push(board);
      byKey.set(id, existing);
    }
  }

  const out: any[] = [];
  for (const e of byKey.values()) {
    // category 提示：取优先级最高（最“主”）的 board
    let category = "llm";
    for (const b of CATEGORY_PRIORITY) {
      if (e.boardsPresent.includes(b)) {
        category = BOARD_TO_CATEGORY[b];
        break;
      }
    }
    out.push(
      toAiModel({
        id: e.id,
        name: e.name,
        vendor: e.vendor,
        vendorRaw: e.vendorRaw,
        category,
        license: m_lic(e),
        arena: e.arena,
        sources: { arena: SOURCE.LIVE, aa: SOURCE.NONE, openrouter: SOURCE.NONE },
      }),
    );
  }
  return out;
}

// 取 license：各 board 可能不同，取第一个非空
function m_lic(e: any): string | null {
  return e.license != null ? String(e.license) : null;
}

module.exports = {
  id: "arena-snapshot",
  label: "Arena AI Snapshot",
  requiresKey: false,
  fetch,
  normalize,
  hfRowToModel,
  fetchOneBoardHf,
};

export const id = "arena-snapshot";
export const label = "Arena AI Snapshot";
export const requiresKey = false;
