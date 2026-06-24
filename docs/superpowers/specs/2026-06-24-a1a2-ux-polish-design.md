# A1/A2 UX 打磨 设计说明

> 状态: ✅ v2.45.0 已合入
> 范围: A1 changelog-summary + A2 upgrade-advice 的渲染层 + 错误文案 + 端到端测试
> 不动: 主流程、prompt、缓存键、IPC 协议

## 1. 动机

§14 复盘指出 A1/A2 真实工作量 / spec 估算 = 5~20% 原因:基建已沉淀。
本轮**不**新增基建,只做**用户能感知的体验提升**:

| 痛点 | 当前 | 改进 |
| --- | --- | --- |
| A1 loading 只显示一行静态文案 | "摘要生成中…" 静默, 用户不知等多久 | 骨架屏 + "AI 生成中 · 5–15s" 文案 |
| A1 错误时只显示英文 reason | `parse_failed` / `llm_failed` 直接透出 | 中文化 + 分类(配置 / 网络 / 解析) |
| A2 三种 recommendation 无视觉区分 | 全用同一灰底 | 绿(upgrade) / 橙(wait) / 灰(skip) 三色 token |
| A2 错误态无重试入口 | 错误后只能刷新 app 重触发 | 错误条 + 内联"重试"按钮(同 A1) |
| A2 无"上次生成时间"提示 | 用户看不出是缓存还是实时 | 缓存命中时显示"3m 前生成" |
| 错误文案来源散落 main 端 | `ai/upgrade-advice.js` 与 `ai/changelog-summary.js` 各写一份 | 抽到 `ai/ai-errors.js` 统一字典 |

## 2. 范围

### 2.1 新增 `src/ai/ai-errors.js`

- 导出 `humanizeAiError(reason, errorMessage?)` 函数
- 字典覆盖 A1/A2 所有 reason:
  - `api_key_missing` → "需先在 AI 配置里填 API Key"
  - `llm_failed` / `timeout` → "AI 服务没响应,稍后重试"
  - `parse_failed` → "AI 返回无法解析,点重试"
  - `app_not_found` / `no_update` / `invalid_args` → "应用状态已变,刷新后重试"
  - 其它 → 透传 `error.message` 截前 60 字

### 2.2 A1 `ChangelogSummary.jsx`

- loading 状态改骨架: 1 个圆角条 + 3 个短行(灰色 pulse 动画)
- loading 文案: "✨ AI 提炼中 · 通常 5–15s"
- 错误条加入"重试"按钮(同点击触发器, force=true)
- summary 命中缓存且 `cached=true` 时, 底部加"3m 前生成"小字提示
- 渲染时, highlights 每条做 trim + 长度截断 (>50 字截断 + …)
- `oneLiner` 也同样截断 (>60 字截断 + …)

### 2.3 A2 `UpgradeAdvice.jsx` 颜色 token

```
.upgrade-advice--upgrade   { background: rgba(40, 200, 80, 0.12);  border-color: rgba(40, 200, 80, 0.4); }
.upgrade-advice--wait      { background: rgba(255, 165, 0, 0.12);  border-color: rgba(255, 165, 0, 0.4); }
.upgrade-advice--skip      { background: rgba(120, 120, 120, 0.10); border-color: rgba(120, 120, 120, 0.3); }
```

- confidence 高时边框加重 (2px → 3px)
- reasons 列表项前加 ▸ 符号, 不再裸字符串
- 错误时同 A1 风格, 加入"重试"按钮
- 命中缓存时底部加时间提示

### 2.4 端到端测试

- `tests/main/upgrade-advice.test.js` 新增 2 case:
  - `fetchUpgradeAdvice` 缓存命中返回 `cached: true`
  - `fetchUpgradeAdvice` LLM ok → 落盘并返回 `cached: false`
- `tests/main/changelog-summary.test.js` 新增 1 case: 同上
- `tests/ai/ai-errors.test.js` 新文件: `humanizeAiError` 5+ case

## 3. 验收

- 单元测试: 4 新 case 全过
- vitest 全量: 2743 → 2750 左右(其余持平)
- build OK
- 手动: 改 AI 配置的 key, 触发 A1/A2, 看 loading / 错误 / 缓存时间提示

## 4. 不做

- 不动 prompt 默认值
- 不动 cache key 策略(等用户场景数据)
- 不重写 IPC 协议
- 不做"取消请求"(A1/A2 同步按钮触发, 用户感受不到长)
