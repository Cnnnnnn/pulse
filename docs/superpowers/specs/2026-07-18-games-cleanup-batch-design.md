# 游戏模块清理批次设计（Spec A）

> 配套实施计划：`docs/superpowers/plans/2026-07-18-games-cleanup-batch.md`
> 本 spec 覆盖 P0 两项 + P1 两项基建。心愿单功能（原 P1 #4）作为 Spec B 独立设计。

## 目标

解决游戏收集板块四项已识别的短板，按"用户可见度"从高到低排序：

1. **P0** — PS/Switch 免费活动 tab 空态文案误导（UX 断层）
2. **P0** — 清理 `mode:'top'` 死代码（遗留入口）
3. **P1** — fetcher 层错误静默吞异常（线上排障盲区）
4. **P1** — 关键模块测试缺口（switch.js / IPC 缓存层）

## 非目标

- 不实现心愿单、降价监控、跨平台比价（Spec B）。
- 不改动 `mode:'deals'`/`mode:'free'` 的聚合逻辑和数据源。
- 不改动 `TopRanking.jsx`（git status 显示已删除）。
- 不为 PS/Switch 补真实免费活动数据源。
- 不改 PS/Switch 免费活动 tab 的可见性（仍显示 tab，只是空态文案更准确）。

---

## 任务 1：PS/Switch 免费活动空态文案（P0）

### 问题

`aggregator.js:50-52` 对 `playstation`/`switch` 在 `mode==='free'` 时硬编码返回 `{items:[], source:'live'}`。用户切到这两个平台的"免费活动"tab 时，`GamesPage.jsx:73-78` 显示通用空态"该筛选条件下暂无优惠数据"，误导用户以为是临时数据问题。

### 设计

保留 aggregator 的返回空列表逻辑不变（不引入"示例免费游戏"，避免用户误以为可以领取）。**只改 `GamesPage.jsx` 的空态文案**，根据 `activePlatform + activeMode` 显示差异化说明：

- `mode==='free'` 且 `platform` 为 `playstation`/`switch` 时显示：
  > 🎯 该平台暂无公开免费活动数据源
  > （副文案）Epic / Steam / Xbox 的免费活动更稳定，可切换平台查看
- 其余场景维持原文案"该筛选条件下暂无优惠数据"。

### 接口

- **修改** `src/renderer/games/GamesPage.jsx`：`isEmpty` 分支根据 `activePlatform.value` + `activeMode.value` 渲染差异化文案。
- **导入** `activePlatform`、`activeMode` from `./gamesStore.js`（当前 GamesPage 未导入这两个 signal）。
- **新增** CSS class `games-state--hint`（可选，副文案用更浅的字号；若现有 `games.css` 已有合适样式则复用）。

### 边界

- 文案改动**只影响渲染层**，不改 aggregator、不改 IPC、不改数据源。
- 文案用中文，与现有空态文案风格一致。
- 不引入 i18n（当前整个模块都是硬编码中文）。

---

## 任务 2：清理 `mode:'top'` 死代码（P0）

### 问题

`register-games.js:95` 白名单 `allowedModes` 含 `'top'`，但：
- `aggregator.js` 只处理 `deals`/`free`，`top` 静默落到 deals 的 else 分支（实际按 savings 排序）。
- `TopRanking.jsx` 已删除（git status 确认 `D src/renderer/games/TopRanking.jsx`）。
- 全代码库 grep `'top'` 无其它 games 模块触点（确认无调用方）。

### 设计

从 `allowedModes` 数组移除 `'top'`：
```js
const allowedModes = ["deals", "free"];
```
移除后，若 renderer 误传 `mode:'top'`，白名单校验会降级为默认值 `'deals'`（现有 `opts.mode ? ... : 'deals'` 逻辑天然兜底）。

### 接口

- **修改** `src/main/ipc/register-games.js:95`：`allowedModes` 删除 `'top'`。
- 同步更新文件头注释（第 5 行"热门榜"提及应清理或改为"免费活动"）。

### 边界

- 不改 aggregator.js（它本来就只认 `deals`/`free`，`top` 走的是 else 分支，行为不变）。
- 不需要 renderer 改动（renderer 从未传过 `mode:'top'`）。

---

## 任务 3：fetcher 错误日志（P1）

### 问题

8 个 fetcher 文件共约 17 处 `catch {}` 或 `catch { return null/[] }`，设计意图是"单源失败不影响整体"，但完全无日志输出。线上数据源挂掉时，开发者和用户都看不到任何信号，只能靠经验猜测是哪个源挂了。

### 设计

新增**最小侵入**的 `logFetchError(source, err)` 工具函数，在所有 fetcher 的 catch 块里调用。仅输出到 main 进程 `console.warn`，与现有 `safeHandle` 的 `logMeta` 机制风格一致。

### 接口

**新增** `src/main/games/log.js`：
```js
/**
 * fetcher 失败日志 — 统一格式，便于 main 进程排障。
 * 设计意图：单源失败已被 aggregator 错误隔离，这里只做可观测性，不影响控制流。
 * @param {string} source 数据源标识，如 "playstation:psgamespider"
 * @param {unknown} err 异常对象
 */
function logFetchError(source, err) {
  const msg = err && err.message ? err.message : String(err);
  console.warn(`[games] fetch failed: ${source} — ${msg}`);
}

module.exports = { logFetchError };
```

**在以下 catch 块调用**（按文件列举，共 17 处）：

| 文件 | 行号 | source 标识 | 当前行为 |
|---|---|---|---|
| `playstation.js` | 94, 103, 134, 236, 244 | `playstation:psgamespider` / `playstation:ssr` | `catch {}` |
| `psprices.js` | 55, 115, 131 | `psprices` | `catch {}` / `catch (e)` |
| `itad.js` | 57, 111 | `itad:{platform}` | `catch {}` |
| `switch.js` | 131 | `switch:algolia` | `catch {}` |
| `xbox-free.js` | 87 | `xbox:free-play-days` | `catch {}` |
| `exchange-rates.js` | 75 | `exchange-rates:{currency}` | `catch {}` |

> 注：`steam.js`、`steam-free.js`、`epic.js` 无 catch 块（异常直接抛给 aggregator 的 `fetchPlatform` 统一兜底）—— 这三个文件不动。aggregator 的 `fetchPlatform` catch 块也已兜底，可选加 `logFetchError("aggregator:{platform}", err)`，但不在必做范围（该 catch 已有注释说明行为）。

### 边界

- **零运行时依赖**。`logFetchError` 是纯 console 封装。
- **不改控制流**：所有 catch 块的 return 值不变，只是补一行日志。
- **不透传到 renderer**：本轮只做 main 进程日志。UI 健康面板是更大的独立工作，不在本 spec 范围。
- **测试策略**：`logFetchError` 本身是 trivial 函数，不单独写测试；通过各 fetcher 的"失败兜底"测试间接覆盖（spy `console.warn` 断言被调用）。

---

## 任务 4：补充 switch.js + IPC 缓存层测试（P1）

### 问题

以下源码当前无单元测试覆盖：
- `switch.js`（Nintendo Algolia 解析逻辑：`percentOff`/`finalPrice` 映射、`Origin/Referer` 头校验、空响应兜底）
- `register-games.js` 的缓存层（`dealsCacheGet`/`dealsCacheSet` 命中/过期/LRU、`allowedModes`/`allowedSorts` 白名单降级、`ok:false` 错误兜底）

### 设计

遵循现有测试风格（Vitest + `vi.stubGlobal("fetch", ...)` + happy-dom），为两个模块补单元测试。

### 接口

**新增** `tests/main/games/switch.test.js`，覆盖：
- Algolia 响应映射到 `GameDeal`（`percentOff` → `savings`、`finalPrice` → `salePrice`、`msrp` → `normalPrice`）。
- `deals` 模式 vs `free` 模式的 filter 差异（Algolia 不同 query filter）。
- 请求头包含 `Origin: https://www.nintendo.com` 和 `Referer`（否则 403 的约束）。
- 空响应 / 非 `hits` 数组 → 返回 `[]` 或 null（触发 aggregator 兜底）。
- fetch 抛异常 → 抛出（由 aggregator 的 `fetchPlatform` catch 兜底，不在此层吞）。

**新增** `tests/main/ipc/register-games.test.js`，覆盖：
- `dealsCacheKey`：不同 `{platform, mode, sort, minSavings}` 组合生成不同 key；同组合命中同 key。
- `dealsCacheSet` + `dealsCacheGet`：TTL 内命中、过期后返回 null。
- LRU 超限清理：超过 `DEALS_CACHE_MAX` 后清一半。
- `allowedModes`：传 `'top'` 降级为 `'deals'`（验证任务 2 的清理生效）；传未知 mode 同样降级。
- `allowedSorts` / `minSavings` 边界值降级。
- `getGameDeals` 失败时返回 `{ok:false, reason:'aggregate_failed', ...}`（mock aggregator 抛异常）。

> 注：`register-games.js` 当前未导出 `dealsCacheKey`/`dealsCacheGet`/`dealsCacheSet`。测试需要这些函数被导出（或在测试中通过 `safeHandle` 间接验证缓存行为）。优先方案：**导出这些工具函数供测试**（加到 `module.exports`），因为它们是纯函数，导出无副作用。

### 边界

- 不为 `steam.js`/`itad.js`/`psprices.js`/`sample.js` 补测试（简单映射，价值低，后续再说）。
- 不补渲染层测试（`GamesLayout`/`GamesFilterBar`/`PlatformTabs`）——不在本批范围。
- 测试不真实请求网络，全部用 `vi.stubGlobal("fetch")` 或 mock 模块依赖。

---

## 验证

- `npx vitest run tests/main/games/switch.test.js tests/main/ipc/register-games.test.js` 新增测试通过。
- `npx vitest run` 全量测试通过，0 failures。
- `npm run build:renderer` 构建成功。
- 手动验证（可选）：启动应用，切到 PlayStation → 免费活动 tab，确认显示新文案"该平台暂无公开免费活动数据源"。
- `git diff --check` 无尾随空白；改动文件范围与本 spec 列出的清单一致。

## 改动文件清单

| 类型 | 文件 | 任务 |
|---|---|---|
| Modify | `src/renderer/games/GamesPage.jsx` | 任务 1（空态文案） |
| Modify | `src/main/ipc/register-games.js` | 任务 2（删 top）+ 任务 4（导出缓存工具函数） |
| Create | `src/main/games/log.js` | 任务 3（logFetchError） |
| Modify | `src/main/games/playstation.js` | 任务 3（5 处 catch 加日志） |
| Modify | `src/main/games/psprices.js` | 任务 3（3 处 catch 加日志） |
| Modify | `src/main/games/itad.js` | 任务 3（2 处 catch 加日志） |
| Modify | `src/main/games/switch.js` | 任务 3（1 处 catch 加日志） |
| Modify | `src/main/games/xbox-free.js` | 任务 3（1 处 catch 加日志） |
| Modify | `src/main/games/exchange-rates.js` | 任务 3（1 处 catch 加日志） |
| Create | `tests/main/games/switch.test.js` | 任务 4 |
| Create | `tests/main/ipc/register-games.test.js` | 任务 4 |

共 **2 个新源文件 + 1 个新工具文件 + 2 个新测试文件 + 7 个修改文件**。
