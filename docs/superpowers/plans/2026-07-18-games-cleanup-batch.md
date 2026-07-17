# 游戏模块清理批次 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复游戏收集板块 4 项已识别短板：PS/Switch 免费活动空态误导、`mode:'top'` 死代码、fetcher 错误静默吞异常、switch.js 与 IPC 缓存层测试缺口。

**Architecture:** 纯增量清理，不动数据源和聚合逻辑。任务 1 改渲染层空态文案；任务 2 从 IPC 白名单删一个字符串；任务 3 新增 `logFetchError` 工具并在 6 个 fetcher 的 13 处 catch 块补日志；任务 4 用 TDD 为 switch.js 和 IPC 缓存层补单元测试。四个任务相互独立，可并行或按序执行。

**Tech Stack:** CommonJS、Preact Signals、Vitest、`vi.stubGlobal("fetch")`

## Global Constraints

- 不改动 `mode:'deals'`/`mode:'free'` 的聚合逻辑和数据源。
- 不引入运行时依赖。`logFetchError` 是纯 `console.warn` 封装。
- fetcher 的 catch 块**只补日志，不改控制流**（return 值不变）。
- 所有测试用 `vi.stubGlobal("fetch")` 或 mock 模块，不真实联网。
- 未经用户明确要求，不创建 Git commit。
- 中文文案与现有模块风格一致（硬编码中文，无 i18n）。

---

### Task 1: PS/Switch 免费活动空态差异化文案

**Files:**
- Modify: `src/renderer/games/GamesPage.jsx`
- Modify: `tests/renderer/GamesPage-fx.test.jsx`（新增一个空态文案测试用例，复用现有测试文件）

**Interfaces:**
- Consumes: `activePlatform`, `activeMode` from `./gamesStore.js`
- Produces: PS/Switch 在免费活动 tab 下的差异化空态文案

- [ ] **Step 1: 写入失败测试**

在 `tests/renderer/GamesPage-fx.test.jsx` 末尾新增一个 describe 块（若文件已有 `@vitest-environment happy-dom` 指令和 render 设置则复用，否则参考下面完整设置）。先读取该文件头部确认现有 import 和 render 设置。

测试内容：

```jsx
describe("GamesPage 空态文案", () => {
  it("PS 免费活动 tab 显示无数据源说明", async () => {
    const { activePlatform, activeMode, items, loading, error } = await import(
      "../../src/renderer/games/gamesStore.js"
    );
    activePlatform.value = "playstation";
    activeMode.value = "free";
    items.value = [];
    loading.value = false;
    error.value = null;

    const { render, screen } = await import("@testing-library/preact");
    render(<GamesPage />);

    expect(screen.getByText("该平台暂无公开免费活动数据源")).toBeTruthy();
  });

  it("Steam 免费活动 tab 空时显示通用文案", async () => {
    const { activePlatform, activeMode, items, loading, error } = await import(
      "../../src/renderer/games/gamesStore.js"
    );
    activePlatform.value = "steam";
    activeMode.value = "free";
    items.value = [];
    loading.value = false;
    error.value = null;

    const { render, screen } = await import("@testing-library/preact");
    render(<GamesPage />);

    expect(screen.getByText("该筛选条件下暂无优惠数据")).toBeTruthy();
  });
});
```

> 注：具体 import 方式需匹配 `GamesPage-fx.test.jsx` 现有写法（动态 import 还是顶部 require）。实施时先读该文件，按现有风格调整。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/renderer/GamesPage-fx.test.jsx -t "空态文案"`

Expected: FAIL，找不到"该平台暂无公开免费活动数据源"文本（当前所有空态都显示通用文案）。

- [ ] **Step 3: 导入 activePlatform 和 activeMode**

在 `src/renderer/games/GamesPage.jsx` 顶部 import 列表（第 6-16 行的 `gamesStore.js` 解构）中加入 `activePlatform` 和 `activeMode`：

```jsx
import {
  items,
  loading,
  error,
  hasSampleSource,
  hasPspricesAttribution,
  hasPsgamespiderAttribution,
  hasGamerPowerAttribution,
  loadGameDeals,
  fx,
  activePlatform,
  activeMode,
} from "./gamesStore.js";
```

- [ ] **Step 4: 实现差异化空态文案**

将 `GamesPage.jsx` 第 73-78 行的 `isEmpty` 分支替换为：

```jsx
{isEmpty && (() => {
  const noFreeSource =
    activeMode.value === "free" &&
    (activePlatform.value === "playstation" ||
      activePlatform.value === "switch");
  return (
    <div class="games-state">
      <span class="games-state__icon" aria-hidden="true">🎯</span>
      {noFreeSource ? (
        <span>
          该平台暂无公开免费活动数据源
          <div class="games-state__hint">
            Epic / Steam / Xbox 的免费活动更稳定，可切换平台查看
          </div>
        </span>
      ) : (
        <span>该筛选条件下暂无优惠数据</span>
      )}
    </div>
  );
})()}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/renderer/GamesPage-fx.test.jsx -t "空态文案"`

Expected: PASS。

- [ ] **Step 6: 确认全量 renderer 测试不回归**

Run: `npx vitest run tests/renderer/GamesPage-fx.test.jsx`

Expected: PASS（现有汇率 footer 测试不受影响）。

---

### Task 2: 清理 `mode:'top'` 死代码

**Files:**
- Modify: `src/main/ipc/register-games.js`（第 5 行注释 + 第 95 行白名单）

**Interfaces:**
- 修改 `allowedModes` 数组：`["deals", "free", "top"]` → `["deals", "free"]`
- 注：实际代码修改在 Task 4 Step 6 一并完成（提升为 `ALLOWED_MODES` 常量）；本任务只做前置确认和注释清理

- [ ] **Step 1: 确认全代码库无 `mode:'top'` 调用方**

Run: `grep -rn "mode.*['\"]top['\"]" src/ tests/ --include="*.js" --include="*.jsx" | grep -v node_modules | grep -v "topModel" | grep -v "top:"`

Expected: 只命中 `register-games.js:95` 的白名单定义本身，无其它调用方。

- [ ] **Step 2: 同步更新文件头注释**

将 `register-games.js` 第 5 行注释中的"热门榜"清理掉。当前第 5 行：

```js
 *   games:getDeals → 聚合各平台折扣 / 喜+1 / 热门榜 (src/main/games/aggregator.js)
```

改为：

```js
 *   games:getDeals → 聚合各平台折扣 / 免费活动 (src/main/games/aggregator.js)
```

- [ ] **Step 3: 运行现有 IPC 测试确认注释改动不回归**

Run: `npx vitest run tests/main/ipc/`

Expected: PASS（attachFx 测试不涉及注释和白名单）。

> 实际的 `allowedModes` 数组修改在 Task 4 Step 6 完成（与 `ALLOWED_MODES` 常量提升和导出合并为一次编辑）。Task 4 Step 7 的测试会验证 `'top'` 已不在白名单。

---

### Task 3: fetcher 错误日志工具

**Files:**
- Create: `src/main/games/log.js`
- Modify: `src/main/games/playstation.js`（5 处 catch: 行 94, 103, 134, 236, 244）
- Modify: `src/main/games/psprices.js`（3 处 catch: 行 55, 115, 131）
- Modify: `src/main/games/itad.js`（2 处 catch: 行 57, 111）
- Modify: `src/main/games/switch.js`（1 处 catch: 行 131）
- Modify: `src/main/games/xbox-free.js`（1 处 catch: 行 87）
- Modify: `src/main/games/exchange-rates.js`（1 处 catch: 行 75）
- Create: `tests/main/games/log.test.js`

**Interfaces:**
- Produces: `logFetchError(source, err)` — 统一格式的 `console.warn` 封装

- [ ] **Step 1: 写入 logFetchError 失败测试**

创建 `tests/main/games/log.test.js`：

```js
import { afterEach, describe, expect, it, vi } from "vitest";

const { logFetchError } = require("../../../src/main/games/log.js");

afterEach(() => vi.restoreAllMocks());

describe("logFetchError", () => {
  it("格式化 Error 对象的 message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logFetchError("playstation:psgamespider", new Error("timeout"));
    expect(warn).toHaveBeenCalledWith(
      "[games] fetch failed: playstation:psgamespider — timeout",
    );
  });

  it("格式化字符串异常", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logFetchError("switch:algolia", "network down");
    expect(warn).toHaveBeenCalledWith(
      "[games] fetch failed: switch:algolia — network down",
    );
  });

  it("格式化无 message 的异常对象", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logFetchError("itad:xbox", { code: 42 });
    expect(warn).toHaveBeenCalledWith(
      "[games] fetch failed: itad:xbox — [object Object]",
    );
  });

  it("格式化 null/undefined 异常", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logFetchError("xbox:free-play-days", null);
    expect(warn).toHaveBeenCalledWith(
      "[games] fetch failed: xbox:free-play-days — null",
    );
    logFetchError("exchange-rates:USD", undefined);
    expect(warn).toHaveBeenLastCalledWith(
      "[games] fetch failed: exchange-rates:USD — undefined",
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/main/games/log.test.js`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 logFetchError**

创建 `src/main/games/log.js`：

```js
/**
 * src/main/games/log.js
 *
 * fetcher 失败日志 — 统一格式，便于 main 进程排障。
 *
 * 设计意图：单源失败已被 aggregator 的 fetchPlatform 错误隔离，
 * 这里只做可观测性（console.warn），不影响控制流。
 * 所有 fetcher 的 catch 块应在 return 兜底值前调用本函数。
 */

/**
 * @param {string} source 数据源标识，如 "playstation:psgamespider"
 * @param {unknown} err 异常对象
 */
function logFetchError(source, err) {
  const msg = err && err.message ? err.message : String(err);
  console.warn(`[games] fetch failed: ${source} — ${msg}`);
}

module.exports = { logFetchError };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/main/games/log.test.js`

Expected: PASS。

- [ ] **Step 5: 在 playstation.js 的 5 处 catch 补日志**

在 `src/main/games/playstation.js` 顶部 require 区（第 24 行后）加入：

```js
const { logFetchError } = require("./log");
```

修改 5 处 catch 块（保持 return 值不变，只补日志）：

**行 94**（`readCache` 的 catch）：
```js
// 改前
  } catch {
    return null;
  }
// 改后（readCache，source: playstation:cache:read）
  } catch (err) {
    logFetchError("playstation:cache:read", err);
    return null;
  }
```

**行 103**（`writeCache` 的 catch）：
```js
// 改前
  } catch {
    /* 缓存写入失败不影响主流程 */
  }
// 改后
  } catch (err) {
    logFetchError("playstation:cache:write", err);
  }
```

**行 134**（`loadPsGameSpiderData` 的 catch）：
```js
// 改前
  } catch {
    return null;
  }
// 改后（loadPsGameSpiderData，source: playstation:psgamespider）
  } catch (err) {
    logFetchError("playstation:psgamespider", err);
    return null;
  }
```

**行 236**（`fetchPlayStationDeals` 主源 catch）：
```js
// 改前
  } catch {
    /* 落到 SSR 兜底 */
  }
// 改后
  } catch (err) {
    logFetchError("playstation:psgamespider:main", err);
  }
```

**行 244**（`fetchPlayStationDeals` SSR catch）：
```js
// 改前
  } catch {
    /* 落到聚合层兜底 */
  }
// 改后
  } catch (err) {
    logFetchError("playstation:ssr", err);
  }
```

> ⚠️ 实施时必须**先 Read 文件**确认每个 catch 块的确切上下文（`catch {` 可能有多处雷同），用 Edit 工具的 `old_string` 唯一匹配替换。若 `old_string` 不唯一，扩大上下文包含前一行注释或后一行 return。

- [ ] **Step 6: 在 psprices.js 的 3 处 catch 补日志**

在 `src/main/games/psprices.js` 顶部 require 区（第 21 行后）加入：

```js
const { logFetchError } = require("./log");
```

修改 3 处 catch 块：

**行 55**（`loadEnvPspricesKey` 的 catch）：
```js
// 改前
  } catch {
    /* .env 读取失败忽略，不影响未认证路径 */
  }
// 改后
  } catch (err) {
    logFetchError("psprices:env", err);
  }
```

**行 115**（`fetchPlayStationDeals` 的 catch）：
```js
// 改前
  } catch {
    return null;
  }
// 改后
  } catch (err) {
    logFetchError("psprices", err);
    return null;
  }
```

**行 131**（`fetchPlayStationDealsDemo` 的 catch）：
```js
// 改前
  } catch (e) {
    throw e;
  }
// 改后（这里本来就是 rethrow，补日志后仍 rethrow，不吞异常）
  } catch (err) {
    logFetchError("psprices:demo", err);
    throw err;
  }
```

- [ ] **Step 7: 在 itad.js 的 2 处 catch 补日志**

在 `src/main/games/itad.js` 顶部 require 区（第 19 行后）加入：

```js
const { logFetchError } = require("./log");
```

修改 2 处 catch 块：

**行 57**（`loadEnvItadKey` 的 catch）：
```js
// 改前
  } catch {
    /* .env 读取失败忽略，不影响未认证路径 */
  }
// 改后
  } catch (err) {
    logFetchError("itad:env", err);
  }
```

**行 111**（`fetchItadDeals` 的 catch）：

注意：`fetchItadDeals` 接收 `platform` 参数，source 应包含平台。当前函数签名是 `fetchItadDeals(platform, opts = {})`。

```js
// 改前（fetchItadDeals 内部）
  } catch {
    return null;
  }
// 改后
  } catch (err) {
    logFetchError(`itad:${platform}`, err);
    return null;
  }
```

- [ ] **Step 8: 在 switch.js 的 1 处 catch 补日志**

在 `src/main/games/switch.js` 顶部 require 区（第 19 行后）加入：

```js
const { logFetchError } = require("./log");
```

修改 `fetchSwitchDeals` 的 catch（行 131）：

```js
// 改前
  } catch {
    return [];
  }
// 改后
  } catch (err) {
    logFetchError("switch:algolia", err);
    return [];
  }
```

- [ ] **Step 9: 在 xbox-free.js 的 1 处 catch 补日志**

在 `src/main/games/xbox-free.js` 顶部 require 区加入（参考现有 require 位置）：

```js
const { logFetchError } = require("./log");
```

修改 `fetchXboxFree` 的 catch（行 87）：

```js
// 改前
  } catch {
    return [];
  }
// 改后
  } catch (err) {
    logFetchError("xbox:free-play-days", err);
    return [];
  }
```

- [ ] **Step 10: 在 exchange-rates.js 的 1 处 catch 补日志**

在 `src/main/games/exchange-rates.js` 顶部 require 区加入（注意：该文件用工厂函数模式，require 应在模块顶层）：

```js
const { logFetchError } = require("./log");
```

修改 `refreshCurrency` 内部的 catch（行 75，闭包内 `currency` 变量可用）：

```js
// 改前（refreshCurrency 的 job 闭包内）
      } catch {
        /* 刷新失败保留 last-good */
      }
// 改后
      } catch (err) {
        logFetchError(`exchange-rates:${currency}`, err);
      }
```

- [ ] **Step 11: 运行全量 main 测试确认不回归**

Run: `npx vitest run tests/main/games`

Expected: PASS（所有现有测试通过；catch 块补日志不改变 return 值，行为不变）。

---

### Task 4: switch.js + IPC 缓存层单元测试

**Files:**
- Create: `tests/main/games/switch.test.js`
- Create: `tests/main/ipc/register-games.test.js`
- Modify: `src/main/ipc/register-games.js`（导出缓存工具函数供测试）

**Interfaces:**
- 导出 `dealsCacheKey`、`dealsCacheGet`、`dealsCacheSet`、`_dealsCache`（或重置函数）供测试

#### Part A: switch.js 测试

- [ ] **Step 1: 写入 switch.js 映射失败测试**

创建 `tests/main/games/switch.test.js`：

```js
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchSwitchDeals } = require("../../../src/main/games/switch.js");

afterEach(() => vi.restoreAllMocks());

function mockFetchResponse(body) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  }));
}

describe("fetchSwitchDeals — Algolia 响应映射", () => {
  it("把折扣游戏映射为 GameDeal（percentOff/regPrice/finalPrice）", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        hits: [
          {
            objectID: "7100126981",
            nsuid: "70010000000123",
            title: "Zelda: Breath of the Wild",
            price: {
              finalPrice: 39.99,
              regPrice: 59.99,
              percentOff: 33.34,
              discounted: true,
            },
            productImageSquare: "https://assets.nintendo.com/cover.jpg",
            url: "/us/store/products/zelda-botw/",
            releaseDateDisplay: "2017-03-03",
          },
        ],
      }),
    );

    const [item] = await fetchSwitchDeals({ limit: 10, mode: "deals" });
    expect(item).toMatchObject({
      id: "switch-70010000000123",
      platform: "switch",
      title: "Zelda: Breath of the Wild",
      salePrice: 39.99,
      normalPrice: 59.99,
      savings: 33,
      currency: "USD",
      isFree: false,
      store: "Nintendo eShop",
      source: "live",
    });
    expect(item.dealUrl).toBe(
      "https://www.nintendo.com/us/store/products/zelda-botw/",
    );
  });

  it("免费游戏 (finalPrice=0) savings=100 且 isFree=true", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        hits: [
          {
            nsuid: "70010000000456",
            title: "Fortnite",
            price: { finalPrice: 0, regPrice: 0, percentOff: 0 },
            url: "/us/store/products/fortnite/",
          },
        ],
      }),
    );

    const [item] = await fetchSwitchDeals({ limit: 10, mode: "free" });
    expect(item.isFree).toBe(true);
    expect(item.savings).toBe(100);
  });

  it("urlKey 兜底拼接 dealUrl", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        hits: [
          {
            nsuid: "123",
            title: "Test",
            price: { finalPrice: 10, regPrice: 20, percentOff: 50 },
            urlKey: "test-game",
          },
        ],
      }),
    );

    const [item] = await fetchSwitchDeals({ limit: 5 });
    expect(item.dealUrl).toBe(
      "https://www.nintendo.com/us/store/products/test-game/",
    );
  });

  it("过滤 normalPrice=0 且非免费的条目", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse({
        hits: [
          {
            nsuid: "1",
            title: "BadData",
            price: { finalPrice: 5, regPrice: 0, percentOff: 50 },
          },
          {
            nsuid: "2",
            title: "GoodGame",
            price: { finalPrice: 15, regPrice: 30, percentOff: 50 },
          },
        ],
      }),
    );

    const items = await fetchSwitchDeals({ limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("GoodGame");
  });

  it("请求头包含 Origin/Referer（Nintendo 站点校验来源）", async () => {
    const fetchMock = mockFetchResponse({ hits: [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSwitchDeals({ limit: 10 });

    const callArgs = fetchMock.mock.calls[0];
    const opts = callArgs[1];
    expect(opts.headers.Origin).toBe("https://www.nintendo.com");
    expect(opts.headers.Referer).toBe("https://www.nintendo.com/");
    expect(opts.method).toBe("POST");
  });

  it("mode=free 使用 finalPrice=0 过滤条件", async () => {
    const fetchMock = mockFetchResponse({ hits: [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSwitchDeals({ limit: 10, mode: "free" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.filters).toContain("price.finalPrice=0");
  });

  it("mode=deals 使用 percentOff>0 过滤条件", async () => {
    const fetchMock = mockFetchResponse({ hits: [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSwitchDeals({ limit: 10, mode: "deals" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.filters).toContain("price.percentOff>0");
  });

  it("空 hits 返回空数组", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({ hits: [] }));
    const items = await fetchSwitchDeals({ limit: 10 });
    expect(items).toEqual([]);
  });

  it("非数组 hits 返回空数组", async () => {
    vi.stubGlobal("fetch", mockFetchResponse({ hits: null }));
    const items = await fetchSwitchDeals({ limit: 10 });
    expect(items).toEqual([]);
  });

  it("fetch 抛异常返回空数组（由 aggregator 兜底）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    const items = await fetchSwitchDeals({ limit: 10 });
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

Run: `npx vitest run tests/main/games/switch.test.js`

Expected: PASS（switch.js 的逻辑已存在，测试是补覆盖，非 TDD 驱动新代码；但能锁住回归）。

> 说明：switch.js 的实现已稳定，本任务是补测试覆盖而非驱动新实现，所以测试应直接通过。若失败说明发现了一个既有 bug，需修复 switch.js。

#### Part B: 导出 IPC 缓存工具函数

- [ ] **Step 3: （本步与 Step 6 合并）**

Task 4 Part B 的导出工作已整合到 Step 6，避免对同一 `module.exports` 做两次编辑。实施时直接跳到 Part C 写测试，再在 Step 6 一次性完成所有导出。

#### Part C: IPC 缓存层 + 白名单测试

- [ ] **Step 4: 写入失败测试（缓存 + 白名单）**

创建 `tests/main/ipc/register-games.test.js`。这些测试断言的 `dealsCacheKey`/`dealsCacheGet`/`dealsCacheSet`/`resetDealsCache`/`ALLOWED_MODES` 当前都未导出，运行会失败（属正常 TDD 失败）：

```js
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dealsCacheKey,
  dealsCacheGet,
  dealsCacheSet,
  resetDealsCache,
  DEALS_CACHE_TTL_MS,
  ALLOWED_MODES,
} = require("../../../src/main/ipc/register-games.js");

beforeEach(() => resetDealsCache());

describe("dealsCacheKey", () => {
  it("不同参数组合生成不同 key", () => {
    const k1 = dealsCacheKey({ platform: "steam", mode: "deals", sort: "savings", minSavings: 0 });
    const k2 = dealsCacheKey({ platform: "steam", mode: "free", sort: "savings", minSavings: 0 });
    const k3 = dealsCacheKey({ platform: "epic", mode: "deals", sort: "savings", minSavings: 0 });
    const k4 = dealsCacheKey({ platform: "steam", mode: "deals", sort: "price", minSavings: 0 });
    const k5 = dealsCacheKey({ platform: "steam", mode: "deals", sort: "savings", minSavings: 50 });
    expect(new Set([k1, k2, k3, k4, k5]).size).toBe(5);
  });

  it("相同参数生成相同 key", () => {
    const k1 = dealsCacheKey({ platform: "all", mode: "free", sort: "savings", minSavings: 0 });
    const k2 = dealsCacheKey({ platform: "all", mode: "free", sort: "savings", minSavings: 0 });
    expect(k1).toBe(k2);
  });
});

describe("dealsCache TTL", () => {
  it("TTL 内命中缓存", () => {
    const key = dealsCacheKey({ platform: "steam", mode: "deals", sort: "savings", minSavings: 0 });
    const result = { ok: true, items: [{ id: "x" }], count: 1 };
    dealsCacheSet(key, result);
    expect(dealsCacheGet(key)).toBe(result);
  });

  it("过期后返回 null", () => {
    const key = dealsCacheKey({ platform: "steam", mode: "deals", sort: "savings", minSavings: 0 });
    dealsCacheSet(key, { ok: true, items: [] });

    // 模拟时间前进超过 TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(DEALS_CACHE_TTL_MS + 1);
    expect(dealsCacheGet(key)).toBeNull();
    vi.useRealTimers();
  });

  it("未设置的 key 返回 null", () => {
    const key = dealsCacheKey({ platform: "epic", mode: "free", sort: "savings", minSavings: 0 });
    expect(dealsCacheGet(key)).toBeNull();
  });
});

describe("dealsCacheGet/Set 往返", () => {
  it("存入对象后取回同一引用", () => {
    const key = "test-key";
    const result = { ok: true, items: [{ id: "a" }, { id: "b" }], count: 2 };
    dealsCacheSet(key, result);
    expect(dealsCacheGet(key)).toBe(result);
  });
});

describe("ALLOWED_MODES 白名单（Task 2 清理验证）", () => {
  it("只含 deals 和 free，不含 top", () => {
    expect(ALLOWED_MODES).toEqual(["deals", "free"]);
    expect(ALLOWED_MODES).not.toContain("top");
  });
});
```

- [ ] **Step 5: 运行缓存层测试确认失败**

Run: `npx vitest run tests/main/ipc/register-games.test.js`

Expected: FAIL，`dealsCacheKey`/`resetDealsCache`/`ALLOWED_MODES` 等未导出（`Cannot destructure property ... of 'undefined'`）。

- [ ] **Step 6: 导出缓存工具函数和 ALLOWED_MODES 常量**

在 `src/main/ipc/register-games.js` 做两处修改：

**6a. 把 `allowedModes` 提升为模块级命名常量 `ALLOWED_MODES`**（与 Task 2 Step 2 的删除 `'top'` 合并：直接定义为新数组）：

```js
// 第 95 行附近，改前
const allowedModes = ["deals", "free", "top"];
// 改后
const ALLOWED_MODES = ["deals", "free"];
```

并在 `safeHandle` 内部把 `allowedModes` 引用改为 `ALLOWED_MODES`：

```js
// 改前
const mode = allowedModes.includes(opts.mode) ? opts.mode : "deals";
// 改后
const mode = ALLOWED_MODES.includes(opts.mode) ? opts.mode : "deals";
```

> 注：这一步同时完成了 Task 2 Step 2 的目标。Task 2 Step 2 可作为"先确认 grep 无调用方"的前置检查，实际的字符串修改在本步完成。

**6b. 在 `module.exports` 补充导出**：

```js
// 改前
module.exports = { registerGamesHandlers, attachFx, EMPTY_FX };
// 改后
module.exports = {
  registerGamesHandlers,
  attachFx,
  EMPTY_FX,
  dealsCacheKey,
  dealsCacheGet,
  dealsCacheSet,
  DEALS_CACHE_TTL_MS,
  DEALS_CACHE_MAX,
  resetDealsCache: () => _dealsCache.clear(),
  ALLOWED_MODES,
};
```

> `resetDealsCache` 是测试辅助函数，用于每个 test 清空缓存避免相互污染。`_dealsCache` 是模块级 `Map`，不直接导出（避免外部 mutate），用 `resetDealsCache` 暴露清理能力。

- [ ] **Step 7: 运行全部新增 IPC 测试确认通过**

Run: `npx vitest run tests/main/ipc/register-games.test.js`

Expected: PASS。

- [ ] **Step 8: 确认 attachFx 测试不回归**

Run: `npx vitest run tests/main/ipc/`

Expected: PASS（新导出不影响现有 attachFx 测试）。

---

### Task 5: 完整验证

**Files:**
- Verify only

- [ ] **Step 1: 运行所有游戏相关测试**

Run: `npx vitest run tests/main/games tests/renderer/GamesPage-fx.test.jsx tests/renderer/GameCard-free-events.test.jsx tests/renderer/games-store.test.js tests/renderer/games-check-scheduler.test.js`

Expected: PASS。

- [ ] **Step 2: 运行完整测试套件**

Run: `npx vitest run`

Expected: PASS，0 failures。

- [ ] **Step 3: 构建 renderer**

Run: `npm run build:renderer`

Expected: 构建成功，退出码 0。

- [ ] **Step 4: 检查改动边界**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无尾随空白告警；status 只包含本计划列出的文件：
- `src/main/games/log.js`（新）
- `src/main/games/playstation.js`
- `src/main/games/psprices.js`
- `src/main/games/itad.js`
- `src/main/games/switch.js`
- `src/main/games/xbox-free.js`
- `src/main/games/exchange-rates.js`
- `src/main/ipc/register-games.js`
- `src/renderer/games/GamesPage.jsx`
- `tests/main/games/log.test.js`（新）
- `tests/main/games/switch.test.js`（新）
- `tests/main/ipc/register-games.test.js`（新）
- `tests/renderer/GamesPage-fx.test.jsx`
