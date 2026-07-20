# 游戏心愿单 + 降价通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在游戏优惠页新增"关注降价"功能——GameCard 心形关注按钮 + 心愿单视图 + 后台调度器复用 6h 周期检查降价并桌面通知。

**Architecture:** 数据层（gamesStore 心愿单 CRUD + seenDrop 集合 + settings 扩展）→ 视图层（GameCard 关注按钮 + GamesPage wishlist mode）→ 调度层（games-check-scheduler 串行新增 checkWishlistDrops）。所有机制复用现有范式（localStorage 持久化、signal 状态、Notification API、settings-changed 事件解耦）。

**Tech Stack:** CommonJS、Preact Signals、Vitest、HTML5 Notification API、`vi.stubGlobal`/`vi.mock`

## Global Constraints

- 不改 aggregator/fetcher/normalize/IPC（心愿单纯 renderer 功能）。
- 不新增运行时依赖。
- 复用现有 `readStorage`/`writeStorage`/`emitSettingsChanged`/`PLATFORM_LABEL`/`fmtPrice`。
- 心愿单条目主键 `${platform}:${id}`，不跨平台合并。
- 降价判定：`currentSalePrice < addedPrice`（严格小于）。
- 免费游戏（`isFree===true`）不显示关注按钮。
- 心愿单 tab 纯本地数据，不触发网络请求。
- 未经用户明确要求，不创建 Git commit。
- 中文文案与现有模块风格一致。

---

### Task 1: gamesStore 心愿单数据层

**Files:**
- Modify: `src/renderer/games/gamesStore.js`
- Modify: `tests/renderer/games-store.test.js`

**Interfaces:**
- Produces: `wishlist` signal, `gamesHasNewDrop` signal, `gamesNotifyOnDrop` signal
- Produces: `loadWishlist()`, `addToWishlist(game)`, `removeFromWishlist(key)`, `isInWishlist(key)`, `getWishlistKey(game)`
- Produces: `loadSeenDropKeys()`, `saveSeenDropKeys(set)`, `clearGamesNewDrop()`, `setGamesNotifyOnDrop(v)`
- Extends: `MODES` 加 wishlist；`persistSettings`/`loadGamesSettings` 加 notifyOnDrop

- [ ] **Step 1: 写入失败测试**

在 `tests/renderer/games-store.test.js` 顶部 import 列表加入新符号：

```js
import {
  PLATFORMS,
  MODES,
  activePlatform,
  items,
  fx,
  wishlist,
  gamesHasNewDrop,
  gamesNotifyOnDrop,
  hasGamerPowerAttribution,
  loadGameDeals,
  loadWishlist,
  addToWishlist,
  removeFromWishlist,
  isInWishlist,
  getWishlistKey,
  loadSeenDropKeys,
  saveSeenDropKeys,
  clearGamesNewDrop,
  setGamesNotifyOnDrop,
  loadGamesSettings,
} from "../../src/renderer/games/gamesStore.js";
```

在文件末尾新增 describe 块（注意：games-store.test.js 当前无 happy-dom 环境，localStorage 操作需要先确认。先读文件头部是否有 `// @vitest-environment happy-dom`，若无需在文件首行加）：

```js
describe("gamesStore 心愿单", () => {
  beforeEach(() => {
    localStorage.clear();
    wishlist.value = [];
  });

  it("MODES 含心愿单 tab", () => {
    expect(MODES.find((m) => m.key === "wishlist")?.label).toBe("心愿单");
  });

  it("getWishlistKey 拼接 platform:id", () => {
    expect(getWishlistKey({ platform: "steam", id: "123" })).toBe("steam:123");
  });

  it("addToWishlist 写入条目并持久化", () => {
    addToWishlist({
      platform: "steam",
      id: "s1",
      title: "Test Game",
      thumb: "https://img.test/cover.jpg",
      salePrice: 19.99,
      currency: "USD",
    });
    expect(wishlist.value).toHaveLength(1);
    expect(wishlist.value[0]).toMatchObject({
      key: "steam:s1",
      platform: "steam",
      id: "s1",
      title: "Test Game",
      addedPrice: 19.99,
      currency: "USD",
    });
    expect(wishlist.value[0].addedAt).toBeTruthy();
    expect(isInWishlist("steam:s1")).toBe(true);
  });

  it("addToWishlist 同 key 去重不重复添加", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    expect(wishlist.value).toHaveLength(1);
  });

  it("removeFromWishlist 按 key 移除", () => {
    addToWishlist({ platform: "steam", id: "s1", title: "A", salePrice: 10, currency: "USD" });
    removeFromWishlist("steam:s1");
    expect(wishlist.value).toHaveLength(0);
    expect(isInWishlist("steam:s1")).toBe(false);
  });

  it("loadWishlist 从 localStorage 还原，损坏数据回退空数组", () => {
    localStorage.setItem("pulse.games.wishlist.v1", JSON.stringify([
      { key: "epic:e1", platform: "epic", id: "e1", title: "E", addedPrice: 5, currency: "USD", addedAt: "2026-07-18T00:00:00.000Z" },
    ]));
    loadWishlist();
    expect(wishlist.value).toHaveLength(1);
    expect(wishlist.value[0].title).toBe("E");

    localStorage.setItem("pulse.games.wishlist.v1", "{not json");
    loadWishlist();
    expect(wishlist.value).toHaveLength(0);
  });
});

describe("gamesStore seenDrop 集合", () => {
  beforeEach(() => localStorage.clear());

  it("loadSeenDropKeys 空时返回空 Set", () => {
    expect(loadSeenDropKeys().size).toBe(0);
  });

  it("saveSeenDropKeys / loadSeenDropKeys 往返", () => {
    const set = new Set(["steam:s1:14.99", "epic:e1:0"]);
    saveSeenDropKeys(set);
    expect(loadSeenDropKeys()).toEqual(set);
  });

  it("损坏数据返回空 Set", () => {
    localStorage.setItem("pulse.games.seenDrop.v1", "{bad");
    expect(loadSeenDropKeys().size).toBe(0);
  });
});

describe("gamesStore 降价设置", () => {
  beforeEach(() => localStorage.clear());

  it("gamesHasNewDrop 默认 false，clearGamesNewDrop 置 false", () => {
    expect(gamesHasNewDrop.value).toBe(false);
    gamesHasNewDrop.value = true;
    clearGamesNewDrop();
    expect(gamesHasNewDrop.value).toBe(false);
  });

  it("setGamesNotifyOnDrop 持久化到 settings", () => {
    setGamesNotifyOnDrop(false);
    const raw = JSON.parse(localStorage.getItem("pulse.games.settings.v1"));
    expect(raw.notifyOnDrop).toBe(false);
  });

  it("loadGamesSettings 还原 notifyOnDrop，缺失字段默认 true", () => {
    localStorage.setItem("pulse.games.settings.v1", JSON.stringify({
      autoCheck: true,
      autoCheckIntervalMin: 360,
      notifyOnFree: true,
    }));
    loadGamesSettings();
    expect(gamesNotifyOnDrop.value).toBe(true);
  });
});
```

> 注：文件首行需加 `// @vitest-environment happy-dom`（当前 games-store.test.js 无环境指令，但用了 localStorage）。实施时先 Read 文件首行确认。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/games-store.test.js -t "心愿单|seenDrop|降价设置"`

Expected: FAIL，新符号未导出。

- [ ] **Step 3: 扩展 MODES**

在 `src/renderer/games/gamesStore.js` 的 `MODES` 数组加心愿单：

```js
export const MODES = [
  { key: "deals", label: "折扣力度" },
  { key: "free", label: "免费活动" },
  { key: "wishlist", label: "心愿单" },
];
```

- [ ] **Step 4: 新增 signal 和常量**

在 signal 区（第 68 行 `gamesHasNewFree` 附近）加：

```js
// 心愿单 + 降价通知
export const wishlist = signal([]);
export const gamesHasNewDrop = signal(false);
export const gamesNotifyOnDrop = signal(true);
```

在 key 常量区（第 179-180 行 `SETTINGS_KEY`/`SEEN_FREE_KEY` 附近）加：

```js
const WISHLIST_KEY = "pulse.games.wishlist.v1";
const SEEN_DROP_KEY = "pulse.games.seenDrop.v1";
```

- [ ] **Step 5: 实现心愿单 CRUD 函数**

在 `saveSeenFreeIds` 之后（第 278 行后）加：

```js
// ── 心愿单 + 降价通知 ──────────────────────────────────────────────

/** 生成心愿单条目主键。 */
export function getWishlistKey(game) {
  return `${game.platform}:${game.id}`;
}

/** 从 localStorage 读取心愿单并填充 signal。损坏数据静默回退空数组。 */
export function loadWishlist() {
  const raw = readStorage(WISHLIST_KEY);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    wishlist.value = Array.isArray(arr) ? arr : [];
  } catch {
    wishlist.value = [];
  }
}

/** 关注一款游戏（加入心愿单）。同 key 去重。 */
export function addToWishlist(game) {
  const key = getWishlistKey(game);
  if (isInWishlist(key)) return;
  const entry = {
    key,
    platform: game.platform,
    id: game.id,
    title: game.title,
    thumb: game.thumb || null,
    addedPrice: Number(game.salePrice) || 0,
    currency: game.currency || "USD",
    addedAt: new Date().toISOString(),
  };
  wishlist.value = [...wishlist.value, entry];
  _persistWishlist();
}

/** 取消关注（移除心愿单条目）。 */
export function removeFromWishlist(key) {
  wishlist.value = wishlist.value.filter((w) => w.key !== key);
  _persistWishlist();
}

/** 判断是否已关注。 */
export function isInWishlist(key) {
  return wishlist.value.some((w) => w.key === key);
}

function _persistWishlist() {
  try {
    writeStorage(WISHLIST_KEY, JSON.stringify(wishlist.value));
  } catch {
    /* 忽略 */
  }
}

/** 读取已通知降价集合（scheduler 用于 diff）。 */
export function loadSeenDropKeys() {
  const raw = readStorage(SEEN_DROP_KEY);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

/** 持久化已通知降价集合。 */
export function saveSeenDropKeys(set) {
  try {
    writeStorage(SEEN_DROP_KEY, JSON.stringify([...set]));
  } catch {
    /* 忽略 */
  }
}

/** 用户查看心愿单后清除降价红点。 */
export function clearGamesNewDrop() {
  gamesHasNewDrop.value = false;
}

/** 设置降价通知开关。 */
export function setGamesNotifyOnDrop(v) {
  gamesNotifyOnDrop.value = !!v;
  persistSettings();
}
```

- [ ] **Step 6: 扩展 settings 持久化**

修改 `persistSettings()`（第 219 行），在 JSON 对象加 `notifyOnDrop`：

```js
// 改前
      JSON.stringify({
        autoCheck: gamesAutoCheck.value,
        autoCheckIntervalMin: gamesAutoCheckIntervalMin.value,
        notifyOnFree: gamesNotifyOnFree.value,
      }),
// 改后
      JSON.stringify({
        autoCheck: gamesAutoCheck.value,
        autoCheckIntervalMin: gamesAutoCheckIntervalMin.value,
        notifyOnFree: gamesNotifyOnFree.value,
        notifyOnDrop: gamesNotifyOnDrop.value,
      }),
```

修改 `loadGamesSettings()`（第 200 行），在末尾的 try 块加还原 notifyOnDrop：

```js
// 在 notifyOnFree 还原之后加
    if (o && typeof o.notifyOnDrop === "boolean") {
      gamesNotifyOnDrop.value = o.notifyOnDrop;
    }
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run tests/renderer/games-store.test.js`

Expected: PASS（含原有测试 + 新增心愿单测试）。

- [ ] **Step 8: 提交**

```bash
git add src/renderer/games/gamesStore.js tests/renderer/games-store.test.js
git commit -m "feat(games): wishlist data layer in gamesStore (CRUD + seenDrop + settings)"
```

---

### Task 2: GameCard 关注按钮

**Files:**
- Modify: `src/renderer/games/GameCard.jsx`
- Modify: `src/renderer/games/games.css`
- Create: `tests/renderer/GameCard-wishlist.test.jsx`

**Interfaces:**
- Produces: GameCard 封面右上角心形 toggle 按钮
- Consumes: `isInWishlist`, `addToWishlist`, `removeFromWishlist`, `getWishlistKey` from gamesStore

- [ ] **Step 1: 写入失败测试**

创建 `tests/renderer/GameCard-wishlist.test.jsx`：

```jsx
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";

vi.mock("../../src/renderer/api.js", () => ({
  api: { openUrl: vi.fn() },
}));

import {
  wishlist,
  addToWishlist,
  removeFromWishlist,
  loadWishlist,
} from "../../src/renderer/games/gamesStore.js";
import { GameCard } from "../../src/renderer/games/GameCard.jsx";

beforeEach(() => {
  localStorage.clear();
  loadWishlist();
});

function discountGame(overrides = {}) {
  return {
    id: "s1",
    platform: "steam",
    title: "Test Game",
    salePrice: 19.99,
    normalPrice: 39.99,
    savings: 50,
    currency: "USD",
    isFree: false,
    dealUrl: "https://store.steampowered.com/app/1",
    ...overrides,
  };
}

describe("GameCard 关注按钮", () => {
  it("折扣卡片显示心形关注按钮", () => {
    render(<GameCard game={discountGame()} />);
    expect(screen.getByLabelText("关注降价")).toBeTruthy();
  });

  it("点击未关注按钮加入心愿单", () => {
    render(<GameCard game={discountGame()} />);
    fireEvent.click(screen.getByLabelText("关注降价"));
    expect(wishlist.value).toHaveLength(1);
    expect(wishlist.value[0].key).toBe("steam:s1");
  });

  it("已关注时显示取消关注并点击移除", () => {
    addToWishlist(discountGame());
    render(<GameCard game={discountGame()} />);
    fireEvent.click(screen.getByLabelText("取消关注"));
    expect(wishlist.value).toHaveLength(0);
  });

  it("免费游戏不显示关注按钮", () => {
    render(<GameCard game={discountGame({ isFree: true, promotionType: "giveaway" })} />);
    expect(screen.queryByLabelText("关注降价")).toBeNull();
    expect(screen.queryByLabelText("取消关注")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/GameCard-wishlist.test.jsx`

Expected: FAIL，找不到"关注降价"按钮。

- [ ] **Step 3: 在 GameCard 加关注按钮**

在 `src/renderer/games/GameCard.jsx` 顶部 import 加 gamesStore 符号：

```js
import {
  isInWishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlistKey,
} from "./gamesStore.js";
```

在 `GameCard` 函数体内（`const isFree = game.isFree;` 之后）加关注状态和 toggle：

```js
  const favKey = getWishlistKey(game);
  const fav = isInWishlist(favKey);
  function toggleFav(e) {
    e.stopPropagation();
    if (fav) removeFromWishlist(favKey);
    else addToWishlist(game);
  }
```

在 `game-card__thumb` div 内（GameThumb 之后、sample 徽标之前）加按钮，注意只在非免费时显示：

```jsx
      <div class="game-card__thumb">
        <GameThumb thumb={game.thumb} platform={game.platform} gameId={game.id} />
        {!isFree && (
          <button
            type="button"
            class={`game-card__fav${fav ? " game-card__fav--on" : ""}`}
            aria-label={fav ? "取消关注" : "关注降价"}
            aria-pressed={fav}
            onClick={toggleFav}
          >
            {fav ? "♥" : "♡"}
          </button>
        )}
        {game.source === "sample" && (
          <span class="game-card__src" title="示例数据（非实时）">
            示例
          </span>
        )}
      </div>
```

- [ ] **Step 4: 加 CSS 样式**

在 `src/renderer/games/games.css` 末尾加（具体色值实施时先 grep 现有 CSS 确认是否用 `var(--xxx)`，若卡片其他样式用了变量则对齐）：

```css
.game-card__fav {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, transform 0.1s;
  padding: 0;
}
.game-card__fav:hover {
  background: rgba(0, 0, 0, 0.7);
  transform: scale(1.1);
}
.game-card__fav--on {
  background: rgba(220, 50, 70, 0.92);
}
.game-card__fav--on:hover {
  background: rgba(220, 50, 70, 1);
}
```

> ⚠️ 实施时必须先 Read `games.css` 末尾，确认 `.game-card__thumb` 是否已有 `position: relative`（心形按钮绝对定位需要父容器 relative）。若没有，在 `.game-card__thumb` 规则里补 `position: relative;`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/renderer/GameCard-wishlist.test.jsx`

Expected: PASS。

- [ ] **Step 6: 确认现有 GameCard 测试不回归**

Run: `npx vitest run tests/renderer/GameCard-cover.test.jsx tests/renderer/GameCard-free-events.test.jsx tests/renderer/GameCard-fx.test.jsx`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/games/GameCard.jsx src/renderer/games/games.css tests/renderer/GameCard-wishlist.test.jsx
git commit -m "feat(games): wishlist fav button on GameCard (hidden for free games)"
```

---

### Task 3: 心愿单视图（GamesPage wishlist mode）

**Files:**
- Modify: `src/renderer/games/GamesPage.jsx`
- Modify: `src/renderer/games/GamesLayout.jsx`
- Modify: `src/renderer/games/games.css`
- Modify: `tests/renderer/GamesPage-fx.test.jsx`（复用，加 wishlist 用例）

**Interfaces:**
- Produces: wishlist mode 渲染（隐藏 toolbar、渲染心愿单卡片、空态）
- Produces: GamesLayout mount 调 loadWishlist + wishlist tab 清红点

- [ ] **Step 1: 写入失败测试**

在 `tests/renderer/GamesPage-fx.test.jsx` 末尾新增 describe（复用现有 happy-dom 环境和 import）。先 Read 文件确认现有 import 有哪些 gamesStore 符号，补 `wishlist`、`loadWishlist`、`activeMode`（若未导入）：

```jsx
describe("GamesPage 心愿单视图", () => {
  beforeEach(() => {
    localStorage.clear();
    loadWishlist();
  });

  it("wishlist 模式隐藏平台 tab 和筛选栏", () => {
    activeMode.value = "wishlist";
    items.value = [];
    loading.value = false;
    error.value = null;

    const { container } = render(<GamesPage />);

    // PlatformTabs 和 GamesFilterBar 在 wishlist 模式下不渲染
    expect(container.querySelector(".games-toolbar")).toBeNull();
  });

  it("心愿单为空时显示引导文案", () => {
    activeMode.value = "wishlist";
    items.value = [];
    loading.value = false;
    error.value = null;

    render(<GamesPage />);

    expect(screen.getByText(/还没有关注任何游戏/)).toBeTruthy();
  });

  it("心愿单有条目时渲染卡片", () => {
    activeMode.value = "wishlist";
    wishlist.value = [{
      key: "steam:s1",
      platform: "steam",
      id: "s1",
      title: "Wishlisted Game",
      thumb: null,
      addedPrice: 19.99,
      currency: "USD",
      addedAt: "2026-07-18T00:00:00.000Z",
    }];
    loading.value = false;
    error.value = null;

    render(<GamesPage />);

    expect(screen.getByText("Wishlisted Game")).toBeTruthy();
  });
});
```

> 注：`activeMode.value = "wishlist"` 可能触发 store 的 setMode 逻辑，但这里直接改 signal 不走 loadGameDeals。确认 GamesPage 渲染依赖 `activeMode.value` 而非订阅。若 `items.value` 在 wishlist 模式不该被用，需让 GamesPage 在 wishlist 模式渲染 `wishlist.value`。
>
> 心愿单条目的 `addedPrice` 在 GamesPage 渲染时映射成 `salePrice`（见 Step 3），所以 GameCard 价格行正常显示关注时价格，无需额外标注行。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/GamesPage-fx.test.jsx -t "心愿单视图"`

Expected: FAIL。

- [ ] **Step 3: 修改 GamesPage 支持 wishlist mode**

在 `src/renderer/games/GamesPage.jsx` import 补 `wishlist`、`loadWishlist`、`activeMode`（若未导入；当前已导入 `activeMode` 和 `activePlatform` 见 Spec A Task 1）。

在组件内加心愿单渲染分支。结构：toolbar 区（`games-toolbar` div）只在非 wishlist 模式渲染；内容区根据 mode 分流：

```jsx
export function GamesPage() {
  const list = items.value;
  const fxSnap = fx.value;
  const isWishlist = activeMode.value === "wishlist";
  const wishList = wishlist.value;
  const isEmpty = !loading.value && !error.value &&
    (isWishlist ? wishList.length === 0 : list.length === 0);

  return (
    <div class="games-page">
      <FeatureHeader ...>{/* 保持不变 */}</FeatureHeader>

      {!isWishlist && (
        <div class="games-toolbar">
          <PlatformTabs />
          <GamesFilterBar />
        </div>
      )}

      <div class="games-body">
        {loading.value && (/* 保持 skeleton 不变 */)}
        {error.value && (/* 保持错误态不变 */)}

        {isEmpty && (/* 见 Step 3b：差异化空态 */)}

        {isWishlist && !isEmpty && (
          <div class="games-grid">
            {wishList.map((g) => (
              <GameCard
                key={g.key}
                game={{ ...g, salePrice: g.addedPrice }}
                fx={fxSnap}
              />
            ))}
          </div>
        )}

        {!isWishlist && !loading.value && !error.value && list.length > 0 && (
          <div class="games-grid">
            {list.map((g) => (
              <GameCard key={g.id} game={g} fx={fxSnap} />
            ))}
          </div>
        )}
      </div>

      {/* 署名 footer 保持不变 */}
    </div>
  );
}
```

**Step 3b: 差异化空态**——复用 Spec A 的 IIFE 模式，wishlist 模式加专属文案：

```jsx
{isEmpty && (() => {
  if (isWishlist) {
    return (
      <div class="games-state">
        <span class="games-state__icon" aria-hidden="true">💝</span>
        <span>还没有关注任何游戏，去折扣列表点 ♥ 收藏吧</span>
      </div>
    );
  }
  const noFreeSource = activeMode.value === "free" &&
    (activePlatform.value === "playstation" || activePlatform.value === "switch");
  return (
    <div class="games-state">
      <span class="games-state__icon" aria-hidden="true">🎯</span>
      {noFreeSource ? (
        <span>
          该平台暂无公开免费活动数据源
          <span class="games-state__hint">
            Epic / Steam / Xbox 的免费活动更稳定，可切换平台查看
          </span>
        </span>
      ) : (
        <span>该筛选条件下暂无优惠数据</span>
      )}
    </div>
  );
})()}
```

- [ ] **Step 4: 修改 GamesLayout 生命周期**

在 `src/renderer/games/GamesLayout.jsx` import 补 `loadWishlist`、`clearGamesNewDrop`：

```js
import {
  loadGameDeals,
  loadGamesSettings,
  loadWishlist,
  activeMode,
  clearGamesNewFree,
  clearGamesNewDrop,
} from "./gamesStore.js";
```

mount effect 内加 `loadWishlist()`：

```js
  useEffect(() => {
    loadGameDeals();
    loadGamesSettings();
    loadWishlist();   // 新增

    const scheduler = createGamesCheckScheduler();
    // ...（保持不变）
  }, []);
```

红点清除 effect 扩展（wishlist tab 清降价红点）：

```js
  useEffect(() => {
    if (activeMode.value === "free") clearGamesNewFree();
    if (activeMode.value === "wishlist") clearGamesNewDrop();
  }, [activeMode.value]);
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/renderer/GamesPage-fx.test.jsx`

Expected: PASS（含原有汇率测试 + Spec A 空态测试 + 新增 wishlist 测试）。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/games/GamesPage.jsx src/renderer/games/GamesLayout.jsx tests/renderer/GamesPage-fx.test.jsx
git commit -m "feat(games): wishlist view as third mode tab (local snapshot, no network)"
```

---

### Task 4: 调度器降价检查

**Files:**
- Modify: `src/renderer/games/games-check-scheduler.js`
- Create: `tests/renderer/games-wishlist-scheduler.test.js`

**Interfaces:**
- Produces: `checkWishlistDrops()` 在 checkOnce 内串行调用
- Produces: `_notifyDrops(drops)` 降价通知

- [ ] **Step 1: 写入失败测试**

创建 `tests/renderer/games-wishlist-scheduler.test.js`：

```js
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getGameDealsMock, notificationMock } = vi.hoisted(() => ({
  getGameDealsMock: vi.fn(),
  notificationMock: vi.fn(),
}));

vi.mock("../../src/renderer/api.js", () => ({
  api: { getGameDeals: getGameDealsMock },
}));

globalThis.Notification = notificationMock;
Notification.requestPermission = vi.fn(async () => "granted");

import {
  wishlist,
  gamesHasNewDrop,
  gamesNotifyOnDrop,
  gamesAutoCheck,
  gamesAutoCheckIntervalMin,
  gamesHasNewFree,
  gamesNotifyOnFree,
  activeMode,
  activePlatform,
  addToWishlist,
  loadSeenDropKeys,
  loadWishlist,
} from "../../src/renderer/games/gamesStore.js";
import { createGamesCheckScheduler } from "../../src/renderer/games/games-check-scheduler.js";
import { activeNav } from "../../src/renderer/worldcup/navStore.js";

function setNotificationPermission(value) {
  Object.defineProperty(Notification, "permission", {
    configurable: true,
    writable: true,
    value,
  });
}

beforeEach(() => {
  localStorage.clear();
  getGameDealsMock.mockReset();
  notificationMock.mockReset();
  notificationMock.mockImplementation(() => ({}));
  Notification.requestPermission = vi.fn(async () => "granted");
  setNotificationPermission("granted");
  gamesAutoCheck.value = true;
  gamesAutoCheckIntervalMin.value = 360;
  gamesNotifyOnFree.value = true;
  gamesNotifyOnDrop.value = true;
  gamesHasNewFree.value = false;
  gamesHasNewDrop.value = false;
  activeNav.value = "home";
  activeMode.value = "deals";
  activePlatform.value = "steam";
  loadWishlist();
});

describe("checkWishlistDrops 降价检查", () => {
  it("检测到降价时置红点并发通知", async () => {
    // 心愿单：加入时 29.99
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Drop Game",
      salePrice: 29.99,
      currency: "USD",
    });
    // 当前 deals：降到 19.99
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Drop Game",
          salePrice: 19.99,
          currency: "USD",
        }],
      };
    });

    await createGamesCheckScheduler().checkOnce();

    expect(gamesHasNewDrop.value).toBe(true);
    expect(notificationMock).toHaveBeenCalled();
    expect(notificationMock.mock.calls[0][0]).toContain("降价");
    expect(notificationMock.mock.calls[0][1].body).toContain("Drop Game");
  });

  it("未降价（currentPrice >= addedPrice）不通知", async () => {
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Stable Game",
      salePrice: 19.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Stable Game",
          salePrice: 19.99, // 同价，未降
          currency: "USD",
        }],
      };
    });

    await createGamesCheckScheduler().checkOnce();

    expect(gamesHasNewDrop.value).toBe(false);
    expect(notificationMock).not.toHaveBeenCalled();
  });

  it("同价降价只通知一次（seenDrop 去重）", async () => {
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Drop Game",
      salePrice: 29.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Drop Game",
          salePrice: 19.99,
          currency: "USD",
        }],
      };
    });

    const scheduler = createGamesCheckScheduler();
    await scheduler.checkOnce();
    await scheduler.checkOnce();

    // 第二次同价不再通知（seenDrop 含 steam:steam-1:19.99）
    expect(loadSeenDropKeys().has("steam:steam-1:19.99")).toBe(true);
    expect(notificationMock).toHaveBeenCalledTimes(1);
  });

  it("心愿单条目不在当前 deals 中时跳过（保留不动）", async () => {
    addToWishlist({
      platform: "steam",
      id: "steam-gone",
      title: "Gone Game",
      salePrice: 29.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return { ok: true, items: [] }; // deals 为空
    });

    await createGamesCheckScheduler().checkOnce();

    expect(gamesHasNewDrop.value).toBe(false);
    expect(wishlist.value).toHaveLength(1); // 条目保留
  });

  it("空心愿单时 early return 不发请求给 deals", async () => {
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return { ok: true, items: [] };
    });

    await createGamesCheckScheduler().checkOnce();

    // 只调了 free，没调 deals（心愿单空无需查 deals）
    const dealsCalls = getGameDealsMock.mock.calls.filter(
      (c) => c[0].mode === "deals",
    );
    expect(dealsCalls).toHaveLength(0);
  });

  it("gamesNotifyOnDrop=false 时不通知但仍置红点", async () => {
    gamesNotifyOnDrop.value = false;
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Drop Game",
      salePrice: 29.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Drop Game",
          salePrice: 19.99,
          currency: "USD",
        }],
      };
    });

    await createGamesCheckScheduler().checkOnce();

    expect(gamesHasNewDrop.value).toBe(true);
    expect(notificationMock).not.toHaveBeenCalled();
  });

  it("点击降价通知跳转到心愿单 tab", async () => {
    addToWishlist({
      platform: "steam",
      id: "steam-1",
      title: "Drop Game",
      salePrice: 29.99,
      currency: "USD",
    });
    getGameDealsMock.mockImplementation(async (opts) => {
      if (opts.mode === "free") return { ok: true, items: [] };
      return {
        ok: true,
        items: [{
          id: "steam-1",
          platform: "steam",
          title: "Drop Game",
          salePrice: 19.99,
          currency: "USD",
        }],
      };
    });
    const notice = {};
    notificationMock.mockImplementation(() => notice);

    await createGamesCheckScheduler().checkOnce();
    notice.onclick();

    expect(activeNav.value).toBe("games");
    expect(activeMode.value).toBe("wishlist");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/games-wishlist-scheduler.test.js`

Expected: FAIL，降价检查逻辑不存在（gamesHasNewDrop 不变、通知不发）。

- [ ] **Step 3: 在 scheduler 加 import**

在 `src/renderer/games/games-check-scheduler.js` import 区补：

```js
import {
  gamesAutoCheck,
  gamesAutoCheckIntervalMin,
  gamesNotifyOnFree,
  gamesNotifyOnDrop,
  gamesHasNewFree,
  gamesHasNewDrop,
  wishlist,
  loadSeenFreeIds,
  saveSeenFreeIds,
  loadSeenDropKeys,
  saveSeenDropKeys,
  setPlatformAndMode,
  setMode,
} from "./gamesStore.js";
import { PLATFORM_LABEL, promotionTypeLabel, fmtPrice } from "./format.js";
```

> 注：需确认 gamesStore 是否导出 `setMode`（Task 1 前已导出，第 118 行 `export function setMode`）。是。

- [ ] **Step 4: 在 checkOnce 末尾加 checkWishlistDrops 调用**

修改 `checkOnce`，把现有免费检查包进 `_checkFreeEvents`，然后串行调 `checkWishlistDrops`：

```js
  async function checkOnce() {
    try {
      await _checkFreeEvents();
    } catch {
      /* 免费检查失败不影响降价检查 */
    }
    try {
      await checkWishlistDrops();
    } catch {
      /* 降价检查失败不打扰 */
    }
  }

  async function _checkFreeEvents() {
    const res = await api.getGameDeals({ platform: "all", mode: "free" });
    if (!res || !res.ok || !Array.isArray(res.items)) return;

    const seen = loadSeenFreeIds();
    const fresh = res.items.filter((it) => !seen.has(it.id));
    if (fresh.length === 0) return;

    const merged = new Set([...seen, ...res.items.map((it) => it.id)]);
    if (merged.size > MAX_SEEN_IDS) {
      const arr = [...merged].slice(merged.size - MAX_SEEN_IDS);
      saveSeenFreeIds(new Set(arr));
    } else {
      saveSeenFreeIds(merged);
    }

    gamesHasNewFree.value = true;
    if (gamesNotifyOnFree.value) {
      _notifyNewFreeGames(fresh);
    }
  }
```

- [ ] **Step 5: 实现 checkWishlistDrops**

在 `_checkFreeEvents` 之后加：

```js
  const MAX_SEEN_DROPS = 200;

  async function checkWishlistDrops() {
    const list = wishlist.value;
    if (!Array.isArray(list) || list.length === 0) return; // 空心愿单不查 deals

    const res = await api.getGameDeals({ platform: "all", mode: "deals" });
    if (!res || !res.ok || !Array.isArray(res.items)) return;

    // 构建当前 deals 索引：${platform}:${id} → item
    const currents = new Map();
    for (const item of res.items) {
      currents.set(`${item.platform}:${item.id}`, item);
    }

    const seen = loadSeenDropKeys();
    const drops = [];
    for (const wish of list) {
      const matched = currents.get(wish.key);
      if (!matched) continue; // 条目暂未出现，保留不动
      const currentPrice = Number(matched.salePrice);
      const addedPrice = Number(wish.addedPrice);
      if (!Number.isFinite(currentPrice) || !Number.isFinite(addedPrice)) continue;
      if (currentPrice < addedPrice) {
        const seenKey = `${wish.key}:${currentPrice}`;
        if (!seen.has(seenKey)) {
          drops.push({ wish, current: matched, seenKey });
        }
      }
    }

    if (drops.length === 0) return;

    // 合并 seenDrop 集合，超限截断
    const merged = new Set([...seen, ...drops.map((d) => d.seenKey)]);
    if (merged.size > MAX_SEEN_DROPS) {
      const arr = [...merged].slice(merged.size - MAX_SEEN_DROPS);
      saveSeenDropKeys(new Set(arr));
    } else {
      saveSeenDropKeys(merged);
    }

    gamesHasNewDrop.value = true;
    if (gamesNotifyOnDrop.value) {
      _notifyDrops(drops);
    }
  }
```

- [ ] **Step 6: 实现 _notifyDrops**

在 `_notifyNewFreeGames` 之后加（复用其权限处理模式）：

```js
function _notifyDrops(drops) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") return;
    const count = drops.length;
    const titles = drops.slice(0, 2).map((d) => d.wish.title);
    const body =
      count === 1
        ? `${PLATFORM_LABEL[drops[0].wish.platform] || drops[0].wish.platform} · ${
            drops[0].wish.title
          }：${fmtPrice(Number(drops[0].wish.addedPrice), drops[0].wish.currency)} → ${
            fmtPrice(Number(drops[0].current.salePrice), drops[0].current.currency)
          }`
        : `发现 ${count} 款关注游戏降价（${titles.join("、")} 等）`;
    const send = () => {
      try {
        const n = new Notification(`游戏降价 · 发现 ${count} 款关注游戏降价`, {
          body,
          silent: false,
        });
        n.onclick = () => {
          try {
            window.focus();
            setActiveNav("games");
            setMode("wishlist");
          } catch {
            /* noop */
          }
        };
      } catch {
        /* Notification 不可用时静默 */
      }
    };
    if (Notification.permission === "granted") {
      send();
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") send();
      });
    }
  } catch {
    /* 整个通知链路失败不打扰 */
  }
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run tests/renderer/games-wishlist-scheduler.test.js`

Expected: PASS。

- [ ] **Step 8: 确认现有 scheduler 测试不回归**

Run: `npx vitest run tests/renderer/games-check-scheduler.test.js`

Expected: PASS（免费活动检查逻辑被包进 `_checkFreeEvents` 但行为不变；注意原测试的心愿单为空，checkWishlistDrops 会 early return 不影响）。

- [ ] **Step 9: 提交**

```bash
git add src/renderer/games/games-check-scheduler.js tests/renderer/games-wishlist-scheduler.test.js
git commit -m "feat(games): price drop check in scheduler (reuses 6h interval, platform:id match)"
```

---

### Task 5: 设置页降价通知 toggle + SideNav 红点

**Files:**
- Modify: `src/renderer/components/SettingsPage.jsx`
- Modify: `src/renderer/components/SideNav.jsx`
- Modify: `tests/renderer/SettingsPage.test.jsx`

**Interfaces:**
- Produces: GamesSettingsSection 新增"关注游戏降价时桌面通知"toggle
- Produces: SideNav 红点 OR 逻辑（gamesHasNewFree || gamesHasNewDrop）

- [ ] **Step 1: 写入失败测试**

在 `tests/renderer/SettingsPage.test.jsx` 末尾（现有 `describe("SettingsPage")` 块内）新增用例。现有测试用 `getByRole("tab", { name: "游戏" })` 切 tab，`getByText`/`queryByText` 断言。import 补 `gamesNotifyOnDrop`：

```js
import { gamesNotifyOnDrop } from "../../src/renderer/games/gamesStore.js";
```

在现有 describe 块末尾加：

```jsx
  it("游戏设置展示降价通知 toggle", () => {
    gamesNotifyOnDrop.value = true;
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "游戏" }));

    expect(screen.getByText("关注游戏降价时桌面通知")).toBeTruthy();
    // 默认开启状态按钮显示"已开启"
    const btn = screen.getByRole("button", { name: "已开启" });
    // 注意：免费活动通知也是"已开启"，需用更精确的定位。改用先定位 label 文本再找相邻按钮：
  });

  it("点击降价通知 toggle 翻转 gamesNotifyOnDrop", () => {
    gamesNotifyOnDrop.value = true;
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "游戏" }));

    // 用 label 文本块定位：降价通知的 settings-row 内含"关注游戏降价时桌面通知"
    const label = screen.getByText("关注游戏降价时桌面通知");
    const row = label.closest(".settings-row");
    const btn = row.querySelector("button");
    fireEvent.click(btn);

    expect(gamesNotifyOnDrop.value).toBe(false);
  });
```

> 第一个用例的按钮定位问题已由第二个用例解决（用 `.closest(".settings-row")` + `querySelector("button")` 精确定位）。第一个用例可简化为只断言文案存在。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/SettingsPage.test.jsx -t "降价通知"`

Expected: FAIL。

- [ ] **Step 3: SettingsPage 加 import 和 toggle**

在 `src/renderer/components/SettingsPage.jsx` 第 36 行附近的 import 补：

```js
  gamesNotifyOnFree, setGamesNotifyOnFree,
  gamesNotifyOnDrop, setGamesNotifyOnDrop,   // 新增
```

在 `GamesSettingsSection` 的"发现新免费活动时桌面通知" `settings-row` div（第 456-472 行）之后、`</section>` 之前加：

```jsx
      <div class="settings-row">
        <div class="settings-row__label-block">
          <span class="settings-row__label">关注游戏降价时桌面通知</span>
          <span class="settings-row__hint">
            心愿单里的游戏降价时弹桌面通知。先在游戏页点 ♥ 关注。
          </span>
        </div>
        <div class="settings-row__buttons">
          <button
            type="button"
            class={`settings-btn ${gamesNotifyOnDrop.value ? "settings-btn--primary" : "settings-btn--ghost"}`}
            onClick={() => setGamesNotifyOnDrop(!gamesNotifyOnDrop.value)}
          >
            {gamesNotifyOnDrop.value ? "已开启" : "已关闭"}
          </button>
        </div>
      </div>
```

- [ ] **Step 4: SideNav 红点 OR + tooltip 修复**

在 `src/renderer/components/SideNav.jsx` 第 32 行 import 补 `gamesHasNewDrop`：

```js
import { gamesHasNewFree, gamesHasNewDrop } from '../games/gamesStore.js';
```

第 80 行附近的订阅块加 `void gamesHasNewDrop.value;`：

```js
  void gamesHasNewFree.value;
  void gamesHasNewDrop.value;   // 新增
```

第 87 行红点改 OR：

```js
    games: (gamesHasNewFree.value || gamesHasNewDrop.value) ? 1 : 0,
```

第 67 行 tooltip 修复（Spec A 遗漏）：

```js
// 改前
    tooltip: '各平台折扣 / 免费活动 / 热门榜 (v2.81)'
// 改后
    tooltip: '各平台折扣 / 免费活动 / 心愿单'
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/renderer/SettingsPage.test.jsx`

Expected: PASS。

- [ ] **Step 6: 确认 SideNav 相关不回归**

Run: `npx vitest run tests/renderer/`

Expected: PASS（若 SideNav 有专属测试则一并跑）。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/components/SettingsPage.jsx src/renderer/components/SideNav.jsx tests/renderer/SettingsPage.test.jsx
git commit -m "feat(games): price drop notification toggle + SideNav badge OR + tooltip fix"
```

---

### Task 6: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 运行所有游戏相关测试**

Run: `npx vitest run tests/renderer/games-store.test.js tests/renderer/games-check-scheduler.test.js tests/renderer/games-wishlist-scheduler.test.js tests/renderer/GameCard-wishlist.test.jsx tests/renderer/GamesPage-fx.test.jsx tests/renderer/GameCard-cover.test.jsx tests/renderer/GameCard-free-events.test.jsx tests/renderer/GameCard-fx.test.jsx tests/renderer/SettingsPage.test.jsx tests/renderer/games-format.test.js`

Expected: PASS。

- [ ] **Step 2: 运行完整测试套件**

Run: `npx vitest run`

Expected: 0 failures（忽略预存的非 games 失败）。

- [ ] **Step 3: 构建 renderer**

Run: `npm run build:renderer`

Expected: 构建成功，退出码 0。

- [ ] **Step 4: 检查改动边界**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无尾随空白；status 只包含本计划列出的文件：
- `src/renderer/games/gamesStore.js`
- `src/renderer/games/GameCard.jsx`
- `src/renderer/games/GamesPage.jsx`
- `src/renderer/games/GamesLayout.jsx`
- `src/renderer/games/games-check-scheduler.js`
- `src/renderer/games/games.css`
- `src/renderer/components/SettingsPage.jsx`
- `src/renderer/components/SideNav.jsx`
- `tests/renderer/games-store.test.js`
- `tests/renderer/games-wishlist-scheduler.test.js`（新）
- `tests/renderer/GameCard-wishlist.test.jsx`（新）
- `tests/renderer/GamesPage-fx.test.jsx`
- `tests/renderer/SettingsPage.test.jsx`

- [ ] **Step 5: 手动验证（可选）**

启动应用，在折扣列表点某卡片的 ♥ 关注 → 切到"心愿单"tab 确认条目出现 → 设置页确认降价通知 toggle → （可选）mock 降价验证通知。
