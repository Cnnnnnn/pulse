# I7 — Tray 菜单顶部摘要 设计

> 日期: 2026-06-24 | 状态: 设计已批准 | 上游: `2026-06-19-product-roadmap-design.md` §4.1 I7(评分 6)

## 1. 背景

macOS / Windows Tray **没有 hover tooltip 弹窗 API** — `tray.setToolTip(...)` 只能设静态短文本,且仅 Windows 在用户**悬停几秒**后才显示;macOS 完全不显示。

但用户每次**点击 tray icon** 时,菜单都会**立刻弹出**。菜单顶部当前展示的是 "🔄 检查更新 (N 待升级)" 段,**信息密度低**。

I7 改 scope:**菜单最顶部加一行总览**,让用户开菜单瞬间拿到"全局快照"。

## 2. 现状

`src/main/tray.js` `buildMenu(opts)` 当前顶部(seg.updates 分支内):

```js
if (updates.length > 0) {
  template.push({
    label: `── 🔄 检查更新 (${updates.length} 待升级) ──`,
    enabled: false,
  });
  // 每条 app
} else if (upToDate.length > 0) {
  template.push({
    label: `── 🔄 检查更新 · 全部最新 (${upToDate.length}) ──`,
    enabled: false,
  });
  template.push({ label: '  点击"检查更新"手动刷新', enabled: false });
}
```

**问题**:

- 有更新 → 直接 list,但缺"上次什么时候检测的"
- 全部最新 → 只显示总数,缺"最后检测时间"
- AI 用量 / 世界杯 / 贵金属各自段有数据,但**没有"上次检测什么时候"的全局时戳**

## 3. 范围

### 3.1 做

`buildMenu` 顶部(在所有 segment 之前)push 一行 **"全局快照"**:

- 文本格式:`🔔 Pulse · N 应用 M 待升级 · 5m 前`
- 计算:
  - `N = results.length`(检测过的 app 数)
  - `M = results.filter(r => r.has_update).length`
  - "Xm 前" = `results` 中最早 `ts` → `Date.now()` 的差值,格式化 `_ageLabel`(已有)
  - 若 `results.length === 0` → `🔔 Pulse · 尚未检测`
- `enabled: false`(只读摘要)

### 3.2 不做

- ❌ 真正 hover tooltip 弹窗(macOS 不支持;Windows tooltip 太长也显示不全)
- ❌ 总览包含 AI / 世界杯 / 贵金属(那些段已各自展示,头部再加信息过载)
- ❌ 在 summary 里加 emoji 状态指示(纯净文本)
- ❌ 根据 tray size 自适应(没这 API)

## 4. 接口

`buildMenu` 增加新参数 `summary`:

- `summary: { appCount, updateCount, lastCheckedAt, hasAnyResult } | null`
- 默认 `null` → 不显示 summary 行(向后兼容)
- `setResults(results)` 处:从 `results` 算 `summary` 并传入

实际:`buildMenu` 自己算,不传参(避免 IPC 改动)。

## 5. 验收

- vitest `tests/main/tray-build-menu-summary.test.js`(新 file):
  - 0 results → summary 显示 "尚未检测"
  - 5 results, 2 待升级, 3m 前检测 → summary "5 应用 · 2 待升级 · 3m 前"
  - 5 results, 0 待升级, 1h 前 → summary "5 应用 · 全部最新 · 1h 前"
- 现有 tray-build-menu 测试不回归
- 全量 vitest 绿

## 6. 风险

| 风险                              | 等级 | 缓解                                      |
| --------------------------------- | ---- | ----------------------------------------- |
| 用户感觉顶部加了"重复信息"        | 低   | 仅 1 行;与下方 segment 互补(总览 vs 详情) |
| lastCheckedAt 缺失 → 文本显示 "—" | 低   | 走兜底分支                                |
| 中文混排宽度                      | 低   | 走半角间隔                                |

## 7. 实施

单文件 `src/main/tray.js` 改动 + 新单测。预计 ~40 行 + 4 case。
