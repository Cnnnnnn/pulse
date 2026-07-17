# 游戏优惠聚合 Tab — 设计纪要

> 日期：2026-07-16 · 版本：Pulse v2.81
> 目标：新增「游戏优惠」顶级 nav，聚合国内外主流游戏平台的折扣 / 喜+1 / 热门榜。

## 1. 功能范围

- **平台**：Steam · Epic · Xbox · PlayStation（PS4/PS5 合并）· Switch（分类 Tab：全部 + 各平台）。
- **浏览维度（筛选）**：
  - 折扣力度：按 savings 排序，支持门槛 ≥50% / ≥75% / ≥90%。
  - 喜+1 免费领：仅显示 `isFree` 条目（含限时免费截止日）。
  - 热门 Top10：按 `popular` 热度降序取前 10。
- **数据性质徽标**：主机平台在无 ITAD key 时用示例数据，UI 顶部与卡片显示「示例」/「含示例数据」徽标，绝不空白。

## 2. 数据架构

主进程（Node，无 CORS）聚合，renderer 经 IPC 取数：

| 平台 | 数据来源 | 是否真实 |
|---|---|---|
| Steam | CheapShark `storeID=1` `/deals` | ✅ 实时（无需 key） |
| Epic（折扣） | CheapShark `storeID=25` `/deals` | ✅ 实时 |
| Epic（喜+1） | Epic 官方 `freeGamesPromotions` 接口 | ✅ 实时 |
| Xbox / PlayStation / Switch | IsThereAnyDeal（需免费 key） | ⚠️ 配置 key 后实时，否则示例兜底 |

文件：
- `src/main/games/normalize.js` — 规范 `GameDeal` 形状 + 超时 fetch 封装。
- `src/main/games/steam.js` / `epic.js` — PC 平台真实 fetcher。
- `src/main/games/itad.js` — 主机平台可选 ITAD adapter（无 key 返回 null）。
- `src/main/games/sample.js` — 主机示例兜底数据（source:'sample'）。
- `src/main/games/aggregator.js` — `getGameDeals({platform,mode,sort,minSavings})` 统一入口。
- `src/main/ipc/register-games.js` — `games:getDeals` IPC（已注册进 `ipc/index.js`）。

## 3. 接真实主机数据的开关

1. 申请免费 key：https://isthereanydeal.com/settings/account/api
2. 二选一：
   - 环境变量 `ITAD_API_KEY=xxx`，或
   - 前端请求 `api.getGameDeals({ itadKey })`（当前 UI 未暴露输入，需后续在设置页加字段）。

## 4. 注册点（新增 nav 必改）

- `src/renderer/worldcup/navStore.js`：`NAV_KEYS` / `NAV_KEYS_LIST` / `PERSISTABLE_NAV_KEYS` 加 `games`。
- `src/renderer/components/SideNav.jsx`：`NAV_ITEMS` 加 `{key:'games', label:'游戏优惠'}`。
- `src/renderer/components/LazyNavPanel.jsx`：加 `games` 动态 import loader。
- `src/renderer/components/HomeGrid.jsx`：`HOME_TILES` 加 games tile（accent:'red'）+ 手柄 SVG + status。
- `src/renderer/nav-refresh.js`：注册全局刷新按钮 `games → loadGameDeals`。
- `preload.js` + `src/renderer/api.js`：暴露 `getGameDeals`。

## 5. 验证

- 主进程聚合逻辑 Node smoke test 通过：Steam 40 条实时折扣、Epic 7 条实时喜+1、Top10 跨平台、主机示例兜底。
- `npm run build:renderer` 通过；受影响单测（sidenav-prefs ×2、home-grid.integration）已同步更新并 77 passed。

## 6. 设计遵循

- 复用 `docs/ui-design-system.md` 令牌真源（毛玻璃 / 系统字体 / 表面提亮），`games.css` 禁裸 hex，缺省令牌用 hex-free 兜底。
