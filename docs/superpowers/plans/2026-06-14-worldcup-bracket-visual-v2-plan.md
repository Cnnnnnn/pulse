# World Cup Bracket 视觉升级 v2: 实施计划

- **日期**: 2026-06-14
- **Spec**: `docs/superpowers/specs/2026-06-14-worldcup-bracket-visual-v2-design.md`
- **执行方式**: 7 task, 1 task / 1 subagent, 严格 TDD, 每 task 后做 spec compliance + code review

## 通用约定

- 工作目录: `/Users/shien.liang/Desktop/AppUpdateChecker-Electron` (主 repo, **不**开 worktree — 这次是 visual refactor, 不隔离)
- 测试运行: `npx vitest run tests/<file>`
- 全套: `npx vitest run` (期望 1608 PASS, 不许回归)
- Lint: 改完调 ReadLints 看 WorldcupBracketView.jsx / 新文件
- Commit: 用 `git commit -m` (不带 push, 由 finishing skill 统一推)

## Task 1: BracketTree.jsx + 基础 CSS (无连接器)

**TDD 步骤**:
1. 写 `tests/renderer/worldcup-bracket-tree.test.jsx`:
   - test "renders 5 stage columns (r32, r16, qf, sf, final)"
   - test "MatchCard displays team1 above team2"
2. 跑测试 → FAIL
3. 创建 `src/renderer/worldcup/BracketTree.jsx`:
   - 导出 `BracketTree`, `StageColumn`, `FinalColumn`, `MatchCard` (复制 + 改 layout)
   - `BracketTree` 接收 `snapshot`, 渲染 4 个 StageColumn + 1 个 FinalColumn
   - `StageColumn` 接收 `stage` (e.g. "r32") + `matches` array, 渲染 card list
   - `MatchCard` 接收 `match` + `onClick`, 改上下布局:
     ```jsx
     <div class="bracket-card">
       <div class="bracket-card-head">M{matchNum}</div>
       <div class="bracket-card-team bracket-card-team--top">
         {team1 flag + name + score}
       </div>
       <div class="bracket-card-divider" />
       <div class="bracket-card-team bracket-card-team--bottom">
         {team2 flag + name + score}
       </div>
     </div>
     ```
4. 加 CSS (styles.css 末尾):
   - `.bracket-tree` 容器 (flex row, gap, overflow-x auto)
   - `.bracket-tree-column` (flex column, justify-content space-around, min-width 200px)
   - `.bracket-card` 改: width 180px, min-height 80px, flex column
   - `.bracket-card-team--top/bottom` flex row, padding, 队名 + 比分右对齐
5. 跑测试 → PASS
6. Spec compliance review (subagent)
7. Code review (subagent)
8. Commit: `feat(worldcup/bracket-tree): horizontal 5-column tree with vertical card layout`

## Task 2: SVG 连接器层

**TDD 步骤**:
1. 加测试 `tests/renderer/worldcup-bracket-tree.test.jsx`:
   - test "BracketConnectors renders 32 SVG paths (16 R32→R16 + 8 R16→QF + 4 QF→SF + 2 SF→Final + 2 SF→Third)"
2. 跑测试 → FAIL
3. 实现 `useConnectors` hook + `BracketConnectors` 组件:
   - `useConnectors(refs)` 返回 `{ paths, containerRef }`
   - 内部用 `useState` + `useEffect` + `ResizeObserver`
   - refs: `{ r32: ref, r16: ref, qf: ref, sf: ref, final: ref, third: ref }`, 每列 ref 内部还含 16/8/4/2/1/1 个 card refs
   - recalc 函数: 对每对相邻 stage 算 paths
   - 路径: `M x1 y1 H mx V y2 H x2`, highlighted = (上游 status=final && 下游 slot.team !== null)
4. `BracketConnectors` 组件返回 `<svg class="bracket-tree-connectors">{paths.map(p => <path d={p.d} class={p.highlighted ? 'highlighted' : ''} />)}</svg>`
5. CSS: `.bracket-tree-connectors` position absolute, inset 0, z-index 0, pointer-events none; `.bracket-tree` position relative
6. 跑测试 → PASS
7. Review
8. Commit: `feat(worldcup/bracket-tree): add SVG connector layer with ResizeObserver`

## Task 3: FinalColumn 大卡片 + 季军赛

**TDD 步骤**:
1. 加测试:
   - test "FinalColumn renders a 240x100 final card with gold border"
   - test "FinalColumn renders a 200x70 third-place card below final"
2. 跑 → FAIL
3. 实现 `FinalColumn`:
   - 大 Final 卡片: 240x100, 金色边框 1px solid #fbbf24, 居中显示 "FINAL" 文字 + M104
   - 季军赛卡片: 200x70, 灰色边框, 在 Final 下方 16px
4. CSS: `.bracket-tree-column--final` 特殊 padding, `.bracket-card--final` 金色, `.bracket-card--third` 灰色
5. 跑 → PASS
6. Review
7. Commit: `feat(worldcup/bracket-tree): promote final + third column with prominent styling`

## Task 4: 响应式 fallback

**TDD 步骤**:
1. 加测试:
   - test "renders fallback (v1 stage list) when viewport width < 900px"
2. 跑 → FAIL
3. 实现:
   - `BracketTree` 检测 `window.innerWidth` (用 `useState` + resize listener)
   - 窄屏: 渲染 v1 的 `StageSection` 列表 (用 BracketTreeFallback 组件, 内联旧代码)
   - 宽屏: 渲染新的水平 tree
4. CSS: `@media (max-width: 900px) { .bracket-tree { display: none; } .bracket-tree-fallback { display: block; } }`
5. 跑 → PASS
6. Review
7. Commit: `feat(worldcup/bracket-tree): responsive fallback to v1 vertical stack on narrow viewport`

## Task 5: 更新 WorldcupBracketView

1. 改 `WorldcupBracketView.jsx`:
   - import `BracketTree`
   - 把 `StageSection` 调用换为 `<BracketTree snapshot={snapshot} onMatchClick={handleMatchClick} />`
   - toolbar / 空态 / 错误态代码保持
2. 跑现有 5 个 view test → 应全 PASS (因为新组件渲染了 ".bracket-tree" 元素 + "1/16 决赛" 文本)
3. 必要更新: 如果 selector 改变, 更新对应测试
4. Review
5. Commit: `refactor(worldcup/bracket-view): delegate bracket rendering to BracketTree`

## Task 6: 更新 view tests + 加新测试

1. `tests/renderer/worldcup-bracket-view.test.jsx`:
   - 旧 selector 改: 期望 `.bracket-tree` 而非 `.bracket-stage`
   - 加 1 测试: "mount triggers tree rendering (snapshot has data)"
2. `tests/renderer/worldcup-bracket-tree.test.jsx` 已有 Task 1-4 的测试, 跑全 PASS
3. Review
4. Commit: `test(worldcup/bracket): add tree-rendering tests + update view selector`

## Task 7: E2E + release notes

1. `npx vitest run` → 期望 ≥ 1614 PASS (1608 + 6 新)
2. Lint check
3. `RELEASE-NOTES.md` 加 v2.15.0:
   ```
   ## v2.15.0 (2026-06-14)
   - 世界杯对阵模块视觉升级: 传统左右分支 bracket tree + SVG 连线 (窗口 < 900px 时回退到垂直堆叠)
   ```
4. Commit: `docs: add bracket visual v2 to release notes`
5. **不要 push** — finishing skill 统一处理

## 完成标准

- 全部 task commit on `main`
- 测试 100% PASS, 0 回归
- Lint 干净
- 视觉验证 (subagent 截图或描述场景)

## 风险

- ResizeObserver / DOM 测量在 happy-dom 不可用 → mock
- 旧 view test selector 失效 → 一次性更新
- CSS specificity 冲突 → 加新 class, 不改旧
