/**
 * src/stocks/stock-detail-fetcher.js
 *
 * 调度器: 多个 angle 并行调对应 fetcher, 失败隔离, 返回 perAngle 状态.
 * ponytail: 用 Promise.allSettled 而非 Promise.all — 一个失败不影响其他.
 */
const { getAngle } = require("./stock-detail-angles");

/**
 * @param {object} httpClient  createStockHttpClient(...) 返回
 * @param {string} code        股票代码
 * @param {string[]} angles    角度 key 数组
 * @returns {Promise<{
 *   perAngle: { [angleKey: string]: { status: "ok"|"failed", data?: any, reason?: string, error?: string, fetchedAt: number } },
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
      perAngle[angleKey] = { status: "ok", data: res.data, fetchedAt: now };
      fulfilledCount += 1;
    } else {
      perAngle[angleKey] = {
        status: "failed",
        reason: (res && res.reason) || "unknown",
        error: (res && res.error) || null,
        fetchedAt: now,
      };
    }
  }

  return { perAngle, fulfilledCount, totalCount: valid.length };
}

module.exports = { fetchStockDetailAngles };