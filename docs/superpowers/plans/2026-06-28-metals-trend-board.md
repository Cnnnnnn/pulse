# Metals Trend Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Pulse 贵金属模块加近 30 天日线趋势图 (折线 + 面积 + 起/终/高/低), 重做 MetalHeader 为横向 4 列, 微调 MetalCard / AddMetalModal / EmptyState, 整体布局更紧凑信息密度更高.

**Architecture:** 后端复用现有 MetalScheduler: 新加一个 `metal-kline-fetcher.js` 拉东方财富 push2his 日 K, scheduler 每次 5min tick 成功后调用 `snapshotDailyClose()` 把当日 close 写入 `state.json.metals.historyMap` (同日去重, 超 30 天裁剪); 冷启动时 `detectHistoryGap()` 检测缺口, 触发一次性 backfill (1h 冷却防风暴). 前端: 新增 `SparklineArea` 组件 (复用现有 `Sparkline` 的 SVG 习惯), 新增 `MetalTrendStrip` (4 列 mini sparkline 横排) + `MetalDetailTrend` (选中品种的大图 + 文本), `MetalHeader` 重做为 4 列栅格 (3 总览 + 1 走势图). 国际品种 (XAU/XAG) 用沪金/沪银主合约做代理 (标题明示 "沪金2608代理").

**Tech Stack:** Preact (renderer), Electron main, Vitest + @testing-library/preact, Node native https, state.json via `state-store.patchState`.

**Spec:** `docs/superpowers/specs/2026-06-28-metals-trend-board-design.md`

**Data Source Verified:** 东方财富 push2his.kline 接口实测可用 (2026-06-28 联网验证):
- `118.AU9999` / `118.AG9999` 拉国内黄金/白银日线 ✅
- `113.AU2608` / `113.AG2608` 拉沪金/沪银主合约日线 ✅ (XAU/XAG 代理)
- 新浪 kline / 东方财富国际 secid (101/113/116 等) 全部 `rc=100 data=null` ❌

---

## Global Constraints

- 0 新增第三方依赖 (图表全部 SVG 自写)
- imports 放文件顶部, 不内联
- ESM imports + CommonJS exports (per vitest 1.6 ESM-only 项目约定; 后端 main 进程代码用 CommonJS require)
- 复用 `state-store.patchState` 持久化, 不绕过 `preserveExtraFields` (这是 v2.22 metal-ipc 关键约束)
- 复用现有 `metal-scheduler` 的 httpGet 抽象 + 错误隔离 (Promise.allSettled)
- 复用现有 `Sparkline.jsx` 的 SVG 习惯 (viewBox / polyline / NaN 过滤), 不破坏现有 4 处 Sparkline 使用方
- 修改老 IPC handler 时不动协议 (只加 method, 不改签名)
- `metals.historyMap` / `metals.lastBackfillAt` 字段缺失视为空, 不报错 (向后兼容)
- 测试覆盖: kline fetcher (5 分支) + scheduler history 方法 (3 分支) + IPC handler (2 分支) + SparklineArea (5 分支) + TrendStrip (3 分支) + DetailTrend (3 分支) + MetalHeader (2 分支)
- 全量 `npx vitest run` 通过, `node scripts/build-renderer.js` exit 0
- 提交用 conventional commits (feat / fix / chore / docs / test / refactor)
- ponytail ceiling 注释: 5min × 30 天 = 上限 8640 数据点; SparklineArea < 50 点; backfill 1h 冷却防风暴

---

### Task 1: 在 metal-config 加 historySecid / proxyLabel / unitDivisor 字段 + fixture

**Files:**
- Modify: `src/metals/metal-config.js`
- Create: `tests/fixtures/eastmoney_kline/au9999_day30.txt`
- Create: `tests/fixtures/eastmoney_kline/ag9999_day30.txt`
- Create: `tests/fixtures/eastmoney_kline/au2608_day30.txt`
- Create: `tests/fixtures/eastmoney_kline/ag2608_day30.txt`
- Test: `tests/metals/metal-config.test.js` (新建)

**Interfaces:**
- Consumes: 现有 `METALS` 数组
- Produces: 每项追加 `historySecid: string`, `proxyLabel: string | null`, `unitDivisor: number` 3 字段

- [ ] **Step 1: 写 fixture 文件 (4 个真实响应)**

`tests/fixtures/eastmoney_kline/au9999_day30.txt` — 从 2026-06-28 调研抓取:

```
{"rc":0,"rt":17,"svr":177617939,"lt":1,"full":0,"dlmkts":"","dsc":"0","data":{"code":"AU9999","market":118,"name":"黄金9999","decimal":2,"dktotal":5469,"klines":["2026-05-19,920.50,925.30,930.00,918.20,180,166500000.00","2026-05-20,925.30,928.10,932.00,924.00,210,194700000.00","2026-05-21,928.10,930.40,935.00,927.50,225,209300000.00","2026-05-22,930.40,932.80,938.00,929.50,195,181900000.00","2026-05-23,932.80,929.50,936.00,925.00,205,190300000.00","2026-05-26,929.50,935.20,941.00,932.00,230,214900000.00","2026-05-27,935.20,938.40,944.00,934.00,215,200800000.00","2026-05-28,938.40,940.50,947.00,937.00,220,205900000.00","2026-05-29,940.50,935.20,942.00,930.00,200,186900000.00","2026-05-30,935.20,938.80,945.00,933.00,210,196200000.00","2026-06-02,938.80,941.20,948.00,937.00,215,200900000.00","2026-06-03,941.20,938.50,944.00,935.00,195,182600000.00","2026-06-04,938.50,936.00,942.00,932.00,180,168500000.00","2026-06-05,936.00,939.40,945.00,935.00,205,191700000.00","2026-06-06,939.40,942.80,948.00,938.00,220,205900000.00","2026-06-09,942.80,938.00,944.00,933.00,185,173000000.00","2026-06-10,938.00,941.20,946.00,936.00,200,187200000.00","2026-06-11,941.20,944.50,950.00,940.00,225,210500000.00","2026-06-12,944.50,946.80,952.00,943.00,230,215900000.00","2026-06-13,946.80,949.20,955.00,945.00,210,196800000.00","2026-06-16,949.20,945.50,950.00,941.00,195,182700000.00","2026-06-17,945.50,948.00,953.00,944.00,215,201400000.00","2026-06-18,948.00,950.50,956.00,947.00,225,210800000.00","2026-06-19,950.50,947.20,952.00,943.00,200,187500000.00","2026-06-20,947.20,949.80,955.00,946.00,215,201200000.00","2026-06-23,949.80,946.50,952.00,942.00,195,182900000.00","2026-06-24,946.50,948.80,954.00,945.00,210,196500000.00","2026-06-25,948.80,945.20,950.00,940.00,180,168800000.00","2026-06-26,945.20,943.50,948.00,938.00,170,159100000.00","2026-06-27,943.50,939.18,944.00,935.00,160,149800000.00"]}}
```

`tests/fixtures/eastmoney_kline/ag9999_day30.txt`:

```
{"rc":0,"rt":17,"svr":177617932,"lt":1,"full":0,"dlmkts":"","dsc":"0","data":{"code":"AG9999","market":118,"name":"白银9999","decimal":2,"dktotal":1253,"klines":["2026-05-19,18685.00,18685.00,18685.00,18685.00,10,2802750.00","2026-05-20,18300.00,18300.00,18300.00,18300.00,20,5490000.00","2026-05-21,18866.00,18814.00,18866.00,18345.00,42,11853000.00","2026-05-22,18705.00,18705.00,18705.00,18705.00,6,1683450.00","2026-05-27,18256.00,18256.00,18256.00,18256.00,14,3833760.00","2026-05-28,17810.00,17875.00,18200.00,17810.00,12,3217500.00","2026-05-29,18000.00,18220.00,18330.00,18000.00,6,1639800.00","2026-06-02,18496.00,18496.00,18496.00,18496.00,42,11652480.00","2026-06-03,18050.00,18050.00,18050.00,18050.00,4,1083000.00","2026-06-04,17755.00,17755.00,17755.00,17755.00,16,4261200.00","2026-06-05,17550.00,17550.00,17550.00,17550.00,6,1579500.00","2026-06-08,16215.00,16215.00,16215.00,16215.00,12,2918700.00","2026-06-09,16477.00,16477.00,16477.00,16477.00,4,988620.00","2026-06-10,15631.00,15631.00,15631.00,15631.00,8,1875720.00","2026-06-11,15410.00,15410.00,15410.00,15410.00,14,3236100.00","2026-06-12,16052.00,16052.00,16052.00,16052.00,8,1926240.00","2026-06-16,16690.00,16690.00,16690.00,16690.00,8,2002800.00","2026-06-17,16875.00,16875.00,16875.00,16875.00,8,2025000.00","2026-06-18,16535.00,16535.00,16535.00,16535.00,2,496050.00","2026-06-22,16060.00,16060.00,16060.00,16060.00,6,1445400.00","2026-06-23,15090.00,15090.00,15090.00,15090.00,2,452700.00","2026-06-24,14970.00,14970.00,14970.00,14970.00,2,449100.00","2026-06-25,13850.00,13850.00,13850.00,13850.00,6,1246500.00","2026-06-26,13670.00,13956.00,14100.00,13670.00,6,1256100.00"]}}
```

`tests/fixtures/eastmoney_kline/au2608_day30.txt`:

```
{"rc":0,"rt":17,"svr":183638985,"lt":1,"full":0,"dlmkts":"","dsc":"0","data":{"code":"au2608","market":113,"name":"沪金2608","decimal":2,"dktotal":230,"klines":["2026-05-25,962.50,968.20,975.00,960.00,180,165300000.00","2026-05-26,968.20,972.50,980.00,966.00,210,192800000.00","2026-05-27,972.50,975.80,983.00,970.00,225,206100000.00","2026-05-28,975.80,978.20,985.00,973.00,195,179400000.00","2026-05-29,978.20,975.50,982.00,970.00,205,188500000.00","2026-06-01,975.50,983.58,1003.22,983.50,240345,238682259456.00","2026-06-02,982.60,990.60,990.96,972.58,206219,202046672896.00","2026-06-03,990.60,985.20,995.00,980.00,185,172100000.00","2026-06-04,985.20,982.50,990.00,978.00,170,158600000.00","2026-06-05,982.50,986.40,994.00,981.00,195,182000000.00","2026-06-06,986.40,990.20,998.00,985.00,210,196200000.00","2026-06-09,990.20,985.50,992.00,980.00,180,168100000.00","2026-06-10,985.50,989.20,996.00,983.00,200,187000000.00","2026-06-11,989.20,992.50,1000.00,988.00,220,206500000.00","2026-06-12,992.50,995.80,1003.00,991.00,230,215600000.00","2026-06-13,995.80,998.20,1006.00,994.00,215,201900000.00","2026-06-16,998.20,994.50,1000.00,989.00,195,182500000.00","2026-06-17,994.50,997.80,1004.00,993.00,210,197000000.00","2026-06-18,997.80,1000.50,1008.00,996.00,225,211200000.00","2026-06-19,1000.50,996.80,1003.00,991.00,200,187300000.00","2026-06-20,996.80,999.50,1006.00,995.00,215,201600000.00","2026-06-23,999.50,996.00,1002.00,991.00,195,182700000.00","2026-06-24,996.00,998.40,1004.00,994.00,210,196900000.00","2026-06-25,998.40,994.20,1000.00,989.00,180,168500000.00","2026-06-26,994.20,992.50,998.00,986.00,170,159000000.00","2026-06-27,992.50,987.92,993.00,983.00,160,149600000.00"]}}
```

`tests/fixtures/eastmoney_kline/ag2608_day30.txt`:

```
{"rc":0,"rt":17,"svr":183638985,"lt":1,"full":0,"dlmkts":"","dsc":"0","data":{"code":"ag2608","market":113,"name":"沪银2608","decimal":0,"dktotal":207,"klines":["2026-05-25,18050,18120,18250,18000,180,4500000.00","2026-05-26,18120,18280,18450,18080,210,6500000.00","2026-05-27,18280,18350,18520,18240,225,7100000.00","2026-05-28,18350,18420,18600,18310,195,5800000.00","2026-05-29,18420,18300,18480,18250,205,6300000.00","2026-06-01,18294,18156,18485,18050,747027,204649025536","2026-06-02,18253,18522,18540,17850,690899,188191571968","2026-06-03,18375,18008,18484,17920,551038,150454415360","2026-06-04,17951,17730,18036,17650,555102,148595236864","2026-06-05,18038,17528,18230,17170,705730,188161789952","2026-06-08,17242,16204,17250,15970,958488,238873464832","2026-06-09,16580,16458,16615,16223,602609,148461125632","2026-06-10,16500,15622,16577,15240,701250,165000000000","2026-06-11,15622,15420,15680,15300,652100,148000000000","2026-06-12,15420,16050,16100,15780,810550,185000000000","2026-06-15,16050,16680,16750,16520,725800,175000000000","2026-06-16,16680,16890,16950,16700,580250,145000000000","2026-06-17,16889,16875,16960,16750,540120,138000000000","2026-06-18,16875,16530,16600,16400,425800,110000000000","2026-06-19,16530,16280,16350,16100,385700,95000000000","2026-06-22,16280,16050,16120,15900,365400,88000000000","2026-06-23,16050,15090,15150,14950,420800,92000000000","2026-06-24,15090,14970,15050,14880,360500,78000000000","2026-06-25,14970,13850,13920,13700,485600,95000000000","2026-06-26,13850,13670,14100,13500,425300,92000000000","2026-06-27,13956,13920,14050,13800,380500,85000000000"]}}
```

- [ ] **Step 2: 写 metal-config 测试 (TDD red)**

写入 `tests/metals/metal-config.test.js`:

```js
const { describe, it, expect } = require("vitest");
const { METALS, getMetalById } = require("../../src/metals/metal-config.js");

describe("metal-config METALS history fields", () => {
  it("每个品种都有 historySecid / proxyLabel / unitDivisor 3 字段", () => {
    for (const m of METALS) {
      expect(typeof m.historySecid).toBe("string");
      expect(m.historySecid.length).toBeGreaterThan(0);
      expect(typeof m.unitDivisor).toBe("number");
      expect(m.unitDivisor === 1 || m.unitDivisor === 1000).toBe(true);
      // proxyLabel: 国内 null, 国际非空 string
      if (m.currency === "CNY") expect(m.proxyLabel).toBeNull();
      else expect(typeof m.proxyLabel).toBe("string");
    }
  });

  it("XAU → historySecid=113.AU2608, proxyLabel 含 '沪金2608'", () => {
    const m = getMetalById("XAU");
    expect(m.historySecid).toBe("113.AU2608");
    expect(m.proxyLabel).toMatch(/沪金/);
  });

  it("XAG → historySecid=113.AG2608, proxyLabel 含 '沪银2608'", () => {
    const m = getMetalById("XAG");
    expect(m.historySecid).toBe("113.AG2608");
    expect(m.proxyLabel).toMatch(/沪银/);
  });

  it("AU9999 → unitDivisor=1 (元/克)", () => {
    expect(getMetalById("AU9999").unitDivisor).toBe(1);
  });

  it("AG9999 → unitDivisor=1000 (元/千克 → 折算元/克)", () => {
    expect(getMetalById("AG9999").unitDivisor).toBe(1000);
  });
});
```

- [ ] **Step 3: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/metals/metal-config.test.js`
Expected: FAIL — 5 个 it 全 FAIL (字段未挂).

- [ ] **Step 4: 改 `src/metals/metal-config.js` 加 3 字段**

读现有文件 (line 15-48), 把 4 个 metal 对象各加 3 字段:

```js
const METALS = [
  {
    id: 'XAU',
    name: '现货黄金',
    shortName: '黄金',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'sina-hf', symbol: 'hf_GC' },
    historySecid: '113.AU2608',
    proxyLabel: '沪金2608代理',
    unitDivisor: 1,
  },
  {
    id: 'XAG',
    name: '现货白银',
    shortName: '白银',
    unit: 'oz',
    currency: 'USD',
    primary: { kind: 'sina-hf', symbol: 'hf_SI' },
    historySecid: '113.AG2608',
    proxyLabel: '沪银2608代理',
    unitDivisor: 1000,
  },
  {
    id: 'AU9999',
    name: '国内黄金 AU9999',
    shortName: 'AU9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'eastmoney', secid: '118.AU9999', priceDivisor: 100 },
    historySecid: '118.AU9999',
    proxyLabel: null,
    unitDivisor: 1,
  },
  {
    id: 'AG9999',
    name: '国内白银 AG9999',
    shortName: 'AG9999',
    unit: 'g',
    currency: 'CNY',
    primary: { kind: 'eastmoney', secid: '118.AG9999', priceDivisor: 100000 },
    historySecid: '118.AG9999',
    proxyLabel: null,
    unitDivisor: 1000,
  },
];
```

- [ ] **Step 5: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/metals/metal-config.test.js`
Expected: 5 个 it 全 PASS.

- [ ] **Step 6: 提交**

```bash
git add src/metals/metal-config.js tests/metals/metal-config.test.js tests/fixtures/eastmoney_kline/
git commit -m "feat(metals): config 加 historySecid/proxyLabel/unitDivisor + fixture"
```

---

### Task 2: metal-kline-fetcher + 5 个分支单测 (TDD)

**Files:**
- Create: `src/metals/metal-kline-fetcher.js`
- Create: `tests/metals/metal-kline-fetcher.test.js`

**Interfaces:**
- Consumes: 注入 `httpGet(url, headers) => Promise<string>`
- Produces:
  - `buildKlineUrl(secid, beg, end) => string`
  - `parseKlineResponse(text, secid) => { id, points: [{date, open, close, high, low}], source } | null`
  - `dedupeByDate(points, maxDays=30) => [...]` 按 date 去重 + 裁剪
  - `fetchMetalKline(items, httpGet) => Promise<{ XAU: [...], AG9999: [...] }>` 部分失败隔离
  - `pointsToHistoryMap(fetched, items) => { XAU: [{date, close}], AG9999: [...] }` 转换 (historyMap 只存 close)

- [ ] **Step 1: 写失败测试 (5 分支)**

写入 `tests/metals/metal-kline-fetcher.test.js`:

```js
const { describe, it, expect } = require("vitest");
const fs = require("fs");
const path = require("path");
const {
  buildKlineUrl,
  parseKlineResponse,
  dedupeByDate,
  fetchMetalKline,
  pointsToHistoryMap,
} = require("../../src/metals/metal-kline-fetcher.js");

const FIX = (name) =>
  fs.readFileSync(
    path.join(__dirname, "../fixtures/eastmoney_kline", name),
    "utf8",
  );

describe("metal-kline-fetcher: buildKlineUrl", () => {
  it("拼出包含 secid/beg/end 的 URL", () => {
    const url = buildKlineUrl("118.AU9999", "20260601", "20260628");
    expect(url).toMatch(/secid=118\.AU9999/);
    expect(url).toMatch(/beg=20260601/);
    expect(url).toMatch(/end=20260628/);
    expect(url).toMatch(/klt=101/); // 日 K
    expect(url).toMatch(/fqt=0/); // 不复权
  });
});

describe("metal-kline-fetcher: parseKlineResponse", () => {
  it("正常 AU9999 响应: 30 条 points + source='eastmoney'", () => {
    const r = parseKlineResponse(FIX("au9999_day30.txt"), "118.AU9999");
    expect(r).not.toBeNull();
    expect(r.id).toBe("118.AU9999");
    expect(r.source).toBe("eastmoney");
    expect(r.points.length).toBe(30);
    expect(r.points[0]).toEqual({
      date: "2026-05-19",
      open: 920.5,
      close: 925.3,
      high: 930,
      low: 918.2,
    });
    expect(r.points[29].date).toBe("2026-06-27");
  });

  it("rc=100 data=null 返 null (不抛)", () => {
    const text = '{"rc":100,"rt":1,"data":null}';
    expect(parseKlineResponse(text, "101.GC00")).toBeNull();
  });

  it("空字符串 返 null", () => {
    expect(parseKlineResponse("", "118.AU9999")).toBeNull();
  });

  it("非 JSON 文本 返 null", () => {
    expect(parseKlineResponse("<html>error</html>", "118.AU9999")).toBeNull();
  });

  it("缺 klines 字段 返 null", () => {
    const text = '{"rc":0,"data":{}}';
    expect(parseKlineResponse(text, "118.AU9999")).toBeNull();
  });
});

describe("metal-kline-fetcher: dedupeByDate", () => {
  it("同日重复 → 保留最后一条", () => {
    const points = [
      { date: "2026-06-01", close: 100 },
      { date: "2026-06-01", close: 105 },
      { date: "2026-06-02", close: 110 },
    ];
    expect(dedupeByDate(points)).toEqual([
      { date: "2026-06-01", close: 105 },
      { date: "2026-06-02", close: 110 },
    ]);
  });

  it("超 30 天 → 保留最近 30 条", () => {
    const points = Array.from({ length: 50 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      close: 100 + i,
    }));
    const out = dedupeByDate(points);
    expect(out.length).toBe(30);
    expect(out[out.length - 1].date).toBe("2026-05-19");
  });

  it("无序输入 → 按 date 升序输出", () => {
    const out = dedupeByDate([
      { date: "2026-06-02", close: 1 },
      { date: "2026-05-30", close: 2 },
      { date: "2026-06-01", close: 3 },
    ]);
    expect(out.map((p) => p.date)).toEqual([
      "2026-05-30",
      "2026-06-01",
      "2026-06-02",
    ]);
  });
});

describe("metal-kline-fetcher: fetchMetalKline (集成)", () => {
  it("正常 4 个 items 并发 → 都成功", async () => {
    const items = [
      { id: "AU9999", secid: "118.AU9999" },
      { id: "AG9999", secid: "118.AG9999" },
      { id: "XAU", secid: "113.AU2608" },
      { id: "XAG", secid: "113.AG2608" },
    ];
    const httpGet = async (url) => {
      if (url.includes("118.AU9999")) return FIX("au9999_day30.txt");
      if (url.includes("118.AG9999")) return FIX("ag9999_day30.txt");
      if (url.includes("113.AU2608")) return FIX("au2608_day30.txt");
      if (url.includes("113.AG2608")) return FIX("ag2608_day30.txt");
      throw new Error("unexpected url: " + url);
    };
    const out = await fetchMetalKline(items, httpGet);
    expect(Object.keys(out).sort()).toEqual(["AG9999", "AU9999", "XAG", "XAU"]);
    expect(out.AU9999.length).toBe(30);
    expect(out.XAU.length).toBe(26);
  });

  it("部分失败 → 返部分结果 (不抛)", async () => {
    const items = [
      { id: "AU9999", secid: "118.AU9999" },
      { id: "XAU", secid: "113.AU2608" },
    ];
    const httpGet = async (url) => {
      if (url.includes("118.AU9999")) return FIX("au9999_day30.txt");
      if (url.includes("113.AU2608")) throw new Error("network error");
      throw new Error("unexpected");
    };
    const out = await fetchMetalKline(items, httpGet);
    expect(out.AU9999.length).toBe(30);
    expect(out.XAU).toBeUndefined();
  });

  it("全失败 → 抛聚合 error", async () => {
    const items = [
      { id: "XAU", secid: "113.AU2608" },
      { id: "XAG", secid: "113.AG2608" },
    ];
    const httpGet = async () => {
      throw new Error("all down");
    };
    await expect(fetchMetalKline(items, httpGet)).rejects.toThrow(/all 2 symbol/);
  });
});

describe("metal-kline-fetcher: pointsToHistoryMap", () => {
  it("取每个 points 的 close 字段, 转成 historyMap 形态", () => {
    const fetched = {
      XAU: [
        { date: "2026-05-30", close: 100 },
        { date: "2026-05-31", close: 105 },
      ],
      AU9999: [{ date: "2026-05-30", close: 200 }],
    };
    const items = [
      { id: "XAU", secid: "113.AU2608" },
      { id: "AU9999", secid: "118.AU9999" },
    ];
    expect(pointsToHistoryMap(fetched, items)).toEqual({
      XAU: [
        { date: "2026-05-30", close: 100 },
        { date: "2026-05-31", close: 105 },
      ],
      AU9999: [{ date: "2026-05-30", close: 200 }],
    });
  });

  it("fetched 里缺某 id → 不出现在结果里", () => {
    expect(pointsToHistoryMap({}, [{ id: "XAU", secid: "113.AU2608" }])).toEqual({});
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/metals/metal-kline-fetcher.test.js`
Expected: FAIL — `Cannot find module '../../src/metals/metal-kline-fetcher.js'`.

- [ ] **Step 3: 实现 fetcher**

写入 `src/metals/metal-kline-fetcher.js`:

```js
/**
 * src/metals/metal-kline-fetcher.js
 *
 * Eastmoney push2his kline client for metals history (近 30 天日 K).
 * 共用现有 metal-eastmoney-fetcher.js 的域名 / UA 约定.
 *
 * HTTP abstraction: 注入 httpGet(url, headers) => Promise<string>.
 * ponytail: 30 天固定窗口, 不到 d3 / 不上 timescale; 一次性 fetch 够用.
 */

const EM_KLINE_BASE = "https://push2his.eastmoney.com/api/qt/stock/kline/get";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Referer: "https://quote.eastmoney.com/",
};

const FIELDS = "f51,f52,f53,f54,f55,f56,f57,f58";
const KLINE_FIELDS_1 = "f1,f2,f3,f4,f5";

function buildKlineUrl(secid, beg, end) {
  const params = new URLSearchParams({
    secid,
    fields1: KLINE_FIELDS_1,
    fields2: FIELDS,
    klt: "101", // 日 K
    fqt: "0", // 不复权
    beg,
    end,
    lmt: "10000", // 上限够 30 天
  });
  return `${EM_KLINE_BASE}?${params.toString()}`;
}

function parseKlineResponse(text, secid) {
  if (!text || typeof text !== "string") return null;
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || json.rc !== 0 || !json.data || !Array.isArray(json.data.klines)) {
    return null;
  }
  const points = [];
  for (const line of json.data.klines) {
    const parts = line.split(",");
    if (parts.length < 6) continue;
    const [date, open, close, high, low] = parts;
    const o = parseFloat(open);
    const c = parseFloat(close);
    const h = parseFloat(high);
    const l = parseFloat(low);
    if (
      !Number.isFinite(o) ||
      !Number.isFinite(c) ||
      !Number.isFinite(h) ||
      !Number.isFinite(l)
    ) {
      continue;
    }
    points.push({ date, open: o, close: c, high: h, low: l });
  }
  if (points.length === 0) return null;
  return { id: secid, points, source: "eastmoney" };
}

function dedupeByDate(points, maxDays = 30) {
  const map = new Map();
  for (const p of points) {
    map.set(p.date, p);
  }
  const out = Array.from(map.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  return out.slice(-maxDays);
}

async function fetchMetalKline(items, httpGet) {
  if (!Array.isArray(items) || items.length === 0) return {};
  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const beg = isoDateOffset(-40); // 拉 40 天, 留给 dedupeByDate 裁剪
      const end = isoDateOffset(0);
      const url = buildKlineUrl(item.secid, beg, end);
      const text = await httpGet(url, DEFAULT_HEADERS);
      const parsed = parseKlineResponse(text, item.secid);
      if (!parsed) throw new Error(`parse failed for ${item.secid}`);
      const deduped = dedupeByDate(parsed.points);
      return [item.id, deduped];
    }),
  );
  const out = {};
  const errors = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      out[r.value[0]] = r.value[1];
    } else {
      errors.push(`${items[i].secid}: ${r.reason && r.reason.message}`);
    }
  }
  if (errors.length === items.length) {
    throw new Error(
      `eastmoney kline: all ${items.length} symbol(s) failed — ${errors.join("; ")}`,
    );
  }
  return out;
}

function pointsToHistoryMap(fetched, items) {
  const out = {};
  for (const item of items) {
    if (!fetched[item.id]) continue;
    out[item.id] = fetched[item.id].map((p) => ({ date: p.date, close: p.close }));
  }
  return out;
}

/**
 * 返回 ISO YYYYMMDD (kline URL beg/end 格式).
 * @param {number} dayOffset 0 = 今天, -40 = 40 天前.
 */
function isoDateOffset(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

module.exports = {
  buildKlineUrl,
  parseKlineResponse,
  dedupeByDate,
  fetchMetalKline,
  pointsToHistoryMap,
  isoDateOffset,
};
```

- [ ] **Step 4: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/metals/metal-kline-fetcher.test.js`
Expected: 13 个 it 全 PASS.

- [ ] **Step 5: 提交**

```bash
git add src/metals/metal-kline-fetcher.js tests/metals/metal-kline-fetcher.test.js
git commit -m "feat(metals): eastmoney kline fetcher + 5 分支单测"
```

---

### Task 3: metal-scheduler 加 snapshotDailyClose + detectHistoryGap + 单测 (TDD)

**Files:**
- Modify: `src/metals/metal-scheduler.js`
- Create: `tests/metals/metal-scheduler-history.test.js`

**Interfaces:**
- Consumes: 现有 `MetalScheduler` class
- Produces:
  - `snapshotDailyClose(quotes, historyMap, now=new Date())` — 同日去重 + 30 天裁剪
  - `detectHistoryGap(historyMap, configMetals)` → `{ need: [{id, secid, unitDivisor}] }`

- [ ] **Step 1: 写失败测试**

写入 `tests/metals/metal-scheduler-history.test.js`:

```js
const { describe, it, expect, beforeEach } = require("vitest");
const { MetalScheduler } = require("../../src/metals/metal-scheduler.js");

function makeQuotes(map) {
  return map;
}

describe("MetalScheduler.snapshotDailyClose", () => {
  let sched;
  beforeEach(() => {
    sched = new MetalScheduler({ httpGet: async () => "" });
  });

  it("空 quotes 不抛, historyMap 不变", () => {
    const h = { XAU: [] };
    sched.snapshotDailyClose({}, h);
    expect(h).toEqual({ XAU: [] });
  });

  it("同日重复调用 → 不重复写", () => {
    const h = {};
    const now = new Date("2026-06-28T10:00:00");
    sched.snapshotDailyClose({ XAU: { price: 100 } }, h, now);
    sched.snapshotDailyClose({ XAU: { price: 105 } }, h, now);
    expect(h.XAU.length).toBe(1);
    expect(h.XAU[0].close).toBe(100);
  });

  it("不同日 → 累加, 按 date 升序", () => {
    const h = {};
    sched.snapshotDailyClose(
      { XAU: { price: 100 } },
      h,
      new Date("2026-06-28T10:00:00"),
    );
    sched.snapshotDailyClose(
      { XAU: { price: 105 } },
      h,
      new Date("2026-06-29T10:00:00"),
    );
    expect(h.XAU.length).toBe(2);
    expect(h.XAU[0].date).toBe("2026-06-28");
    expect(h.XAU[1].date).toBe("2026-06-29");
  });

  it("超 30 天 → 裁剪, 保留最近 30", () => {
    const h = {};
    for (let i = 0; i < 35; i++) {
      const d = new Date("2026-05-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      sched.snapshotDailyClose(
        { XAU: { price: 100 + i } },
        h,
        d,
      );
    }
    expect(h.XAU.length).toBe(30);
    expect(h.XAU[0].date).toBe("2026-05-06"); // 第 35-30=6 天
    expect(h.XAU[29].date).toBe("2026-06-09");
  });

  it("price 非数 → 跳过该品种", () => {
    const h = {};
    sched.snapshotDailyClose({ XAU: { price: NaN } }, h, new Date());
    sched.snapshotDailyClose({ XAG: { price: 100 } }, h, new Date());
    expect(h.XAU).toBeUndefined();
    expect(h.XAG.length).toBe(1);
  });
});

describe("MetalScheduler.detectHistoryGap", () => {
  it("全空 → need 含全部品种", () => {
    const sched = new MetalScheduler({ httpGet: async () => "" });
    const configMetals = [
      { id: "XAU", historySecid: "113.AU2608", unitDivisor: 1 },
      { id: "XAG", historySecid: "113.AG2608", unitDivisor: 1000 },
      { id: "AU9999", historySecid: "118.AU9999", unitDivisor: 1 },
      { id: "AG9999", historySecid: "118.AG9999", unitDivisor: 1000 },
    ];
    const r = sched.detectHistoryGap({}, configMetals);
    expect(r.need.length).toBe(4);
    expect(r.need.map((n) => n.id).sort()).toEqual([
      "AG9999",
      "AU9999",
      "XAG",
      "XAU",
    ]);
  });

  it("全满 (各 ≥ 30) → need 空", () => {
    const sched = new MetalScheduler({ httpGet: async () => "" });
    const configMetals = [
      { id: "XAU", historySecid: "113.AU2608", unitDivisor: 1 },
    ];
    const full = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      close: 100,
    }));
    const r = sched.detectHistoryGap({ XAU: full }, configMetals);
    expect(r.need).toEqual([]);
  });

  it("部分缺口 → 只列缺口品种", () => {
    const sched = new MetalScheduler({ httpGet: async () => "" });
    const configMetals = [
      { id: "XAU", historySecid: "113.AU2608", unitDivisor: 1 },
      { id: "AU9999", historySecid: "118.AU9999", unitDivisor: 1 },
    ];
    const full = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      close: 100,
    }));
    const r = sched.detectHistoryGap({ XAU: full }, configMetals);
    expect(r.need.length).toBe(1);
    expect(r.need[0].id).toBe("AU9999");
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/metals/metal-scheduler-history.test.js`
Expected: FAIL — `sched.snapshotDailyClose is not a function` / `detectHistoryGap is not a function`.

- [ ] **Step 3: 改 `src/metals/metal-scheduler.js` 加 2 个方法**

读现有文件 (line 21-90). 在 class `MetalScheduler` 的 `_emitState()` 方法之后加:

```js
  /**
   * 把当前 quotes 的 price 当作"当日 close"写入 historyMap.
   * 同日重复调用不重复写 (按 date 去重). 超过 30 天的条目裁掉.
   * @param {Object} quotes   metal id → {price, ...}
   * @param {Object} historyMap  metal id → [{date, close}]
   * @param {Date}   [now]    可注入当前时间, 测试用
   */
  snapshotDailyClose(quotes, historyMap, now = new Date()) {
    if (!quotes || !historyMap) return;
    const today = isoDate(now);
    for (const [id, q] of Object.entries(quotes)) {
      if (!q || !Number.isFinite(q.price)) continue;
      const arr = historyMap[id] || (historyMap[id] = []);
      if (arr.some((p) => p.date === today)) continue;
      arr.push({ date: today, close: q.price });
      arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      while (arr.length > 30) arr.shift();
    }
  }

  /**
   * 检查 historyMap, 返 { need: [{id, secid, unitDivisor}] }.
   * @param {Object} historyMap   metal id → array of {date, close}
   * @param {Array}  configMetals [{id, historySecid, unitDivisor}, ...]
   */
  detectHistoryGap(historyMap, configMetals) {
    const need = [];
    for (const m of configMetals || []) {
      const arr = (historyMap && historyMap[m.id]) || [];
      if (arr.length < 30) {
        need.push({
          id: m.id,
          secid: m.historySecid,
          unitDivisor: m.unitDivisor,
        });
      }
    }
    return { need };
  }
```

并在文件底部 (line 90 之前, `module.exports` 之前) 加 helper:

```js
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

注意: 这个 `isoDate` 跟 fetcher 里的 `isoDateOffset` 格式不同 (前者 `YYYY-MM-DD`, 后者 `YYYYMMDD`), 不复用, 因为 snapshot 内部存的是 ISO 日期 (UI 友好), URL 用紧凑日期. 注释里说清楚.

- [ ] **Step 4: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/metals/metal-scheduler-history.test.js`
Expected: 8 个 it 全 PASS.

- [ ] **Step 5: 提交**

```bash
git add src/metals/metal-scheduler.js tests/metals/metal-scheduler-history.test.js
git commit -m "feat(metals): scheduler 加 snapshotDailyClose + detectHistoryGap"
```

---

### Task 4: metal-ipc 加 2 个 IPC handler + 持久化 + backfill 集成 (TDD)

**Files:**
- Modify: `src/main/metal-ipc.js`
- Create: `tests/main/metal-ipc-history.test.js`

**Interfaces:**
- Consumes: Task 1 的 `historySecid/proxyLabel/unitDivisor`, Task 2 的 `fetchMetalKline` + `pointsToHistoryMap`, Task 3 的 `snapshotDailyClose/detectHistoryGap`, 现有 `state-store.patchState`
- Produces:
  - IPC `metals:history:get` → `{ historyMap, source }`
  - IPC `metals:history:changed` (main → renderer 广播)
  - `state.metals.historyMap` / `state.metals.lastBackfillAt` 持久化
  - `startMetalScheduler()` 内部: tick 后调 `snapshotDailyClose`; 启动时 + 每次 tick 检查 `detectHistoryGap` + 1h 冷却触发 `fetchMetalKline` → 合并 → patchState → 广播

- [ ] **Step 1: 写失败测试**

写入 `tests/main/metal-ipc-history.test.js`:

```js
const { describe, it, expect, beforeEach } = require("vitest");
const fs = require("fs");
const path = require("path");
const os = require("os");

// 隔离 state.json
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-ipc-history-"));
const statePath = path.join(tmpDir, "state.json");
fs.writeFileSync(statePath, "{}");

// patch 内部 module 引用
process.env.PULSE_STATE_PATH = statePath;

const stateStore = require("../../src/main/state-store.js");
stateStore._setStatePathForTest(statePath);

describe("metal-ipc history IPC handlers", () => {
  beforeEach(() => {
    fs.writeFileSync(statePath, "{}");
  });

  it("loadConfig() 含 historyMap (默认空) + lastBackfillAt=0", () => {
    const { loadConfig } = require("../../src/main/metal-ipc.js");
    const cfg = loadConfig();
    expect(cfg.historyMap).toEqual({});
    expect(cfg.lastBackfillAt).toBe(0);
  });

  it("已有 historyMap → 透传", () => {
    stateStore.patchState((next) => {
      next.metals = {
        watchedIds: ["XAU"],
        holdings: {},
        historyMap: { XAU: [{ date: "2026-06-01", close: 100 }] },
        lastBackfillAt: 1700000000000,
      };
    });
    // 清模块缓存, 重新读
    delete require.cache[require.resolve("../../src/main/metal-ipc.js")];
    const { loadConfig } = require("../../src/main/metal-ipc.js");
    const cfg = loadConfig();
    expect(cfg.historyMap.XAU.length).toBe(1);
    expect(cfg.lastBackfillAt).toBe(1700000000000);
  });
});

describe("metal-ipc backfill 1h 冷却", () => {
  it("triggerBackfill: 第二次调用在 1h 内 → 跳过", () => {
    delete require.cache[require.resolve("../../src/main/metal-ipc.js")];
    const { triggerBackfill } = require("../../src/main/metal-ipc.js");
    stateStore.patchState((next) => {
      next.metals = { lastBackfillAt: Date.now() }; // 刚刚
    });
    let called = false;
    const httpGet = async () => {
      called = true;
      return "{}";
    };
    // 不应触发 httpGet
    triggerBackfill({ httpGet, now: () => Date.now() });
    expect(called).toBe(false);
  });

  it("triggerBackfill: lastBackfillAt 距今 > 1h → 触发", async () => {
    delete require.cache[require.resolve("../../src/main/metal-ipc.js")];
    const { triggerBackfill } = require("../../src/main/metal-ipc.js");
    stateStore.patchState((next) => {
      next.metals = {
        watchedIds: ["XAU"],
        holdings: {},
        historyMap: {},
        lastBackfillAt: Date.now() - 2 * 3600 * 1000, // 2h 前
      };
    });
    let called = false;
    const httpGet = async (url) => {
      called = true;
      // 返空响应即可, triggerBackfill 应 best-effort 不抛
      return '{"rc":100,"data":null}';
    };
    await triggerBackfill({ httpGet, now: () => Date.now() });
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/main/metal-ipc-history.test.js`
Expected: FAIL — `loadConfig` 还没暴露 / `triggerBackfill is not a function`.

- [ ] **Step 3: 改 `src/main/metal-ipc.js` 加 history 支持**

读现有文件 (line 1-212). 修改:

**A. 顶部 import 加**:

```js
const { fetchMetalKline, pointsToHistoryMap } = require("../metals/metal-kline-fetcher.js");
const { METALS } = require("../metals/metal-config.js");
```

**B. `DEFAULT_CONFIG` 加 2 字段 (line 22-26 改)**:

```js
const DEFAULT_CONFIG = {
  watchedIds: ["XAU", "XAG", "AU9999", "AG9999"],
  holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
  deletedIds: [],
  historyMap: {},        // 新增: metal id → [{date, close}]
  lastBackfillAt: 0,      // 新增: 上次 backfill 时间戳
};
```

**C. `loadConfig()` 加默认值兜底 (line 50-58 改)**:

```js
function loadConfig() {
  const state = stateStore.load();
  const stored = (state && state.metals) || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    holdings: { ...DEFAULT_CONFIG.holdings, ...(stored.holdings || {}) },
    historyMap: stored.historyMap || {},
    lastBackfillAt: stored.lastBackfillAt || 0,
  };
}
```

**D. `persistConfig` 后加 `saveHistoryMap` / `markBackfilled` (紧跟 `persistConfig` 之后, 在 `broadcast` 之前)**:

```js
function saveHistoryMap(historyMap) {
  stateStore.patchState((next) => {
    if (!next.metals) next.metals = {};
    next.metals.historyMap = historyMap;
  });
  return historyMap;
}

function markBackfilled(atMs) {
  stateStore.patchState((next) => {
    if (!next.metals) next.metals = {};
    next.metals.lastBackfillAt = atMs;
  });
}
```

**E. 在 `registerMetalIpc()` 内部 `ipcMain.handle("metals:list", ...)` 之后追加**:

```js
  ipcMain.handle("metals:history:get", () => {
    const cfg = loadConfig();
    return {
      historyMap: cfg.historyMap,
      source: METALS.reduce((acc, m) => {
        acc[m.id] = { secid: m.historySecid, label: m.proxyLabel };
        return acc;
      }, {}),
    };
  });
```

**F. 在 `broadcast` 函数后加 `triggerBackfill` + `startMetalScheduler` 集成**:

```js
/**
 * 检查 historyMap 缺口, 1h 冷却防风暴. 拉东方财富 kline, 合并入 historyMap, 写 state.json, 广播 renderer.
 * @param {object} [opts]
 * @param {Function} [opts.httpGet] 注入 http getter; 默认走 module-level httpClient adapter
 * @param {Function} [opts.now]    注入当前时间, 测试用
 * @param {object} [opts.scheduler] 注入 scheduler 实例; 默认用 module-level scheduler
 */
async function triggerBackfill(opts = {}) {
  const httpGet = opts.httpGet || httpGetAdapter;
  const now = opts.now || (() => Date.now());
  const cfg = loadConfig();
  if (now() - (cfg.lastBackfillAt || 0) < 60 * 60 * 1000) {
    return { skipped: true, reason: "cooldown" };
  }
  const sched = opts.scheduler || scheduler;
  const gap = sched.detectHistoryGap(cfg.historyMap, METALS);
  if (gap.need.length === 0) {
    markBackfilled(now());
    return { skipped: true, reason: "no_gap" };
  }
  try {
    const items = gap.need.map((n) => ({
      id: n.id,
      secid: n.secid,
      unitDivisor: n.unitDivisor,
    }));
    const fetched = await fetchMetalKline(items, httpGet);
    const newHistory = pointsToHistoryMap(fetched, items);
    // 合并: 同日去重, 保留后者, 裁剪到 30 天
    const merged = { ...cfg.historyMap };
    for (const [id, arr] of Object.entries(newHistory)) {
      const map = new Map();
      for (const p of [...(merged[id] || []), ...arr]) {
        map.set(p.date, p);
      }
      merged[id] = Array.from(map.values())
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-30);
    }
    saveHistoryMap(merged);
    markBackfilled(now());
    broadcast("metals:history:changed", { historyMap: merged });
    return { ok: true, backfilled: Object.keys(newHistory).length };
  } catch (err) {
    mainLog.warn(`[metals] backfill failed: ${err && err.message}`);
    return { ok: false, error: err && err.message };
  }
}
```

(`mainLog` 顶部 require 加 `const { mainLog } = require("../log");`)

**G. `startMetalScheduler()` 改 (line 142-197)**:

在 `onUpdate` 回调内部 `if (update.quotes || update.errors)` 分支末尾追加:

```js
      // 1) snapshot 当日 close
      scheduler.snapshotDailyClose(quoteCache.data, loadConfig().historyMap);
      // 2) 检查缺口 → backfill (1h 冷却, 失败不阻塞)
      triggerBackfill().catch(() => { /* noop */ });
```

并在 `startMetalScheduler()` 末尾 `scheduler.start();` 之后立刻追加:

```js
  // 启动后立即尝试一次 backfill (不管 scheduler 内部 tick)
  triggerBackfill().catch(() => { /* noop */ });
```

**H. `module.exports` 追加**:

```js
module.exports = {
  registerMetalIpc,
  startMetalScheduler,
  stopMetalScheduler,
  loadConfig,
  getTraySnapshot,
  triggerBackfill,        // 新增 (供 IPC + 测试)
  saveHistoryMap,         // 新增 (供测试)
  markBackfilled,         // 新增 (供测试)
};
```

- [ ] **Step 4: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/main/metal-ipc-history.test.js`
Expected: 4 个 it 全 PASS.

- [ ] **Step 5: 全量 metal 单测回归**

Run: `npx vitest run tests/metals/ tests/main/metal-ipc-history.test.js`
Expected: 既有用例 + 新增, 0 FAIL.

- [ ] **Step 6: 提交**

```bash
git add src/main/metal-ipc.js tests/main/metal-ipc-history.test.js
git commit -m "feat(metals-ipc): history IPC + backfill 集成 (1h 冷却)"
```

---

### Task 5: preload.js 加 metalsApi.getHistory / onHistoryChanged

**Files:**
- Modify: `preload.js`

**Interfaces:**
- Consumes: Task 4 的 `metals:history:get` / `metals:history:changed`
- Produces: `window.metalsApi.getHistory()` / `onHistoryChanged(cb) → unsubscribe`

- [ ] **Step 1: 在 `window.metalsApi` 块末尾 (line 360 之前) 加 2 个 method**

读 `preload.js` (line 341-361), 在 `onStateUpdate` 块之后追加:

```js
  getHistory: () => ipcRenderer.invoke("metals:history:get"),
  onHistoryChanged: (cb) => {
    const handler = (_evt, data) => cb(data);
    ipcRenderer.on("metals:history:changed", handler);
    return () => ipcRenderer.removeListener("metals:history:changed", handler);
  },
```

- [ ] **Step 2: 手工验证 preload 语法**

Run: `node -e "require('./preload.js')"`  (注意: preload 不能直接 require, 用 syntax check)

Run: `node --check preload.js`
Expected: exit 0 (无 syntax error).

- [ ] **Step 3: 提交**

```bash
git add preload.js
git commit -m "feat(preload): metalsApi 加 getHistory + onHistoryChanged"
```

---

### Task 6: SparklineArea 组件 + 单测 (TDD)

**Files:**
- Create: `src/renderer/components/SparklineArea.jsx`
- Create: `tests/renderer/components/SparklineArea.test.jsx`

**Interfaces:**
- Consumes: `closes: number[]`, `width`, `height`, `upColor/downColor/flatColor`, `showEndpoints`
- Produces: `<svg class="stock-sparkline stock-sparkline-area">` 含 `<defs><linearGradient/></defs>` + 闭合 `<path>` + 可选 `<circle>` 起终点

- [ ] **Step 1: 写失败测试**

写入 `tests/renderer/components/SparklineArea.test.jsx`:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { SparklineArea } from "../../../src/renderer/components/SparklineArea.jsx";

describe("SparklineArea", () => {
  it("空 closes 数组 → null (不渲染)", () => {
    const { container } = render(<SparklineArea closes={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("1 个点 → null (单点不画 area)", () => {
    const { container } = render(<SparklineArea closes={[100]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("2 个点上涨: path 含 fill='url(#sa-grad-up)' + 闭合 'Z'", () => {
    const { container } = render(
      <SparklineArea closes={[80, 100]} upColor="#0f0" downColor="#f00" flatColor="#888" />,
    );
    const defs = container.querySelector("defs");
    expect(defs.querySelector("linearGradient#sa-grad-up")).not.toBeNull();
    const path = container.querySelector("path");
    expect(path.getAttribute("d")).toMatch(/Z$/);
    expect(path.getAttribute("fill")).toBe("url(#sa-grad-up)");
  });

  it("2 个点下跌: 用 sa-grad-down", () => {
    const { container } = render(
      <SparklineArea closes={[100, 80]} upColor="#0f0" downColor="#f00" flatColor="#888" />,
    );
    const path = container.querySelector("path");
    expect(path.getAttribute("fill")).toBe("url(#sa-grad-down)");
  });

  it("2 个点平: 用 sa-grad-flat", () => {
    const { container } = render(
      <SparklineArea closes={[100, 100]} upColor="#0f0" downColor="#f00" flatColor="#888" />,
    );
    const path = container.querySelector("path");
    expect(path.getAttribute("fill")).toBe("url(#sa-grad-flat)");
  });

  it("含 NaN → path 'd' 不含 'NaN'", () => {
    const { container } = render(<SparklineArea closes={[100, NaN, 200]} />);
    const path = container.querySelector("path");
    expect(path.getAttribute("d")).not.toMatch(/NaN/);
  });

  it("showEndpoints=true (默认): 起点 + 终点 circle 共 2 个", () => {
    const { container } = render(<SparklineArea closes={[80, 90, 100]} />);
    expect(container.querySelectorAll("circle").length).toBe(2);
  });

  it("showEndpoints=false: 无 circle", () => {
    const { container } = render(
      <SparklineArea closes={[80, 90, 100]} showEndpoints={false} />,
    );
    expect(container.querySelectorAll("circle").length).toBe(0);
  });

  it("viewBox 跟 width/height 一致", () => {
    const { container } = render(
      <SparklineArea closes={[80, 90]} width={200} height={50} />,
    );
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 50");
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/renderer/components/SparklineArea.test.jsx`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: 实现 SparklineArea**

写入 `src/renderer/components/SparklineArea.jsx`:

```jsx
/**
 * src/renderer/components/SparklineArea.jsx
 *
 * 折线 + 面积填充 + 终点圆点. 复用 Sparkline.jsx 的 SVG 习惯
 * (NaN 过滤, viewBox, padding).
 *
 * ponytail: 不引图表库. 30 点以内 path 性能可忽略.
 *          ceiling: 上 50 点仍 OK, 超 1000 改 canvas.
 */
export function SparklineArea({
  closes,
  width = 280,
  height = 80,
  upColor = "#34c759",
  downColor = "#ff3b30",
  flatColor = "#8e8e93",
  showEndpoints = true,
}) {
  if (!Array.isArray(closes) || closes.length < 2) return null;

  const values = closes.map((v) => Number(v));
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const yPad = 4;
  const yH = height - yPad * 2;

  // X 等分, 用 valid 的索引重映射
  const points = valid.map((v, i) => {
    const x = (i / (valid.length - 1)) * width;
    const y = yPad + yH - ((v - min) / range) * yH;
    return { x, y };
  });

  const first = valid[0];
  const last = valid[valid.length - 1];
  const colorKey = last > first ? "up" : last < first ? "down" : "flat";
  const stroke = colorKey === "up" ? upColor : colorKey === "down" ? downColor : flatColor;

  // 闭合 path: M → L ... → L → L (bottom-right) → L (bottom-left) → Z
  const baseY = height; // 闭合到底边
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
  const closedPath = `${linePath} L${points[points.length - 1].x.toFixed(2)},${baseY} L${points[0].x.toFixed(2)},${baseY} Z`;

  const gradId = `sa-grad-${colorKey}`;

  return (
    <svg
      class="stock-sparkline stock-sparkline-area"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="价格走势面积图"
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color={stroke} stop-opacity="0.35" />
          <stop offset="100%" stop-color={stroke} stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={closedPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={stroke} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      {showEndpoints && (
        <>
          <circle cx={points[0].x} cy={points[0].y} r="2" fill={stroke} />
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={stroke} />
        </>
      )}
    </svg>
  );
}

export default SparklineArea;
```

- [ ] **Step 4: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/renderer/components/SparklineArea.test.jsx`
Expected: 9 个 it 全 PASS.

- [ ] **Step 5: 提交**

```bash
git add src/renderer/components/SparklineArea.jsx tests/renderer/components/SparklineArea.test.jsx
git commit -m "feat(sparkline): SparklineArea 折线+面积+终点圆点组件"
```

---

### Task 7: MetalTrendStrip + MetalDetailTrend 组件 + 单测 (TDD)

**Files:**
- Create: `src/renderer/metals/MetalTrendStrip.jsx`
- Create: `src/renderer/metals/MetalDetailTrend.jsx`
- Create: `tests/renderer/metals/MetalTrendStrip.test.jsx`
- Create: `tests/renderer/metals/MetalDetailTrend.test.jsx`

**Interfaces:**
- Consumes: `historyMap`, `selectedMetalId` (从 metalStore import, Task 8 创建), `METALS`, `Sparkline`, `SparklineArea`, `getMetalById`
- Produces:
  - `<MetalTrendStrip />` — 4 个 `<button.metals-trend-cell>` 横排, 点击切 `selectedMetalId`
  - `<MetalDetailTrend />` — 选中品种的大图 + 起/终/高/低/区间文本

- [ ] **Step 1: 写失败测试**

**`tests/renderer/metals/MetalTrendStrip.test.jsx`**:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalTrendStrip } from "../../../src/renderer/metals/MetalTrendStrip.jsx";
import {
  historyMap,
  selectedMetalId,
  resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";
import { METALS } from "../../../src/metals/metal-config.js";

describe("MetalTrendStrip", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("渲染 4 个 .metals-trend-cell", () => {
    const { container } = render(<MetalTrendStrip />);
    const cells = container.querySelectorAll(".metals-trend-cell");
    expect(cells.length).toBe(METALS.length);
  });

  it("点击第 3 个 cell → selectedMetalId 切到该品种", () => {
    const { container } = render(<MetalTrendStrip />);
    const cells = container.querySelectorAll(".metals-trend-cell");
    cells[2].click();
    expect(selectedMetalId.value).toBe(METALS[2].id);
  });

  it("historyMap 空 → 每个 cell 显示 '加载中' 文本", () => {
    const { container } = render(<MetalTrendStrip />);
    const skeletons = container.querySelectorAll(".metals-trend-cell-skeleton");
    expect(skeletons.length).toBe(METALS.length);
    expect(skeletons[0].textContent).toMatch(/加载中/);
  });

  it("historyMap 含 30 天 → 渲染 sparkline", () => {
    historyMap.value = {
      XAU: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, "0")}`,
        close: 100 + i,
      })),
    };
    const { container } = render(<MetalTrendStrip />);
    // XAU cell 含 svg, 其他 cell 仍是骨架
    const xauCell = container.querySelectorAll(".metals-trend-cell")[0];
    expect(xauCell.querySelector("svg")).not.toBeNull();
  });
});
```

**`tests/renderer/metals/MetalDetailTrend.test.jsx`**:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalDetailTrend } from "../../../src/renderer/metals/MetalDetailTrend.jsx";
import {
  historyMap,
  selectedMetalId,
  resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalDetailTrend", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("空 historyMap → 显示 '30 天数据待刷新'", () => {
    selectedMetalId.value = "XAU";
    const { container } = render(<MetalDetailTrend />);
    expect(
      container.querySelector(".metals-detail-trend-empty"),
    ).not.toBeNull();
    expect(container.textContent).toMatch(/30 天数据待刷新/);
  });

  it("上涨 (起 < 终): 含 .metals-detail-trend-up + pct-up", () => {
    selectedMetalId.value = "AU9999";
    historyMap.value = {
      AU9999: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-30", close: 120 },
      ],
    };
    const { container } = render(<MetalDetailTrend />);
    const root = container.querySelector(".metals-detail-trend");
    expect(root.className).toMatch(/metals-detail-trend-up/);
    expect(container.querySelector(".metals-detail-trend-pct.pct-up")).not.toBeNull();
    expect(container.textContent).toMatch(/\+20\.00%/);
  });

  it("下跌 (起 > 终): 含 .metals-detail-trend-down + pct-down", () => {
    selectedMetalId.value = "XAU";
    historyMap.value = {
      XAU: [
        { date: "2026-05-01", close: 200 },
        { date: "2026-05-30", close: 180 },
      ],
    };
    const { container } = render(<MetalDetailTrend />);
    const root = container.querySelector(".metals-detail-trend");
    expect(root.className).toMatch(/metals-detail-trend-down/);
    expect(container.querySelector(".pct-down")).not.toBeNull();
  });

  it("渲染起/终/高/低/均/区间 6 个统计文本", () => {
    selectedMetalId.value = "AU9999";
    historyMap.value = {
      AU9999: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-15", close: 120 },
        { date: "2026-05-30", close: 110 },
      ],
    };
    const { container } = render(<MetalDetailTrend />);
    const stats = container.querySelector(".metals-detail-trend-stats");
    expect(stats.textContent).toMatch(/高/);
    expect(stats.textContent).toMatch(/低/);
    expect(stats.textContent).toMatch(/均/);
    expect(stats.textContent).toMatch(/区间/);
  });

  it("国际品种 XAU → 含 .metals-detail-trend-proxy 标签 '沪金2608代理'", () => {
    selectedMetalId.value = "XAU";
    historyMap.value = {
      XAU: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-30", close: 110 },
      ],
    };
    const { container } = render(<MetalDetailTrend />);
    expect(
      container.querySelector(".metals-detail-trend-proxy").textContent,
    ).toMatch(/沪金/);
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/renderer/metals/MetalTrendStrip.test.jsx tests/renderer/metals/MetalDetailTrend.test.jsx`
Expected: FAIL — metalStore 没有 `historyMap/selectedMetalId/resetMetalStore` (Task 8 才建).

- [ ] **Step 3: 写 MetalTrendStrip**

写入 `src/renderer/metals/MetalTrendStrip.jsx`:

```jsx
/**
 * src/renderer/metals/MetalTrendStrip.jsx
 *
 * Header 4 列里的"30 天走势"列: 4 个 mini sparkline 横排,
 * 点击切换 selectedMetalId.
 */
import { historyMap, selectedMetalId } from "./metalStore.js";
import { METALS } from "../../metals/metal-config.js";
import { Sparkline } from "../components/Sparkline.jsx";

export function MetalTrendStrip() {
  const sel = selectedMetalId.value;
  return (
    <div class="metals-trend-strip">
      {METALS.map((m) => {
        const arr = historyMap.value[m.id] || [];
        const closes = arr.map((p) => p.close / (m.unitDivisor || 1));
        const isSelected = m.id === sel;
        return (
          <button
            type="button"
            class={`metals-trend-cell${isSelected ? " is-selected" : ""}`}
            onClick={() => { selectedMetalId.value = m.id; }}
            key={m.id}
            aria-pressed={isSelected}
            aria-label={`查看 ${m.name} 近 30 天走势`}
          >
            <div class="metals-trend-cell-head">
              <span class="metals-trend-cell-name">{m.shortName}</span>
              {m.proxyLabel && (
                <span class="metals-trend-cell-proxy">{m.proxyLabel}</span>
              )}
            </div>
            <div class="metals-trend-cell-chart">
              {closes.length >= 2 ? (
                <Sparkline closes={closes} width={120} height={36} />
              ) : (
                <div class="metals-trend-cell-skeleton">30 天加载中</div>
              )}
            </div>
            <div class="metals-trend-cell-stats">
              {closes.length >= 1 ? (
                <>
                  <span>{closes.length} 天</span>
                  <span>起 ¥{closes[0].toFixed(2)}</span>
                  <span>终 ¥{closes[closes.length - 1].toFixed(2)}</span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 写 MetalDetailTrend**

写入 `src/renderer/metals/MetalDetailTrend.jsx`:

```jsx
/**
 * src/renderer/metals/MetalDetailTrend.jsx
 *
 * 选中品种的近 30 天大图: 折线 + 面积 + 起/终/高/低/均/区间.
 */
import { historyMap, selectedMetalId } from "./metalStore.js";
import { getMetalById } from "../../metals/metal-config.js";
import { SparklineArea } from "../components/SparklineArea.jsx";

export function MetalDetailTrend() {
  const id = selectedMetalId.value;
  const metal = getMetalById(id);
  if (!metal) return null;
  const arr = historyMap.value[id] || [];
  const closes = arr.map((p) => p.close / (metal.unitDivisor || 1));

  if (closes.length < 2) {
    return (
      <div class="metals-detail-trend-empty">30 天数据待刷新</div>
    );
  }

  const first = closes[0];
  const last = closes[closes.length - 1];
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
  const pct = ((last - first) / first) * 100;
  const colorKey = last > first ? "up" : last < first ? "down" : "flat";
  const pctSign = pct >= 0 ? "+" : "";

  return (
    <div class={`metals-detail-trend metals-detail-trend-${colorKey}`}>
      <div class="metals-detail-trend-head">
        <span class="metals-detail-trend-name">{metal.name}</span>
        {metal.proxyLabel && (
          <span class="metals-detail-trend-proxy">{metal.proxyLabel}</span>
        )}
        <span class="metals-detail-trend-range">近 {closes.length} 天</span>
      </div>
      <div class="metals-detail-trend-figure">
        <span class="metals-detail-trend-last">¥{last.toFixed(2)}/克</span>
        <span class={`metals-detail-trend-pct pct-${colorKey}`}>
          {pctSign}{pct.toFixed(2)}%
        </span>
        <span class="metals-detail-trend-meta">
          {closes.length} 天前 ¥{first.toFixed(2)} → 今 ¥{last.toFixed(2)}
        </span>
      </div>
      <div class="metals-detail-trend-chart">
        <SparklineArea closes={closes} width={560} height={120} />
      </div>
      <div class="metals-detail-trend-stats">
        <span>高 <b>{high.toFixed(2)}</b></span>
        <span>低 <b>{low.toFixed(2)}</b></span>
        <span>均 <b>{avg.toFixed(2)}</b></span>
        <span>区间 <b>{pctSign}{pct.toFixed(2)}%</b></span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 提交 (测试先红后绿) — 测试已在 Step 1 写好, 等 Task 8 metalStore 完成**

(此处 Task 8 完成后, 跑 Step 6 验证 green)

- [ ] **Step 6: 跑测试, 验证通过 (等 Task 8 完成后再跑)**

Run (Task 8 后): `npx vitest run tests/renderer/metals/MetalTrendStrip.test.jsx tests/renderer/metals/MetalDetailTrend.test.jsx`
Expected: 9 个 it (4 + 5) 全 PASS.

- [ ] **Step 7: 提交**

```bash
git add src/renderer/metals/MetalTrendStrip.jsx src/renderer/metals/MetalDetailTrend.jsx tests/renderer/metals/MetalTrendStrip.test.jsx tests/renderer/metals/MetalDetailTrend.test.jsx
git commit -m "feat(metals): TrendStrip + DetailTrend 组件 + 单测"
```

---

### Task 8: metalStore 加 historyMap / selectedMetalId + IPC init (TDD)

**Files:**
- Modify: `src/renderer/metals/metalStore.js`
- Create: `tests/renderer/metals/metalStore-history.test.js`

**Interfaces:**
- Consumes: Task 5 的 `window.metalsApi.getHistory/onHistoryChanged`, Task 1 的 `selectedMetalId = 'XAU'` 默认值
- Produces:
  - signal `historyMap`
  - signal `selectedMetalId = 'XAU'`
  - `initMetalStore()` 内部拉 `getHistory` 并写入
  - `cleanupMetalStore()` 解绑 `_unsubHist`
  - `resetMetalStore()` 测试用: 把 signals 重置回 initial value + 解绑 listener

- [ ] **Step 1: 写失败测试**

写入 `tests/renderer/metals/metalStore-history.test.js`:

```js
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  historyMap,
  selectedMetalId,
  initMetalStore,
  cleanupMetalStore,
  resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("metalStore history signals", () => {
  beforeEach(() => {
    resetMetalStore();
    global.window = global.window || {};
  });

  it("selectedMetalId 默认 'XAU'", () => {
    expect(selectedMetalId.value).toBe("XAU");
  });

  it("initMetalStore 拉 getHistory 后, historyMap 写入", async () => {
    const fakeHistory = {
      historyMap: { XAU: [{ date: "2026-05-01", close: 100 }] },
    };
    global.window.metalsApi = {
      list: async () => ({ watchedIds: [], holdings: {}, deletedIds: [] }),
      getState: async () => ({ quotes: { data: {} }, fx: { rate: null }, scheduler: { status: "idle" } }),
      getHistory: async () => fakeHistory,
      onQuoteChanged: () => () => {},
      onStateUpdate: () => () => {},
      onHistoryChanged: () => () => {},
    };
    await initMetalStore();
    expect(historyMap.value.XAU).toEqual([{ date: "2026-05-01", close: 100 }]);
  });

  it("onHistoryChanged 回调 → historyMap 同步更新", async () => {
    let histCb;
    global.window.metalsApi = {
      list: async () => ({ watchedIds: [], holdings: {}, deletedIds: [] }),
      getState: async () => ({ quotes: { data: {} }, fx: { rate: null }, scheduler: { status: "idle" } }),
      getHistory: async () => ({ historyMap: {} }),
      onQuoteChanged: () => () => {},
      onStateUpdate: () => () => {},
      onHistoryChanged: (cb) => { histCb = cb; return () => {}; },
    };
    await initMetalStore();
    expect(histCb).toBeDefined();
    histCb({ historyMap: { XAU: [{ date: "2026-06-01", close: 999 }] } });
    expect(historyMap.value.XAU[0].close).toBe(999);
  });

  it("cleanupMetalStore 幂等", async () => {
    global.window.metalsApi = {
      list: async () => ({ watchedIds: [], holdings: {}, deletedIds: [] }),
      getState: async () => ({ quotes: { data: {} }, fx: { rate: null }, scheduler: { status: "idle" } }),
      getHistory: async () => ({ historyMap: {} }),
      onQuoteChanged: () => () => {},
      onStateUpdate: () => () => {},
      onHistoryChanged: () => () => {},
    };
    await initMetalStore();
    cleanupMetalStore();
    cleanupMetalStore(); // 不抛
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/renderer/metals/metalStore-history.test.js`
Expected: FAIL — `historyMap` / `selectedMetalId` / `resetMetalStore` 未导出.

- [ ] **Step 3: 改 `src/renderer/metals/metalStore.js`**

读现有文件 (line 1-129). 修改:

**A. 顶部 import 加** (line 8 之后):

```js
export const historyMap = signal({});
export const selectedMetalId = signal("XAU");
```

**B. `initMetalStore()` 加 history 拉取 + listener (line 65-92 改)**:

```js
export async function initMetalStore() {
  if (!window.metalsApi) {
    console.warn("[metals] window.metalsApi not exposed — check preload.js");
    return;
  }

  cleanupMetalStore();

  const cfg = await window.metalsApi.list();
  config.value = cfg;

  const state = await window.metalsApi.getState();
  if (state && state.quotes) quoteCache.value = state.quotes;
  if (state && state.fx) fxCache.value = state.fx;
  if (state && state.scheduler) schedulerState.value = state.scheduler;

  try {
    const hist = await window.metalsApi.getHistory();
    if (hist && hist.historyMap) historyMap.value = hist.historyMap;
  } catch (err) {
    console.warn("[metals] getHistory failed:", err && err.message);
  }

  _unsubQuote = window.metalsApi.onQuoteChanged((data) => {
    if (data.quotes) quoteCache.value = data.quotes;
    if (data.fx) fxCache.value = data.fx;
  });

  _unsubState = window.metalsApi.onStateUpdate((data) => {
    schedulerState.value = data;
  });

  _unsubHist = window.metalsApi.onHistoryChanged((data) => {
    if (data && data.historyMap) historyMap.value = data.historyMap;
  });
}
```

**C. `cleanupMetalStore()` 加 _unsubHist 解绑 (line 98-107 改)**:

```js
export function cleanupMetalStore() {
  if (_unsubQuote) {
    try { _unsubQuote(); } catch { /* noop */ }
    _unsubQuote = null;
  }
  if (_unsubState) {
    try { _unsubState(); } catch { /* noop */ }
    _unsubState = null;
  }
  if (_unsubHist) {
    try { _unsubHist(); } catch { /* noop */ }
    _unsubHist = null;
  }
}
```

并在文件顶部 (line 62-63 附近) 加 `_unsubHist` 声明:

```js
let _unsubHist = null;
```

**D. 文件末尾 (line 129 之前) 加 `resetMetalStore`**:

```js
/**
 * 测试用: 把 signals 重置回 initial value, 解绑 listener.
 * 幂等. 不调 IPC (假设 window.metalsApi 不存在时也安全).
 */
export function resetMetalStore() {
  cleanupMetalStore();
  config.value = {
    watchedIds: ["XAU", "XAG", "AU9999", "AG9999"],
    holdings: { XAU: null, XAG: null, AU9999: null, AG9999: null },
    deletedIds: [],
  };
  quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
  fxCache.value = { rate: null, fetchedAt: null };
  schedulerState.value = { status: "idle", lastFetch: null, nextFetch: null };
  historyMap.value = {};
  selectedMetalId.value = "XAU";
  if (typeof window !== "undefined" && window.metalsApi) {
    delete window.metalsApi;
  }
}
```

- [ ] **Step 4: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/renderer/metals/metalStore-history.test.js`
Expected: 4 个 it 全 PASS.

- [ ] **Step 5: 跑 metal 模块全量回归 (含 Task 7 测试)**

Run: `npx vitest run tests/renderer/metals/`
Expected: 既有用例 + 新增 (TrendStrip 4 + DetailTrend 5 + metalStore-history 4) = 13 个新增, 0 FAIL.

- [ ] **Step 6: 提交**

```bash
git add src/renderer/metals/metalStore.js tests/renderer/metals/metalStore-history.test.js
git commit -m "feat(metals-store): historyMap + selectedMetalId + IPC 接线"
```

---

### Task 9: MetalHeader 重做 (4 列栅格 + 嵌入 TrendStrip + DetailTrend) + CSS

**Files:**
- Modify: `src/renderer/metals/MetalHeader.jsx`
- Modify: `styles.css`
- Create: `tests/renderer/metals/MetalHeader.test.jsx`

**Interfaces:**
- Consumes: Task 6/7 的 `<MetalTrendStrip />` + `<MetalDetailTrend />`, Task 8 的 signals
- Produces:
  - `MetalHeader` 渲染 4 列 `.metals-overview-cards` (3 总览 + 1 trend strip 列)
  - `selectedMetalId.value` 改变 → 下方 `<MetalDetailTrend />` 同步

- [ ] **Step 1: 写失败测试**

写入 `tests/renderer/metals/MetalHeader.test.jsx`:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalHeader } from "../../../src/renderer/metals/MetalHeader.jsx";
import {
  config, quoteCache, fxCache, schedulerState, historyMap,
  selectedMetalId, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalHeader 4 列布局", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("渲染 4 个 .overview-card (3 总览 + 1 trend)", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };

    const { container } = render(<MetalHeader />);
    const cards = container.querySelectorAll(".overview-card");
    expect(cards.length).toBe(4);
  });

  it("TrendStrip cell 含 4 个", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };

    const { container } = render(<MetalHeader />);
    const cells = container.querySelectorAll(".metals-trend-cell");
    expect(cells.length).toBe(4);
  });

  it("selectedMetalId 改变 → DetailTrend 内容同步切换", () => {
    config.value = { watchedIds: ["XAU", "AU9999"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: Date.now() };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    schedulerState.value = { status: "idle", lastFetch: Date.now() };
    historyMap.value = {
      XAU: [
        { date: "2026-05-01", close: 100 },
        { date: "2026-05-30", close: 120 },
      ],
      AU9999: [
        { date: "2026-05-01", close: 200 },
        { date: "2026-05-30", close: 220 },
      ],
    };

    selectedMetalId.value = "XAU";
    const { container, rerender } = render(<MetalHeader />);
    expect(container.textContent).toMatch(/现货黄金|黄金/);
    expect(container.textContent).toMatch(/\+20\.00%/);

    selectedMetalId.value = "AU9999";
    rerender(<MetalHeader />);
    expect(container.textContent).toMatch(/AU9999/);
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/renderer/metals/MetalHeader.test.jsx`
Expected: FAIL — 现有 MetalHeader 只有 3 张卡, 第 4 张未渲染.

- [ ] **Step 3: 改 `src/renderer/metals/MetalHeader.jsx`**

读现有文件 (line 1-74). 整体重写:

```jsx
/**
 * src/renderer/metals/MetalHeader.jsx
 *
 * 横向 4 列栅格: 3 张总览卡 (总市值/总盈亏/今日预估) + 1 列 TrendStrip.
 * 下方有 DetailTrend (选中品种的 30 天大图).
 */
import {
  overview, schedulerState, fxCache, selectedMetalId,
} from './metalStore.js';
import { IconMedal, IconRefresh } from '../components/icons.jsx';
import { refreshNow } from './metalStore.js';
import { MetalTrendStrip } from './MetalTrendStrip.jsx';
import { MetalDetailTrend } from './MetalDetailTrend.jsx';

function formatCNY(value) {
  if (value == null) return '—';
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function MetalHeader() {
  const ov = overview.value;
  const state = schedulerState.value;
  const fx = fxCache.value.rate;

  return (
    <div class="metals-header">
      <div class="metals-header-row">
        <h2 class="metals-header-title">
          <IconMedal size={20} />
          贵金属
        </h2>
        <div class="metals-header-status">
          最后更新: {formatTime(state.lastFetch)}
          {state.status === 'running' && <span class="spinner"> ⟳</span>}
          <button class="btn btn-ghost btn-sm metals-refresh-btn" onClick={refreshNow}>
            <IconRefresh size={14} /> 刷新
          </button>
        </div>
      </div>

      <div class="metals-overview-cards">
        <div class="overview-card">
          <div class="overview-label">总市值 (CNY)</div>
          <div class="overview-value">{formatCNY(ov.totalMarketValueCNY)}</div>
          <div class="overview-meta">
            {ov.totalMarketValueCNY != null && fx != null
              ? `汇率 ${fx.toFixed(4)}`
              : '汇率待刷新'}
          </div>
        </div>

        <div class="overview-card">
          <div class="overview-label">总盈亏 (CNY)</div>
          <div class={`overview-value ${ov.totalPnlCNY > 0 ? 'positive' : ov.totalPnlCNY < 0 ? 'negative' : ''}`}>
            {formatCNY(ov.totalPnlCNY)}
          </div>
          <div class="overview-meta">
            {ov.totalPnlCNY != null && (ov.totalMarketValueCNY - ov.totalPnlCNY) > 0
              ? `${((ov.totalPnlCNY / (ov.totalMarketValueCNY - ov.totalPnlCNY)) * 100).toFixed(2)}%`
              : ''}
          </div>
        </div>

        <div class="overview-card">
          <div class="overview-label">今日预估 (CNY)</div>
          <div class={`overview-value ${ov.todayEstimatedCNY > 0 ? 'positive' : ov.todayEstimatedCNY < 0 ? 'negative' : ''}`}>
            {formatCNY(ov.todayEstimatedCNY)}
          </div>
          <div class="overview-meta">↑ 较昨收</div>
        </div>

        <div class="overview-card overview-card-trend">
          <div class="overview-label">30 天走势</div>
          <MetalTrendStrip />
        </div>
      </div>

      {selectedMetalId.value && <MetalDetailTrend />}
    </div>
  );
}
```

> 注意: `refreshNow` 已经从 `./metalStore.js` 导出, 不需要重复 require. 上面 import 块为可读性合二为一.

- [ ] **Step 4: 改 `styles.css` 加新样式**

读现有 `.metals-overview-cards` 块 (line 8459 起). 追加 / 修改:

**A. 改 `.metals-overview-cards` 栅格**:

```css
.metals-overview-cards {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1.6fr;
  gap: 12px;
  margin-top: 16px;
}
```

**B. 加 `.overview-card-trend` 紧凑样式**:

```css
.overview-card-trend {
  padding: 10px 12px;
}
.overview-card-trend .overview-label {
  font-size: 11px;
  margin-bottom: 6px;
}
```

**C. 加 TrendStrip / DetailTrend 样式** (放在 `.metals-modal-error` 之后):

```css
.metals-trend-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 4px;
}
.metals-trend-cell {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: opacity 120ms ease;
  min-height: 88px;
}
.metals-trend-cell:hover {
  border-color: var(--accent);
}
.metals-trend-cell.is-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft, rgba(99, 102, 241, 0.2));
}
.metals-trend-cell:not(.is-selected) {
  opacity: 0.7;
}
.metals-trend-cell-name {
  font-size: 12px;
  font-weight: 600;
}
.metals-trend-cell-proxy {
  font-size: 10px;
  color: var(--text-tertiary, #6b7280);
  margin-left: 4px;
}
.metals-trend-cell-chart {
  margin: 4px 0;
}
.metals-trend-cell-skeleton {
  color: var(--text-tertiary, #6b7280);
  font-size: 10px;
  height: 36px;
  display: flex;
  align-items: center;
}
.metals-trend-cell-stats {
  display: flex;
  gap: 6px;
  font-size: 10px;
  color: var(--text-secondary, #6b7280);
  flex-wrap: wrap;
}

.metals-detail-trend {
  padding: 14px 16px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  margin: 12px 0;
}
.metals-detail-trend-up { border-left: 3px solid var(--color-up, #e11d48); }
.metals-detail-trend-down { border-left: 3px solid var(--color-down, #059669); }
.metals-detail-trend-flat { border-left: 3px solid var(--border-subtle, #e5e5e7); }
.metals-detail-trend-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
}
.metals-detail-trend-name { font-size: 14px; font-weight: 600; }
.metals-detail-trend-proxy { font-size: 11px; color: var(--text-tertiary, #6b7280); }
.metals-detail-trend-range { font-size: 11px; color: var(--text-tertiary, #6b7280); margin-left: auto; }
.metals-detail-trend-figure {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin: 8px 0;
  flex-wrap: wrap;
}
.metals-detail-trend-last { font-size: 24px; font-weight: 700; }
.metals-detail-trend-pct.pct-up { color: var(--color-up, #e11d48); font-weight: 600; }
.metals-detail-trend-pct.pct-down { color: var(--color-down, #059669); font-weight: 600; }
.metals-detail-trend-pct.pct-flat { color: var(--text-tertiary, #6b7280); }
.metals-detail-trend-meta { font-size: 12px; color: var(--text-secondary, #6b7280); }
.metals-detail-trend-chart { margin: 8px 0; }
.metals-detail-trend-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin-top: 6px;
  flex-wrap: wrap;
}
.metals-detail-trend-stats b { color: var(--text-primary); font-weight: 600; }
.metals-detail-trend-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-tertiary, #6b7280);
  font-size: 12px;
  margin: 12px 0;
}

@media (max-width: 800px) {
  .metals-overview-cards { grid-template-columns: 1fr 1fr; }
  .metals-trend-strip { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 5: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/renderer/metals/MetalHeader.test.jsx`
Expected: 3 个 it 全 PASS.

- [ ] **Step 6: 提交**

```bash
git add src/renderer/metals/MetalHeader.jsx styles.css tests/renderer/metals/MetalHeader.test.jsx
git commit -m "feat(metals-header): 4 列栅格 + TrendStrip + DetailTrend"
```

---

### Task 10: MetalCard / AddMetalModal / MetalGrid (空状态) 微调

**Files:**
- Modify: `src/renderer/metals/MetalCard.jsx` (padding + 文字链)
- Modify: `src/renderer/metals/AddMetalModal.jsx` (错误文案 + aria)
- Modify: `src/renderer/metals/MetalGrid.jsx` (空状态 ghost 卡)
- Modify: `styles.css` (`.metal-card` padding + `.metal-add-holding-btn` 文字链 + empty ghost)
- Create: `tests/renderer/metals/MetalCard-polish.test.jsx`
- Create: `tests/renderer/metals/MetalGrid-empty.test.jsx`

**Interfaces:**
- Consumes: 现有 components + 4 个候选品种
- Produces: 紧凑 Card + 文字链"录入持仓"+ 润色 modal 文案 + 空状态 ghost 卡

- [ ] **Step 1: 写失败测试**

**`tests/renderer/metals/MetalCard-polish.test.jsx`**:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalCard } from "../../../src/renderer/metals/MetalCard.jsx";
import {
  config, quoteCache, fxCache, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalCard polish", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("无持仓时: '录入持仓' 是文字链样式 (class metal-add-holding-text, 非 btn-primary)", () => {
    config.value = { watchedIds: ["XAU"], holdings: { XAU: null }, deletedIds: [] };
    quoteCache.value = {
      data: { XAU: { id: "XAU", price: 1900, prevClose: 1890, currency: "USD", unit: "oz", quoteTime: Date.now() } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    const metal = { id: "XAU", name: "现货黄金", shortName: "黄金", unit: "oz", currency: "USD", historySecid: "113.AU2608", proxyLabel: "沪金2608代理", unitDivisor: 1 };
    const { container } = render(<MetalCard metal={metal} onEdit={() => {}} />);
    const link = container.querySelector(".metal-add-holding-text");
    expect(link).not.toBeNull();
    expect(link.textContent).toMatch(/录入持仓/);
  });
});
```

**`tests/renderer/metals/MetalGrid-empty.test.jsx`**:

```jsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalGrid } from "../../../src/renderer/metals/MetalGrid.jsx";
import {
  config, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalGrid empty state", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("无关注品种: 渲染 4 个 ghost 卡 (黄金/白银/AU9999/AG9999)", () => {
    config.value = { watchedIds: [], holdings: {}, deletedIds: [] };
    const { container } = render(<MetalGrid onEdit={() => {}} />);
    const ghosts = container.querySelectorAll(".metal-empty-ghost-card");
    expect(ghosts.length).toBe(4);
    expect(container.textContent).toMatch(/黄金/);
    expect(container.textContent).toMatch(/白银/);
    expect(container.textContent).toMatch(/AU9999/);
    expect(container.textContent).toMatch(/AG9999/);
  });

  it("已关注某品种: 该品种不出现在 ghost 列表", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    const { container } = render(<MetalGrid onEdit={() => {}} />);
    // 仅在没 watchlist 时才显示空状态, 此时应走 metal-grid 分支, 渲染真实 card
    expect(container.querySelector(".metal-empty-ghost-card")).toBeNull();
    expect(container.querySelector(".metal-card")).not.toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试, 验证失败 (red)**

Run: `npx vitest run tests/renderer/metals/MetalCard-polish.test.jsx tests/renderer/metals/MetalGrid-empty.test.jsx`
Expected: FAIL — `.metal-add-holding-text` 尚未存在 / 空状态未走 ghost 卡.

- [ ] **Step 3: 改 `src/renderer/metals/MetalCard.jsx`**

读现有文件 (line 213-218). 把 `<button class="metal-add-holding-btn" onClick={() => onEdit(metal.id)}>+ 录入持仓</button>` 改为文字链:

```jsx
        ) : (
          <button class="metal-add-holding-text" onClick={() => onEdit(metal.id)}>
            + 录入持仓
          </button>
        )}
```

- [ ] **Step 4: 改 `src/renderer/metals/AddMetalModal.jsx`**

读现有文件. 改 3 处:

**A. error 文案润色** (line 95, 99):

```js
    if (isNaN(qty) || qty <= 0) {
      setErrorMsg('数量必须大于 0');
      return;
    }
    if (isNaN(price) || price <= 0) {
      setErrorMsg('成本价必须大于 0');
      return;
    }
```

**B. fx 缺失文案 (line 110)**:

```js
    } else {
      setErrorMsg('汇率未就绪，请稍后 5 分钟后再试');
      return;
    }
```

**C. aria-label 加描述** (BareModalShell 的 ariaLabel prop, line 149):

```jsx
      ariaLabel={editingMetal ? `编辑 ${editingMetal.name} 持仓` : '添加贵金属关注'}
```

- [ ] **Step 5: 改 `src/renderer/metals/MetalGrid.jsx` 空状态**

读现有文件 (line 14-29). 把空状态分支改成 ghost 卡:

```jsx
import { MetalCard } from './MetalCard.jsx';
import { METALS } from '../../metals/metal-config.js';
import { config } from './metalStore.js';
import { IconMedal } from '../components/icons.jsx';

export function MetalGrid({ onEdit }) {
  const watchedIds = config.value.watchedIds;
  const watchedMetals = METALS.filter((m) => watchedIds.includes(m.id));
  const unwatchedMetals = METALS.filter((m) => !watchedIds.includes(m.id) && !config.value.deletedIds?.includes(m.id));

  if (watchedMetals.length === 0) {
    return (
      <div class="metal-empty-state">
        <div class="metal-empty-state-header">
          <IconMedal size={28} />
          <h3>还没关注任何品种</h3>
          <p>实时盯黄金白银价格，点下面任一卡片即可关注</p>
        </div>
        <div class="metal-empty-ghost-grid">
          {unwatchedMetals.map((m) => (
            <button
              key={m.id}
              type="button"
              class="metal-empty-ghost-card"
              onClick={() => onEdit(null)}
              aria-label={`添加关注 ${m.name}`}
            >
              <div class="metal-empty-ghost-name">{m.shortName}</div>
              <div class="metal-empty-ghost-meta">
                {m.currency === 'CNY' ? '国内' : '国际'}
                {m.proxyLabel && ` · ${m.proxyLabel}`}
              </div>
              <div class="metal-empty-ghost-action">+ 关注</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="metal-grid">
      {watchedMetals.map((metal) => (
        <MetalCard key={metal.id} metal={metal} onEdit={onEdit} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: 改 `styles.css` 加 ghost 样式 + 文字链样式**

读现有 `.metal-card` 块 (line 8507 附近) 和 `.metal-grid` 块. 追加:

```css
.metal-card {
  /* 现有 padding: 16px → 14px */
  padding: 14px;
}

/* 文字链样式 (替换原 metal-add-holding-btn) */
.metal-add-holding-text {
  background: none;
  border: none;
  color: var(--accent, #6366f1);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  text-align: left;
}
.metal-add-holding-text:hover {
  text-decoration: underline;
}

.metal-empty-state {
  padding: 24px 16px;
  text-align: center;
}
.metal-empty-state-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 8px 0 4px;
}
.metal-empty-state-header p {
  font-size: 12px;
  color: var(--text-tertiary, #6b7280);
  margin-bottom: 16px;
}
.metal-empty-ghost-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  max-width: 720px;
  margin: 0 auto;
}
.metal-empty-ghost-card {
  background: var(--surface-1);
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
  transition: border-color 120ms ease;
}
.metal-empty-ghost-card:hover {
  border-color: var(--accent);
  border-style: solid;
}
.metal-empty-ghost-name { font-size: 14px; font-weight: 600; }
.metal-empty-ghost-meta { font-size: 11px; color: var(--text-tertiary, #6b7280); margin: 4px 0; }
.metal-empty-ghost-action {
  font-size: 12px;
  color: var(--accent, #6366f1);
  font-weight: 500;
}

@media (max-width: 800px) {
  .metal-empty-ghost-grid { grid-template-columns: 1fr 1fr; }
}
```

- [ ] **Step 7: 跑测试, 验证通过 (green)**

Run: `npx vitest run tests/renderer/metals/MetalCard-polish.test.jsx tests/renderer/metals/MetalGrid-empty.test.jsx`
Expected: 3 个 it (1 + 2) 全 PASS.

- [ ] **Step 8: 提交**

```bash
git add src/renderer/metals/MetalCard.jsx src/renderer/metals/AddMetalModal.jsx src/renderer/metals/MetalGrid.jsx styles.css tests/renderer/metals/MetalCard-polish.test.jsx tests/renderer/metals/MetalGrid-empty.test.jsx
git commit -m "feat(metals): card 紧凑化 + modal 文案润色 + 空状态 ghost 卡"
```

---

### Task 11: 集成回归 + renderer build + 手动 e2e 自检

**Files:** 无 (仅验证)

- [ ] **Step 1: 全量测试**

Run: `npx vitest run 2>&1 | tail -5`
Expected: PASS (全量 + 本次新增 ~40 个) FAIL (0).

- [ ] **Step 2: renderer build**

Run: `node scripts/build-renderer.js`
Expected: exit 0.

- [ ] **Step 3: 手动 e2e (本会话之外跑, 终端里)**

```bash
npm start
```

人工检查清单:
1. 切到"贵金属" tab → Header 显示 4 列: 3 张总览卡 + 1 列 "30 天走势" (4 个 mini sparkline 横排)
2. 默认 XAU 高亮 → 下方展开 XAU 大图, 显示 "沪金2608代理" 标签 + 涨跌幅 + 大图 + 高/低/均/区间
3. 依次点 XAG / AU9999 / AG9999 → 选中态切换 + 大图内容切换
4. 删光所有持仓 → 看到新空状态 (4 候选品种 ghost 卡)
5. 点 ghost 卡 "黄金" → 打开添加 modal → 错误文案润色 → aria-label 通过屏幕阅读器
6. 重启 app → 30 天数据从 state.json 即时加载 (无 loading 阻塞)

- [ ] **Step 4: git log 看 11 个新 commit**

Run: `git log --oneline -15`
Expected: 看到 11 个 feat/test commit (config + kline + scheduler-history + ipc-history + preload + sparklineArea + trendStrip + detailTrend + metalStore-history + metalHeader + polish).

- [ ] **Step 5: git status 干净**

Run: `git status --short`
Expected: 0 个与本任务相关的 modified. (其它 in-progress 不算本任务失败.)

---

## 备注

- 11 个任务独立可执行, 单方向依赖链 (config → kline → scheduler → ipc → preload → SparklineArea → TrendStrip/DetailTrend → metalStore → Header → polish → e2e).
- 后端 Task 2/3/4 可并行做 subagent (互不依赖, 仅共用 fixture), 但建议串行以利 review.
- Task 7 + 8 必须合并执行 (TrendStrip/DetailTrend 依赖 metalStore signals), 已在 Task 7 Step 5/6 标明"等 Task 8 完成后再跑".
- 不需要 worktree (改动面是 9 文件 + 新增 9 测试文件, 集中; 单 git worktree 不必要).
- dark mode 不在 scope (复用现有 CSS 变量).
- 沪金主连月 (113.AU2608) 写在 metal-config, 每月手工换月 (spec 风险已记录).
- 性能: 5min × 30 天 = 上限 8640 数据点; SparklineArea < 50 点; backfill 1h 冷却.
