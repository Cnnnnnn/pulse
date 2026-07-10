# A7 v3 — Daily Digest LLM 接入 设计

> 日期: 2026-06-24 | 状态: 设计已批准 | 上游: `2026-06-19-product-roadmap-design.md` §6 A7(评分 7,部分落地)

## 1. 背景

roadmap §13.4 标 A7 为"补半成品":基建 `shared-llm.js` 全有,只差 `config.aiDigest.prompts` 配置化 + Settings 面板。

**对账(2026-06-24)**:A7 的"基建"实际上**已经远超预期**:

- `state-store.loadAiPrompts/saveAiPrompts` ✅ 持久化 + schema
- `src/ai/prompt-registry.js` ✅ DEFAULT_PROMPTS(6 个 key)+ `resolvePrompt(key)` 合并用户配置
- `src/main/ipc/register-ai-prompts.js` ✅ `ai-prompts:load/save/reset` 三个 IPC
- `src/renderer/store/prompt-store.js` ✅ signal + save/load/reset
- `src/renderer/components/PromptSettings.jsx` ✅ 完整 UI(system + rules + few-shot + 恢复默认)

**剩下的工作只有一个**:`daily-summary-job` 完全没接 LLM,把硬编码的 `result.lines` 直接 push,没有走 prompt-registry。

## 2. 现状

```js
// src/main/digest/daily-summary-job.js:76-79
deps.sendNotification({
  title: `🌅 Pulse 早报 · ${result.date}`,
  body: result.lines.join("\n"), // 硬编码模板字符串
});
```

## 3. 范围

### 3.1 做

- **`src/ai/prompt-registry.js`** 新增 prompt key `daily_digest_summary`:
  ```js
  daily_digest_summary: {
    system: "你是 Pulse 桌面助手的早报编辑. 把下面要点改写成简洁可读的中文早报段落...",
    rules: "1. 1-3 段, 简洁可读\n2. 保留数字与版本号\n3. 不要编造",
    fewShot: "",
  }
  ```
- **`src/main/digest/daily-summary-job.js`** 新增 `tryRewriteSummary(lines, date, deps)`:
  - 用 `resolvePrompt('daily_digest_summary')` 拿 prompt(system + rules + few-shot)
  - 拼 messages = `[system, user(content=rules+'\n'+日期+要点)]`
  - 调 `sharedLlm.chatCompletion(messages)`
  - 成功且 text 非空 → 按 `\n` split + trim + filter 空 → 返回新 lines
  - 失败/超时/空 → 返回原 lines (不破现有)
  - 调用全程 try/catch,异常回退原 lines
- `checkAndPush` 在 sendNotification 之前 `bodyLines = await tryRewriteSummary(...)`,body 改用 `bodyLines.join('\n')`
- 超时:走 `chatCompletion` 的 8s timeout(底层 HttpClient.timeout=120s,但调用方 await 兜个 8s Promise.race)

### 3.2 不做

- ❌ 新增独立 IPC / store / UI — `PromptSettings` 已能编辑这个 key,加进去自动出现
- ❌ 用户开关"AI 改写" — LLM 调用失败回退,零风险;开关增加复杂度
- ❌ 新 prompt key schema — 用现有 {system, rules, fewShot}
- ❌ PromptSettings UI 改动 — 新增 key 自动渲染

## 4. 接口

### tryRewriteSummary 纯函数(便于单测)

```js
async function tryRewriteSummary(lines, date, { sharedLlm, prompt, signal }) {
  // lines: string[]
  // date: 'YYYY-MM-DD'
  // sharedLlm: 模块 (default require('../../ai/shared-llm'))
  // prompt: { system, rules, fewShot } (default resolvePrompt('daily_digest_summary'))
  // signal: AbortSignal (可选, 用于超时取消)
  // returns: string[] (改写后 lines 或原 lines)
}
```

实现:

```js
const userContent = [
  prompt.rules,
  `日期: ${date}`,
  "要点:",
  ...lines.map((l) => `  ${l}`),
].join("\n");
const messages = [
  { role: "system", content: prompt.system },
  { role: "user", content: userContent },
];
const result = await sharedLlm.chatCompletion(messages, { signal });
if (result.ok && result.text) {
  return result.text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
return lines; // 失败回退
```

### checkAndPush 集成

```js
// 在 push 之前:
const prompt = (deps.resolvePrompt || defaultResolvePrompt)(
  "daily_digest_summary",
);
const rewriteDeps = {
  sharedLlm: deps.sharedLlm || require("../../ai/shared-llm"),
  prompt,
};
const bodyLines = await tryRewriteSummary(
  result.lines,
  result.date,
  rewriteDeps,
);
deps.sendNotification({
  title: `🌅 Pulse 早报 · ${result.date}`,
  body: bodyLines.join("\n"),
});
```

## 5. 验收

- `tests/main/digest-llm.test.js`(新):
  - `tryRewriteSummary` 注入 mock sharedLlm:
    - ok + 改写 text 非空 → 返回 split lines
    - ok + 改写 text 空 → 回退原 lines
    - chatCompletion 抛错 → 回退原 lines
    - chatCompletion ok=false → 回退原 lines
  - messages 拼接格式(system+rules+日期+要点)
- `tests/main/digest-push-integration.test.js`(新):
  - checkAndPush 集成:
    - 注入 mock sharedLlm 改写成功 → sendNotification 收到改写后的 body
    - 注入 mock sharedLlm 抛错 → sendNotification 仍收到原 body(不破)
- 现有 digest 测试不回归

## 6. 风险

| 风险                 | 等级 | 缓解                                           |
| -------------------- | ---- | ---------------------------------------------- |
| LLM 慢导致 push 卡住 | 中   | 8s Promise.race 超时 + 回退                    |
| LLM 失败污染 state   | 低   | 失败回退原 lines, 不写 last_push_date 失败标记 |
| 用户填错 prompt 模板 | 低   | prompt-registry 已有校验;失败回退              |
| 输出太长撑爆 push    | 低   | 现有 `truncate(line, 60)` 兜底                 |

## 7. 实施

3 文件改动 + 2 文件测试。预计 ~120 行 + 测试。

- `src/ai/prompt-registry.js` — DEFAULT_PROMPTS 加 daily_digest_summary
- `src/main/digest/daily-summary-job.js` — 加 tryRewriteSummary + 集成
- 测试文件 2 个
