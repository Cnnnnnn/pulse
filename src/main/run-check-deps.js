/**
 * src/main/run-check-deps.js
 *
 * 统一的 runCheckQueued deps 构造器. 消除 register-core.check-updates /
 * register-versions-overview.versions:run-check / bootstrap/schedulers 三处的
 * 重复 deps 注入样板, 把 getState / markNotified 的 try/catch 收敛到一处.
 *
 * ponytail: 三处 call site 形状略不同 (ctx.getConfig vs runtimeConfigRef.current,
 * 有无 onCheckComplete 包装), 抽到一处后 ctx 入参做兼容, 不引入新概念. 业务侧
 * 仍可在外层包 tray 副作用 / 自定义 onCheckComplete 后再传进来.
 *
 * 用法:
 *   const { buildRunCheckDeps } = require("./run-check-deps");
 *   await runCheckQueued(buildRunCheckDeps(ctx), { silent: false });
 *
 * ctx 入参兼容 (允许的字段, 都 optional):
 *   - getConfig(): 直接返 cfg
 *   - runtimeConfigRef.current: 替代 getConfig, 每次 check 重新读 (auto 调度需要)
 *   - pool / getWindow / onCheckComplete: 直接透传
 *   - stateStore: 用于 getState / markNotified. 不传则 getState 返 null, markNotified noop.
 */

const _defaultStateStore = {
  load: () => null,
  markNotified: () => {},
};

/**
 * @param {object} ctx
 * @returns {{
 *   getConfig: () => object,
 *   pool: object,
 *   getWindow: () => any,
 *   onCheckComplete: (results: any) => void,
 *   getState: () => object | null,
 *   markNotified: (names: string[]) => void,
 * }}
 */
function buildRunCheckDeps(ctx = {}) {
  const stateStore = ctx.stateStore || _defaultStateStore;
  // getConfig: 显式 getConfig 优先, 否则从 runtimeConfigRef.current 派生.
  // auto 调度需要每次 check 重新读 (用户可能改了 cfg), 手动 IPC 一次调则无所谓.
  const getConfig =
    ctx.getConfig ||
    (ctx.runtimeConfigRef
      ? () => (ctx.runtimeConfigRef.current || {})
      : () => ({}));

  return {
    getConfig,
    pool: ctx.pool,
    getWindow: ctx.getWindow || (() => null),
    onCheckComplete: ctx.onCheckComplete || (() => {}),
    getState: () => {
      try {
        return stateStore.load();
      } catch {
        return null;
      }
    },
    markNotified: (names) => {
      try {
        stateStore.markNotified(names);
      } catch {
        /* noop */
      }
    },
  };
}

module.exports = { buildRunCheckDeps };
