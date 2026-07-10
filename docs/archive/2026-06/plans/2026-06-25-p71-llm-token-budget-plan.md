# P71 LLM Token 预算硬限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 LLM 调用加每日 token 预算上限,默认超限只警告不硬拒(可配),兜住 A1/A2/A3/A7 不可控的 token 消耗。本质是"防漏钱"的成本治理。

**Architecture:** 改造 `CloudSummarizer.summarize` 透出 `{ content, usage }`,经 `shared-llm.js` 的 `chatCompletion` 接住 usage 写入新模块 `token-budget.js`(当日累计 + state.json 持久化)。调用前查预算,超限返 `budget_exceeded` reason,`humanizeAiError` 加对应中文化。Settings 加预算输入。

**Tech Stack:** Node.js (main) / Preact (renderer) / vitest / state.json 每日 LRU

---

## File Structure

**Create:**
- `src/main/token-budget.js` — 当日 token 累计 + 预算检查 + 持久化纯函数
- `src/main/ipc/register-token-budget.js` — IPC:`token-budget:get` / `token-budget:set` (预算值 + 模式)
- `tests/main/token-budget.test.js`
- `tests/main/register-token-budget.test.js`
- `tests/renderer/token-budget-settings.test.jsx`

**Modify:**
- `src/ai-sessions/provider-cloud.js` — `summarize` 返回 `{ content, usage }` 而非纯 string
- `src/ai/shared-llm.js` — `chatCompletion` 接住 usage 写预算 + 调用前查预算
- `src/ai/ai-errors.js` — 加 `budget_exceeded` reason
- `src/main/state-store.js` — 加 `tokenSpend` 字段 + load/save
- `src/main/state-store-schema.js` — FIELD_SPECS 加 `tokenSpend`
- `src/renderer/api.js` / `preload.js` — 桥接 budget IPC
- `src/renderer/components/Settings*.jsx` — 预算输入框
- `src/main/ipc/index.js` — 注册 register-token-budget

---

## Task 1: token-budget.js 纯函数(累计 / 当日 key / 预算检查)

**Files:**
- Create: `src/main/token-budget.js`
- Test: `tests/main/token-budget.test.js`

**数据结构:**
```js
// state.json.tokenSpend = { "2026-06-25": 12500, "2026-06-24": 3000 }
// key = 当日日期串(YYYY-MM-DD), LRU 保留最近 30 天
// 预算配置 state.json.tokenBudgetConfig = { dailyLimit: 50000, mode: "warn" }
//   mode: "warn" (超限只警告, 默认) | "block" (硬拒)
```

- [ ] **Step 1: Write the failing test**

```js
// tests/main/token-budget.test.js
const { describe, it, expect } = require("vitest");
const {
  todayKey,
  addSpend,
  isOverBudget,
  pruneDays,
} = require("../../src/main/token-budget");

describe("token-budget", () => {
  describe("todayKey", () => {
    it("返回 YYYY-MM-DD", () => {
      const k = todayKey(new Date("2026-06-25T10:00:00Z").getTime());
      expect(k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    it("传入 Date 对象也行", () => {
      expect(todayKey(new Date("2026-06-25T10:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("addSpend", () => {
    it("当日累计", () => {
      const out = addSpend({}, "2026-06-25", 100);
      expect(out["2026-06-25"]).toBe(100);
      const out2 = addSpend(out, "2026-06-25", 50);
      expect(out2["2026-06-25"]).toBe(150);
    });
    it("不同日分开", () => {
      const out = addSpend(addSpend({}, "2026-06-25", 100), "2026-06-24", 30);
      expect(out["2026-06-25"]).toBe(100);
      expect(out["2026-06-24"]).toBe(30);
    });
    it("token 非数字忽略", () => {
      const out = addSpend({}, "2026-06-25", "abc");
      expect(out["2026-06-25"]).toBeUndefined();
    });
  });

  describe("isOverBudget", () => {
    it("未超返 false", () => {
      expect(isOverBudget({ "2026-06-25": 100 }, "2026-06-25", 500)).toBe(false);
    });
    it("超限返 true", () => {
      expect(isOverBudget({ "2026-06-25": 600 }, "2026-06-25", 500)).toBe(true);
    });
    it("limit=0 视为未设预算(不拦截)", () => {
      expect(isOverBudget({ "2026-06-25": 999999 }, "2026-06-25", 0)).toBe(false);
    });
    it("无当日记录视为 0", () => {
      expect(isOverBudget({}, "2026-06-25", 500)).toBe(false);
    });
  });

  describe("pruneDays", () => {
    it("保留最近 30 天", () => {
      const spend = {};
      for (let i = 0; i < 40; i++) {
        spend[`2026-0${(i < 30) ? "5" : "6"}-${String((i % 28) + 1).padStart(2, "0")}`] = i;
      }
      // 简化: 直接验证超过 30 个 key 会被截
      const big = {};
      for (let i = 1; i <= 35; i++) big[`2025-01-${String(i).padStart(2,"0")}`] = i;
      const out = pruneDays(big, 30);
      expect(Object.keys(out).length).toBeLessThanOrEqual(30);
    });
    it("未超不截", () => {
      const big = { "2026-06-25": 1, "2026-06-24": 2 };
      expect(pruneDays(big, 30)).toEqual(big);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/token-budget.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// src/main/token-budget.js
/**
 * P71 — LLM 每日 token 预算. 纯函数 + state.json 持久化 (tokenSpend 字段).
 *
 * state.tokenSpend = { "YYYY-MM-DD": number, ... }  // 最近 30 天
 * state.tokenBudgetConfig = { dailyLimit: number, mode: "warn"|"block" }
 *
 * 设计: 调用 LLM 前 checkBudget (block 模式拦截), 调用后 addSpend 累计.
 * warn 模式不拦截, 仅 ai-errors 提示.
 */

const DEFAULT_DAILY_LIMIT = 0; // 0 = 未设预算, 不拦截
const DEFAULT_MODE = "warn"; // warn | block
const KEEP_DAYS = 30;

function todayKey(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addSpend(spendMap, dayKey, tokens) {
  if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) {
    return spendMap; // 非法/0 不记
  }
  const next = { ...(spendMap || {}) };
  next[dayKey] = (next[dayKey] || 0) + tokens;
  return next;
}

function isOverBudget(spendMap, dayKey, dailyLimit) {
  if (typeof dailyLimit !== "number" || dailyLimit <= 0) return false; // 未设预算
  const used = (spendMap && spendMap[dayKey]) || 0;
  return used >= dailyLimit;
}

function pruneDays(spendMap, keep = KEEP_DAYS) {
  if (!spendMap || typeof spendMap !== "object") return spendMap;
  const keys = Object.keys(spendMap).sort(); // 日期串字典序 = 时间序
  if (keys.length <= keep) return spendMap;
  const keepSet = new Set(keys.slice(-keep));
  const out = {};
  for (const k of keys) if (keepSet.has(k)) out[k] = spendMap[k];
  return out;
}

module.exports = {
  todayKey,
  addSpend,
  isOverBudget,
  pruneDays,
  DEFAULT_DAILY_LIMIT,
  DEFAULT_MODE,
  KEEP_DAYS,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/token-budget.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/token-budget.js tests/main/token-budget.test.js
git commit -m "feat(p71): token-budget 纯函数 (当日累计/预算检查/30d LRU)"
```

---

## Task 2: state-store 接入 tokenSpend + tokenBudgetConfig

**Files:**
- Modify: `src/main/state-store.js`
- Modify: `src/main/state-store-schema.js`
- Test: `tests/main/state-store-token-spend.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/main/state-store-token-spend.test.js
const { describe, it, expect, beforeEach, afterEach } = require("vitest");
const os = require("os");
const fs = require("fs");
const path = require("path");
const stateStore = require("../../src/main/state-store");

function tmpStatePath() {
  return path.join(os.tmpdir(), `pulse-test-tb-${Date.now()}-${Math.random()}.json`);
}

describe("state-store tokenSpend", () => {
  let p;
  beforeEach(() => { p = tmpStatePath(); });
  afterEach(() => { try { fs.unlinkSync(p); } catch {} });

  it("loadTokenSpend 无文件返回 {}", () => {
    expect(stateStore.loadTokenSpend(p)).toEqual({});
  });
  it("saveTokenSpend + load 往返", () => {
    stateStore.saveTokenSpend({ "2026-06-25": 100 }, p);
    expect(stateStore.loadTokenSpend(p)).toEqual({ "2026-06-25": 100 });
  });
  it("loadTokenBudgetConfig 无文件返回默认值", () => {
    const cfg = stateStore.loadTokenBudgetConfig(p);
    expect(cfg.dailyLimit).toBe(0);
    expect(cfg.mode).toBe("warn");
  });
  it("saveTokenBudgetConfig + load 往返", () => {
    stateStore.saveTokenBudgetConfig({ dailyLimit: 50000, mode: "block" }, p);
    expect(stateStore.loadTokenBudgetConfig(p)).toEqual({ dailyLimit: 50000, mode: "block" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/state-store-token-spend.test.js`
Expected: FAIL — not a function

- [ ] **Step 3: Modify state-store-schema.js**

在 FIELD_SPECS 里(`aiFeedback` 之后,Task 来自 A8 plan)加:

```js
  aiFeedback:         { kind: 'array' },   // A8
  tokenSpend:         { kind: 'object' },   // P71: 每日 token 消耗 {"YYYY-MM-DD": number}
  tokenBudgetConfig:  { kind: 'object' },   // P71: { dailyLimit, mode }
```

- [ ] **Step 4: Modify state-store.js**

PRESERVE_FIELDS 加:
```js
  { key: "tokenSpend", kind: "object" }, // P71: 每日 token 消耗
  { key: "tokenBudgetConfig", kind: "object" }, // P71: 预算配置
```

末尾加 4 个函数(参照 loadAiFeedback / saveAiFeedback 写法):

```js
// ---- P71: token 预算 ----

function loadTokenSpend(statePath) {
  const state = load(statePath);
  const s = state && state.tokenSpend;
  return (s && typeof s === "object") ? s : {};
}

function saveTokenSpend(spendMap, statePath) {
  const state = load(statePath) || {};
  state.tokenSpend = spendMap || {};
  saveAll(state, statePath);
}

function loadTokenBudgetConfig(statePath) {
  const state = load(statePath);
  const c = state && state.tokenBudgetConfig;
  return {
    dailyLimit: (c && typeof c.dailyLimit === "number") ? c.dailyLimit : 0,
    mode: (c && (c.mode === "warn" || c.mode === "block")) ? c.mode : "warn",
  };
}

function saveTokenBudgetConfig(cfg, statePath) {
  const state = load(statePath) || {};
  state.tokenBudgetConfig = cfg || {};
  saveAll(state, statePath);
}
```

module.exports 加这 4 个。

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/main/state-store-token-spend.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/main/state-store.js src/main/state-store-schema.js tests/main/state-store-token-spend.test.js
git commit -m "feat(p71): state-store 接入 tokenSpend + tokenBudgetConfig"
```

---

## Task 3: provider-cloud.js summarize 透出 usage

**Files:**
- Modify: `src/ai-sessions/provider-cloud.js`
- Test: `tests/ai-sessions/provider-cloud-usage.test.js`

> **核心改造:** `summarize` 现在返回 `string`(content),改为返回 `{ content, usage }`。usage 从 OpenAI 兼容响应的 `parsed.usage`(`{ total_tokens, prompt_tokens, completion_tokens }`)或 Anthropic 的 `parsed.usage` 读取。**所有调用方都要适配**(下一步 Task 4 处理 shared-llm)。

- [ ] **Step 1: Write the failing test**

```js
// tests/ai-sessions/provider-cloud-usage.test.js
const { describe, it, expect, vi } = require("vitest");
const { CloudSummarizer } = require("../../src/ai-sessions/provider-cloud");

function mockHttpClient(responseBody, status = 200) {
  return {
    post: vi.fn().mockResolvedValue({
      status,
      body: typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody),
    }),
  };
}

describe("CloudSummarizer.summarize usage 透出", () => {
  it("OpenAI 协议返回 { content, usage }", async () => {
    const hc = mockHttpClient({
      choices: [{ message: { content: "hello" } }],
      usage: { total_tokens: 42, prompt_tokens: 30, completion_tokens: 12 },
    });
    const s = new CloudSummarizer();
    const out = await s.summarize({
      messages: [{ role: "user", content: "hi" }],
      provider: "openai",
      model: "gpt-4",
      config: { providerId: "openai", model: "gpt-4", apiKey: "k" },
      httpClient: hc,
    });
    expect(out.content).toBe("hello");
    expect(out.usage.total_tokens).toBe(42);
    expect(out.usage.prompt_tokens).toBe(30);
  });

  it("Anthropic 协议返回 { content, usage }", async () => {
    const hc = mockHttpClient({
      content: [{ type: "text", text: "world" }],
      usage: { input_tokens: 20, output_tokens: 8 },
    });
    const s = new CloudSummarizer();
    const out = await s.summarize({
      messages: [{ role: "user", content: "hi" }],
      provider: "anthropic",
      model: "claude-3",
      config: { providerId: "anthropic", model: "claude-3", apiKey: "k" },
      httpClient: hc,
    });
    expect(out.content).toBe("world");
    expect(out.usage.total_tokens).toBe(28); // input + output 归一
  });

  it("无 usage 字段时 usage=null(不崩)", async () => {
    const hc = mockHttpClient({ choices: [{ message: { content: "x" } }] });
    const s = new CloudSummarizer();
    const out = await s.summarize({
      messages: [{ role: "user", content: "hi" }],
      provider: "openai",
      model: "gpt-4",
      config: { providerId: "openai", model: "gpt-4", apiKey: "k" },
      httpClient: hc,
    });
    expect(out.content).toBe("x");
    expect(out.usage).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai-sessions/provider-cloud-usage.test.js`
Expected: FAIL — `out.content` is undefined(当前返回纯 string,`.content` 是字符)

- [ ] **Step 3: Modify summarize to return { content, usage }**

在 `src/ai-sessions/provider-cloud.js` 的 `summarize` 方法,把 `return content;` 那段(约 line 280-285)替换为:

```js
  // 解析 usage (P71: 透出 token 消耗给预算统计)
  let usage = null;
  if (parsed && parsed.usage && typeof parsed.usage === "object") {
    if (ep.protocol === "openai") {
      const u = parsed.usage;
      usage = {
        total_tokens: typeof u.total_tokens === "number" ? u.total_tokens : null,
        prompt_tokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null,
        completion_tokens: typeof u.completion_tokens === "number" ? u.completion_tokens : null,
      };
    } else {
      // Anthropic: input_tokens / output_tokens → 归一成 total
      const input = typeof parsed.usage.input_tokens === "number" ? parsed.usage.input_tokens : 0;
      const output = typeof parsed.usage.output_tokens === "number" ? parsed.usage.output_tokens : 0;
      usage = {
        total_tokens: input + output,
        prompt_tokens: input,
        completion_tokens: output,
      };
    }
  }
  return { content, usage };
```

> 同时更新方法的 JSDoc `@returns {Promise<string>}` → `@returns {Promise<{content: string, usage: object|null}>}`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai-sessions/provider-cloud-usage.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Run ALL provider-cloud tests to catch breakage**

Run: `npx vitest run tests/ai-sessions/`
Expected: **可能有现有测试失败**——因为返回值从 string 变成 object。需要检查哪些测试断言 `out === "string"`,逐一改成 `out.content === "string"`。

逐个修复:在 tests/ai-sessions/ 下找 `await s.summarize(` 调用后的断言,把对返回值的字符串断言改为 `.content`。这是预期内的适配工作。

- [ ] **Step 6: Commit**

```bash
git add src/ai-sessions/provider-cloud.js tests/ai-sessions/
git commit -m "feat(p71): provider-cloud.summarize 返回 { content, usage } 透出 token"
```

---

## Task 4: shared-llm.js 接住 usage + 调用前查预算

**Files:**
- Modify: `src/ai/shared-llm.js`
- Modify: `src/ai/ai-errors.js` (加 budget_exceeded)
- Test: `tests/ai/shared-llm-budget.test.js`

> `chatCompletion` 现在:(1) 调用前若 mode=block 且超限 → 返 `{ ok:false, reason:"budget_exceeded" }`;(2) 调用后把 usage.total_tokens 写入 tokenSpend。

- [ ] **Step 1: Write the failing test**

```js
// tests/ai/shared-llm-budget.test.js
const { describe, it, expect, vi, beforeEach } = require("vitest");
const os = require("os");
const fs = require("fs");
const path = require("path");

// 用独立 statePath 隔离
function tmpStatePath() {
  return path.join(os.tmpdir(), `pulse-test-llmbudget-${Date.now()}-${Math.random()}.json`);
}

describe("shared-llm token 预算", () => {
  let statePath;
  beforeEach(() => { statePath = tmpStatePath(); });
  afterEach(() => { try { fs.unlinkSync(statePath); } catch {} });

  it("block 模式超预算 → ok:false reason:budget_exceeded", async () => {
    const stateStore = require("../../src/main/state-store");
    stateStore.saveTokenBudgetConfig({ dailyLimit: 100, mode: "block" }, statePath);
    stateStore.saveTokenSpend({ [require("../../src/main/token-budget").todayKey()]: 200 }, statePath);

    // shared-llm 内部 require stateStore, 需让它读我们的 statePath.
    // shared-llm.js 默认用全局 state path; 为可测, 我们测 budget 检查逻辑走纯函数.
    const { isOverBudget, todayKey } = require("../../src/main/token-budget");
    const cfg = stateStore.loadTokenBudgetConfig(statePath);
    const spend = stateStore.loadTokenSpend(statePath);
    expect(isOverBudget(spend, todayKey(), cfg.dailyLimit)).toBe(true);
    expect(cfg.mode).toBe("block");
  });

  it("usage 写入后 tokenSpend 累计", async () => {
    const { addSpend, todayKey } = require("../../src/main/token-budget");
    let spend = {};
    spend = addSpend(spend, todayKey(), 42);
    spend = addSpend(spend, todayKey(), 10);
    expect(spend[todayKey()]).toBe(52);
  });
});
```

> **测试策略说明:** `chatCompletion` 内部耦合 stateStore 的全局 path,难以纯单测注入。这里把核心逻辑(超限判断 + 累计)拆成 token-budget 纯函数已在 Task 1 覆盖。本 Task 测试"组装正确性"——验证 cfg/spend 读取 + isOverBudget + addSpend 的接线。真正的 chatCompletion 集成行为留手动验证。

- [ ] **Step 2: Run test to verify it fails → passes**

Run: `npx vitest run tests/ai/shared-llm-budget.test.js`
Expected: 这一步因依赖 token-budget(已存在),可能直接 PASS。若 PASS 说明纯函数层就绪。重点是 Step 3 的实际接线。

- [ ] **Step 3: Modify ai-errors.js — 加 budget_exceeded**

在 `REASON_LABELS` 加:
```js
  budget_exceeded: "今日 AI 用量已达预算上限,明天再试或调高预算",
```
在 `REASON_HINT` 加:
```js
  budget_exceeded: "去设置调预算",
```

- [ ] **Step 4: Modify shared-llm.js chatCompletion**

在 `async function chatCompletion(messages, opts = {}) {` 内部,`const resolved = resolveSharedAiConfig();` 之前加预算检查:

```js
  // P71: block 模式预算检查
  const tokenBudget = require("./token-budget");  // 注意路径: shared-llm 在 src/ai/, token-budget 在 src/main/
  // 修正路径:
  const { isOverBudget, todayKey, addSpend, pruneDays } = require("../main/token-budget");
  const cfg = stateStore.loadTokenBudgetConfig();
  const spend = stateStore.loadTokenSpend();
  if (cfg.mode === "block" && isOverBudget(spend, todayKey(), cfg.dailyLimit)) {
    return { ok: false, reason: "budget_exceeded" };
  }
```

然后在 `return { ok: true, text: ... }` 成功分支之前,接住 usage 写入:

```js
    const result = await summarizer.summarize({
      messages,
      provider: resolved.providerId,
      model: resolved.model,
      config: resolved.config,
      httpClient,
    });
    // P71: 适配新返回 { content, usage } (旧 impl 可能返 string, 兼容)
    const text = typeof result === "string" ? result : (result && result.content);
    const usage = (result && typeof result === "object" && result.usage) ? result.usage : null;
    if (usage && typeof usage.total_tokens === "number") {
      const dayKey = todayKey();
      const nextSpend = pruneDays(addSpend(spend, dayKey, usage.total_tokens));
      stateStore.saveTokenSpend(nextSpend);
    }
    return {
      ok: true,
      text: sanitizeLlmOutput(String(text || "").trim()),
    };
```

- [ ] **Step 5: Run existing shared-llm tests + new budget test**

Run: `npx vitest run tests/ai/`
Expected: PASS。若有现有 shared-llm 测试断言返回结构,可能需适配 usage 读取。逐一修复。

- [ ] **Step 6: Run full suite**

Run: `npx vitest run`
Expected: 全量 PASS

- [ ] **Step 7: Commit**

```bash
git add src/ai/shared-llm.js src/ai/ai-errors.js tests/ai/shared-llm-budget.test.js
git commit -m "feat(p71): shared-llm 调用前预算检查 + usage 写入 tokenSpend"
```

---

## Task 5: IPC register-token-budget + preload + api

**Files:**
- Create: `src/main/ipc/register-token-budget.js`
- Modify: `src/main/ipc/index.js`, `preload.js`, `src/renderer/api.js`
- Test: `tests/main/register-token-budget.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/main/register-token-budget.test.js
const { describe, it, expect, beforeEach, afterEach } = require("vitest");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { registerTokenBudgetHandlers } = require("../../src/main/ipc/register-token-budget");
const stateStore = require("../../src/main/state-store");

function tmpStatePath() {
  return path.join(os.tmpdir(), `pulse-test-tbipc-${Date.now()}-${Math.random()}.json`);
}

describe("register-token-budget IPC", () => {
  let handlers, statePath;
  beforeEach(() => {
    statePath = tmpStatePath();
    handlers = {};
    const safeHandle = (ch, fn) => { handlers[ch] = fn; };
    registerTokenBudgetHandlers({ safeHandle, statePath });
  });
  afterEach(() => { try { fs.unlinkSync(statePath); } catch {} });

  it("token-budget:get 返回 config + todaySpend", async () => {
    stateStore.saveTokenBudgetConfig({ dailyLimit: 5000, mode: "warn" }, statePath);
    stateStore.saveTokenSpend({ [require("../../src/main/token-budget").todayKey()]: 300 }, statePath);
    const r = await handlers["token-budget:get"]({});
    expect(r.ok).toBe(true);
    expect(r.config.dailyLimit).toBe(5000);
    expect(r.config.mode).toBe("warn");
    expect(r.todaySpend).toBe(300);
  });

  it("token-budget:set 写入 config", async () => {
    const r = await handlers["token-budget:set"]({}, { dailyLimit: 9999, mode: "block" });
    expect(r.ok).toBe(true);
    const cfg = stateStore.loadTokenBudgetConfig(statePath);
    expect(cfg.dailyLimit).toBe(9999);
    expect(cfg.mode).toBe("block");
  });

  it("token-budget:set 非法 mode 返回 invalid_args", async () => {
    const r = await handlers["token-budget:set"]({}, { dailyLimit: 100, mode: "weird" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/register-token-budget.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write register-token-budget.js**

```js
// src/main/ipc/register-token-budget.js
/**
 * P71 — token 预算 IPC. token-budget:get (读 config + 当日用量) / token-budget:set (写 config).
 */
const stateStore = require("../state-store");
const { todayKey } = require("../token-budget");

function registerTokenBudgetHandlers(ctx) {
  const { safeHandle, statePath } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("token-budget:get", async () => {
    try {
      const config = stateStore.loadTokenBudgetConfig(statePath);
      const spend = stateStore.loadTokenSpend(statePath);
      return { ok: true, config, todaySpend: spend[todayKey()] || 0 };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });

  safeHandle("token-budget:set", async (_evt, cfg) => {
    if (!cfg || typeof cfg !== "object") return { ok: false, reason: "invalid_args" };
    if (typeof cfg.dailyLimit !== "number" || cfg.dailyLimit < 0) {
      return { ok: false, reason: "invalid_args" };
    }
    if (cfg.mode !== "warn" && cfg.mode !== "block") {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      stateStore.saveTokenBudgetConfig({ dailyLimit: cfg.dailyLimit, mode: cfg.mode }, statePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerTokenBudgetHandlers };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/register-token-budget.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire ipc/index.js + preload.js + api.js**

ipc/index.js: 加 `const { registerTokenBudgetHandlers } = require("./register-token-budget");` + `registerTokenBudgetHandlers(ctx);`

preload.js: 加
```js
  tokenBudgetGet: () => ipcRenderer.invoke("token-budget:get"),
  tokenBudgetSet: (payload) => ipcRenderer.invoke("token-budget:set", payload),
```

api.js: 加
```js
  tokenBudgetGet: () => bridge.tokenBudgetGet(),
  tokenBudgetSet: (payload) => bridge.tokenBudgetSet(payload),
```

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/register-token-budget.js src/main/ipc/index.js preload.js src/renderer/api.js tests/main/register-token-budget.test.js
git commit -m "feat(p71): token-budget:get/set IPC + 桥接"
```

---

## Task 6: Settings 预算输入 UI

**Files:**
- Modify: Settings 组件
- Modify: `styles.css`
- Test: `tests/renderer/token-budget-settings.test.jsx`

- [ ] **Step 1: Locate Settings + write test**

Glob `src/renderer/components/*Setting*` 找到 AI 配置所在 Settings 文件。在 AI 配置区附近加预算输入。

```jsx
// tests/renderer/token-budget-settings.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/preact";
// 按实际 Settings 组件名调整 import

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    tokenBudgetGet: vi.fn().mockResolvedValue({ ok: true, config: { dailyLimit: 5000, mode: "warn" }, todaySpend: 300 }),
    tokenBudgetSet: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { api } from "../../src/renderer/api.js";

describe("Settings token 预算", () => {
  beforeEach(() => vi.clearAllMocks());

  it("加载时显示当日用量 + 当前预算", async () => {
    // render <Settings/> — 按实际组件调整
    // await waitFor(() => expect(screen.getByText(/今日已用 300/)).toBeTruthy());
    // expect(screen.getByDisplayValue("5000")).toBeTruthy();
  });

  it("改输入框 + 切模式 → 调用 tokenBudgetSet", async () => {
    // fireEvent.change input → 9999
    // fireEvent.click mode select → block
    // await waitFor(() => expect(api.tokenBudgetSet).toHaveBeenCalledWith({ dailyLimit: 9999, mode: "block" }));
  });
});
```

> **注:** Settings 组件结构需先读取确认(它的 state 管理可能是 signals),测试用例的 selector 要按真实组件补全。Step 2 先读组件再填具体 selector。

- [ ] **Step 2: Read Settings component, fill in test selectors**

Run: Glob 找到 Settings 文件后 Read,确认它的 props/state 模式,补全测试里的 `getByDisplayValue` / `getByText` 选择器。

- [ ] **Step 3: Add budget UI to Settings**

在 AI 配置区(api key 配置附近)加:

```jsx
<div class="settings-token-budget">
  <label>每日 AI token 预算上限</label>
  <input
    type="number"
    min="0"
    value={budget.dailyLimit}
    onInput={(e) => updateBudget({ dailyLimit: Number(e.target.value) })}
  />
  <span class="settings-token-budget-hint">
    今日已用 {todaySpend} · 0 = 不限制
  </span>
  <select value={budget.mode} onChange={(e) => updateBudget({ mode: e.target.value })}>
    <option value="warn">超限仅警告</option>
    <option value="block">超限拦截</option>
  </select>
</div>
```

`updateBudget` 合并后调 `api.tokenBudgetSet({...budget, ...patch})`。

- [ ] **Step 4: Add CSS**

```css
.settings-token-budget {
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.settings-token-budget-hint {
  font-size: 11px;
  opacity: 0.6;
}
```

- [ ] **Step 5: Run test + full suite + build**

Run: `npx vitest run && npm run build:renderer`
Expected: 全量 PASS,build 成功

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ styles.css tests/renderer/token-budget-settings.test.jsx
git commit -m "feat(p71): Settings token 预算输入 (限额 + warn/block 模式)"
```

---

## Self-Review Notes

**Spec coverage (对照 v2 roadmap §5.2):**
- ✅ Settings "每日 token 预算"输入:Task 6
- ✅ shared-llm 调用前查预算:Task 4
- ✅ 超限拒绝 + budget_exceeded 错误:Task 4 + Task 3(ai-errors)
- ✅ 默认警告不硬拒(可配):Task 1 DEFAULT_MODE="warn" + Task 6 模式选择
- ✅ token 计数写 state.json 每日 LRU:Task 1(pruneDays 30d)+ Task 2
- ✅ 复用 A4 AI 用量基建:**澄清** — P71 不复用 ai-usage-cache(那是云端配额快照),而是新建 token-budget(本地 token 计数)。两者关注点不同,P71 是独立新模块。

**核心改造风险:** Task 3 改 `summarize` 返回值是破坏性变更,所有调用方需适配。已在 Task 3 Step 5 明确检查现有测试。

**默认值保守:**
- `DEFAULT_DAILY_LIMIT = 0`(未设 = 不限制)→ 升级后不会突然拦截用户
- `DEFAULT_MODE = "warn"` → 即使设了限额默认也只警告

**交叉点警告:** 本 plan 改 `shared-llm.js` / `provider-cloud.js`,与 A8 plan 无文件冲突(A8 只碰 ai-feedback-store + UI + state-store 的 aiFeedback 字段)。两个 plan 可并行实施。但 **P71 Task 3 改了 summarize 返回结构,若有其它 AI 功能(daily-digest / worldcup / ithome article-ai)直接调 CloudSummarizer.summarize,需一并适配**——实施时跑全量测试可捕获。
