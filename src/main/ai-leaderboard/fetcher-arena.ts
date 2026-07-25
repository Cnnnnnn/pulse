/**
 * src/main/ai-leaderboard/fetcher-arena.ts
 *
 * 主源1：Arena 社区快照（text / code / vision / text-to-image / text-to-video 多 board）。
 * 免鉴权；优先走 api.wulong.dev，失败回退 GitHub raw 社区快照。
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
export const BOARD_TO_CATEGORY: Record<string, string> = {
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
export function inferVendor(name: any): string {
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
 * ponytail: Agent 榜官方 RSC 端点（arena.ai 服务端渲染 payload）。
 * Cloudflare 只拦 /api/ 返回 403，但页面/RSC 路由放行（偶发 403，需重试+回落）。
 * 用于拿 agent 满血 38 模型 × 6 维度（社区快照仅 top-10）。
 * 维度顺序按 AGENT_DIMENSIONS 位置对齐 —— 需在干净 200 样本上确认一次；
 * 任何解析异常/维度数不符都回落快照，绝不阻塞。
 */
const AGENT_DIMENSIONS = [
  "Net Improvement", "Confirmed Success", "Praise vs Complaint",
  "Steerability", "Bash Recovery", "Tool Hallucination",
];
const AGENT_RSC_URL = "https://arena.ai/leaderboard/agent?_rsc=x";
// 设 false 可强制只用快照（被 WAF 持续拦 / 调试维度映射时）
const USE_AGENT_RSC = true;

function sleep(ms: number): Promise<void> {
  return new Promise((r: any) => setTimeout(r, ms));
}

/** 拉取 RSC 文本（Node 全局 fetch + AbortController 超时）。 */
async function fetchText(url: string, opts: any = {}): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 12000);
  try {
    const res = await (fetch as any)(url, { headers: opts.headers, signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** 从 RSC flight 文本抽所有含 model+score+ciLower 的扁平对象（括号平衡）。 */
function extractAgentEntries(html: string): any[] {
  const out: any[] = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const at = html.indexOf('"model"', i);
    if (at >= 0 && at < i + 40 && html[i] === "{") {
      let depth = 0, j = i; const buf: string[] = [];
      while (j < n) {
        const c = html[j]; buf.push(c);
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) break; }
        j++;
      }
      const seg = buf.join("");
      if (seg.includes('"score"') && seg.includes("ciLower")) {
        try { out.push(JSON.parse(seg)); } catch { /* skip malformed */ }
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

/** 解析 RSC → 快照兼容的 agent models（scores:[{name,score,ci}]）。 */
function parseAgentRSC(html: string): any[] | null {
  const entries = extractAgentEntries(html);
  if (!entries.length) return null;
  const byModel = new Map<string, any[]>();
  const order: string[] = [];
  for (const e of entries) {
    const name = e.model || e.contenderName;
    if (!name) continue;
    if (!byModel.has(name)) { byModel.set(name, []); order.push(name); }
    byModel.get(name)!.push(e);
  }
  const models: any[] = [];
  for (const name of order) {
    const list = byModel.get(name)!;
    // 保守：维度数必须 == 6，否则跳过该模型（避免错位/误标）
    if (list.length !== AGENT_DIMENSIONS.length) continue;
    const scores = list.map((e: any, idx: number) => ({
      name: AGENT_DIMENSIONS[idx],
      score: Number(e.score) || 0,
      ci: Number(((e.ciUpper ?? e.ciLower ?? 0) - (e.ciLower ?? 0)) / 2) || 0,
    }));
    const head = list[0];
    models.push({
      rank: Number(head.rank) || 0,
      model: name,
      vendor: head.modelOrganization || inferVendor(name),
      license: head.license != null ? String(head.license) : null,
      sessions: Number(head.sessions) || 0,
      scores,
    });
  }
  return models.length ? models : null;
}

/** Agent 榜：优先官方 RSC（满血），失败回落社区快照。返回快照兼容 payload。 */
async function fetchAgentViaRSC(timeoutMs = 12000): Promise<{ dimensions: string[]; models: any[]; lastUpdated: string } | null> {
  if (!USE_AGENT_RSC) return null;
  const headers = { "User-Agent": BROWSER_UA, "RSC": "1", "Accept": "text/x-component" };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const html = await fetchText(AGENT_RSC_URL, { timeoutMs, headers });
      if (html && html.length > 1000) {
        const models = parseAgentRSC(html);
        if (models && models.length) {
          const dm = html.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/);
          return { dimensions: AGENT_DIMENSIONS, models, lastUpdated: dm ? dm[0] : "" };
        }
      }
    } catch (e: any) {
      // 403 / 超时 / 解析失败 -> 重试
    }
    await sleep(700 * (attempt + 1));
  }
  return null;
}

async function fetchOneBoard(board: string, timeoutMs?: number): Promise<any> {
  // Agent: 优先官方 RSC 端点（满血 38×6），失败回落社区快照
  if (board === "agent") {
    const rsc = await fetchAgentViaRSC(timeoutMs);
    if (rsc && rsc.models.length) {
      return {
        meta: {
          leaderboard: "agent",
          dimensions: rsc.dimensions,
          last_updated: rsc.lastUpdated,
          model_count: rsc.models.length,
        },
        models: rsc.models,
      };
    }
  }
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

/**
 * 从多 board 原始快照里提取「最新的数据截止日期」。
 * 各 board payload 形如 { meta:{ last_updated:"Jul 16, 2026", fetched_at:"...ISO" }, models:[] }。
 * 取所有 board 中「日期最靠后」的 last_updated；缺失时退化为 fetched_at；再缺失返回 null。
 * @param boardsMap { [board]: payload }
 * @returns {string|null}
 */
export function extractArenaLastUpdated(boardsMap: any): string | null {
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
export async function fetch(opts: any = {}): Promise<any> {
  const timeoutMs = opts && opts.timeoutMs;
  const boardsMap: Record<string, any> = {};
  let anyOk = false;
  await Promise.all(
    BOARDS.map(async (board: any) => {
      const data = await fetchOneBoard(board, timeoutMs);
      if (data && (Array.isArray(data.models) || (data.data && Array.isArray(data.data)))) {
        boardsMap[board] = data;
        anyOk = true;
      }
    }),
  );
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
export function m_lic(e: any): string | null {
  return e.license != null ? String(e.license) : null;
}

module.exports = {
  id: "arena-snapshot",
  label: "Arena AI Snapshot",
  requiresKey: false,
  fetch,
  normalize,
};

export const id = "arena-snapshot";
export const label = "Arena AI Snapshot";
export const requiresKey = false;
