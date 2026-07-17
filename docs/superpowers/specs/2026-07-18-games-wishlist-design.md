# 游戏心愿单 + 降价通知设计（Spec B）

> 配套实施计划：`docs/superpowers/plans/2026-07-18-games-wishlist.md`
> 本 spec 是游戏板块 P1 价值功能，独立于 Spec A（清理批次，已合并）。

## 目标

把游戏页从"被动浏览折扣"升级为"主动价格提醒"。用户在任意折扣卡片点 ♥ 关注，后台调度器复用现有 6 小时检查周期，对比"加入时价格 vs 当前价格"，任何降价都弹桌面通知，并提供心愿单视图管理关注项。

## 非目标

- 不做目标价阈值、历史最低价徽标、跨平台比价（YAGNI，后续迭代）。
- 不改 aggregator 数据源、fetcher、normalize 字段映射。
- 不做独立调度间隔（复用 `gamesAutoCheckIntervalMin`）。
- 不做跨平台同款合并去重（按单卡片关注，主键 `${platform}:${id}`）。
- 不主动清理失效心愿单条目（活动结束/下架的条目保留，下次出现仍会通知）。
- 不为免费游戏提供关注（免费游戏无降价概念，关注按钮不显示）。

---

## 设计决策汇总

| 决策点 | 选择 | 理由 |
|---|---|---|
| 功能范围 | MVP 闭环（关注 + 通知 + 视图） | 完整价值，不过度扩展 |
| 降价判定 | 任何降价（`currentSalePrice < addedPrice`） | 简单直接，用户不想漏任何降价 |
| 去重粒度 | 按单卡片关注，主键 `${platform}:${id}` | 不会漏任一平台降价，避免跨平台误判 |
| 入口位置 | games 页内新增 mode tab | 复用现有 mode 切换，改动最小 |
| 关注按钮 | 封面右上角心形 toggle | 社交 app 常见，不占额外空间 |
| 调度机制 | 复用现有 6h 间隔，checkOnce 内串行 | 共用一次周期，省网络省复杂度 |
| 价格匹配 | 拉 all deals + 平台内 id 精确匹配 | 一次请求，依赖同平台 id 稳定性 |
| 价格显示 | 心愿单 tab 只显示快照价 | 零额外网络请求 |
| 失效条目 | 保留不动 | 不丢用户数据 |

---

## 1. 数据模型与存储

### 1.1 心愿单条目（localStorage `pulse.games.wishlist.v1`）

```js
{
  key: "steam:steam-12345",   // 主键，${platform}:${id}，同卡片关注去重
  platform: "steam",           // game.platform 快照
  id: "steam-12345",           // game.id 快照（带平台前缀，同平台内稳定）
  title: "Hollow Knight",
  thumb: "https://...",        // 封面快照（心愿单视图展示，避免重新拉数据）
  addedPrice: 19.99,           // 加入时的 salePrice 快照（降价判定基准）
  currency: "USD",
  addedAt: "2026-07-18T00:00:00.000Z"  // ISO 时间戳
}
```

存储为 JSON 数组。无上限（用户主动关注，不会爆炸增长），但读取时做防御性校验（损坏数据静默忽略，与现有 `loadGamesSettings` 一致）。

### 1.2 已通知降价集合（localStorage `pulse.games.seenDrop.v1`）

JSON 数组，元素为字符串 `${wish.key}:${currentSalePrice}`，例如 `"steam:steam-12345:14.99"`。

去重逻辑：同一游戏降到同一价格只通知一次；再降到新价格（如 9.99）是新条目，会再通知。上限 200（与现有 `seenFree.v1` 一致，超限截断保留最近的）。

### 1.3 settings 扩展（localStorage `pulse.games.settings.v1`）

在现有 `{autoCheck, autoCheckIntervalMin, notifyOnFree}` 基础上新增字段 `notifyOnDrop`（boolean，默认 true）。向后兼容：读取时缺失该字段默认 true。

---

## 2. gamesStore.js 新增 API

### 2.1 新增 signal

```js
export const wishlist = signal([]);              // 心愿单条目数组
export const gamesHasNewDrop = signal(false);    // 降价红点
export const gamesNotifyOnDrop = signal(true);   // 降价通知开关
```

### 2.2 新增常量与 key

```js
const WISHLIST_KEY = "pulse.games.wishlist.v1";
const SEEN_DROP_KEY = "pulse.games.seenDrop.v1";
const MAX_SEEN_DROP = 200;
```

### 2.3 MODES 数组扩展

```js
export const MODES = [
  { key: "deals", label: "折扣力度" },
  { key: "free", label: "免费活动" },
  { key: "wishlist", label: "心愿单" },
];
```

### 2.4 心愿单 CRUD 函数

- `loadWishlist()`：从 localStorage 读取并填充 `wishlist.value`，损坏数据静默回退空数组。
- `addToWishlist(game)`：构造条目（含 addedPrice 快照），按 `key` 去重后 push，持久化，更新 signal。
- `removeFromWishlist(key)`：按 key 过滤移除，持久化，更新 signal。
- `isInWishlist(key)`：返回 boolean，供 GameCard 判断按钮状态。
- `getWishlistKey(game)`：辅助函数，返回 `${game.platform}:${game.id}`。

### 2.5 seenDrop 集合函数（照搬 seenFree 模式）

- `loadSeenDropKeys()`：返回 `Set<string>`。
- `saveSeenDropKeys(set)`：序列化为数组存储。

### 2.6 红点与设置

- `clearGamesNewDrop()`：`gamesHasNewDrop.value = false`。
- `setGamesNotifyOnDrop(v)`：设 signal + `persistSettings()`。
- `persistSettings()` 扩展：序列化时加入 `notifyOnDrop: gamesNotifyOnDrop.value`。
- `loadGamesSettings()` 扩展：还原时读 `o.notifyOnDrop`（缺失默认 true）。

### 2.7 GamesLayout 生命周期

- mount 时：现有 `loadGameDeals()` + `loadGamesSettings()` + scheduler.start() 基础上，新增 `loadWishlist()`。
- effect 扩展：`activeMode.value === "wishlist"` 时 `clearGamesNewDrop()`（类比现有 free tab 清 `clearGamesNewFree`）。

---

## 3. GameCard 关注按钮

### 3.1 位置与形态

在 `game-card__thumb` 容器内（绝对定位右上角）新增心形 toggle 按钮：

```jsx
<div class="game-card__thumb">
  <GameThumb ... />
  {!isFree && (
    <button
      type="button"
      class={`game-card__fav${fav ? " game-card__fav--on" : ""}`}
      aria-label={fav ? "取消关注" : "关注降价"}
      aria-pressed={fav}
      onClick={(e) => { e.stopPropagation(); toggleFav(); }}
    >
      {fav ? "♥" : "♡"}
    </button>
  )}
</div>
```

- 未关注：`♡`（空心），`game-card__fav` 样式（半透明白底）
- 已关注：`♥`（实心），`game-card__fav--on` 样式（红色强调）

### 3.2 交互逻辑

```js
const key = getWishlistKey(game);
const fav = isInWishlist(key);
function toggleFav() {
  if (fav) removeFromWishlist(key);
  else addToWishlist(game);
}
```

### 3.3 不显示关注按钮的场景

- `isFree === true`：免费游戏无降价概念，不显示。
- 心愿单 tab 内的卡片**仍显示**（可取消关注从列表移除）。

### 3.4 CSS

新增 `.game-card__fav` 和 `.game-card__fav--on` 到 `games.css`：

```css
.game-card__fav {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, transform 0.1s;
}
.game-card__fav:hover { background: rgba(0, 0, 0, 0.65); transform: scale(1.1); }
.game-card__fav--on { background: rgba(220, 50, 70, 0.9); }
```

具体色值对齐现有 `games.css` 的变量风格（实施时读取现有 CSS 确认是否用 `var(--xxx)`）。

---

## 4. 心愿单视图（GamesPage）

### 4.1 mode === "wishlist" 的渲染

当 `activeMode.value === "wishlist"` 时，`GamesPage` 的内容区改为：

- **隐藏** `PlatformTabs` 和 `GamesFilterBar`（心愿单不分平台、不筛选）。
- **不调用** `loadGameDeals()`（心愿单 tab 不触发网络请求）。
- **直接渲染** `wishlist.value` 数组，每项用 `GameCard` 渲染（传入心愿单条目对象，结构兼容 game 对象）。
- **空态**：显示"还没有关注任何游戏，去折扣列表点 ♥ 收藏吧"（复用 `games-state` 样式）。

### 4.2 心愿单卡片的价格显示

心愿单条目是加入时的快照，GameCard 显示的是 `addedPrice`（关注时价格）。在卡片价格区下方加一行小字标注：

```jsx
{/* 仅心愿单 tab 内的卡片显示 */}
<div class="game-card__watched-price">关注时 {fmtPrice(game.addedPrice, game.currency)}</div>
```

不显示实时价格（用户通过降价通知得知当前价）。

### 4.3 切换到 wishlist tab

- 不触发网络请求（纯本地 signal 读取）。
- `GamesLayout` 的 effect 检测到 `activeMode === "wishlist"` 时调 `clearGamesNewDrop()`。

---

## 5. 调度器降价检查

### 5.1 在现有 checkOnce 内串行新增

不新建独立调度器。在 `games-check-scheduler.js` 的 `checkOnce()` 末尾追加 `checkWishlistDrops()`：

```
async checkOnce():
  // [现有] 免费活动检查（不变）
  await _checkFreeEvents()
  // [新增] 心愿单降价检查
  await checkWishlistDrops()
```

两个检查共用同一个 interval 和首次延迟（60s 首次，之后 6h）。任一检查失败不影响另一个（各自 try/catch 隔离）。

### 5.2 checkWishlistDrops 逻辑

```
1. list = wishlist.value（或 loadWishlist 读 localStorage）
   若 list 为空 → return
2. res = await api.getGameDeals({ platform: "all", mode: "deals" })
   若 !res.ok 或 !res.items → return
3. 构建当前 deals 索引：currents = new Map()
   for (item of res.items) currents.set(`${item.platform}:${item.id}`, item)
4. seen = loadSeenDropKeys()
   drops = []
   for (wish of list):
     matched = currents.get(wish.key)
     if (!matched) continue                    // 条目暂未出现在 deals，跳过（保留不动）
     if (Number(matched.salePrice) < Number(wish.addedPrice)):
       seenDropKey = `${wish.key}:${matched.salePrice}`
       if (!seen.has(seenDropKey)):
         drops.push({ wish, current: matched, seenDropKey })
5. 若 drops.length === 0 → return
6. 合并 seen：seen ∪ drops.map(d => d.seenDropKey)
   超过 MAX_SEEN_DROP(200) 截断保留最近的
   saveSeenDropKeys(merged)
7. gamesHasNewDrop.value = true
8. if (gamesNotifyOnDrop.value) _notifyDrops(drops)
```

### 5.3 通知发送（_notifyDrops）

复用现有 `_notifyNewFreeGames` 的 Notification 权限处理和发送模式：

- 权限 `denied` → 静默；`default` → 先 `requestPermission()`；`granted` → 直发。
- **标题**：`游戏降价 · 发现 ${count} 款关注游戏降价`
- **单条 body**：`${PLATFORM_LABEL[wish.platform]} · ${wish.title}：${fmtPrice(wish.addedPrice)} → ${fmtPrice(current.salePrice)}`
- **多条 body**：`发现 ${count} 款关注游戏降价（${titles.slice(0,3).join("、")} 等）`
- **点击**：`window.focus()` → `setActiveNav("games")` → `setMode("wishlist")`

`PLATFORM_LABEL` 和 `fmtPrice` 都从 `format.js` 导入复用（scheduler 已有 `import { PLATFORM_LABEL, ... } from "./format.js"`，照搬）。

### 5.4 失效条目处理

心愿单条目在当前 deals 索引里找不到（`currents.get(wish.key)` 返回 undefined）时，**跳过不处理**，条目保留在心愿单。下次该游戏重新出现在 deals 且降价时，仍会正常通知。

---

## 6. 设置页与红点

### 6.1 SettingsPage 新增项

在 `GamesSettingsSection` 的"发现新免费活动桌面通知"项下方，新增一项（复用现有 toggle UI 模式 `settings-btn`）：

```jsx
<div class="settings-row">
  <div class="settings-row__label">关注游戏降价时桌面通知</div>
  <button
    type="button"
    class={`settings-btn ${gamesNotifyOnDrop.value ? "settings-btn--primary" : "settings-btn--ghost"}`}
    onClick={() => setGamesNotifyOnDrop(!gamesNotifyOnDrop.value)}
  >
    {gamesNotifyOnDrop.value ? "已开启" : "已关闭"}
  </button>
</div>
```

不加独立的"心愿单自动检查开关"——复用 `gamesAutoCheck` 作为总开关（两个检查共用一次网络请求，单独关降价检查无收益）。

### 6.2 SideNav 红点

现有（SideNav.jsx）：
```js
games: gamesHasNewFree.value ? 1 : 0,
```
改为：
```js
games: (gamesHasNewFree.value || gamesHasNewDrop.value) ? 1 : 0,
```

SideNav.jsx 需新增 import `gamesHasNewDrop`，并在订阅块（`void gamesHasNewFree.value;` 附近）加 `void gamesHasNewDrop.value;` 以触发重渲染。

### 6.3 顺带修复

SideNav.jsx 第 67 行 tooltip 仍含已废弃的"热门榜"（Spec A Task 2 遗漏此处）：
```js
// 改前
tooltip: '各平台折扣 / 免费活动 / 热门榜 (v2.81)'
// 改后
tooltip: '各平台折扣 / 免费活动 / 心愿单'
```

---

## 验证

- 单元测试覆盖：
  - `gamesStore` 心愿单 CRUD（add/remove/isInWishlist/loadWishlist，含损坏数据兜底）
  - `gamesStore` seenDrop 集合读写 + 上限截断
  - `gamesStore` settings 持久化含 notifyOnDrop（向后兼容缺失字段）
  - scheduler `checkWishlistDrops`：降价判定（currentPrice < addedPrice）、去重（seenDropKey）、失效条目跳过、空心愿单 early return、notifyOnDrop=false 不通知
  - scheduler 通知点击跳转 setMode("wishlist")
- 渲染测试：
  - GameCard 关注按钮：未关注/已关注切换、免费游戏不显示
  - GamesPage wishlist mode：隐藏 toolbar、渲染心愿单卡片、空态文案
  - SettingsPage：降价通知 toggle 切换
  - SideNav：红点 OR 逻辑
- 运行完整 Vitest 套件 + `npm run build:renderer`。

---

## 改动文件清单

| 类型 | 文件 | 内容 |
|---|---|---|
| Modify | `src/renderer/games/gamesStore.js` | signal + 心愿单 CRUD + seenDrop + settings 扩展 + MODES |
| Modify | `src/renderer/games/GameCard.jsx` | 关注按钮 |
| Modify | `src/renderer/games/GamesPage.jsx` | wishlist mode 渲染 + 空态 |
| Modify | `src/renderer/games/GamesLayout.jsx` | mount 调 loadWishlist + wishlist tab 清红点 |
| Modify | `src/renderer/games/games-check-scheduler.js` | checkWishlistDrops + 通知 |
| Modify | `src/renderer/games/games.css` | `.game-card__fav` 样式 + `.game-card__watched-price` |
| Modify | `src/renderer/components/SettingsPage.jsx` | 降价通知 toggle |
| Modify | `src/renderer/components/SideNav.jsx` | 红点 OR + tooltip 修复 |
| Modify | `tests/renderer/games-store.test.js` | 心愿单 CRUD + seenDrop + settings 测试 |
| Create | `tests/renderer/games-wishlist-scheduler.test.js` | checkWishlistDrops 测试 |
| Create | `tests/renderer/GameCard-wishlist.test.jsx` | 关注按钮测试 |
| Modify | `tests/renderer/SettingsPage.test.jsx` | 降价通知 toggle 测试 |

共 **8 个修改文件 + 2 个新测试文件**（+ 2 个现有测试文件扩展）。
