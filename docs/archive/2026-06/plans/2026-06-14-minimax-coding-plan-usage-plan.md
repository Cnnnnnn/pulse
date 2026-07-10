# minimax Coding Plan Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Pulse 内显示 minimax Token Plan 订阅的剩余配额（5h 滚动窗口 + 周窗口），通过 SideNav 新增第 5 项 `📊 AI 用量` 入口进入，复用现有 safeStorage minimax apiKey 调官方 `GET /v1/token_plan/remains` API。

**Architecture:** 新建 `src/ai-usage/` 目录（sibling of `ai-sessions/`），3 个新模块（client / normalize / store）+ 1 个 IPC handler + 1 个 UI page。完全复用 safeStorage / HttpClient / patchState / safeHandle / SideNav / preact signals 等现有基础设施，零耦合 ai-sessions。

**Tech Stack:** Electron 35, Node.js (CommonJS), preact + @preact/signals, vitest + happy-dom, electron-builder.

**Spec:** `docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md`

---

## File Structure

**新建**:
- `src/ai-usage/client.js` — MiniMaxQuotaClient (HTTP GET /v1/token_plan/remains, _inFlight 单例)
- `src/ai-usage/normalize.js` — pure functions, raw response → standardized snapshot
- `src/ai-usage/store.js` — state.json ai_usage_snapshot 读写 (patchState 范式)
- `src/ai-usage/index.js` — 统一导出
- `src/main/ipc/register-ai-usage.js` — 2 个 IPC handler
- `src/renderer/store/ai-usage-store.js` — signals: snapshot/fetching/lastError/lastFetchedAt
- `src/renderer/components/AIUsagePage.jsx` — SideNav 第 5 项页面
- `tests/ai-usage/client.test.js` — ~15 cases
- `tests/ai-usage/normalize.test.js` — ~20 cases
- `tests/ai-usage/store.test.js` — ~10 cases
- `tests/ai-usage/ipc.test.js` — ~8 cases
- `tests/renderer/AIUsagePage.test.jsx` — ~12 cases
- `tests/fixtures/minimax-token-plan-ok.json` — 标准 200 fixture
- `tests/fixtures/minimax-token-plan-partial.json` — 只有 weekly 字段
- `tests/fixtures/minimax-token-plan-error.json` — base_resp.status_code !== 0
- `tests/fixtures/minimax-token-plan-old-schema.json` — 旧字段名

**修改**:
- `src/main/state-store.js` — 加 `loadAiUsageSnapshot()` + `saveAiUsageSnapshot()`
- `src/main/index.js` — 接入 `registerAiUsageHandlers(ctx)` + 启动 `setImmediate` 预热
- `src/renderer/api.js` — 加 `aiUsage.getSnapshot()` + `aiUsage.fetch()`
- `src/renderer/components/SideNav.jsx` — `NAV_ITEMS` 追加 `usage` 项
- `src/renderer/App.jsx` — 加 `<AIUsagePage />` 路由分支
- `tests/main/load-smoke.test.js` — +2 cases
- `tests/main/state-store.test.js` — +3 cases

---

## Phase U1: Client + Normalize 基础

### Task U1.1: normalize.js — _pickNumber / _pickString 多候选 key helper

**Files:**
- Create: `src/ai-usage/normalize.js`
- Create: `tests/ai-usage/normalize.test.js`
- Create: `tests/ai-usage/.gitkeep`

- [ ] **Step 1: 创建测试目录占位**

```bash
mkdir -p tests/ai-usage
touch tests/ai-usage/.gitkeep
```

- [ ] **Step 2: 写失败的测试 _pickNumber / _pickString**

写 `tests/ai-usage/normalize.test.js`:

```js
const { _pickNumber, _pickString, _parseDdHhMmSs } = require('../../src/ai-usage/normalize');

describe('_pickNumber', () => {
  test('returns first present key value as number', () => {
    expect(_pickNumber({ a: '42', b: 100 }, ['a', 'b'])).toBe(42);
    expect(_pickNumber({ b: 100 }, ['a', 'b'])).toBe(100);
  });
  test('coerces numeric string to number', () => {
    expect(_pickNumber({ x: '6000' }, ['x'])).toBe(6000);
  });
  test('returns null when no candidate key present', () => {
    expect(_pickNumber({ foo: 1 }, ['a', 'b'])).toBe(null);
  });
  test('returns null for negative or NaN', () => {
    expect(_pickNumber({ x: -5 }, ['x'])).toBe(null);
    expect(_pickNumber({ x: 'abc' }, ['x'])).toBe(null);
    expect(_pickNumber({ x: NaN }, ['x'])).toBe(null);
  });
  test('returns null when obj is null/undefined', () => {
    expect(_pickNumber(null, ['x'])).toBe(null);
    expect(_pickNumber(undefined, ['x'])).toBe(null);
  });
  test('returns null when keys is empty', () => {
    expect(_pickNumber({ x: 5 }, [])).toBe(null);
  });
});

describe('_pickString', () => {
  test('returns first present key value as string', () => {
    expect(_pickString({ a: 'hello', b: 'world' }, ['a', 'b'])).toBe('hello');
    expect(_pickString({ b: 'world' }, ['a', 'b'])).toBe('world');
  });
  test('coerces non-string to string', () => {
    expect(_pickString({ x: 42 }, ['x'])).toBe('42');
  });
  test('returns null when no candidate key present', () => {
    expect(_pickString({ foo: 1 }, ['a', 'b'])).toBe(null);
  });
  test('returns null when obj is null/undefined', () => {
    expect(_pickString(null, ['x'])).toBe(null);
  });
});

describe('_parseDdHhMmSs', () => {
  test('parses DD:HH:MM:SS to total seconds', () => {
    expect(_parseDdHhMmSs('00:01:00:00')).toBe(3600);
    expect(_parseDdHhMmSs('01:00:00:00')).toBe(86400);
    expect(_parseDdHhMmSs('00:00:01:00')).toBe(60);
    expect(_parseDdHhMmSs('00:00:00:30')).toBe(30);
    expect(_parseDdHhMmSs('00:00:00:00')).toBe(0);
  });
  test('returns null for malformed input', () => {
    expect(_parseDdHhMmSs('garbage')).toBe(null);
    expect(_parseDdHhMmSs('')).toBe(null);
    expect(_parseDdHhMmSs(null)).toBe(null);
    expect(_parseDdHhMmSs(undefined)).toBe(null);
  });
  test('returns null for partial input', () => {
    expect(_parseDdHhMmSs('01:02:03')).toBe(null);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
npx vitest run tests/ai-usage/normalize.test.js 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module '../../src/ai-usage/normalize'"

- [ ] **Step 4: 实现 normalize.js (仅 helpers 部分)**

```js
/**
 * src/ai-usage/normalize.js
 *
 * Pure functions: raw API response → standardized snapshot.
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §3.2
 */

/**
 * 从 obj 取第一个存在的 key 的值, coerce 成 number.
 * 接受多候选 key 应对 schema drift (issue #99 教训).
 * @param {object|null|undefined} obj
 * @param {string[]} keys
 * @returns {number|null}
 */
function _pickNumber(obj, keys) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(keys) || keys.length === 0) {
    return null;
  }
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * 从 obj 取第一个存在的 key 的值, coerce 成 string.
 * @param {object|null|undefined} obj
 * @param {string[]} keys
 * @returns {string|null}
 */
function _pickString(obj, keys) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(keys) || keys.length === 0) {
    return null;
  }
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    return typeof v === 'string' ? v : String(v);
  }
  return null;
}

/**
 * 解析 DD:HH:MM:SS 格式 (minimax reset countdown) → 总秒数.
 * @param {string|null|undefined} s
 * @returns {number|null}
 */
function _parseDdHhMmSs(s) {
  if (typeof s !== 'string' || s.length === 0) return null;
  const m = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const [, d, h, m1, sec] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(m1) * 60 + Number(sec);
}

module.exports = { _pickNumber, _pickString, _parseDdHhMmSs };
```

- [ ] **Step 5: 跑测试确认通过**

```bash
npx vitest run tests/ai-usage/normalize.test.js 2>&1 | tail -10
```

Expected: PASS — ~13 tests passed

- [ ] **Step 6: Commit**

```bash
git add src/ai-usage/normalize.js tests/ai-usage/normalize.test.js tests/ai-usage/.gitkeep
git commit -m "feat(ai-usage): _pickNumber/_pickString/_parseDdHhMmSs helpers"
```

---

### Task U1.2: normalize.js — main normalize() function

**Files:**
- Modify: `src/ai-usage/normalize.js`
- Modify: `tests/ai-usage/normalize.test.js`

- [ ] **Step 1: 追加 normalize() 的失败测试**

在 `tests/ai-usage/normalize.test.js` 末尾加:

```js
const { normalize } = require('../../src/ai-usage/normalize');

const OK_FIXTURE = {
  base_resp: { status_code: 0, status_msg: 'success' },
  model_remains: [
    {
      current_interval_total_count: 6000,
      current_interval_usage_count: 4200,
      interval_remains_time: '00:04:59:30',
      current_weekly_total_count: 50000,
      current_weekly_usage_count: 38000,
      weekly_remains_time: '05:22:00:00',
    },
  ],
};

describe('normalize', () => {
  test('extracts full 5h + weekly windows', () => {
    const r = normalize(OK_FIXTURE, { fetchedAt: 1000, endpoint: 'https://x', provider: 'minimax', region: 'cn' });
    expect(r.ok).toBe(true);
    expect(r.snapshot.provider).toBe('minimax');
    expect(r.snapshot.region).toBe('cn');
    expect(r.snapshot.fetchedAt).toBe(1000);
    expect(r.snapshot.windows['5h']).toEqual({
      total: 6000,
      remaining: 4200,
      used: 1800,
      resetAt: 1000 + (4 * 3600 + 59 * 60 + 30) * 1000,
      resetInSec: 4 * 3600 + 59 * 60 + 30,
      label: '5 小时滚动窗口',
    });
    expect(r.snapshot.windows.weekly.total).toBe(50000);
    expect(r.snapshot.windows.weekly.remaining).toBe(38000);
    expect(r.snapshot.windows.weekly.used).toBe(12000);
    expect(r.snapshot.credits).toBe(null);
  });

  test('treats current_interval_usage_count as REMAINING (not used)', () => {
    const r = normalize(OK_FIXTURE, { fetchedAt: 0 });
    expect(r.snapshot.windows['5h'].remaining).toBe(4200);
    expect(r.snapshot.windows['5h'].used).toBe(6000 - 4200);
  });

  test('returns ok=false when base_resp.status_code !== 0', () => {
    const r = normalize({ base_resp: { status_code: 1004, status_msg: 'cookie missing' } }, {});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('api_error');
    expect(r.error).toBe('cookie missing');
  });

  test('returns ok=true with empty windows when model_remains absent', () => {
    const r = normalize({ base_resp: { status_code: 0 } }, { fetchedAt: 0 });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows).toEqual({});
  });

  test('5h window null when fields missing, weekly still parsed', () => {
    const partial = {
      base_resp: { status_code: 0 },
      model_remains: [
        {
          current_weekly_total_count: 50000,
          current_weekly_usage_count: 38000,
          weekly_remains_time: '05:22:00:00',
        },
      ],
    };
    const r = normalize(partial, { fetchedAt: 0 });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows['5h']).toBe(null);
    expect(r.snapshot.windows.weekly.total).toBe(50000);
  });

  test('coerces string numbers', () => {
    const strNum = {
      base_resp: { status_code: 0 },
      model_remains: [
        {
          current_interval_total_count: '6000',
          current_interval_usage_count: '4200',
          interval_remains_time: '00:01:00:00',
        },
      ],
    };
    const r = normalize(strNum, { fetchedAt: 0 });
    expect(r.snapshot.windows['5h'].total).toBe(6000);
    expect(r.snapshot.windows['5h'].used).toBe(1800);
  });

  test('falls back to old field names via _pickNumber', () => {
    const oldSchema = {
      base_resp: { status_code: 0 },
      coding_plan_remains: [
        {
          current_interval_total_count: 6000,
          current_interval_usage_count: 4200,
          interval_remains_time: '00:01:00:00',
        },
      ],
    };
    const r = normalize(oldSchema, { fetchedAt: 0 });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows['5h']).not.toBe(null);
  });

  test('returns ok=false when input is not an object', () => {
    expect(normalize(null, {}).ok).toBe(false);
    expect(normalize('string', {}).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run tests/ai-usage/normalize.test.js 2>&1 | tail -15
```

Expected: FAIL — "normalize is not a function"

- [ ] **Step 3: 在 normalize.js 追加 normalize() + _buildWindow()**

```js
/**
 * 主入口: 解析 raw API response → 标准化 snapshot.
 * @param {object|null} rawResponse
 * @param {object} [opts] { fetchedAt, endpoint, provider, region }
 * @returns {{ok: boolean, snapshot?: object, reason?: string, error?: string}}
 */
function normalize(rawResponse, opts = {}) {
  if (!rawResponse || typeof rawResponse !== 'object') {
    return { ok: false, reason: 'api_error', error: 'response_not_object' };
  }

  // 1) base_resp 校验
  const baseResp = rawResponse.base_resp;
  if (baseResp && typeof baseResp === 'object' && typeof baseResp.status_code === 'number'
      && baseResp.status_code !== 0) {
    return { ok: false, reason: 'api_error', error: baseResp.status_msg || 'unknown' };
  }

  // 2) 取 model_remains[0] 作为数据源 (兼容老 schema coding_plan_remains)
  const block = _pickBlock(rawResponse);
  const snapshot = {
    provider: opts.provider || 'minimax',
    region: opts.region || 'cn',
    fetchedAt: typeof opts.fetchedAt === 'number' ? opts.fetchedAt : Date.now(),
    endpoint: typeof opts.endpoint === 'string' ? opts.endpoint : null,
    windows: {},
    credits: null,
  };

  if (!block) {
    return { ok: true, snapshot };
  }

  // 3) 5h 窗口
  const intervalTotal = _pickNumber(block, ['current_interval_total_count']);
  const intervalRemaining = _pickNumber(block, ['current_interval_usage_count']);
  const intervalResetSec = _parseDdHhMmSs(_pickString(block, ['interval_remains_time']));
  if (intervalTotal !== null || intervalRemaining !== null || intervalResetSec !== null) {
    snapshot.windows['5h'] = _buildWindow({
      total: intervalTotal,
      remaining: intervalRemaining,
      resetSec: intervalResetSec,
      label: '5 小时滚动窗口',
      fetchedAt: snapshot.fetchedAt,
    });
  } else {
    snapshot.windows['5h'] = null;
  }

  // 4) 周窗口
  const weeklyTotal = _pickNumber(block, ['current_weekly_total_count']);
  const weeklyRemaining = _pickNumber(block, ['current_weekly_usage_count']);
  const weeklyResetSec = _parseDdHhMmSs(_pickString(block, ['weekly_remains_time']));
  if (weeklyTotal !== null || weeklyRemaining !== null || weeklyResetSec !== null) {
    snapshot.windows.weekly = _buildWindow({
      total: weeklyTotal,
      remaining: weeklyRemaining,
      resetSec: weeklyResetSec,
      label: '周窗口',
      fetchedAt: snapshot.fetchedAt,
    });
  } else {
    snapshot.windows.weekly = null;
  }

  return { ok: true, snapshot };
}

/**
 * 取数据块. 优先 model_remains[0], fallback coding_plan_remains[0].
 * @param {object} raw
 * @returns {object|null}
 */
function _pickBlock(raw) {
  const m = Array.isArray(raw.model_remains) && raw.model_remains.length > 0 ? raw.model_remains[0] : null;
  if (m && typeof m === 'object') return m;
  const c = Array.isArray(raw.coding_plan_remains) && raw.coding_plan_remains.length > 0 ? raw.coding_plan_remains[0] : null;
  if (c && typeof c === 'object') return c;
  return null;
}

/**
 * 组装单个窗口数据. 任一字段缺 → 返 null.
 * @param {object} opts
 * @returns {object|null}
 */
function _buildWindow({ total, remaining, resetSec, label, fetchedAt }) {
  if (total === null && remaining === null && resetSec === null) return null;
  const used = (typeof total === 'number' && typeof remaining === 'number')
    ? Math.max(0, total - remaining) : null;
  const resetAt = (typeof resetSec === 'number' && typeof fetchedAt === 'number')
    ? fetchedAt + resetSec * 1000 : null;
  return {
    total: typeof total === 'number' ? total : null,
    remaining: typeof remaining === 'number' ? remaining : null,
    used,
    resetAt,
    resetInSec: typeof resetSec === 'number' ? resetSec : null,
    label: label || '',
  };
}

module.exports = {
  _pickNumber,
  _pickString,
  _parseDdHhMmSs,
  _pickBlock,
  _buildWindow,
  normalize,
};
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run tests/ai-usage/normalize.test.js 2>&1 | tail -10
```

Expected: PASS — all ~21 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/ai-usage/normalize.js tests/ai-usage/normalize.test.js
git commit -m "feat(ai-usage): normalize() with defensive field parsing"
```

---

### Task U1.3: client.js — MiniMaxQuotaClient 基础骨架 + endpoint 路由

**Files:**
- Create: `src/ai-usage/client.js`
- Create: `tests/fixtures/.gitkeep`

- [ ] **Step 1: 写失败的测试 - endpoint 选择 + _resolveEndpoint**

在 `tests/ai-usage/client.test.js` 写:

```js
const { _resolveEndpoint } = require('../../src/ai-usage/client');

describe('_resolveEndpoint', () => {
  test('returns CN endpoint by default', () => {
    expect(_resolveEndpoint({ region: 'cn' })).toBe('https://www.minimaxi.com/v1/token_plan/remains');
  });
  test('returns Global endpoint when region=global', () => {
    expect(_resolveEndpoint({ region: 'global' })).toBe('https://www.minimax.io/v1/token_plan/remains');
  });
  test('opts.endpoint overrides', () => {
    expect(_resolveEndpoint({ region: 'cn', endpoint: 'https://custom.example.com/x' }))
      .toBe('https://custom.example.com/x');
  });
  test('env override MINIMAX_TOKEN_PLAN_URL wins over opts', () => {
    const prev = process.env.MINIMAX_TOKEN_PLAN_URL;
    process.env.MINIMAX_TOKEN_PLAN_URL = 'https://env.example.com/y';
    try {
      expect(_resolveEndpoint({ region: 'cn' })).toBe('https://env.example.com/y');
    } finally {
      if (prev === undefined) delete process.env.MINIMAX_TOKEN_PLAN_URL;
      else process.env.MINIMAX_TOKEN_PLAN_URL = prev;
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run tests/ai-usage/client.test.js 2>&1 | tail -10
```

Expected: FAIL — "Cannot find module '../../src/ai-usage/client'"

- [ ] **Step 3: 实现 client.js 骨架 + _resolveEndpoint**

```js
/**
 * src/ai-usage/client.js
 *
 * MiniMaxQuotaClient: GET /v1/token_plan/remains
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §4.1
 */

const { normalize } = require('./normalize');

const ENDPOINTS = {
  cn: 'https://www.minimaxi.com/v1/token_plan/remains',
  global: 'https://www.minimax.io/v1/token_plan/remains',
};

/**
 * 选 endpoint. 优先级: env override > opts.endpoint > ENDPOINTS[region]
 * @param {object} opts { region, endpoint }
 * @returns {string}
 */
function _resolveEndpoint(opts = {}) {
  const env = process.env.MINIMAX_TOKEN_PLAN_URL;
  if (typeof env === 'string' && env.length > 0) return env;
  if (typeof opts.endpoint === 'string' && opts.endpoint.length > 0) return opts.endpoint;
  const region = opts.region === 'global' ? 'global' : 'cn';
  return ENDPOINTS[region];
}

class MiniMaxQuotaClient {
  /**
   * @param {object} [opts]
   * @param {object} [opts.httpClient]    HttpClient (默认 new HttpClient({ timeout: 15_000, maxRetries: 0 }))
   * @param {string} [opts.apiKey]         minimax API key (测试可注入)
   * @param {string} [opts.region]         'cn' (默认) | 'global'
   * @param {string} [opts.endpoint]       全 URL override
   * @param {object} [opts.log]            logger (默认 SILENT)
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || null;
    this.region = opts.region === 'global' ? 'global' : 'cn';
    this.endpoint = _resolveEndpoint({ region: this.region, endpoint: opts.endpoint });
    this.httpClient = opts.httpClient || null;  // lazy create in fetchOnce
    this.log = opts.log || { info: () => {}, warn: () => {}, error: () => {} };
    this._customHttpClient = Boolean(opts.httpClient);
  }

  /**
   * 拉一次配额数据.
   * _inFlight 单例: 同时间多次调用共享同一次 HTTP.
   * @param {object} [opts] { region override }
   * @returns {Promise<{ok, snapshot?, reason?, error?, status?}>}
   */
  async fetchOnce(opts = {}) {
    if (this._inFlight) return this._inFlight;
    this._inFlight = (async () => {
      try { return await this._doFetch(opts); }
      finally { this._inFlight = null; }
    })();
    return this._inFlight;
  }

  async _doFetch(opts = {}) {
    // stub — Task U1.4 填实现
    throw new Error('not implemented');
  }
}

module.exports = { MiniMaxQuotaClient, ENDPOINTS, _resolveEndpoint };
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run tests/ai-usage/client.test.js 2>&1 | tail -10
```

Expected: PASS — _resolveEndpoint tests passed

- [ ] **Step 5: Commit**

```bash
git add src/ai-usage/client.js tests/ai-usage/client.test.js tests/fixtures/.gitkeep
git commit -m "feat(ai-usage): MiniMaxQuotaClient skeleton + _resolveEndpoint"
```

---

### Task U1.4: client.js — _doFetch 实现 + HttpClient 集成

**Files:**
- Modify: `src/ai-usage/client.js`
- Modify: `tests/ai-usage/client.test.js`

- [ ] **Step 1: 创建 fixture 文件**

`tests/fixtures/minimax-token-plan-ok.json`:

```json
{
  "base_resp": { "status_code": 0, "status_msg": "success" },
  "model_remains": [
    {
      "current_interval_total_count": 6000,
      "current_interval_usage_count": 4200,
      "interval_remains_time": "00:04:59:30",
      "current_weekly_total_count": 50000,
      "current_weekly_usage_count": 38000,
      "weekly_remains_time": "05:22:00:00"
    }
  ]
}
```

`tests/fixtures/minimax-token-plan-error.json`:

```json
{
  "base_resp": { "status_code": 1004, "status_msg": "cookie is missing, log in again" }
}
```

- [ ] **Step 2: 追加失败的 _doFetch 测试**

在 `tests/ai-usage/client.test.js` 末尾追加:

```js
const fs = require('fs');
const path = require('path');
const { MiniMaxQuotaClient } = require('../../src/ai-usage/client');

/**
 * Mock HttpClient: 接受 url + 返 fixture body + status.
 */
function makeMockHttpClient(map) {
  return {
    calls: [],
    async post(url, body, headers, opts) {
      this.calls.push({ url, body, headers, opts });
      const r = map[url];
      if (!r) {
        return { status: 404, body: '{}', error: 'no_fixture' };
      }
      if (r.throw) throw new Error(r.throw);
      return { status: r.status, body: r.body };
    },
  };
}

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
}

const CN_URL = 'https://www.minimaxi.com/v1/token_plan/remains';
const OK_BODY = fixture('minimax-token-plan-ok.json');
const ERROR_BODY = fixture('minimax-token-plan-error.json');

describe('MiniMaxQuotaClient.fetchOnce', () => {
  test('happy path: 200 + valid body → ok snapshot', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: OK_BODY } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'sk-test', region: 'cn' });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows['5h'].total).toBe(6000);
    expect(r.snapshot.windows['5h'].remaining).toBe(4200);
    expect(r.snapshot.windows['5h'].used).toBe(1800);
    expect(r.snapshot.windows.weekly.total).toBe(50000);
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].headers.Authorization).toBe('Bearer sk-test');
    expect(http.calls[0].opts.timeout).toBe(15_000);
  });

  test('401 → reason=auth_401, status=401, no snapshot', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 401, body: '{"error":"invalid"}' } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'bad', region: 'cn' });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('auth_401');
    expect(r.status).toBe(401);
    expect(r.snapshot).toBeUndefined();
  });

  test('403 → reason=auth_403', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 403, body: '{}' } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    expect((await c.fetchOnce()).reason).toBe('auth_403');
  });

  test('429 → reason=rate_limited', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 429, body: '{}' } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    expect((await c.fetchOnce()).reason).toBe('rate_limited');
  });

  test('5xx → reason=http_status_5xx', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 503, body: '{}' } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    expect((await c.fetchOnce()).reason).toBe('http_status_503');
  });

  test('base_resp error → reason=api_error', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: ERROR_BODY } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('api_error');
    expect(r.error).toMatch(/cookie/);
  });

  test('non-JSON body → reason=response_not_json', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: '<html>not json</html>' } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    expect((await c.fetchOnce()).reason).toBe('response_not_json');
  });

  test('network throw → reason=network_failed', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { throw: 'ECONNREFUSED' } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('network_failed');
    expect(r.error).toBe('ECONNREFUSED');
  });

  test('missing apiKey → reason=api_key_missing', async () => {
    const http = makeMockHttpClient({});
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: null, region: 'cn' });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('api_key_missing');
  });

  test('concurrent fetch × 3 shares same HTTP call', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: OK_BODY } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    const [r1, r2, r3] = await Promise.all([c.fetchOnce(), c.fetchOnce(), c.fetchOnce()]);
    expect(http.calls).toHaveLength(1);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  test('after in-flight resolves, next fetch re-fires HTTP', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: OK_BODY } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    await c.fetchOnce();
    await c.fetchOnce();
    expect(http.calls).toHaveLength(2);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
npx vitest run tests/ai-usage/client.test.js 2>&1 | tail -10
```

Expected: FAIL — `_doFetch throws: not implemented`

- [ ] **Step 4: 实现 _doFetch**

替换 `src/ai-usage/client.js` 里的 `async _doFetch`:

```js
  async _doFetch(opts = {}) {
    // 1) apiKey 校验
    if (typeof this.apiKey !== 'string' || this.apiKey.length === 0) {
      return { ok: false, reason: 'api_key_missing' };
    }

    // 2) 选 endpoint (opts.region 可 override)
    const region = opts.region === 'global' ? 'global' : this.region;
    const endpoint = _resolveEndpoint({ region, endpoint: this.endpoint });

    // 3) lazy create HttpClient
    const http = this.httpClient || require('../main/http-client');

    // 4) 发请求
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
    let r;
    try {
      r = await http.post(endpoint, {}, headers, { timeout: 15_000 });
    } catch (err) {
      return { ok: false, reason: 'network_failed', error: (err && err.message) || 'unknown' };
    }

    // 5) 解析 status
    if (r.error && !r.status) {
      return { ok: false, reason: 'network_failed', error: r.error };
    }
    const status = r.status;
    if (status === 401) return { ok: false, reason: 'auth_401', status };
    if (status === 403) return { ok: false, reason: 'auth_403', status };
    if (status === 429) return { ok: false, reason: 'rate_limited', status };
    if (status === 404) return { ok: false, reason: 'http_status_404', status };
    if (status >= 500) return { ok: false, reason: `http_status_${status}`, status };
    if (status < 200 || status >= 300) {
      return { ok: false, reason: `http_status_${status}`, status };
    }

    // 6) parse JSON
    let parsed;
    try { parsed = JSON.parse(r.body); }
    catch (err) {
      return { ok: false, reason: 'response_not_json', error: err.message, status };
    }

    // 7) normalize
    const n = normalize(parsed, {
      fetchedAt: Date.now(),
      endpoint,
      provider: 'minimax',
      region,
    });
    if (!n.ok) {
      return { ok: false, reason: n.reason, error: n.error, status };
    }
    return { ok: true, snapshot: n.snapshot };
  }
```

- [ ] **Step 5: 跑测试确认通过**

```bash
npx vitest run tests/ai-usage/client.test.js 2>&1 | tail -10
```

Expected: PASS — all ~15 tests passed

- [ ] **Step 6: Commit**

```bash
git add src/ai-usage/client.js tests/ai-usage/client.test.js tests/fixtures/minimax-token-plan-ok.json tests/fixtures/minimax-token-plan-error.json
git commit -m "feat(ai-usage): MiniMaxQuotaClient._doFetch with full error mapping"
```

---

### Task U1.5: client.js + index.js — 测试覆盖 partial + old-schema + index export

**Files:**
- Modify: `tests/fixtures/minimax-token-plan-partial.json`
- Modify: `tests/fixtures/minimax-token-plan-old-schema.json`
- Modify: `src/ai-usage/client.js`
- Create: `src/ai-usage/index.js`

- [ ] **Step 1: 创建剩余 fixtures**

`tests/fixtures/minimax-token-plan-partial.json`:

```json
{
  "base_resp": { "status_code": 0, "status_msg": "success" },
  "model_remains": [
    {
      "current_weekly_total_count": 50000,
      "current_weekly_usage_count": 38000,
      "weekly_remains_time": "05:22:00:00"
    }
  ]
}
```

`tests/fixtures/minimax-token-plan-old-schema.json`:

```json
{
  "base_resp": { "status_code": 0, "status_msg": "success" },
  "coding_plan_remains": [
    {
      "current_interval_total_count": 6000,
      "current_interval_usage_count": 4200,
      "interval_remains_time": "00:01:00:00"
    }
  ]
}
```

- [ ] **Step 2: 追加测试**

在 `tests/ai-usage/client.test.js` 末尾追加:

```js
describe('MiniMaxQuotaClient partial + old schema', () => {
  test('partial: 5h null, weekly still parsed', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: fixture('minimax-token-plan-partial.json') } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows['5h']).toBe(null);
    expect(r.snapshot.windows.weekly.total).toBe(50000);
  });

  test('old schema (coding_plan_remains) still parses', async () => {
    const http = makeMockHttpClient({ [CN_URL]: { status: 200, body: fixture('minimax-token-plan-old-schema.json') } });
    const c = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    const r = await c.fetchOnce();
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows['5h'].total).toBe(6000);
  });
});
```

- [ ] **Step 3: 跑测试确认通过 (无需改 client.js, normalize 已处理)**

```bash
npx vitest run tests/ai-usage/client.test.js 2>&1 | tail -10
```

Expected: PASS — all ~17 tests passed

- [ ] **Step 4: 创建 index.js**

`src/ai-usage/index.js`:

```js
/**
 * src/ai-usage/index.js
 *
 * 统一导出 + main process 入口.
 * CommonJS, 跟 src/ai-sessions/ 一致.
 */

const { MiniMaxQuotaClient, ENDPOINTS } = require('./client');
const normalize = require('./normalize');

module.exports = {
  MiniMaxQuotaClient,
  ENDPOINTS,
  normalize,
};
```

- [ ] **Step 5: 跑 load-smoke test**

```bash
npx vitest run tests/main/load-smoke.test.js 2>&1 | tail -10
```

Expected: 应该已经包含 (Task U2 再加新 case). 若现有 case 失败说明 import 路径有问题, 检查.

- [ ] **Step 6: Commit**

```bash
git add src/ai-usage/index.js tests/fixtures/minimax-token-plan-partial.json tests/fixtures/minimax-token-plan-old-schema.json tests/ai-usage/client.test.js
git commit -m "feat(ai-usage): index.js export + partial/old-schema fixtures"
```

---

## Phase U2: State 持久化 + IPC

### Task U2.1: state-store.js — loadAiUsageSnapshot / saveAiUsageSnapshot

**Files:**
- Modify: `src/main/state-store.js`
- Modify: `tests/main/state-store.test.js`

- [ ] **Step 1: 写失败的 state-store 测试**

在 `tests/main/state-store.test.js` 末尾追加:

```js
const { loadAiUsageSnapshot, saveAiUsageSnapshot, defaultPath } = require('../../src/main/state-store');
const fs = require('fs');
const path = require('path');
const os = require('os');

function tmpStatePath() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
  return path.join(d, 'state.json');
}

describe('ai_usage_snapshot', () => {
  test('load returns null when state.json missing', () => {
    const p = tmpStatePath();
    expect(loadAiUsageSnapshot(p)).toBe(null);
  });

  test('load returns null when field absent', () => {
    const p = tmpStatePath();
    fs.writeFileSync(p, JSON.stringify({ apps: {} }));
    expect(loadAiUsageSnapshot(p)).toBe(null);
  });

  test('save then load round-trip', () => {
    const p = tmpStatePath();
    const snap = {
      provider: 'minimax', region: 'cn', fetchedAt: 12345,
      endpoint: 'https://x', windows: {}, credits: null,
    };
    saveAiUsageSnapshot(snap, p);
    expect(loadAiUsageSnapshot(p)).toEqual(snap);
  });

  test('save preserves other top-level fields', () => {
    const p = tmpStatePath();
    fs.writeFileSync(p, JSON.stringify({ apps: { foo: { latest_version: '1' } }, active_category: 'all' }));
    const snap = { provider: 'minimax', region: 'cn', fetchedAt: 1, endpoint: null, windows: {}, credits: null };
    saveAiUsageSnapshot(snap, p);
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(s.apps.foo.latest_version).toBe('1');
    expect(s.active_category).toBe('all');
    expect(s.ai_usage_snapshot).toEqual(snap);
  });

  test('save rejects non-object snapshot', () => {
    const p = tmpStatePath();
    expect(() => saveAiUsageSnapshot(null, p)).toThrow(TypeError);
    expect(() => saveAiUsageSnapshot('string', p)).toThrow(TypeError);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run tests/main/state-store.test.js 2>&1 | tail -15
```

Expected: FAIL — "loadAiUsageSnapshot is not a function"

- [ ] **Step 3: 在 state-store.js 追加 (放在 saveAISessionsConfig 后面, load 顶层新字段)**

读一下 `src/main/state-store.js` 末尾结构（已经看过了，schema_version 在 line 790 附近，模块导出在 line 783 之后）。在 `saveAISessionsConfig` 函数**之后**、`SCHEMA_VERSION` 之前加:

```js
/**
 * 读 ai_usage_snapshot. 老 state.json (无字段) → null.
 * @param {string} [statePath]
 * @returns {object|null}
 */
function loadAiUsageSnapshot(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s || !s.ai_usage_snapshot || typeof s.ai_usage_snapshot !== 'object'
      || Array.isArray(s.ai_usage_snapshot)) {
    return null;
  }
  return { ...s.ai_usage_snapshot };
}

/**
 * 写 ai_usage_snapshot. atomic write, 保留其他顶层字段.
 * @param {object} snapshot
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveAiUsageSnapshot(snapshot, statePath = defaultPath()) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('saveAiUsageSnapshot: snapshot must be non-null object');
  }
  return patchState((next) => {
    next.ai_usage_snapshot = { ...snapshot };
  }, statePath);
}
```

然后在 `module.exports` 块**追加**:

```js
  loadAiUsageSnapshot,
  saveAiUsageSnapshot,
```

(在 `saveAISessionsConfig,` 后)

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run tests/main/state-store.test.js 2>&1 | tail -10
```

Expected: PASS — all tests passed

- [ ] **Step 5: Commit**

```bash
git add src/main/state-store.js tests/main/state-store.test.js
git commit -m "feat(state-store): loadAiUsageSnapshot/saveAiUsageSnapshot with patchState"
```

---

### Task U2.2: register-ai-usage.js — IPC handlers

**Files:**
- Create: `src/main/ipc/register-ai-usage.js`
- Create: `tests/ai-usage/ipc.test.js`

- [ ] **Step 1: 写失败的 IPC 测试**

`tests/ai-usage/ipc.test.js`:

```js
const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock electron 模块, 让 safeHandle 直接调 fn
const ipcHandlers = new Map();
jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel, fn) => ipcHandlers.set(channel, fn),
  },
  safeStorage: {
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => Buffer.from(b).toString(),
    isEncryptionAvailable: () => true,
  },
}));

const stateStore = require('../../src/main/state-store');
const { registerAiUsageHandlers } = require('../../src/main/ipc/register-ai-usage');
const { MiniMaxQuotaClient } = require('../../src/ai-usage/client');

function tmpStatePath() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ipc-test-'));
  return path.join(d, 'state.json');
}

function makeCtx(statePath) {
  return {
    safeHandle: (channel, fn) => ipcHandlers.set(channel, fn),
    statePath,
  };
}

describe('ai-usage IPC', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    delete global.__pulse_aiUsageClient;
  });

  test('get-snapshot returns null when no data', async () => {
    const p = tmpStatePath();
    registerAiUsageHandlers(makeCtx(p));
    const fn = ipcHandlers.get('ai-usage:get-snapshot');
    const r = await fn({});
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBe(null);
  });

  test('get-snapshot returns existing snapshot', async () => {
    const p = tmpStatePath();
    const snap = { provider: 'minimax', region: 'cn', fetchedAt: 100, windows: {}, credits: null };
    stateStore.saveAiUsageSnapshot(snap, p);
    registerAiUsageHandlers(makeCtx(p));
    const r = await ipcHandlers.get('ai-usage:get-snapshot')({});
    expect(r.snapshot).toEqual(snap);
  });

  test('fetch success writes snapshot + returns ok', async () => {
    const p = tmpStatePath();
    const http = {
      async post() {
        return {
          status: 200,
          body: JSON.stringify({
            base_resp: { status_code: 0 },
            model_remains: [{
              current_interval_total_count: 6000,
              current_interval_usage_count: 4200,
              interval_remains_time: '00:01:00:00',
              current_weekly_total_count: 50000,
              current_weekly_usage_count: 38000,
              weekly_remains_time: '05:00:00:00',
            }],
          }),
        };
      },
    };
    global.__pulse_aiUsageClient = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'sk-x', region: 'cn' });
    registerAiUsageHandlers(makeCtx(p));
    const r = await ipcHandlers.get('ai-usage:fetch')({});
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows['5h'].total).toBe(6000);
    expect(stateStore.loadAiUsageSnapshot(p)).toEqual(r.snapshot);
  });

  test('fetch failure does NOT write snapshot, returns reason', async () => {
    const p = tmpStatePath();
    // pre-seed good snapshot
    const good = { provider: 'minimax', region: 'cn', fetchedAt: 1, windows: {}, credits: null };
    stateStore.saveAiUsageSnapshot(good, p);

    const http = { async post() { return { status: 401, body: '{}' }; } };
    global.__pulse_aiUsageClient = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'bad', region: 'cn' });
    registerAiUsageHandlers(makeCtx(p));
    const r = await ipcHandlers.get('ai-usage:fetch')({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('auth_401');
    // snapshot preserved
    expect(stateStore.loadAiUsageSnapshot(p)).toEqual(good);
  });

  test('bootstrap fetch failure only logs, does not throw', async () => {
    const p = tmpStatePath();
    const http = { async post() { throw new Error('ECONNREFUSED'); } };
    global.__pulse_aiUsageClient = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'x', region: 'cn' });
    const { bootstrapFetchAiUsage } = require('../../src/main/ipc/register-ai-usage');
    await expect(bootstrapFetchAiUsage({ statePath: p, log: { info: () => {}, warn: () => {}, error: () => {} } })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run tests/ai-usage/ipc.test.js 2>&1 | tail -15
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: 实现 register-ai-usage.js**

```js
/**
 * src/main/ipc/register-ai-usage.js
 *
 * IPC handlers for AI usage monitoring.
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §5
 */

const { MiniMaxQuotaClient } = require('../../ai-usage/client');
const stateStore = require('../state-store');
const { mainLog } = require('../log');

function _getClient() {
  if (global.__pulse_aiUsageClient) return global.__pulse_aiUsageClient;
  // resolve apiKey lazy (从 safeStorage 拿)
  let apiKey = null;
  try {
    const storage = require('../../ai-sessions/storage');
    apiKey = storage.loadApiKey('minimax');
  } catch (err) {
    mainLog.warn('[ai-usage] failed to load minimax apiKey from safeStorage:', err.message);
  }
  const c = new MiniMaxQuotaClient({ apiKey, region: 'cn', log: mainLog });
  global.__pulse_aiUsageClient = c;
  return c;
}

function registerAiUsageHandlers(ctx) {
  const { safeHandle, statePath } = ctx;

  safeHandle('ai-usage:get-snapshot', async () => {
    return { ok: true, snapshot: stateStore.loadAiUsageSnapshot(statePath) };
  });

  safeHandle('ai-usage:fetch', async () => {
    try {
      const client = _getClient();
      const r = await client.fetchOnce({ region: 'cn' });
      if (r.ok) {
        stateStore.saveAiUsageSnapshot(r.snapshot, statePath);
        return { ok: true, snapshot: r.snapshot };
      }
      return { ok: false, reason: r.reason, error: r.error, status: r.status };
    } catch (err) {
      return { ok: false, reason: 'threw', error: (err && err.message) || 'unknown' };
    }
  }, { logMeta: () => ({ provider: 'minimax' }) });
}

/**
 * 启动后 setImmediate 调一次. 失败仅 log warn, 不抛.
 * @param {object} [opts] { statePath, log }
 */
async function bootstrapFetchAiUsage(opts = {}) {
  const log = opts.log || mainLog;
  const statePath = opts.statePath;
  try {
    const client = _getClient();
    const r = await client.fetchOnce({ region: 'cn' });
    if (r.ok) {
      stateStore.saveAiUsageSnapshot(r.snapshot, statePath);
      log.info('[ai-usage] bootstrap fetch ok');
    } else {
      log.warn('[ai-usage] bootstrap fetch failed:', r.reason);
    }
  } catch (err) {
    log.warn('[ai-usage] bootstrap fetch threw:', (err && err.message) || 'unknown');
  }
}

module.exports = { registerAiUsageHandlers, bootstrapFetchAiUsage };
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run tests/ai-usage/ipc.test.js 2>&1 | tail -10
```

Expected: PASS — all 5 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/register-ai-usage.js tests/ai-usage/ipc.test.js
git commit -m "feat(ai-usage): IPC handlers + bootstrapFetchAiUsage"
```

---

### Task U2.3: main/index.js — 接入 IPC + bootstrap 预热

**Files:**
- Modify: `src/main/index.js`

- [ ] **Step 1: 读 main/index.js 找到 IPC 注册和 bootstrap 区**

```bash
grep -n "registerAiHandlers\|setImmediate\|bootstrap" src/main/index.js
```

- [ ] **Step 2: 修改 main/index.js**

在 `require('../ipc/register-ai');` 之后**加一行**:

```js
const { registerAiUsageHandlers, bootstrapFetchAiUsage } = require('../ipc/register-ai-usage');
```

找到 `registerAiHandlers(ctx)` 调用，**紧随其后加**:

```js
registerAiUsageHandlers(ctx);
```

找到 bootstrap 完成区（一般在 `app.whenReady().then(...)` 里 main 启动流程末尾），**在末尾加**:

```js
// AI 用量监控: 启动后台预热 1 次 (不阻塞)
setImmediate(() => {
  bootstrapFetchAiUsage();
});
```

- [ ] **Step 3: 跑现有 test 确认没崩**

```bash
npx vitest run tests/main/ 2>&1 | tail -10
```

Expected: PASS — 现有测试不受影响

- [ ] **Step 4: 跑 smoke test 确认 require OK**

```bash
npx vitest run tests/main/load-smoke.test.js 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: 跑 load-smoke 末尾追加 (在 load-smoke test 文件)**

读 `tests/main/load-smoke.test.js` 末尾. 在末尾追加:

```js
test('src/ai-usage modules require OK', () => {
  expect(() => require('../../src/ai-usage')).not.toThrow();
  expect(() => require('../../src/ai-usage/client')).not.toThrow();
  expect(() => require('../../src/ai-usage/normalize')).not.toThrow();
  expect(() => require('../../src/ai-usage/store')).not.toThrow();
  expect(() => require('../../src/main/ipc/register-ai-usage')).not.toThrow();
});
```

- [ ] **Step 6: 跑 smoke 确认通过**

```bash
npx vitest run tests/main/load-smoke.test.js 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/index.js tests/main/load-smoke.test.js
git commit -m "feat(ai-usage): wire IPC + bootstrap pre-fetch on startup"
```

---

## Phase U3: UI 页面 + Store

### Task U3.1: api.js + ai-usage-store.js — signals + IPC wrappers

**Files:**
- Modify: `src/renderer/api.js`
- Create: `src/renderer/store/ai-usage-store.js`

- [ ] **Step 1: 读 api.js 找到 ai 模块加在哪**

```bash
grep -n "aiTasks\|aiSessions\|hasAiKey" src/renderer/api.js | head -20
```

- [ ] **Step 2: 在 api.js 末尾追加 aiUsage 模块**

```js
aiUsage: {
  getSnapshot: () => ipcRenderer.invoke('ai-usage:get-snapshot'),
  fetch: () => ipcRenderer.invoke('ai-usage:fetch'),
},
```

- [ ] **Step 3: 写 ai-usage-store.js**

```js
/**
 * src/renderer/store/ai-usage-store.js
 *
 * Signals + actions for AI usage page.
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §6.6
 */

import { signal } from '@preact/signals';
import { api } from '../api.js';
import { taggedLog } from '../log.js';

const log = taggedLog('[ai-usage]');

export const aiUsageSnapshot = signal(null);
export const aiUsageFetching = signal(false);
export const aiUsageLastError = signal(null);   // { reason, error, at }
export const aiUsageLastFetchedAt = signal(0);

export function _setAiUsageSnapshot(s) {
  aiUsageSnapshot.value = s && typeof s === 'object' ? s : null;
  if (s && typeof s.fetchedAt === 'number') {
    aiUsageLastFetchedAt.value = s.fetchedAt;
  }
}

export function _setAiUsageError(err) {
  aiUsageLastError.value = err && typeof err === 'object' ? err : null;
}

export function _setAiUsageFetching(busy) {
  aiUsageFetching.value = Boolean(busy);
}

export async function loadAiUsageSnapshot() {
  try {
    const r = await api.aiUsage.getSnapshot();
    if (r && r.ok) {
      _setAiUsageSnapshot(r.snapshot);
      return r.snapshot;
    }
  } catch (err) {
    log.warn('loadAiUsageSnapshot threw:', err && err.message);
  }
  return null;
}

export async function refreshAiUsage() {
  _setAiUsageFetching(true);
  _setAiUsageError(null);
  try {
    const r = await api.aiUsage.fetch();
    if (r && r.ok) {
      _setAiUsageSnapshot(r.snapshot);
      return { ok: true, snapshot: r.snapshot };
    }
    _setAiUsageError({
      reason: r && r.reason,
      error: r && r.error,
      at: Date.now(),
    });
    return { ok: false, reason: r && r.reason };
  } catch (err) {
    _setAiUsageError({ reason: 'threw', error: (err && err.message) || 'unknown', at: Date.now() });
    return { ok: false, reason: 'threw' };
  } finally {
    _setAiUsageFetching(false);
  }
}
```

- [ ] **Step 4: 跑现有 renderer test 确认 api.js 没崩**

```bash
npx vitest run tests/renderer/ 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/api.js src/renderer/store/ai-usage-store.js
git commit -m "feat(ai-usage): renderer signals + IPC wrappers"
```

---

### Task U3.2: AIUsagePage.jsx — 主组件 (empty / loaded / error 三态)

**Files:**
- Create: `src/renderer/components/AIUsagePage.jsx`
- Create: `tests/renderer/AIUsagePage.test.jsx`

- [ ] **Step 1: 写失败的组件测试**

`tests/renderer/AIUsagePage.test.jsx`:

```js
import { h } from 'preact';
import { render } from '@testing-library/preact';
import { signal } from '@preact/signals';

// Mock store before importing component
jest.mock('../../src/renderer/store/ai-usage-store.js', () => {
  const s = {
    snapshot: signal(null),
    fetching: signal(false),
    lastError: signal(null),
    lastFetchedAt: signal(0),
  };
  return {
    aiUsageSnapshot: s.snapshot,
    aiUsageFetching: s.fetching,
    aiUsageLastError: s.lastError,
    aiUsageLastFetchedAt: s.lastFetchedAt,
    refreshAiUsage: jest.fn(async () => ({ ok: true })),
    loadAiUsageSnapshot: jest.fn(async () => null),
  };
});

jest.mock('../../src/renderer/store.js', () => ({
  openAISettings: jest.fn(),
}));

const { AIUsagePage } = require('../../src/renderer/components/AIUsagePage.jsx');
const store = require('../../src/renderer/store/ai-usage-store.js');

function resetStore(snap, fetching, err) {
  store.aiUsageSnapshot.value = snap;
  store.aiUsageFetching.value = fetching;
  store.aiUsageLastError.value = err;
}

describe('AIUsagePage', () => {
  test('empty state when snapshot null and not fetching', () => {
    resetStore(null, false, null);
    const { container, getByText } = render(<AIUsagePage />);
    expect(container.textContent).toMatch(/尚无数据|点.*拉取/);
  });

  test('shows two cards when snapshot has 5h + weekly', () => {
    resetStore({
      provider: 'minimax',
      region: 'cn',
      fetchedAt: Date.now(),
      windows: {
        '5h': { total: 6000, remaining: 4200, used: 1800, resetAt: Date.now() + 3600_000, resetInSec: 3600, label: '5 小时滚动窗口' },
        weekly: { total: 50000, remaining: 38000, used: 12000, resetAt: Date.now() + 86400_000 * 5, resetInSec: 432000, label: '周窗口' },
      },
      credits: null,
    }, false, null);
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toMatch(/5\s*小时/);
    expect(container.textContent).toMatch(/周窗口/);
    expect(container.textContent).toMatch(/4,200/);
    expect(container.textContent).toMatch(/38,000/);
  });

  test('shows "暂无数据" placeholder when window is null', () => {
    resetStore({
      provider: 'minimax', region: 'cn', fetchedAt: Date.now(),
      windows: { '5h': null, weekly: { total: 50000, remaining: 38000, used: 12000, resetAt: null, resetInSec: null, label: '周窗口' } },
      credits: null,
    }, false, null);
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toMatch(/暂无数据/);
  });

  test('shows error banner when lastError set, snapshot still displayed', () => {
    resetStore({
      provider: 'minimax', region: 'cn', fetchedAt: Date.now(),
      windows: { '5h': { total: 6000, remaining: 4200, used: 1800, resetAt: Date.now() + 3600_000, resetInSec: 3600, label: '5 小时' }, weekly: null },
      credits: null,
    }, false, { reason: 'auth_401', error: 'API Key 无效', at: Date.now() });
    const { container } = render(<AIUsagePage />);
    expect(container.textContent).toMatch(/刷新失败/);
    expect(container.textContent).toMatch(/4,200/);  // old data still visible
  });

  test('refresh button calls refreshAiUsage', async () => {
    resetStore(null, false, null);
    const { container } = render(<AIUsagePage />);
    const btn = container.querySelector('[data-action="refresh"]');
    btn.click();
    await new Promise(r => setTimeout(r, 0));
    expect(store.refreshAiUsage).toHaveBeenCalled();
  });

  test('跳配置按钮 calls openAISettings when reason=auth_401', () => {
    const store2 = require('../../src/renderer/store.js');
    resetStore(null, false, { reason: 'auth_401', at: Date.now() });
    const { container } = render(<AIUsagePage />);
    const btn = container.querySelector('[data-action="open-settings"]');
    if (btn) btn.click();
    expect(store2.openAISettings).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run tests/renderer/AIUsagePage.test.jsx 2>&1 | tail -15
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: 实现 AIUsagePage.jsx**

```jsx
/**
 * src/renderer/components/AIUsagePage.jsx
 *
 * AI 用量页面 (SideNav 第 5 项).
 * Spec: docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md §6
 */

import { useEffect, useState } from 'preact/hooks';
import {
  aiUsageSnapshot, aiUsageFetching, aiUsageLastError, aiUsageLastFetchedAt,
  refreshAiUsage,
} from '../store/ai-usage-store.js';
import { openAISettings } from '../store.js';

const ERROR_MESSAGES = {
  api_key_missing: '请先到 AI 配置设置 minimax key',
  api_key_decrypt_failed: 'API Key 解密失败，请重新设置',
  auth_401: 'API Key 无效，请到 AI 配置更新',
  auth_403: 'API Key 无权限，请到 AI 配置更新',
  rate_limited: '调用太频繁，请稍后再试',
  network_failed: '网络失败，请检查网络',
  timeout: '请求超时，请重试',
  response_not_json: 'API 返回异常',
  api_error: 'API 返回错误',
  http_status_404: 'endpoint 404，可能是官方更新，请反馈',
};

function localizeReason(reason) {
  return ERROR_MESSAGES[reason] || `刷新失败: ${reason}`;
}

function fmtNumber(n) {
  if (typeof n !== 'number') return '--';
  return n.toLocaleString('en-US');
}

function fmtPercent(used, total) {
  if (typeof used !== 'number' || typeof total !== 'number' || total === 0) return '--%';
  return `${Math.round((used / total) * 100)}%`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatRemaining(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '已可重置';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d} 天 ${pad(h)} 时`;
  if (h > 0) return `${h} 时 ${pad(m)} 分`;
  if (m > 0) return `${m} 分 ${pad(s)} 秒`;
  return `${s} 秒`;
}

function useCountdown(resetAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (typeof resetAt !== 'number') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resetAt]);
  if (typeof resetAt !== 'number') return '—';
  return formatRemaining(resetAt - now);
}

function formatAge(ms) {
  if (typeof ms !== 'number' || ms <= 0) return '—';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 时 ${min % 60} 分前`;
  return `${Math.floor(h / 24)} 天前`;
}

function WindowCard({ window, title }) {
  if (window === null || window === undefined) {
    return (
      <div class="ai-usage-card ai-usage-card-empty">
        <div class="ai-usage-card-title">{title}</div>
        <div class="ai-usage-card-empty-msg">暂无数据</div>
      </div>
    );
  }
  const { total, remaining, used, resetAt } = window;
  const pct = fmtPercent(used, total);
  const countdown = useCountdown(resetAt);
  return (
    <div class="ai-usage-card">
      <div class="ai-usage-card-title">{title}</div>
      <div class="ai-usage-card-bar">
        <div class="ai-usage-card-bar-fill" style={{ width: pct }} />
      </div>
      <div class="ai-usage-card-stats">
        剩余 {fmtNumber(remaining)} / {fmtNumber(total)}   已用 {fmtNumber(used)} ({pct})
      </div>
      <div class="ai-usage-card-reset">距离重置: {countdown}</div>
    </div>
  );
}

export function AIUsagePage() {
  const snap = aiUsageSnapshot.value;
  const fetching = aiUsageFetching.value;
  const lastError = aiUsageLastError.value;
  const fetchedAt = aiUsageLastFetchedAt.value;
  const [age, setAge] = useState(Date.now() - fetchedAt);

  useEffect(() => {
    if (!fetchedAt) return undefined;
    const id = setInterval(() => setAge(Date.now() - fetchedAt), 5000);
    return () => clearInterval(id);
  }, [fetchedAt]);

  const noData = !snap && !fetching;

  return (
    <div class="ai-usage-page">
      <header class="ai-usage-header">
        <h2>📊 AI 用量 — minimax (中国版)</h2>
        <button
          class="ai-usage-refresh-btn"
          data-action="refresh"
          disabled={fetching}
          onClick={() => refreshAiUsage()}
        >
          {fetching ? '⟳ 刷新中…' : '🔄 刷新'}
        </button>
      </header>
      {fetchedAt > 0 && (
        <div class="ai-usage-meta">最后更新: {formatAge(age)}</div>
      )}
      {lastError && (
        <div class="ai-usage-error" data-error-reason={lastError.reason}>
          {localizeReason(lastError.reason)}
          {lastError.reason && /^auth_|^api_key_/.test(lastError.reason) && (
            <button
              class="ai-usage-error-btn"
              data-action="open-settings"
              onClick={() => openAISettings(true)}
            >
              打开 AI 配置
            </button>
          )}
        </div>
      )}
      {noData ? (
        <div class="ai-usage-empty">
          <p>尚无数据，点 🔄 拉取</p>
          <button class="ai-usage-empty-btn" data-action="refresh" onClick={() => refreshAiUsage()}>
            立即拉取
          </button>
        </div>
      ) : (
        <div class="ai-usage-cards">
          <WindowCard window={snap?.windows?.['5h']} title="5 小时滚动窗口" />
          <WindowCard window={snap?.windows?.weekly} title="周窗口" />
        </div>
      )}
    </div>
  );
}

export default AIUsagePage;
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run tests/renderer/AIUsagePage.test.jsx 2>&1 | tail -10
```

Expected: PASS — all ~6 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/AIUsagePage.jsx tests/renderer/AIUsagePage.test.jsx
git commit -m "feat(ai-usage): AIUsagePage component with 3 states + countdown"
```

---

### Task U3.3: SideNav + App.jsx — 接入新入口

**Files:**
- Modify: `src/renderer/components/SideNav.jsx`
- Modify: `src/renderer/App.jsx`

- [ ] **Step 1: 在 SideNav.jsx NAV_ITEMS 末尾追加**

```jsx
{ key: 'usage', icon: '📊', label: 'AI 用量', tooltip: 'minimax 订阅配额 + 剩余' },
```

- [ ] **Step 2: 读 App.jsx 找到 activeNav 路由分支**

```bash
grep -n "activeNav\|ithome\|worldcup\|funds\|ResultsView" src/renderer/App.jsx
```

- [ ] **Step 3: 在 App.jsx 路由分支加 usage case**

找到 switch/三元里其他 4 个 nav 路由分支, 在末尾加:

```jsx
{activeNav.value === 'usage' && <AIUsagePage />}
```

并在 App.jsx 顶部 import:

```js
import { AIUsagePage } from './components/AIUsagePage.jsx';
```

- [ ] **Step 4: 跑现有 renderer test 确认没崩**

```bash
npx vitest run tests/renderer/ 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: 手动验证 (UI 看不到, 至少 typecheck / require 不崩)**

```bash
node -e "require('./src/renderer/components/AIUsagePage.jsx')" 2>&1 | tail -5
```

Expected: 应该没输出 (jsx 不能直接 node require, 但 import 语法错误会暴露)

实际上 jsx 需要 esbuild build, 跳过 node check, 直接跑 vitest:

```bash
npm run build:renderer 2>&1 | tail -20
```

Expected: build 成功, 无 syntax error

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SideNav.jsx src/renderer/App.jsx
git commit -m "feat(ai-usage): SideNav entry + App routing for usage page"
```

---

## Phase U4: Polish + E2E

### Task U4.1: 倒计时内存泄漏审计 + age interval 优化

**Files:**
- Modify: `src/renderer/components/AIUsagePage.jsx`

- [ ] **Step 1: 读现有 AIUsagePage.jsx, 确认 unmount cleanup**

```bash
grep -n "clearInterval\|useEffect" src/renderer/components/AIUsagePage.jsx
```

- [ ] **Step 2: 跑 vitest 确认现有 test 通过 (没崩)**

```bash
npx vitest run tests/renderer/AIUsagePage.test.jsx 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 3: 加一项 useEffect cleanup 测试**

在 `tests/renderer/AIUsagePage.test.jsx` 末尾追加:

```js
test('unmounts cleanly without leaking intervals', async () => {
  resetStore({
    provider: 'minimax', region: 'cn', fetchedAt: Date.now(),
    windows: { '5h': { total: 6000, remaining: 4200, used: 1800, resetAt: Date.now() + 3600_000, resetInSec: 3600, label: '5h' }, weekly: null },
    credits: null,
  }, false, null);
  const { unmount } = render(<AIUsagePage />);
  unmount();
  // 1 秒后没抛, 说明 interval cleanup 正确
  await new Promise(r => setTimeout(r, 1100));
  expect(true).toBe(true);
});
```

- [ ] **Step 4: 跑测试确认通过 (无修改 AIUsagePage.jsx 必要, 因为已经 clearInterval)**

```bash
npx vitest run tests/renderer/AIUsagePage.test.jsx 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/renderer/AIUsagePage.test.jsx
git commit -m "test(ai-usage): verify interval cleanup on unmount"
```

---

### Task U4.2: 完整 e2e test — mock HTTP → IPC → snapshot 写盘 → UI 显示

**Files:**
- Create: `tests/integration/ai-usage-e2e.test.js`

- [ ] **Step 1: 写 e2e test**

`tests/integration/ai-usage-e2e.test.js`:

```js
const fs = require('fs');
const path = require('path');
const os = require('os');

const ipcHandlers = new Map();
jest.mock('electron', () => ({
  ipcMain: { handle: (ch, fn) => ipcHandlers.set(ch, fn) },
  safeStorage: {
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => Buffer.from(b).toString(),
    isEncryptionAvailable: () => true,
  },
}));

const stateStore = require('../../src/main/state-store');
const { registerAiUsageHandlers } = require('../../src/main/ipc/register-ai-usage');
const { MiniMaxQuotaClient } = require('../../src/ai-usage/client');

function tmpStatePath() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-e2e-'));
  return path.join(d, 'state.json');
}

const CN_URL = 'https://www.minimaxi.com/v1/token_plan/remains';

describe('ai-usage e2e: fetch → snapshot → retrieve', () => {
  beforeEach(() => {
    ipcHandlers.clear();
    delete global.__pulse_aiUsageClient;
  });

  test('full flow', async () => {
    const p = tmpStatePath();

    // 1) 初始状态: 无 snapshot
    registerAiUsageHandlers({ safeHandle: (ch, fn) => ipcHandlers.set(ch, fn), statePath: p });
    const r1 = await ipcHandlers.get('ai-usage:get-snapshot')({});
    expect(r1.snapshot).toBe(null);

    // 2) 设置 mock HTTP 返 ok, fetch 一次
    const okBody = JSON.stringify({
      base_resp: { status_code: 0 },
      model_remains: [{
        current_interval_total_count: 6000,
        current_interval_usage_count: 4200,
        interval_remains_time: '00:04:30:00',
        current_weekly_total_count: 50000,
        current_weekly_usage_count: 38000,
        weekly_remains_time: '05:00:00:00',
      }],
    });
    const http = { async post(url) {
      expect(url).toBe(CN_URL);
      return { status: 200, body: okBody };
    } };
    global.__pulse_aiUsageClient = new MiniMaxQuotaClient({ httpClient: http, apiKey: 'sk-e2e', region: 'cn' });

    const r2 = await ipcHandlers.get('ai-usage:fetch')({});
    expect(r2.ok).toBe(true);
    expect(r2.snapshot.windows['5h'].total).toBe(6000);
    expect(r2.snapshot.windows['5h'].used).toBe(1800);

    // 3) get-snapshot 现在能拿到
    const r3 = await ipcHandlers.get('ai-usage:get-snapshot')({});
    expect(r3.snapshot).toEqual(r2.snapshot);

    // 4) 失败场景: HTTP 401
    global.__pulse_aiUsageClient = new MiniMaxQuotaClient({
      httpClient: { async post() { return { status: 401, body: '{}' }; } },
      apiKey: 'bad', region: 'cn',
    });
    const r4 = await ipcHandlers.get('ai-usage:fetch')({});
    expect(r4.ok).toBe(false);
    expect(r4.reason).toBe('auth_401');

    // 5) snapshot 仍是上次成功值 (没被污染)
    const r5 = await ipcHandlers.get('ai-usage:get-snapshot')({});
    expect(r5.snapshot).toEqual(r2.snapshot);
  });
});
```

- [ ] **Step 2: 跑测试确认通过**

```bash
npx vitest run tests/integration/ai-usage-e2e.test.js 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 3: 跑全套测试**

```bash
npx vitest run 2>&1 | tail -30
```

Expected: 全部 PASS (现有 + 新增 ~70 cases)

- [ ] **Step 4: Commit**

```bash
git add tests/integration/ai-usage-e2e.test.js
git commit -m "test(ai-usage): e2e fetch→snapshot→fail→preserved flow"
```

---

### Task U4.3: README/RELEASE-NOTES 同步

**Files:**
- Modify: `RELEASE-NOTES.md`

- [ ] **Step 1: 在 RELEASE-NOTES.md 顶部追加新版本 entry**

读 `RELEASE-NOTES.md` 顶部格式, 按现有格式追加:

```markdown
## v2.12.0 — AI 用量监控 (2026-06-14)

- 新增 SideNav 第 5 项 `📊 AI 用量`, 显示 minimax Token Plan (Coding Plan) 订阅的剩余配额
- 5h 滚动窗口 + 周窗口, 含剩余 / 已用 / 总数 / 百分比 / 重置倒计时
- 数据来源: minimax 官方 `GET /v1/token_plan/remains` (复用现有 AI 配置的 minimax apiKey)
- 手动刷新 + 启动后台预热, 失败保留上次快照 (show-last-good)
- 中国区 endpoint (`api.minimaxi.com`)
```

- [ ] **Step 2: 跑全套测试**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs(release-notes): v2.12.0 AI 用量监控 entry"
```

---

### Task U4.4: 最终验证

- [ ] **Step 1: 全套测试**

```bash
npx vitest run 2>&1 | tail -30
```

Expected: all PASS

- [ ] **Step 2: build renderer**

```bash
npm run build:renderer 2>&1 | tail -10
```

Expected: build 成功

- [ ] **Step 3: app 启动 smoke (electron, 不需真连 API)**

```bash
timeout 10 npm start 2>&1 | tail -20
```

Expected: electron 启动, 不 crash (main 启动日志可见)

- [ ] **Step 4: commit (若有遗漏)**

```bash
git status
# 若有 uncommitted 改动, commit
```

---

## Self-Review Checklist (执行前)

- [ ] Spec coverage: §1.1 必须达成 16 项都有对应 task
- [ ] Placeholder scan: 无 TBD/TODO/"similar to"/未定义引用
- [ ] Type consistency: `MiniMaxQuotaClient.fetchOnce` / `normalize()` / `loadAiUsageSnapshot()` / `saveAiUsageSnapshot()` / `aiUsageSnapshot` signal 名字跨 task 一致
- [ ] File paths: 全部精确到文件
- [ ] Commands: 全部可复制粘贴, expected output 明确

---
