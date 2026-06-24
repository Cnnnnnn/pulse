/**
 * src/workers/detector-chain-incremental.js
 *
 * C5: 增量 detector 决策 — 纯函数, 易测.
 *
 * 决策: 给定 app 上次检测时间 + 当前时间, 决定 detector chain 应该跑几个.
 *   - useIncremental=true + maxIndex=1 → 只跑 detectors[0], 后续 trace 标 skipped='incremental'
 *   - useIncremental=false + maxIndex=detectors.length → 跑全链 (旧行为)
 *
 * 阈值: appTs 距 now < recentDays 天 → 算"近期检测过"。
 * ponytail: 7 天是简化信号 (避免为每个 app 维护 lastSuccessfulDetector 列表);
 * 主 detector 间歇性失败导致漏报 ≤ 7d 由用户手动"检查更新"兜底.
 */

/**
 * @param {object} args
 * @param {Array} args.detectors
 * @param {number|null} args.appTs    上次检测时间 (epoch ms), null=从未检测过
 * @param {number} args.recentDays   阈值天数 (默认 7)
 * @param {number} args.now          当前时间 (epoch ms, 注入便于测试)
 * @returns {{useIncremental: boolean, maxIndex: number}}
 */
function decideIncremental({
  detectors,
  appTs,
  recentDays = 7,
  now = Date.now(),
}) {
  const total = Array.isArray(detectors) ? detectors.length : 0;
  if (total <= 1) return { useIncremental: false, maxIndex: total };

  if (typeof appTs !== "number" || !Number.isFinite(appTs)) {
    return { useIncremental: false, maxIndex: total };
  }

  const recentMs = recentDays * 86400_000;
  if (now - appTs >= recentMs) {
    return { useIncremental: false, maxIndex: total };
  }

  return { useIncremental: true, maxIndex: 1 };
}

module.exports = { decideIncremental };
