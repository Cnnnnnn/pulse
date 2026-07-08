/**
 * src/renderer/stocks/stockStore.js
 *
 * 选股分析 renderer store — signals. 对照 fundStore.js.
 *
 * State:
 *   criteria: object            // 当前筛选条件
 *   activeStrategy: string      // 策略 id, "custom" = 自定义
 *   results: StockRow[]         // 筛选结果
 *   fetchedAt/loading/error     // 状态
 *   sortKey/sortDir             // 排序
 *   advancedOpen: boolean       // 高级条件折叠
 *   aiAdviseOpen: boolean       // 阶段二: AI 推荐抽屉是否打开
 *   aiAdvise: {                 // 阶段二: AI 推荐当前状态
 *     status: "idle"|"loading"|"ready"|"error",
 *     result: {criteria, sortConfig, summary}|null,
 *     fromCache: boolean,
 *     reason: string|null,
 *     error: string|null
 *   }
 */
import { signal, computed } from "@preact/signals";
import { taggedLog } from "../log.js";
import {
  STRATEGIES,
  buildCriteria,
  getStrategy,
} from "../../stocks/strategies";
import { DEFAULT_SCREENER_CRITERIA } from "../../stocks/stock-constants";
import { sortStocks } from "../../stocks/stock-filter";

const log = taggedLog("[stocks]");

// ── signals ──

export const criteria = signal({ ...DEFAULT_SCREENER_CRITERIA });
export const activeStrategy = signal("value_roe");
export const results = signal([]);
export const fetchedAt = signal(null);
export const loading = signal(false);
export const error = signal(null);
export const sortKey = signal("roe");
export const sortDir = signal("desc");
export const advancedOpen = signal(false);
// 阶段二: AI 推荐抽屉
export const aiAdviseOpen = signal(false);
export const aiAdvise = signal({
  status: "idle",
  result: null,
  fromCache: false,
  reason: null,
  error: null,
});

export const sortConfig = computed(() => ({
  key: sortKey.value,
  dir: sortDir.value,
}));

// ponytail 2026-07-08 D-6: 静默刷新 tick 计数器. signal 暴露给 UI (副标题 "X 秒前已刷新").
//   +1 触发响应, 实际 fetch 由 StockLayout useEffect 监听.
export const silentRefreshTick = signal(0);

// ponytail 2026-07-08 D-6: 静默刷新定时器模块级管理, 不放 signal (避免订阅抖动).
let _refreshTimerId = null;
// ponytail: 60s 刷新间隔. 主进程 cache TTL 60s, 刷一次即 cache miss → 重拉 (P-1 后 ~9s).
//   价值: 用户盯盘场景下"15 分钟没看 tab, 数据是几分钟前的" → 始终 ≤ 1 分钟旧.
const REFRESH_INTERVAL_MS = 60_000;

/**
 * 启动静默刷新定时器. tick 时不发请求, 只 +1 silentRefreshTick 让订阅者去拉 —
 * 让 StockLayout/ResultTable 决定具体怎么 fetch. 这样 stockStore 不依赖 IPC.
 */
export function startRefreshTimer() {
  stopRefreshTimer(); // 防重叠
  _refreshTimerId = setInterval(() => {
    silentRefreshTick.value += 1;
  }, REFRESH_INTERVAL_MS);
}

/** 停止定时器. 测试 + 离开页面时调. */
export function stopRefreshTimer() {
  if (_refreshTimerId != null) {
    clearInterval(_refreshTimerId);
    _refreshTimerId = null;
  }
}

// ── mutations (renderer-side) ──

/** 选中预设策略: 用 buildCriteria 填充条件区 */
export function applyStrategy(id) {
  const c = buildCriteria(id);
  if (!c) return;
  criteria.value = c;
  activeStrategy.value = id;
}

/** 手动改条件 → 切 custom (所有 chip 取消高亮) */
export function setCriteria(patch) {
  criteria.value = { ...criteria.value, ...patch };
  activeStrategy.value = "custom";
}

export function setSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = "desc";
  }
  // ponytail: 点列头立即本地重排 results, 不重打 IPC.
  //   主进程 IPC 时已按当时 sortConfig 排好; 用户切列后改前端 sort 即可 (瞬时反馈).
  //   下次点筛选会把新 sort 推到主进程, 整个链路一致.
  //   字符串列 (name/industry) 由 sortStocks 的 localeCompare 处理, 不依赖 fid.
  results.value = sortStocks(results.value, {
    key: sortKey.value,
    dir: sortDir.value,
  });
}

export function toggleAdvanced() {
  advancedOpen.value = !advancedOpen.value;
}

// ── 阶段二: AI 推荐策略抽屉 ──

export function openAdvise() {
  aiAdviseOpen.value = true;
  // ponytail: 打开抽屉时重置 state (清掉上次的 error, 但保留 result 让用户看上一份).
  if (aiAdvise.value.status === "loading") return; // 加载中不允许重置
  aiAdvise.value = {
    ...aiAdvise.value,
    status: "idle",
    reason: null,
    error: null,
  };
}

export function closeAdvise() {
  aiAdviseOpen.value = false;
}

/**
 * 请求 AI 推荐. 调 main 进程 stocks:ai-advise, 更新 aiAdvise signal.
 * ponytail: 不重打 IPC 的 criteria 已经在 store 里, 直接传 snapshot 给 main.
 */
export async function requestAiAdvise(api, payload) {
  if (!api || !api.stocksAiAdvise) {
    aiAdvise.value = {
      status: "error",
      result: null,
      fromCache: false,
      reason: "no_api",
      error: "api 不可用",
    };
    return;
  }
  aiAdvise.value = {
    ...aiAdvise.value,
    status: "loading",
    reason: null,
    error: null,
  };
  try {
    const r = await api.stocksAiAdvise({
      intentChip: payload.intentChip,
      freeText: payload.freeText || "",
      currentCriteria: criteria.value,
    });
    if (r && r.ok) {
      aiAdvise.value = {
        status: "ready",
        result: r.result,
        fromCache: !!r.fromCache,
        reason: null,
        error: null,
      };
    } else {
      aiAdvise.value = {
        status: "error",
        result: null,
        fromCache: false,
        reason: (r && r.reason) || "unknown",
        error: (r && r.error) || null,
      };
    }
  } catch (e) {
    aiAdvise.value = {
      status: "error",
      result: null,
      fromCache: false,
      reason: "exception",
      error: e && e.message ? e.message : String(e),
    };
  }
}

/**
 * 把 AI 推荐的 criteria + sortConfig 应用到 store.
 * ponytail: 不自动点 runScreen (避免 token 烧光后跑 40s); 用户手动点筛选.
 *          sortConfig 写到 sortKey + sortDir signal, 立即本地重排 results.
 */
export function applyAiAdvise() {
  const r = aiAdvise.value && aiAdvise.value.result;
  if (!r) return;
  // criteria: 走 setCriteria 让 activeStrategy 切 "custom"
  if (r.criteria && typeof r.criteria === "object") {
    setCriteria(r.criteria);
  }
  // sortConfig: 直接写 signals + 立即本地重排
  if (r.sortConfig && r.sortConfig.key) {
    sortKey.value = r.sortConfig.key;
    sortDir.value = r.sortConfig.dir === "asc" ? "asc" : "desc";
    results.value = sortStocks(results.value, {
      key: sortKey.value,
      dir: sortDir.value,
    });
  }
  closeAdvise();
}

// ── async actions (走 IPC) ──

export async function runScreen(api) {
  loading.value = true;
  error.value = null;
  try {
    const r = await api.stocksScreen({
      criteria: criteria.value,
      sort: sortConfig.value,
    });
    if (r && r.ok) {
      results.value = r.results || [];
      fetchedAt.value = r.fetchedAt;
    } else {
      error.value = (r && r.error) || "筛选失败";
      results.value = [];
    }
  } catch (e) {
    log.warn("runScreen failed:", e && e.message);
    error.value = e && e.message ? e.message : String(e);
    results.value = [];
  } finally {
    loading.value = false;
  }
}

/**
 * ponytail 2026-07-08 D-6: 静默版拉一次 stocksScreen, 不闪 loading 角标.
 *   失败静默 (只 log.warn), 不重置 results. 给 60s 自动 refresh 用.
 *   等价于"refresh 按钮但默默按了一次".
 */
export async function runScreenSilent(api) {
  if (!api || !api.stocksScreen) return;
  try {
    const r = await api.stocksScreen({
      criteria: criteria.value,
      sort: sortConfig.value,
    });
    if (r && r.ok && Array.isArray(r.results)) {
      results.value = r.results;
      fetchedAt.value = r.fetchedAt || Date.now();
    }
  } catch (e) {
    log.warn("silent refresh failed:", e && e.message);
    // 静默 — 不动 results, 不报错
  }
}

export { STRATEGIES, getStrategy };
