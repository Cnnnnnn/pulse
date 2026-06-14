# World Cup Bracket 视觉升级 v2: 传统 bracket tree + SVG 连线

- **日期**: 2026-06-14
- **作者**: brainstorming-2 (with user)
- **状态**: 待用户 review
- **基础**: v1 spec `2026-06-14-worldcup-bracket-design.md` (数据/逻辑层不动)
- **目标**: 把 v1 垂直堆叠的 5 阶段改造成传统左右分支 + SVG 连线 的体育首页风格 bracket tree

## 0. 决策日志

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| 布局方向 | **5 列水平 flex 树 (R32 左 → Final 右) + SVG 连线层** | 保留 v1 垂直堆叠（信息密度低，无视觉流向）/ 改用第三方库（增加包依赖）|
| 卡片版式 | **MatchCard 上下两队 (上 team1, 下 team2) + 中间比分 + 底部状态徽标** | v1 横向 1fr-auto-1fr（队名容易溢出 + 占空）/ 单行 vs 居中场次号（信息密度低）|
| 占位风格 | **🔒 待定徽标 + 灰底 italic 「A 组第 1」** | 虚线方框 + hover（无即时信息）/ 隐藏未上场（用户看不到 bracket 形状）|
| 连线算法 | **DOM 测量 (ResizeObserver) + SVG path L 型折线** | CSS 伪元素 + border（粗粘，难对齐）/ 固定卡高 + 公式（窗口变化时失真）|
| Final 排版 | **Final 上 / 季军赛下，同列垂直堆叠** | Final 中心 + Third 右侧（破坏对称）/ 隐藏 Third（FIFA 季军赛是正式比赛）|
| 响应式 | **窗口 < 900px 时回退到 v1 垂直堆叠** | 完全切到垂直（信息层次丢失）/ 横向滚动（移动端体验差）|
| 数据契约 | **不变**, 复用 v1 BracketSnapshot | 重新设计（v1 刚发布）|
| 性能 | **ResizeObserver 防抖 50ms + memoize paths** | 立即重算（高频 resize 抖动）/ 简单不优化（移动端拖窗会卡）|

## 1. 目标

### 1.1 必须达成

- [A] MatchCard 改为**上下两队版式**: 顶部 team1 + flag + 比分 | 分隔线 | 底部 team2 + flag + 比分
- [A] 5 阶段列布局: R32 → R16 → QF → SF → Final/Third, **水平 flex 排列, 左到右**
- [A] 每个 stage 列内**卡片垂直居中** (用 `justify-content: space-around` 或 `space-between` 撑开)
- [A] SVG 连线层: **覆盖整个 bracket 区域, 绝对定位, z-index 0; 卡片 z-index 1**
- [A] 连线算法: 相邻两列之间, 对 R32[i] → R16[floor(i/2)] 画 L 型折线 (横-竖-横), 路径颜色 `rgba(255,255,255,0.15)` 1px
- [A] 已完赛 R32 → R16 slot 已填胜者时, 对应连线**高亮** `rgba(74,222,128,0.5)` (绿)
- [A] Final 卡片: **更大** (宽 240px, 高 100px), 金色边框
- [A] 季军赛卡片: 在 Final **下方 24px**, 灰色边框, 较小
- [A] 卡片可点 → 复用 `SquadModal`
- [A] 响应式: 窗口 < 900px 时, 自动回退到 v1 垂直堆叠布局 (`.bracket-tree` → `.bracket-stack`)
- [A] 保持 toolbar / 空态 / 错误态 / 警告提示 不变

### 1.2 不做

- 改 BracketSnapshot 数据契约
- 改 bracket-rules 纯函数
- 改 IPC 通道
- 改自动计算 / 30s throttle
- 加拖拽 / 缩放 / 全屏 / 打印

## 2. 架构

### 2.1 组件树

```
WorldcupBracketView
  └─ BracketTree (新)
     ├─ BracketColumns (5 列 flex)
     │  ├─ StageColumn "r32"  (16 卡)
     │  ├─ StageColumn "r16"  (8 卡)
     │  ├─ StageColumn "qf"   (4 卡)
     │  ├─ StageColumn "sf"   (2 卡)
     │  └─ FinalColumn        (1 大卡 + 1 季军卡)
     └─ BracketConnectors     (SVG 覆盖层, 测 DOM 画 path)
```

### 2.2 关键模块

**新文件**: `src/renderer/worldcup/BracketTree.jsx` — 包含 BracketTree / StageColumn / FinalColumn / BracketConnectors 4 个组件 + `useConnectors` 自定义 hook

**修改文件**:
- `src/renderer/worldcup/WorldcupBracketView.jsx` — 把 `StageSection` 调用换为 `<BracketTree snapshot={...} />`
- `styles.css` — 加 `.bracket-tree-*` 类, 移除/废弃旧 `.bracket-grid-*` 类 (保留 v1 responsive fallback)

### 2.3 BracketConnectors 算法

```js
function useConnectors(stageRefs) {
  const [paths, setPaths] = useState([]);

  useEffect(() => {
    const recalc = () => {
      const refs = stageRefs.current;
      if (!refs) return;
      // left stage right edge x, right stage left edge x
      const r32Col = refs.r32.getBoundingClientRect();
      const r16Col = refs.r16.getBoundingClientRect();
      // ...
      // for each pair: r32[i] right-center → r16[floor(i/2)] left-center
      const newPaths = [];
      for (let i = 0; i < 16; i += 1) {
        const fromCard = refs.r32Cards[i];
        const toCard = refs.r16Cards[Math.floor(i / 2)];
        // L path
        newPaths.push({
          d: `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`,
          highlighted: !!fromCard?.dataset?.complete && !!toCard?.dataset?.resolved,
        });
      }
      setPaths(newPaths);
    };

    recalc();
    const ro = new ResizeObserver(() => {
      // 防抖 50ms
      clearTimeout(roTimer);
      roTimer = setTimeout(recalc, 50);
    });
    ro.observe(refs.container);
    return () => ro.disconnect();
  }, [snapshot]);

  return paths;
}
```

### 2.4 卡片 z-index / pointer-events

```css
.bracket-tree { position: relative; }
.bracket-tree-connectors { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.bracket-tree-columns { position: relative; z-index: 1; }
.bracket-card { position: relative; z-index: 1; }
```

SVG 不可点 (pointer-events: none), 卡片在 z=1 层, 点卡片正常触发 onClick。

## 3. UI 细节

### 3.1 MatchCard v2

```
┌──────────────────────┐
│ M73                  │  ← 场次号 (10px 灰)
├──────────────────────┤
│ 🏳 South Africa  ?  │  ← team1: flag + 队名 + 比分
├──────────────────────┤
│ 🏳 Switzerland  ?  │  ← team2: flag + 队名 + 比分
└──────────────────────┘
        🔒 待定          ← 状态徽标 (居中底部)
```

宽度: 180px, 高度: 80px
字号: 队名 12px, 比分 13px (bold)
分隔线: 1px rgba(255,255,255,0.08)

### 3.2 FinalColumn v2

```
        ┌────────────────────┐
        │       M104         │
        │     ╔═══════╗      │
        │ 🏳  ║ FINAL ║  🏳  │  ← 大卡片 240x100
        │     ╚═══════╝      │
        │     ⏱ 7/19 16:00   │
        └────────────────────┘

         ┌──────────────────┐
         │       M103        │
         │ 🏳 Loser1 vs Loser2 │  ← 季军赛 200x70
         └──────────────────┘
```

Final 卡片: 金色边框 `1px solid #fbbf24`
季军赛: 灰色边框 `1px solid rgba(255,255,255,0.15)`, 在 Final 下方 16px

### 3.3 连线样式

- 颜色: `rgba(255,255,255,0.18)`, stroke-width 1px
- 高亮 (上游完成 + 下游已填): `rgba(74,222,128,0.5)`, stroke-width 1.5px
- 路径: L 型 `M x1 y1 H mx V y2 H x2`, mx = (x1 + x2) / 2

### 3.4 响应式断点

```css
@media (max-width: 900px) {
  .bracket-tree { display: none; }  /* 桌面布局隐藏 */
  .bracket-tree-fallback { display: block; }  /* 显示 v1 垂直堆叠 */
}
```

< 900px 时, 渲染 `<BracketTreeFallback snapshot={...} />` (= 旧 StageSection 列表), 桌面布局不渲染。

## 4. 数据契约

**不变**. 复用 v1 BracketSnapshot.

新增 view-only 字段 (在 useConnectors 内部计算, 不入 snapshot):
- `__ref` — React ref 到每张卡片 DOM, 用于测坐标
- `__highlighted` — 该连线是否高亮 (派生自上游 status=final + 下游 slot.team != null)

## 5. 错误处理

- `ResizeObserver` 不可用 (旧浏览器) → 降级: 用 `window.addEventListener('resize')` 替代
- DOM 测量失败 (getBoundingClientRect 返 0) → 跳过该 path, 不报错
- snapshot 变化 → useEffect 依赖重算, paths 重渲染

## 6. 测试策略

### 6.1 单元 (view 测试)

- `BracketTree` 渲染 5 列: snapshot 有数据时 5 个 column 容器
- `MatchCard` 上下两队版式: 包含 team1 元素在 team2 之上
- `FinalColumn` 渲染 final + third 卡片
- `useConnectors` hook 单独测: 模拟 refs + 模拟 DOMRect, 验证 paths 数量 = 16 (R32→R16) + 8 (R16→QF) + 4 (QF→SF) + 2 (SF→Final) + 2 (SF→Third) = 32

### 6.2 视觉 (手动)

- 启动 Pulse, 切到 bracket tab, 截图
- 验证: 5 列布局, R32 在最左, Final/Third 在最右
- 验证: 连线对齐卡片中心
- 调整窗口 < 900px, 验证回退到垂直堆叠

### 6.3 E2E

- 现有 5 个 view 测试 + 5 个 store 测试全 PASS
- 现有 38 个 main 测试全 PASS
- Lint 干净

## 7. 文件清单

**新文件**:
- `src/renderer/worldcup/BracketTree.jsx` (~250 行)
- `tests/renderer/worldcup-bracket-tree.test.jsx` (~80 行)

**修改文件**:
- `src/renderer/worldcup/WorldcupBracketView.jsx` (~15 行改)
- `styles.css` (+ ~150 行新 CSS, 旧 `.bracket-grid-*` 保留作 fallback)
- `tests/renderer/worldcup-bracket-view.test.jsx` (5 个测试更新 snapshot 选择器, 因为新 view 多了 `.bracket-tree` 容器)

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| ResizeObserver 在频繁 resize 时重算抖动 | 防抖 50ms |
| DOM 测量在卡片未挂载时返 0 | useEffect 在 cards 渲染后跑, 测前 `requestAnimationFrame` 一次 |
| 旧 view 测试 selector 失效 (`.bracket-stage` 不存在) | 改 selector 为 `.bracket-tree` 或加 `data-testid` |
| SVG 在 zoom/打印下不缩放 | SVG `preserveAspectRatio="none"` + 容器 overflow hidden |
| 连线和卡片 z-index 错位 | 测试加 visual 验证 (snapshot test) |

## 9. 兼容性

- Chrome ≥ 64 (ResizeObserver 支持)
- Electron 内核 Chromium ≥ 90 (Pulse 2.x 最低版本) ✅
- 不依赖任何新 npm 包
