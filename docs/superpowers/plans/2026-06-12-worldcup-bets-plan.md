# Worldcup Bets · Implementation Plan (2026-06-12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v2.9.0 世界杯 tab 内部加一个轻量体彩记账功能：每个比赛日 2 个手填数字（stake / pnl），比赛日底部小卡显示，顶部 stats card 实时汇总总投入/总盈亏/已填天数/未填天数。

**Architecture:** 沿用 `fund-store.js` 的 atomic write 模式，新增 1 个 main-process store + 3 个 IPC 通道；renderer 加 1 个 signals store + 2 个组件。数据 key 用 `match.date` (YYYY-MM-DD)，跟比赛日天然对齐，不联动比赛结果。

**Tech Stack:** Electron, Preact signals, CommonJS main-process modules, `vitest`, 现有 `state-store` JSON persistence。

**Spec:** `docs/superpowers/specs/2026-06-12-worldcup-bets-design.md`

**Version bump:** v2.9.x → v2.10.0

---

## File Structure

### Existing files to modify

- Modify: `src/main/state-store.js`
  - 不需要改（betsStore 跟 fundStore 一样走顶层 state.json 的 atomic write）
- Modify: `src/main/ipc.js`
  - 在 v2.9.x `worldcup:*` 区块加 3 个 handler: `worldcup:load-bets` / `worldcup:upsert-bet` / `worldcup:remove-bet`
- Modify: `preload.js`
  - 加 3 个 bridge 函数
- Modify: `src/renderer/api.js`
  - 加 3 个 `pick(overrides, ...)`
- Modify: `src/renderer/worldcup/WorldcupView.jsx`
  - 顶部插 `<WorldcupBetsStats />`（位置：`WorldcupHeader` 下面、`dayGroups` 上面）
  - `dayGroups.map` 里每个 day section 底部追加 `<DayBetFooter date={date} />`
- Modify: `styles.css`
  - 加 3 个新 class: `worldcup-bets-stats` / `day-bet-footer` / `day-bet-form`
- Modify: `package.json`
  - version: `2.9.x` → `2.10.0`
- Modify: `RELEASE-NOTES.md`
  - 加 v2.10.0 changelog 条目

### New files to create

- Create: `src/main/worldcup/bets-store.js`
  - `loadAll(statePath?)`, `upsert(input, statePath?)`, `remove(date, statePath?)` + 输入校验
- Create: `src/renderer/worldcup/betsStore.js`
  - Preact signals: `worldcupBets`, `betsLoaded`
  - Actions: `loadWorldcupBets()`, `upsertWorldcupBet(...)`, `removeWorldcupBet(date)`
  - 纯函数导出: `computeBetsStats(betsMap, allDates)`
- Create: `src/renderer/worldcup/WorldcupBetsStats.jsx`
  - 顶部 stats card 组件
- Create: `src/renderer/worldcup/DayBetFooter.jsx`
  - 每个 day section 底部小卡 + 行内编辑表单
- Create: `tests/main/worldcup-bets-store.test.js`
  - vitest, 跟 `tests/main/fund-store.test.js` 同 pattern

---

## Task 1: Implement `bets-store.js` (main-process)

**Files:**
- Create: `src/main/worldcup/bets-store.js`
- Test: `tests/main/worldcup-bets-store.test.js`

- [ ] **Step 1: Write the failing store tests**

`tests/main/worldcup-bets-store.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest';
import * as betsStore from '../../src/main/worldcup/bets-store.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function tmpStatePath() {
  const dir = join(tmpdir(), `pulse-bets-store-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return join(dir, 'state.json');
}

describe('bets-store', () => {
  let p;
  beforeEach(() => { p = tmpStatePath(); });

  it('loadAll returns empty when state file missing', () => {
    const r = betsStore.loadAll(p);
    expect(r.worldcupBets).toEqual({});
  });

  it('upsert adds a new entry', () => {
    const r = betsStore.upsert({ date: '2026-06-12', stake: 100, pnl: 120 }, p);
    expect(r.ok).toBe(true);
    expect(r.entry).toMatchObject({ date: '2026-06-12', stake: 100, pnl: 120, note: '' });

    const all = betsStore.loadAll(p);
    expect(all.worldcupBets['2026-06-12']).toMatchObject({ stake: 100, pnl: 120 });
  });

  it('upsert overwrites existing date', () => {
    betsStore.upsert({ date: '2026-06-12', stake: 100, pnl: 120 }, p);
    const r = betsStore.upsert({ date: '2026-06-12', stake: 200, pnl: -80 }, p);
    expect(r.ok).toBe(true);
    expect(betsStore.loadAll(p).worldcupBets['2026-06-12']).toMatchObject({ stake: 200, pnl: -80 });
  });

  it('upsert preserves other state keys (no clobber)', () => {
    writeFileSync(p, JSON.stringify({ funds: { holdings: [] }, otherKey: 1 }));
    betsStore.upsert({ date: '2026-06-12', stake: 50, pnl: 0 }, p);
    const all = betsStore.loadAll(p);
    expect(all.funds).toEqual({ holdings: [] });
    expect(all.otherKey).toBe(1);
    expect(all.worldcupBets['2026-06-12']).toMatchObject({ stake: 50, pnl: 0 });
  });

  it('upsert sets updatedAt', async () => {
    const before = Date.now();
    const r = betsStore.upsert({ date: '2026-06-12', stake: 100, pnl: 0 }, p);
    expect(r.entry.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('remove deletes the date entry', () => {
    betsStore.upsert({ date: '2026-06-12', stake: 100, pnl: 0 }, p);
    const r = betsStore.remove('2026-06-12', p);
    expect(r.ok).toBe(true);
    expect(betsStore.loadAll(p).worldcupBets['2026-06-12']).toBeUndefined();
  });

  it('remove on missing date returns ok=false', () => {
    const r = betsStore.remove('1999-01-01', p);
    expect(r.ok).toBe(false);
  });

  it('rejects invalid date format', () => {
    expect(() => betsStore.upsert({ date: '2026/06/12', stake: 0, pnl: 0 }, p))
      .toThrow(/invalid_date/);
  });

  it('rejects negative stake', () => {
    expect(() => betsStore.upsert({ date: '2026-06-12', stake: -1, pnl: 0 }, p))
      .toThrow(/stake/);
  });

  it('rejects non-number stake/pnl', () => {
    expect(() => betsStore.upsert({ date: '2026-06-12', stake: 'abc', pnl: 0 }, p))
      .toThrow();
    expect(() => betsStore.upsert({ date: '2026-06-12', stake: 0, pnl: 'xyz' }, p))
      .toThrow();
  });

  it('rejects stake/pnl > 1e9', () => {
    expect(() => betsStore.upsert({ date: '2026-06-12', stake: 1e10, pnl: 0 }, p))
      .toThrow();
  });

  it('rejects note > 200 chars', () => {
    const longNote = 'x'.repeat(201);
    expect(() => betsStore.upsert({ date: '2026-06-12', stake: 0, pnl: 0, note: longNote }, p))
      .toThrow(/note/);
  });

  it('accepts stake = 0 (白嫖合法)', () => {
    const r = betsStore.upsert({ date: '2026-06-12', stake: 0, pnl: 200 }, p);
    expect(r.ok).toBe(true);
  });

  it('accepts negative pnl (亏)', () => {
    const r = betsStore.upsert({ date: '2026-06-12', stake: 100, pnl: -100 }, p);
    expect(r.ok).toBe(true);
  });

  it('handles corrupt state.json gracefully', () => {
    writeFileSync(p, '{not json');
    const r = betsStore.loadAll(p);
    expect(r.worldcupBets).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests, confirm RED**

```bash
npx vitest run tests/main/worldcup-bets-store.test.js
```

期望：所有 case FAIL (module not found)。

- [ ] **Step 3: Implement `bets-store.js`**

```js
/**
 * src/main/worldcup/bets-store.js
 *
 * v2.10.0 世界杯体彩记账 store
 *
 * 沿用 fund-store.js 的模式:
 *   - 顶层 state.json 持久化
 *   - atomic write (writeFile + rename)
 *   - 输入校验
 */

const { writeAtomic } = require('../state-store');
const { mainLog } = require('../log');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE_LEN = 200;
const MAX_NUM = 1e9;

function _validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('invalid_input');
  const { date, stake, pnl, note = '' } = input;
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    const err = new Error('invalid_date');
    err.code = 'invalid_date';
    throw err;
  }
  if (typeof stake !== 'number' || !Number.isFinite(stake) || stake < 0 || stake > MAX_NUM) {
    throw new Error('invalid_stake');
  }
  if (typeof pnl !== 'number' || !Number.isFinite(pnl) || pnl > MAX_NUM || pnl < -MAX_NUM) {
    throw new Error('invalid_pnl');
  }
  if (typeof note !== 'string' || note.length > MAX_NOTE_LEN) {
    throw new Error('invalid_note');
  }
}

function _readState(statePath) {
  const fs = require('fs');
  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    mainLog.warn('[bets-store] state read failed, treating as empty', { msg: err && err.message });
    return {};
  }
}

function _writeState(statePath, state) {
  writeAtomic(statePath, JSON.stringify(state, null, 2));
}

function loadAll(statePath) {
  if (!statePath) throw new Error('statePath required');
  const state = _readState(statePath);
  return { worldcupBets: state.worldcupBets || {} };
}

function upsert(input, statePath) {
  if (!statePath) throw new Error('statePath required');
  _validateInput(input);
  const state = _readState(statePath);
  if (!state.worldcupBets) state.worldcupBets = {};
  const entry = {
    date: input.date,
    stake: input.stake,
    pnl: input.pnl,
    note: input.note || '',
    updatedAt: Date.now(),
  };
  state.worldcupBets[input.date] = entry;
  _writeState(statePath, state);
  return { ok: true, entry };
}

function remove(date, statePath) {
  if (!statePath) throw new Error('statePath required');
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return { ok: false, reason: 'invalid_date' };
  }
  const state = _readState(statePath);
  if (!state.worldcupBets || !state.worldcupBets[date]) {
    return { ok: false, reason: 'not_found' };
  }
  delete state.worldcupBets[date];
  _writeState(statePath, state);
  return { ok: true };
}

module.exports = { loadAll, upsert, remove, _validateInput };
```

- [ ] **Step 4: Run tests, confirm GREEN**

```bash
npx vitest run tests/main/worldcup-bets-store.test.js
```

---

## Task 2: Wire IPC channels in main

**Files:**
- Modify: `src/main/ipc.js`

- [ ] **Step 1: Locate the v2.9.0 `worldcup:*` block**

搜索 `worldcup:fetch-fixtures` 或 `worldcup:load-insights` 周围。

- [ ] **Step 2: Add 3 IPC handlers，紧挨着 `worldcup:generate-insight` 之后**

```js
// ─── v2.10.0 世界杯体彩记账 (stake + pnl per matchday) ───
const { loadAll: betsLoadAll, upsert: betsUpsert, remove: betsRemove } =
  require("./worldcup/bets-store");

ipcMain.handle("worldcup:load-bets", async () => {
  try {
    return { ok: true, ...betsLoadAll(stateStore.getStatePath()) };
  } catch (err) {
    mainLog.warn("[ipc] worldcup:load-bets threw", { msg: err && err.message });
    return { ok: false, reason: "threw", error: err && err.message };
  }
});

ipcMain.handle("worldcup:upsert-bet", async (_evt, payload) => {
  try {
    return betsUpsert(payload || {}, stateStore.getStatePath());
  } catch (err) {
    mainLog.warn("[ipc] worldcup:upsert-bet threw", { msg: err && err.message });
    return { ok: false, reason: err && err.message };
  }
});

ipcMain.handle("worldcup:remove-bet", async (_evt, date) => {
  try {
    return betsRemove(date, stateStore.getStatePath());
  } catch (err) {
    mainLog.warn("[ipc] worldcup:remove-bet threw", { msg: err && err.message });
    return { ok: false, reason: "threw", error: err && err.message };
  }
});
```

**注意**：先确认 `stateStore.getStatePath()` 是项目里用的真接口名 — 看一下 `fund-store.js` 怎么拿 state path，照搬那个 pattern。如果 `stateStore` 暴露的是另一个名字（e.g. `stateStore.STATE_PATH` 之类），跟着 fund-store 走。

- [ ] **Step 3: Smoke test — `npx tsc --noEmit` (or 项目用的 lint)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

---

## Task 3: Expose IPC in preload

**Files:**
- Modify: `preload.js`

- [ ] **Step 1: Locate the v2.9.0 `worldcup:*` block**

- [ ] **Step 2: Add 3 bridge functions**

```js
// v2.10.0 世界杯体彩记账
worldcupLoadBets: () => ipcRenderer.invoke("worldcup:load-bets"),
worldcupUpsertBet: (payload) =>
  ipcRenderer.invoke("worldcup:upsert-bet", payload),
worldcupRemoveBet: (date) =>
  ipcRenderer.invoke("worldcup:remove-bet", date),
```

---

## Task 4: Wire API mirror in renderer

**Files:**
- Modify: `src/renderer/api.js`

- [ ] **Step 1: Locate the v2.9.0 `worldcup*` 镜像块**

- [ ] **Step 2: Add 3 picks**

```js
// v2.10.0 世界杯体彩记账
worldcupLoadBets: pick(overrides, "worldcupLoadBets"),
worldcupUpsertBet: pick(overrides, "worldcupUpsertBet"),
worldcupRemoveBet: pick(overrides, "worldcupRemoveBet"),
```

---

## Task 5: Implement `betsStore.js` (renderer signals + computeBetsStats)

**Files:**
- Create: `src/renderer/worldcup/betsStore.js`

- [ ] **Step 1: Write the file**

```js
/**
 * src/renderer/worldcup/betsStore.js
 *
 * v2.10.0 世界杯体彩 — renderer signals + actions
 *
 * 沿用 worldcup/store.js 的 signal 风格 (preact/signals).
 */

import { signal } from '@preact/signals';
import { api } from '../api.js';

export const worldcupBets = signal({});   // { [date]: { date, stake, pnl, note, updatedAt } }
export const betsLoaded = signal(false);

export async function loadWorldcupBets() {
  try {
    const r = await api.worldcupLoadBets();
    if (r && r.ok) {
      worldcupBets.value = r.worldcupBets || {};
      betsLoaded.value = true;
    }
  } catch (err) {
    // 静默, 不冲淡世界栏目
    console.warn('[betsStore] loadWorldcupBets failed', err);
  }
}

export async function upsertWorldcupBet({ date, stake, pnl, note = '' }) {
  const r = await api.worldcupUpsertBet({ date, stake, pnl, note });
  if (r && r.ok) {
    worldcupBets.value = {
      ...worldcupBets.value,
      [date]: r.entry,
    };
    return { ok: true };
  }
  return { ok: false, reason: r && r.reason };
}

export async function removeWorldcupBet(date) {
  const r = await api.worldcupRemoveBet(date);
  if (r && r.ok) {
    const next = { ...worldcupBets.value };
    delete next[date];
    worldcupBets.value = next;
    return { ok: true };
  }
  return { ok: false, reason: r && r.reason };
}

/**
 * 纯函数: 从 betsMap + allDates 求聚合
 * @param {Object} betsMap
 * @param {string[]} allDates - YYYY-MM-DD[]
 * @returns {{ totalStake: number, totalPnl: number, filled: number, unfilled: number, roi: number|null }}
 */
export function computeBetsStats(betsMap, allDates) {
  const dates = Array.isArray(allDates) ? allDates : [];
  let totalStake = 0;
  let totalPnl = 0;
  let filled = 0;
  for (const d of dates) {
    const e = betsMap && betsMap[d];
    if (e && typeof e.stake === 'number' && typeof e.pnl === 'number') {
      totalStake += e.stake;
      totalPnl += e.pnl;
      filled += 1;
    }
  }
  const unfilled = dates.length - filled;
  const roi = totalStake > 0 ? totalPnl / totalStake : null;
  return { totalStake, totalPnl, filled, unfilled, roi };
}
```

- [ ] **Step 2: Verify import path — 看现有 `worldcup/store.js` 用的是 `'../api.js'` 还是别的**

---

## Task 6: Implement `WorldcupBetsStats.jsx`

**Files:**
- Create: `src/renderer/worldcup/WorldcupBetsStats.jsx`

- [ ] **Step 1: Write the component**

```jsx
/**
 * src/renderer/worldcup/WorldcupBetsStats.jsx
 *
 * v2.10.0 顶部 stats card — 总投入 / 总盈亏 / 已填 / 未填
 */
import { worldcupBets, betsLoaded } from './betsStore.js';
import { computeBetsStats } from './betsStore.js';

function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(Math.round(n * 100) / 100)}`;
}

function fmtRoi(roi) {
  if (roi == null) return '—';
  const pct = (roi * 100).toFixed(1);
  return (roi >= 0 ? '+' : '') + pct + '%';
}

export function WorldcupBetsStats({ allDates = [] }) {
  const bets = worldcupBets.value;
  const loaded = betsLoaded.value;
  if (!loaded) return null;
  const stats = computeBetsStats(bets, allDates);
  if (stats.filled === 0 && stats.unfilled === 0) return null;

  const pnlClass = stats.totalPnl >= 0 ? 'positive' : 'negative';
  return (
    <div class="worldcup-bets-stats">
      <div class="worldcup-bets-stat">
        <div class="worldcup-bets-stat-label">总投入</div>
        <div class="worldcup-bets-stat-value">{fmtMoney(stats.totalStake)}</div>
      </div>
      <div class="worldcup-bets-stat">
        <div class="worldcup-bets-stat-label">总盈亏</div>
        <div class={`worldcup-bets-stat-value worldcup-bets-stat-pnl ${pnlClass}`}>
          {fmtMoney(stats.totalPnl)}
        </div>
      </div>
      <div class="worldcup-bets-stat">
        <div class="worldcup-bets-stat-label">已填 / 未填</div>
        <div class="worldcup-bets-stat-value">
          {stats.filled} / {stats.unfilled}
        </div>
      </div>
      <div class="worldcup-bets-stat">
        <div class="worldcup-bets-stat-label">盈亏率</div>
        <div class={`worldcup-bets-stat-value ${pnlClass}`}>{fmtRoi(stats.roi)}</div>
      </div>
    </div>
  );
}
```

---

## Task 7: Implement `DayBetFooter.jsx`

**Files:**
- Create: `src/renderer/worldcup/DayBetFooter.jsx`

- [ ] **Step 1: Write the component**

```jsx
/**
 * src/renderer/worldcup/DayBetFooter.jsx
 *
 * v2.10.0 比赛日底部小卡 — stake + pnl + note
 * 已填显示当前值, 未填显示按钮, 点开行内编辑.
 */
import { useState, useRef, useEffect } from 'preact/hooks';
import {
  worldcupBets,
  upsertWorldcupBet,
  removeWorldcupBet,
} from './betsStore.js';

function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(Math.round(n * 100) / 100)}`;
}

export function DayBetFooter({ date }) {
  const bets = worldcupBets.value;
  const entry = bets[date];
  const [editing, setEditing] = useState(false);
  const [stake, setStake] = useState('');
  const [pnl, setPnl] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const stakeRef = useRef(null);

  useEffect(() => {
    if (editing && stakeRef.current) stakeRef.current.focus();
  }, [editing]);

  function openEdit() {
    setStake(entry ? String(entry.stake) : '');
    setPnl(entry ? String(entry.pnl) : '');
    setNote(entry ? entry.note || '' : '');
    setErr('');
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setErr('');
  }

  async function save() {
    const s = parseFloat(stake);
    const p = parseFloat(pnl);
    if (Number.isNaN(s) || s < 0) {
      setErr('投入需为非负数');
      return;
    }
    if (Number.isNaN(p)) {
      setErr('盈亏需为数字');
      return;
    }
    const r = await upsertWorldcupBet({ date, stake: s, pnl: p, note });
    if (!r.ok) {
      setErr('保存失败: ' + (r.reason || 'unknown'));
      return;
    }
    setEditing(false);
  }

  async function clear() {
    if (!confirm('清空这一天的体彩记录？')) return;
    await removeWorldcupBet(date);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') cancel();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
  }

  if (editing) {
    return (
      <div class="day-bet-form" onKeyDown={onKeyDown}>
        <div class="day-bet-form-row">
          <label>
            投入 ¥
            <input
              ref={stakeRef}
              type="number"
              min="0"
              step="0.01"
              value={stake}
              onInput={(e) => setStake(e.currentTarget.value)}
            />
          </label>
          <label>
            盈亏 ¥
            <input
              type="number"
              step="0.01"
              value={pnl}
              onInput={(e) => setPnl(e.currentTarget.value)}
            />
          </label>
        </div>
        <textarea
          class="day-bet-form-note"
          placeholder="备注 (可选, ≤ 200 字)"
          maxLength="200"
          value={note}
          onInput={(e) => setNote(e.currentTarget.value)}
        />
        {err && <div class="day-bet-form-err">{err}</div>}
        <div class="day-bet-form-actions">
          <button onClick={save}>保存 (⌘↵)</button>
          <button onClick={cancel}>取消 (Esc)</button>
        </div>
      </div>
    );
  }

  if (entry) {
    const pnlClass = entry.pnl >= 0 ? 'positive' : 'negative';
    return (
      <div class="day-bet-footer">
        <span class="day-bet-label">体彩</span>
        <span class="day-bet-stake">投入 {fmtMoney(entry.stake)}</span>
        <span class="day-bet-sep">·</span>
        <span class={`day-bet-pnl ${pnlClass}`}>盈亏 {fmtMoney(entry.pnl)}</span>
        {entry.note && <span class="day-bet-note">「{entry.note}」</span>}
        <span class="day-bet-actions">
          <button onClick={openEdit}>编辑</button>
          <button onClick={clear}>清空</button>
        </span>
      </div>
    );
  }

  return (
    <div class="day-bet-footer day-bet-footer-empty">
      <span class="day-bet-label">体彩</span>
      <button class="day-bet-unfilled-btn" onClick={openEdit}>未填 →</button>
    </div>
  );
}
```

---

## Task 8: Wire components into `WorldcupView.jsx`

**Files:**
- Modify: `src/renderer/worldcup/WorldcupView.jsx`

- [ ] **Step 1: Import the 2 new components + load action**

在文件顶部 import 区加：

```js
import { WorldcupBetsStats } from './WorldcupBetsStats.jsx';
import { DayBetFooter } from './DayBetFooter.jsx';
import { loadWorldcupBets } from './betsStore.js';
```

- [ ] **Step 2: 触发初始 load（跟 `loadWorldcupFixtures` 同位置）**

在 `useEffect` 或 `loadWorldcupFixtures()` 旁边加 `loadWorldcupBets();`

- [ ] **Step 3: 在 dayGroups 之上插入 stats card**

定位 `dayGroups.map(...)` 上方那行 JSX，加：

```jsx
<WorldcupBetsStats allDates={dayGroups.map(d => d.date)} />
```

- [ ] **Step 4: 在每个 day section 底部追加 footer**

定位 `dayGroups.map((day) => ...)` 里的 day section JSX 收尾（`.worldcup-day-matches` 之后、section 闭合 `</div>` 之前），加：

```jsx
<DayBetFooter date={day.date} />
```

---

## Task 9: Add CSS

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append 3 new class blocks at end of file**

```css
/* v2.10.0 世界杯体彩 */
.worldcup-bets-stats {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  margin: 12px 0;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-elevated, #fafafa);
}
.worldcup-bets-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.worldcup-bets-stat-label {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.worldcup-bets-stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #111);
}
.worldcup-bets-stat-pnl.positive { color: #10b981; }
.worldcup-bets-stat-pnl.negative { color: #ef4444; }
.worldcup-bets-stat-value.positive { color: #10b981; }
.worldcup-bets-stat-value.negative { color: #ef4444; }

.day-bet-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  border-top: 1px dashed var(--border, #e5e7eb);
}
.day-bet-label {
  font-weight: 500;
  color: var(--text-primary, #111);
}
.day-bet-stake { color: var(--text-primary, #111); }
.day-bet-sep { opacity: 0.5; }
.day-bet-pnl.positive { color: #10b981; font-weight: 500; }
.day-bet-pnl.negative { color: #ef4444; font-weight: 500; }
.day-bet-note {
  margin-left: 8px;
  font-style: italic;
  opacity: 0.8;
}
.day-bet-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
.day-bet-actions button {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
.day-bet-footer-empty { color: var(--text-tertiary, #9ca3af); }
.day-bet-unfilled-btn {
  font-size: 12px;
  padding: 4px 12px;
  border: 1px dashed var(--border, #d1d5db);
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary, #9ca3af);
  cursor: pointer;
}
.day-bet-unfilled-btn:hover { color: var(--text-primary, #111); }

.day-bet-form {
  padding: 12px;
  margin-top: 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  background: var(--bg-elevated, #fafafa);
}
.day-bet-form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}
.day-bet-form-row label {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  gap: 4px;
  flex: 1;
}
.day-bet-form-row input {
  padding: 4px 8px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 4px;
  font-size: 14px;
}
.day-bet-form-note {
  width: 100%;
  min-height: 40px;
  padding: 6px 8px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 4px;
  font-size: 12px;
  resize: vertical;
}
.day-bet-form-err {
  color: #ef4444;
  font-size: 12px;
  margin-top: 4px;
}
.day-bet-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.day-bet-form-actions button {
  padding: 4px 12px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 4px;
  background: var(--bg-primary, #fff);
  cursor: pointer;
}
.day-bet-form-actions button:first-child {
  background: var(--accent, #3b82f6);
  color: #fff;
  border-color: var(--accent, #3b82f6);
}
```

---

## Task 10: Bump version + changelog

**Files:**
- Modify: `package.json`
- Modify: `RELEASE-NOTES.md`

- [ ] **Step 1: Bump version in package.json**

`"version": "2.9.x"` → `"version": "2.10.0"`（看 `package.json` 当前真值，照着改）

- [ ] **Step 2: Add changelog entry to RELEASE-NOTES.md**

在文件最顶部加：

```markdown
## v2.10.0 (2026-06-12)

### 世界杯体彩记账 (new)
- 比赛日底部 1 行小卡：投入 / 盈亏 2 个手填数字 (可加备注)
- 顶部 stats card 实时显示总投入 / 总盈亏 / 已填天数 / 未填天数 / 盈亏率
- 数据持久化在 state.json `worldcupBets`，按比赛日 date (YYYY-MM-DD) 索引
- 不联动比赛结果；盈亏完全手填
- 删除 = 清空，footer 回到"未填"
```

---

## Task 11: 端到端手测

(必需 — spec 列了 10 个 case)

- [ ] **Step 1: 启动 app**

```bash
npm run start  # or 项目用的真命令
```

- [ ] **Step 2: 走完 spec 里 10 个手测 case**

打开 spec 文档，依次验证 case 1–10，标记 checkbox。

- [ ] **Step 3: 跑全测套件**

```bash
npx vitest run
```

确认没破坏其他测试。

---

## Out-of-Scope (backlog, 明确不做)

1. ❌ 玩法 / 赔率 / 比赛关联
2. ❌ 串关
3. ❌ 比赛结果自动联动
4. ❌ 多币种
5. ❌ 图表 / 走势
6. ❌ 导出
7. ❌ 体彩 sub-tab
8. ❌ 跟基金 tab 打通
9. ❌ 跨用户同步
10. ❌ 提示未填比赛日

(完整 non-goals 见 spec)
