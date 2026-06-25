# P61 配置导入导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把用户的 watchlist / reminders / funds / ai_prompts 四个 state.json 字段一键打包导出成 `.pulse-config.json`,支持反向导入,带 diff 预览 + 字段级覆盖确认。这是 v2 Pillar 6 里唯一不碰账号体系的"协作"——本质是文件交换。

**Architecture:** 新增 `src/main/config-portability.js`(纯函数:序列化/反序列化/diff 计算)+ `register-config-portability.js`(3 个 IPC)。导出沿用 `detect-results-export` 的 Desktop 写入范式;导入分两步——`config:import-load` 读文件算 diff 返回渲染层,`config:import-apply` 按用户勾选的字段逐个 patchState。渲染层新增 `ConfigImportModal.jsx`(diff 表格 + 勾选)。**不含 sidenavPrefs**(它在 renderer localStorage,跨进程同步成本高且丢失成本低)。

**Tech Stack:** Node.js (main) / Preact signals (renderer) / Electron `dialog`(本项目首次引入) / vitest / state.json patchState

---

## 关键设计决策(基于代码调研)

1. **字段映射**:用户语义 `fundPositions` → 实际 state.json 字段 `funds`(`{holdings, deletedIds, dailySnapshots, navSource, alertPrefs}` 嵌套对象)。导出文件里用语义键名 `funds`,直接对应 state 字段,不做重命名。
2. **导出写 Desktop 不弹 save dialog**:沿用 `detect-results-export` / `error:export-zip` 的既有惯例(写 `~/Desktop`,返回 path,UI 显示路径)。降低实现复杂度 + 跟项目一致。
3. **导入用 open dialog**:导入必须让用户选文件(不能猜路径),这是本项目首次引入 Electron `dialog.showOpenDialog`。
4. **diff 在 main 算,渲染层只展示**:避免渲染层直接碰 state 文件,保持 main 为唯一 state 访问者。
5. **导入分两步 IPC**:`import-load`(读+diff,不写)→ 用户在 UI 勾选 → `import-apply`(只写勾选的字段)。中间态可取消。
6. **逐字段 patchState**:import-apply 对每个选中字段调对应的 `saveXxx`(saveWatchlist / saveAiPrompts / fund-store.saveAll / reminders),而非一次性写整个 state。复用现有 save 路径(含 normalizeWatchlistItem 等清洗),避免跳过校验。
7. **reminders 竞态**:reminders.js 的写入走 `writeAtomic` 不走 `patchState`,导入时直接用 `patchState` 写 reminders 字段(跟 saveWatchlist 一致),绕开 reminders.js 的 raw write,避免竞态。

---

## File Structure

**Create:**
- `src/main/config-portability.js` — 纯函数:`serializeConfig` / `parseConfigFile` / `computeDiff`
- `src/main/ipc/register-config-portability.js` — 3 个 IPC:`config:export` / `config:import-load` / `config:import-apply`
- `src/renderer/components/ConfigImportModal.jsx` — diff 表格 + 字段勾选 + 导入按钮
- `tests/main/config-portability.test.js`
- `tests/main/register-config-portability.test.js`
- `tests/renderer/config-import-modal.test.jsx`

**Modify:**
- `src/main/ipc/index.js` — 注册 register-config-portability
- `preload.js` — 桥接 3 个 IPC
- `src/renderer/api.js` — 加 configExport / configImportLoad / configImportApply
- `src/renderer/components/DiagnosticsDrawer.jsx` 或 Settings — 加"导出配置"/"导入配置"入口按钮(调研后定;倾向 DiagnosticsDrawer,它已有 exportZip 范式)
- `styles.css` — diff 表格样式

---

## Task 1: config-portability.js 纯函数(序列化 / 解析 / diff)

**Files:**
- Create: `src/main/config-portability.js`
- Test: `tests/main/config-portability.test.js`

**导出文件格式 `.pulse-config.json`:**
```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-06-25T10:00:00.000Z",
  "pulseVersion": "2.46.0",
  "fields": {
    "watchlist": [ ... ],
    "reminders": [ ... ],
    "funds": { ... },
    "ai_prompts": { ... }
  }
}
```

**diff 结构:**
```js
[
  { field: "watchlist",  status: "changed", currentCount: 5, incomingCount: 7, summary: "新增 2 项" },
  { field: "reminders",  status: "added",   currentCount: 0, incomingCount: 3, summary: "新增 3 条提醒" },
  { field: "funds",      status: "same",    currentCount: 2, incomingCount: 2, summary: "无变化" },
  { field: "ai_prompts", status: "changed", currentCount: 1, incomingCount: 1, summary: "内容不同" },
]
// status: "added" (当前无) | "changed" (都有但不同) | "same" (相同) | "removed"(当前有传入无, 导入时跳过)
```

- [ ] **Step 1: Write the failing test**

```js
// tests/main/config-portability.test.js
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  CONFIG_FIELDS,
  serializeConfig,
  parseConfigFile,
  computeDiff,
} = require("../../src/main/config-portability");

describe("config-portability", () => {
  describe("CONFIG_FIELDS", () => {
    it("含 4 个字段: watchlist/reminders/funds/ai_prompts", () => {
      expect(CONFIG_FIELDS).toEqual([
        "watchlist",
        "reminders",
        "funds",
        "ai_prompts",
      ]);
    });
  });

  describe("serializeConfig", () => {
    it("从 state 提取 4 字段 + schemaVersion + 时间戳", () => {
      const state = {
        watchlist: [{ type: "app", ref: "VSCode" }],
        reminders: [{ id: "r1", text: "升级" }],
        funds: { holdings: [{ code: "000001" }] },
        ai_prompts: { digest: { system: "s" } },
        apps: { other: "ignored" }, // 不导
      };
      const out = serializeConfig(state, "2.46.0");
      expect(out.schemaVersion).toBe(1);
      expect(out.pulseVersion).toBe("2.46.0");
      expect(out.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(out.fields.watchlist).toEqual([{ type: "app", ref: "VSCode" }]);
      expect(out.fields.funds).toEqual({ holdings: [{ code: "000001" }] });
      expect(out.fields.apps).toBeUndefined(); // 不含 apps
    });

    it("缺失字段导出为 null (导入时识别为'无')", () => {
      const out = serializeConfig({ watchlist: [] }, "1.0");
      expect(out.fields.reminders).toBeNull();
      expect(out.fields.funds).toBeNull();
      expect(out.fields.ai_prompts).toBeNull();
    });
  });

  describe("parseConfigFile", () => {
    it("合法 JSON + schemaVersion=1 → 返回 fields", () => {
      const content = JSON.stringify({
        schemaVersion: 1,
        exportedAt: "2026-06-25T00:00:00Z",
        fields: { watchlist: [], reminders: null, funds: null, ai_prompts: null },
      });
      const r = parseConfigFile(content);
      expect(r.ok).toBe(true);
      expect(r.fields.watchlist).toEqual([]);
    });

    it("非法 JSON → ok:false reason:bad_json", () => {
      const r = parseConfigFile("not json{");
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("bad_json");
    });

    it("schemaVersion 缺失/不匹配 → ok:false reason:bad_schema", () => {
      const r = parseConfigFile(JSON.stringify({ schemaVersion: 99, fields: {} }));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("bad_schema");
    });

    it("含未知字段 → ok:false reason:unknown_fields", () => {
      const r = parseConfigFile(JSON.stringify({
        schemaVersion: 1,
        fields: { watchlist: [], evilField: "x" },
      }));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("unknown_fields");
      expect(r.unknownFields).toContain("evilField");
    });
  });

  describe("computeDiff", () => {
    const cur = {
      watchlist: [{ type: "app", ref: "A" }],
      reminders: [{ id: "r1" }],
      funds: { holdings: [{ code: "1" }] },
      ai_prompts: { d: { system: "old" } },
    };

    it("字段新增 (当前 null/无, 传入有) → added", () => {
      const diff = computeDiff({ watchlist: [], reminders: null, funds: null, ai_prompts: null }, cur);
      const r = diff.find((d) => d.field === "watchlist");
      expect(r.status).toBe("changed"); // 当前 [] 非空 incoming 有 → changed
      const r2 = diff.find((d) => d.field === "reminders");
      expect(r2.status).toBe("added");
    });

    it("内容相同 → same", () => {
      const diff = computeDiff(cur, { ...cur });
      expect(diff.every((d) => d.status === "same")).toBe(true);
    });

    it("内容不同 → changed", () => {
      const incoming = { ...cur, watchlist: [{ type: "app", ref: "B" }] };
      const diff = computeDiff(cur, incoming);
      const r = diff.find((d) => d.field === "watchlist");
      expect(r.status).toBe("changed");
      expect(r.summary).toMatch(/不同/);
    });

    it("count 字段反映数组/对象大小", () => {
      const diff = computeDiff(cur, { ...cur, watchlist: [{ type: "app", ref: "A" }, { type: "app", ref: "B" }] });
      const r = diff.find((d) => d.field === "watchlist");
      expect(r.currentCount).toBe(1);
      expect(r.incomingCount).toBe(2);
    });

    it("incoming 为 null → status: removed (导入跳过)", () => {
      const diff = computeDiff(cur, { watchlist: null, reminders: null, funds: null, ai_prompts: null });
      const r = diff.find((d) => d.field === "watchlist");
      expect(r.status).toBe("removed");
    });

    it("funds 对象用 Object.keys 长度做 count", () => {
      const diff = computeDiff(cur, { ...cur, funds: { holdings: [1, 2], nav: "x" } });
      const r = diff.find((d) => d.field === "funds");
      expect(r.currentCount).toBe(1); // {holdings:[1]} → 1 key
      expect(r.incomingCount).toBe(2); // {holdings,nav} → 2 keys
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/config-portability.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// src/main/config-portability.js
/**
 * P61 — 配置导入导出. 纯函数: 序列化 / 解析 / diff.
 * 4 个字段: watchlist / reminders / funds / ai_prompts (不含 sidenavPrefs — 在 renderer localStorage).
 *
 * 导出格式 .pulse-config.json:
 * { schemaVersion, exportedAt, pulseVersion, fields: { ...4字段 } }
 */

const CONFIG_FIELDS = ["watchlist", "reminders", "funds", "ai_prompts"];
const SCHEMA_VERSION = 1;

function countOf(val) {
  if (val == null) return 0;
  if (Array.isArray(val)) return val.length;
  if (typeof val === "object") return Object.keys(val).length;
  return 0;
}

function serializeConfig(state, pulseVersion = "") {
  const fields = {};
  for (const f of CONFIG_FIELDS) {
    const v = state && state[f];
    fields[f] = v === undefined ? null : v;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    pulseVersion,
    fields,
  };
}

function parseConfigFile(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "bad_json" };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: "bad_schema" };
  }
  if (!parsed.fields || typeof parsed.fields !== "object") {
    return { ok: false, reason: "bad_schema" };
  }
  // 检查未知字段
  const fieldKeys = Object.keys(parsed.fields);
  const unknownFields = fieldKeys.filter((k) => !CONFIG_FIELDS.includes(k));
  if (unknownFields.length > 0) {
    return { ok: false, reason: "unknown_fields", unknownFields };
  }
  return { ok: true, fields: parsed.fields };
}

function computeDiff(currentState, incomingFields) {
  const cur = currentState || {};
  const inc = incomingFields || {};
  return CONFIG_FIELDS.map((f) => {
    const curVal = cur[f];
    const incVal = inc[f];
    const curCount = countOf(curVal);
    const incCount = countOf(incVal);

    let status;
    let summary;
    if (incVal == null) {
      status = "removed";
      summary = "传入无此字段, 跳过";
    } else if (curVal == null || (curCount === 0 && incCount === 0 && JSON.stringify(curVal) !== JSON.stringify(incVal))) {
      // 当前无 (null 或空), 传入有
      status = curVal == null ? "added" : "same";
      summary = curVal == null ? "新增" : "无变化";
      // 修正: 当前 [] 传入 [] 也算 same; 当前 null 传入有算 added
      if (curVal == null) {
        status = "added";
        summary = incCount > 0 ? `新增 ${incCount} 项` : "新增 (空)";
      }
    } else if (JSON.stringify(curVal) === JSON.stringify(incVal)) {
      status = "same";
      summary = "无变化";
    } else {
      status = "changed";
      const delta = incCount - curCount;
      summary = `内容不同${delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}`;
    }
    return { field: f, status, currentCount: curCount, incomingCount: incCount, summary };
  });
}

module.exports = {
  CONFIG_FIELDS,
  SCHEMA_VERSION,
  serializeConfig,
  parseConfigFile,
  computeDiff,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/config-portability.test.js`
Expected: PASS (all)

> **注意:** computeDiff 的 added/same 边界("当前 [] 传入 []" vs "当前 null 传入 []")较细,实现时按测试用例为准调整分支。Step 1 的测试已覆盖:当前 [] 传入非空 → changed;当前 null 传入有 → added;相同 → same。

- [ ] **Step 5: Commit**

```bash
git add src/main/config-portability.js tests/main/config-portability.test.js
git commit -m "feat(p61): config-portability 纯函数 (序列化/解析/diff)"
```

---

## Task 2: IPC register-config-portability

**Files:**
- Create: `src/main/ipc/register-config-portability.js`
- Modify: `src/main/ipc/index.js`
- Test: `tests/main/register-config-portability.test.js`

> **首次引入 Electron `dialog`**:import-load 用 `dialog.showOpenDialog` 让用户选 `.pulse-config.json`。

- [ ] **Step 1: Write the failing test**

```js
// tests/main/register-config-portability.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

const stateStorePath = require.resolve("../../src/main/state-store.js");
const registerPath = require.resolve(
  "../../src/main/ipc/register-config-portability.js",
);

const loadWatchlist = vi.fn(() => []);
const load = vi.fn(() => null);
const patchState = vi.fn();

function stubModules() {
  vi.resetModules();
  const real = require(stateStorePath);
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: {
      ...real,
      loadWatchlist,
      load,
      patchState,
      saveWatchlist: vi.fn(),
      saveAiPrompts: vi.fn(),
    },
  };
}

function loadHandlers(dialogMock) {
  delete require.cache[registerPath];
  const { registerConfigPortabilityHandlers } = require(registerPath);
  const handlers = {};
  const safeHandle = (ch, fn) => { handlers[ch] = fn; };
  registerConfigPortabilityHandlers({ safeHandle, dialog: dialogMock });
  return handlers;
}

describe("register-config-portability IPC", () => {
  beforeEach(() => {
    loadWatchlist.mockReturnValue([]);
    load.mockReturnValue(null);
    patchState.mockReset();
    stubModules();
  });

  it("config:export 写 Desktop 并返回 path", async () => {
    const stateStore = require(stateStorePath);
    const realLoad = stateStore.load;
    stateStore.load = vi.fn(() => ({
      watchlist: [{ type: "app", ref: "X" }],
      reminders: [],
      funds: null,
      ai_prompts: null,
    }));
    const handlers = loadHandlers(null);
    const r = await handlers["config:export"]({}, "2.46.0");
    expect(r.ok).toBe(true);
    expect(r.path).toMatch(/pulse-config-.*\.json$/);
    stateStore.load = realLoad;
  });

  it("config:import-load 用户取消选文件 → ok:false reason:cancelled", async () => {
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: true })) };
    const handlers = loadHandlers(dialog);
    const r = await handlers["config:import-load"]({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("cancelled");
  });

  it("config:import-load 读文件 + 返回 diff", async () => {
    const os = require("os");
    const fs = require("fs");
    const path = require("path");
    const tmp = path.join(os.tmpdir(), `p61-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({
      schemaVersion: 1,
      fields: { watchlist: [{ type: "app", ref: "Y" }], reminders: null, funds: null, ai_prompts: null },
    }));
    const dialog = { showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [tmp] })) };
    const handlers = loadHandlers(dialog);
    const r = await handlers["config:import-load"]({});
    expect(r.ok).toBe(true);
    expect(r.diff).toBeDefined();
    expect(Array.isArray(r.diff)).toBe(true);
    fs.unlinkSync(tmp);
  });

  it("config:import-apply 空选中 → ok:false reason:no_selection", async () => {
    const handlers = loadHandlers(null);
    const r = await handlers["config:import-apply"]({}, { fields: {} });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_selection");
  });

  it("config:import-apply 选中 watchlist → 调用 saveWatchlist", async () => {
    const stateStore = require(stateStorePath);
    const handlers = loadHandlers(null);
    const r = await handlers["config:import-apply"]({}, {
      fields: { watchlist: [{ type: "app", ref: "Z" }] },
    });
    expect(r.ok).toBe(true);
    expect(stateStore.saveWatchlist).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/register-config-portability.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write register-config-portability.js**

```js
// src/main/ipc/register-config-portability.js
/**
 * P61 — 配置导入导出 IPC.
 *   config:export       序列化 4 字段 → 写 ~/Desktop/pulse-config-{ts}.json
 *   config:import-load  dialog 选文件 → 解析 + 算 diff (不写, 返回渲染层预览)
 *   config:import-apply 按用户勾选字段逐个 save (patchState 路径)
 */
const os = require("os");
const path = require("path");
const fs = require("fs");
const stateStore = require("../state-store");
const {
  serializeConfig,
  parseConfigFile,
  computeDiff,
  CONFIG_FIELDS,
} = require("../config-portability");

function registerConfigPortabilityHandlers(ctx) {
  const { safeHandle, dialog } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("config:export", async (_evt, pulseVersion) => {
    try {
      const state = stateStore.load() || {};
      const payload = serializeConfig(state, pulseVersion || "");
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
    if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
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
    const applied = [];
    try {
      const inc = payload.fields;
      // watchlist
      if (Array.isArray(inc.watchlist)) {
        stateStore.saveWatchlist(inc.watchlist);
        applied.push("watchlist");
      }
      // reminders (走 patchState, 避免 reminders.js 的 raw writeAtomic 竞态)
      if (Array.isArray(inc.reminders)) {
        stateStore.patchState((next) => { next.reminders = inc.reminders; });
        applied.push("reminders");
      }
      // funds
      if (inc.funds && typeof inc.funds === "object") {
        const { saveAll: saveFunds } = require("../fund-store");
        saveFunds(inc.funds);
        applied.push("funds");
      }
      // ai_prompts
      if (inc.ai_prompts && typeof inc.ai_prompts === "object") {
        stateStore.saveAiPrompts(inc.ai_prompts);
        applied.push("ai_prompts");
      }
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message, applied };
    }
    if (applied.length === 0) return { ok: false, reason: "no_selection" };
    return { ok: true, applied };
  });
}

module.exports = { registerConfigPortabilityHandlers };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/register-config-portability.test.js`
Expected: PASS

- [ ] **Step 5: Wire into ipc/index.js**

在 `src/main/ipc/index.js` 组装 ctx 处,确认 `dialog` 是否已在 ctx 中(它由 createIpcContext 提供,见 context.js)。若 ctx 不含 dialog,需在 context.js 补 `{ dialog: require("electron").dialog }` 或直接在 register-config-portability 内部 `const { dialog } = require("electron")`。

读 `src/main/ipc/context.js` 确认 ctx 结构。若 ctx 不含 dialog,采用"register 内部 require electron"的简单方案(不污染 ctx)。

```js
// ipc/index.js
const { registerConfigPortabilityHandlers } = require("./register-config-portability");
// 在 registerIpcHandlers 里:
  registerConfigPortabilityHandlers(ctx);
```

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/register-config-portability.js src/main/ipc/index.js tests/main/register-config-portability.test.js
git commit -m "feat(p61): config:export/import-load/import-apply IPC"
```

---

## Task 3: preload + api 桥接

**Files:**
- Modify: `preload.js`
- Modify: `src/renderer/api.js`

- [ ] **Step 1: preload.js 加 3 个桥接**

在 `changelogSummaryFetch` 附近(或 `detectResultsExport` 附近)加:

```js
  configExport: (pulseVersion) => ipcRenderer.invoke("config:export", pulseVersion),
  configImportLoad: () => ipcRenderer.invoke("config:import-load"),
  configImportApply: (payload) => ipcRenderer.invoke("config:import-apply", payload),
```

- [ ] **Step 2: api.js 加 3 个**

```js
    configExport: pick(overrides, "configExport"),
    configImportLoad: pick(overrides, "configImportLoad"),
    configImportApply: pick(overrides, "configImportApply"),
```

- [ ] **Step 3: Build check**

Run: `npm run build:renderer`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add preload.js src/renderer/api.js
git commit -m "feat(p61): preload + api 桥接 config 导入导出"
```

---

## Task 4: ConfigImportModal.jsx (diff 表格 + 勾选)

**Files:**
- Create: `src/renderer/components/ConfigImportModal.jsx`
- Modify: `styles.css`
- Test: `tests/renderer/config-import-modal.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// tests/renderer/config-import-modal.test.jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/preact";
import { ConfigImportModal } from "../../src/renderer/components/ConfigImportModal.jsx";
import { api } from "../../src/renderer/api.js";

describe("ConfigImportModal", () => {
  beforeEach(() => {
    cleanup();
    vi.spyOn(api, "configImportLoad").mockResolvedValue({
      ok: true,
      diff: [
        { field: "watchlist", status: "changed", currentCount: 5, incomingCount: 7, summary: "内容不同 (+2)" },
        { field: "reminders", status: "added", currentCount: 0, incomingCount: 3, summary: "新增 3 项" },
        { field: "funds", status: "same", currentCount: 2, incomingCount: 2, summary: "无变化" },
      ],
      fields: {
        watchlist: [{ type: "app", ref: "A" }],
        reminders: [{ id: "r1" }],
        funds: { holdings: [] },
      },
      filePath: "/tmp/x.json",
    });
    vi.spyOn(api, "configImportApply").mockResolvedValue({ ok: true, applied: ["watchlist", "reminders"] });
  });

  afterEach(() => vi.restoreAllMocks());

  it("打开后加载 diff, 显示每行字段+状态+摘要", async () => {
    render(<ConfigImportModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("watchlist")).toBeTruthy());
    expect(screen.getByText("reminders")).toBeTruthy();
    expect(screen.getByText(/内容不同/)).toBeTruthy();
  });

  it("默认勾选非 same 的字段, same 默认不勾", async () => {
    render(<ConfigImportModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("watchlist")).toBeTruthy());
    const wlCheckbox = screen.getByLabelText(/watchlist/);
    const fundsCheckbox = screen.getByLabelText(/funds/);
    expect(wlCheckbox.checked).toBe(true);
    expect(fundsCheckbox.checked).toBe(false);
  });

  it("点导入 → 只提交勾选字段", async () => {
    const { container } = render(<ConfigImportModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("watchlist")).toBeTruthy());
    // 取消勾选 reminders
    fireEvent.click(screen.getByLabelText(/reminders/));
    fireEvent.click(screen.getByRole("button", { name: /导入/ }));
    await waitFor(() => expect(api.configImportApply).toHaveBeenCalled());
    const arg = api.configImportApply.mock.calls[0][0];
    expect(arg.fields.watchlist).toBeDefined();
    expect(arg.fields.reminders).toBeUndefined(); // 被取消
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/config-import-modal.test.jsx`
Expected: FAIL — component not found

- [ ] **Step 3: Write ConfigImportModal.jsx**

```jsx
// src/renderer/components/ConfigImportModal.jsx
import { useEffect, useState } from "preact/hooks";
import { api } from "../api.js";
import { showToast } from "../store.js";

const FIELD_LABELS = {
  watchlist: "关注列表",
  reminders: "提醒",
  funds: "基金持仓",
  ai_prompts: "AI Prompt",
};

export function ConfigImportModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState(null);
  const [fields, setFields] = useState(null);
  const [selected, setSelected] = useState({}); // { field: bool }
  const [applying, setApplying] = useState(false);
  const [filePath, setFilePath] = useState(null);

  useEffect(() => {
    if (!api.configImportLoad) { setLoading(false); return; }
    api.configImportLoad()
      .then((r) => {
        if (!r || !r.ok) {
          if (r && r.reason !== "cancelled") showToast("读取配置失败", "error", 2000);
          onClose();
          return;
        }
        setDiff(r.diff || []);
        setFields(r.fields || {});
        setFilePath(r.filePath);
        // 默认勾选非 same / 非 removed 的字段
        const sel = {};
        for (const d of r.diff || []) {
          sel[d.field] = d.status !== "same" && d.status !== "removed";
        }
        setSelected(sel);
      })
      .catch(() => onClose())
      .finally(() => setLoading(false));
  }, []);

  function toggle(field) {
    setSelected((s) => ({ ...s, [field]: !s[field] }));
  }

  async function doApply() {
    const chosenFields = {};
    for (const f of Object.keys(selected)) {
      if (selected[f] && fields[f] != null) chosenFields[f] = fields[f];
    }
    if (Object.keys(chosenFields).length === 0) {
      showToast("未选择任何字段", "error", 1500);
      return;
    }
    setApplying(true);
    try {
      const r = await api.configImportApply({ fields: chosenFields });
      if (r && r.ok) {
        showToast(`已导入 ${r.applied.length} 项: ${r.applied.join(", ")}`, "success", 2500);
        onClose();
      } else {
        showToast("导入失败: " + ((r && r.reason) || "未知"), "error", 2500);
      }
    } catch {
      showToast("导入失败", "error", 2000);
    }
    setApplying(false);
  }

  return (
    <div class="config-import-modal">
      <div class="config-import-modal-content">
        <h3>导入配置</h3>
        {filePath && <p class="config-import-source">来源: {filePath}</p>}
        {loading && <p>加载中…</p>}
        {!loading && diff && (
          <table class="config-import-diff">
            <thead>
              <tr><th>导入</th><th>字段</th><th>状态</th><th>当前</th><th>传入</th><th>说明</th></tr>
            </thead>
            <tbody>
              {diff.map((d) => (
                <tr key={d.field} class={`config-import-row is-${d.status}`}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={d.field}
                      checked={!!selected[d.field]}
                      disabled={d.status === "removed"}
                      onChange={() => toggle(d.field)}
                    />
                  </td>
                  <td>{FIELD_LABELS[d.field] || d.field}</td>
                  <td><span class={`config-import-status is-${d.status}`}>{d.status}</span></td>
                  <td>{d.currentCount}</td>
                  <td>{d.incomingCount}</td>
                  <td>{d.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div class="config-import-actions">
          <button type="button" class="btn btn-ghost" onClick={onClose} disabled={applying}>取消</button>
          <button type="button" class="btn btn-primary" onClick={doApply} disabled={applying || loading}>
            {applying ? "导入中…" : "导入"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add CSS**

在 styles.css 加:

```css
.config-import-modal {
  position: fixed; inset: 0; background: rgba(0,0,0,.4);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.config-import-modal-content {
  background: var(--bg, #fff); border-radius: 10px; padding: 20px;
  max-width: 560px; width: 90%; max-height: 80vh; overflow: auto;
}
.config-import-source { font-size: 11px; color: var(--text-soft, #888); word-break: break-all; }
.config-import-diff { width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0; }
.config-import-diff th, .config-import-diff td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--border, #eee); }
.config-import-diff th { font-weight: 600; background: var(--bg-soft, #f5f5f7); }
.config-import-status { padding: 1px 6px; border-radius: 8px; font-size: 10px; }
.config-import-status.is-added { background: #d4edda; color: #155724; }
.config-import-status.is-changed { background: #fff3cd; color: #856404; }
.config-import-status.is-same { background: var(--bg-soft, #eee); color: var(--text-soft, #888); }
.config-import-status.is-removed { background: #f8d7da; color: #721c24; }
.config-import-row.is-removed { opacity: 0.5; }
.config-import-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/renderer/config-import-modal.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ConfigImportModal.jsx styles.css tests/renderer/config-import-modal.test.jsx
git commit -m "feat(p61): ConfigImportModal diff 表格 + 字段勾选"
```

---

## Task 5: 入口按钮 (DiagnosticsDrawer) + 全量回归

**Files:**
- Modify: `src/renderer/components/DiagnosticsDrawer.jsx`
- Modify: `src/renderer/components/App.jsx`(或顶层,挂载 ConfigImportModal)
- Test: 视 DiagnosticsDrawer 结构补

> 入口位置:DiagnosticsDrawer 已有 exportZip 范式 + "导出/导入"主题契合。加两个按钮:"导出配置"/"导入配置"。导入按钮打开 ConfigImportModal。

- [ ] **Step 1: 加导出/导入按钮到 DiagnosticsDrawer**

在 DiagnosticsDrawer 的导出区(exportZip 附近)加:

```jsx
  const [importOpen, setImportOpen] = useState(false);

  async function exportConfig() {
    if (!api.configExport) return;
    try {
      const r = await api.configExport(pulseVersion);
      if (r && r.ok) {
        showToast(`配置已导出: ${r.path}`, "success", 3000);
      } else {
        showToast("导出失败", "error", 2000);
      }
    } catch {
      showToast("导出失败", "error", 2000);
    }
  }
```

按钮 JSX(在 exportZip 按钮附近):

```jsx
<div class="diag-config-portability">
  <button type="button" class="btn btn-ghost btn-sm" onClick={exportConfig}>导出配置</button>
  <button type="button" class="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}>导入配置</button>
</div>
{importOpen && <ConfigImportModal onClose={() => { setImportOpen(false); }} />}
```

> 注意:DiagnosticsDrawer 需 import ConfigImportModal + pulseVersion(pulseVersion 可能来自 diagnostics store 或 props,确认后调整)。

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: 全量 PASS(rollback flaky 已知)

- [ ] **Step 3: Build check**

Run: `npm run build:renderer`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/DiagnosticsDrawer.jsx styles.css
git commit -m "feat(p61): DiagnosticsDrawer 导出/导入配置入口 + 全量回归"
```

---

## Self-Review Notes

**Spec coverage (对照 v2 roadmap §4.2):**
- ✅ 导出 `.pulse-config.json`:Task 1-2
- ✅ 反向导入:Task 2(import-apply)
- ✅ diff 预览 + 字段级覆盖确认:Task 4
- ✅ 4 字段:watchlist / reminders / funds / ai_prompts(Task 1 CONFIG_FIELDS)
- ❌ sidenavPrefs:明确不含(roadmap 评审决定)

**关键风险:**
1. **首次引入 Electron `dialog`** — register-config-portability 内部 require electron dialog,测试通过 ctx 注入 mock dialog。若 electron 在测试环境 require 失败,需在 register 函数顶部做 `try { dialog = require("electron").dialog } catch {}`。
2. **fund-store.saveAll 签名** — Task 2 import-apply 调 `fund-store.saveAll(inc.funds)`,需确认它接受完整 funds 对象(调研显示 fund-store 有 loadAll/saveAll)。实施时验证签名。
3. **reminders 竞态** — 用 patchState 写 reminders 而非 reminders.js,绕开竞态。但导入后 reminders scheduler 可能需重新加载——实施时检查 reminders scheduler 是否监听 state 变化。

**交叉点:** 本 plan 改 state-store(读)+ fund-store(saveAll)。与 A8/P71 的 state-store 字段无冲突(aiFeedback / tokenSpend 独立)。可在 main 基线分支实施。
