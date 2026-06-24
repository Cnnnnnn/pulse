# A1/A2 v2 打磨 设计说明

> 状态: ✅ v2.46.0 已合入
> 范围: A1 changelog-summary + A2 upgrade-advice 质量与反馈细节
> 不动: 主流程、缓存键、IPC 协议、A1 loading skeleton (v1 已打磨)

## 1. 动机

v2.45.0 做了"骨架屏 + 错误中文化 + 缓存时间"。本轮聚焦**模型质量**与**用户对结果信任度**:

| 痛点 | 当前 | 改进 |
| --- | --- | --- |
| A1/A2 prompt `fewShot` 字段空 | LLM 输出 schema 偏离靠运气 | 填默认 2-3 条 few-shot, 显式引导 |
| A2 `confidence` 后端字段在 UI 缺失 | 用户看到 "建议升级" 但不知模型多大把握 | 3 档颜色徽章 (high/medium/low) |
| A2 ↻ 按钮 (force=true) 静默 | 用户点了不知会消耗 AI 配额 | 加 tooltip "重新分析,会消耗 AI 配额" |

## 2. 范围

### 2.1 few-shot 默认填示例 (prompt-registry.js)

**`upgrade_advice`** few-shot 加 2 条:
```
输入: 应用=iTerm2, 1.0 -> 2.0, changelog 短, 很久没用
输出: {"recommendation":"wait","confidence":"medium","summary":"iTerm2 很久没用,可先等下次使用再升","reasons":["使用频次低"]}

输入: 应用=Cursor, 1.0 -> 2.0, changelog 含 Security fix, 7d 内常用
输出: {"recommendation":"upgrade","confidence":"high","summary":"含安全修复,建议尽快升","reasons":["安全修复","常用"]}
```

**`changelog_summary`** few-shot 加 1 条:
```
输入: 应用=VSCode, changelog 含 "Critical security fix in extension host. Add workspace trust. Performance: TS 5.5."
输出: {"oneLiner":"含关键安全修复 + 工作区信任机制 + TS 性能","highlights":["关键安全修复","工作区信任","TS 5.5 性能"]}
```

用户仍可在 Settings → Prompt 改/清空。

### 2.2 A2 confidence UI 体现 (UpgradeAdvice.jsx + styles.css)

- 后端 `advice.confidence` (high/medium/low) 已在, 但前端没用
- 加 3 个 badge 颜色 class:
  - `upgrade-advice-confidence--high`: 实心绿点
  - `upgrade-advice-confidence--medium`: 半透橙点
  - `upgrade-advice-confidence--low`: 灰点
- 位置: badge 旁, 不占用 summary 横向空间
- low confidence 时 summary 加 "?" 后缀 (可选, 见验收)

### 2.3 A2 ↻ force 按钮 tooltip

- `title="重新分析 (会消耗 AI 配额)"`
- 不改业务逻辑

## 3. 验收

- 单元测试:
  - `tests/main/prompt-registry.test.js` — few-shot 默认非空, 且用户 override 后透传
  - `tests/main/upgrade-advice.test.js` — 加 case: `buildAdviceMessages` 包含 few-shot 示例内容
  - `tests/main/changelog-summary.test.js` — 同上 for changelog_summary
- 渲染层: `tests/renderer/upgrade-advice.test.jsx` 加 case: confidence=high 时显示 `●` (3 档)
- vitest 全量: 2751 → 2758 左右
- build OK

## 4. 不做

- 不改 A1 confidence (changelog_summary 后端无 confidence 字段)
- 不做 few-shot 编辑器(用户在 Settings 现有 prompt 编辑器已可改)
- 不做 A2 评分阈值(score-based recommendation 升级), 仍用 LLM 自由推荐
