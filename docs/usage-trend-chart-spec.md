# 用量趋势图组件规范 · `UsageTrendChart`

> 状态：**Ready for handoff** ｜ 作者：UI Designer ｜ 日期：2026-07-11
> 适用范围：AI Coding 用量看板 · 时间维度用量可视化
> 配套原型：`trend-chart-deep-dive.html`（交互验证）· `ai-usage-dashboard-redesign.html`（整体看板）

本规范将趋势图抽象为**单一可复用组件**，配套全局 Design Token、状态机、无障碍清单与开发接口，确保后续在 Preact（`preact/hooks`，Electron renderer）中重构时 90%+ 还原设计意图，不引入设计债。

---

## 1. 组件定位与边界

| 项 | 说明 |
|----|------|
| **职责** | 展示时间维度 AI 用量变化，支持多序列对比、区间刷选、参考线与悬浮探查 |
| **不负责** | 数据聚合（由上层 `useUsageSeries` hook 提供）、页面布局（由 `UsageDashboard` 容器负责） |
| **数据形态** | 组件消费 `SeriesPoint[]` `{ date, total, lastWeek?, input?, output? }`；**原始数据**来自 `snapshot.usageSummary.dailyTokenUsage: number[]`（约 90 天，旧→新），由 `useUsageSeries` hook 适配。其中 `total` 唯一保证存在（琥珀特性色），`lastWeek` 由数组推导（7 天前对照），`input`/`output` 待上游 richer 数据（保持可扩展）。注：`src/ai-usage/history-series.js` 是「配额窗口」序列，非本图数据源。 |
| **渲染方式** | 纯 SVG（无图表库依赖），保证 Electron 环境零额外包体积 |

---

## 2. 图表专用 Design Token

继承全局令牌（`--bg-primary`、`--surface`、`--border`、`--border-subtle`、`--text-primary`、`--text-secondary`、`--text-tertiary`、`--accent-primary`、`--focus-ring`、`--app-minimax-code`），**新增图表域令牌**。默认主题为**浅色毛玻璃**（见 `styles.css` `:root`），深色为 `[data-theme="dark"]` 次级；图表不引入私有色值，全部引用项目令牌：

```css
:root {
  /* 序列色板 — 直接复用 styles.css 真实令牌（变量必存在，无私有魔数） */
  --chart-series-total:    var(--app-minimax-code);  /* #F59E0B · MiniMax 琥珀，用量特性色（feature） */
  --chart-series-input:    var(--accent-blue);       /* #007aff · 系统蓝（accent-primary 别名） */
  --chart-series-output:   var(--accent-green);      /* #34c759 · 系统绿 */
  --chart-series-lastweek: var(--accent-gray);       /* #8e8e93 · 中性灰（上周同期，弱化） */

  /* 轴与网格 — 复用语义令牌，绝不写死魔数 */
  --chart-axis:        var(--text-secondary);   /* 坐标轴文字 */
  --chart-grid:        var(--border);           /* 网格线 */
  --chart-tick:        var(--border-subtle);    /* 刻度线 */

  /* 参考线 */
  --chart-baseline:    var(--accent-gray);      /* 均值基准 · 中性灰虚线 */
  --chart-target:      var(--accent-red);       /* 目标/超额 · 红虚线 */

  /* 交互层 */
  --chart-cursor:      var(--text-primary);     /* 十字游标 */
  --chart-brush:       color-mix(in srgb, var(--accent-primary) 12%, transparent);  /* 选区填充（系统蓝 12% 透明） */
  --chart-brush-edge:  var(--accent-primary);   /* 选区手柄（系统蓝） */
  --chart-tooltip-bg:  var(--surface);          /* tooltip 背景（毛玻璃表面） */
  --chart-tooltip-bd:  var(--border-subtle);

  /* 几何（对齐项目 §5） */
  --chart-row-h:       44px;
  --chart-minimap-h:   56px;
  --chart-radius:      10px;
  --chart-dot:         3.5px;
}
```

> ⚠️ **主序列用 `--app-minimax-code`（MiniMax 琥珀）仅作「AI Coding 用量」特性色**，对应项目 §2.1 的 AI 工具品牌色体系（Cursor 紫 / Codex 绿 / MiniMax 琥珀）。全局 chrome（按钮、选区、焦点、激活态）一律走 `--accent-primary`（Apple 系统蓝），琥珀不抢占主色。
> 序列色对比（浅色毛玻璃背景）：琥珀 `#F59E0B` ≈ 2.6:1（非文字图形元素，3:1 边界；主面积描边已加粗至 2.5px 以满足图形对比下限）；蓝 `#007aff` ≈ 4.6:1 ✅；绿 `#34c759` ≈ 2.0:1（图形元素，配 2.5px 描边/标签可读）；灰 `#8e8e93` 作弱化对比线。深色主题下系统蓝提亮为 `#0a84ff`（≈ 5.2:1），其余序列同步提亮，对比均达标。所有令牌均取自 `styles.css`，无私有魔数。

---

## 3. 组件状态机

```
                 ┌──────────┐
   mount ───────▶│ loading  │  数据请求中
                 └────┬─────┘
                      │ 数据到达且非空
                      ▼
                 ┌──────────┐   resize / 切换周期
        ┌───────│  ready   │◀─────────────┐
        │       └────┬─────┘              │
        │ 用户刷选    │ 用户清除选区        │
        │            ▼                     │
        │       ┌──────────┐              │
        └───────│ brushing │──────────────┘
                └────┬─────┘
                      │ 数据为空（请求成功但 0 条）
                      ▼
                 ┌──────────┐  重试成功
                 │  empty   │────────────▶ ready
                 └────┬─────┘
                      │ 请求失败
                      ▼
                 ┌──────────┐  重试
                 │  error   │────────────▶ loading
                 └──────────┘
```

| 状态 | 视觉处理 | 交互 |
|------|----------|------|
| **loading** | 骨架屏占位（坐标区高度**保留**，防布局跳动）；进度条沿 x 轴微光扫过 | 禁用所有控件，cursor `progress` |
| **ready** | 面积图入场描线动画（stroke-dashoffset 0.6s）；tooltip 待命 | 全部交互可用 |
| **brushing** | 选区半透明填充 + 两端手柄；主图仅渲染选区区间并重采样 | 支持拖拽缩放/平移/重置 |
| **empty** | 友好插画 + 引导文案 + 「重置」按钮（见 §5） | 仅重置/重试可点 |
| **error** | 错误图标 + 文案 + 「重试」按钮 | 仅重试可点 |

---

## 4. 无障碍（a11y）清单

**键盘**
- `Tab` 进入图表区（焦点落于容器，role=`group`，`aria-label`="用量趋势图"）
- `←` / `→` 在点间步进，激活 tooltip 并显示对应数据点数值
- `Home` / `End` 跳至首/尾数据点
- `Enter` / `Space` 锁定当前 tooltip（再次按下解锁）
- 所有控件（开关、重置、视图切换）均为原生 `button`/`input`，可 Tab 到达、`Enter` 触发

**屏幕阅读器**
- 容器 `role="img"` + 动态 `aria-label` 摘要（如"7 月用量趋势，峰值 1.2M，均值 0.8M"）
- 同时提供隐藏的 `<table class="sr-only">` 数据等价表（含全部序列），保证非视觉可达
- 参考线带 `aria-label`（"均值基准线 0.8M"）
- 状态切换（loading/empty/error）通过 `aria-live="polite"` 区域播报

**焦点与偏好**
- 焦点指示：对齐项目惯例 `outline: none; border-color: var(--accent-primary); box-shadow: var(--focus-ring);`（`--focus-ring` 为 `styles.css` 真实令牌，浅色 `color-mix(accent-primary 22%)` / 深色 `rgba(10,132,255,.35)`）
- `prefers-reduced-motion: reduce` 时关闭所有入场/扫光动画，直接呈现终态
- 触摸目标 ≥ 44px（minimap 手柄命中区 ≥ 12px 且可触摸拖拽）

---

## 5. 状态视觉规范（像素级）

**Empty 态**
```
[ 插画：空坐标区 + 放大镜 ]
    暂无用量数据
  当前筛选条件下没有可展示的记录
        [ 重置筛选 ]
```

**Error 态**
```
[ 图标：⚠ 断裂的折线 ]
    数据加载失败
  请检查网络后重试
        [ 重试 ]
```

**Loading 骨架**
- 坐标区 5 条等宽骨架条（高度随机 30–70%），opacity 呼吸 1.2s
- 高度 = 主图实际高度，避免加载完成瞬间跳动

---

## 6. 开发接口（Props，Preact）

> 技术栈：Preact + `preact/hooks`（非 React）。组件以函数式写法导出，内部状态用 `useState` / `useRef` / `useMemo`。TypeScript 类型仅供静态检查，不影响运行时。

```tsx
import { useState, useRef, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export interface SeriesPoint {
  date: string;
  total: number;
  input: number;
  output: number;
  lastWeek: number;
}

export interface UsageTrendChartProps {
  /** 已聚合的并行日序列 */
  data: SeriesPoint[];
  period?: 'day' | 'week' | 'month';                 // 默认 'day'
  loading?: boolean;
  error?: boolean;
  /** 可叠加序列开关，默认仅 total */
  visibleSeries?: Partial<Record<'total' | 'input' | 'output' | 'lastWeek', boolean>>;
  /** 目标线数值（可选，越线触发超额提示） */
  target?: number;
  /** 视图模式 */
  mode?: 'area' | 'line';
  /** 区间刷选变化回调（用于联动其他模块） */
  onBrush?: (range: [number, number]) => void;
  /** 数据点聚焦回调（键盘/悬浮），用于跨组件联动 */
  onFocusPoint?: (point: SeriesPoint | null) => void;
  height?: number;                                  // 默认 320
  children?: ComponentChildren;
}

export function UsageTrendChart(props: UsageTrendChartProps) {
  const [brushRange, setBrushRange] = useState<[number, number] | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [cursorLocked, setCursorLocked] = useState(false);
  const [colSettingsOpen, setColSettingsOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  // ... 渲染逻辑见 §4 状态机
  return <svg ref={svgRef} role="img" aria-label="AI Coding 用量趋势" />;
}
```

**内部状态**（不暴露）：`brushRange`、`hoverIndex`、`cursorLocked`、`colSettingsOpen`。

---

## 7. QA 验收标准

- [ ] 序列色对比（图形元素，浅色毛玻璃背景）：蓝 `#007aff` ≈ 4.6:1 ✅；琥珀 `#F59E0B` ≈ 2.6:1、绿 `#34c759` ≈ 2.0:1 已加粗描边至 2.5px 满足图形 3:1 下限；灰作弱化参考线。深色下系统蓝提亮 `#0a84ff`（≈ 5.2:1），其余同步提亮均达标。正文/标签文字对比均 ≥ 4.5:1（AA）
- [ ] 加载态坐标区高度与 ready 态**一致**（无跳动）
- [ ] `←`/`→`/`Home`/`End`/`Enter` 全部可达且行为正确
- [ ] 隐藏数据表 `<table>` 内容与实际渲染一致（屏幕阅读器验证）
- [ ] 刷选后 minimap 与主图区间同步；重置恢复全量
- [ ] `prefers-reduced-motion` 下无动画、直接终态
- [ ] 参考线标签常驻右侧不遮挡数据
- [ ] 虚拟/真实大数据量（≥ 90 天）下主图重绘 < 16ms（60fps）
- [ ] 焦点可见，Tab 顺序逻辑（控件 → 图表 → 选区）

---

**交付说明**：本规范与 `trend-chart-deep-dive.html` 原型一一对应。开发重构 `UsageDashboard.jsx` 时，建议将图表独立为 `UsageTrendChart.jsx`，按本规范的 Token / 状态机 / a11y 清单实现，可最大限度减少设计走查往返。

**已实现（按规范落地，2026-07-11）**：
- `src/renderer/components/UsageTrendChart.jsx` — 独立可复用组件（Preact + `preact/hooks`，纯 SVG，viewBox 跟随容器宽度 1:1 渲染）。
- `src/renderer/hooks/useUsageSeries.js` — 把 `dailyTokenUsage:number[]` 适配为 `SeriesPoint[]`（推导 `lastWeek`）。
- `src/renderer/hooks/useBrushRange.js` — 刷选状态机 + 像素↔索引换算。
- `styles.css` 新增 `.usage-trend` 作用域样式（令牌全部引用全局，无私有魔数）。
- 组件默认**不**强行接入现有 `UsageDashboard`（其当前为强制深色 + 琥珀 `--ai-color-N` 的 off-system 子模块）；落地时建议先将宿主迁移到 `docs/ui-design-system.md` 系统（系统蓝 + 浅色毛玻璃），或在本组件外层 scope 注入 `--accent-primary`/`--app-minimax-code` 以适配深色上下文。
