/**
 * tests/main/preload-api-contract.test.js
 *
 * Contract test: dist/preload.js (esbuild 从 preload.ts 编译的 CommonJS bundle)
 * 通过 contextBridge.exposeInMainWorld 暴露的 namespace, 必须满足:
 *
 *   1. 暴露四个 namespace: api / pulse / metalsApi / platformInfo
 *   2. api namespace 的顶层 key 覆盖 src/renderer/api.js createApi() 的所有
 *      顶层 IPC key (除嵌套的 releaseNotes — 那一项 preload/api.js 同样嵌套
 *      处理, 顶层对比按同名跳过)
 *
 * 触发过的回归: 2026-06-28 「检查更新」按钮无反应 — preload 漏写了
 * versionsRunCheck bridge, api.js 的 pick() 静默 fallback 到 noop, 用户点击
 * 无报错无提示, 调试靠肉眼比对两文件.
 *
 * ponytail: 复用 tests/preload-platform.test.js 的 require.cache stub 模式
 *         (electron 包有自定义 interop, vi.mock("electron") 拦不住, 注入
 *         stub 模块到 require.cache 是仓库已有做法). 真实 require dist/preload.js
 *         让 esbuild CJS bundle 走完整路径 (TS → JS bundle), 通过 stub 捕获
 *         exposeInMainWorld 调用, 比解析 esbuild 私有缩进格式稳 — 升级路径:
 *         升级 esbuild 大版本 (可能改缩进/字段) 时, 现有 source-parse 测试会
 *         默默变 false-positive, 真执行只查 stub.exposed, 不依赖源码格式.
 *
 *         只测 "preload 覆盖 api.js" (正向), 不测反向: preload 多出来的 key
 *         是 feature store (wechat-hot / ithome / share-card) 通过
 *         requireApiMethod 或 window.api.xxx 直接消费, 故意绕过 api.js wrapper
 *         的设计 — 让 feature store 在 api.js 加载失败时也能 graceful degrade.
 *         真死代码 (例: 2026-06-28 删的 getAiKey — preload 暴露但 main handler
 *         没注册, renderer 也没调) 应在 review 时识别 + 删, 不靠本测试.
 *
 * globalSetup 在 worker 启动前生成 dist/preload.js；本测试只消费该产物，
 * 不再维护第二份构建逻辑。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRELOAD_PATH = path.resolve(__dirname, "../../dist/preload.js");

/** 收集每次 stub.exposeInMainWorld 调用的 (name, value) 快照. */
function makeStubElectron() {
  const exposed = new Map();
  const invokeCalls = [];
  const sendCalls = [];
  const eventBindings = [];
  const removeListenerCalls = [];
  const stub = {
    contextBridge: {
      exposeInMainWorld: (name, value) => {
        exposed.set(name, value);
      },
    },
    ipcRenderer: {
      invoke: (...args) => {
        invokeCalls.push(args);
        return Promise.resolve(undefined);
      },
      on: (channel, handler) => {
        eventBindings.push([channel, handler]);
      },
      send: (...args) => {
        sendCalls.push(args);
      },
      removeListener: (channel, handler) => {
        removeListenerCalls.push([channel, handler]);
        const index = eventBindings.findIndex(
          ([boundChannel, boundHandler]) =>
            boundChannel === channel && boundHandler === handler,
        );
        if (index >= 0) eventBindings.splice(index, 1);
      },
    },
  };
  return {
    stub,
    exposed,
    invokeCalls,
    sendCalls,
    eventBindings,
    removeListenerCalls,
  };
}

let electronStubEntry = null;
let preloadCacheKey = null;

function injectElectronStub({ stub }) {
  const electronPath = createRequire(import.meta.url).resolve("electron");
  electronStubEntry = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: stub,
    children: [],
    paths: [],
  };
  require.cache[electronPath] = electronStubEntry;
}

function clearElectronStub() {
  if (electronStubEntry) {
    delete require.cache[electronStubEntry.filename];
    electronStubEntry = null;
  }
  if (preloadCacheKey) {
    delete require.cache[preloadCacheKey];
    preloadCacheKey = null;
  }
}

function requirePreloadFresh() {
  // 用 node:module createRequire 拿 CJS require, 不影响 ESM 测试本身的 import 链.
  const cjsRequire = createRequire(import.meta.url);
  preloadCacheKey = cjsRequire.resolve(PRELOAD_PATH);
  // 防御: 之前测试可能把 preload 缓存了 (尤其 preload-platform.test.js),
  // 重新载入前清掉 — 干净 load 一次, 跑完即清.
  delete cjsRequire.cache[preloadCacheKey];
  cjsRequire(PRELOAD_PATH);
  return preloadCacheKey;
}

describe("dist/preload.js ↔ api.js IPC surface contract", () => {
  let exposed;
  let invokeCalls;
  let sendCalls;
  let eventBindings;
  let removeListenerCalls;

  beforeEach(() => {
    const m = makeStubElectron();
    exposed = m.exposed;
    invokeCalls = m.invokeCalls;
    sendCalls = m.sendCalls;
    eventBindings = m.eventBindings;
    removeListenerCalls = m.removeListenerCalls;
    injectElectronStub({ stub: m.stub });
  });

  afterEach(() => {
    clearElectronStub();
    exposed = null;
    invokeCalls = null;
    sendCalls = null;
    eventBindings = null;
    removeListenerCalls = null;
  });

  it("exposes the four required contextBridge namespaces", () => {
    requirePreloadFresh();
    for (const name of ["api", "pulse", "metalsApi", "platformInfo"]) {
      expect(
        exposed.has(name),
        `dist/preload.js 漏 exposeInMainWorld("${name}", ...). 修复: 在 preload.ts 末尾补 contextBridge.exposeInMainWorld("${name}", ${name}).`,
      ).toBe(true);
    }
  });

  it('platformInfo 暴露的是 { platform: process.platform }', () => {
    requirePreloadFresh();
    const info = exposed.get("platformInfo");
    expect(info).toBeDefined();
    expect(typeof info.platform).toBe("string");
    expect(info.platform).toBe(process.platform);
  });

  it("api namespace 的 key 覆盖 createApi() 的所有顶层 IPC (除 releaseNotes 嵌套)", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    expect(api, "dist/preload.js 未暴露 api namespace").toBeDefined();
    const preloadKeys = Object.keys(api);
    expect(preloadKeys.length).toBeGreaterThan(0);

    const mod = await import("../../src/renderer/api.ts");
    const apiKeys = Object.keys(mod.createApi());
    // releaseNotes 在两端都是嵌套子对象, 顶层对比时按同名跳过.
    const missing = apiKeys.filter(
      (k) => k !== "releaseNotes" && !preloadKeys.includes(k),
    );
    expect(
      missing,
      `dist/preload.js 缺这些 IPC bridge (renderer api.js 调了但没暴露):\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        `\n\n修复: 在 preload.ts 的 api 对象里补上对应 key.`,
    ).toEqual([]);
  });

  it("pulse / metalsApi 是非空对象 namespace", () => {
    requirePreloadFresh();
    expect(typeof exposed.get("pulse")).toBe("object");
    expect(Object.keys(exposed.get("pulse")).length).toBeGreaterThan(0);
    expect(typeof exposed.get("metalsApi")).toBe("object");
    expect(Object.keys(exposed.get("metalsApi")).length).toBeGreaterThan(0);
  });

  it("funds / metals 事件 bridge 返回可调用的 unsubscribe 函数", () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    const metalsApi = exposed.get("metalsApi");
    const unsubscribes = [
      api.onFundsNavFetched(() => {}),
      api.onFundsNavState(() => {}),
      api.onFundsHistoryUpdated(() => {}),
      metalsApi.onQuoteChanged(() => {}),
      metalsApi.onStateUpdate(() => {}),
      metalsApi.onHistoryChanged(() => {}),
    ];

    expect(unsubscribes.every((unsubscribe) => typeof unsubscribe === "function")).toBe(true);
  });

  it("IT 新闻与 AI 榜单 bridge 使用共享契约中的 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.ithomeLoadNews();
    await api.ithomeRefreshNews("2026-08-16");
    await api.ithomeFetchArticleBody({ id: "ithome-1" });
    await api.ithomeSummarizeArticle({ id: "ithome-1", force: true });
    await api.ithomeToggleFavorite({ id: "ithome-1" });
    await api.getLeaderboard({ category: "llm" });
    await api.refreshLeaderboard({ force: true });
    await api.rateBudget();
    await api.exportLeaderboardCsv({ csv: "id,name\n1,model" });

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "ithome:load-news",
      "ithome:refresh-news",
      "ithome:fetch-article-body",
      "ithome:summarize-article",
      "ithome:toggle-favorite",
      "leaderboard:get",
      "leaderboard:refresh",
      "leaderboard:rate-budget",
      "leaderboard:export-csv",
    ]);
    expect(invokeCalls.slice(0, 5)).toEqual([
      ["ithome:load-news"],
      ["ithome:refresh-news", "2026-08-16"],
      ["ithome:fetch-article-body", { id: "ithome-1" }],
      ["ithome:summarize-article", { id: "ithome-1", force: true }],
      ["ithome:toggle-favorite", { id: "ithome-1" }],
    ]);
  });

  it("股票筛选、诊断与导出 bridge 覆盖共享契约中的 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.stocksScreen({ criteria: {}, sort: { key: "roe", dir: "desc" } });
    await api.stocksSearch("600519");
    await api.stocksAiAdvise({ intentChip: { id: "value" } });
    await api.stocksDetailAngles({ code: "600519", angles: ["valuation"] });
    await api.stocksDetailAnalyze({ code: "600519", angles: ["valuation"] });
    await api.stocksAngleRefresh({ angleKey: "valuation" });
    await api.stocksAngleReload({ code: "600519", angleKey: "valuation" });
    await api.stocksExportDiagnosisPng({ defaultName: "600519-诊断" });

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "stocks:screen",
      "stocks:search",
      "stocks:ai-advise",
      "stocks:detail-angles",
      "stocks:detail-analyze",
      "stocks:angle-refresh",
      "stocks:angle-reload",
      "stocks:export-diagnosis-png",
    ]);
  });

  it("热搜与 recent bridge 覆盖共享契约中的 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.wechatHotLoad();
    await api.wechatHotRefresh();
    await api.wechatHotLoadRead();
    await api.wechatHotMarkRead("测试热搜");
    await api.recentList();
    await api.recentPush({ kind: "settings-open", ref: "settings", label: "设置" });

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "wechat-hot:load",
      "wechat-hot:refresh",
      "wechat-hot:load-read",
      "wechat-hot:mark-read",
      "recent:list",
      "recent:push",
    ]);
  });

  it("热搜与 recent 事件 bridge 返回可调用的 unsubscribe 函数", () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    const unsubscribes = [
      api.onWechatHotUpdated(() => {}),
      api.onRecentUpdated(() => {}),
    ];

    expect(unsubscribes.every((unsubscribe) => typeof unsubscribe === "function")).toBe(true);
  });

  it("提醒 CRUD bridge 覆盖共享契约中的 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.remindersList();
    await api.remindersCreate({
      title: "测试提醒",
      triggerAt: Date.now() + 60_000,
      repeat: "once",
    });
    await api.remindersUpdate("r1", { title: "更新提醒" });
    await api.remindersRemove("r1");
    await api.remindersMarkDone("r1");
    await api.remindersMarkDismissed("r1");

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "reminders:list",
      "reminders:create",
      "reminders:update",
      "reminders:remove",
      "reminders:mark-done",
      "reminders:mark-dismissed",
    ]);
  });

  it("提醒事件 bridge 返回可调用的 unsubscribe 函数", () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    const unsubscribes = [
      api.onRemindersFired(() => {}),
      api.onRemindersOpenModal(() => {}),
    ];

    expect(unsubscribes.every((unsubscribe) => typeof unsubscribe === "function")).toBe(true);
  });

  it("配置导入导出与 tray prefs bridge 覆盖共享契约中的 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    const tray = exposed.get("pulse").tray;

    await api.configExport("2.80.0");
    await api.configImportLoad();
    await api.configImportApply({ fields: { reminders: [] } });
    await tray.getPrefs();
    await tray.savePrefs({ version: 1, segments: { updates: true } });
    tray.openConfig();
    tray.closeConfigModal();

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "config:export",
      "config:import-load",
      "config:import-apply",
      "tray:get-prefs",
      "tray:save-prefs",
    ]);
    expect(sendCalls.map(([channel]) => channel)).toEqual([
      "tray:open-config",
      "tray:close-config",
    ]);
  });

  it("主题 bridge 覆盖顶层与 metalsApi 兼容路径", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    const metalsApi = exposed.get("metalsApi");

    await api.themeSet("dark");
    await metalsApi.themeGet();
    await metalsApi.themeSet("system");

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "theme:set",
      "theme:get",
      "theme:set",
    ]);

    const unsubscribes = [
      api.onThemeChanged(() => {}),
      metalsApi.onThemeChanged(() => {}),
    ];
    expect(unsubscribes.every((unsubscribe) => typeof unsubscribe === "function")).toBe(true);
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    expect(removeListenerCalls.map(([channel]) => channel)).toEqual([
      "theme:changed",
      "theme:changed",
    ]);
  });

  it("self-update bridge 覆盖状态、检测与安装 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.selfUpdateGetState();
    await api.selfUpdateCheck();
    await api.selfUpdateInstall();
    const unsubscribe = api.onSelfUpdateState(() => {});

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "self-update:get-state",
      "self-update:check",
      "self-update:install",
    ]);
    expect(eventBindings.map(([channel]) => channel)).toEqual(["self-update:state"]);
    unsubscribe();
    expect(removeListenerCalls.map(([channel]) => channel)).toEqual(["self-update:state"]);
  });

  it("AI Prompt bridge 覆盖 load、save、reset 与更新订阅", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.aiPromptsLoad();
    await api.aiPromptsSave({
      ithome_summary: { system: "测试系统", rules: "测试规则", fewShot: "" },
    });
    await api.aiPromptsReset("ithome_summary");

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "ai-prompts:load",
      "ai-prompts:save",
      "ai-prompts:reset",
    ]);

    const unsubscribe = api.onAiPromptsUpdated(() => {});
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
    expect(removeListenerCalls.map(([channel]) => channel)).toEqual([
      "ai-prompts-updated",
    ]);
  });

  it("search bridge 覆盖 query 与 upsert channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.searchQuery("Cursor", null);
    await api.searchUpsert({
      id: "news:1",
      source: "news",
      nativeId: "1",
      title: "Cursor 更新",
      searchText: "Cursor 更新",
      payload: {},
    });

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "search:query",
      "search:upsert",
    ]);
  });

  it("digest bridge 覆盖 sections 查询与 settings 更新 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.digestFetchSections();
    await api.digestUpdateSettings({ enabled: true, time: "08:30" });

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "digest:fetch-sections",
      "digest:update-settings",
    ]);
  });

  it("AI Tasks/Sessions bridge 覆盖任务、密钥、健康检查与配置 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.listAiTasks({ dateKey: "2026-08-16" });
    await api.summarizeAiTasks({ dateKey: "2026-08-16", taskKeys: ["codex:1"] });
    await api.openSession("codex://1");
    await api.setAiKey("deepseek", "sk-test");
    await api.clearAiKey("deepseek");
    await api.hasAiKey("deepseek");
    await api.aiHealthcheck({ providerId: "deepseek", model: "deepseek-chat" });
    await api.getAiSessionsConfig();
    await api.saveAiSessionsConfig({
      provider: "deepseek",
      cloud: { providerId: "deepseek", model: "deepseek-chat" },
    });
    await api.getAiSharedConfig();
    await api.aiChat({ messages: [{ role: "user", content: "hi" }], stream: true });
    await api.aiChatCancel();

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "ai-tasks:list",
      "ai-tasks:summarize",
      "ai-sessions:open-session",
      "ai-sessions:set-key",
      "ai-sessions:clear-key",
      "ai-sessions:has-key",
      "ai-sessions:healthcheck",
      "ai-sessions:get-config",
      "ai-sessions:save-config",
      "ai:get-shared-config",
      "ai:chat",
      "ai:chat-cancel",
    ]);
  });

  it("AI 支撑 bridge 覆盖反馈、预算与建议摘要 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.feedbackRecord({
      feature: "advice",
      appName: "Cursor",
      ts: 100,
      vote: "up",
    });
    await api.feedbackExport();
    await api.tokenBudgetGet();
    await api.tokenBudgetSet({ dailyLimit: 5000, mode: "warn" });
    await api.upgradeAdviceFetch({ appName: "Cursor", force: false });
    await api.changelogSummaryFetch({ appName: "Cursor", force: false });

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "feedback:record",
      "feedback:export",
      "token-budget:get",
      "token-budget:set",
      "upgrade-advice:fetch",
      "changelog-summary:fetch",
    ]);
  });

  it("更新与 GitHub bridge 覆盖检查、搜索、仓库与 README channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.checkUpdates();
    await api.cancelCheck("job-1");
    await api.versionsRunCheck();
    await api.versionsCommandSearch("更新");
    await api.githubFetch("https://github.com/o/r", "gh-token");
    await api.githubFetchRelease("https://github.com/o/r", "gh-token");
    await api.aiParseReadme({
      projectName: "Pulse",
      description: "desktop app",
      readme: "# Pulse",
    });

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "check-updates",
      "check-updates:cancel",
      "check-updates",
      "versions:command-search",
      "github:fetch",
      "github:fetch-release",
      "ai:parse-readme",
    ]);
  });

  it("系统 bridge 覆盖窗口、外链、静音、最近打开与批量升级 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.windowMinimize();
    await api.windowToggleMaximize();
    await api.windowClose();
    await api.openUrl("https://example.com");
    await api.getMutes();
    await api.setMute("Cursor", 60);
    await api.clearMute("Cursor");
    await api.getLastOpened();
    await api.refreshLastOpened();
    await api.bulkUpgradeStart([{ id: "cursor:1", name: "Cursor" }]);
    await api.bulkUpgradeCancel();

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "window:minimize",
      "window:toggle-maximize",
      "window:close",
      "open-url:open",
      "get-mutes",
      "set-mute",
      "clear-mute",
      "get-last-opened",
      "refresh-last-opened",
      "bulk-upgrade:start",
      "bulk-upgrade:cancel",
    ]);
  });

  it("导航持久化 bridge 覆盖 active category 与 last active nav channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.getActiveCategory();
    await api.saveActiveCategory("ai");
    await api.getLastActiveNav();
    await api.saveLastActiveNav("invest");

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "get-active-category",
      "save-active-category",
      "get-last-active-nav",
      "save-last-active-nav",
    ]);
  });

  it("配置与缓存 bridge 覆盖启动所需的核心 state channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.getConfig();
    await api.getCachedState();

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "get-config",
      "get-cached-state",
    ]);
  });

  it("更新动作 bridge 覆盖 brew upgrade 与 app icon channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.brewUpgrade("cursor");
    await api.getAppIcon("/Applications/Cursor.app");

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "brew-upgrade",
      "get-app-icon",
    ]);
  });

  it("不暴露没有主进程 handler 的 legacy brew-update bridge", () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    expect(api).not.toHaveProperty("brewUpdate");
  });

  it("AI 用量缓存、刷新与告警偏好 bridge 覆盖共享契约中的 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.aiUsageGetCached();
    await api.aiUsageFetch({ provider: "glm", region: "global" });
    await api.aiUsageAlertPrefsGet();
    await api.aiUsageAlertPrefsSet({ enabled: false, absMinPct: 60 });

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "ai-usage:get-cached",
      "ai-usage:fetch",
      "ai-usage:alert-prefs:get",
      "ai-usage:alert-prefs:set",
    ]);
  });

  it("错误聚合与诊断 bridge 覆盖共享契约中的 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.errorFetchEntries({ since: 0, limit: 10 });
    await api.errorCopyAll();
    await api.errorExportZip({});
    await api.errorClearOld({});
    await api.diagnosticsFetch({ topN: 5 });
    await api.diagnosticsFetchSamples();
    await api.errorOpenFolder();
    await api.errorReport({ level: "error", message: "测试错误" });

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "error:fetch-entries",
      "error:copy-all",
      "error:export-zip",
      "error:clear-old",
      "diagnostics:fetch",
      "diagnostics:fetch-samples",
      "error:open-folder",
      "error:report",
    ]);
    expect(invokeCalls).toEqual([
      ["error:fetch-entries", { since: 0, limit: 10 }],
      ["error:copy-all"],
      ["error:export-zip", {}],
      ["error:clear-old", {}],
      ["diagnostics:fetch", { topN: 5 }],
      ["diagnostics:fetch-samples"],
      ["error:open-folder"],
      ["error:report", { level: "error", message: "测试错误" }],
    ]);
  });

  it("watchlist 与 release-notes bridge 覆盖共享契约中的 channel", async () => {
    requirePreloadFresh();
    const api = exposed.get("api");

    await api.watchlistList();
    await api.watchlistAdd({ type: "keyword", ref: "测试" });
    await api.watchlistRemove({ type: "keyword", ref: "测试" });
    await api.releaseNotes.getCurrent();
    await api.releaseNotes.getVersion("2.80.0");
    await api.releaseNotes.markSeen("2.80.0");

    expect(invokeCalls.map(([channel]) => channel)).toEqual([
      "watchlist:list",
      "watchlist:add",
      "watchlist:remove",
      "release-notes:get-current",
      "release-notes:get-version",
      "release-notes:mark-seen",
    ]);
  });

  it("pulse tray 事件 bridge 返回可调用的 unsubscribe 函数", () => {
    requirePreloadFresh();
    const tray = exposed.get("pulse").tray;
    const unsubscribes = [
      tray.onOpenConfig(() => {}),
      tray.onCloseConfigModal(() => {}),
    ];

    expect(unsubscribes.every((unsubscribe) => typeof unsubscribe === "function")).toBe(true);
  });

  it("核心事件 bridge 覆盖 channel 并可移除原始 listener", () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    const channels = [
      ["onCheckProgress", "check-progress"],
      ["onCheckStarted", "check-started"],
      ["onCheckDetecting", "check-detecting"],
      ["onStartCheck", "start-check"],
      ["onAutoCheckFinished", "auto-check-finished"],
      ["onCheckFinished", "check-finished"],
      ["onTrayFocus", "tray:focus"],
      ["onBulkUpgradeProgress", "bulk-upgrade:progress"],
      ["onBulkUpgradeDone", "bulk-upgrade:done"],
      ["onLastOpenedUpdated", "last-opened-updated"],
      ["onAiTaskSummaryUpdated", "ai-task-summary-updated"],
      ["onAiSessionsConfigUpdated", "ai-sessions-config-updated"],
      ["onAiUsageUpdated", "ai-usage-updated"],
      ["onSidenavBadge", "sidenav:badge"],
      ["onStateRecovered", "state:recovered"],
      ["onDigestOpen", "digest:open"],
      ["onErrorAppended", "error:appended"],
      ["onMainError", "main:error"],
    ];
    const unsubscribes = channels.map(([method]) => api[method](() => {}));

    expect(eventBindings.map(([channel]) => channel)).toEqual(
      channels.map(([, channel]) => channel),
    );
    expect(unsubscribes.every((unsubscribe) => typeof unsubscribe === "function")).toBe(true);

    unsubscribes.forEach((unsubscribe) => unsubscribe());
    expect(removeListenerCalls.map(([channel]) => channel)).toEqual(
      channels.map(([, channel]) => channel),
    );
    expect(eventBindings).toHaveLength(0);
  });

  it("检查生命周期事件保持 payload 透传", () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    const received: Record<string, unknown> = {};
    api.onCheckStarted((payload) => { received.started = payload; });
    api.onCheckProgress((payload) => { received.progress = payload; });
    api.onCheckDetecting((payload) => { received.detecting = payload; });
    api.onAutoCheckFinished((payload) => { received.autoFinished = payload; });
    api.onCheckFinished((payload) => { received.finished = payload; });
    api.onTrayFocus((payload) => { received.trayFocus = payload; });

    const payloads = {
      "check-started": { count: 1, appNames: ["Cursor"], ts: 1 },
      "check-progress": { task: "detect-app", name: "Cursor", status: "ok" },
      "check-detecting": { name: "Cursor", _sessionId: "s1" },
      "auto-check-finished": { count: 1, ts: 2, stale: [], freshestTs: 1 },
      "check-finished": { count: 1, ts: 3, stale: [], freshestTs: 2 },
      "tray:focus": { tab: "versions", rowName: "Cursor", action: "upgrade" },
    };
    for (const [channel, handler] of eventBindings) {
      if (channel in payloads) handler({}, payloads[channel]);
    }

    expect(received).toEqual({
      started: payloads["check-started"],
      progress: payloads["check-progress"],
      detecting: payloads["check-detecting"],
      autoFinished: payloads["auto-check-finished"],
      finished: payloads["check-finished"],
      trayFocus: payloads["tray:focus"],
    });
  });

  it("已定义领域事件保持专用 payload 透传", () => {
    requirePreloadFresh();
    const api = exposed.get("api");
    const received: Record<string, unknown> = {};
    api.onBulkUpgradeProgress((payload) => { received.bulkProgress = payload; });
    api.onBulkUpgradeDone((payload) => { received.bulkDone = payload; });
    api.onLastOpenedUpdated((payload) => { received.lastOpened = payload; });
    api.onAiTaskSummaryUpdated((payload) => { received.aiTask = payload; });
    api.onAiSessionsConfigUpdated((payload) => { received.aiSessions = payload; });
    api.onAiUsageUpdated((payload) => { received.aiUsage = payload; });
    api.onSidenavBadge((payload) => { received.sidenavBadge = payload; });
    api.onStateRecovered((payload) => { received.stateRecovered = payload; });
    api.onDigestOpen((payload) => { received.digestOpen = payload; });
    api.onMainError((payload) => { received.mainError = payload; });

    const payloads = {
      "bulk-upgrade:progress": { id: "cursor:1", status: "running" },
      "bulk-upgrade:done": { succeeded: [], failed: [], skipped: [], cancelled: false },
      "last-opened-updated": { lastOpened: {} },
      "ai-task-summary-updated": { dateKey: "2026-08-16", taskKey: "Cursor:1", ok: false, error: "skip" },
      "ai-sessions-config-updated": { config: null },
      "ai-usage-updated": { provider: "glm", snapshot: {}, history: { days: [] } },
      "sidenav:badge": { key: "ai-usage", count: 1 },
      "state:recovered": {
        path: "/tmp/state.json",
        backup: "/tmp/state.corrupt.json",
        backupFailed: false,
        reason: "parse_failed",
        errors: ["unexpected token"],
        ts: 4,
      },
      "digest:open": { date: "2026-08-16" },
      "main:error": { kind: "uncaughtException", message: "boom", name: "Error", ts: 5 },
    };
    for (const [channel, handler] of eventBindings) {
      if (channel in payloads) handler({}, payloads[channel]);
    }

    expect(received).toEqual({
      bulkProgress: payloads["bulk-upgrade:progress"],
      bulkDone: payloads["bulk-upgrade:done"],
      lastOpened: payloads["last-opened-updated"],
      aiTask: payloads["ai-task-summary-updated"],
      aiSessions: payloads["ai-sessions-config-updated"],
      aiUsage: payloads["ai-usage-updated"],
      sidenavBadge: payloads["sidenav:badge"],
      stateRecovered: payloads["state:recovered"],
      digestOpen: payloads["digest:open"],
      mainError: payloads["main:error"],
    });
  });
});
