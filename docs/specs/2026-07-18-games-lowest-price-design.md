# 全平台史低徽标设计（Spec D）

> 配套实施计划：`docs/superpowers/plans/2026-07-18-games-lowest-price.md`
> 本 spec 覆盖 P2 的 #6 历史最低价徽标。独立于 Spec A/B/C（均已合并）。

## 目标

在游戏卡片的折扣信息中展示"史低"徽标，当当前售价跌至历史最低价时亮起，作为"值得立即购买"的强信号。覆盖三个平台：Steam（逐个查 cheapshark /games）、Xbox（ITAD /prices 批量）、PlayStation（PSGameSpider priceHistory 本地算）。Epic/Switch 因数据源限制不显示。

## 非目标

- 不做"近史低"容差判定（严格 `salePrice <= lowestPrice`）。
- 不显示史低价数字（只在 title 悬停提示）。
- 不改 aggregator 对 deals/free/compare 模式的现有行为。
- 不为 Epic 接 cheapshark /games?title=（标题模糊匹配不准）。
- 不为 Switch 接新数据源（Algolia 无历史价）。
- 不新增心愿单/比价以外的 mode。
- 不引入运行时依赖。

---

## 设计决策汇总

| 决策点 | 选择 | 理由 |
|---|---|---|
| 平台覆盖 | Steam + Xbox + PS（Epic/Switch 跳过） | 数据源限制，cheapshark 不支持批量、Epic 无 steamAppID、Switch 无历史价 |
| Steam 请求策略 | 后台异步渐进更新（每批 5 个并发） | 列表先返回不阻塞，徽标逐个出现 |
| 渐进机制 | renderer 层 lowPriceMap signal | 纯渲染层增强，不改 IPC/aggregator 核心流 |
| PS 路径 | aggregator 同步返回 lowestPrice | priceHistory 已有，零额外请求 |
| Xbox 路径 | ITAD /prices 批量（复用 slug） | 一次请求拿全部，需 key |
| 史低判定 | 严格 `salePrice <= lowestPrice` | 徽标 = 强信号，不注水 |
| 徽标位置 | 封面左上角（示例徽标优先） | 不与右上的心形按钮冲突 |

---

## 1. 数据模型与判定

### 1.1 lowPriceMap signal（gamesStore.js 新增）

```js
export const lowPriceMap = signal({});  // { [gameId]: lowestPrice }
```

key 是 `game.id`（如 `"steam-367520"`），value 是历史最低价（number）。GameCard 渲染时读该 map。

### 1.2 史低判定（GameCard 内联）

不在 store 里定义 `isAtLowest` 函数，而是 GameCard 内联判定——因为需要拿到 `lowest` 值用于徽标的 title 悬停提示。store 只提供 `lowPriceMap` signal，判定逻辑在 GameCard：

```js
// GameCard 内（见第 4.1 节）
const lowestFromDeal = game.lowestPrice;
const lowestFromMap = lowPriceMap.value[game.id];
const lowest = lowestFromDeal != null ? lowestFromDeal : lowestFromMap;
const showLowest = lowest != null && game.salePrice != null
  && Number(game.salePrice) <= Number(lowest) && game.source !== "sample";
```

统一判定：先看 deal 自带的 `lowestPrice`（PS 同步路径），再看 lowPriceMap（Steam/Xbox 异步路径）。sample 数据不显示（价格是假的）。

### 1.3 normalize.js 扩展

`toGameDeal` 加可选 `lowestPrice` 字段（PS 用，其它平台不传 → null）：

```js
lowestPrice:
  raw.lowestPrice != null && Number.isFinite(Number(raw.lowestPrice))
    ? Number(raw.lowestPrice)
    : null,
```

---

## 2. Steam 后台异步增强

### 2.1 IPC 通道（register-games.js 新增）

`games:getSteamLowest`：输入 `{ steamAppId }`，返回 `{ lowestPrice: number | null }`。

main 进程调 cheapshark `/games?steamAppID={id}`，返回数组里取 `Math.min(...所有 store 的 cheapest)`。失败/无数据 → `{ lowestPrice: null }`。

> 注：cheapshark /games?steamAppID= 返回的是商店列表 `[{ storeName, cheapest, ... }, ...]`，取所有条目的 `cheapest` 最小值。无缓存（renderer 侧 lowPriceMap 本身是会话内缓存）。

### 2.2 enrichSteamLowest（gamesStore.js 新增）

```
async function enrichSteamLowest():
  token = ++_lowReqToken
  steamGames = items.value.filter(it => it.platform === "steam" && 有 steamAppID)
  pending = steamGames.filter(it => lowPriceMap.value[it.id] == null)
  若 pending 为空 → return

  BATCH = 5
  for (i = 0; i < pending.length; i += BATCH):
    if (token !== _lowReqToken) return  // 已被新任务取代
    batch = pending.slice(i, i + BATCH)
    results = await Promise.allSettled(batch.map(g => fetchOneLowest(g)))
    batchMap = {}
    for (r of results): if (r.status === "fulfilled" && r.value) batchMap[...] = r.value
    if (token === _lowReqToken):
      lowPriceMap.value = { ...lowPriceMap.value, ...batchMap }
    await new Promise(r => setTimeout(r, 0))  // 让出主线程
```

### 2.3 fetchOneLowest（gamesStore.js 新增）

```js
async function fetchOneLowest(game) {
  const appId = extractSteamAppId(game.id);  // "steam-367520" → "367520"
  if (!appId) return null;
  const res = await api.getSteamLowest({ steamAppId: appId });
  if (!res || !res.ok || res.lowestPrice == null) return null;
  return [game.id, res.lowestPrice];
}
```

> `extractSteamAppId` 从 game.id 提取 steamAppID（当前 id 格式是 `steam-${steamAppID}`）。若 id 不含合法 appID 返回 null。

### 2.4 竞态保护

`_lowReqToken` 机制：每次 enrichSteamLowest 递增 token，每批写入前检查 token 是否仍最新。用户切 tab/刷新时旧任务丢弃结果。

---

## 3. Xbox 与 PlayStation 史低

### 3.1 Xbox（itad.js 新增 fetchItadLowest）

新增函数：对 Xbox deals 列表的 slug 批量查 ITAD /prices。

```js
async function fetchItadLowest(slugs, { key }) {
  if (!key || !slugs.length) return {};
  // 每批最多 30 个 plains
  const result = {};
  for (let i = 0; i < slugs.length; i += 30) {
    const batch = slugs.slice(i, i + 30);
    const params = new URLSearchParams({ key, plains: batch.join(",") });
    const data = await fetchJson(`.../v01/prices/?${params}`, { timeoutMs: 9000 });
    // data 形如 { [slug]: { list: [...], historyLow: { amount: ... } } }
    for (const slug of batch) {
      const entry = data?.[slug];
      if (entry?.historyLow?.amount != null) result[slug] = Number(entry.historyLow.amount);
    }
  }
  return result;  // { [slug]: lowestPrice }
}
```

**触发**（renderer enrichXboxLowest）：loadGameDeals 后，若 items 含 Xbox 游戏且有 ITAD key，调 IPC 查询，结果写入 lowPriceMap。

> 注：Xbox deal 的 id 是 `xbox-${slug}`，lowPriceMap key 用 game.id，需在 fetchItadLowest 返回后做 slug→game.id 映射。

### 3.2 PlayStation（playstation.js 同步算）

在 `buildDealsFromPsGameSpider` 的现有循环里，复用已提取的价格点 `pts`：

```js
// 现有：latest = pts[最后].price, max = Math.max(pts.price)
// 新增：
const min = Math.min(...pts.map(p => p.price));
// 写入 deal：
deals.push({ ..., lowestPrice: min });
```

PS deal 自带 `lowestPrice`，走 toGameDeal 的同步路径，不需 renderer 异步增强。

### 3.3 Xbox IPC 通道

`games:getItadLowest`：输入 `{ slugs }`，返回 `{ lowestMap: { [slug]: price } }`。main 进程调 itad.js 的 fetchItadLowest。无 key → 返回空 map。

---

## 4. GameCard 徽标渲染与生命周期

### 4.1 史低徽标（GameCard.jsx）

在 `game-card__thumb` 内加徽标（左上角，示例徽标优先）。GameCard 内联判定以拿到 lowest 值用于 title：

```jsx
// GameCard 函数体内（isFree 定义附近）
const lowestFromDeal = game.lowestPrice;
const lowestFromMap = lowPriceMap.value[game.id];
const lowest = lowestFromDeal != null ? lowestFromDeal : lowestFromMap;
const showLowest = lowest != null && game.salePrice != null
  && Number(game.salePrice) <= Number(lowest) && game.source !== "sample";

// JSX 内（game-card__thumb div 内，sample 徽标旁）：
{showLowest && (
  <span
    class="game-card__lowest"
    title={`史低价 ${fmtPrice(lowest, game.currency)}`}
  >
    史低
  </span>
)}
```

> GameCard 需 import `lowPriceMap` from gamesStore 和 `fmtPrice` from format（fmtPrice 已 import）。

### 4.2 CSS（games.css）

```css
.game-card__lowest {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--color-warning) 92%, transparent);
  color: #fff;
  font-size: var(--font-size-xs);
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.02em;
}
```

> 色值用 token（`--color-warning`），符合 games.css 的"禁止裸 hex"规范。具体 token 名实施时 grep 确认（可能是 `--color-warning` 或 `--accent-warning`）。

### 4.3 增强任务生命周期（GamesLayout）

loadGameDeals 完成后触发增强（监听 fetchedAt 变化）：

```js
useEffect(() => {
  if (!fetchedAt.value) return;
  if (activeMode.value === "deals" || activeMode.value === "compare") {
    enrichSteamLowest();
    enrichXboxLowest();
  }
}, [fetchedAt.value]);
```

### 4.4 lowPriceMap 清空时机

在 `loadGameDeals` 开头加 `lowPriceMap.value = {}`：
- 切换 platform 时清空（不同平台 game.id 不同）
- 刷新时清空（价格可能变化）
- 切 mode 不单独清空（deals↔compare 同一批数据）

---

## 验证

- 单元测试覆盖：
  - normalize.js toGameDeal 接受 lowestPrice
  - playstation.js buildDealsFromPsGameSpider 算 min 并写入 lowestPrice
  - itad.js fetchItadLowest 批量映射 + 无 key 返回空 + historyLow 提取
  - register-games games:getSteamLowest / games:getItadLowest IPC
  - gamesStore enrichSteamLowest 分批并发 + token 竞态保护 + lowPriceMap 更新
  - gamesStore loadGameDeals 清空 lowPriceMap
- 渲染测试：
  - GameCard 史低徽标显示（salePrice <= lowest）/ 不显示（salePrice > lowest）/ sample 数据不显示
  - lowPriceMap 更新后徽标渐进出现
- 运行完整 Vitest 套件 + `npm run build:renderer`。

---

## 改动文件清单

| 类型 | 文件 | 内容 |
|---|---|---|
| Modify | `src/main/games/normalize.js` | toGameDeal 加 lowestPrice 字段 |
| Modify | `src/main/games/playstation.js` | buildDealsFromPsGameSpider 算 min + 写 lowestPrice |
| Modify | `src/main/games/itad.js` | 新增 fetchItadLowest（ITAD /prices 批量） |
| Modify | `src/main/ipc/register-games.js` | 新增 games:getSteamLowest + games:getItadLowest IPC |
| Modify | `src/renderer/games/gamesStore.js` | lowPriceMap signal + enrichSteamLowest/XboxLowest + isAtLowest + loadGameDeals 清空 |
| Modify | `src/renderer/games/GameCard.jsx` | 史低徽标渲染 |
| Modify | `src/renderer/games/games.css` | .game-card__lowest 样式 |
| Modify | `src/renderer/games/GamesLayout.jsx` | fetchedAt effect 触发增强 |
| Modify | `src/renderer/api.js` | getSteamLowest / getItadLowest |
| Modify | `tests/main/games/normalize.test.js` | lowestPrice 字段测试 |
| Modify | `tests/main/games/playstation.test.js` | min 计算测试 |
| Create | `tests/main/games/itad-lowest.test.js` | fetchItadLowest 测试 |
| Modify | `tests/main/ipc/register-games.test.js` | 新 IPC 测试 |
| Modify | `tests/renderer/games-store.test.js` | enrichSteamLowest + isAtLowest 测试 |
| Create | `tests/renderer/GameCard-lowest.test.jsx` | 徽标渲染测试 |

共 **9 个修改文件 + 2 个新测试文件**（+ 4 个现有测试文件扩展）。
