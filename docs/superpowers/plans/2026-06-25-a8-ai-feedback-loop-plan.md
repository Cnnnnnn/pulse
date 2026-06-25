# A8 AI 反馈闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 A1(changelog 摘要)/ A2(升级建议)加 👍/👎 反馈按钮 + 隐式信号采集,把 prompt 调优从"盲改"变"有据改"。

**Architecture:** 新增 `src/main/ai-feedback-store.js`(纯函数 + state.json LRU 持久化,cap-500),经 IPC `feedback:record` / `feedback:export` 暴露给渲染层。两个 AI 结果组件(`UpgradeAdvice.jsx` / `ChangelogSummary.jsx`)在结果态加反馈按钮。隐式信号(升级/snooze/force)复用现有 store,不新增埋点。

**Tech Stack:** Node.js (main) / Preact signals (renderer) / vitest / state.json LRU 模式(沿用 v1 Q1 startup_samples / A4 ai-usage 的 cap 模式)

---

## File Structure

**Create:**
- `src/main/ai-feedback-store.js` — 反馈样本的 LRU 存储 + 持久化(state.json.aiFeedback)
- `src/main/ipc/register-ai-feedback.js` — 2 个 IPC:`feedback:record` / `feedback:export`
- `tests/main/ai-feedback-store.test.js` — LRU / 持久化单测
- `tests/main/register-ai-feedback.test.js` — IPC 单测
- `tests/renderer/upgrade-advice-feedback.test.jsx` — A2 👍/👎 按钮渲染测试
- `tests/renderer/changelog-summary-feedback.test.jsx` — A1 👍/👎 按钮渲染测试

**Modify:**
- `src/main/state-store.js` — 加 `aiFeedback` 到 PRESERVE_FIELDS + saveAiFeedback/loadAiFeedback
- `src/main/state-store-schema.js` — FIELD_SPECS 加 `aiFeedback: { kind: 'object' }`
- `src/main/ipc/index.js` — 注册 register-ai-feedback
- `src/renderer/api.js` — 加 `feedbackRecord` / `feedbackExport`
- `preload.js` — 桥接 2 个 IPC
- `src/renderer/components/UpgradeAdvice.jsx` — 结果态加 👍/👎 按钮
- `src/renderer/components/ChangelogSummary.jsx` — 结果态加 👍/👎 按钮

---

## Task 1: ai-feedback-store 纯函数 + LRU

**Files:**
- Create: `src/main/ai-feedback-store.js`
- Test: `tests/main/ai-feedback-store.test.js`

**反馈样本结构:**
```js
{
  id: "VSCode::2.1.0::advice::1719300000000",  // appName::version::feature::ts 去重 key
  feature: "advice",        // "advice" (A2) | "summary" (A1)
  appName: "VSCode",
  version: "2.1.0",         // latestVersion
  rec: "upgrade",           // A2 专有;A1 为 null
  confidence: "high",       // A2 专有;A1 为 null
  vote: "up",               // "up" | "down"
  implicit: null,           // "upgraded" | "snoozed" | "refreshed" | null(显式反馈时)
  ts: 1719300000000
}
```

- [ ] **Step 1: Write the failing test**

```js
// tests/main/ai-feedback-store.test.js
const { describe, it, expect, beforeEach } = require("vitest");
const {
  recordFeedback,
  dedupeKey,
  pruneToCap,
} = require("../../src/main/ai-feedback-store");

describe("ai-feedback-store", () => {
  describe("dedupeKey", () => {
    it("同 feature+appName+version+ts 生成相同 key", () => {
      const base = { feature: "advice", appName: "VSCode", version: "2.1.0", ts: 1000 };
      expect(dedupeKey(base)).toBe("advice::VSCode::2.1.0::1000");
      expect(dedupeKey({ ...base, vote: "up" })).toBe(dedupeKey({ ...base, vote: "down" }));
    });
  });

  describe("recordFeedback", () => {
    it("空列表 + 新反馈 → 单条", () => {
      const out = recordFeedback([], { feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", ts: 100 });
      expect(out).toHaveLength(1);
      expect(out[0].id).toBe("advice::X::1::100");
      expect(out[0].vote).toBe("up");
    });

    it("unshift 到头部(最新在前)", () => {
      const list = [{ id: "old", ts: 50 }];
      const out = recordFeedback(list, { feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", ts: 100 });
      expect(out[0].ts).toBe(100);
      expect(out[1].ts).toBe(50);
    });

    it("同 dedupeKey 覆盖(用户改了 vote)", () => {
      const list = [{ id: "advice::X::1::100", feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", ts: 100 }];
      const out = recordFeedback(list, { feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "down", ts: 100 });
      expect(out).toHaveLength(1);
      expect(out[0].vote).toBe("down");
    });

    it("缺失必填字段返回原列表(防御)", () => {
      const list = [{ id: "old", ts: 50 }];
      expect(recordFeedback(list, { feature: "advice", vote: "up", ts: 100 })).toBe(list);
      expect(recordFeedback(list, { appName: "X", vote: "up", ts: 100 })).toBe(list);
    });
  });

  describe("pruneToCap", () => {
    it("超过 cap 截断尾部", () => {
      const list = Array.from({ length: 10 }, (_, i) => ({ id: `k${i}`, ts: i }));
      const out = pruneToCap(list, 5);
      expect(out).toHaveLength(5);
      expect(out[0].ts).toBe(9); // 保留最新 5 条(ts 9,8,7,6,5)
    });

    it("未超 cap 不变", () => {
      const list = [{ id: "a" }, { id: "b" }];
      expect(pruneToCap(list, 5)).toBe(list);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/ai-feedback-store.test.js`
Expected: FAIL — `Cannot find module '../../src/main/ai-feedback-store.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/main/ai-feedback-store.js
/**
 * A8 — AI 反馈闭环. 显式 (👍/👎) + 隐式 (升级/snooze/force) 反馈样本的纯函数 + LRU.
 * 持久化走 state.json.aiFeedback (cap 500), 由 state-store 持有读写.
 *
 * 样本 shape:
 * { id, feature, appName, version, rec, confidence, vote, implicit, ts }
 *
 * feature: "advice" (A2) | "summary" (A1)
 * vote: "up" | "down"  (显式反馈)
 * implicit: "upgraded" | "snoozed" | "refreshed" | null  (隐式信号, 显式反馈时为 null)
 */

const FEEDBACK_CAP = 500;

function dedupeKey(sample) {
  return `${sample.feature}::${sample.appName}::${sample.version || ""}::${sample.ts}`;
}

function recordFeedback(list, raw) {
  if (!Array.isArray(list)) return list;
  if (!raw || typeof raw !== "object") return list;
  if (!raw.feature || !raw.appName || !raw.vote || typeof raw.ts !== "number") {
    return list; // 防御: 缺必填
  }
  const sample = {
    id: dedupeKey(raw),
    feature: raw.feature,
    appName: raw.appName,
    version: typeof raw.version === "string" ? raw.version : null,
    rec: raw.rec || null,
    confidence: raw.confidence || null,
    vote: raw.vote,
    implicit: raw.implicit || null,
    ts: raw.ts,
  };
  // 去重: 同 id 覆盖 (用户改 vote)
  const filtered = list.filter((s) => s && s.id !== sample.id);
  return [sample, ...filtered];
}

function pruneToCap(list, cap = FEEDBACK_CAP) {
  if (!Array.isArray(list)) return list;
  if (list.length <= cap) return list;
  return list.slice(0, cap); // list 头部最新, 截尾部
}

module.exports = { recordFeedback, dedupeKey, pruneToCap, FEEDBACK_CAP };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/ai-feedback-store.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/ai-feedback-store.js tests/main/ai-feedback-store.test.js
git commit -m "feat(a8): ai-feedback-store 纯函数 + LRU 去重"
```

---

## Task 2: state-store 接入 aiFeedback 字段

**Files:**
- Modify: `src/main/state-store.js` (PRESERVE_FIELDS + load/save)
- Modify: `src/main/state-store-schema.js` (FIELD_SPECS)
- Test: `tests/main/state-store-ai-feedback.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/main/state-store-ai-feedback.test.js
const { describe, it, expect, beforeEach, afterEach } = require("vitest");
const os = require("os");
const fs = require("fs");
const path = require("path");
const stateStore = require("../../src/main/state-store");

function tmpStatePath() {
  return path.join(os.tmpdir(), `pulse-test-fb-${Date.now()}-${Math.random()}.json`);
}

describe("state-store aiFeedback", () => {
  let p;
  beforeEach(() => { p = tmpStatePath(); });
  afterEach(() => { try { fs.unlinkSync(p); } catch {} });

  it("loadAiFeedback 无文件返回空数组", () => {
    expect(stateStore.loadAiFeedback(p)).toEqual([]);
  });

  it("saveAiFeedback + loadAiFeedback 往返", () => {
    const samples = [
      { id: "advice::X::1::100", feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", implicit: null, ts: 100 },
    ];
    stateStore.saveAiFeedback(samples, p);
    const loaded = stateStore.loadAiFeedback(p);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("advice::X::1::100");
  });

  it("saveAiFeedback 不破坏其它字段", () => {
    // 先写一个带 apps 的 state
    stateStore.saveAll({ apps: { VSCode: {} } }, p);
    stateStore.saveAiFeedback([{ id: "k1", feature: "summary", appName: "Y", vote: "down", ts: 5 }], p);
    const loaded = stateStore.load(p);
    expect(loaded.apps).toBeDefined();
    expect(loaded.aiFeedback).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/state-store-ai-feedback.test.js`
Expected: FAIL — `stateStore.saveAiFeedback is not a function`

- [ ] **Step 3: Modify state-store-schema.js — 加 FIELD_SPEC**

在 `src/main/state-store-schema.js` 的 `FIELD_SPECS` 对象里(`daily_digest` 行之后)加一行:

```js
  daily_digest:       { kind: 'object' },
  aiFeedback:         { kind: 'array' },   // A8: AI 反馈样本 cap-500
```

- [ ] **Step 4: Modify state-store.js — 加 PRESERVE_FIELDS + load/save**

先在 `PRESERVE_FIELDS` 数组里(找 `version_history` / `startup_samples` 那一带)加:

```js
  { key: "aiFeedback", kind: "array" }, // A8: AI 反馈样本 cap-500
```

然后在 state-store.js 末尾(其它 load/save 函数附近,如 `loadStartupSamples` 旁)加两个函数。先读文件确认 `load` / `saveAll` 的读写原语名称(通常是 `load(statePath)` 和 `saveAll(stateObj, statePath)`),按现有 `loadStartupSamples` / `saveStartupSamples` 的写法照抄:

```js
// ---- A8: AI 反馈样本 (cap 500) ----

function loadAiFeedback(statePath) {
  const state = load(statePath);
  const arr = state && state.aiFeedback;
  return Array.isArray(arr) ? arr : [];
}

function saveAiFeedback(samples, statePath) {
  if (!Array.isArray(samples)) return;
  const state = load(statePath) || {};
  state.aiFeedback = samples;
  saveAll(state, statePath);
}
```

在 `module.exports` 里加 `loadAiFeedback`, `saveAiFeedback`。

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/state-store-ai-feedback.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Run full state-store suite to confirm no regression**

Run: `npx vitest run tests/main/state-store`
Expected: PASS (全部,含原有 state-store-recovery / schema 测试)

- [ ] **Step 7: Commit**

```bash
git add src/main/state-store.js src/main/state-store-schema.js tests/main/state-store-ai-feedback.test.js
git commit -m "feat(a8): state-store 接入 aiFeedback 字段 (cap 500)"
```

---

## Task 3: IPC register-ai-feedback

**Files:**
- Create: `src/main/ipc/register-ai-feedback.js`
- Modify: `src/main/ipc/index.js`
- Test: `tests/main/register-ai-feedback.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/main/register-ai-feedback.test.js
const { describe, it, expect, beforeEach, vi } = require("vitest");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { registerAiFeedbackHandlers } = require("../../src/main/ipc/register-ai-feedback");
const stateStore = require("../../src/main/state-store");

function tmpStatePath() {
  return path.join(os.tmpdir(), `pulse-test-fbipc-${Date.now()}-${Math.random()}.json`);
}

describe("register-ai-feedback IPC", () => {
  let handlers, statePath;
  beforeEach(() => {
    statePath = tmpStatePath();
    handlers = {};
    const safeHandle = (channel, fn) => { handlers[channel] = fn; };
    registerAiFeedbackHandlers({ safeHandle, statePath });
  });
  afterEach(() => { try { fs.unlinkSync(statePath); } catch {} });

  it("feedback:record 写入并返回 ok", async () => {
    const r = await handlers["feedback:record"]({}, {
      feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", ts: 100,
    });
    expect(r.ok).toBe(true);
    const loaded = stateStore.loadAiFeedback(statePath);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].vote).toBe("up");
  });

  it("feedback:record 缺必填返回 ok:false reason:invalid_args", async () => {
    const r = await handlers["feedback:record"]({}, { appName: "X" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
  });

  it("feedback:export 返回全部样本", async () => {
    await handlers["feedback:record"]({}, { feature: "advice", appName: "X", version: "1", vote: "up", ts: 1 });
    await handlers["feedback:record"]({}, { feature: "summary", appName: "Y", version: "2", vote: "down", ts: 2 });
    const r = await handlers["feedback:export"]({});
    expect(r.ok).toBe(true);
    expect(r.samples).toHaveLength(2);
    expect(r.samples[0].ts).toBe(2); // 最新在前
  });

  it("feedback:export 空也返回 ok + 空数组", async () => {
    const r = await handlers["feedback:export"]({});
    expect(r.ok).toBe(true);
    expect(r.samples).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/register-ai-feedback.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write register-ai-feedback.js**

```js
// src/main/ipc/register-ai-feedback.js
/**
 * A8 — AI 反馈闭环 IPC. feedback:record (写) + feedback:export (读全部).
 */
const stateStore = require("../state-store");
const { recordFeedback, pruneToCap, FEEDBACK_CAP } = require("../ai-feedback-store");

function registerAiFeedbackHandlers(ctx) {
  const { safeHandle, statePath } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("feedback:record", async (_evt, raw) => {
    if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_args" };
    if (!raw.feature || !raw.appName || !raw.vote || typeof raw.ts !== "number") {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      const current = stateStore.loadAiFeedback(statePath);
      const next = pruneToCap(recordFeedback(current, raw), FEEDBACK_CAP);
      stateStore.saveAiFeedback(next, statePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("feedback:export", async () => {
    try {
      return { ok: true, samples: stateStore.loadAiFeedback(statePath) };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerAiFeedbackHandlers };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/register-ai-feedback.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire into ipc/index.js**

读 `src/main/ipc/index.js`,找到其它 `register*Handlers(ctx)` 调用处(如 `registerUpgradeAdviceHandlers`),照抄加一行。ctx 需带 `statePath`——确认 index.js 组装 ctx 时是否已传 `statePath`(其它依赖 state 的 handler 如 watchlist 已传,应已就位)。加:

```js
const { registerAiFeedbackHandlers } = require("./register-ai-feedback");
// ... 在 registerAll(ctx) 里:
  registerAiFeedbackHandlers(ctx);
```

> **注意:** 若 ctx 当前不含 `statePath`,需在 index.js 组装 ctx 处补上(参考 watchlist/snooze handler 拿 state 路径的方式)。

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/register-ai-feedback.js src/main/ipc/index.js tests/main/register-ai-feedback.test.js
git commit -m "feat(a8): feedback:record / feedback:export IPC"
```

---

## Task 4: preload + api.js 桥接

**Files:**
- Modify: `preload.js`
- Modify: `src/renderer/api.js`

- [ ] **Step 1: Modify preload.js**

在 preload.js 里找到其它 `ipcRenderer.invoke` 桥接处(如 `upgradeAdviceFetch`),照抄加两个:

```js
  feedbackRecord: (payload) => ipcRenderer.invoke("feedback:record", payload),
  feedbackExport: () => ipcRenderer.invoke("feedback:export"),
```

- [ ] **Step 2: Modify src/renderer/api.js**

在 api.js 的 api 对象里加(参照 `upgradeAdviceFetch` 写法):

```js
  feedbackRecord: (payload) => bridge.feedbackRecord(payload),
  feedbackExport: () => bridge.feedbackExport(),
```

> `bridge` 是 api.js 里对 preload 暴露对象的引用名,按文件实际命名调整。

- [ ] **Step 3: Verify wiring manually**

Run: `npm run build:renderer && echo "build ok"`
Expected: 构建无报错(api 引用解析正常)

- [ ] **Step 4: Commit**

```bash
git add preload.js src/renderer/api.js
git commit -m "feat(a8): preload + api 桥接 feedback IPC"
```

---

## Task 5: UpgradeAdvice.jsx 加 👍/👎 按钮

**Files:**
- Modify: `src/renderer/components/UpgradeAdvice.jsx`
- Modify: `styles.css` (反馈按钮样式)
- Test: `tests/renderer/upgrade-advice-feedback.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// tests/renderer/upgrade-advice-feedback.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/preact";
import { UpgradeAdvice } from "../../src/renderer/components/UpgradeAdvice";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    upgradeAdviceFetch: vi.fn(),
    feedbackRecord: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { api } from "../../src/renderer/api.js";

describe("UpgradeAdvice 反馈按钮", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.upgradeAdviceFetch.mockResolvedValue({
      ok: true,
      recommendation: "upgrade",
      confidence: "high",
      summary: "建议升",
      reasons: ["安全修复"],
      generatedAt: Date.now(),
      latestVersion: "2.0",
    });
  });

  it("结果态显示 👍 / 👎 两个按钮", async () => {
    render(<UpgradeAdvice appName="VSCode" hasUpdate={true} />);
    fireEvent.click(screen.getByText(/该不该升/));
    await waitFor(() => expect(screen.getByText("建议升级")).toBeTruthy());
    expect(screen.getByLabelText("feedback-up")).toBeTruthy();
    expect(screen.getByLabelText("feedback-down")).toBeTruthy();
  });

  it("点 👍 调用 feedbackRecord 带 feature=advice", async () => {
    render(<UpgradeAdvice appName="VSCode" hasUpdate={true} />);
    fireEvent.click(screen.getByText(/该不该升/));
    await waitFor(() => expect(screen.getByLabelText("feedback-up")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("feedback-up"));
    await waitFor(() => expect(api.feedbackRecord).toHaveBeenCalled());
    const arg = api.feedbackRecord.mock.calls[0][0];
    expect(arg.feature).toBe("advice");
    expect(arg.appName).toBe("VSCode");
    expect(arg.version).toBe("2.0");
    expect(arg.rec).toBe("upgrade");
    expect(arg.confidence).toBe("high");
    expect(arg.vote).toBe("up");
  });

  it("点过之后按钮标记已选(防重复提交)", async () => {
    render(<UpgradeAdvice appName="VSCode" hasUpdate={true} />);
    fireEvent.click(screen.getByText(/该不该升/));
    await waitFor(() => expect(screen.getByLabelText("feedback-up")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("feedback-up"));
    await waitFor(() => expect(api.feedbackRecord).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText("feedback-up"));
    expect(api.feedbackRecord).toHaveBeenCalledTimes(1); // 不再触发
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/upgrade-advice-feedback.test.jsx`
Expected: FAIL — `Unable to find element by aria-label "feedback-up"`

- [ ] **Step 3: Modify UpgradeAdvice.jsx**

在组件顶部加状态 + record 函数,在结果态 JSX 末尾(↻ 按钮前)加反馈按钮。

文件顶部 import 后加(无需新 import,api 已在):
在组件内 `const [error, setError] = useState(null);` 后加:

```jsx
  const [vote, setVote] = useState(null); // null | "up" | "down"

  async function sendVote(v) {
    if (vote || !api.feedbackRecord) return; // 已投过 / 无 API
    setVote(v);
    try {
      await api.feedbackRecord({
        feature: "advice",
        appName,
        version: advice && advice.latestVersion,
        rec: advice && advice.recommendation,
        confidence: advice && advice.confidence,
        vote: v,
        ts: Date.now(),
      });
    } catch {
      /* noop, 反馈丢失不影响主流程 */
    }
  }
```

在结果态 `return (` 的 JSX 里,`↻` refresh 按钮之前插入:

```jsx
      <span class="upgrade-advice-feedback">
        <button
          type="button"
          class={`upgrade-advice-feedback-btn ${vote === "up" ? "is-active" : ""}`}
          aria-label="feedback-up"
          onClick={(e) => { e.stopPropagation(); sendVote("up"); }}
          title="有用"
          disabled={!!vote}
        >👍</button>
        <button
          type="button"
          class={`upgrade-advice-feedback-btn ${vote === "down" ? "is-active" : ""}`}
          aria-label="feedback-down"
          onClick={(e) => { e.stopPropagation(); sendVote("down"); }}
          title="没用"
          disabled={!!vote}
        >👎</button>
      </span>
```

- [ ] **Step 4: Add CSS in styles.css**

在 `.upgrade-advice-refresh` 样式块附近加:

```css
.upgrade-advice-feedback {
  display: inline-flex;
  gap: 2px;
  margin-left: 4px;
}
.upgrade-advice-feedback-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.upgrade-advice-feedback-btn:hover:not(:disabled) {
  opacity: 1;
}
.upgrade-advice-feedback-btn.is-active {
  opacity: 1;
}
.upgrade-advice-feedback-btn:disabled {
  cursor: default;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/renderer/upgrade-advice-feedback.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/UpgradeAdvice.jsx styles.css tests/renderer/upgrade-advice-feedback.test.jsx
git commit -m "feat(a8): UpgradeAdvice 👍/👎 反馈按钮"
```

---

## Task 6: ChangelogSummary.jsx 加 👍/👎 按钮

**Files:**
- Modify: `src/renderer/components/ChangelogSummary.jsx`
- Test: `tests/renderer/changelog-summary-feedback.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// tests/renderer/changelog-summary-feedback.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/preact";
import { ChangelogSummary } from "../../src/renderer/components/ChangelogSummary";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    changelogSummaryFetch: vi.fn(),
    feedbackRecord: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { api } from "../../src/renderer/api.js";

describe("ChangelogSummary 反馈按钮", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.changelogSummaryFetch.mockResolvedValue({
      ok: true,
      oneLiner: "安全修复",
      highlights: ["安全修复"],
      generatedAt: Date.now(),
    });
  });

  it("结果态显示 👍 / 👎", async () => {
    render(<ChangelogSummary appName="VSCode" />);
    fireEvent.click(screen.getByText(/3 件大事/));
    await waitFor(() => expect(screen.getByText(/本版要点/)).toBeTruthy());
    expect(screen.getByLabelText("feedback-up")).toBeTruthy();
    expect(screen.getByLabelText("feedback-down")).toBeTruthy();
  });

  it("点 👍 带 feature=summary", async () => {
    render(<ChangelogSummary appName="VSCode" />);
    fireEvent.click(screen.getByText(/3 件大事/));
    await waitFor(() => expect(screen.getByLabelText("feedback-up")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("feedback-up"));
    await waitFor(() => expect(api.feedbackRecord).toHaveBeenCalled());
    const arg = api.feedbackRecord.mock.calls[0][0];
    expect(arg.feature).toBe("summary");
    expect(arg.appName).toBe("VSCode");
    expect(arg.vote).toBe("up");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/changelog-summary-feedback.test.jsx`
Expected: FAIL — aria-label not found

- [ ] **Step 3: Modify ChangelogSummary.jsx**

在 `const [error, setError] = useState(null);` 后加 vote 状态 + sendVote,复用 UpgradeAdvice 的逻辑(feature 改 "summary",rec/confidence 为 null):

```jsx
  const [vote, setVote] = useState(null);

  async function sendVote(v) {
    if (vote || !api.feedbackRecord) return;
    setVote(v);
    try {
      await api.feedbackRecord({
        feature: "summary",
        appName,
        version: null,
        rec: null,
        confidence: null,
        vote: v,
        ts: Date.now(),
      });
    } catch {
      /* noop */
    }
  }
```

在结果态 `return (` 的 JSX 里,`changelog-summary-cached` 之后插入反馈按钮块:

```jsx
      <span class="changelog-summary-feedback">
        <button
          type="button"
          class={`changelog-summary-feedback-btn ${vote === "up" ? "is-active" : ""}`}
          aria-label="feedback-up"
          onClick={(e) => { e.stopPropagation(); sendVote("up"); }}
          title="有用"
          disabled={!!vote}
        >👍</button>
        <button
          type="button"
          class={`changelog-summary-feedback-btn ${vote === "down" ? "is-active" : ""}`}
          aria-label="feedback-down"
          onClick={(e) => { e.stopPropagation(); sendVote("down"); }}
          title="没用"
          disabled={!!vote}
        >👎</button>
      </span>
```

并在 styles.css 加(复用 advice 的样式思路,或抽公共 class):

```css
.changelog-summary-feedback {
  display: inline-flex;
  gap: 2px;
  margin-left: 4px;
}
.changelog-summary-feedback-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.changelog-summary-feedback-btn:hover:not(:disabled) { opacity: 1; }
.changelog-summary-feedback-btn.is-active { opacity: 1; }
.changelog-summary-feedback-btn:disabled { cursor: default; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/changelog-summary-feedback.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ChangelogSummary.jsx styles.css tests/renderer/changelog-summary-feedback.test.jsx
git commit -m "feat(a8): ChangelogSummary 👍/👎 反馈按钮"
```

---

## Task 7: 隐式信号采集(force 刷新记一条 refreshed)

**Files:**
- Modify: `src/renderer/components/UpgradeAdvice.jsx` (force 刷新时记隐式反馈)
- Test: 扩展 `tests/renderer/upgrade-advice-feedback.test.jsx`

> **设计取舍:** 完整隐式信号(upgraded/snoozed)需要跨组件 store 协作(AppRow 的升级按钮 / SnoozeMenu),侵入大。MVP 只采 force 刷新(A2 现有 force 路径,一个组件内可闭环)——它本身就是"用户对结果不满意"的强信号。upgraded/snoozed 隐式信号留作 A8 v2,等反馈管道跑通后再接。

- [ ] **Step 1: Extend the test**

在 `tests/renderer/upgrade-advice-feedback.test.jsx` 末尾加:

```jsx
  it("force 刷新(↻)记录一条 implicit=refreshed 反馈", async () => {
    render(<UpgradeAdvice appName="VSCode" hasUpdate={true} />);
    fireEvent.click(screen.getByText(/该不该升/));
    await waitFor(() => expect(screen.getByText("建议升级")).toBeTruthy());
    // 先清掉前面可能的调用(初次 fetch 不该记反馈)
    api.feedbackRecord.mockClear();
    fireEvent.click(screen.getByLabelText(/refresh|重新分析/).closest("button") || screen.getByTitle("重新分析 (会消耗 AI 配额)"));
    await waitFor(() => {
      const refreshedCall = api.feedbackRecord.mock.calls.find(
        (c) => c[0] && c[0].implicit === "refreshed"
      );
      expect(refreshedCall).toBeTruthy();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/upgrade-advice-feedback.test.jsx`
Expected: FAIL — no call with implicit=refreshed

- [ ] **Step 3: Modify fetchAdvice in UpgradeAdvice.jsx**

在 `fetchAdvice` 函数里,`force === true` 时(即用户点 ↻)调用 `feedbackRecord` 记一条隐式反馈。在 `setLoading(true)` 之前加:

```jsx
    if (force && api.feedbackRecord) {
      // 隐式信号: 用户对当前结果不满意, 强制重新分析
      api.feedbackRecord({
        feature: "advice",
        appName,
        version: advice && advice.latestVersion,
        rec: advice && advice.recommendation,
        confidence: advice && advice.confidence,
        vote: null,
        implicit: "refreshed",
        ts: Date.now(),
      }).catch(() => {});
    }
```

> 注意:`recordFeedback` 纯函数对 `vote: null` 的样本应仍生成(隐式信号)。回看 Task 1 的 `recordFeedback`——它要求 `raw.vote`,隐式样本 vote 为 null 会被防御掉。**需修正**:把 vote 防御改为 `(!raw.vote && !raw.implicit)` 才拒绝。

- [ ] **Step 4: Fix recordFeedback to allow implicit-only samples**

回 `src/main/ai-feedback-store.js`,把 Task 1 的防御行:

```js
  if (!raw.feature || !raw.appName || !raw.vote || typeof raw.ts !== "number") {
    return list;
  }
```

改为:

```js
  if (!raw.feature || !raw.appName || typeof raw.ts !== "number") {
    return list;
  }
  if (!raw.vote && !raw.implicit) {
    return list; // 既无显式 vote 也无隐式信号, 无意义
  }
```

同步在 `tests/main/ai-feedback-store.test.js` 的 `recordFeedback` describe 里加一条:

```js
    it("仅 implicit 信号(vote=null)也能记录", () => {
      const out = recordFeedback([], { feature: "advice", appName: "X", version: "1", implicit: "refreshed", ts: 100 });
      expect(out).toHaveLength(1);
      expect(out[0].implicit).toBe("refreshed");
      expect(out[0].vote).toBeNull();
    });

    it("既无 vote 也无 implicit 拒绝", () => {
      const list = [{ id: "old", ts: 50 }];
      expect(recordFeedback(list, { feature: "advice", appName: "X", version: "1", ts: 100 })).toBe(list);
    });
```

- [ ] **Step 5: Run all A8 tests**

Run: `npx vitest run tests/main/ai-feedback-store.test.js tests/renderer/upgrade-advice-feedback.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/ai-feedback-store.js src/renderer/components/UpgradeAdvice.jsx tests/main/ai-feedback-store.test.js tests/renderer/upgrade-advice-feedback.test.jsx
git commit -m "feat(a8): force 刷新记录 implicit=refreshed 隐式信号"
```

---

## Task 8: Settings 反馈导出入口 + 全量回归

**Files:**
- Modify: Settings 组件(加"导出 AI 反馈样本"按钮)
- Test: 视 Settings 结构补一条

- [ ] **Step 1: Locate Settings component**

Run: `npx vitest run --reporter=verbose 2>/dev/null; ls src/renderer/components/ | grep -i setting`
或直接 Glob `src/renderer/components/*Setting*`,确认 Settings 组件文件名与结构。

- [ ] **Step 2: 加导出按钮(在 AI 相关设置区附近)**

在 Settings 里加一个按钮,点击调 `api.feedbackExport()`,拿到 samples 后用 `Blob` + `URL.createObjectURL` 触发下载 `pulse-ai-feedback.json`:

```jsx
  async function exportFeedback() {
    if (!api.feedbackExport) return;
    try {
      const r = await api.feedbackExport();
      if (!r || !r.ok) return;
      const blob = new Blob([JSON.stringify(r.samples, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pulse-ai-feedback.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    }
  }
```

按钮 JSX:
```jsx
<button type="button" class="settings-export-feedback" onClick={exportFeedback}>
  导出 AI 反馈样本 ({样本数})
</button>
```

> 样本数可在 Settings 挂载时调一次 `api.feedbackExport()` 取 length,或省略数字。

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: 全量 PASS(基线 ~2758 → 应新增约 16-18 条)

- [ ] **Step 4: Build check**

Run: `npm run build:renderer`
Expected: 构建成功

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ settings.css styles.css
git commit -m "feat(a8): Settings 反馈样本导出按钮 + 全量回归"
```

---

## Self-Review Notes

**Spec coverage (对照 v2 roadmap §6.2):**
- ✅ 渲染层 👍/👎:Task 5 (A2) + Task 6 (A1)
- ✅ 显式信号采集:Task 1-4 (store + IPC)
- ✅ 隐式信号:Task 7 (refreshed);upgraded/snoozed 明确留 v2(设计取舍已注明)
- ✅ 存储 state.json.aiFeedback LRU cap-500:Task 1-2
- ✅ 导出为 JSON:Task 8
- ✅ "为后续当 few-shot 源铺路":导出 JSON 格式即是

**已知边界:**
- 隐式 upgraded/snoozed 跨组件,本次只做 refreshed(A8 v2 候选)
- 反馈率可能极低(作者自用),但先建管道是正确顺序(roadmap §6.2 风险段已述)

**交叉点警告:** 本 plan 不改 `shared-llm.js` / `provider-cloud.js`,与 P71 plan 无文件冲突。两个 plan 可并行或任意顺序实施。
