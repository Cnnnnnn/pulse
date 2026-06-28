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

export { STRATEGIES, getStrategy };
