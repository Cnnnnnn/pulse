# A7 — AI Prompt 模板化 设计

| 日期       | 作者         | 状态     |
| ---------- | ------------ | -------- |
| 2026-06-24 | brainstorming | 设计已批准 |

> 上游:`2026-06-19-product-roadmap-design.md` §6.1 A7(评分 7)。
> 基建 (`shared-llm.js` + `sanitize-llm-output`) 此前已落地,本 spec 补"可配置"这一段。

## 1. 背景与目的

Pulse 有 3 个 AI 功能(都走 `chatCompletion`),prompt 全部**硬编码**在各自模块:
- IT之家文章摘要 (`src/main/ithome/article-ai.js`)
- 世界杯赛前预测 (`src/main/worldcup/match-ai.js` `buildPreMatchPrompt`)
- 世界杯赛后总结 (`src/main/worldcup/match-ai.js` `buildPostMatchPrompt`)

用户无法调整 prompt —— 但 prompt 质量直接决定 AI 输出质量(摘要风格、字数、格式)。
重度用户想"让摘要更简短"或"换个分析角度"只能改源码。

本 spec 把这 3 个 prompt 提取到 `state.json.ai_prompts`,Settings 加面板可编辑。
**默认值 = 当前硬编码值,零行为变化**;用户改了才覆盖。

### 1.1 现状对账(代码事实)

| prompt 位置 | 文件 | 函数 | 当前结构 |
| ----------- | ---- | ---- | -------- |
| IT之家摘要 | `article-ai.js` | `buildMessages(article)` | system = "你是科技新闻编辑..." + `OUTPUT_RULES`(4行格式) |
| 世界杯赛前 | `match-ai.js` | `buildPreMatchPrompt(match)` | system = "你是资深足球分析师..." + `OUTPUT_RULES`(4行格式) |
| 世界杯赛后 | `match-ai.js` | `buildPostMatchPrompt(match, scoreEntry)` | system = "你是资深足球评论员..." + `OUTPUT_RULES`(4行格式) |

三者结构有差异:
- ithome: system = 角色句 + OUTPUT_RULES(2 段)
- worldcup pre/post: system = 角色句 + 内容指引("分三段:对阵看点...") +
  OUTPUT_RULES(3 段)

**统一方案**:worldcup 的"内容指引"并入 system 字段(它本就是角色描述的一部分),
最终 3 个 prompt 都是 { system, rules } 两字段。system = 角色句(+内容指引),
rules = OUTPUT_RULES。零信息丢失。

**不含 category**:`src/config/category.js` 的 `classifyByLLM` 用 DI `llmCaller`(不走 `chatCompletion`),
结构不同,本次不动,留 v2。

## 2. 范围(严格不超出)

### 2.1 做

- `state.json.ai_prompts` 新字段,存 3 个 prompt 的 system + rules
- `prompt-registry.js` 注册中心:3 个 prompt key + 默认值 + `resolvePrompt(key)`
- `article-ai.js` / `match-ai.js` 改用 `resolvePrompt` 取 prompt(替代硬编码)
- IPC `ai-prompts:load` / `ai-prompts:save`(save 后 broadcast 通知)
- Settings 加 `PromptSettings.jsx`:3 个 prompt × (system textarea + rules textarea)

### 2.2 不做(YAGNI)

- ❌ category 分类 prompt(结构不同,留 v2)
- ❌ prompt 版本号 / few-shot 样本(超出"可编辑"范围)
- ❌ prompt 重置按钮(v2,现在改错了手改回默认即可)
- ❌ 改 `sanitize-llm-output` 的 CJK>80 检查(用户改 prompt 出英文输出风险自担)

## 3. 设计

### 3.1 数据结构 — `state.json.ai_prompts`

```json
"ai_prompts": {
  "ithome_summary": { "system": "你是科技新闻编辑...", "rules": "【硬性要求】\n1. ..." },
  "worldcup_prematch": { "system": "你是资深足球分析师...", "rules": "..." },
  "worldcup_postmatch": { "system": "你是资深足球评论员...", "rules": "..." }
}
```

- 顶层 key 是 prompt id;每个值 `{ system: string, rules: string }`
- forward compat:老 state.json 无 `ai_prompts` → resolvePrompt 返默认值
- 用户只改了某 prompt 的 system 没改 rules → 该 prompt 整体走用户配置(spec §3.2 合并语义)

### 3.2 prompt-registry.js — 注册中心

新建 `src/ai/prompt-registry.js`:

```js
const stateStore = require("../main/state-store");

/** prompt id → 默认值 (system + rules) */
const DEFAULT_PROMPTS = {
  ithome_summary: {
    system: "你是科技新闻编辑，擅长把 IT 资讯浓缩成清晰的中文摘要。",
    rules: [ /* 当前 article-ai.js 的 OUTPUT_RULES 原样搬来 */ ].join("\n"),
  },
  worldcup_prematch: {
    system: "你是资深足球分析师。...",
    rules: [ /* match-ai.js buildPreMatchPrompt 的 OUTPUT_RULES */ ].join("\n"),
  },
  worldcup_postmatch: {
    system: "你是资深足球评论员。...",
    rules: [ /* match-ai.js buildPostMatchPrompt 的 OUTPUT_RULES */ ].join("\n"),
  },
};

/**
 * 解析某个 prompt: 有用户配置(且非空)用配置, 否则用默认.
 * 整体替换语义: 用户配了 ithome_summary 就用 {system, rules} 整体,
 * 不做 system/rules 分别 fallback (避免混搭).
 * @param {string} key  prompt id
 * @returns {{ system: string, rules: string }}
 */
function resolvePrompt(key) {
  const userPrompts = stateStore.loadAiPrompts();
  const user = userPrompts && userPrompts[key];
  const def = DEFAULT_PROMPTS[key];
  if (!def) throw new Error(`unknown prompt key: ${key}`);
  if (user && typeof user.system === "string" && typeof user.rules === "string"
      && (user.system.trim() || user.rules.trim())) {
    return { system: user.system, rules: user.rules };
  }
  return { system: def.system, rules: def.rules };
}

module.exports = { DEFAULT_PROMPTS, resolvePrompt, PROMPT_KEYS: Object.keys(DEFAULT_PROMPTS) };
```

### 3.3 改 article-ai.js / match-ai.js

`buildMessages` 内的硬编码 system + OUTPUT_RULES 改成:

```js
const { resolvePrompt } = require("../../ai/prompt-registry");
// ...
function buildMessages(article) {
  const prompt = resolvePrompt("ithome_summary");
  return [
    { role: "system", content: `${prompt.system}\n${prompt.rules}` },
    { role: "user", content: [/* 现有动态内容不变 */].join("\n") },
  ];
}
```

`match-ai.js` 同理,`buildPreMatchPrompt` / `buildPostMatchPrompt` 分别用
`resolvePrompt("worldcup_prematch")` / `resolvePrompt("worldcup_postmatch")`。

**删除** 原 `OUTPUT_RULES` 常量(已搬进 DEFAULT_PROMPTS)。

### 3.4 state-store 封装 + schema

`state-store.js` 加(仿 `loadDailyDigest`/`saveDailyDigest`):

```js
function loadAiPrompts(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s || !s.ai_prompts || typeof s.ai_prompts !== "object") return {};
  return s.ai_prompts;
}

function saveAiPrompts(prompts, statePath = defaultPath()) {
  if (!prompts || typeof prompts !== "object") {
    throw new TypeError("saveAiPrompts: prompts must be plain object");
  }
  return patchState((next) => {
    next.ai_prompts = prompts;
  }, statePath);
}
```

PRESERVE_FIELDS 加 `{ key: "ai_prompts", kind: "object", notArray: true }`。
module.exports 加 `loadAiPrompts`, `saveAiPrompts`。

### 3.5 IPC

新建 `src/main/ipc/register-ai-prompts.js`(仿 `register-ai.js` 的 save-config):

```js
const stateStore = require("../state-store");
const { DEFAULT_PROMPTS, PROMPT_KEYS } = require("../../ai/prompt-registry");

function registerAiPromptsHandlers(ctx) {
  const { safeHandle, sendToRenderer } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle("ai-prompts:load", () => {
    const user = stateStore.loadAiPrompts();
    // 返回 { key: { system, rules, isDefault } } — 合并默认值 + 标记是否用户改过
    const result = {};
    for (const key of PROMPT_KEYS) {
      const def = DEFAULT_PROMPTS[key];
      const u = user[key];
      const isDefault = !u || !(u.system && u.system.trim());
      result[key] = {
        system: isDefault ? def.system : u.system,
        rules: isDefault ? def.rules : u.rules,
        isDefault,
      };
    }
    return result;
  });

  safeHandle("ai-prompts:save", (_evt, payload) => {
    if (!payload || typeof payload !== "object") {
      return { ok: false, reason: "invalid_args" };
    }
    try {
      stateStore.saveAiPrompts(payload);
      if (typeof sendToRenderer === "function") {
        sendToRenderer("ai-prompts-updated", {});
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "threw", error: err && err.message };
    }
  });
}

module.exports = { registerAiPromptsHandlers };
```

`ipc/index.js` 注册 + `preload.js` 桥接 `aiPromptsLoad` / `aiPromptsSave` / `onAiPromptsUpdated`。

### 3.6 Settings UI — PromptSettings.jsx

新建 `src/renderer/components/PromptSettings.jsx`,挂在 `AITasksDrawer` 的 `AIConfigForm` 之后(或 Settings 区):

```jsx
// 3 个 prompt, 每个 system textarea + rules textarea + "恢复默认"提示
// 实时保存 (onBlur 或 debounce 500ms 调 api.aiPromptsSave)
// isDefault=true 的显示淡色 "默认" 标记
```

UI 结构:
- 标题 "AI Prompt 模板"
- 3 个 section(ithome 摘要 / 世界杯赛前 / 世界杯赛后)
- 每个 section: 2 个 textarea(system 角色句 + rules 输出规则)
- 用户改过的(isDefault=false)显示 "已自定义" 标记
- 保存:debounce + showToast("prompt 已保存")

## 4. 验收

- [ ] `prompt-registry.js`: resolvePrompt 默认值 / 用户覆盖 / 空 system 回退默认 (3 case)
- [ ] state-store: load/save ai_prompts + forward compat (2 case)
- [ ] article-ai / match-ai: buildMessages 用 resolvePrompt 后输出格式不变
      (snapshot 测试: 默认 prompt 下 messages 结构和改前一致)
- [ ] IPC: load 合并默认+用户 / save 落盘 + broadcast
- [ ] PromptSettings: 渲染 3 个 section / textarea 编辑 / 保存调 API
- [ ] 全套 vitest 绿(原有 article-ai / match-ai 测试不回归)
- [ ] 用户本地手测:改 ithome prompt → 摘要风格变化;改回默认 → 恢复

## 5. 风险

| 风险 | 等级 | 缓解 |
| ---- | ---- | ---- |
| 改 3 个 prompt 点漏改导致行为漂移 | 中 | 默认值 = 当前硬编码原值;加 snapshot 测试验证默认 prompt 下 messages 不变 |
| 用户改 prompt 导致 AI 输出格式错 | 低 | sanitize-llm-output 兜底;用户自担风险(改错了手改回默认) |
| worldcup 两个 prompt 同名 OUTPUT_RULES 冲突 | 无 | 搬进 DEFAULT_PROMPTS 时用不同 key 消除歧义 |

## 6. 与路线图对齐

- 上游候选:`2026-06-19-product-roadmap-design.md` §6.1 A7(评分 7)
- 状态机:合入后 A7 → 🟢 Next + 🟢 已合入(从 🟡 部分落地升级)
- 下游依赖:A2 "该不该升级"建议将复用 prompt-registry 加第 4 个 prompt
