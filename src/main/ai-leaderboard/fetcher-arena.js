/**
 * src/main/ai-leaderboard/fetcher-arena.js
 *
 * 主源1：Arena 社区快照（text / code / vision / text-to-image / video 多 board）。
 * 免鉴权；优先走 api.wulong.dev，失败回退 GitHub raw 社区快照。
 *
 * 单源失败不影响其它源（aggregator 兜底链）。本 fetcher 内部 try/catch，
 * 失败仅返回 {ok:false}，绝不向上抛。
 */

const { fetchJson, BROWSER_UA } = require("./normalize");
const { SOURCE, toAiModel, slugifyModel, normalizeVendor } = require("./types");
const { logFetchError } = require("../games/log");

// 主端点（社区维护的 Arena 快照聚合，path 前缀是 /arena-ai-leaderboards/）
const ARENA_BASE = "https://api.wulong.dev/arena-ai-leaderboards/v1/leaderboard";
// 失败回退：社区快照 GitHub raw（先读 latest.json 拿当日日期，再按 board 拉）
const ARENA_GITHUB_RAW = "https://raw.githubusercontent.com/oolong-tea-2026/arena-ai-leaderboards/main";

const BOARDS = ["text", "vision", "code", "text-to-image", "video"];

// board → 模型大类（用于给合并后的模型标注 category 提示）
const BOARD_TO_CATEGORY = {
  text: "llm",
  code: "code",
  vision: "multimodal",
  "text-to-image": "image",
  video: "video",
};

// 按优先级决定 category 提示（arena 多 board 共存的模型取主 board）
const CATEGORY_PRIORITY = ["text", "code", "vision", "text-to-image", "video"];

/**
 * 从模型名粗猜 vendor（Arena 某些 board 不提供 vendor 字段时的兜底）。
 * @param {string} name
 * @returns {string}
 */
function inferVendor(name) {
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

async function fetchOneBoard(board, timeoutMs) {
  const headers = { "User-Agent": BROWSER_UA, Accept: "application/json" };
  try {
    return await fetchJson(`${ARENA_BASE}?name=${encodeURIComponent(board)}`, {
      timeoutMs: timeoutMs || 9000,
      headers,
    });
  } catch (err) {
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
    } catch (err2) {
      logFetchError(`arena:${board}`, err2);
      return null;
    }
  }
}

/**
 * 拉取全部 board 的原始快照。
 * @returns {Promise<object>} RawFetchResult：{ ok, source, data:{boards}, fetchedAt }
 */
async function fetch(opts = {}) {
  const timeoutMs = opts && opts.timeoutMs;
  const boardsMap = {};
  let anyOk = false;
  await Promise.all(
    BOARDS.map(async (board) => {
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
    data: { boards: boardsMap },
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * 把多 board 原始快照归一化为 AiModel[]。
 * 同一模型跨 board 合并为单条，arena 切片填充各 board 成绩。
 * @param {object} raw { boards: { [board]: payload } }
 * @returns {object[]}
 */
function normalize(raw) {
  const boards = (raw && raw.boards) || {};
  const byKey = new Map();
  for (const board of Object.keys(boards)) {
    const payload = boards[board];
    const models = Array.isArray(payload && payload.models)
      ? payload.models
      : Array.isArray(payload && payload.data)
        ? payload.data
        : [];
    for (const m of models) {
      if (!m || !m.model) continue;
      const score = Number(m.score);
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
      existing.arena[board] = {
        rank: Number(m.rank) || 0,
        score,
        ci: Number(m.ci) || 0,
        votes: Number(m.votes) || 0,
      };
      if (!existing.boardsPresent.includes(board)) existing.boardsPresent.push(board);
      byKey.set(id, existing);
    }
  }

  const out = [];
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
function m_lic(e) {
  return e.license != null ? String(e.license) : null;
}

module.exports = {
  id: "arena-snapshot",
  label: "Arena AI Snapshot",
  requiresKey: false,
  fetch,
  normalize,
};
