# A7 — AI Prompt 模板化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 3 个 AI prompt(ithome 摘要 + worldcup 赛前/赛后)从硬编码提取到 `state.json.ai_prompts`,Settings 加面板可编辑。默认值 = 当前硬编码原值,零行为变化。

**Architecture:** 5 层:①state-store load/save + schema → ②prompt-registry 注册中心(DEFAULT_PROMPTS + resolvePrompt) → ③article-ai/match-ai 改用 resolvePrompt → ④IPC load/save + preload → ⑤PromptSettings UI。

**Tech Stack:** Node fs + state-store patchState(main) / Preact signals(renderer) / vitest(forks)

**Spec:** `docs/superpowers/specs/2026-06-24-a7-prompt-templating-design.md`

---

## File Structure

| 文件 | 改动 | 职责 |
| ---- | ---- | ---- |
| `src/ai/prompt-registry.js` | 新建 | 3 prompt 默认值 + resolvePrompt |
| `src/main/state-store.js` | 修改 | loadAiPrompts/saveAiPrompts + PRESERVE_FIELDS + exports |
| `src/main/ithome/article-ai.js` | 修改 | buildMessages 用 resolvePrompt,删 OUTPUT_RULES |
| `src/main/worldcup/match-ai.js` | 修改 | buildPreMatchPrompt/buildPostMatchPrompt 用 resolvePrompt,删 OUTPUT_RULES |
| `src/main/ipc/register-ai-prompts.js` | 新建 | ai-prompts:load / save handler |
| `src/main/ipc/index.js` | 修改 | 注册 registerAiPromptsHandlers |
| `preload.js` | 修改 | aiPromptsLoad/Save/onUpdated 桥接 |
| `src/renderer/api.js` | 修改 | createApi 加 3 个方法 |
| `src/renderer/store/prompt-store.js` | 新建 | aiPrompts signal + load/save actions |
| `src/renderer/components/PromptSettings.jsx` | 新建 | 3 section × 2 textarea 编辑面板 |
| `src/renderer/components/AITasksDrawer.jsx` | 修改 | 挂 PromptSettings |

**测试:**
- `tests/main/prompt-registry.test.js` (新建)
- `tests/main/state-store-ai-prompts.test.js` (新建)
- `tests/main/register-ai-prompts-ipc.test.js` (新建)
- `tests/renderer/prompt-settings.test.jsx` (新建)
- `tests/main/ithome/article-ai.test.js` (现有,加 resolvePrompt 后 snapshot 不回归)
- `tests/main/worldcup/match-ai.test.js` (现有,加 resolvePrompt 后 snapshot 不回归)

---

## Task 1: prompt-registry.js 注册中心 (TDD)

**Files:**
- Create: `src/ai/prompt-registry.js`
- Test: `tests/main/prompt-registry.test.js`

- [ ] **Step 1: 新建测试文件**

新建 `tests/main/prompt-registry.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

// mock state-store 的 loadAiPrompts, 测试 resolvePrompt 的 fallback 逻辑
const mockLoadAiPrompts = vi.fn(() => ({}));
vi.mock("../../src/main/state-store.js", () => ({
  loadAiPrompts: () => mockLoadAiPrompts(),
}));

const { DEFAULT_PROMPTS, resolvePrompt, PROMPT_KEYS } = await import(
  "../../src/ai/prompt-registry.js"
);

beforeEach(() => {
  mockLoadAiPrompts.mockReturnValue({});
});

describe("prompt-registry (A7)", () => {
  it("PROMPT_KEYS 含 3 个 prompt", () => {
    expect(PROMPT_KEYS).toEqual(
      expect.arrayContaining([
        "ithome_summary",
        "worldcup_prematch",
        "worldcup_postmatch",
      ]),
    );
    expect(PROMPT_KEYS).toHaveLength(3);
  });

  it("DEFAULT_PROMPTS 每个 prompt 有 system + rules", () => {
    for (const key of PROMPT_KEYS) {
      const p = DEFAULT_PROMPTS[key];
      expect(typeof p.system).toBe("string");
      expect(p.system.length).toBeGreaterThan(0);
      expect(typeof p.rules).toBe("string");
      expect(p.rules.length).toBeGreaterThan(0);
    }
  });

  it("resolvePrompt 无用户配置 → 返默认值", () => {
    const p = resolvePrompt("ithome_summary");
    expect(p.system).toBe(DEFAULT_PROMPTS.ithome_summary.system);
    expect(p.rules).toBe(DEFAULT_PROMPTS.ithome_summary.rules);
  });

  it("resolvePrompt 有用户配置 → 返用户值", () => {
    mockLoadAiPrompts.mockReturnValue({
      ithome_summary: { system: "自定义角色", rules: "自定义规则" },
    });
    const p = resolvePrompt("ithome_summary");
    expect(p.system).toBe("自定义角色");
    expect(p.rules).toBe("自定义规则");
  });

  it("resolvePrompt 用户配置 system 为空 → 回退默认(整体替换语义)", () => {
    mockLoadAiPrompts.mockReturnValue({
      ithome_summary: { system: "", rules: "只剩 rules" },
    });
    const p = resolvePrompt("ithome_summary");
    expect(p.system).toBe(DEFAULT_PROMPTS.ithome_summary.system);
    expect(p.rules).toBe(DEFAULT_PROMPTS.ithome_summary.rules);
  });

  it("resolvePrompt 未知 key → throw", () => {
    expect(() => resolvePrompt("nonexistent")).toThrow();
  });

  it("DEFAULT_PROMPTS.ithome_summary.system 含「科技新闻编辑」", () => {
    expect(DEFAULT_PROMPTS.ithome_summary.system).toContain("科技新闻编辑");
  });

  it("DEFAULT_PROMPTS.worldcup_prematch.system 含「足球分析师」", () => {
    expect(DEFAULT_PROMPTS.worldcup_prematch.system).toContain("足球分析师");
  });

  it("DEFAULT_PROMPTS.worldcup_postmatch.system 含「足球评论员」", () => {
    expect(DEFAULT_PROMPTS.worldcup_postmatch.system).toContain("足球评论员");
  });
});
```

- [ ] **Step 2: 跑测试,确认失败 (模块不存在)**

Run: `npx vitest run tests/main/prompt-registry.test.js`
Expected: FAIL — `Cannot find module .../prompt-registry.js`

- [ ] **Step 3: 新建 prompt-registry.js**

新建 `src/ai/prompt-registry.js`。**默认值必须和当前硬编码一字不差**(从 article-ai.js / match-ai.js 原样搬)。

```js
/**
 * src/ai/prompt-registry.js
 *
 * AI prompt 注册中心 — 3 个 prompt(ithome 摘要 + worldcup 赛前/赛后)。
 * 默认值 = 此前硬编码原值(零行为变化); 用户可在 Settings 改。
 * 存储: state.json.ai_prompts (state-store.loadAiPrompts/saveAiPrompts)。
 *
 * worldcup 的"内容指引"(分三段...) 并入 system 字段(本就是角色描述一部分)。
 */

const stateStore = require("../main/state-store");

const DEFAULT_PROMPTS = {
  ithome_summary: {
    system: "你是科技新闻编辑，擅长把 IT 资讯浓缩成清晰的中文摘要。",
    rules: [
      "【硬性要求】",
      "1. 全文必须使用简体中文。",
      "2. 只输出给用户看的正文，禁止思考过程或 XML/HTML 标签。",
      "3. 严格按以下四行格式输出（每行一项，行首为固定标签，不要编号列表）：",
      "摘要：<80–150 字，概括核心事实与背景>",
      "关键词：<3–5 个词，用顿号分隔>",
      "所属领域：<如 消费电子、人工智能、政策监管、游戏 等>",
      "影响方面：<说明可能影响的用户群体、行业或产品方向>",
    ].join("\n"),
  },
  worldcup_prematch: {
    system: [
      "你是资深足球分析师。用简体中文写赛前预测，语气专业但易懂，200–350 字。",
      "分三段：对阵看点、关键球员/战术、预测比分与理由。不要编造具体伤病除非用户数据里有。",
    ].join("\n"),
    rules: [
      "【硬性要求】",
      "1. 全文必须使用简体中文，禁止英文段落。",
      "2. 只输出给用户看的正文，禁止输出思考过程、分析步骤、XML/HTML 标签。",
      "3. 禁止输出思考过程或任何 XML 标签，只写正文。",
      "4. 直接开始写正文，不要前言或元说明。",
    ].join("\n"),
  },
  worldcup_postmatch: {
    system: [
      "你是资深足球评论员。用简体中文写赛后总结，250–400 字。",
      "包含：比赛进程、进球/关键瞬间解读、双方表现评价、出线或晋级影响（如适用）。",
      "基于给定比分与进球者，不要编造未提供的进球。",
    ].join("\n"),
    rules: [
      "【硬性要求】",
      "1. 全文必须使用简体中文，禁止英文段落。",
      "2. 只输出给用户看的正文，禁止输出思考过程、分析步骤、XML/HTML 标签。",
      "3. 禁止输出思考过程或任何 XML 标签，只写正文。",
      "4. 直接开始写正文，不要前言或元说明。",
    ].join("\n"),
  },
};

const PROMPT_KEYS = Object.keys(DEFAULT_PROMPTS);

/**
 * 解析某个 prompt: 有用户配置(且 system 非空)用配置, 否则用默认.
 * 整体替换语义: 用户配了该 key 就用 {system, rules} 整体,
 * 不做 system/rules 分别 fallback (避免混搭).
 * @param {string} key  prompt id
 * @returns {{ system: string, rules: string }}
 */
function resolvePrompt(key) {
  const def = DEFAULT_PROMPTS[key];
  if (!def) throw new Error(`unknown prompt key: ${key}`);
  const userPrompts = stateStore.loadAiPrompts();
  const user = userPrompts && userPrompts[key];
  if (
    user &&
    typeof user.system === "string" &&
    typeof user.rules === "string" &&
    (user.system.trim() || user.rules.trim())
  ) {
    return { system: user.system, rules: user.rules };
  }
  return { system: def.system, rules: def.rules };
}

module.exports = { DEFAULT_PROMPTS, resolvePrompt, PROMPT_KEYS };
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/main/prompt-registry.test.js`
Expected: PASS (9 case 全绿)

- [ ] **Step 5: Commit**

```bash
git add src/ai/prompt-registry.js tests/main/prompt-registry.test.js
git commit -m "feat(a7): prompt-registry 注册中心 (3 prompt 默认值 + resolvePrompt)

ithome_summary + worldcup_prematch/postmatch. 默认值=当前硬编码原值.
resolvePrompt: 有用户配置(system 非空)用配置, 否则默认 (整体替换语义)."
```

---

## Task 2: state-store load/save ai_prompts + schema (TDD)

**Files:**
- Modify: `src/main/state-store.js`
- Test: `tests/main/state-store-ai-prompts.test.js` (新建)

- [ ] **Step 1: 新建测试文件**

新建 `tests/main/state-store-ai-prompts.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tmpFile;
beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `pulse-a7-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
});
afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
});

const { initStateStorePaths, loadAiPrompts, saveAiPrompts, saveOne } = await import(
  "../../src/main/state-store.js"
);

beforeEach(() => {
  initStateStorePaths({ statePath: tmpFile });
});

describe("state-store ai_prompts (A7)", () => {
  it("loadAiPrompts 无字段 → {}", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, apps: {} }));
    expect(loadAiPrompts(tmpFile)).toEqual({});
  });

  it("saveAiPrompts 写入 + loadAiPrompts 读回", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ v: 1, apps: { A: { installed: "1" } } }));
    saveAiPrompts({ ithome_summary: { system: "x", rules: "y" } }, tmpFile);
    expect(loadAiPrompts(tmpFile)).toEqual({ ithome_summary: { system: "x", rules: "y" } });
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.apps.A.installed).toBe("1");
  });

  it("forward compat: saveOne 保留 ai_prompts (PRESERVE_FIELDS)", () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ v: 1, apps: {}, ai_prompts: { ithome_summary: { system: "保留", rules: "r" } } }),
    );
    saveOne({ name: "Z", installed_version: "2.0", has_update: false }, tmpFile);
    const after = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(after.ai_prompts.ithome_summary.system).toBe("保留");
  });

  it("saveAiPrompts 无效参数 → throw", () => {
    expect(() => saveAiPrompts(null, tmpFile)).toThrow();
    expect(() => saveAiPrompts([], tmpFile)).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/main/state-store-ai-prompts.test.js`
Expected: FAIL — `loadAiPrompts is not a function`

- [ ] **Step 3: 改 state-store.js**

**(a)** PRESERVE_FIELDS 加一行(在 `wechat_hot` 之后):
找到:
```js
  { key: "wechat_hot", kind: "object", notArray: true },          // I6 v2: ...
```
后面加:
```js
  { key: "wechat_hot", kind: "object", notArray: true },          // I6 v2: { readIds: { title: readAt } } — wechat-hot 已读词
  { key: "ai_prompts", kind: "object", notArray: true },           // A7: { promptId: { system, rules } } — 用户自定义 AI prompt
```

**(b)** 加 load/save 函数(在 loadWechatHotRead/saveWechatHotRead 之后):
```js
// ─── A7: AI prompt 模板化 ────────────────────────────────────

/**
 * 读 ai_prompts. 老 state.json 无该字段 → {} (兼容).
 * @param {string} [statePath]
 * @returns {Record<string, {system: string, rules: string}>}
 */
function loadAiPrompts(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s || !s.ai_prompts || typeof s.ai_prompts !== "object") return {};
  return s.ai_prompts;
}

/**
 * 写 ai_prompts. atomic write, 保留所有其它字段.
 * @param {Record<string, {system: string, rules: string}>} prompts
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveAiPrompts(prompts, statePath = defaultPath()) {
  if (!prompts || typeof prompts !== "object" || Array.isArray(prompts)) {
    throw new TypeError("saveAiPrompts: prompts must be plain object");
  }
  return patchState((next) => {
    next.ai_prompts = prompts;
  }, statePath);
}
```

**(c)** module.exports 加 `loadAiPrompts`, `saveAiPrompts`(在 `saveWechatHotRead` 之后)。

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/main/state-store-ai-prompts.test.js`
Expected: PASS (4 case 全绿)

- [ ] **Step 5: Commit**

```bash
git add src/main/state-store.js tests/main/state-store-ai-prompts.test.js
git commit -m "feat(a7): state-store load/save ai_prompts + schema

PRESERVE_FIELDS 注册 ai_prompts (forward compat).
仿 loadWechatHotRead/saveWechatHotRead 模式."
```

---

## Task 3: article-ai + match-ai 改用 resolvePrompt

**Files:**
- Modify: `src/main/ithome/article-ai.js`
- Modify: `src/main/worldcup/match-ai.js`
- Test: 现有 `tests/main/ithome/article-ai.test.js` + `tests/main/worldcup/match-ai.test.js`(验证不回归)

- [ ] **Step 1: 改 article-ai.js**

**(a)** 顶部 require 加 prompt-registry。找到:
```js
const { chatCompletion } = require("../../ai/shared-llm");
```
后面加:
```js
const { resolvePrompt } = require("../../ai/prompt-registry");
```

**(b)** 删除 `OUTPUT_RULES` 常量(第 24-33 行整块删)。

**(c)** buildMessages 内 system content 改用 resolvePrompt。找到:
```js
  return [
    {
      role: "system",
      content: [
        "你是科技新闻编辑，擅长把 IT 资讯浓缩成清晰的中文摘要。",
        OUTPUT_RULES,
      ].join("\n"),
    },
```
改为:
```js
  const prompt = resolvePrompt("ithome_summary");
  return [
    {
      role: "system",
      content: `${prompt.system}\n${prompt.rules}`,
    },
```

- [ ] **Step 2: 改 match-ai.js**

**(a)** 顶部 require 加:
```js
const { resolvePrompt } = require("../../ai/prompt-registry");
```
(紧跟现有 `const { chatCompletion } = ...` 之后)

**(b)** 删除 `OUTPUT_RULES` 常量(第 27-33 行整块删)。

**(c)** buildPreMatchPrompt 内 system 改用 resolvePrompt。找到:
```js
  return [
    {
      role: "system",
      content: [
        "你是资深足球分析师。用简体中文写赛前预测，语气专业但易懂，200–350 字。",
        "分三段：对阵看点、关键球员/战术、预测比分与理由。不要编造具体伤病除非用户数据里有。",
        OUTPUT_RULES,
      ].join("\n"),
    },
```
改为:
```js
  const prompt = resolvePrompt("worldcup_prematch");
  return [
    {
      role: "system",
      content: `${prompt.system}\n${prompt.rules}`,
    },
```

**(d)** buildPostMatchPrompt 内 system 同理。找到:
```js
  return [
    {
      role: "system",
      content: [
        "你是资深足球评论员。用简体中文写赛后总结，250–400 字。",
        "包含：比赛进程、进球/关键瞬间解读、双方表现评价、出线或晋级影响（如适用）。",
        "基于给定比分与进球者，不要编造未提供的进球。",
        OUTPUT_RULES,
      ].join("\n"),
    },
```
改为:
```js
  const prompt = resolvePrompt("worldcup_postmatch");
  return [
    {
      role: "system",
      content: `${prompt.system}\n${prompt.rules}`,
    },
```

- [ ] **Step 3: 跑现有测试确认不回归(关键 — 验证默认值零变化)**

Run: `npx vitest run tests/main/ithome/ tests/main/worldcup/ 2>&1 | tail -6`
Expected: PASS (article-ai / match-ai 现有测试全绿, 证明默认 prompt 下 messages 结构不变)

> 若有失败:检查 DEFAULT_PROMPTS 默认值是否和原硬编码一字不差(尤其 worldcup 的换行/标点)。

- [ ] **Step 4: Commit**

```bash
git add src/main/ithome/article-ai.js src/main/worldcup/match-ai.js
git commit -m "refactor(a7): article-ai + match-ai 改用 resolvePrompt

删硬编码 OUTPUT_RULES, buildMessages 走 prompt-registry.resolvePrompt.
默认 prompt 下 messages 结构不变 (现有测试验证)."
```

---

## Task 4: IPC handlers + preload + api.js

**Files:**
- Create: `src/main/ipc/register-ai-prompts.js`
- Modify: `src/main/ipc/index.js`
- Modify: `preload.js`
- Modify: `src/renderer/api.js`
- Test: `tests/main/register-ai-prompts-ipc.test.js` (新建)

- [ ] **Step 1: 新建测试文件**

新建 `tests/main/register-ai-prompts-ipc.test.js`(仿 wechat-hot IPC 测试的 require.cache stub 模式):

```js
import { describe, it, expect, beforeEach, vi } from "vitest";

const stateStorePath = require.resolve("../../src/main/state-store.js");
const registryPath = require.resolve("../../src/ai/prompt-registry.js");
const registerPath = require.resolve("../../src/main/ipc/register-ai-prompts.js");

const loadAiPrompts = vi.fn(() => ({}));
const saveAiPrompts = vi.fn();
const DEFAULT_PROMPTS = {
  ithome_summary: { system: "默认sys", rules: "默认rules" },
};
const PROMPT_KEYS = ["ithome_summary"];

function stubModules() {
  vi.resetModules();
  require.cache[stateStorePath] = {
    id: stateStorePath, filename: stateStorePath, loaded: true,
    exports: { loadAiPrompts, saveAiPrompts },
  };
  require.cache[registryPath] = {
    id: registryPath, filename: registryPath, loaded: true,
    exports: { DEFAULT_PROMPTS, PROMPT_KEYS, resolvePrompt: () => DEFAULT_PROMPTS.ithome_summary },
  };
}

beforeEach(() => {
  loadAiPrompts.mockReturnValue({});
  saveAiPrompts.mockReset();
  stubModules();
});

describe("register-ai-prompts IPC (A7)", () => {
  function getHandlers() {
    const handlers = {};
    const safeHandle = vi.fn((ch, fn) => { handlers[ch] = fn; });
    const sendToRenderer = vi.fn();
    const { registerAiPromptsHandlers } = require(registerPath);
    registerAiPromptsHandlers({ safeHandle, sendToRenderer });
    return { handlers, sendToRenderer };
  }

  it("注册 ai-prompts:load + ai-prompts:save", () => {
    const { handlers } = getHandlers();
    expect(typeof handlers["ai-prompts:load"]).toBe("function");
    expect(typeof handlers["ai-prompts:save"]).toBe("function");
  });

  it("load 合并默认+用户, 标记 isDefault", () => {
    loadAiPrompts.mockReturnValue({});
    const { handlers } = getHandlers();
    const r = handlers["ai-prompts:load"]();
    expect(r.ithome_summary.system).toBe("默认sys");
    expect(r.ithome_summary.isDefault).toBe(true);
  });

  it("load 用户配置覆盖默认, isDefault=false", () => {
    loadAiPrompts.mockReturnValue({
      ithome_summary: { system: "自定义", rules: "r" },
    });
    const { handlers } = getHandlers();
    const r = handlers["ai-prompts:load"]();
    expect(r.ithome_summary.system).toBe("自定义");
    expect(r.ithome_summary.isDefault).toBe(false);
  });

  it("save 调 stateStore.saveAiPrompts + broadcast", () => {
    const { handlers, sendToRenderer } = getHandlers();
    const r = handlers["ai-prompts:save"]({}, { ithome_summary: { system: "x", rules: "y" } });
    expect(saveAiPrompts).toHaveBeenCalledWith({ ithome_summary: { system: "x", rules: "y" } });
    expect(sendToRenderer).toHaveBeenCalledWith("ai-prompts-updated", {});
    expect(r.ok).toBe(true);
  });

  it("save 无效参数 → invalid_args", () => {
    const { handlers } = getHandlers();
    const r = handlers["ai-prompts:save"]({}, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_args");
  });
});
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `npx vitest run tests/main/register-ai-prompts-ipc.test.js`
Expected: FAIL — handler 未注册

- [ ] **Step 3: 新建 register-ai-prompts.js**

新建 `src/main/ipc/register-ai-prompts.js`:

```js
/**
 * src/main/ipc/register-ai-prompts.js
 *
 * AI prompt 模板化 IPC (A7):
 *   ai-prompts:load   返 { key: { system, rules, isDefault } } (合并默认+用户)
 *   ai-prompts:save   落盘 + broadcast ai-prompts-updated
 */

const stateStore = require("../state-store");
const { DEFAULT_PROMPTS, PROMPT_KEYS } = require("../../ai/prompt-registry");

function registerAiPromptsHandlers(ctx) {
  const { safeHandle, sendToRenderer } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("ai-prompts:load", () => {
    const user = stateStore.loadAiPrompts();
    const result = {};
    for (const key of PROMPT_KEYS) {
      const def = DEFAULT_PROMPTS[key];
      const u = user && user[key];
      const isDefault =
        !u ||
        typeof u.system !== "string" ||
        !u.system.trim();
      result[key] = {
        system: isDefault ? def.system : u.system,
        rules: isDefault ? def.rules : (u.rules != null ? u.rules : def.rules),
        isDefault,
      };
    }
    return result;
  });

  safeHandle("ai-prompts:save", (_evt, payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      stateStore.saveAiPrompts(payload);
      if (typeof sendToRenderer === "function") {
        try { sendToRenderer("ai-prompts-updated", {}); } catch { /* noop */ }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerAiPromptsHandlers };
```

- [ ] **Step 4: 注册到 ipc/index.js**

找到:
```js
const { registerWechatHotHandlers } = require("./register-wechat-hot");
```
后面加:
```js
const { registerAiPromptsHandlers } = require("./register-ai-prompts");
```
找到:
```js
  registerWechatHotHandlers(ctx); // ← 新增
```
后面加:
```js
  registerWechatHotHandlers(ctx); // ← 新增
  registerAiPromptsHandlers(ctx); // A7: AI prompt 模板化
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `npx vitest run tests/main/register-ai-prompts-ipc.test.js`
Expected: PASS (5 case 全绿)

- [ ] **Step 6: 改 preload.js**

找到 ithome 桥接段附近(或 ai-sessions 段),加:
```js
  aiPromptsLoad: () => ipcRenderer.invoke("ai-prompts:load"),
  aiPromptsSave: (prompts) => ipcRenderer.invoke("ai-prompts:save", prompts),
  onAiPromptsUpdated: (cb) => {
    const handler = (_evt) => cb();
    ipcRenderer.on("ai-prompts-updated", handler);
    return () => ipcRenderer.removeListener("ai-prompts-updated", handler);
  },
```

- [ ] **Step 7: 改 renderer api.js**

找到 createApi 函数(约第 28 行),在现有方法列表加:
```js
  aiPromptsLoad: pick(overrides, "aiPromptsLoad"),
  aiPromptsSave: pick(overrides, "aiPromptsSave"),
  onAiPromptsUpdated: pick(overrides, "onAiPromptsUpdated"),
```

- [ ] **Step 8: 跑 main 全量测试确认无回归**

Run: `npx vitest run tests/main/ 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/register-ai-prompts.js src/main/ipc/index.js preload.js src/renderer/api.js tests/main/register-ai-prompts-ipc.test.js
git commit -m "feat(a7): IPC ai-prompts:load/save + preload + api.js

load 合并默认+用户并标记 isDefault; save 落盘 + broadcast.
仿 ai-sessions:save-config 模式."
```

---

## Task 5: renderer prompt-store + PromptSettings UI

**Files:**
- Create: `src/renderer/store/prompt-store.js`
- Create: `src/renderer/components/PromptSettings.jsx`
- Modify: `src/renderer/components/AITasksDrawer.jsx`
- Test: `tests/renderer/prompt-settings.test.jsx` (新建)

- [ ] **Step 1: 新建 prompt-store.js**

新建 `src/renderer/store/prompt-store.js`:

```js
import { signal } from "@preact/signals";
import { api } from "../api.js";

/** @type {Signal<Record<string, {system, rules, isDefault}>|null>} */
export const aiPrompts = signal(null);
export const aiPromptsLoading = signal(false);
export const aiPromptsSaving = signal(false);

const PROMPT_LABELS = {
  ithome_summary: "📰 IT之家文章摘要",
  worldcup_prematch: "🏆 世界杯赛前预测",
  worldcup_postmatch: "🏆 世界杯赛后总结",
};

export function promptLabel(key) {
  return PROMPT_LABELS[key] || key;
}

export async function loadAiPrompts() {
  if (!api || typeof api.aiPromptsLoad !== "function") return;
  aiPromptsLoading.value = true;
  try {
    aiPrompts.value = await api.aiPromptsLoad();
  } catch {
    /* keep null */
  } finally {
    aiPromptsLoading.value = false;
  }
}

export async function saveAiPrompts(prompts) {
  if (!api || typeof api.aiPromptsSave !== "function") return { ok: false };
  aiPromptsSaving.value = true;
  try {
    const r = await api.aiPromptsSave(prompts);
    if (r && r.ok) {
      aiPrompts.value = await api.aiPromptsLoad();
    }
    return r;
  } catch {
    return { ok: false };
  } finally {
    aiPromptsSaving.value = false;
  }
}

export function subscribeAiPromptsUpdates() {
  if (!api || typeof api.onAiPromptsUpdated !== "function") return () => {};
  return api.onAiPromptsUpdated(() => {
    loadAiPrompts();
  });
}
```

- [ ] **Step 2: 新建 PromptSettings.jsx**

新建 `src/renderer/components/PromptSettings.jsx`:

```jsx
/**
 * src/renderer/components/PromptSettings.jsx
 *
 * A7: AI prompt 模板编辑面板. 3 个 prompt × (system + rules) textarea.
 * debounce 500ms 保存. isDefault=true 显示 "默认" 标记.
 */
import { useEffect, useState, useRef } from "preact/hooks";
import {
  aiPrompts,
  loadAiPrompts,
  saveAiPrompts,
  promptLabel,
} from "../store/prompt-store.js";
import { showToast } from "../store.js";

export function PromptSettings() {
  const prompts = aiPrompts.value;
  // 本地草稿 (避免每次按键都保存)
  const [draft, setDraft] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    loadAiPrompts();
  }, []);

  // prompts 加载完 → 初始化草稿
  useEffect(() => {
    if (prompts && !draft) {
      const d = {};
      for (const key of Object.keys(prompts)) {
        d[key] = { system: prompts[key].system, rules: prompts[key].rules };
      }
      setDraft(d);
    }
  }, [prompts, draft]);

  function updateField(key, field, value) {
    if (!draft) return;
    const next = { ...draft, [key]: { ...draft[key], [field]: value } };
    setDraft(next);
    // debounce 保存
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const r = await saveAiPrompts(next);
      if (r && r.ok) {
        showToast("Prompt 已保存", "success", 1500);
      } else {
        showToast("保存失败", "error", 2500);
      }
    }, 500);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  if (!prompts || !draft) {
    return <div class="prompt-settings-loading">加载 Prompt 配置…</div>;
  }

  return (
    <section class="prompt-settings">
      <h3 class="prompt-settings-title">AI Prompt 模板</h3>
      <p class="prompt-settings-hint">
        自定义 AI 摘要/预测的 prompt。留空 system 恢复默认。改错可手动清空重存。
      </p>
      {Object.keys(prompts).map((key) => (
        <div class="prompt-settings-item" key={key}>
          <div class="prompt-settings-item-head">
            <span class="prompt-settings-item-label">{promptLabel(key)}</span>
            {prompts[key].isDefault && (
              <span class="prompt-settings-default-tag">默认</span>
            )}
          </div>
          <label class="prompt-settings-field">
            <span class="prompt-settings-field-label">角色设定 (system)</span>
            <textarea
              class="prompt-settings-textarea"
              rows="2"
              value={draft[key]?.system || ""}
              onInput={(e) => updateField(key, "system", e.target.value)}
              placeholder={prompts[key].system}
            />
          </label>
          <label class="prompt-settings-field">
            <span class="prompt-settings-field-label">输出规则 (rules)</span>
            <textarea
              class="prompt-settings-textarea prompt-settings-textarea--rules"
              rows="6"
              value={draft[key]?.rules || ""}
              onInput={(e) => updateField(key, "rules", e.target.value)}
              placeholder={prompts[key].rules}
            />
          </label>
        </div>
      ))}
    </section>
  );
}

export default PromptSettings;
```

- [ ] **Step 3: 新建测试文件**

新建 `tests/renderer/prompt-settings.test.jsx`:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/preact";
import { signal } from "@preact/signals";

const mockPrompts = signal(null);
const mockLoadAiPrompts = vi.fn(async () => {
  mockPrompts.value = {
    ithome_summary: { system: "默认sys", rules: "默认rules", isDefault: true },
    worldcup_prematch: { system: "p", rules: "r", isDefault: true },
    worldcup_postmatch: { system: "p", rules: "r", isDefault: true },
  };
});
const mockSaveAiPrompts = vi.fn(async () => ({ ok: true }));

vi.mock("../../src/renderer/store/prompt-store.js", () => ({
  aiPrompts: mockPrompts,
  loadAiPrompts: mockLoadAiPrompts,
  saveAiPrompts: mockSaveAiPrompts,
  promptLabel: (k) => k,
}));

vi.mock("../../src/renderer/store.js", () => ({
  showToast: vi.fn(),
}));

import { PromptSettings } from "../../src/renderer/components/PromptSettings.jsx";

beforeEach(() => {
  mockPrompts.value = null;
  mockLoadAiPrompts.mockClear();
  mockSaveAiPrompts.mockClear();
  document.body.innerHTML = "";
});

describe("PromptSettings (A7)", () => {
  it("加载后渲染 3 个 prompt section", async () => {
    render(<PromptSettings />);
    await waitFor(() => {
      expect(document.body.querySelectorAll(".prompt-settings-item")).toHaveLength(3);
    });
  });

  it("isDefault=true 显示「默认」标记", async () => {
    render(<PromptSettings />);
    await waitFor(() => {
      expect(document.body.querySelectorAll(".prompt-settings-item")).toHaveLength(3);
    });
    expect(document.body.querySelectorAll(".prompt-settings-default-tag").length).toBeGreaterThan(0);
  });

  it("编辑 system textarea 触发保存 (debounce)", async () => {
    render(<PromptSettings />);
    await waitFor(() => {
      expect(document.body.querySelectorAll(".prompt-settings-textarea")).toHaveLength(6);
    });
    const textareas = document.body.querySelectorAll(".prompt-settings-textarea");
    fireEvent.input(textareas[0], { target: { value: "新角色" } });
    // debounce 500ms, 用 fake timer 或直接等
    await new Promise((r) => setTimeout(r, 600));
    expect(mockSaveAiPrompts).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `npx vitest run tests/renderer/prompt-settings.test.jsx`
Expected: PASS (3 case 全绿)

- [ ] **Step 5: 挂到 AITasksDrawer.jsx**

找到 AITasksDrawer 里渲染 `<AIConfigForm>` 的 configMode 分支附近(line 294-301)。在 AIConfigForm 之后(同一个 configMode 块内,或并列加一个渲染),加 `<PromptSettings />`。

最简方案:在 `<AIConfigForm ... />` 之后加:
```jsx
              <AIConfigForm
                compact
                onSaved={() => { digestConfigMode.value = false; }}
                onCancel={() => { digestConfigMode.value = false; }}
              />
              <PromptSettings />
```
并在顶部 import:
```js
import { PromptSettings } from './PromptSettings.jsx';
```

- [ ] **Step 6: 加 CSS**

在 styles.css 加 PromptSettings 样式:

```css
/* ─── A7: Prompt 模板设置 ─── */
.prompt-settings { padding: 12px 0; }
.prompt-settings-title { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
.prompt-settings-hint { font-size: 11px; color: var(--text-soft, rgba(0,0,0,.5)); margin: 0 0 12px; }
.prompt-settings-item { margin-bottom: 16px; padding: 12px; background: var(--bg-tertiary, #f5f5f7); border-radius: 8px; }
.prompt-settings-item-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.prompt-settings-item-label { font-size: 13px; font-weight: 600; }
.prompt-settings-default-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--border-subtle, #e5e5e7); color: var(--text-soft, rgba(0,0,0,.5)); }
.prompt-settings-field { display: block; margin-bottom: 8px; }
.prompt-settings-field-label { display: block; font-size: 11px; color: var(--text-soft); margin-bottom: 3px; }
.prompt-settings-textarea { width: 100%; font: inherit; font-size: 12px; padding: 6px 8px; border: 1px solid var(--border-subtle, #e5e5e7); border-radius: 6px; resize: vertical; box-sizing: border-box; }
.prompt-settings-textarea--rules { font-family: ui-monospace, monospace; font-size: 11px; }
.prompt-settings-loading { padding: 20px; text-align: center; color: var(--text-soft); font-size: 12px; }
```

- [ ] **Step 7: 跑全量测试确认无回归**

Run: `npx vitest run tests/renderer/ 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/renderer/store/prompt-store.js src/renderer/components/PromptSettings.jsx src/renderer/components/AITasksDrawer.jsx styles.css tests/renderer/prompt-settings.test.jsx
git commit -m "feat(a7): PromptSettings UI + prompt-store

3 prompt × (system + rules) textarea, debounce 500ms 保存.
isDefault 标记默认 prompt. 挂在 AITasksDrawer 的 AIConfigForm 之后."
```

---

## Task 6: 全量验证 + 手测

- [ ] **Step 1: 全量 vitest**

Run: `npx vitest run`
Expected: 全绿 (含新增 ~21 case: Task1 9 + Task2 4 + Task4 5 + Task5 3)

- [ ] **Step 2: build:renderer**

Run: `npm run build:renderer`
Expected: 成功

- [ ] **Step 3: 手测清单**

```
用户本地验证:
1. npx electron .
2. 打开 AI Tasks drawer → 点 ⚙️ 进 config 模式
3. 看到 "AI Prompt 模板" section, 3 个 prompt, 都标 "默认"
4. 改 ithome 的 system → 等 500ms → toast "Prompt 已保存"
5. 切到 IT之家, 生成一篇摘要 → 风格变了 (反映新 prompt)
6. 清空 system → 再生成 → 恢复默认风格 (isDefault 回退)
```

---

## Self-Review

**Spec 覆盖:**

| Spec § | Task |
| ------ | ---- |
| §3.1 state.json.ai_prompts 结构 | Task 2 |
| §3.2 prompt-registry + resolvePrompt | Task 1 |
| §3.3 article-ai/match-ai 改 resolvePrompt | Task 3 |
| §3.4 state-store load/save + schema | Task 2 |
| §3.5 IPC load/save + broadcast | Task 4 |
| §3.5 preload + api.js | Task 4 |
| §3.6 PromptSettings UI | Task 5 |

无遗漏。

**命名一致性:** `ai_prompts`(state key) / `loadAiPrompts`/`saveAiPrompts` / `resolvePrompt` / `aiPromptsLoad`/`Save`(api) — 全篇一致。

**关键风险点验证:** Task 3 的"现有 article-ai/match-ai 测试不回归"是硬验收 — 证明 DEFAULT_PROMPTS 默认值和原硬编码一字不差。
