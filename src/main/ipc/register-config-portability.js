/**
 * src/main/ipc/register-config-portability.js
 *
 * P61 — 配置导入导出 IPC.
 *   config:export       序列化 4 字段 → 写 ~/Desktop/pulse-config-{ts}.json
 *   config:import-load  dialog 选文件 → 解析 + 算 diff (不写, 返回渲染层预览)
 *   config:import-apply 按用户勾选字段逐个写 (patchState 路径, 保证完整恢复)
 *
 * funds 不走 fund-store.saveAll (它只处理 holdings/deletedIds, 会丢其它子字段),
 * 直接 patchState 写整个 funds 对象, 保证完整恢复 (含 dailySnapshots/navSource 等).
 * reminders 同理走 patchState, 绕开 reminders.js 的 raw writeAtomic 竞态.
 */
const os = require("os");
const path = require("path");
const fs = require("fs");
const stateStore = require("../state-store");
const {
  serializeConfig,
  parseConfigFile,
  computeDiff,
} = require("../config-portability");

function registerConfigPortabilityHandlers(ctx) {
  const { safeHandle, dialog } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("config:export", async (_evt, pulseVersion) => {
    try {
      const state = stateStore.load() || {};
      // pulseVersion 优先用传入; 否则从 package.json 读 (渲染层无 version 来源)
      let ver = pulseVersion || "";
      if (!ver) {
        try {
          ver = require("../../../package.json").version || "";
        } catch {
          ver = "";
        }
      }
      const payload = serializeConfig(state, ver);
      const content = JSON.stringify(payload, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const outName = `pulse-config-${ts}.json`;
      const outDir = path.join(os.homedir(), "Desktop");
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, outName);
      fs.writeFileSync(outPath, content, "utf8");
      return {
        ok: true,
        path: outPath,
        sizeBytes: Buffer.byteLength(content, "utf8"),
      };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("config:import-load", async () => {
    if (!dialog || typeof dialog.showOpenDialog !== "function") {
      return { ok: false, reason: "no_dialog" };
    }
    let result;
    try {
      result = await dialog.showOpenDialog({
        title: "导入 Pulse 配置",
        filters: [{ name: "Pulse Config", extensions: ["json"] }],
        properties: ["openFile"],
      });
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
    if (
      !result ||
      result.canceled ||
      !result.filePaths ||
      result.filePaths.length === 0
    ) {
      return { ok: false, reason: "cancelled" };
    }
    const filePath = result.filePaths[0];
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (err) {
      return { ok: false, reason: "read_failed", error: err && err.message };
    }
    const parsed = parseConfigFile(content);
    if (!parsed.ok) return parsed;
    const currentState = stateStore.load() || {};
    const diff = computeDiff(currentState, parsed.fields);
    return { ok: true, diff, fields: parsed.fields, filePath };
  });

  safeHandle("config:import-apply", async (_evt, payload) => {
    if (!payload || !payload.fields || typeof payload.fields !== "object") {
      return { ok: false, reason: "no_selection" };
    }
    const inc = payload.fields;
    const applied = [];
    try {
      if (Array.isArray(inc.watchlist)) {
        stateStore.saveWatchlist(inc.watchlist);
        applied.push("watchlist");
      }
      if (Array.isArray(inc.reminders)) {
        // 走 patchState, 绕开 reminders.js raw writeAtomic 竞态
        stateStore.patchState((next) => {
          next.reminders = inc.reminders;
        });
        applied.push("reminders");
      }
      if (inc.funds && typeof inc.funds === "object") {
        // 完整恢复 funds (含 dailySnapshots/navSource 等), 不走 fund-store.saveAll
        stateStore.patchState((next) => {
          next.funds = inc.funds;
        });
        applied.push("funds");
      }
      if (inc.ai_prompts && typeof inc.ai_prompts === "object") {
        stateStore.saveAiPrompts(inc.ai_prompts);
        applied.push("ai_prompts");
      }
    } catch (err) {
      return {
        ok: false,
        reason: "threw",
        error: err && err.message,
        applied,
      };
    }
    if (applied.length === 0) return { ok: false, reason: "no_selection" };
    return { ok: true, applied };
  });
}

module.exports = { registerConfigPortabilityHandlers };
