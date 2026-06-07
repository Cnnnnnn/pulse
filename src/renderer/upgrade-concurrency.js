/**
 * src/renderer/upgrade-concurrency.js
 *
 * 通用并发限制 helper (semaphore + pool drain)。
 *
 * 用法：
 *   const drain = createPool(2);                     // 最多 2 并发
 *   const tasks = updatable.map(r => drain(() => upgradeOne(r)));
 *   const settled = await Promise.allSettled(tasks);
 *
 * 设计要点 (spec §7)：
 *   - allSettled 永远不 reject —— 一个 task 失败不影响其他
 *   - concurrency 是个上限: 第 N+1 个 task 排队等空位
 *   - worker thread 池里跑 brew upgrade, 这层只负责 renderer 调度
 *
 * 为什么不直接用 Promise.all:
 *   - all 在第一个 reject 就 throw —— 后面排队的都丢了
 *   - 我们需要"失败的兜底: 走 download_url" → 失败的也得拿到
 *
 * 为什么不写 npm 包:
 *   - 10 行能解决的代码不值得引依赖
 */

export function createPool(concurrency) {
  const limit = Math.max(1, Number(concurrency) || 1);
  let active = 0;
  const waiters = [];

  function _next() {
    if (active >= limit) return;
    const w = waiters.shift();
    if (!w) return;
    active++;
    w.run();
  }

  function run(fn) {
    return new Promise((resolve, reject) => {
      const task = () => {
        let p;
        try { p = fn(); } catch (err) { p = Promise.reject(err); }
        Promise.resolve(p).then(
          (v) => { active--; _next(); resolve(v); },
          (e) => { active--; _next(); reject(e); }
        );
      };
      waiters.push({ run: task });
      _next();
    });
  }

  return run;
}
