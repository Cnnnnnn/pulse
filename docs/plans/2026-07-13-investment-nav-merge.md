# 投资模块导航合并 (Investment Nav Merge) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把独立的 `funds` / `metals` / `stocks` 三个顶级 nav panel 合并成单一「投资」nav 入口，采用与「新闻」完全同构的模式——一个 nav 入口 + 一个统一 header（主级子 tab：基金/贵金属/选股 + 模块内二级子 tab + 刷新/搜索）+ body 在三个模块内容体之间切换；并接通跨模块「加入选股对比池」握手。

**Architecture:** 在 `navStore` 引入 `invest` 单一 key（funds/metals/stocks 作为 legacy alias 兼容落盘），新增 `investPrimary` signal 驱动主级子 tab；`SideNav` 把三项压成一项；`LazyNavPanel` 改为动态加载新的 `InvestLayout`。`InvestLayout` + `InvestLayoutHeader` 照搬 `NewsLayout`/`NewsLayoutHeader` 的两级 `SubtabList` 结构，body 在从现有 `FundLayout/MetalLayout/StockLayout` 抽出的 `FundContent/MetalContent/StockContent`（去掉重复 nav header）之间切换。对比池握手复⽤现有 `AddToCompareButton`，金属经 `metal-config.compareCode` 映射成场内 ETF、基金仅 listed(ETF/LOF) 可入池。

**Tech Stack:** Preact + `@preact/signals`；esbuild 代码分割（`LazyNavPanel` 动态 `import()`）；现有组件 `SubtabList` / `ModalShell` / `AddToCompareButton` / `watchlist-store`；OKLCH 设计令牌（`styles.css`）；vitest + stylelint 现有工程配置。

---

## ⚠️ 前置决策（阻塞 Phase D，需产品/数据同学确认）

「对比池」是 **code 为键的权益型池**（`comparePool.normalize` 存 `pe/pb/roe/marketCap/scores`，`CompareDrawer` 用 `api.stocksSearch(code)` 反查股价）。金属/基金本身没有股票 ticker，必须映射成**可交易场内品种**才能入池。下方为合理占位默认值，**实现前必须拍板**：

| metal id | 品种 | 建议 `compareCode` | 建议 `compareName` | 备注 |
|---|---|---|---|---|
| `XAU` 现货黄金 | 华安黄金ETF | `518880` | 华安黄金ETF | 待确认 |
| `XAG` 现货白银 | 国投白银LOF | `161226` | 国投白银LOF | 待确认（原型已用） |
| `AU9999` 国内黄金 | 华安黄金ETF | `518880` | 华安黄金ETF | 同 XAU |
| `AG9999` 国内白银 | 国投白银LOF | `161226` | 国投白银LOF | 同 XAG |

基金侧「加入对比」启用条件：仅 `holding.listed === true`（ETF/LOF）。若 `holding` 模型无 `listed` 字段，按下方 Phase D Task 11 的判定规则补充。**未确认前不要动 `metal-config.js` 的真实映射值。**

---

## ⚠️ 计划修订说明（2026-07-13 三轮修订）

经三轮核对（一审→二审 R1-R8→三审 N1-N6），计划现已覆盖全部缺口。执行时以本文件为准（原 Task 编号保留，新增项用 `.5` 后缀，不破坏引用）。

### 二审修订 R1-R8
| # | 缺口 | 严重度 | 落点 |
|---|---|---|---|
| R1 | `nav-refresh.js` 无 `invest` 注册 → SideNav 刷新按钮消失 | 🔴 | 新增 **Task 3.5** |
| R2 | `StockLayout` 自带 `stock-header` + 内部 subtab，与 `InvestLayoutHeader` 二级 tab 重复（双控件） | 🔴 | 重写 **Task 8** |
| R3 | 落点跳转只改了 HomeGrid tile，遗漏键盘 / search-nav / AppShell 深链 → 点贵金属落到基金 | 🔴 | 扩 **Task 14** |
| R4 | `navStore.js:99-104` 内部 `NAV_TO_PREFS_SEGMENT` 未同步改 metals | 🟡 | 补 **Task 1 / 2** |
| R5 | `IconInvest` 在 `icons.jsx` 不存在 | 🟡 | 补 **Task 4** |
| R6 | `InvestLayoutHeader` 调 `setInvestPrimary` 但 import 漏了 | 🟡 | 补 **Task 4** |
| R7 | Task 5 的 `InvestLayout` import 的 `*Content` 在 Task 6/7/8 才创建 → 中间 commit 构建失败 | 🟡 | 调 **Phase B/C 顺序** |
| R8 | Task 1 迁移丢掉了 `trackFundView()` | 🟡 | 补 **Task 1** |

### 三审修订 N1-N6（二审引入的新不一致 + 漏网功能空壳）
| # | 缺口 | 严重度 | 落点 |
|---|---|---|---|
| N1 | Task 4 Header props 签名与 Task 5 caller 打架（二审改了 caller 没改 Header 实现） | 🔴 | 重写 **Task 4** JSX |
| N2 | `metalStore.js` 无 `metalsRefreshing` signal → Task 5 读 undefined，刷新按钮不转圈 | 🟡 | 补 **Task 7** 加 signal |
| N4 | 基金「自选」二级 tab 是空壳 —— `filteredRows` 无 watch 分支，`isFundPinned` 没人消费 | 🔴 | 重写 **Task 6** fundStore 加 watch |
| N5 | `holding.listed` 字段不存在，Task 11 一审的「先确认」会落空 | 🟡 | 重写 **Task 11** 前缀白名单函数 |
| N6 | Task 5 的 `data-primary` 属性无消费者（死代码） | 🟢 | 删 **Task 5** |

> **为什么有 N1/N2**：二审为了修 R2/R7 调了 Task 5 的 caller 签名（fundView/stockActiveTab），但没同步改 Task 4 的 Header 实现；二审写了 `metalsLoading` 但没核对 metalStore 是否导出。三审专门查这类「二审改 A 没改 B」的连锁不一致。

另：同 `compareCode` 品种（XAU/AU9999 → 518880，XAG/AG9999 → 161226）在对比池以 code 为唯一键会互相 toggle，见 **Task 9/12** 说明。

---

## Phase A — 导航模型合并

### Task 1: navStore 引入 `invest` 单一 key + `investPrimary` signal

**Files:**
- Modify: `src/renderer/worldcup/navStore.js:34-43`（`NAV_KEYS`）、`:46-49`（`LEGACY_NAV_ALIAS`）、`:53-61`（`NAV_KEYS_LIST`）、`:65-68`（`PERSISTABLE_NAV_KEYS`）、`:99-104`（**R4：内部 `NAV_TO_PREFS_SEGMENT` 同步去 metals**）、`:141-170`（`setActiveNav`）、新增 `investPrimary`/`INVEST_MODULES`/`setInvestPrimary`/`goInvest`

**Step 1: 写失败测试**

`tests/renderer/nav-store.test.js`（**并入现有文件**，不要新建 `tests/worldcup/navStore.test.js` —— 该文件不存在且会与现有 nav store 测试分裂）：
```js
// 在现有 describe 块外新增
import {
  activeNav, investPrimary, setActiveNav, goInvest, setInvestPrimary,
} from '../../src/renderer/worldcup/navStore.js';

describe('invest nav merge', () => {
  beforeEach(() => { activeNav.value = 'home'; investPrimary.value = 'funds'; });
  it('legacy funds/metals/stocks alias to invest', () => {
    setActiveNav('funds'); expect(activeNav.value).toBe('invest');
    setActiveNav('metals'); expect(activeNav.value).toBe('invest');
    setActiveNav('stocks'); expect(activeNav.value).toBe('invest');
  });
  it('goInvest sets primary + active', () => {
    goInvest('metals');
    expect(activeNav.value).toBe('invest');
    expect(investPrimary.value).toBe('metals');
  });
  it('setInvestPrimary ignores unknown', () => {
    setInvestPrimary('news'); expect(investPrimary.value).toBe('funds');
    setInvestPrimary('stocks'); expect(investPrimary.value).toBe('stocks');
  });
});
```

**Step 2: 跑测试确认失败** — `npx vitest run tests/renderer/nav-store.test.js`，期望 FAIL（`investPrimary is not exported`）。

**Step 3: 最小实现**（落在 navStore.js）
```js
// 新增信号 + 常量（放在 activeNav 定义附近，约 :31-32）
export const investPrimary = signal('funds'); // 'funds' | 'metals' | 'stocks'
export const INVEST_MODULES = ['funds', 'metals', 'stocks'];

// NAV_KEYS（:34-43）改为
const NAV_KEYS = new Set([
  'home', 'news', 'worldcup', 'invest', 'ai-usage', 'versions',
]);

// LEGACY_NAV_ALIAS（:46-49）改为
const LEGACY_NAV_ALIAS = {
  ithome: 'news', 'wechat-hot': 'news',
  funds: 'invest', metals: 'invest', stocks: 'invest',
};

// NAV_KEYS_LIST（:53-61）改为
export const NAV_KEYS_LIST = ['news', 'worldcup', 'invest', 'ai-usage', 'versions'];

// PERSISTABLE_NAV_KEYS（:65-68）改为
export const PERSISTABLE_NAV_KEYS = new Set([
  'news', 'worldcup', 'invest', 'ai-usage', 'versions',
]);

// 在 setActiveNav 之前新增 helper
export function setInvestPrimary(mod) {
  if (INVEST_MODULES.includes(mod)) investPrimary.value = mod;
}
export function goInvest(module) {
  setInvestPrimary(module || 'funds');
  setActiveNav('invest');
}

// R4: navStore.js:99-104 内部 NAV_TO_PREFS_SEGMENT 也要同步去 metals
//   (跟 SideNav.jsx 的那份是两份独立常量, isNavVisible/installNavWatch 用这份).
//   改为:
const NAV_TO_PREFS_SEGMENT = {
  versions: 'updates',
  'ai-usage': 'ai_usage',
  worldcup: 'worldcup',
  // metals 段不再控制 nav 可见性 —— 投资固定可见
};

// R8: setActiveNav 中把 funds 角标 + trackFundView 逻辑整体迁到 invest（:149-152 区域）
//   原 if (target === 'funds' && prev !== 'funds') { trackFundView(); clearFundNavBadge(); }
//   改为 (注意 trackFundView 必须保留 —— 它记录最近查看基金时间, recent 模块依赖):
if (target === 'invest' && prev !== 'invest') {
  trackFundView();
  clearFundNavBadge();
}
> ⚠️ R8: 一审计划漏掉了 `trackFundView()`. 它在 `recent/track.js` 导出, 被 HomeGrid「最近查看」tile 用.
>   切到投资入口 = 用户开始看基金, 跟原来切到 funds 语义一致, 必须保留.
```

**Step 4: 跑测试确认通过** — `npx vitest run tests/renderer/nav-store.test.js`，期望 PASS。

**Step 5: 提交**
```bash
git add src/renderer/worldcup/navStore.js tests/renderer/nav-store.test.js
git commit -m "feat(nav): add 'invest' single key + investPrimary signal, alias funds/metals/stocks"
```

---

### Task 2: SideNav 把三项压成「投资」单项

**Files:**
- Modify: `src/renderer/components/SideNav.jsx:51-56`（`NAV_TO_PREFS_SEGMENT`）、`:58-67`（`NAV_ITEMS`）、`:80-85`（`navBadges`）

**Step 1: 写失败测试**（新建 `tests/components/sideNav.test.jsx` 或并入现有）
```js
import { render } from 'preact-testing-library'; // 若工程未装，用下面 Step 3 的手测替代
// 至少断言 NAV_ITEMS 不再含 funds/metals/stocks，且含 invest
import { NAV_ITEMS } from '../../src/renderer/components/SideNav.jsx';
```
> 注：`SideNav.jsx` 当前是默认导出、含 JSX，纯函数测试较麻烦。若测试库未配置，**改为 Step 3 手动冒烟 + 提交**，不要阻塞流程。

**Step 2: 改 NAV_ITEMS**
```js
const NAV_ITEMS = [
  { key: 'news',     label: '新闻',   tooltip: 'IT 资讯 + 微博热搜 (合并 tab)' },
  { key: 'worldcup', label: '世界杯', tooltip: '2026 世界杯赛程' },
  { key: 'invest',   label: '投资',   tooltip: '基金 + 贵金属 + 选股 (合并 tab)' },
  { key: 'ai-usage', label: 'AI coding plan 用量', tooltip: 'Minimax coding plan 配额 (v2.13)' },
  { key: 'versions', label: '版本检查', tooltip: 'App 版本监控 (v2.6 主体)' },
];
```

**Step 3: 改 NAV_TO_PREFS_SEGMENT**（投资固定可见，移除 metals 段开关）
```js
const NAV_TO_PREFS_SEGMENT = {
  versions: 'updates',
  'ai-usage': 'ai_usage',
  worldcup: 'worldcup',
  // metals 段不再单独控制可见性 —— 投资为合并入口，固定可见
};
```
> ⚠️ **R4 双份常量**：`NAV_TO_PREFS_SEGMENT` 在项目里有**两份独立定义** —— 本文件（SideNav.jsx:51-56）一份，`navStore.js:99-104` 一份（被 `isNavVisible`/`installNavWatch` 用）。**两份都得去 metals**。navStore 那份已在 Task 1 Step 3 处理，本 Step 处理 SideNav 这份，勿漏。

> 产品取舍：合并后托盘菜单的「贵金属」开关失效（它现在控制整个投资入口）。若需保留，后续可在 tray 菜单加「投资」总开关。本计划默认投资固定可见，与 `news` 同级。

**Step 4: 改 navBadges**（funds 是三者中唯一有角标的）
```js
const navBadges = {
  news: newsBadge,
  invest: fundUnreadBadge.value,   // 原 funds 角标迁到投资入口
  'ai-usage': aiUsageNavBadge.value,
};
```

**Step 5: 手动冒烟** — `npm run dev`（或现有预览脚本），点 SideNav 应只出现「投资」一项，无 funds/metals/stocks 三项。

**Step 6: 提交**
```bash
git add src/renderer/components/SideNav.jsx
git commit -m "feat(sidenav): collapse funds/metals/stocks into single 'invest' entry"
```

---

### Task 3: LazyNavPanel 改投 `invest`

**Files:**
- Modify: `src/renderer/components/LazyNavPanel.jsx:9-21`（`LOADERS`）

**Step 1: 改 LOADERS**
```js
const LOADERS = {
  news: () => import('../news/NewsLayout.jsx').then((m) => m.NewsLayout),
  worldcup: () =>
    import('../worldcup/WorldcupLayout.jsx').then((m) => m.WorldcupLayout),
  invest: () =>
    import('../invest/InvestLayout.jsx').then((m) => m.InvestLayout),
  'ai-usage': () =>
    import('./AIUsageLayout.jsx').then((m) => m.AIUsageLayout),
};
```
> 删除 funds/metals/stocks 三行。`versions` 仍走内置 `VersionsLayout`，不变。

**Step 2: 静态校验** — `npx eslint src/renderer/components/LazyNavPanel.jsx`（确认无未使用 import / 语法）。

**Step 3: 提交**
```bash
git add src/renderer/components/LazyNavPanel.jsx
git commit -m "feat(lazynav): load InvestLayout for merged 'invest' nav"
```

---

### Task 3.5: nav-refresh.js 注册 `invest`（R1：合并后刷新按钮消失）

> 🔴 **R1 关键缺口**：`SideNav.jsx:148` 刷新按钮显隐由 `REFRESHABLE_NAV_KEYS` 决定，该集合 = `nav-refresh.js:47 REGISTRY` 的 keys（当前 `news/worldcup/funds/metals`）。合并后 `activeNav==='invest'`，registry 无此 key → **整个投资面板的 SideNav 刷新按钮直接消失**。一审 Task 13 文本误把这件事归到 CSS Task，实际是 nav-refresh 注册 + InvestLayout 接线，必须单列。

**Files:**
- Modify: `src/renderer/nav-refresh.js:19-24`（imports）、`:47-52`（`REGISTRY`）

**Step 1: 写失败测试**（并入 `tests/renderer/nav-refresh.test.js`）
```js
import { describe, it, expect } from 'vitest';
import { getRefreshEntry, REFRESHABLE_NAV_KEYS } from '../../src/renderer/nav-refresh.js';

describe('invest refresh registry', () => {
  it('invest is refreshable', () => {
    expect(REFRESHABLE_NAV_KEYS.has('invest')).toBe(true);
    expect(getRefreshEntry('invest')).toBeTruthy();
    expect(getRefreshEntry('invest').label).toMatch(/投资|基金|金属|选股/);
  });
  it('legacy funds/metals no longer registered', () => {
    expect(REFRESHABLE_NAV_KEYS.has('funds')).toBe(false);
    expect(REFRESHABLE_NAV_KEYS.has('metals')).toBe(false);
  });
});
```

**Step 2: 实现** — `invest` 的 refresh 按 `investPrimary` signal 派发（与 `refreshNews` 按 DOM data-subtab 派发同型）
```js
// imports 增加
import { investPrimary } from './worldcup/navStore.js';
// fetchNavNow / refreshMetals 已 import, 无需新增

// invest refresh: 按当前主级子 tab 派发到对应模块 store
function refreshInvest() {
  const primary = investPrimary.value;
  if (primary === 'funds') return fetchNavNow(api);
  if (primary === 'metals') return refreshMetals();
  // stocks: 选股无"一键刷新"语义 (静默刷新由 stockStore 内部 60s tick 驱动), 返回 resolved
  return Promise.resolve(true);
}

// REGISTRY 改为 (删 funds/metals 两行, 加 invest):
const REGISTRY = {
  news: { fn: () => refreshNews(), label: '刷新当前新闻子 tab' },
  worldcup: { fn: () => refreshWorldcupScores(), label: '刷新世界杯比分' },
  invest: { fn: () => refreshInvest(), label: '刷新当前投资子模块' },
};
```
> 选股无显式 refresh：`stockStore` 的 `startRefreshTimer` 已在 `StockLayout` mount 时跑 60s 静默 tick，用户进 tab 就在自动刷。`refreshInvest` 对 stocks 返回 resolved 不报错。

**Step 3: 跑测试确认通过** — `npx vitest run tests/renderer/nav-refresh.test.js`。

**Step 4: 提交**
```bash
git add src/renderer/nav-refresh.js tests/renderer/nav-refresh.test.js
git commit -m "feat(nav-refresh): register 'invest' keyed by investPrimary, drop funds/metals"
```

---

## Phase B — InvestLayout 外壳 + 统一 Header

> ⚠️ R7 顺序调整：原计划 Task 4(Header) → Task 5(Layout, import *Content) → Task 6/7/8(抽 Content)。Task 5 的 import 在 6/7/8 前不存在 → 中间 commit 构建失败。**调整执行顺序为 Task 4 → Task 6 → Task 7 → Task 8 → Task 5**（Header 先、三个 Content 次之、InvestLayout 最后缝合）。Task 编号不变，仅执行次序调整。

### Task 4: 新建 InvestLayoutHeader（两级子 tab，照搬 NewsLayoutHeader）

**Files:**
- Create: `src/renderer/invest/InvestLayoutHeader.jsx`

**Step 1: 写失败测试**（轻量：导出常量即可）
```js
import { INVEST_PRIMARY_TABS, FUND_VIEW_TABS, STOCK_VIEW_TABS } from '../../src/renderer/invest/InvestLayoutHeader.jsx';
import { describe, it, expect } from 'vitest';
describe('invest header tabs', () => {
  it('primary has 3 modules', () => {
    expect(INVEST_PRIMARY_TABS.map(t=>t.key)).toEqual(['funds','metals','stocks']);
  });
  it('fund secondary + stock secondary defined', () => {
    expect(FUND_VIEW_TABS.map(t=>t.key)).toEqual(['all','watch']);
    expect(STOCK_VIEW_TABS.map(t=>t.key)).toEqual(['screen','diagnosis']);
  });
});
```

**Step 2: 实现**（结构镜像 `NewsLayoutHeader.jsx`，两级 `SubtabList`）

> ⚠️ **R5**：`icons.jsx` **没有 `IconInvest`**（有 `IconCoin`/`IconBarChart`/`IconTrendingUp`/`NavIcon`）。二选一：
>   - (a) 在 `icons.jsx` 新增 `IconInvest`（推荐，与 `IconNews` 对称）；
>   - (b) 复用 `IconCoin`（金币图标，语义最接近投资总入口）。
> 下方代码用 (b) 兜底；若选 (a)，先在 icons.jsx 加 `export function IconInvest({size=18}){...}` 再 import。
>
> ⚠️ **R6**：下方 import 必须含 `setInvestPrimary`（JSX `:264` 调用了它，一审漏了）。

```jsx
import { investPrimary, setInvestPrimary } from '../worldcup/navStore.js';
import { stockActiveTab } from '../stocks/diagnosisStore.js';
import { IconCoin as IconInvest, IconRefresh } from '../components/icons.jsx';
import { SubtabList } from '../components/SubtabList.jsx';

export const INVEST_PRIMARY_TABS = [
  { key: 'funds', label: '基金' },
  { key: 'metals', label: '贵金属' },
  { key: 'stocks', label: '选股' },
];
export const FUND_VIEW_TABS = [
  { key: 'all', label: '全部' },
  { key: 'watch', label: '自选' },
];
export const STOCK_VIEW_TABS = [
  { key: 'screen', label: '筛选' },
  { key: 'diagnosis', label: '个股分析' },
];

// N1: props 签名对齐 Task 5 caller —— fundView/onFundViewChange (基金全部/自选),
//     选股二级 tab 不透传 (Header 直接读写 stockActiveTab), 刷新态由 Task 5 算好透传 refreshing,
//     无统一 search (三模块搜索维度不同, 各模块内部自带的搜索框保留).
export function InvestLayoutHeader({ fundView, onFundViewChange, onRefresh, refreshing }) {
  const primary = investPrimary.value;
  return (
    <header class="invest-header">
      <div class="invest-header-row">
        <div class="invest-header-brand">
          <span class="invest-header-icon" aria-hidden="true"><IconInvest size={18} /></span>
          <h2 class="invest-header-title">投资</h2>
        </div>
        <div class="invest-header-actions">
          <button type="button" class={`invest-refresh-btn${refreshing ? ' is-loading' : ''}`}
            onClick={onRefresh} disabled={refreshing} aria-label="刷新当前投资子模块">
            <span class="invest-refresh-icon" aria-hidden="true"><IconRefresh size={14} /></span>
          </button>
        </div>
      </div>
      <div class="invest-header-row invest-header-row-tabs">
        <SubtabList prefix="invest" tabs={INVEST_PRIMARY_TABS} activeKey={primary}
          onChange={(k) => { setInvestPrimary(k); }} ariaLabel="投资模块切换">
          {(t) => <span>{t.label}</span>}
        </SubtabList>
        {primary === 'funds' && (
          <SubtabList prefix="invest-sub" tabs={FUND_VIEW_TABS} activeKey={fundView}
            onChange={onFundViewChange} ariaLabel="基金视图切换">
            {(t) => <span>{t.label}</span>}
          </SubtabList>
        )}
        {primary === 'stocks' && (
          <SubtabList prefix="invest-sub" tabs={STOCK_VIEW_TABS} activeKey={stockActiveTab.value}
            onChange={(k) => { stockActiveTab.value = k; }} ariaLabel="选股视图切换">
            {(t) => <span>{t.label}</span>}
          </SubtabList>
        )}
      </div>
    </header>
  );
}
```
> 主级用 `prefix="invest"`（分段胶囊，重）；二级用 `prefix="invest-sub"`（下划线 tab，轻），两类共用同一套 `.invest-subtabs`/`.invest-subtab` 样式，视觉完全一致，层级分明。
>
> **N1 签名约定**（Header 与 Task 5 InvestLayout 的契约）：
> - `fundView: 'all' | 'watch'` + `onFundViewChange(k)` —— 基金二级 tab，由 InvestLayout 持有 signal 透传
> - 选股二级 tab —— Header 自读自写 `stockActiveTab`（单一真相，见 Task 8），不经 props
> - `onRefresh` + `refreshing` —— 刷新由 Task 5 接 `refreshActiveNav('invest')`，refreshing 按 primary 读对应 loading signal
> - **无 search/onSearchChange/refreshLabel** —— 投资三模块搜索维度不同（基金搜代码/名称、金属无搜索、选股有独立搜索框），不强行合并。各模块内部搜索框保留。副标题「更新于 xxx」二期再接。

**Step 3: 跑测试确认通过** — `npx vitest run tests/renderer/invest-header.test.js`（Step 1 文件）。

**Step 4: 提交**
```bash
git add src/renderer/invest/InvestLayoutHeader.jsx tests/renderer/invest-header.test.js
git commit -m "feat(invest): InvestLayoutHeader with two-level subtabs (mirror NewsLayoutHeader)"
```

---

### Task 5: 新建 InvestLayout（body 按 investPrimary 切换）

> ⚠️ **R7 顺序**：本 Task 在 Task 6/7/8 之后执行（import 的 `*Content` 此时已存在）。原计划把它放 Task 4 之后会构建失败。

**Files:**
- Create: `src/renderer/invest/InvestLayout.jsx`
- 依赖 Task 6/7/8 的 `FundContent`/`MetalContent`/`StockContent`

**Step 1: 实现**

关键调整（相对一审）：
- **选股二级 tab 用 `stockActiveTab` signal 作单一真相**（Task 8 约定），不再走 `subView.stock`。`InvestLayoutHeader` 的 `STOCK_VIEW_TABS` `onChange` 直接写 `stockActiveTab`（见 Task 4 实现）。
- **接真实 refresh**（呼应 Task 3.5）：`onRefresh` 调 `refreshActiveNav('invest')`，`refreshing` 按 `investPrimary` 读对应模块 loading signal。
- **无统一 search**（见 Task 4 N1 约定）：各模块内部搜索框保留，Header 不渲染搜索框。

> ⚠️ **N2 metals 无 loading signal**：`metalStore.js` 导出的只有 `schedulerState`（`{status, lastFetch, nextFetch}`）+ `refreshNow()` 函数，**没有 `metalsLoading`**。两个选择：
>   - (a) **推荐**：在 `metalStore.js` 的 `refreshNow` 里维护 `metalsRefreshing` signal（进 fn 设 true、finally 设 false），刷新按钮才有 loading 态；
>   - (b) 退一步：metals 刷新不显 loading（按钮点了无视觉反馈，体验差）。
> 下方代码用 (a)，需在 Task 7 抽 `MetalContent` 时同步给 `metalStore.js` 加 `metalsRefreshing` signal。

```jsx
import { investPrimary } from '../worldcup/navStore.js';
import { refreshActiveNav } from '../nav-refresh.js';
import { fundsLoading, fundView } from '../funds/fundStore.js'; // fundsLoading:73; fundView: N4 Task6 新增
import { metalsRefreshing } from '../metals/metalStore.js';     // N2: Task 7 新增
import { FundContent } from '../funds/FundLayout.jsx';
import { MetalContent } from '../metals/MetalLayout.jsx';
import { StockContent } from '../stocks/StockLayout.jsx';
import { InvestLayoutHeader } from './InvestLayoutHeader.jsx';

export function InvestLayout() {
  const primary = investPrimary.value;
  // refresh 态按主级子 tab 读对应模块 loading signal (与 refreshInvest 派发同源)
  const refreshing = primary === 'funds' ? fundsLoading.value
                   : primary === 'metals' ? metalsRefreshing.value
                   : false; // stocks 无全局 loading (静默刷新由 stockStore 内部 tick, 不闪按钮)

  return (
    <div class="invest-layout">
      <InvestLayoutHeader
        fundView={fundView.value}
        onFundViewChange={(k) => { fundView.value = k; }}
        onRefresh={() => refreshActiveNav('invest')}
        refreshing={refreshing}
      />
      <div class="invest-body">
        {primary === 'funds' && <FundContent />}
        {primary === 'metals' && <MetalContent />}
        {primary === 'stocks' && <StockContent />}
      </div>
    </div>
  );
}
```
> **N6**：一审/二审加的 `data-primary={primary}` 属性已删 —— `refreshInvest` 用 `investPrimary.value`（signal，不走 DOM），键盘导航在 Header 内部也不读 body data 属性，该属性无消费者。
>
> **fundsLoading 已确认真实**（`fundStore.js:73 export const fundsLoading`）。`metalsRefreshing` 需 Task 7 在 `metalStore.js` 新增（见 N2）。

**Step 2: 静态校验** — `npx eslint src/renderer/invest/InvestLayout.jsx`。
      </div>
    </div>
  );
}
```

**Step 2: 静态校验** — `npx eslint src/renderer/invest/InvestLayout.jsx`。

**Step 3: 提交**
```bash
git add src/renderer/invest/InvestLayout.jsx
git commit -m "feat(invest): InvestLayout shell switching FundContent/MetalContent/StockContent"
```

---

## Phase C — 抽离模块内容体（去掉重复 nav header）

> 目标：现有 `FundLayout/MetalLayout/StockLayout` 当前各自作为顶级 nav panel。合并后它们只作为 body 内容，`InvestLayoutHeader` 已是唯一 nav header。若某 Layout 自己渲染了 nav 级 header，必须移除，避免「双层 header」。先盘点再改。

### Task 6: FundLayout → 导出 FundContent + fundStore 加自选过滤（⚠️ N4）

> ⚠️ **N4 功能空壳**：一审/二审假设「`subView==='watch'` 复用现有自选逻辑」。核对代码后发现：`watchlist-store.js:21 isFundPinned(code)` **存在**，但 `FundCardGrid` 用的是 `fundStore.filteredRows`（computed，只按 `activeCategory` + `searchQuery` 过滤），**没有 watch 分支** —— 「自选」tab 点了仍显示全部基金。本 Task 必须在 fundStore 真正实现 watch 过滤。

**Files:**
- Modify: `src/renderer/funds/FundLayout.jsx`
- Modify: `src/renderer/funds/fundStore.js:119-135`（`filteredRows` computed）—— **N4 新增 watch 分支**
- Modify: `src/renderer/funds/FundCardGrid.jsx`（消费 watch 过滤结果）

**Step 1: 盘点**
```bash
grep -n "header\|Header\|FeatureHeader\|InvestLayout\|nav" src/renderer/funds/FundLayout.jsx
grep -n "FundHero\|fund-hero-title\|<h1\|<h2" src/renderer/funds/FundHero.jsx
grep -n "filteredRows\|isFundPinned\|watch" src/renderer/funds/fundStore.js src/renderer/funds/FundCardGrid.jsx
```

**盘点结论（已核对代码）**：
- `FundLayout` **无独立 nav header**，直接渲染 `FundHero`（内含 `<h2 class="fund-hero-title">基金管理</h2>` + 持仓概览数字）。这是**内容级 Hero**，合并后保留。
- `CategoryTabs`（基金类型分类）与 `FUND_VIEW_TABS`（全部/自选）**是两个不同维度**，可共存。
- **watch 过滤逻辑不存在** —— `filteredRows`（`fundStore.js:119`）只按 category/search 过滤，无 watch 分支。

**Step 2: N4 — fundStore 加 fundView signal + filteredRows watch 分支**
```js
// fundStore.js 顶部 signals 区新增 (与 activeCategory 同级)
export const fundView = signal('all'); // 'all' | 'watch'  ← 跟 InvestLayout 的 fundView 同名同义

// filteredRows (fundStore.js:119) 改为 —— 先算 category/search, 再叠 watch:
export const filteredRows = computed(() => {
  let rows = rowsWithMetrics.value;
  const cat = activeCategory.value;
  if (cat !== "all") {
    rows = rows.filter((r) => (r.holding && r.holding.category) === cat);
  }
  const q = (searchQuery.value || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const h = r.holding || {};
      const n = (h.name || "").toLowerCase();
      const c = h.code || "";
      return n.includes(q) || c.includes(q);
    });
  }
  // N4: watch 视图叠一层 isFundPinned 过滤
  if (fundView.value === 'watch') {
    rows = rows.filter((r) => isFundPinned(r.holding && r.holding.code));
  }
  return rows;
});
```
> import 补 `import { isFundPinned } from '../watchlist/watchlist-store.js'`。
> **fundView signal 单一真相**：放 fundStore（不是 InvestLayout 本地 signal）。InvestLayout/InvestLayoutHeader/FundContent 都读写 `fundView.value`，跟选股的 `stockActiveTab` 同型。Task 5 的 `const fundView = signal('all')` 相应**删除**，改 import `fundView` from fundStore。

**Step 3: 抽离 FundContent**
- 把当前 `FundLayout` 的渲染体包进 `export function FundContent() { ... }`（**无需 subView prop** —— 直接订阅 `fundView.value`，FundCardGrid 已通过 `filteredRows` 自动响应）。
- `FundLayout` 出口删除或改为 `FundContent` 别名占位（grep 全局确认无其它 import `FundLayout`）。

**Step 4: grep 确认无残留引用**
```bash
grep -rn "FundLayout" src/ --include=*.jsx --include=*.js | grep -v "FundLayout.jsx"
```
期望只剩 `InvestLayout.jsx` 的 `FundContent` 导入。

**Step 5: 提交**
```bash
git add src/renderer/funds/FundLayout.jsx src/renderer/funds/fundStore.js src/renderer/funds/FundCardGrid.jsx
git commit -m "refactor(funds): extract FundContent + add watch filter to filteredRows (N4)"
```

### Task 7: MetalLayout → 导出 MetalContent + metalStore 加 `metalsRefreshing`（N2）

**Files:**
- Modify: `src/renderer/metals/MetalLayout.jsx`
- Modify: `src/renderer/metals/metalStore.js:111`（`refreshNow`）

**Step 1: 盘点** — `grep -n "header\|Header\|MetalHeader"` 确认 `MetalHeader` 是内容级（非 nav 级），保留。

**Step 2: N2 — metalStore 加 `metalsRefreshing` signal**
> `refreshNow`（`metalStore.js:111`）当前无 loading 态。Task 5 的 `InvestLayout` 要读 `metalsRefreshing` 让刷新按钮转圈。改动：
```js
// metalStore.js 顶部 signals 区新增
export const metalsRefreshing = signal(false);

// refreshNow 改为维护该 signal
export async function refreshNow() {
  if (!window.metalsApi) return;
  metalsRefreshing.value = true;
  try {
    const r = await window.metalsApi.fetchNow();
    if (r && r.quotes) quoteCache.value = r.quotes;
    if (r && r.fx) fxCache.value = r.fx;
    if (r && r.historyMap) historyMap.value = r.historyMap;
  } finally {
    metalsRefreshing.value = false;
  }
}
```

**Step 3: 抽离 MetalContent** — 导出 `MetalContent`，保留 `MetalHeader + Watchlist + Modal`（Modal 由 Task 10 补操作行）。`MetalLayout` 出口删除或改名。

**Step 4: grep 确认无残留 `MetalLayout` 引用。**

**Step 5: 提交**
```bash
git add src/renderer/metals/MetalLayout.jsx src/renderer/metals/metalStore.js
git commit -m "refactor(metals): extract MetalContent + add metalsRefreshing signal (N2)"
```

### Task 8: StockLayout → 导出 StockContent（⚠️ R2：解决双控件，去 stock-header）

> 🔴 **R2 关键缺口**：`StockLayout.jsx` 自带 `stock-header`（h1「选股」+ 副标题 + AI推荐/筛选按钮）**和** `stock-toolbar` 里的 `STOCK_SUBTABS`（筛选/个股分析 WAI-ARIA tablist）。而 Task 4 的 `InvestLayoutHeader` 又定义了 `STOCK_VIEW_TABS`（筛选/个股分析）作二级 tab。**两者直接重复** —— 合并后选股视图会出现两套筛选/个股分析 tab + 两个标题。一审说「保留内部 subtab」没说清边界，本 Step 重写。

**Files:**
- Modify: `src/renderer/stocks/StockLayout.jsx:44-47`（`STOCK_SUBTABS`）、`:102-156`（`stock-header` + `stock-toolbar`）、`:79-100`（静默刷新 effect）、`:158-181`（panel body）

**Step 1: 盘点**（已核对代码）
- `stock-header`（`:104-132`）：h1「选股」+ 副标题 + AI 推荐按钮 + 筛选按钮 —— **这是 nav 级 header，必须移除**（`InvestLayoutHeader` 接管标题；筛选/AI 按钮下移到 panel body 工具位）。
- `stock-toolbar`（`:134-156`）：`STOCK_SUBTABS` 的 WAI-ARIA tablist —— **这是与 `InvestLayoutHeader.STOCK_VIEW_TABS` 重复的二级 tab，移除控件，但保留 `stockActiveTab` signal 作单一真相**。
- 静默刷新 effect（`:84-100`）+ 「进 tab 不自动筛选」语义 —— **必须保留**。
- `onSubtabKeyDown`（`:52-69`）键盘导航逻辑 —— 迁到 `InvestLayoutHeader` 二级 tab（Task 14），本 Task 不删函数，只断开 `stock-toolbar` 对它的调用。

**Step 2: 抽离 StockContent**

核心：**`StockContent` 不再渲染任何 header / subtab 控件，只渲染 panel body + 静默刷新 effect + drawer**。二级 tab 的「当前选中」由 `InvestLayoutHeader` 驱动 `stockActiveTab` signal，`StockContent` 订阅它决定显示哪个 panel。

```jsx
// 保留 imports: useEffect / stockActiveTab / runScreenSilent / silentRefreshTick / results / startRefreshTimer / stopRefreshTimer / api / 各 panel 组件 + drawer
// 删除 imports: STOCK_SUBTABS 不再导出常量 ( InvestLayoutHeader 的 STOCK_VIEW_TABS 接管 ); IconSearch/IconSparkles/IconTrendingUp 若仅 stock-header 用则删

export function StockContent() {
  // 静默刷新 effect —— 原样保留 (startRefreshTimer + tick 订阅 + runScreenSilent)
  useEffect(() => { /* :84-90 原样 */ }, [api]);
  useEffect(() => { /* :94-100 原样 */ }, [silentRefreshTick.value]);

  const tab = stockActiveTab.value; // 订阅 signal —— InvestLayoutHeader 二级 tab 改它
  return (
    <div class="stock-layout">
      {/* 筛选/AI 按钮从 stock-header 下移到工具位 (保留功能, 换位置) */}
      <div class="stock-toolbar-actions">
        <button type="button" class="stock-btn-icon" disabled={loading.value}
          onClick={() => openAdvise()} aria-label="AI 推荐筛选条件" title="AI 推荐筛选条件">
          <IconSparkles size={16} />
        </button>
        <button type="button" class="stock-btn stock-btn-primary" disabled={loading.value}
          onClick={() => runScreen(api)}>
          {loading.value ? '筛选中…' : (<><IconSearch size={14} /> 筛选</>)}
        </button>
      </div>
      {tab === 'diagnosis' ? (
        <div id="stock-panel-diagnosis" role="tabpanel"><StockDiagnosisPage api={api} /></div>
      ) : (
        <div id="stock-panel-screen" role="tabpanel" aria-labelledby="stock-tab-screen" class="stock-body">
          <div class="stock-filters"><StrategyBar /><CriteriaPanel /></div>
          <div class={aiAdviseOpen.value ? 'stock-results stock-results-pad-drawer' : 'stock-results'}>
            <ResultTable api={api} />
          </div>
        </div>
      )}
      <AiAdviseDrawer api={api} />
      <CompareDrawer api={api} />
      <ComparePoolButton />
    </div>
  );
}
// StockLayout 出口: export { StockContent as StockLayout } 占位, 或直接删 (grep 确认 LazyNavPanel 不再 import)
```

> **单一真相约定**：`stockActiveTab`（`diagnosisStore.js`）是选股二级 tab 的唯一 state。`InvestLayoutHeader` 的 `STOCK_VIEW_TABS` 二级 tab `onChange` 直接 `stockActiveTab.value = k`（不是 `onSubViewChange`）。这样 `StockContent` 不需要 `subView` props，`InvestLayout` 也不用维护第二份 stock 状态。Task 4 的 `STOCK_VIEW_TABS` `onChange` 回调相应改为读/写 `stockActiveTab`。

**Step 3: grep 确认无残留 `StockLayout` 引用 + 无 `STOCK_SUBTABS` 旧引用**
```bash
grep -rn "StockLayout\|STOCK_SUBTABS" src/ --include=*.jsx --include=*.js | grep -v "StockLayout.jsx"
```

**Step 4: 提交**
```bash
git add src/renderer/stocks/StockLayout.jsx
git commit -m "refactor(stocks): extract StockContent, drop stock-header + dedupe subtabs (single source: stockActiveTab)"
```

---

## Phase D — 跨模块对比池握手

### Task 9: metal-config 加 `compareCode` / `compareName`（⚠️ 前置决策确认后）

**Files:**
- Modify: `src/metals/metal-config.js:15-60`
- Modify: `tests/metals/metal-config.test.js`（**已存在**，测 history 字段；在本文件追加 compare 用例，不要新建）

**Step 1: 写失败测试**（追加到现有 `tests/metals/metal-config.test.js`）
```js
import { METALS } from '../../src/metals/metal-config.js';
import { describe, it, expect } from 'vitest';
describe('metal compare mapping', () => {
  it('each metal has compareCode or flagged non-listed', () => {
    for (const m of METALS) {
      const has = typeof m.compareCode === 'string' && m.compareCode.length > 0;
      expect(has || m.noCompare === true).toBe(true);
    }
  });
  it('XAU/AU9999 share compareCode, XAG/AG9999 share compareCode', () => {
    // 同 compareCode 是有意为之 —— 见 Step 2 去重说明
    const byCode = {};
    for (const m of METALS) {
      if (!m.compareCode) continue;
      (byCode[m.compareCode] ||= []).push(m.id);
    }
    expect(byCode['518880']).toEqual(expect.arrayContaining(['XAU', 'AU9999']));
    expect(byCode['161226']).toEqual(expect.arrayContaining(['XAG', 'AG9999']));
  });
});
```

**Step 2: 实现**（用前置决策表的值；未确认前先写 `noCompare` 占位，确认后填 `compareCode`）
```js
const METALS = [
  { id:'XAU', /* …现有字段… */, compareCode:'518880', compareName:'华安黄金ETF' },
  { id:'XAG', /* … */, compareCode:'161226', compareName:'国投白银LOF' },
  { id:'AU9999', /* … */, compareCode:'518880', compareName:'华安黄金ETF' },
  { id:'AG9999', /* … */, compareCode:'161226', compareName:'国投白银LOF' },
];
```

> ⚠️ **同 compareCode 去重约定**（XAU/AU9999 → 518880，XAG/AG9999 → 161226）：对比池以 `code` 为唯一键（`comparePool.js:35 hasCode`），同 code 的第二个品种 `toggleCompare` 会**移除**第一个而非新增。这是预期行为 —— XAU 和 AU9999 映射到同一只 ETF，本就是同一标的。UX 上需在 Task 10 体现：`MetalDetail` 的「加入对比」按钮若该 compareCode 已在池中（由另一品种加入），应显示「已在对比池」而非误以为可加。`AddToCompareButton` 内部已用 `isInCompare(code)` 判断，天然正确 —— 无需额外代码，但 PR 描述需写明此约定避免误判为 bug。

**Step 3: 跑测试确认通过** — `npx vitest run tests/metals/metal-config.test.js`。

**Step 4: 提交**
```bash
git add src/metals/metal-config.js tests/metals/metal-config.test.js
git commit -m "feat(metals): add compareCode/compareName mapping to listed ETFs"
```

### Task 10: MetalDetail 加操作行（加入自选 + 加入对比）

**Files:**
- Modify: `src/renderer/metals/MetalDetail.jsx:17-23`（imports）、`:194` 起（`MetalDetail` 组件）、`:245-260`（Modal 内）

**Step 1: 写失败测试**（轻量）
```js
import { isMetalPinned } from '../../src/renderer/watchlist/watchlist-store.js';
// 仅断言 MetalDetail 接受 onClose 且含操作按钮容器（DOM 查询）
```
> 若测试库未配，Step 3 手动冒烟替代。

**Step 2: 实现**
```jsx
// imports 增加
import { api } from '../api.js';
import { isMetalPinned, addWatchlistItem, removeWatchlistItem } from '../watchlist/watchlist-store.js';
import { AddToCompareButton } from '../stocks/AddToCompareButton.jsx';
import { getMetalById } from '../../metals/metal-config.js'; // 已在文件内，复用

// MetalDetail 内新增
const pinned = isMetalPinned(metal.id);
const onPin = () => pinned
  ? removeWatchlistItem({ type:'metal', ref: metal.id })
  : addWatchlistItem({ type:'metal', ref: metal.id });
const compareEntry = {
  kind: 'metal',
  code: metal.compareCode,
  name: metal.compareName || metal.name,
  price: refCNY ?? null,
  changePct: quote ? changePct : null,
};

// 在 Modal header 下方 / body 顶部插入操作行
<div class="metals-detail-actions">
  <button type="button" class={`metals-detail-pin${pinned?' is-on':''}`} onClick={onPin}>
    {pinned ? '★ 已自选' : '☆ 加入自选'}
  </button>
  {metal.compareCode
    ? <AddToCompareButton entry={compareEntry} variant="card" api={api} />
    : <span class="metals-detail-nocmp" title="无对应场内 ETF">不可比</span>}
</div>
```
> `AddToCompareButton` 会在缺价时自动 `api.stocksSearch(code)` 补价（ETF code 合法），无需手动补。

**Step 3: 手动冒烟** — 打开贵金属 Modal，应见「加入自选」+「加入对比」；点「加入对比」后右下对比池角标 +1，kind 标记为金属。

**Step 4: 提交**
```bash
git add src/renderer/metals/MetalDetail.jsx
git commit -m "feat(metals): MetalDetail action row — watchlist + compare-pool handshake"
```

### Task 11: FundCard 加「加入对比」（仅 listed 启用，⚠️ N5 写明判定函数）

> ⚠️ **N5**：一审 Step 1 说「先 grep `holding.listed`，若存在直接用」。核对代码确认：holding 模型（`fundStore.js` + 主进程持久化）**只有 `code/name/category`，无 `listed` 字段**。holding code 是 6 位数字（如 000001 场外、161226 场内 LOF）。本 Step 直接写死前缀白名单判定，不依赖不存在的字段。

**Files:**
- Modify: `src/renderer/funds/FundCard.jsx:11-12`（imports）、`:96-133`（action 按钮区）
- Create（或并入 fundStore）：`isListedFundCode(code)` 纯函数 + 单测

**Step 1: 写 listed 判定函数 + 失败测试**
```js
// fundStore.js 新增 (或新建 funds/listed-code.js) —— 纯函数, 易测
// 沪深 ETF/LOF 代码前缀:
//   沪市 ETF: 510/511/512/513/515/516/517/518/520/56x/58x  (51/56/58 开头)
//   深市 ETF/LOF: 15x/16x/18x  (15/16/18 开头)
//   场外开放式基金: 0/1 开头但不在上述区间 (000xxx/001xxx/110xxx 等) → 不算 listed
const LISTED_PREFIXES = ['51', '56', '58', '15', '16', '18'];

export function isListedFundCode(code) {
  if (typeof code !== 'string' || code.length !== 6) return false;
  return LISTED_PREFIXES.some((p) => code.startsWith(p));
}
```
```js
// tests/funds/listed-code.test.js
import { describe, it, expect } from 'vitest';
import { isListedFundCode } from '../../src/renderer/funds/fundStore.js';

describe('isListedFundCode', () => {
  it('ETF/LOF 代码判 true', () => {
    expect(isListedFundCode('518880')).toBe(true);  // 华安黄金ETF (沪)
    expect(isListedFundCode('161226')).toBe(true);  // 国投白银LOF (深)
    expect(isListedFundCode('161125')).toBe(true);  // LOF
    expect(isListedFundCode('512480')).toBe(true);  // ETF
  });
  it('场外开放式基金判 false', () => {
    expect(isListedFundCode('000001')).toBe(false); // 华夏成长 (场外)
    expect(isListedFundCode('001102')).toBe(false);
    expect(isListedFundCode('110011')).toBe(false);
  });
  it('非法输入安全 false', () => {
    expect(isListedFundCode('')).toBe(false);
    expect(isListedFundCode(null)).toBe(false);
    expect(isListedFundCode('123')).toBe(false);
  });
});
```

**Step 2: 跑测试** — `npx vitest run tests/funds/listed-code.test.js`（先失败后通过）。

**Step 3: FundCard 接入**
```jsx
// imports 增加
import { AddToCompareButton } from '../stocks/AddToCompareButton.jsx';
import { api } from '../api.js';
import { isListedFundCode } from './fundStore.js';

// 组件内 —— 用前缀白名单判定, 不依赖 holding.listed
const listed = isListedFundCode(holding.code);
const compareEntry = {
  kind: 'fund',
  code: holding.code,
  name: holding.name,
  marketValue: metrics && metrics.marketValue,
  profitPct: metrics && metrics.profitPct,
};
// 在 action 按钮区（关注/编辑/删除之后）追加
{listed && (
  <AddToCompareButton entry={compareEntry} variant="row" api={api} />
)}
{!listed && (
  <button type="button" class="fund-card-action-btn" disabled title="场外开放式基金无场内可比标的">对比</button>
)}
```
> `AddToCompareButton` 的 `entry.code` 对 listed 基金即交易所 ticker，`stocksSearch` 能 enrich；场外禁用并 tooltip 说明。
> **PR 描述须写明**：listed 判定 = 沪深 ETF/LOF 代码前缀白名单（51/56/58/15/16/18 开头），不依赖 holding 模型字段，新增场内代码段需更新 `LISTED_PREFIXES`。

**Step 4: 手动冒烟** — 仅 listed 基金（如 161226/161125/518880）出现可用「加入对比」；场外基金（000001 等）按钮禁用。

**Step 5: 提交**
```bash
git add src/renderer/funds/FundCard.jsx src/renderer/funds/fundStore.js tests/funds/listed-code.test.js
git commit -m "feat(funds): FundCard 'add to compare' for listed ETF/LOF (prefix whitelist, N5)"
```

### Task 12: comparePool 存 `kind` + 抽屉 badge

**Files:**
- Modify: `src/renderer/stocks/comparePool.js:108-130`（`normalize`）、`src/renderer/stocks/CompareDrawer.jsx`（渲染 badge）

**Step 1: 写失败测试**
```js
import { toggleCompare, comparePool } from '../../src/renderer/stocks/comparePool.js';
import { describe, it, expect, beforeEach } from 'vitest';
describe('compare kind', () => {
  beforeEach(() => { comparePool.value = []; });
  it('stores kind for metal/fund entries', () => {
    toggleCompare({ kind:'metal', code:'518880', name:'华安黄金ETF' });
    expect(comparePool.value[0].kind).toBe('metal');
    toggleCompare({ kind:'fund', code:'161226', name:'国投白银LOF' });
    expect(comparePool.value[1].kind).toBe('fund');
  });
});
```

**Step 2: normalize 加 kind**
```js
function normalize(entry) {
  return {
    code: entry.code,
    name: entry.name || entry.code,
    kind: entry.kind || 'stock',   // 新增：'stock' | 'metal' | 'fund'
    price: entry.price ?? null,
    changePct: entry.changePct ?? null,
    industry: entry.industry ?? null,
    pe: entry.pe ?? null,
    pb: entry.pb ?? null,
    roe: entry.roe ?? null,
    marketCap: entry.marketCap ?? null,
    scores: entry.scores ? { overall: entry.scores.overall ?? null, dimensions: entry.scores.dimensions || {} } : null,
    addedAt: Date.now(),
  };
}
```

**Step 3: CompareDrawer 渲染 badge**（在 `CompareDrawer.jsx` 行渲染处，按 `c.kind` 输出）
```jsx
const KIND_BADGE = { fund:'基金', metal:'金属', stock:'股票' };
const KIND_CLS  = { fund:'kind-fund', metal:'kind-metal', stock:'kind-stock' };
// 每行左侧：<span class={`kind-badge ${KIND_CLS[c.kind]}`}>{KIND_BADGE[c.kind]}</span>
```
> `code` 仍是唯一键（ETF/LOF/股票 ticker 不冲突），数据结构零改动，仅展示层加 `kind`。

**Step 4: 跑测试确认通过。**

**Step 5: 提交**
```bash
git add src/renderer/stocks/comparePool.js src/renderer/stocks/CompareDrawer.jsx tests/stocks/compare-kind.test.js
git commit -m "feat(compare): store entry.kind + render source badge in drawer"
```

---

## Phase E — 样式 / 响应式 / a11y / HomeGrid

### Task 13: 投资 header 样式（继承 news-header，分级清晰）

**Files:**
- Modify: `styles.css` 或对应组件 CSS（项目用 `styles.css` 主令牌 + 组件级 css）

**Step 1: 提取 `.invest-header*` 样式** — 复制 `news-header` 系列，命名改为 `invest-header`；新增：
```css
/* 主级：分段胶囊（重） */
.invest-subtabs { display:inline-flex; gap:4px; }
.invest-subtab { /* 同 news-subtab：accent 填充选中态 */ }
.invest-subtab-active { background: var(--accent-primary); color:#fff; }
/* 二级：下划线 tab（轻） */
.invest-subsubtabs { display:inline-flex; gap:14px; margin-left:16px; }
.invest-subsubtab { background:none; border:none; padding:4px 0; color:var(--text-tertiary); border-bottom:2px solid transparent; }
.invest-subsubtab-active { color:var(--accent-primary); border-bottom-color:var(--accent-primary); }
```
> 主级与二级视觉权重拉开，基金(全部/自选)与选股(筛选/个股分析)共用 `.invest-subsubtab`，完全一致。

**Step 2: 遵守设计令牌** — 颜色走 `--accent-primary`/`--text-tertiary` 等 OKLCH 令牌，**禁止裸 hex**（Stylelint `color-no-hex`）。涨红跌绿用 `--color-up`/`--color-down`。

**Step 3: 浅/深色** — 默认浅色毛玻璃；`[data-theme="dark"]` 下表面提亮表达层级（沿用项目现规范）。

**Step 4: 提交**
```bash
git add styles.css
git commit -m "style(invest): invest header tokens, primary pill + secondary underline subtabs"
```

### Task 14: 键盘导航 + reduced-motion + 全部落点改 goInvest（⚠️ R3）

> 🔴 **R3 关键缺口**：一审只改了 `HomeGrid.jsx:472` 的 tile `onClick`。但同样的「跳到 funds/metals/stocks」还有 3 处，经 `LEGACY_NAV_ALIAS` 会归一到 `'invest'` 但**不设 `investPrimary`** → 点「贵金属」却落到默认的「基金」。本 Step 把 4 处全部改 `goInvest`。

**Files:**
- Modify: `src/renderer/invest/InvestLayoutHeader.jsx`（主级 ←/→ 切换）
- Modify: `src/renderer/components/HomeGrid.jsx:472`（tile onClick）、`:356-363`（⌘1-7 键盘导航）
- Modify: `src/renderer/search/search-nav.js:7,54`（fund 搜索结果跳转）
- Modify: `src/renderer/components/AppShell.jsx:54,59`（⌘⇧F / ⌘⇧M 深链）

**Step 1: 主级键盘导航** — 在 `InvestLayoutHeader` 主级 `SubtabList` 容器加 `onKeyDown`：←/→ 切 `investPrimary`（复用 Task 8 从 StockLayout 迁出的 `onSubtabKeyDown` 逻辑）。

**Step 2: reduced-motion** — 所有 header/卡片过渡包 `@media (prefers-reduced-motion: reduce)` 归零（项目既有约定）。

**Step 3: HomeGrid 落点**（推荐保留 3 个 tile 各跳对应模块，体验最佳）
```jsx
// HomeGrid.jsx:472 tile onClick
import { goInvest } from '../worldcup/navStore.js';
onClick={() => goInvest(tile.key)} // tile.key 仍是 'funds'/'metals'/'stocks', goInvest 设 primary + active

// HomeGrid.jsx:356-363 ⌘1-7 键盘导航 (这处一审完全漏了!)
//   原: setActiveNav(orderedTiles[idx].key);
//   改: 按 tile.key 决定走 goInvest 还是 setActiveNav
const tileKey = orderedTiles[idx].key;
if (tileKey === 'funds' || tileKey === 'metals' || tileKey === 'stocks') {
  goInvest(tileKey);
} else {
  setActiveNav(tileKey);
}
```
> HomeGrid 的 `getStatus`（`:66-90`）/ `getBadge`（`:160`）/ `getMeta`（`:222-238`）按 funds/metals/stocks key 读各模块 store —— 这些是「读」不是「跳」，**无需改**（tile 元数据仍按 3 个 key 维护，只是点击行为走 goInvest）。

**Step 4: search-nav 落点**（`search-nav.js:54`，搜索结果点基金条目跳转）
```js
// 原: import { setActiveNav } from '../worldcup/navStore.js';
//      case 'fund': setActiveNav('funds'); ...
// 改:
import { goInvest } from '../worldcup/navStore.js';
//      case 'fund': goInvest('funds'); ...
```

**Step 5: AppShell 深链**（`AppShell.jsx:52-61`，⌘⇧F 跳基金 / ⌘⇧M 跳金属）
```js
// 原: setActiveNav('funds'); / setActiveNav('metals');
// 改:
import { goInvest } from '../worldcup/navStore.js';
goInvest('funds');  // :54
goInvest('metals'); // :59
```
> `AppShell.jsx:80` 的 `nav === 'funds'` 判断搜索框 focus id —— 合并后 nav 永远是 `'invest'`，改为 `nav === 'invest'` 且按 `investPrimary` 决定 focus 哪个搜索框（基金→fund-search-input，金属无搜索框，选股→选股内部搜索框）。一期可简化为 `nav === 'invest'` 时 focus `fund-search-input`（最常用），二期按 primary 细分。

**Step 6: 提交**
```bash
git add src/renderer/invest/InvestLayoutHeader.jsx src/renderer/components/HomeGrid.jsx \
        src/renderer/search/search-nav.js src/renderer/components/AppShell.jsx
git commit -m "a11y(invest): keyboard nav + reduced-motion + wire all nav entry points to goInvest"
```

---

## Phase F — 验证与收尾

### Task 15: 全量校验 + 现有测试不回归

**Step 1: lint** — `npx stylelint "styles.css" "src/**/*.css"` 确认无 `color-no-hex` 违规；`npx eslint src/renderer/invest src/renderer/funds/FundCard.jsx src/renderer/metals/MetalDetail.jsx` 无错误。

**Step 2: 单测** — `npx vitest run`（全量），确认既有 `news`/`stocks`/`funds`/`metals` 测试 **不回归**（重点关注 `navStore` 旧 `funds`/`metals`/`stocks` 引用点是否清空）。

**Step 3: 构建** — `npm run build`（esbuild），确认 `invest` chunk 独立生成、funds/metals/stocks 旧 chunk 消失。

**Step 4: 手动冒烟清单**
- [ ] SideNav 仅剩「投资」单项；点开默认基金。
- [ ] **R1**：投资面板下 SideNav 顶部刷新按钮**存在**；点刷新按当前子模块（基金→拉净值、金属→拉行情）派发。
- [ ] **N2**：切到金属子模块点刷新 → 按钮转 loading 态（`metalsRefreshing` 生效），不止静默。
- [ ] 主级 基金/贵金属/选股 切换无双层 header；二级 tab 仅基金(全部/自选)、选股(筛选/个股分析) 出现。
- [ ] **R2**：选股视图下只有**一套**筛选/个股分析 tab（在 InvestLayoutHeader），StockContent 内无重复 tab 控件、无「选股」h1；筛选/AI 按钮下移到 panel 工具位仍可用。
- [ ] **N4**：基金「自选」二级 tab 切换后，列表**只剩 pinned 基金**（用 watchlist 加几只基金验证），非空壳。
- [ ] **N1**：InvestLayoutHeader 的基金二级 tab 切全部/自选 → 列表响应（fundStore.fundView 单一真相贯通 Header↔Layout↔FundContent）。
- [ ] 选股进页**不**自动筛选；点「筛选」才出结果。
- [ ] 贵金属点行弹 Modal（非侧栏）；Modal 有「加入自选」+「加入对比」。
- [ ] **N5**：基金卡片 —— listed（161226/518880）可「加入对比」、场外（000001）按钮禁用且有 tooltip。
- [ ] 对比池右下角标随三类入口增长；抽屉按 kind 显示徽标；满 4 禁加。
- [ ] **同 compareCode**：先加 XAU（518880）再加 AU9999，池中仍只有一条 518880（toggle 移除而非新增），按钮态正确显示「已在对比池」。
- [ ] **R3**：HomeGrid 点「贵金属」tile → 落到贵金属子模块（非基金）；⌘⇧M 同；搜索结果点基金条目 → 落到基金子模块。
- [ ] HomeGrid ⌘1-7 键盘导航：数字键对应 funds/metals/stocks tile 时落到正确子模块。
- [ ] 浅/深色切换正常；reduced-motion 下无动画。

**Step 5: 提交（收尾）**
```bash
git add -A && git commit -m "chore(invest): full validation pass — lint, tests, build green"
```

---

## 风险与注意
1. **双层 header 反模式**（R2 已在 Task 8 解决）：`StockLayout` 的 `stock-header` 必须移除，`stock-toolbar` 的 subtab 控件必须删（由 `InvestLayoutHeader` 接管，单一真相 `stockActiveTab`）。`FundHero` 的 h2 是内容级保留。
2. **tray 菜单 metals 开关失效**：合并后投资固定可见（Task 2 取舍）。注意 `tray.js:198 buildMetalsLines`（tray 下拉显示金价）是独立功能，**不受影响、不要误删**。若产品要保留 nav 显隐控制，需在托盘菜单新增「投资」总开关——本计划未含，列为 follow-up。
3. **数据映射未确认**：Task 9 的真实 `compareCode` 必须等产品/数据同学拍板，计划内为占位默认值。
4. **listed 判定**（N5 已在 Task 11 解决）：holding 模型**无 `listed` 字段**，用前缀白名单（51/56/58/15/16/18 开头）判定，新增场内代码段需更新 `LISTED_PREFIXES`，PR 描述写明。
5. **同 compareCode 去重**（Task 9 已说明）：XAU/AU9999 → 518880，XAG/AG9999 → 161226，对比池以 code 为键会互相 toggle，是预期行为。
6. **nav-refresh 注册**（R1 已在 Task 3.5 解决）：合并后 `activeNav==='invest'`，必须在 `nav-refresh.js` 注册 `invest`，否则 SideNav 刷新按钮消失。
7. **落点全覆盖**（R3 已在 Task 14 解决）：4 处跳转（HomeGrid tile / HomeGrid ⌘1-7 / search-nav / AppShell 深链）必须全改 `goInvest`，否则点贵金属落到基金。
8. **metals 刷新 loading 态**（N2 已在 Task 7 解决）：`metalStore.js` 原无 `metalsRefreshing`，Task 7 在 `refreshNow` 里补 signal 维护。
9. **基金自选过滤**（N4 已在 Task 6 解决）：`filteredRows` 原无 watch 分支，`isFundPinned` 无人消费。Task 6 在 fundStore 加 `fundView` signal + `filteredRows` 叠 watch 过滤。`fundView` 是单一真相（Header↔Layout↔FundContent 共用），勿在 InvestLayout 本地另建。
10. **Header/Layout 签名一致性**（N1 已在 Task 4 解决）：InvestLayoutHeader props = `{ fundView, onFundViewChange, onRefresh, refreshing }`，选股 tab 走 `stockActiveTab`（不经 props），无 search/refreshLabel。改 Header 必须同步 Task 5 caller。

## 执行交接
计划已完成二审修订并保存到 `docs/plans/2026-07-13-investment-nav-merge.md`。**修订后执行顺序**：

```
Phase A: Task 1 → 2 → 3 → 3.5(R1新增)
Phase B: Task 4 → (Phase C 的 6→7→8) → 5    ← R7 顺序调整: Content 先于 Layout
Phase C: Task 6 → 7 → 8(R2重写)
Phase D: Task 9 → 10 → 11 → 12
Phase E: Task 13 → 14(R3扩)
Phase F: Task 15
```

两种执行方式：

**1. Subagent-Driven（本会话）** — 我按 task 逐个派发 fresh subagent，task 间做 code review，快速迭代。
**2. Parallel Session（独立会话）** — 新会话用 @superpowers:executing-plans 批量执行，带 checkpoint。

选哪种？
