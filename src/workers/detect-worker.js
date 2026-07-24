/**
 * src/workers/detect-worker.js
 *
 * Worker thread 入口（spec §6）— 跑 detector 链.
 *
 * 主进程 → worker:  { id, task: { type, payload } }
 * worker → 主进程:  { type: 'progress' | 'result' | 'log' | 'error', payload? }
 *
 * 业务拆分:
 *   - ipc.js             IPC helpers (postMessage 包装)
 *   - detector-chain.js  detector 链 + version compare
 *   - installed-version.js 读 macOS bundle 版本
 *   - result-builder.js  构造 IPC result 对象
 *   - task-handlers.js   handleDetectApp / handleBrewUpgrade / handleBrewUpdate
 */

const { parentPort } = require("worker_threads");
const { HttpClient } = require("../main/http-client.js");
const {
  makePostMessageLogger,
  sendResult,
  sendError,
  postLog,
} = require("./ipc");
const {
  handleDetectApp,
  handleBrewUpgrade,
  handleBrewUpdate,
  withTimeout,
  DETECT_APP_TIMEOUT_MS,
  BREW_UPGRADE_TIMEOUT_MS,
} = require("./task-handlers");

const http = new HttpClient({ timeout: 8000, maxBodyBytes: 1024 * 1024 });
const logger = makePostMessageLogger();

if (parentPort) {
  parentPort.on("message", async (msg) => {
    if (!msg || !msg.task) return;
    const { id, task } = msg;
    try {
      let result;
      if (task.type === "detect-app") {
        result = await withTimeout(
          handleDetectApp(task.payload && task.payload.appCfg, {
            http,
            logger,
            incremental: task.payload && task.payload.incremental,
            forceRefresh: !!(task.payload && task.payload.forceRefresh),
          }),
          DETECT_APP_TIMEOUT_MS,
          "detect-app",
        );
      } else if (task.type === "brew-upgrade") {
        result = await withTimeout(
          handleBrewUpgrade(task.payload && task.payload.cask),
          BREW_UPGRADE_TIMEOUT_MS,
          "brew-upgrade",
        );
      } else if (task.type === "brew-update") {
        result = await withTimeout(
          handleBrewUpdate(),
          BREW_UPGRADE_TIMEOUT_MS,
          "brew-update",
        );
      } else {
        sendError(`unknown task type: ${task.type}`);
        return;
      }
      sendResult({ id, ...result });
    } catch (err) {
      sendError((err && err.message) || String(err));
    }
  });

  postLog("INFO", "worker ready");
}
