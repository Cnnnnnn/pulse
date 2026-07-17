/**
 * src/stocks/stock-detail-fetcher.js
 *
 * 调度器: 多个 angle 并行调对应 fetcher, 失败隔离, 返回 perAngle 状态.
 * ponytail: 用 Promise.allSettled 而非 Promise.all — 一个失败不影响其他.
 * ponytail 2026-07-18 P0-1: 维护 module 级 lastSuccessAt / failureStreakCount,
 *   让前端能区分"这次是 30 天没更新" vs "本接口真挂了".
 */
const { getAngle } = require("./stock-detail-angles");

// ponytail: module 级 LRU 内存表, key = `${code}|${angleKey}`. 跨调用共享.
//   ceiling: app 进程内 in-memory, 重启即清. 不需要持久化, 上次成功时间只是 UI 提示.
const _angleHealth = new Map();
const HEALTH_KEY = (code, angleKey) => `${code}|${angleKey}`;

function getHealth(code, angleKey) {
  return _angleHealth.get(HEALTH_KEY(code, angleKey)) || { lastSuccessAt: 0, failureStreakCount: 0 };
}

function recordSuccess(code, angleKey) {
  const h = getHealth(code, angleKey);
  h.lastSuccessAt = Date.now();
  h.failureStreakCount = 0;
  _angleHealth.set(HEALTH_KEY(code, angleKey), h);
  return h;
}

function recordFailure(code, angleKey) {
  const h = getHealth(code, angleKey);
  h.failureStreakCount += 1;
  _angleHealth.set(HEALTH_KEY(code, angleKey), h);
  return h;
}

/**
 * @param {object} httpClient  createStockHttpClient(...) 返回
 * @param {string} code        股票代码
 * @param {string[]} angles    角度 key 数组
 * @returns {Promise<{
 *   perAngle: {
 *     [angleKey: string]: {
 *       status: "ok"|"failed",
 *       data?: any,
 *       reason?: string,
 *       error?: string,
 *       fetchedAt: number,
 *       lastSuccessAt: number|null,
 *       failureStreakCount: number,
 *     }
 *   },
 *   fulfilledCount: number,
 *   totalCount: number
 * }>}
 */
async function fetchStockDetailAngles(httpClient, code, angles) {
  const perAngle = {};
  const now = Date.now();

  if (!Array.isArray(angles) || angles.length === 0) {
    return { perAngle, fulfilledCount: 0, totalCount: 0 };
  }

  const valid = angles.filter((k) => getAngle(k) !== null);
  const results = await Promise.allSettled(
    valid.map((angleKey) => {
      const { fetcher } = getAngle(angleKey);
      return fetcher(httpClient, { code }).then(
        (res) => ({ angleKey, res }),
        (err) => ({
          angleKey,
          res: { ok: false, reason: "exception", error: err && err.message ? err.message : String(err) },
        }),
      );
    }),
  );

  let fulfilledCount = 0;
  for (const r of results) {
    const { angleKey, res } = r.value;
    if (res && res.ok) {
      const h = recordSuccess(code, angleKey);
      perAngle[angleKey] = {
        status: "ok",
        data: res.data,
        fetchedAt: now,
        lastSuccessAt: h.lastSuccessAt,
        failureStreakCount: 0,
      };
      fulfilledCount += 1;
    } else {
      const h = recordFailure(code, angleKey);
      perAngle[angleKey] = {
        status: "failed",
        reason: (res && res.reason) || "unknown",
        error: (res && res.error) || null,
        fetchedAt: now,
        lastSuccessAt: h.lastSuccessAt || null, // 0 → null, 让 UI 不显示"陈旧"
        failureStreakCount: h.failureStreakCount,
      };
    }
  }

  return { perAngle, fulfilledCount, totalCount: valid.length };
}

module.exports = { fetchStockDetailAngles };