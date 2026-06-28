/**
 * src/main/bulk-upgrade.js
 *
 * Bulk Upgrade: 顺序执行器.
 *   - 入参: items[] (来自 renderer 弹窗里勾选的 app)
 *   - 出参: { succeeded, failed, skipped, cancelled }
 *   - 副作用: 每次状态变 → onProgress 回调
 *
 * 设计:
 *   - 纯 orchestration 在这里 (runBulkUpgrade)
 *   - 真正的 shell 调用走 exec 依赖 (默认 defaultExec, 测试可注入)
 *   - per-item timeout (5min default, brew 升级一个 app 慢的话需要)
 *   - AbortSignal 支持取消 — 每个 item 完成时检查
 *
 * 不在 worker: 主进程跑就够, child_process.exec 不阻塞事件循环;
 *              renderer 关闭 modal → abort, 不影响其他 IPC
 */

const childProcess = require("child_process");
const { shell } = require("electron");
const { getActionForApp } = require("./bulk-upgrade-actions");
// (C3 app rollback 已退役, 不再 backup / recordUpgrade)

// Testability hook (vitest only): 空 noop, 保留以兼容现有测试 import
// (原功能: 让测试注入 userDataDir 跳过 electron.app.getPath; 已退役, 但保留符号)
function _setUserDataDirForTest(_dir) {
  /* noop — bulk-upgrade 不再需要 userDataDir */
}

const DEFAULT_PER_ITEM_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

/**
 * @param {object} opts
 * @param {Array<object>} opts.items
 *        每项: { id, name, source, current, latest, cask, bundleName, trackId }
 * @param {function} [opts.onProgress]
 *        (event) => void; event = { id, status, ...payload }
 *        status: 'running' | 'done' | 'failed' | 'skipped'
 * @param {function} [opts.exec]
 *        (action) => Promise<{output?: string}>
 *        默认 defaultExec (brew execFile + shell.openPath/openExternal)
 * @param {AbortSignal} [opts.signal]
 *        取消: 在每个 item 完成时检查, aborted=true 就停
 * @param {number} [opts.perItemTimeoutMs]
 *        单个 item 超时, 默认 5min
 * @returns {Promise<{succeeded, failed, skipped, cancelled}>}
 */
async function runBulkUpgrade(opts) {
  const {
    items = [],
    onProgress = () => {},
    exec = defaultExec,
    signal = null,
    perItemTimeoutMs = DEFAULT_PER_ITEM_TIMEOUT_MS,
  } = opts || {};

  const succeeded = [];
  const failed = [];
  const skipped = [];
  let cancelled = false;

  for (const item of items) {
    if (signal && signal.aborted) {
      cancelled = true;
      break;
    }

    const action = getActionForApp(item);

    // none: 没法升级, 跳过
    if (!action || action.type === "none") {
      const reason = (action && action.reason) || "no action";
      skipped.push({ id: item.id, reason });
      try {
        onProgress({ id: item.id, status: "skipped", reason });
      } catch {
        /* noop */
      }
      continue;
    }

    // 跑这个 item
    try {
      onProgress({ id: item.id, status: "running", action: action.type });
    } catch {
      /* noop */
    }
    const t0 = Date.now();

    try {
      const result = await runOne(action, exec, perItemTimeoutMs, signal);
      const durationMs = Date.now() - t0;
      succeeded.push({ id: item.id, durationMs, action: action.type });
      try {
        onProgress({
          id: item.id,
          status: "done",
          durationMs,
          action: action.type,
          output: result.output || "",
        });
      } catch {
        /* noop */
      }
    } catch (err) {
      const durationMs = Date.now() - t0;
      const error = (err && err.message) || "unknown error";
      const output = (err && err.output) || "";
      failed.push({ id: item.id, error, output, action: action.type });
      try {
        onProgress({
          id: item.id,
          status: "failed",
          error,
          output,
          durationMs,
          action: action.type,
        });
      } catch {
        /* noop */
      }
    }
  }

  return { succeeded, failed, skipped, cancelled };
}

/**
 * 跑单个 action, 加 timeout + signal.
 */
function runOne(action, exec, perItemTimeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      fn(val);
    };

    const timer = setTimeout(() => {
      finish(reject, makeError(`timeout after ${perItemTimeoutMs}ms`, ""));
    }, perItemTimeoutMs);

    // signal 监听
    const onAbort = () => {
      finish(reject, makeError("cancelled", ""));
    };
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    exec(action).then(
      (result) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        clearTimeout(timer);
        finish(resolve, result || { output: "" });
      },
      (err) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        clearTimeout(timer);
        const msg = (err && err.message) || "exec failed";
        const out = (err && err.output) || (err && err.stderr) || "";
        finish(reject, makeError(msg, out));
      },
    );
  });
}

function makeError(message, output) {
  const e = new Error(message);
  e.output = output || "";
  return e;
}

// ── default exec ────────────────────────────────────────

/**
 * 默认的 exec: 处理 brew / open / open_url / mas / winget 五种 action.
 * open / open_url / mas 是 fire-and-forget — shell.openPath/openExternal 几乎瞬间返回,
 * "成功" 意味着 URL/path 格式合法被 OS 接受, 不保证 app 真的弹更新 / 用户完成下载.
 *
 * brew / winget 返回 { output } 或 throw Error(output) (走 runOne 失败路径).
 * winget 用 child-process event 形式以便测试能 mock; brew 沿用 callback 形式.
 */
async function defaultExec(action) {
  if (action.type === "brew") {
    return execBrew(action.cmd, action.args);
  }
  if (action.type === "open") {
    return execOpen(action.path);
  }
  if (action.type === "open_url") {
    return execOpenUrl(action.url);
  }
  if (action.type === "mas") {
    return execMas(action.trackId, action.fallbackUrl);
  }
  if (action.type === "winget") {
    return execWinget(action.id);
  }
  throw new Error(`unknown action type: ${action && action.type}`);
}

function execBrew(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 0 }, (err, stdout, stderr) => {
      const out = (stdout || "") + (stderr ? "\n[stderr]\n" + stderr : "");
      // brew upgrade 退出码:
      //   0 = 成功升级
      //   1 = 一般错误 (cask not installed / network 等)
      if (err) {
        const e = new Error((stderr || err.message || "brew failed").trim());
        e.output = out;
        e.exitCode = err.code;
        reject(e);
        return;
      }
      resolve({ output: out });
    });
  });
}

/**
 * Run `winget upgrade --id <id> --accept-package-agreements --accept-source-agreements`.
 * Returns { ok, exitCode?, stdout?, stderr?, reason?, error? }.
 *
 * The two `--accept-*` flags suppress interactive license/source-agreement prompts
 * that would otherwise hang the upgrade flow (no TTY in the Electron main process).
 * Non-zero exit (UAC decline, winget error code 1603, etc.) surfaces as
 * { ok: false, exitCode }; spawn failure (e.g. winget not on PATH) surfaces as
 * { ok: false, reason, error }.
 *
 * Missing / empty id short-circuits with { ok: false, reason } WITHOUT spawning —
 * this is the contract `defaultExec` callers rely on to skip invalid actions
 * gracefully.
 */
function execWinget(id) {
  return new Promise((resolve) => {
    if (!id || typeof id !== "string" || !id.trim()) {
      return resolve({ ok: false, reason: "winget: missing id" });
    }
    const args = [
      "upgrade",
      "--id",
      id.trim(),
      "--accept-package-agreements",
      "--accept-source-agreements",
    ];
    // No callback: rely on child-process events so tests can mock execFile
    // by returning a stub EventEmitter. In production, execFile without a
    // callback also returns a ChildProcess with the same events.
    const child = childProcess.execFile("winget", args);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      resolve({
        ok: false,
        reason: "winget: spawn failed",
        error: err && err.message,
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, exitCode: 0, stdout, stderr });
      } else {
        resolve({ ok: false, exitCode: code, stdout, stderr });
      }
    });
  });
}

async function execOpen(appPath) {
  // shell.openPath: 返回 string ('' = success, 非空 = error message)
  const result = await shell.openPath(appPath);
  if (result) {
    const e = new Error(`openPath failed: ${result}`);
    e.output = result;
    throw e;
  }
  return { output: `opened ${appPath}` };
}

async function execOpenUrl(url) {
  // shell.openExternal: 打开 URL (浏览器). 失败 → throw.
  if (!url || typeof url !== "string") {
    const e = new Error("open_url: missing url");
    e.output = "";
    throw e;
  }
  try {
    await shell.openExternal(url);
    return { output: `opened ${url}` };
  } catch (err) {
    const e = new Error(
      `openExternal failed: ${(err && err.message) || "unknown"}`,
    );
    e.output = url;
    throw e;
  }
}

async function execMas(trackId, fallbackUrl) {
  const deepLink = `macappstore://apps.apple.com/app/id${trackId}`;
  // 先试 deep link, 失败 fallback 到 https
  try {
    await shell.openExternal(deepLink);
    return { output: `opened ${deepLink}` };
  } catch (err) {
    try {
      await shell.openExternal(fallbackUrl);
      return { output: `opened fallback ${fallbackUrl}` };
    } catch (err2) {
      const e = new Error(
        `mas open failed: ${(err2 && err2.message) || "unknown"}`,
      );
      e.output = deepLink;
      throw e;
    }
  }
}

module.exports = {
  runBulkUpgrade,
  defaultExec, // exported for tests
  execBrew, // exported for tests
  execWinget, // exported for tests
  // Testability hook (vitest only)
  _setUserDataDirForTest,
};
