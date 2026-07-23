/**
 * src/main/bootstrap/ai-tasks.js
 *
 * 初始化 TaskSummaryEngine wiring — 不跑 LLM 不扫盘, 仅装配.
 */

const { mainLog } = require("../log.ts");
const { buildTaskSummaryEngine } = require("../../ai-sessions/wiring");

/**
 * @param {object} deps
 * @param {object} deps.stateStore
 */
function initAiTasksWiring(deps) {
  const { stateStore } = deps;
  const stateOverride = stateStore.loadAISessionsConfig();
  const cfgBase =
    stateOverride && typeof stateOverride === "object"
      ? stateOverride
      : { enabled: false, provider: "minimax", cloud: null };

  try {
    const wiring = buildTaskSummaryEngine({
      config: cfgBase,
      runtimeOverride: stateStore.loadAISessionsConfig(),
      log: {
        info: (...a) => mainLog.info(...a),
        warn: (...a) => mainLog.warn(...a),
        error: (...a) => mainLog.error(...a),
      },
    });
    global.__pulse_aiTasks = wiring;
    global.__pulse_aiSessionsBaseCfg = cfgBase;
    const detectorNames = wiring.detectors.map((d) => d.appName).join(",");
    mainLog.info(
      `[tasks] wiring ready: provider=${wiring.providerId} detectors=[${detectorNames}]`,
    );
  } catch (err) {
    mainLog.warn(`[tasks] buildTaskSummaryEngine failed: ${err.message}`);
  }
}

module.exports = { initAiTasksWiring };
