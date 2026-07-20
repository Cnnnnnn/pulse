# 统一 UA + 跨平台比价视图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 4 个文件散落硬编码的 User-Agent 提取为 normalize.js 共享常量（#8）；新增 mode: "compare" 跨平台比价视图，跳过标题合并按价格排序（#5）。

**Architecture:** #8 是纯机械清理（normalize 导出常量 + 4 文件引用）；#5 改三层（aggregator 加 compare 分支 → register-games 白名单 → gamesStore MODES + GamesPage 渲染）。两个功能相互独立。

**Tech Stack:** CommonJS、Preact Signals、Vitest、`vi.stubGlobal("fetch")`

## Global Constraints

- 不改任何 fetcher 的请求逻辑（只改 UA 字符串来源）。
- 不改 aggregator 对 deals/free 模式的现有行为（回归保护）。
- switch.js 保留 Safari UA（Nintendo Algolia 已验证），引用为 `BROWSER_UA_SAFARI` 常量。
- compare 模式强制 platform=all，隐藏 PlatformTabs。
- 复用现有 games-grid 平铺渲染，不加分组组件。
- 未经用户明确要求，不创建 Git commit。

---

### Task 1: 统一 User-Agent 常量（#8）

**Files:**
- Modify: `src/main/games/normalize.js`
- Modify: `src/main/games/playstation.js`
- Modify: `src/main/games/switch.js`
- Modify: `src/main/games/xbox-free.js`
- Modify: `src/main/games/nintendo-image-headers.js`
- Modify: `tests/main/games/normalize.test.js`

**Interfaces:**
- Produces: `BROWSER_UA`, `BROWSER_UA_SAFARI` 导出 from normalize.js

- [ ] **Step 1: 写入失败测试**

在 `tests/main/games/normalize.test.js` 末尾新增 describe 块（先 Read 文件确认现有 import 方式）：

```js
const { BROWSER_UA, BROWSER_UA_SAFARI } = require("../../../src/main/games/normalize.js");

describe("User-Agent 常量", () => {
  it("BROWSER_UA 是 Chrome 桌面 UA", () => {
    expect(typeof BROWSER_UA).toBe("string");
    expect(BROWSER_UA).toContain("Chrome/124");
    expect(BROWSER_UA).toContain("Macintosh");
  });

  it("BROWSER_UA_SAFARI 是 Safari 桌面 UA", () => {
    expect(typeof BROWSER_UA_SAFARI).toBe("string");
    expect(BROWSER_UA_SAFARI).toContain("Safari/605.1.15");
    expect(BROWSER_UA_SAFARI).not.toContain("Chrome");
  });
});
```

> 注：先 Read normalize.test.js 顶部确认 require 路径和现有风格。该测试文件可能已有 normalize 的 require，需要合并而非重复 require。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/games/normalize.test.js -t "User-Agent 常量"`

Expected: FAIL，BROWSER_UA 未导出。

- [ ] **Step 3: 在 normalize.js 导出常量**

在 `src/main/games/normalize.js` 的 PLATFORM_META 之后（约第 21 行后）加：

```js
// ── 共享 User-Agent（避免各 fetcher 散落硬编码、版本漂移）──
// 主流桌面 Chrome UA，已被 playstation / nintendo-image-headers 验证可用。
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Safari UA：Nintendo Algolia 已验证可用，保留避免换 Chrome 后被 403。
const BROWSER_UA_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
```

在文件末尾的 `module.exports` 加这两个常量。先 Read 文件末尾确认现有 exports 结构（如 `module.exports = { toGameDeal, fetchJson, PLATFORM_KEYS, PLATFORM_META }`），追加 `BROWSER_UA, BROWSER_UA_SAFARI`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/games/normalize.test.js -t "User-Agent 常量"`

Expected: PASS。

- [ ] **Step 5: playstation.js 引用 BROWSER_UA**

在 `src/main/games/playstation.js`：

5a. 删除本地 UA 常量（第 29-30 行）：
```js
// 删除这两行
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
```

5b. 在 require 区（第 24 行 `const { toGameDeal } = require("./normalize");`）改为：
```js
const { toGameDeal, BROWSER_UA: UA } = require("./normalize");
```

> 用 `BROWSER_UA: UA` 别名，这样文件内所有 `UA` 引用不用改。先 grep 确认文件内 UA 引用次数（fetchText 的 headers 里用）。

- [ ] **Step 6: nintendo-image-headers.js 引用 BROWSER_UA**

在 `src/main/games/nintendo-image-headers.js`：

6a. 删除本地 CHROME_UA 常量（第 9-10 行）：
```js
// 删除这两行
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
```

6b. 在文件顶部加 require：
```js
const { BROWSER_UA: CHROME_UA } = require("./normalize");
```

> 用别名 `CHROME_UA` 保持文件内引用不变。

- [ ] **Step 7: xbox-free.js 引用 BROWSER_UA**

在 `src/main/games/xbox-free.js`：

7a. require 区（第 1 行）改为：
```js
const { fetchJson, toGameDeal, BROWSER_UA } = require("./normalize");
```

7b. 第 37 行和第 52 行的 `"User-Agent": "Mozilla/5.0"` 改为 `"User-Agent": BROWSER_UA`。

- [ ] **Step 8: switch.js 引用 BROWSER_UA_SAFARI**

在 `src/main/games/switch.js`：

8a. 删除本地 UA 常量（第 40-41 行）：
```js
// 删除这两行
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
```

8b. require 区（第 19 行 `const { toGameDeal } = require("./normalize");`）改为：
```js
const { toGameDeal, BROWSER_UA_SAFARI: UA } = require("./normalize");
```

- [ ] **Step 9: 运行全量 games main 测试确认不回归**

Run: `npx vitest run tests/main/games`

Expected: PASS（所有 fetcher 的 UA 引用已替换，请求行为不变）。

- [ ] **Step 10: 提交**

```bash
git add src/main/games/normalize.js src/main/games/playstation.js src/main/games/switch.js src/main/games/xbox-free.js src/main/games/nintendo-image-headers.js tests/main/games/normalize.test.js
git commit -m "refactor(games): unify User-Agent constants in normalize (BROWSER_UA + BROWSER_UA_SAFARI)"
```

---

### Task 2: aggregator compare 分支

**Files:**
- Modify: `src/main/games/aggregator.js`
- Modify: `tests/main/games/aggregator.test.js`

**Interfaces:**
- Produces: `getGameDeals({mode: "compare"})` 跳过标题合并，按 (normalizeTitle, salePrice) 排序

- [ ] **Step 1: 写入失败测试**

在 `tests/main/games/aggregator.test.js` 的 mode=free describe 块之后，新增 compare describe 块：

```js
describe("getGameDeals — mode=compare 跨平台比价", () => {
  it("保留同名跨平台条目（不合并）", async () => {
    const res = await getGameDeals({ platform: "all", mode: "compare" });
    // cheapsharkSteam 和 cheapsharkEpic 都有 "Hollow Knight"
    const hk = res.items.filter((it) => it.title === "Hollow Knight");
    expect(hk.length).toBe(2);
  });

  it("排除免费项（比价针对付费游戏）", async () => {
    const res = await getGameDeals({ platform: "all", mode: "compare" });
    expect(res.items.every((it) => !it.isFree)).toBe(true);
  });

  it("同标题条目相邻，组内按 salePrice 升序", async () => {
    const res = await getGameDeals({ platform: "all", mode: "compare" });
    // 找到 Hollow Knight 的两条，确认它们相邻且价格升序
    const titles = res.items.map((it) => it.title);
    const firstHkIdx = titles.indexOf("Hollow Knight");
    expect(titles[firstHkIdx]).toBe("Hollow Knight");
    expect(titles[firstHkIdx + 1]).toBe("Hollow Knight");
    const priceA = res.items[firstHkIdx].salePrice;
    const priceB = res.items[firstHkIdx + 1].salePrice;
    expect(priceA).toBeLessThanOrEqual(priceB);
  });

  it("deals 模式仍合并同名（回归保护）", async () => {
    const res = await getGameDeals({ platform: "all", mode: "deals" });
    const hk = res.items.filter((it) => it.title === "Hollow Knight");
    expect(hk.length).toBe(1);
  });
});
```

> 注：cheapsharkSteam 的 Hollow Knight 有两条（s1 salePrice 7.49 + s2 salePrice 9.99，但 steamAppID 相同会被 id 去重成一条），加上 cheapsharkEpic 的 Hollow Knight（salePrice 7.49）。id 去重后剩 Steam 一条 + Epic 一条 = 2 条。确认 mock 数据结构（Read 测试文件第 28-35 行）后调整断言的预期条数。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/games/aggregator.test.js -t "compare"`

Expected: FAIL，compare 模式走 deals 分支（合并了同名），Hollow Knight 条数不等于 2。

- [ ] **Step 3: aggregator 去重分支加 compare**

在 `src/main/games/aggregator.js` 第 190 行的去重分支：

```js
// 改前
  if (mode === "free") {
    items = deduped;
  } else {
    // deals/all：按 normalizeTitle 合并
    const byTitle = new Map();
    ...
  }
// 改后
  if (mode === "free" || mode === "compare") {
    items = deduped;
  } else {
    // deals/all：按 normalizeTitle 合并
    const byTitle = new Map();
    ...
  }
```

- [ ] **Step 4: aggregator 排序分支加 compare**

在 `src/main/games/aggregator.js` 第 202 行的排序分支，加 compare 专属排序：

```js
// 改前
  if (mode === "free") {
    items = items
      .filter((it) => it.isFree)
      .sort((a, b) => { ... });
  } else {
    // deals / all
    if (minSavings > 0) { ... }
    items = sortDeals(items, sort);
  }
// 改后
  if (mode === "free") {
    items = items
      .filter((it) => it.isFree)
      .sort((a, b) => { ... });  // 不变
  } else if (mode === "compare") {
    // 比价：排除免费项，同标题相邻（normalizeTitle 字典序），组内 salePrice 升序
    items = items
      .filter((it) => !it.isFree)
      .sort((a, b) => {
        const ta = normalizeTitle(a.title);
        const tb = normalizeTitle(b.title);
        if (ta !== tb) return ta < tb ? -1 : 1;
        return (a.salePrice ?? Infinity) - (b.salePrice ?? Infinity);
      });
  } else {
    // deals / all（不变）
    if (minSavings > 0) { ... }
    items = sortDeals(items, sort);
  }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/main/games/aggregator.test.js`

Expected: PASS（含新 compare 测试 + 现有 deals/free 回归测试）。

- [ ] **Step 6: 提交**

```bash
git add src/main/games/aggregator.js tests/main/games/aggregator.test.js
git commit -m "feat(games): aggregator compare mode (skip merge, sort by title+price)"
```

---

### Task 3: IPC 白名单 + 渲染层 compare mode

**Files:**
- Modify: `src/main/ipc/register-games.js`
- Modify: `src/renderer/games/gamesStore.js`
- Modify: `src/renderer/games/GamesPage.jsx`
- Modify: `src/renderer/games/GamesFilterBar.jsx`（注释修复）
- Modify: `tests/main/ipc/register-games.test.js`
- Modify: `tests/renderer/games-store.test.js`
- Modify: `tests/renderer/GamesPage-fx.test.jsx`

**Interfaces:**
- Produces: ALLOWED_MODES 加 compare；MODES 加 compare；setMode 强制 all；GamesPage compare 隐藏 PlatformTabs

- [ ] **Step 1: 写入 IPC 白名单测试**

在 `tests/main/ipc/register-games.test.js` 的 ALLOWED_MODES 测试（现有"只含 deals 和 free"用例）改为含 compare：

```js
// 改前
  it("只含 deals 和 free，不含 top", () => {
    expect(ALLOWED_MODES).toEqual(["deals", "free"]);
    expect(ALLOWED_MODES).not.toContain("top");
  });
// 改后
  it("含 deals、free、compare，不含 top", () => {
    expect(ALLOWED_MODES).toEqual(["deals", "free", "compare"]);
    expect(ALLOWED_MODES).not.toContain("top");
  });
```

- [ ] **Step 2: 写入 gamesStore 测试**

在 `tests/renderer/games-store.test.js` 的"心愿单"describe 或新增 describe 里加：

```js
describe("gamesStore 比价 mode", () => {
  beforeEach(() => {
    activePlatform.value = "steam";
  });

  it("MODES 含比价 tab", () => {
    expect(MODES.find((m) => m.key === "compare")?.label).toBe("比价");
  });

  it("setMode('compare') 强制 platform=all", async () => {
    activePlatform.value = "steam";
    api.getGameDeals.mockResolvedValue({ ok: true, items: [], sources: {} });
    setMode("compare");
    expect(activePlatform.value).toBe("all");
    expect(activeMode.value).toBe("compare");
  });
});
```

> 注：setMode 会调 loadGameDeals，需 mock api.getGameDeals（现有测试已 vi.mock api）。

- [ ] **Step 3: 写入 GamesPage 渲染测试**

在 `tests/renderer/GamesPage-fx.test.jsx` 末尾加：

```jsx
describe("GamesPage 比价视图", () => {
  beforeEach(() => {
    localStorage.clear();
    loadWishlist();
  });

  it("compare 模式隐藏 PlatformTabs 但保留 GamesFilterBar", () => {
    activeMode.value = "compare";
    activePlatform.value = "all";
    items.value = [];
    loading.value = false;
    error.value = null;

    const { container } = render(<GamesPage />);

    // PlatformTabs 隐藏
    expect(container.querySelector(".games-platform-tabs")).toBeNull();
    // GamesFilterBar（含 mode chips）保留
    expect(container.querySelector(".games-filter-bar")).toBeTruthy();
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npx vitest run tests/main/ipc/register-games.test.js tests/renderer/games-store.test.js tests/renderer/GamesPage-fx.test.jsx -t "compare|比价"`

Expected: FAIL（ALLOWED_MODES 不含 compare / MODES 不含 compare / PlatformTabs 未隐藏）。

- [ ] **Step 5: register-games 白名单加 compare**

在 `src/main/ipc/register-games.js` 的 ALLOWED_MODES：

```js
// 改前
const ALLOWED_MODES = ["deals", "free"];
// 改后
const ALLOWED_MODES = ["deals", "free", "compare"];
```

- [ ] **Step 6: gamesStore MODES + setMode 强制 all**

在 `src/renderer/games/gamesStore.js` 的 MODES 加 compare：

```js
export const MODES = [
  { key: "deals", label: "折扣力度" },
  { key: "free", label: "免费活动" },
  { key: "wishlist", label: "心愿单" },
  { key: "compare", label: "比价" },
];
```

在 `setMode` 函数（约第 118 行）加强制 all：

```js
export function setMode(m) {
  if (activeMode.value === m) return;
  activeMode.value = m;
  if (m === "compare") activePlatform.value = "all";
  loadGameDeals();
}
```

- [ ] **Step 7: GamesPage compare 隐藏 PlatformTabs**

在 `src/renderer/games/GamesPage.jsx`：

7a. 加 isCompare 派生（在 isWishlist 附近）：
```js
const isWishlist = activeMode.value === "wishlist";
const isCompare = activeMode.value === "compare";
```

7b. toolbar 渲染改为（PlatformTabs 只在非 compare 显示）：
```jsx
{!isWishlist && (
  <div class="games-toolbar">
    {!isCompare && <PlatformTabs />}
    <GamesFilterBar />
  </div>
)}
```

- [ ] **Step 8: GamesFilterBar 注释修复**

在 `src/renderer/games/GamesFilterBar.jsx` 第 2 行注释：
```js
// 改前
 * src/renderer/games/GamesFilterBar.jsx — 浏览维度 (折扣力度 / 喜+1 / 热门Top10) + 折扣门槛/排序 + 刷新。
// 改后
 * src/renderer/games/GamesFilterBar.jsx — 浏览维度 (折扣力度 / 免费活动 / 心愿单 / 比价) + 折扣门槛/排序 + 刷新。
```

- [ ] **Step 9: 运行测试确认通过**

Run: `npx vitest run tests/main/ipc/register-games.test.js tests/renderer/games-store.test.js tests/renderer/GamesPage-fx.test.jsx`

Expected: PASS。

- [ ] **Step 10: 提交**

```bash
git add src/main/ipc/register-games.js src/renderer/games/gamesStore.js src/renderer/games/GamesPage.jsx src/renderer/games/GamesFilterBar.jsx tests/main/ipc/register-games.test.js tests/renderer/games-store.test.js tests/renderer/GamesPage-fx.test.jsx
git commit -m "feat(games): compare mode in IPC whitelist + gamesStore + GamesPage (force all, hide platform tabs)"
```

---

### Task 4: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 运行所有游戏相关测试**

Run: `npx vitest run tests/main/games tests/main/ipc/register-games.test.js tests/renderer/games-store.test.js tests/renderer/GamesPage-fx.test.jsx tests/renderer/GameCard-wishlist.test.jsx tests/renderer/games-check-scheduler.test.js tests/renderer/games-wishlist-scheduler.test.js tests/renderer/SettingsPage.test.jsx`

Expected: PASS。

- [ ] **Step 2: 运行完整测试套件**

Run: `npx vitest run`

Expected: 0 failures（忽略预存的非 games 失败：home-grid 日期敏感、stock 相关）。

- [ ] **Step 3: 构建 renderer**

Run: `npm run build:renderer`

Expected: 构建成功，退出码 0。

- [ ] **Step 4: 检查改动边界**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无尾随空白；status 只包含本计划列出的文件：
- `src/main/games/normalize.js`
- `src/main/games/playstation.js`
- `src/main/games/switch.js`
- `src/main/games/xbox-free.js`
- `src/main/games/nintendo-image-headers.js`
- `src/main/games/aggregator.js`
- `src/main/ipc/register-games.js`
- `src/renderer/games/gamesStore.js`
- `src/renderer/games/GamesPage.jsx`
- `src/renderer/games/GamesFilterBar.jsx`
- 对应测试文件

- [ ] **Step 5: 手动验证（可选）**

启动应用 → 游戏页 → 切到"比价"tab → 确认 PlatformTabs 消失、同标题卡片相邻、组内价格升序。
