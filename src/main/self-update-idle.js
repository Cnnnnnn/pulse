/**
 * src/main/self-update-idle.js
 *
 * P52 §增量自更新: 周期性 self-update tick (6h) 只在系统空闲时跑.
 * 启动检测 (30s delay) 不受此限制, 用户手动 "立即检测" 也不受限制.
 *
 * 设计: 纯函数 decideSelfUpdateTick + 接线层调它. 跟
 * src/workers/detector-chain-incremental.js (C5 decideIncremental) 同范式.
 *
 * Idle 定义 (二者都满足才 idle):
 *   1. 启动后 ≥ minBootAgeMs (默认 5min). 启动期频繁的 IO / 状态机初始化
 *      不该被自更新下载打断.
 *   2. 系统空闲 ≥ idleThresholdSec (默认 120s). 通过 Electron 内置
 *      powerMonitor.getSystemIdleState(threshold) 查询:
 *        - 'active' → 算非 idle, skip
 *        - 'idle' / 'locked' / 'unknown' → 算 idle
 *      (锁屏 / 屏保算 idle: 没人用机器, 下载也合理)
 *
 * 非 idle 时返回 'skip', 让 6h setInterval 短暂跳过本 tick, 等下个 6h
 * tick (或下次手动 triggerNow). 这是简化版: 永远不"排队补跑" (避免
 * 用户开机/锁屏/解锁瞬间被一连串 6h 堆积 tick 砸). 6h 漏一次检测
 * 用户无感 (GitHub Releases 变化频率 < 6h, 且 tray 有手动 "检查更新" 兜底).
 *
 * ponytail: 用 Electron 原生 API + 一个纯函数, 0 新依赖, 0 订阅, 0 状态
 * 持久化. 决策函数易测, 接线层是 if/else.
 */

/**
 * @param {object} args
 * @param {number} args.bootStartedAt        epoch ms, app 启动时间
 * @param {number} args.now                  当前 epoch ms
 * @param {string|null} args.powerIdleState  'active' | 'idle' | 'locked' | 'unknown' | null
 * @param {number} [args.minBootAgeMs]       默认 5 * 60 * 1000
 * @param {number} [args.idleThresholdSec]   默认 120 (仅用于记录, 不参与决策)
 * @returns {{action: 'run'} | {action: 'skip', reason: 'too_soon' | 'system_active'}}
 */
function decideSelfUpdateTick({
  bootStartedAt,
  now,
  powerIdleState,
  minBootAgeMs = 5 * 60 * 1000,
  // eslint-disable-next-line no-unused-vars
  idleThresholdSec = 120, // 接线层用, 纯函数记下意图便于文档/调试
}) {
  // 1. 启动期拦截 (避免一开机就抢 IO)
  if (typeof bootStartedAt !== "number" || !Number.isFinite(bootStartedAt)) {
    return { action: "skip", reason: "too_soon" };
  }
  if (typeof now !== "number" || !Number.isFinite(now)) {
    return { action: "skip", reason: "too_soon" };
  }
  if (now - bootStartedAt < minBootAgeMs) {
    return { action: "skip", reason: "too_soon" };
  }

  // 2. 系统空闲拦截 (避免用户正在用时打断)
  // active = 正在用; idle / locked / unknown = 没人用
  if (powerIdleState === "active") {
    return { action: "skip", reason: "system_active" };
  }

  return { action: "run" };
}

module.exports = { decideSelfUpdateTick };
