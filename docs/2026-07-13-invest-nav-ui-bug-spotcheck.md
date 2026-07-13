# 2026-07-13 投资 nav 合并 — UI bug 人工 spot-check 报告

> Status: 已修。fix commits 在 `feat/i3v4-invest-nav-merge` 分支 (cf8d251 + e38533f)。
> 受影响的 main: 930a0d9 (1 commit)。

## 背景

投资 nav 合并 PR (#20) 推后, 人工 spot-check 发现 5 个 UI bug, **均未被 3906 个 vitest pass 覆盖**。
根因: happy-dom 渲不出真 JSX 嵌套 + esbuild Splitting + 真 chrome 主题, 样式 / 数据流 / cleanup 类
"运行时"问题在 happy-dom 100% 漏检。

## Bug 清单

| # | 严重度 | 现象 | 根因 | 测试盲点 | 修复 |
|---|---|---|---|---|---|
| 1 | **致命** | 投资二级 sub-tab (基金 全部/自选、选股 筛选/个股分析) 用裸 `<button>` 渲染, 无任何样式 | `SubtabList prefix="invest-sub"` + 模板 `"-subtabs"` 产出 `.invest-sub-subtabs`; CSS 命名却是 `.invest-subsubtabs` | happy-dom 不验证 class 是否有对应 CSS | CSS 改名匹配 (`invest/subsubtabs` → `invest/sub-subtabs`) |
| 2 | **致命** | 切到基金 tab 全空白 (无持仓、无历史、净值不拉) | `FundLayout` 之前持有数据加载 effect; 拆出 `FundContent` (无副作用) 后 effect 丢失, 注释谎称 "InvestLayout 接管" 但实际漏接 | happy-dom 不触发真 IPC / 真 mount 周期, 单元测试只验渲染结果 | 6 个 effect (`loadFunds/loadNavState/loadFundHistory/fetchNavNow/subscribeNavUpdates/prefetchAllNavHistory`) 搬到 `InvestLayout` useEffect |
| 3 | **中危** | metals IPC listener 反复 mount 会堆积 3 个 | `useEffect` 内 `.then()` 返回 cleanup; 外层 useEffect return `undefined`, unmount 不解绑 | happy-dom 不持久化 listener 引用, 单元测试不验副作用计数 | closure 变量 `cleanupStore` 绑到外层 return, 同时加 `cancelled` 哨兵防竞态 |
| 4 | 小 | HomeGrid 头部注释 `v5 / 7 个 tile / ⌘1-7`, ⌘ 正则 `^[1-7]$`, hero `⌘1-7` 文字; `invest` status 完全忽略选股数据 | 文档/数字跟实现漂移; stocks fallback 路径缺失 | happy-dom 不渲染文本注释, 也不验正则行为 | 全量改对, invest status 加 stocks fallback + 永远附 `对比池 N` (跨子模块统一指标) |
| 5 | 小 | `.metals-detail-pin.is-on` 第一个 `background: var(--accent-primary)` 立即被下一行 `color-mix(...)` 覆盖 | 残留写法 | 同 #4 | 删前一行 |

## 修复 commits

### `feat/i3v4-invest-nav-merge` 分支

- **`cf8d251`** `fix(invest): 二级 tab CSS class 错位 + 基金数据加载接管 + metals 生命周期 + stale 注释`
  - 5 files, +98/-47
  - 主修: InvestLayout.jsx (接管基金数据), InvestLayout.css (class 重命名 + 删重复 background), 注释/正则/⌘ 文字 5→6
  - 含: home-grid test 5→6 断言 + sidenav-prefs test 5→6 断言 (适配 main 上 newcar 集成)

- **`e38533f`** `test(invest): restore 5-tile assertion (this branch predates newcar merge)`
  - 3 files, +5/-9
  - 还原 5→6 断言 (feat 分支 navStore/SideNav/HomeGrid 都还没合 newcar, 5→6 断言会 13 fail)
  - 注释里写明: newcar 合并时再 bump 到 6

### `main` 分支

- **`930a0d9`** `fix(invest): ...` (cherry-pick from main 前的 original commit, 跟 cf8d251 内容相同)

## 教训 + 改进建议

### happy-dom 测试盲点分类

1. **CSS 错配** (Bug #1) — happy-dom 不验证 class ↔ CSS 映射
2. **mount 副作用** (Bug #2) — happy-dom 不触发真 store 初始化 / IPC
3. **cleanup 漏调用** (Bug #3) — happy-dom 单次 mount/unmount 不模拟 listener 堆积
4. **stale 文档/正则** (Bug #4) — happy-dom 渲注释但不参与行为
5. **CSS 属性覆盖** (Bug #5) — 静态分析能抓, 但 stylelint 需开启 `declaration-block-no-duplicate-properties`

### 短期止血 (本任务内可选)

- **stylelint 规则**: 开 `declaration-block-no-duplicate-properties` 抓 Bug #5 类问题
  - 一次性跑: `npx stylelint "**/*.css" --fix`
  - 配置文件加 rule, 之后再不引入
- **component test 改 mount 真实副作用**: 在 test setup 里 mock `subscribeNavUpdates` 等 store init 函数, 验证 `InvestLayout` mount 后真的被调过

### 中期防线 (建议 follow-up task)

- **加 Playwright e2e**:
  - 跑真实 Electron build (`npm run build:renderer && electron .`)
  - 覆盖主 nav → 子模块路径: 切到基金 / 切到金属 / 切到选股 / 点二级 sub-tab / 点刷新按钮
  - 起码抓 5 类 happy-dom 盲点中前 3 类
  - 投资 nav 合并 + 后续所有 nav 改动的最后一道防线
- **E2E 跑通 CI**: PR 推后自动跑 e2e, fail 直接拦

### 长期约束 (写进 docs/standards 或类似)

- "**所有 panel 顶层 layout 必须显式接管子模块数据加载 effect**" (Bug #2 教训)
  - 拆出 `*Content` 时, 把 `*Layout` 内的 useEffect 同步搬过去, 别留"注释谎称"机会
- "**所有 useEffect 内的 async / .then() 必须 closure 持 cleanup 函数, 不允许依赖内层 .then() return**" (Bug #3 教训)
  - 写一条自定义 ESLint rule 或 codemod 强制

## 验收

- feat 分支 vitest: **3905 / 3905 pass**
- PR #20: 已有 19 commits, 含本次 2 个 follow-up
- 手动 spot-check 路径:
  1. 启动 app, 点侧栏 "投资"
  2. 切到 "基金" tab — 持仓卡片应正常渲染, 净值正常拉
  3. 点 "全部/自选" 二级 tab — 应有下划线视觉切换
  4. 切到 "贵金属" tab — 行情榜应正常
  5. 切到 "选股" tab — 筛选 / 个股分析 二级 tab 应有下划线切换
  6. 点右上角 ⌘1-5, 切到 HomeGrid, 看 invest tile 状态应包含 `对比池 N`
