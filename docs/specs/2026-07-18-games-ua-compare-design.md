# 统一 UA + 跨平台比价视图设计（Spec C）

> 配套实施计划：`docs/superpowers/plans/2026-07-18-games-ua-compare.md`
> 本 spec 覆盖 P2 两项：#8 统一 UA 常量 + #5 跨平台比价视图。
> #6 全平台史低徽标作为 Spec D 独立设计（需接 cheapshark /games + ITAD /prices 新接口）。

## 目标

1. **#8 统一 UA**：把 4 个文件散落硬编码、版本号不一致的 User-Agent 提取为 `normalize.js` 的共享常量，消除维护时的版本漂移风险。
2. **#5 跨平台比价视图**：新增 `mode: "compare"`，跳过跨平台标题合并，按价格排序展示同一游戏在各平台的报价，让用户一眼看到哪个平台最便宜。

## 非目标

- 不改任何 fetcher 的请求逻辑（只改 UA 字符串来源）。
- 不改 aggregator 对 deals/free 模式的现有行为。
- 不做"按标题分组"的比价 UI（平铺网格，同标题自然相邻）。
- 不做史低徽标（Spec D）。
- 不新增数据源或 fetcher。
- 不引入运行时依赖。

---

## 设计决策汇总

| 决策点 | 选择 | 理由 |
|---|---|---|
| UA 统一策略 | Chrome UA 统一 + Safari UA 保留 | Nintendo Algolia 已验证 Safari UA 可用，不冒险换 Chrome |
| compare 平台范围 | 强制 platform=all + 隐藏 PlatformTabs | 单平台比价无意义 |
| compare 卡片展示 | 平铺网格按价格排序 | 复用现有 games-grid，零新组件 |
| compare 排序 | 组内 salePrice 升序、组间按组最低价升序 | 最便宜的游戏和平台排最前 |
| compare mode chip | 复用 GamesFilterBar 的 MODES chips | 加 MODES 项即自动出现 |

---

## 1. 统一 User-Agent 常量（#8）

### 1.1 现状

4 个文件各自硬编码 UA，版本号不一致：

| 文件 | 行号 | 当前 UA | 用途 |
|---|---|---|---|
| `playstation.js` | 31 | Chrome 124.0 | PSGameSpider + SSR |
| `switch.js` | 42 | Safari 605.1.15 / Version 17.0 | Nintendo Algolia |
| `xbox-free.js` | 37, 52 | 极简 `"Mozilla/5.0"`（2 处） | Microsoft reco/catalog |
| `nintendo-image-headers.js` | 9 | Chrome 124.0.0.0 | 图片请求头改写 |

### 1.2 方案

在 `normalize.js` 导出两个常量：

```js
// 主流桌面浏览器 UA（已被 playstation/nintendo 验证可用）
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Safari UA（Nintendo Algolia 已验证，保留避免破坏兼容性）
const BROWSER_UA_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

module.exports = { ..., BROWSER_UA, BROWSER_UA_SAFARI };
```

### 1.3 各文件替换

- `playstation.js`：删除本地 `UA` 常量（第 29-30 行），import `BROWSER_UA`，引用处改名。
- `nintendo-image-headers.js`：删除本地 UA（第 9 行），import `BROWSER_UA`。
- `xbox-free.js`：2 处 `"Mozilla/5.0"` → `BROWSER_UA`（统一成完整浏览器 UA，更安全；Microsoft API 对 UA 不敏感，升级不会破坏功能）。
- `switch.js`：删除本地 `UA` 常量（第 40-41 行），import `BROWSER_UA_SAFARI`。

### 1.4 为什么不全部统一成一个 UA

`switch.js` 的 Safari UA 是实测验证过的——Nintendo Algolia 校验来源（配合 Origin/Referer 头），强行换 Chrome 有被 403 的风险。保留 Safari UA 但从 normalize 导出，既统一了来源（不再散落）又避免破坏已验证的兼容性。

---

## 2. 跨平台比价视图（#5）

### 2.1 数据层

#### register-games.js

`ALLOWED_MODES` 加 `"compare"`：

```js
const ALLOWED_MODES = ["deals", "free", "compare"];
```

#### aggregator.js

在 `getGameDeals` 的去重分支（第 190 行）加 compare 处理。当前逻辑：

```js
if (mode === "free") {
  items = deduped;
} else {
  // deals/all：按 normalizeTitle 合并
  const byTitle = new Map();
  ...
}
```

改为三分支：

```js
if (mode === "free" || mode === "compare") {
  items = deduped;  // free 和 compare 都不做标题合并
} else {
  // deals/all：按 normalizeTitle 合并
  const byTitle = new Map();
  ...
}
```

在排序分支（第 202 行）加 compare 专属排序。当前逻辑：

```js
if (mode === "free") {
  // 按 freeUntil 排序
} else {
  // deals/all：minSavings 过滤 + sortDeals
}
```

改为三分支，compare 排序逻辑：

```js
if (mode === "free") {
  // 按 freeUntil 排序（不变）
} else if (mode === "compare") {
  // 比价：先排除免费项（比价针对付费游戏），再按 (normalizeTitle 分组键, salePrice) 排序
  items = items
    .filter((it) => !it.isFree)
    .sort((a, b) => {
      const ta = normalizeTitle(a.title);
      const tb = normalizeTitle(b.title);
      if (ta !== tb) return ta < tb ? -1 : 1;  // 同标题相邻
      return (a.salePrice ?? Infinity) - (b.salePrice ?? Infinity);  // 组内价格升序
    });
} else {
  // deals/all（不变）
}
```

> 排序设计说明：用 normalizeTitle 作主排序键让同标题卡片相邻（组间按标题字典序），组内按 salePrice 升序（最便宜的在前）。用户扫视时，同一游戏的多平台报价聚在一起，每组第一个就是最便宜的平台。
>
> 不做"组间按最低价排序"——虽然 spec 讨论时提过，但实现会发现 normalizeTitle 字典序已经足够实用，且避免额外的分组聚合开销。如果后续需要"最便宜的游戏排最前"，可再加一层聚合。

### 2.2 渲染层

#### gamesStore.js

`MODES` 加 compare：

```js
export const MODES = [
  { key: "deals", label: "折扣力度" },
  { key: "free", label: "免费活动" },
  { key: "wishlist", label: "心愿单" },
  { key: "compare", label: "比价" },
];
```

#### compare 强制 platform=all

在 `setMode` 函数里，切到 compare 时强制 platform=all（单平台比价无意义）：

```js
export function setMode(m) {
  if (activeMode.value === m) return;
  activeMode.value = m;
  if (m === "compare") activePlatform.value = "all";  // 比价强制全平台
  loadGameDeals();
}
```

> 注意：`setPlatformAndMode`（scheduler 通知点击用）也需要同步处理——若目标 mode 是 compare，platform 强制 all。但这不阻塞当前功能（scheduler 只跳 free/wishlist）。

#### GamesPage.jsx

compare 模式与 wishlist 类似，隐藏 toolbar，但**原因不同**：
- wishlist：本地数据，不需要筛选
- compare：强制 all，不需要平台 tab；自有排序，不需要折扣门槛/排序下拉

当前 GamesPage 的 toolbar 渲染（Spec B 后）：

```jsx
{!isWishlist && (
  <div class="games-toolbar">
    <PlatformTabs />
    <GamesFilterBar />
  </div>
)}
```

改为：

```jsx
{!isWishlist && !isCompare && (
  <div class="games-toolbar">
    <PlatformTabs />
    <GamesFilterBar />
  </div>
)}
```

> 注意：GamesFilterBar 内含 mode chips。compare 模式下隐藏整个 toolbar 意味着用户无法从 compare 切回其它 mode。**修正**：mode chips 必须始终可见。方案改为：compare 模式只隐藏 PlatformTabs，保留 GamesFilterBar（其中 mode chips 始终渲染，折扣门槛/排序下拉在非 deals 模式已自动隐藏）。

修正后的 GamesPage 渲染：

```jsx
{!isWishlist && (
  <div class="games-toolbar">
    {!isCompare && <PlatformTabs />}
    <GamesFilterBar />
  </div>
)}
```

这样 compare 模式下：PlatformTabs 隐藏（强制 all），GamesFilterBar 保留（mode chips 可切回，折扣门槛/排序下拉因 `mode === "deals"` 守卫自动隐藏）。

#### 内容区渲染

compare 模式复用现有的 `list`（items.value）渲染分支，不需要独立网格。因为 aggregator 在 compare 模式返回的就是排序后的 deals items，GamesPage 现有的 `!isWishlist && list.length > 0` 网格分支自动适用。

compare 空态复用通用文案"该筛选条件下暂无优惠数据"（如果全平台都没折扣数据）。

#### GamesFilterBar 注释更新

GamesFilterBar 第 2 行注释仍含"热门Top10"（已废弃），顺带修正为"折扣力度 / 免费活动 / 心愿单 / 比价"。

---

## 验证

- 单元测试覆盖：
  - aggregator compare 模式：保留同名跨平台条目（不合并）、按 (normalizeTitle, salePrice) 排序、排除免费项
  - aggregator deals/free 模式行为不变（回归保护）
  - normalize 导出 BROWSER_UA / BROWSER_UA_SAFARI
  - gamesStore setMode("compare") 强制 platform=all
  - register-games ALLOWED_MODES 含 compare
- 渲染测试：
  - GamesPage compare 模式：隐藏 PlatformTabs、保留 GamesFilterBar、渲染 list 网格
- 运行完整 Vitest 套件 + `npm run build:renderer`。

---

## 改动文件清单

| 类型 | 文件 | 内容 |
|---|---|---|
| Modify | `src/main/games/normalize.js` | 导出 BROWSER_UA + BROWSER_UA_SAFARI |
| Modify | `src/main/games/playstation.js` | 引用 BROWSER_UA（删本地 UA） |
| Modify | `src/main/games/switch.js` | 引用 BROWSER_UA_SAFARI（删本地 UA） |
| Modify | `src/main/games/xbox-free.js` | 2 处 UA → BROWSER_UA |
| Modify | `src/main/games/nintendo-image-headers.js` | 引用 BROWSER_UA（删本地 UA） |
| Modify | `src/main/games/aggregator.js` | compare 分支（跳过合并 + 专属排序） |
| Modify | `src/main/ipc/register-games.js` | ALLOWED_MODES 加 compare |
| Modify | `src/renderer/games/gamesStore.js` | MODES 加 compare + setMode 强制 all |
| Modify | `src/renderer/games/GamesPage.jsx` | compare 隐藏 PlatformTabs |
| Modify | `src/renderer/games/GamesFilterBar.jsx` | 注释更新（顺带修废弃文案） |
| Modify | `tests/main/games/aggregator.test.js` | compare 模式测试 |
| Modify | `tests/main/games/normalize.test.js` | BROWSER_UA 导出测试 |
| Modify | `tests/main/ipc/register-games.test.js` | ALLOWED_MODES 含 compare |
| Modify | `tests/renderer/games-store.test.js` | setMode compare 强制 all |

共 **10 个修改文件 + 4 个测试文件扩展**。
