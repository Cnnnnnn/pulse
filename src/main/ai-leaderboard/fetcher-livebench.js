/**
 * src/main/ai-leaderboard/fetcher-livebench.js
 *
 * LiveBench 官方 leaderboard fetcher。
 *
 * 数据源 (livebench.ai 静态 GitHub Pages):
 *   - main bundle (SPA build): 包含 `const pe=["2024-06-24",...]` 数组, 全 release 列表
 *   - table_<release>.csv        model × 23 subtask scores (0..100)
 *   - categories_<release>.json  7 大分类 -> subtask 列表
 *   - cost_<release>.csv         model × (23 subtask cost per successful task + nq_*)
 *
 * robots.txt = 空 Disallow, GitHub Pages 静态托管, 无认证/无 CORS 限制 (Electron 主进程 fetch)。
 * 数据比 HF `livebench/model_judgment` 新 3-12 个月（HF 上传靠志愿者，滞后明显）。
 */

const { SOURCE, ATTRIBUTION, normalizeVendor } = require("./types");

const BASE = "https://livebench.ai";
const MAIN_JS_RE = /const pe=\[("[0-9]{4}-[0-9]{2}-[0-9]{2}",?)+\]/;
// ponytail: 仅取最新 release。多 release 同时显示对用户无意义（最新 = 最相关）且需要更多渲染分支。
// 升级路径: 想显示 release 切换? 加 query param + fetchEach。
const LB_TTL = 6 * 60 * 60 * 1000; // 6h；月度更新，但官方可能在月中插入补丁 (例 2025-12-23 中插 release)

let _cachedMainJs = null;
let _cachedReleaseAt = 0;
const MAIN_JS_TTL = 60 * 60 * 1000; // main.js 1h 缓存一次，避免每次都拉 300K

/**
 * ponytail: 极简 CSV parser — 仅支持无嵌套引号、无逗号在字段内的纯数值 CSV。
 * LiveBench CSV 形状固定: model 名 + 全数字列, 满足假设。
 * 若遇到含逗号 model 名 (实际不会), 直接抛错让上层 fail-fast, 不静默错乱数据。
 */
function parseCsv(text) {
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  const out = new Array(lines.length - 1);
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length !== headers.length) {
      throw new Error(
        `livebench csv: row ${i} has ${cols.length} cols, expected ${headers.length}`,
      );
    }
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const v = cols[j];
      const n = Number(v);
      row[headers[j]] = v !== "" && !Number.isNaN(n) ? n : v;
    }
    out[i - 1] = row;
  }
  return out;
}

async function fetchWithRetry(url, opts = {}, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, 300 * 2 ** i));
    }
  }
  throw lastErr;
}

/**
 * 从 livebench.ai SPA bundle 解析最新 release (YYYY-MM-DD)。
 * 用 1h 缓存避免每次都拉 300K JS。
 */
async function latestRelease() {
  const now = Date.now();
  if (_cachedMainJs && now - _cachedReleaseAt < MAIN_JS_TTL) {
    return _cachedMainJs;
  }
  // 先 HEAD /index.html 拿 main.js 哈希; 失败则用已知最新.
  // ponytail: 用 HEAD 而非 GET, 省 300K 流量 + 减少对 GitHub Pages 的负载.
  let mainJsUrl;
  try {
    const idxRes = await fetchWithRetry(`${BASE}/`, {}, 1);
    const html = await idxRes.text();
    // 找 <script src="/static/js/main.<hash>.js">
    const m = html.match(/\/static\/js\/main\.([a-f0-9]+)\.js/);
    if (!m) throw new Error("no main.js in index.html");
    mainJsUrl = `${BASE}/static/js/main.${m[1]}.js`;
  } catch (e) {
    // fallback: 用最近一次成功值 (callers 都会 catch, 此处抛让上层决定)
    throw new Error(`livebench: cannot resolve main.js: ${e.message}`);
  }

  const res = await fetchWithRetry(mainJsUrl, {}, 1);
  const body = await res.text();
  const m = body.match(MAIN_JS_RE);
  if (!m) throw new Error("livebench: release array pe=[...] not found in main.js");
  const arr = m[0].match(/"[0-9]{4}-[0-9]{2}-[0-9]{2}"/g).map((s) => s.slice(1, -1));
  if (arr.length === 0) throw new Error("livebench: empty release list");
  // ponytail: 信任 build 输出已排序; 不重排以省 O(n log n).
  // 若 build 改成乱序, 升序排序即可, 无副作用.
  const latest = arr[arr.length - 1];
  _cachedMainJs = latest;
  _cachedReleaseAt = now;
  return latest;
}

function releaseToSlug(release) {
  return release.replace(/-/g, "_");
}

const livebenchFetcher = {
  id: "livebench",
  source: SOURCE.LIVE,
  attribution: ATTRIBUTION.livebench,

  async fetch() {
    const release = await latestRelease();
    const slug = releaseToSlug(release);
    const [tableRes, catRes, costRes] = await Promise.all([
      fetchWithRetry(`${BASE}/table_${slug}.csv`),
      fetchWithRetry(`${BASE}/categories_${slug}.json`),
      // ponytail: cost CSV 旧 release 不一定有 (2024 release 全 404). best-effort, 失败不阻塞主表.
      fetchWithRetry(`${BASE}/cost_${slug}.csv`, {}, 1).catch(() => null),
    ]);
    const [tableText, catText, costText] = await Promise.all([
      tableRes.text(),
      catRes.text(),
      costRes ? costRes.text().catch(() => null) : Promise.resolve(null),
    ]);
    const categories = JSON.parse(catText);
    const data = { release, table: parseCsv(tableText), categories };
    if (costText) {
      data.cost = parseCsv(costText); // 同 model 名 key 联合查
    }
    return { ok: true, data };
  },

  /**
   * raw -> AiModel[] 切片
   * 每个 AiModel.livebench = {
   *   overall, byCategory: {...}, byTask: {...}, release,
   *   cost?: { perSuccessfulTask, perQuestion, byTask: {...}, tokens, price }
   * }
   */
  normalize(raw) {
    if (!raw || !Array.isArray(raw.table) || !raw.categories) return [];
    const { release, table, categories, cost } = raw;

    // subtask -> category 反向索引
    const taskToCat = {};
    for (const [cat, tasks] of Object.entries(categories)) {
      for (const t of tasks) taskToCat[t] = cat;
    }

    // cost 行按 model 名做 map, O(1) 查
    const costByModel = new Map();
    if (Array.isArray(cost)) {
      for (const row of cost) {
        if (row && row.model) costByModel.set(row.model, row);
      }
    }

    // ponytail: cost 字段白名单 — 避免把 nq_*/out_* 噪音字段全部塞进 livebench.cost.
    // 想看原始 CSV? 直接 fetch cost_${slug}.csv. 这里只暴露消费侧需要的指标.
    const COST_TASK_KEYS = Object.keys(categories).flatMap((c) => categories[c]);

    return table
      .filter((row) => row.model && typeof row.model === "string")
      .map((row) => {
        const byTask = {};
        const catScores = {};
        for (const task of COST_TASK_KEYS) {
          const v = row[task];
          if (typeof v === "number" && Number.isFinite(v)) {
            byTask[task] = v;
            const cat = taskToCat[task];
            if (cat) {
              if (!catScores[cat]) catScores[cat] = [];
              catScores[cat].push(v);
            }
          }
        }
        const byCatFinal = {};
        for (const cat of Object.keys(catScores)) {
          const arr = catScores[cat];
          byCatFinal[cat] = arr.reduce((a, b) => a + b, 0) / arr.length;
        }
        const allScores = Object.values(byTask);
        const overall =
          allScores.length > 0
            ? allScores.reduce((a, b) => a + b, 0) / allScores.length
            : null;

        // 拼 cost 子结构
        const costRow = costByModel.get(row.model);
        let costSlice = null;
        if (costRow) {
          const byTaskCost = {};
          for (const task of COST_TASK_KEYS) {
            const v = costRow[task];
            if (typeof v === "number" && Number.isFinite(v)) byTaskCost[task] = v;
          }
          costSlice = {
            perSuccessfulTask:
              typeof costRow.cost_per_successful_task === "number"
                ? costRow.cost_per_successful_task
                : null,
            perQuestion:
              typeof costRow.cost_per_question === "number"
                ? costRow.cost_per_question
                : null,
            byTask: byTaskCost,
            tokens:
              typeof costRow.avg_input_tokens === "number" &&
              typeof costRow.avg_output_tokens === "number"
                ? {
                    input: costRow.avg_input_tokens,
                    output: costRow.avg_output_tokens,
                  }
                : null,
            price:
              typeof costRow.input_price_per_million === "number" &&
              typeof costRow.output_price_per_million === "number"
                ? {
                    inputPer1M: costRow.input_price_per_million,
                    outputPer1M: costRow.output_price_per_million,
                  }
                : null,
          };
        }

        return {
          id: row.model,
          name: row.model,
          vendor: normalizeVendor(row.model),
          vendorRaw: null,
          category: "llm",
          livebench: {
            overall,
            byCategory: byCatFinal,
            byTask,
            release,
            cost: costSlice,
            fetchedAt: new Date().toISOString(),
          },
          sources: { livebench: SOURCE.LIVE },
        };
      });
  },
};

module.exports = livebenchFetcher;