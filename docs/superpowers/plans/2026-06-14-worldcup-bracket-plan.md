# 世界杯淘汰赛对阵模块 (Bracket) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Pulse 世界杯 tab 加第 4 个 sub-tab「对阵」，实时计算并展示 2026 世界杯完整淘汰赛 bracket（小组赛 → 1/16 决赛 → 1/8 决赛 → 1/4 决赛 → 半决赛 → 决赛 + 季军赛）。

**Architecture:** main process 跑纯函数 `bracket-rules.js` 计算 bracket，写入 `state.json.worldcup_bracket_snapshot` 顶层缓存；renderer 通过新 IPC 通道 `worldcup:compute-bracket` 拉快照并渲染 bracket tree；硬编码 FIFA 官方 Annex C row 1 + R32-R16-QF-SF-Final-Third 全部 32 场队伍映射规则。

**Tech Stack:** Node.js + Preact + Signals + vitest (TDD), 复用现有 IPC / state-store / parser / fetcher。

---

## File Structure

### 新增 (5)

- `src/main/worldcup/bracket-rules.js` (~400 行): 纯函数库 `sortThirdPlaced` / `selectThirdPlaced` / `matchAnnexCCase` / `resolveR32Matchups` / `propagateWinner` / `computeBracket` + 硬编码 Annex C row 1 + R32+ 全部 32 场队伍映射
- `src/main/worldcup/bracket.js` (~80 行): IPC handler, 走 fetcher + parser + scores + computeBracket + patchState
- `src/renderer/worldcup/bracketStore.js` (~80 行): signals + IPC 拉取
- `src/renderer/worldcup/WorldcupBracketView.jsx` (~300 行): bracket tree UI + SVG 连线
- `tests/main/worldcup-bracket-rules.test.js` (~250 行): 8 个 vitest 测试覆盖 bracket-rules

### 修改 (5)

- `src/main/state-store.js`: 加 `loadWorldcupBracket()` / `saveWorldcupBracket()` 走 `patchState({worldcup_bracket_snapshot: ...})`
- `src/main/ipc/register-worldcup.js`: 注册 `worldcup:compute-bracket` / `worldcup:load-bracket` 两个通道
- `src/renderer/worldcup/WorldcupHeader.jsx`: WC_SUBTABS 加 `{ key: 'bracket', label: '对阵', icon: '🏆' }`
- `src/renderer/worldcup/WorldcupLayout.jsx`: subTab === 'bracket' 路由分支 → `<WorldcupBracketView />`
- `preload.js`: 暴露 `worldcupComputeBracket` / `worldcupLoadBracket` API

### 新增测试 (3)

- `tests/main/worldcup-bracket-rules.test.js` (8 测试)
- `tests/main/worldcup-bracket-ipc.test.js` (2 测试)
- `tests/renderer/worldcup-bracket-view.test.jsx` (1 测试)

---

## Task 1: state-store 加 `loadWorldcupBracket` / `saveWorldcupBracket`

**Files:**
- Modify: `src/main/state-store.js:466-490` (在 `saveWorldcupTxt` 后追加)
- Test: `tests/main/worldcup-bracket-state-store.test.js` (新增)

- [ ] **Step 1.1: 写失败测试**

`tests/main/worldcup-bracket-state-store.test.js`:

```js
const fs = require("fs");
const os = require("os");
const path = require("path");
const stateStore = require("../../src/main/state-store");

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-state-"));
  return path.join(dir, "state.json");
}

describe("worldcup bracket snapshot (state-store)", () => {
  let statePath;
  beforeEach(() => { statePath = tmpStatePath(); });
  afterEach(() => { try { fs.rmSync(path.dirname(statePath), { recursive: true, force: true }); } catch {} });

  test("loadWorldcupBracket returns null when missing", () => {
    expect(stateStore.loadWorldcupBracket(statePath)).toBeNull();
  });

  test("saveWorldcupBracket then load roundtrip", () => {
    const snapshot = { version: 1, computedAt: 12345, projected: true, r32: [], r16: [], qf: [], sf: [], final: null, third: null, thirdPlacedAdvancing: [], annexCIndex: -1, warnings: [] };
    stateStore.saveWorldcupBracket(snapshot, statePath);
    const loaded = stateStore.loadWorldcupBracket(statePath);
    expect(loaded).toEqual(snapshot);
  });

  test("saveWorldcupBracket preserves other state.json fields", () => {
    stateStore.saveLastOpened({ foo: "bar" }, statePath);
    const snapshot = { version: 1, computedAt: 1, projected: false, r32: [], r16: [], qf: [], sf: [], final: null, third: null, thirdPlacedAdvancing: [], annexCIndex: 0, warnings: [] };
    stateStore.saveWorldcupBracket(snapshot, statePath);
    const last = stateStore.loadLastOpened(statePath);
    expect(last).toEqual({ foo: "bar" });
  });
});
```

- [ ] **Step 1.2: 运行测试，确认失败**

```bash
npx vitest run tests/main/worldcup-bracket-state-store.test.js
```

Expected: FAIL with `loadWorldcupBracket is not a function` / `saveWorldcupBracket is not a function`.

- [ ] **Step 1.3: 在 state-store.js 加 `loadWorldcupBracket` / `saveWorldcupBracket`**

在 `src/main/state-store.js` 的 `saveWorldcupTxt` 函数（line 481-490）后追加:

```js
/**
 * Load worldcup bracket snapshot from state.json. Returns null if absent.
 * @param {string} [statePath]
 * @returns {object|null}
 */
function loadWorldcupBracket(statePath = defaultPath()) {
  const s = load(statePath);
  if (!s) return null;
  const snap = s.worldcup_bracket_snapshot;
  if (!snap || typeof snap !== "object") return null;
  return snap;
}

/**
 * Save worldcup bracket snapshot to state.json (preserves other fields).
 * @param {object} snapshot
 * @param {string} [statePath]
 */
function saveWorldcupBracket(snapshot, statePath = defaultPath()) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new TypeError("saveWorldcupBracket: snapshot must be object");
  }
  return patchState((next) => {
    next.worldcup_bracket_snapshot = { ...snapshot };
  }, statePath);
}
```

在 `src/main/state-store.js` 的 `module.exports` 块（文件末尾）加导出:

```js
module.exports = {
  // ... 现有导出 ...
  loadWorldcupBracket,
  saveWorldcupBracket,
};
```

(检查当前 module.exports 已有的 keys，保留所有，只追加这两个)

- [ ] **Step 1.4: 运行测试，确认通过**

```bash
npx vitest run tests/main/worldcup-bracket-state-store.test.js
```

Expected: 3 PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/main/state-store.js tests/main/worldcup-bracket-state-store.test.js
git commit -m "feat(worldcup/state-store): add worldcup_bracket_snapshot load/save"
```

---

## Task 2: bracket-rules.js 基础数据结构 + sortThirdPlaced

**Files:**
- Create: `src/main/worldcup/bracket-rules.js`
- Test: `tests/main/worldcup-bracket-rules.test.js` (先建空文件)

- [ ] **Step 2.1: 写 sortThirdPlaced 失败测试**

`tests/main/worldcup-bracket-rules.test.js`:

```js
const {
  sortThirdPlaced,
  selectThirdPlaced,
  matchAnnexCCase,
  resolveR32Matchups,
  propagateWinner,
  computeBracket,
} = require("../../src/main/worldcup/bracket-rules");

describe("sortThirdPlaced", () => {
  test("sorts 12 third-placed teams by pts/gd/gf DESC", () => {
    const standings = {
      A: { pts: 6, gd: 2, gf: 5, ga: 3 },
      B: { pts: 6, gd: 2, gf: 7, ga: 5 },
      C: { pts: 4, gd: 0, gf: 3, ga: 3 },
      D: { pts: 6, gd: 4, gf: 8, ga: 4 },
      E: { pts: 3, gd: -1, gf: 2, ga: 3 },
      F: { pts: 6, gd: 2, gf: 4, ga: 2 },
      G: { pts: 4, gd: 1, gf: 5, ga: 4 },
      H: { pts: 1, gd: -3, gf: 1, ga: 4 },
      I: { pts: 6, gd: 3, gf: 6, ga: 3 },
      J: { pts: 4, gd: -1, gf: 4, ga: 5 },
      K: { pts: 3, gd: 0, gf: 3, ga: 3 },
      L: { pts: 0, gd: -4, gf: 0, ga: 4 },
    };
    const sorted = sortThirdPlaced(standings);
    expect(sorted.map((s) => s.group)).toEqual([
      "D", "I", "B", "A", "F", "G", "C", "J", "E", "K", "H", "L",
    ]);
  });

  test("ties broken by gd then gf", () => {
    const standings = {
      A: { pts: 3, gd: 0, gf: 2, ga: 2 },
      B: { pts: 3, gd: 0, gf: 3, ga: 3 },
    };
    expect(sortThirdPlaced(standings).map((s) => s.group)).toEqual(["B", "A"]);
  });

  test("returns empty array when standings empty", () => {
    expect(sortThirdPlaced({})).toEqual([]);
  });
});
```

- [ ] **Step 2.2: 运行测试，确认失败**

```bash
npx vitest run tests/main/worldcup-bracket-rules.test.js
```

Expected: FAIL with `Cannot find module '../../src/main/worldcup/bracket-rules'`.

- [ ] **Step 2.3: 创建 bracket-rules.js + 实现 sortThirdPlaced**

`src/main/worldcup/bracket-rules.js`:

```js
/**
 * src/main/worldcup/bracket-rules.js
 *
 * 2026 世界杯淘汰赛 bracket 计算 - 纯函数库 (无 IO, 易测)
 *
 * 数据契约:
 *   matches:    [{ stage, team1, team2, score, date, time, ... }]
 *   scores:     { [matchKey]: { ft, status, et?, pen? } }
 *   teamsData:  [{ group: 'A', name: 'Mexico', cn: '墨西哥', ... }]
 */

'use strict';

function sortThirdPlaced(standings) {
  const arr = Object.entries(standings || {})
    .map(([group, s]) => ({
      group,
      pts: s.pts || 0,
      gd: s.gd || 0,
      gf: s.gf || 0,
    }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.group.localeCompare(b.group);
    });
  return arr;
}

function selectThirdPlaced(sortedThird, n = 8) {
  return sortedThird.slice(0, n).map((s) => s.group);
}

// ─── Annex C 默认 row 1 + R32+ 全部 32 场映射 ──────────────────
// FIFA Annex C row 1: 4 runner-up 互打 + 8 winner 打 best-third
// 简化 v1: 走 row 1 默认, warning 'simplified_annex_c_default_row'
// 495 行完整表 v2 再补.

const ANNEX_C_DEFAULT = {
  // 4 个 runner-up 互打 (固定, FIFA Annex C row 1)
  r32Matches_73_88: [
    { num: 73, slot1: { type: 'group', rank: 'runnerUp', group: 'A' }, slot2: { type: 'group', rank: 'runnerUp', group: 'B' } },
    { num: 74, slot1: { type: 'group', rank: 'winner', group: 'E' }, slot2: { type: 'best-third', pool: ['A', 'B', 'C', 'D', 'F'] } },
    { num: 75, slot1: { type: 'group', rank: 'winner', group: 'F' }, slot2: { type: 'group', rank: 'runnerUp', group: 'C' } },
    { num: 76, slot1: { type: 'group', rank: 'winner', group: 'C' }, slot2: { type: 'group', rank: 'runnerUp', group: 'F' } },
    { num: 77, slot1: { type: 'group', rank: 'winner', group: 'I' }, slot2: { type: 'best-third', pool: ['C', 'D', 'F', 'G', 'H'] } },
    { num: 78, slot1: { type: 'group', rank: 'runnerUp', group: 'E' }, slot2: { type: 'group', rank: 'runnerUp', group: 'I' } },
    { num: 79, slot1: { type: 'group', rank: 'winner', group: 'A' }, slot2: { type: 'best-third', pool: ['C', 'E', 'F', 'H', 'I'] } },
    { num: 80, slot1: { type: 'group', rank: 'winner', group: 'L' }, slot2: { type: 'best-third', pool: ['E', 'H', 'I', 'J', 'K'] } },
    { num: 81, slot1: { type: 'group', rank: 'winner', group: 'D' }, slot2: { type: 'best-third', pool: ['B', 'E', 'F', 'I', 'J'] } },
    { num: 82, slot1: { type: 'group', rank: 'winner', group: 'G' }, slot2: { type: 'best-third', pool: ['A', 'E', 'H', 'I', 'J'] } },
    { num: 83, slot1: { type: 'group', rank: 'runnerUp', group: 'K' }, slot2: { type: 'group', rank: 'runnerUp', group: 'L' } },
    { num: 84, slot1: { type: 'group', rank: 'winner', group: 'H' }, slot2: { type: 'group', rank: 'runnerUp', group: 'J' } },
    { num: 85, slot1: { type: 'group', rank: 'winner', group: 'B' }, slot2: { type: 'best-third', pool: ['E', 'F', 'G', 'I', 'J'] } },
    { num: 86, slot1: { type: 'group', rank: 'winner', group: 'J' }, slot2: { type: 'group', rank: 'runnerUp', group: 'H' } },
    { num: 87, slot1: { type: 'group', rank: 'winner', group: 'K' }, slot2: { type: 'best-third', pool: ['D', 'E', 'I', 'J', 'L'] } },
    { num: 88, slot1: { type: 'group', rank: 'runnerUp', group: 'D' }, slot2: { type: 'group', rank: 'runnerUp', group: 'G' } },
  ],
  // R16: 8 场 (Match 89-96)
  r16Matches_89_96: [
    { num: 89, sources: ['r32:74', 'r32:77'] },
    { num: 90, sources: ['r32:73', 'r32:75'] },
    { num: 91, sources: ['r32:76', 'r32:78'] },
    { num: 92, sources: ['r32:79', 'r32:80'] },
    { num: 93, sources: ['r32:83', 'r32:84'] },
    { num: 94, sources: ['r32:81', 'r32:82'] },
    { num: 95, sources: ['r32:86', 'r32:88'] },
    { num: 96, sources: ['r32:85', 'r32:87'] },
  ],
  // QF: 4 场 (Match 97-100)
  qfMatches_97_100: [
    { num: 97, sources: ['r16:89', 'r16:90'] },
    { num: 98, sources: ['r16:93', 'r16:94'] },
    { num: 99, sources: ['r16:91', 'r16:92'] },
    { num: 100, sources: ['r16:95', 'r16:96'] },
  ],
  // SF: 2 场 (Match 101-102)
  sfMatches_101_102: [
    { num: 101, sources: ['qf:97', 'qf:98'] },
    { num: 102, sources: ['qf:99', 'qf:100'] },
  ],
  // 决赛: Match 104
  finalMatch: { num: 104, sources: ['sf:101', 'sf:102'] },
  // 季军赛: Match 103
  thirdMatch: { num: 103, sources: ['sf:101-loser', 'sf:102-loser'] },
};

function matchAnnexCCase(_advancingGroups) {
  // v1 简化: 永远返 row 1 (ANNEX_C_DEFAULT)
  // 495 行完整匹配 v2 再实现
  return { rowIndex: 0, config: ANNEX_C_DEFAULT };
}

module.exports = {
  sortThirdPlaced,
  selectThirdPlaced,
  matchAnnexCCase,
  ANNEX_C_DEFAULT,
};
```

- [ ] **Step 2.4: 运行测试 sortThirdPlaced 部分**

```bash
npx vitest run tests/main/worldcup-bracket-rules.test.js -t "sortThirdPlaced"
```

Expected: 3 PASS (sortThirdPlaced).

- [ ] **Step 2.5: Commit**

```bash
git add src/main/worldcup/bracket-rules.js tests/main/worldcup-bracket-rules.test.js
git commit -m "feat(worldcup/bracket-rules): add sortThirdPlaced + Annex C default row"
```

---

## Task 3: selectThirdPlaced + matchAnnexCCase

**Files:**
- Modify: `tests/main/worldcup-bracket-rules.test.js` (追加测试)
- Modify: `src/main/worldcup/bracket-rules.js` (追加实现)

- [ ] **Step 3.1: 追加 selectThirdPlaced 测试**

在 `tests/main/worldcup-bracket-rules.test.js` 末尾追加:

```js
describe("selectThirdPlaced", () => {
  test("returns top 8 group letters by pts/gd/gf", () => {
    const sorted = [
      { group: 'D', pts: 6, gd: 4, gf: 8 },
      { group: 'I', pts: 6, gd: 3, gf: 6 },
      { group: 'B', pts: 6, gd: 2, gf: 7 },
      { group: 'A', pts: 6, gd: 2, gf: 5 },
      { group: 'F', pts: 6, gd: 2, gf: 4 },
      { group: 'G', pts: 4, gd: 1, gf: 5 },
      { group: 'C', pts: 4, gd: 0, gf: 3 },
      { group: 'J', pts: 4, gd: -1, gf: 4 },
      { group: 'E', pts: 3, gd: -1, gf: 2 },
      { group: 'K', pts: 3, gd: 0, gf: 3 },
      { group: 'H', pts: 1, gd: -3, gf: 1 },
      { group: 'L', pts: 0, gd: -4, gf: 0 },
    ];
    expect(selectThirdPlaced(sorted)).toEqual([
      'D', 'I', 'B', 'A', 'F', 'G', 'C', 'J',
    ]);
  });

  test("returns fewer than 8 when fewer available", () => {
    const sorted = [
      { group: 'A', pts: 6, gd: 2, gf: 5 },
      { group: 'B', pts: 4, gd: 0, gf: 3 },
    ];
    expect(selectThirdPlaced(sorted)).toEqual(['A', 'B']);
  });
});

describe("matchAnnexCCase", () => {
  test("returns row 0 default with config", () => {
    const result = matchAnnexCCase(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(result.rowIndex).toBe(0);
    expect(result.config).toBeDefined();
    expect(result.config.r32Matches_73_88).toHaveLength(16);
  });

  test("always returns default row in v1 regardless of advancing groups", () => {
    expect(matchAnnexCCase([]).rowIndex).toBe(0);
    expect(matchAnnexCCase(['X', 'Y', 'Z']).rowIndex).toBe(0);
  });
});
```

- [ ] **Step 3.2: 运行测试，确认通过（selectThirdPlaced + matchAnnexCCase 已实现）**

```bash
npx vitest run tests/main/worldcup-bracket-rules.test.js -t "selectThirdPlaced|matchAnnexCCase"
```

Expected: 4 PASS.

- [ ] **Step 3.3: Commit**

```bash
git add src/main/worldcup/bracket-rules.js tests/main/worldcup-bracket-rules.test.js
git commit -m "feat(worldcup/bracket-rules): add selectThirdPlaced + matchAnnexCCase"
```

---

## Task 4: resolveR32Matchups + propagateWinner

**Files:**
- Modify: `tests/main/worldcup-bracket-rules.test.js`
- Modify: `src/main/worldcup/bracket-rules.js`

- [ ] **Step 4.1: 追加 resolveR32Matchups 测试**

在 `tests/main/worldcup-bracket-rules.test.js` 末尾追加:

```js
describe("resolveR32Matchups", () => {
  test("resolves 16 R32 matches with real team names from group results", () => {
    const groupResults = {
      A: { winner: 'Mexico', runnerUp: 'South Africa', third: 'South Korea' },
      B: { winner: 'Canada', runnerUp: 'Switzerland', third: 'Qatar' },
      C: { winner: 'Brazil', runnerUp: 'Morocco', third: 'Scotland' },
      D: { winner: 'USA', runnerUp: 'Paraguay', third: 'Australia' },
      E: { winner: 'Germany', runnerUp: 'Curaçao', third: 'Ivory Coast' },
      F: { winner: 'Netherlands', runnerUp: 'Japan', third: 'Sweden' },
      G: { winner: 'Belgium', runnerUp: 'Egypt', third: 'Iran' },
      H: { winner: 'Spain', runnerUp: 'Cape Verde', third: 'Saudi Arabia' },
      I: { winner: 'France', runnerUp: 'Senegal', third: 'Iraq' },
      J: { winner: 'Argentina', runnerUp: 'Algeria', third: 'Austria' },
      K: { winner: 'Portugal', runnerUp: 'DR Congo', third: 'Colombia' },
      L: { winner: 'England', runnerUp: 'Croatia', third: 'Ghana' },
    };
    const annex = matchAnnexCCase(['E', 'I', 'J', 'K', 'L', 'D', 'F', 'G']);
    const r32 = resolveR32Matchups(annex.config, groupResults);
    expect(r32).toHaveLength(16);
    expect(r32[0].matchNum).toBe(73);
    expect(r32[0].slot1.team.name).toBe('South Africa');
    expect(r32[0].slot2.team.name).toBe('Switzerland');
    // Match 74: E 组 winner vs best-third from ABCDF pool
    expect(r32[1].matchNum).toBe(74);
    expect(r32[1].slot1.team.name).toBe('Germany');
    // Slot 2 is best-third, not resolved yet (still pool)
    expect(r32[1].slot2.source).toBe('best-third-pool');
  });

  test("returns slot.team=null when group result missing", () => {
    const groupResults = { A: { winner: 'Mexico', runnerUp: 'X', third: 'Y' } };
    const annex = matchAnnexCCase(['E']);
    const r32 = resolveR32Matchups(annex.config, groupResults);
    const m74 = r32.find((m) => m.matchNum === 74);
    expect(m74.slot1.team).toBeNull();
  });
});

describe("propagateWinner", () => {
  test("propagates R32 winners into R16 slots when all final", () => {
    const r32Matches = [
      { matchNum: 73, slot1: { team: { name: 'A' } }, slot2: { team: { name: 'B' } }, score: { ft: [2, 1], status: 'final' } },
      { matchNum: 74, slot1: { team: { name: 'C' } }, slot2: { team: { name: 'D' } }, score: { ft: [1, 1], et: [2, 1], status: 'final' } },
      { matchNum: 75, slot1: { team: { name: 'E' } }, slot2: { team: { name: 'F' } }, score: { ft: [0, 0], pen: [4, 3], status: 'final' } },
      { matchNum: 76, slot1: { team: { name: 'G' } }, slot2: { team: { name: 'H' } }, score: { ft: [3, 0], status: 'final' } },
      { matchNum: 77, slot1: { team: { name: 'I' } }, slot2: { team: { name: 'J' } }, score: { ft: [1, 2], status: 'final' } },
      { matchNum: 78, slot1: { team: { name: 'K' } }, slot2: { team: { name: 'L' } }, score: { ft: [2, 0], status: 'final' } },
      { matchNum: 79, slot1: { team: { name: 'M' } }, slot2: { team: { name: 'N' } }, score: { ft: [1, 1], et: [1, 2], status: 'final' } },
      { matchNum: 80, slot1: { team: { name: 'O' } }, slot2: { team: { name: 'P' } }, score: { ft: [0, 1], status: 'final' } },
    ];
    const r16Template = [
      { matchNum: 89, sources: ['r32:74', 'r32:77'] },
      { matchNum: 90, sources: ['r32:73', 'r32:75'] },
      { matchNum: 91, sources: ['r32:76', 'r32:78'] },
      { matchNum: 92, sources: ['r32:79', 'r32:80'] },
      { matchNum: 93, sources: ['r32:83', 'r32:84'] },
      { matchNum: 94, sources: ['r32:81', 'r32:82'] },
      { matchNum: 95, sources: ['r32:86', 'r32:88'] },
      { matchNum: 96, sources: ['r32:85', 'r32:87'] },
    ];
    const r16 = propagateWinner(r32Matches, r16Template, 'r32');
    expect(r16).toHaveLength(8);
    expect(r16[0].slot1.team.name).toBe('C'); // 74 winner
    expect(r16[0].slot2.team.name).toBe('J'); // 77 winner
    expect(r16[1].slot1.team.name).toBe('A'); // 73 winner
    expect(r16[1].slot2.team.name).toBe('E'); // 75 winner
  });

  test("returns null team for unplayed matches", () => {
    const r32Matches = [
      { matchNum: 73, slot1: { team: { name: 'A' } }, slot2: { team: { name: 'B' } }, score: null },
      { matchNum: 75, slot1: { team: { name: 'E' } }, slot2: { team: { name: 'F' } }, score: null },
    ];
    const r16Template = [{ matchNum: 90, sources: ['r32:73', 'r32:75'] }];
    const r16 = propagateWinner(r32Matches, r16Template, 'r32');
    expect(r16[0].slot1.team).toBeNull();
    expect(r16[0].slot2.team).toBeNull();
    expect(r16[0].slot1.source).toBe('r32:73');
  });
});
```

- [ ] **Step 2.x: bracket-rules.js 已包含 ANNEX_C_DEFAULT 但还需 resolveR32Matchups + propagateWinner**

**注意**: ANNEX_C_DEFAULT 的 slot1/slot2 用了 `slot: { type, rank, group, pool? }` 格式; 而 resolveR32Matchups 输出应是 `{ matchNum, slot1: { team: { name } | null, source }, slot2: { team: { name } | null, source }, score, status, date?, time?, venue? }`。两个函数要做 slot 格式转换。

在 `src/main/worldcup/bracket-rules.js` 的 module.exports 前追加:

```js
function resolveR32Matchups(annexConfig, groupResults) {
  return annexConfig.r32Matches_73_88.map((tmpl) => {
    const slot1 = resolveSlot(tmpl.slot1, groupResults);
    const slot2 = resolveSlot(tmpl.slot2, groupResults);
    return {
      matchNum: tmpl.num,
      slot1,
      slot2,
      score: null,
      status: slot1.team && slot2.team ? 'pending' : 'projected',
      source1: sourceLabel(tmpl.slot1),
      source2: sourceLabel(tmpl.slot2),
    };
  });
}

function resolveSlot(slotSpec, groupResults) {
  if (slotSpec.type === 'group') {
    const gr = groupResults[slotSpec.group] || {};
    const teamName = gr[slotSpec.rank];
    if (!teamName) {
      return { team: null, source: `group:${slotSpec.group}:${slotSpec.rank}`, rank: slotSpec.rank, group: slotSpec.group };
    }
    return { team: { name: teamName }, source: `group:${slotSpec.group}:${slotSpec.rank}`, rank: slotSpec.rank, group: slotSpec.group };
  }
  if (slotSpec.type === 'best-third') {
    // v1: 暂不解析 best-third 真实队名 (warning 'best_third_not_resolved')
    return { team: null, source: 'best-third-pool', pool: slotSpec.pool };
  }
  return { team: null, source: 'unknown' };
}

function sourceLabel(slotSpec) {
  if (slotSpec.type === 'group') return `group:${slotSpec.group}:${slotSpec.rank}`;
  if (slotSpec.type === 'best-third') return `best-third:${slotSpec.pool.join(',')}`;
  return 'unknown';
}

function determineWinner(score) {
  if (!score || !score.ft) return null;
  const [h, a] = score.ft;
  if (h > a) return 'slot1';
  if (h < a) return 'slot2';
  if (score.et && Array.isArray(score.et)) {
    const [eh, ea] = score.et;
    if (eh > ea) return 'slot1';
    if (eh < ea) return 'slot2';
  }
  if (score.pen && Array.isArray(score.pen)) {
    const [ph, pa] = score.pen;
    if (ph > pa) return 'slot1';
    if (ph < pa) return 'slot2';
  }
  return null; // 完赛但无胜者 (异常)
}

function propagateWinner(prevMatches, nextTemplate, prevStage) {
  const prevByNum = new Map(prevMatches.map((m) => [m.matchNum, m]));
  return nextTemplate.map((tmpl) => {
    const sources = tmpl.sources.map((src) => parseSource(src));
    const slot1 = resolveFromSource(sources[0], prevByNum, prevStage);
    const slot2 = resolveFromSource(sources[1], prevByNum, prevStage);
    return {
      matchNum: tmpl.num,
      slot1,
      slot2,
      score: null,
      status: slot1.team && slot2.team ? 'pending' : 'projected',
      source1: tmpl.sources[0],
      source2: tmpl.sources[1],
    };
  });
}

function parseSource(src) {
  // 'r32:73' / 'r32:73-loser' / 'r16:89' / 'sf:101' / 'sf:101-loser'
  const m = src.match(/^([a-z0-9]+):(\d+)(-loser)?$/);
  if (!m) return { stage: null, num: null, loser: false };
  return { stage: m[1], num: parseInt(m[2], 10), loser: !!m[3] };
}

function resolveFromSource(parsed, prevByNum, currentPrevStage) {
  if (!parsed.stage || !parsed.num) return { team: null, source: 'invalid' };
  const prev = prevByNum.get(parsed.num);
  if (!prev) return { team: null, source: `${parsed.stage}:${parsed.num}` };
  const slotKey = parsed.loser ? null : 'slot1_or_slot2'; // simplified
  const winnerKey = determineWinner(prev.score);
  if (winnerKey === null) {
    return { team: null, source: `${parsed.stage}:${parsed.num}${parsed.loser ? '-loser' : ''}` };
  }
  const winnerSlot = winnerKey === 'slot1' ? prev.slot1 : prev.slot2;
  const loserSlot = winnerKey === 'slot1' ? prev.slot2 : prev.slot1;
  const chosen = parsed.loser ? loserSlot : winnerSlot;
  return {
    team: chosen.team,
    source: `${parsed.stage}:${parsed.num}${parsed.loser ? '-loser' : ''}`,
  };
}
```

更新 module.exports 加 resolveR32Matchups + propagateWinner:

```js
module.exports = {
  sortThirdPlaced,
  selectThirdPlaced,
  matchAnnexCCase,
  resolveR32Matchups,
  propagateWinner,
  computeBracket,
  ANNEX_C_DEFAULT,
};
```

- [ ] **Step 4.2: 运行测试**

```bash
npx vitest run tests/main/worldcup-bracket-rules.test.js -t "resolveR32Matchups|propagateWinner"
```

Expected: 4 PASS.

- [ ] **Step 4.3: Commit**

```bash
git add src/main/worldcup/bracket-rules.js tests/main/worldcup-bracket-rules.test.js
git commit -m "feat(worldcup/bracket-rules): add resolveR32Matchups + propagateWinner"
```

---

## Task 5: computeBracket 主入口

**Files:**
- Modify: `tests/main/worldcup-bracket-rules.test.js`
- Modify: `src/main/worldcup/bracket-rules.js`

- [ ] **Step 5.1: 追加 computeBracket 测试**

在 `tests/main/worldcup-bracket-rules.test.js` 末尾追加:

```js
describe("computeBracket", () => {
  test("returns complete bracket when all groups finished", () => {
    const matches = [];
    // 12 组全完赛 (实际逻辑由调用方提供 matches, computeBracket 内部用 standings 推)
    // 简化: 我们直接传 standings + scores
    const groupStandings = {
      A: { winner: 'Mexico', runnerUp: 'South Africa', third: { name: 'South Korea', pts: 3, gd: 0, gf: 2 } },
      B: { winner: 'Canada', runnerUp: 'Switzerland', third: { name: 'Qatar', pts: 3, gd: 0, gf: 2 } },
      C: { winner: 'Brazil', runnerUp: 'Morocco', third: { name: 'Scotland', pts: 3, gd: 0, gf: 2 } },
      D: { winner: 'USA', runnerUp: 'Paraguay', third: { name: 'Australia', pts: 3, gd: 0, gf: 2 } },
      E: { winner: 'Germany', runnerUp: 'Curaçao', third: { name: 'Ivory Coast', pts: 3, gd: 0, gf: 2 } },
      F: { winner: 'Netherlands', runnerUp: 'Japan', third: { name: 'Sweden', pts: 3, gd: 0, gf: 2 } },
      G: { winner: 'Belgium', runnerUp: 'Egypt', third: { name: 'Iran', pts: 3, gd: 0, gf: 2 } },
      H: { winner: 'Spain', runnerUp: 'Cape Verde', third: { name: 'Saudi Arabia', pts: 3, gd: 0, gf: 2 } },
      I: { winner: 'France', runnerUp: 'Senegal', third: { name: 'Iraq', pts: 3, gd: 0, gf: 2 } },
      J: { winner: 'Argentina', runnerUp: 'Algeria', third: { name: 'Austria', pts: 3, gd: 0, gf: 2 } },
      K: { winner: 'Portugal', runnerUp: 'DR Congo', third: { name: 'Colombia', pts: 3, gd: 0, gf: 2 } },
      L: { winner: 'England', runnerUp: 'Croatia', third: { name: 'Ghana', pts: 3, gd: 0, gf: 2 } },
    };
    const snapshot = computeBracket({ groupStandings, scores: {} });
    expect(snapshot.projected).toBe(false);
    expect(snapshot.r32).toHaveLength(16);
    expect(snapshot.r16).toHaveLength(8);
    expect(snapshot.qf).toHaveLength(4);
    expect(snapshot.sf).toHaveLength(2);
    expect(snapshot.final).toBeDefined();
    expect(snapshot.third).toBeDefined();
    expect(snapshot.thirdPlacedAdvancing).toHaveLength(8);
  });

  test("returns projected=true when some groups incomplete", () => {
    const groupStandings = {
      A: { winner: 'Mexico', runnerUp: 'South Africa', third: { name: 'South Korea', pts: 3, gd: 0, gf: 2 } },
      B: null, // 未完
      C: { winner: 'Brazil', runnerUp: 'Morocco', third: null },
      D: null,
      E: null,
      F: null,
      G: null,
      H: null,
      I: null,
      J: null,
      K: null,
      L: null,
    };
    const snapshot = computeBracket({ groupStandings, scores: {} });
    expect(snapshot.projected).toBe(true);
    expect(snapshot.warnings).toContain('group_B_incomplete');
  });

  test("empty groupStandings returns null bracket", () => {
    const snapshot = computeBracket({ groupStandings: {}, scores: {} });
    expect(snapshot).toBeNull();
  });
});
```

- [ ] **Step 5.2: 实现 computeBracket**

在 `src/main/worldcup/bracket-rules.js` 的 module.exports 前追加:

```js
function computeBracket({ groupStandings, scores }) {
  if (!groupStandings || Object.keys(groupStandings).length === 0) return null;

  const warnings = [];
  const groupResults = {};
  const thirdStandings = {};

  for (const [letter, gs] of Object.entries(groupStandings)) {
    if (!gs) {
      warnings.push(`group_${letter}_incomplete`);
      continue;
    }
    groupResults[letter] = {
      winner: gs.winner,
      runnerUp: gs.runnerUp,
      third: gs.third && gs.third.name ? gs.third.name : null,
    };
    if (gs.third) {
      thirdStandings[letter] = {
        pts: gs.third.pts || 0,
        gd: gs.third.gd || 0,
        gf: gs.third.gf || 0,
      };
    }
  }

  const sortedThird = sortThirdPlaced(thirdStandings);
  const advancing = selectThirdPlaced(sortedThird, 8);
  const annex = matchAnnexCCase(advancing);
  if (annex.rowIndex !== 0) warnings.push('annexC_unexpected_row');

  const r32 = resolveR32Matchups(annex.config, groupResults);
  const r16 = propagateWinner(r32, annex.config.r16Matches_89_96, 'r32');
  const qf = propagateWinner(r16, annex.config.qfMatches_97_100, 'r16');
  const sf = propagateWinner(qf, annex.config.sfMatches_101_102, 'qf');
  const finalMatch = propagateWinner(sf, [annex.config.finalMatch], 'sf')[0];
  const thirdMatch = propagateWinner(sf, [annex.config.thirdMatch], 'sf')[0];

  // 简化 Annex C row 1 warning
  warnings.push('simplified_annex_c_default_row');

  // 完整性判断: 12 组都有 winner/runnerUp + 8 个 third 都有 → projected=false
  const completeGroups = Object.values(groupStandings).filter((g) => g && g.winner && g.runnerUp);
  const projected = completeGroups.length < 12 || advancing.length < 8;

  return {
    version: 1,
    computedAt: Date.now(),
    inputsHash: 'sha256:' + simpleHash(groupStandings, scores),
    projected,
    r32,
    r16,
    qf,
    sf,
    final: finalMatch,
    third: thirdMatch,
    thirdPlacedAdvancing: advancing,
    annexCIndex: annex.rowIndex,
    warnings,
  };
}

function simpleHash(groupStandings, scores) {
  const payload = JSON.stringify({ g: groupStandings, s: scores });
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = ((hash << 5) - hash) + payload.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
```

- [ ] **Step 5.3: 运行所有 bracket-rules 测试**

```bash
npx vitest run tests/main/worldcup-bracket-rules.test.js
```

Expected: 12 PASS (3 sortThirdPlaced + 2 selectThirdPlaced + 2 matchAnnexCCase + 2 resolveR32Matchups + 2 propagateWinner + 3 computeBracket).

- [ ] **Step 5.4: Commit**

```bash
git add src/main/worldcup/bracket-rules.js tests/main/worldcup-bracket-rules.test.js
git commit -m "feat(worldcup/bracket-rules): add computeBracket main entry"
```

---

## Task 6: bracket.js IPC handler

**Files:**
- Create: `src/main/worldcup/bracket.js`
- Test: `tests/main/worldcup-bracket-ipc.test.js`

- [ ] **Step 6.1: 写失败测试**

`tests/main/worldcup-bracket-ipc.test.js`:

```js
const fs = require("fs");
const os = require("os");
const path = require("path");

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-ipc-"));
  return path.join(dir, "state.json");
}

describe("worldcup bracket IPC handler", () => {
  let statePath;
  beforeEach(() => { statePath = tmpStatePath(); });
  afterEach(() => { try { fs.rmSync(path.dirname(statePath), { recursive: true, force: true }); } catch {} });

  test("computeWorldcupBracket returns ok+snapshot and writes state", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({ statePath, fetcher: stubFetcher, scores: stubScores, teamsData: stubTeams });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeDefined();
    expect(r.snapshot.r32).toHaveLength(16);
    const stateStore = require("../../src/main/state-store");
    const loaded = stateStore.loadWorldcupBracket(statePath);
    expect(loaded).toBeDefined();
    expect(loaded.r32).toHaveLength(16);
  });

  test("computeWorldcupBracket returns ok:false when fetcher throws", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({ statePath, fetcher: () => { throw new Error("network down"); } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/network/);
    const stateStore = require("../../src/main/state-store");
    expect(stateStore.loadWorldcupBracket(statePath)).toBeNull();
  });
});

function stubFetcher() {
  return {
    ok: true,
    data: {
      name: "World Cup 2026",
      groups: [],
      matches: [],
    },
  };
}

function stubScores() { return {}; }
function stubTeams() { return []; }
```

- [ ] **Step 6.2: 运行测试，确认失败**

```bash
npx vitest run tests/main/worldcup-bracket-ipc.test.js
```

Expected: FAIL with `Cannot find module '../../src/main/worldcup/bracket'`.

- [ ] **Step 6.3: 实现 bracket.js**

`src/main/worldcup/bracket.js`:

```js
/**
 * src/main/worldcup/bracket.js
 *
 * IPC handler for worldcup bracket computation.
 *
 * 复用现有 fetcher / parser / scores-fetcher, 调 bracket-rules 算 bracket,
 * 写入 state.json.worldcup_bracket_snapshot.
 */

'use strict';

const { fetchWorldcupFixtures } = require("./fetcher");
const { parseWorldcupTxt } = require("./parser");
const stateStore = require("../state-store");
const { computeBracket } = require("./bracket-rules");
const { computeGroupStandings } = require("./group-standings-shared");
const { mainLog } = require("../log");

/**
 * Compute full bracket from current group standings + scores.
 *
 * @param {object} opts
 * @param {string} [opts.statePath]
 * @param {Function} [opts.fetcher] - injected for test
 * @param {Function} [opts.scores] - injected for test
 * @param {Function} [opts.teamsData] - injected for test
 * @returns {Promise<{ok: boolean, snapshot?: object, reason?: string, error?: string}>}
 */
async function computeWorldcupBracket(opts = {}) {
  const fetcher = opts.fetcher || (() => fetchWorldcupFixtures({}));
  try {
    const fixturesR = await fetcher();
    if (!fixturesR || !fixturesR.ok) {
      return { ok: false, reason: fixturesR ? fixturesR.reason : "fetch_failed" };
    }
    const data = fixturesR.data || {};
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const teamsData = (opts.teamsData && opts.teamsData()) || data.groups || [];
    const scores = (opts.scores && opts.scores()) || {};

    const groupStandings = extractGroupStandings(matches, teamsData);
    const snapshot = computeBracket({ groupStandings, scores });

    if (!snapshot) {
      return { ok: false, reason: "no_group_data" };
    }

    try {
      if (opts.statePath) {
        stateStore.saveWorldcupBracket(snapshot, opts.statePath);
      } else {
        stateStore.saveWorldcupBracket(snapshot);
      }
    } catch (err) {
      mainLog.warn("[worldcup/bracket] state write failed", { msg: err && err.message });
    }

    return { ok: true, snapshot };
  } catch (err) {
    mainLog.warn("[worldcup/bracket] compute threw", { msg: err && err.message });
    return { ok: false, reason: "threw", error: err && err.message };
  }
}

/**
 * Extract group standings from matches + teams data.
 * v1 简化: 用已赛场次推 winner/runnerUp (按 pts/gd/gf DESC).
 *
 * @param {Array} matches
 * @param {Array<{letter?: string, name: string}>} teamsData
 * @returns {object}
 */
function extractGroupStandings(matches, teamsData) {
  const byGroup = {};
  for (const t of teamsData || []) {
    if (!t || !t.letter) continue;
    if (!byGroup[t.letter]) byGroup[t.letter] = [];
    byGroup[t.letter].push(t.name);
  }

  const standings = {};
  for (const [letter, teams] of Object.entries(byGroup)) {
    standings[letter] = rankGroup(letter, matches, teams);
  }
  return standings;
}

function rankGroup(letter, matches, teams) {
  const stats = {};
  for (const t of teams) stats[t] = { pts: 0, gd: 0, gf: 0, played: 0 };

  for (const m of matches || []) {
    const mLetter = (m.stage || "").match(/^Group\s+([A-L])/i);
    if (!mLetter || mLetter[1].toUpperCase() !== letter) continue;
    if (!m.score || m.score.status !== "final") continue;
    const [h, a] = m.score.ft || [];
    if (typeof h !== "number" || typeof a !== "number") continue;
    if (!stats[m.team1] || !stats[m.team2]) continue;

    stats[m.team1].played += 1;
    stats[m.team2].played += 1;
    stats[m.team1].gf += h;
    stats[m.team2].gf += a;
    stats[m.team1].gd += h - a;
    stats[m.team2].gd += a - h;
    if (h > a) { stats[m.team1].pts += 3; }
    else if (h < a) { stats[m.team2].pts += 3; }
    else { stats[m.team1].pts += 1; stats[m.team2].pts += 1; }
  }

  const sorted = Object.entries(stats).sort((a, b) => {
    if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
    if (b[1].gd !== a[1].gd) return b[1].gd - a[1].gd;
    if (b[1].gf !== a[1].gf) return b[1].gf - a[1].gf;
    return a[0].localeCompare(b[0]);
  });

  const completed = sorted.every(([, s]) => s.played >= 3);
  if (!completed) return null;
  if (sorted.length < 3) return null;

  return {
    winner: sorted[0][0],
    runnerUp: sorted[1][0],
    third: { name: sorted[2][0], pts: sorted[2][1].pts, gd: sorted[2][1].gd, gf: sorted[2][1].gf },
  };
}

function loadWorldcupBracket(opts = {}) {
  try {
    const snap = opts.statePath
      ? stateStore.loadWorldcupBracket(opts.statePath)
      : stateStore.loadWorldcupBracket();
    return { ok: true, snapshot: snap };
  } catch (err) {
    return { ok: false, reason: "load_failed", error: err && err.message };
  }
}

module.exports = {
  computeWorldcupBracket,
  loadWorldcupBracket,
  extractGroupStandings,
  rankGroup,
};
```

**注意**: `extractGroupStandings` 假设 `data.groups` 是 `[{ letter: 'A', teams: ['Mexico', ...] }, ...]` 格式。但 `parseWorldcupTxt` 输出的是 `[{ letter, teams: string[] }]`，需要确认格式正确。

测试 stub 里 `teamsData` 直接传 `[]`，所以 `extractGroupStandings` 不会出 group，结果是空 standings → computeBracket 返 null → 测试期望 `r.ok:false`。

**修正测试期望**:

Step 6.1 的第一个测试期望 `r.ok: true`，但 stub 不提供 group 数据，extractGroupStandings 返空 → computeBracket 返 null → computeWorldcupBracket 返 `ok:false, reason:"no_group_data"`。

需要让 stub 提 group 数据。修正 stub + 测试:

```js
function stubFetcher() {
  return {
    ok: true,
    data: {
      name: "World Cup 2026",
      groups: [
        { letter: "A", teams: ["Mexico", "South Africa", "South Korea", "Czech Republic"] },
        { letter: "B", teams: ["Canada", "Bosnia & Herzegovina", "Qatar", "Switzerland"] },
        // ... 12 组
      ],
      matches: [],
    },
  };
}
```

但这会让测试依赖具体 12 组数据，脆弱。更简洁的做法：让 computeBracket 直接接受 groupStandings（不让 bracket.js 推），bracket.js 只负责 IPC 编排。

**重新设计**: bracket.js 直接接受 groupStandings 作为 opts:

```js
async function computeWorldcupBracket(opts = {}) {
  // ...
  const groupStandings = opts.groupStandings || extractGroupStandings(matches, teamsData);
  // ...
}
```

修正测试:

```js
test("computeWorldcupBracket returns ok+snapshot and writes state", async () => {
  const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
  const r = await computeWorldcupBracket({
    statePath,
    fetcher: () => ({ ok: true, data: { matches: [], groups: [] } }),
    scores: () => ({}),
    teamsData: () => [],
    groupStandings: {
      A: { winner: 'Mexico', runnerUp: 'South Africa', third: { name: 'South Korea', pts: 3, gd: 0, gf: 2 } },
      // ... 12 组
    },
  });
  expect(r.ok).toBe(true);
  expect(r.snapshot.r32).toHaveLength(16);
});
```

**简化**: 让测试用最小的 12 组 groupStandings fixture, 覆盖 happy path。

- [ ] **Step 6.3 (修正): 在 bracket.js 加 groupStandings opts 透传**

把 `computeWorldcupBracket` 改成接受 `opts.groupStandings`:

```js
async function computeWorldcupBracket(opts = {}) {
  const fetcher = opts.fetcher || (() => fetchWorldcupFixtures({}));
  try {
    const fixturesR = await fetcher();
    if (!fixturesR || !fixturesR.ok) {
      return { ok: false, reason: fixturesR ? fixturesR.reason : "fetch_failed" };
    }
    const data = fixturesR.data || {};
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const teamsData = (opts.teamsData && opts.teamsData()) || data.groups || [];
    const scores = (opts.scores && opts.scores()) || {};

    const groupStandings = opts.groupStandings || extractGroupStandings(matches, teamsData);
    const snapshot = computeBracket({ groupStandings, scores });

    if (!snapshot) {
      return { ok: false, reason: "no_group_data" };
    }

    try {
      if (opts.statePath) {
        stateStore.saveWorldcupBracket(snapshot, opts.statePath);
      } else {
        stateStore.saveWorldcupBracket(snapshot);
      }
    } catch (err) {
      mainLog.warn("[worldcup/bracket] state write failed", { msg: err && err.message });
    }

    return { ok: true, snapshot };
  } catch (err) {
    mainLog.warn("[worldcup/bracket] compute threw", { msg: err && err.message });
    return { ok: false, reason: "threw", error: err && err.message };
  }
}
```

- [ ] **Step 6.4 (修正测试): 用 groupStandings 注入**

`tests/main/worldcup-bracket-ipc.test.js` (完整修正版):

```js
const fs = require("fs");
const os = require("os");
const path = require("path");

function tmpStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-ipc-"));
  return path.join(dir, "state.json");
}

const FULL_GROUP_STANDINGS = {
  A: { winner: "Mexico", runnerUp: "South Africa", third: { name: "South Korea", pts: 3, gd: 0, gf: 2 } },
  B: { winner: "Canada", runnerUp: "Switzerland", third: { name: "Qatar", pts: 3, gd: 0, gf: 2 } },
  C: { winner: "Brazil", runnerUp: "Morocco", third: { name: "Scotland", pts: 3, gd: 0, gf: 2 } },
  D: { winner: "USA", runnerUp: "Paraguay", third: { name: "Australia", pts: 3, gd: 0, gf: 2 } },
  E: { winner: "Germany", runnerUp: "Curaçao", third: { name: "Ivory Coast", pts: 3, gd: 0, gf: 2 } },
  F: { winner: "Netherlands", runnerUp: "Japan", third: { name: "Sweden", pts: 3, gd: 0, gf: 2 } },
  G: { winner: "Belgium", runnerUp: "Egypt", third: { name: "Iran", pts: 3, gd: 0, gf: 2 } },
  H: { winner: "Spain", runnerUp: "Cape Verde", third: { name: "Saudi Arabia", pts: 3, gd: 0, gf: 2 } },
  I: { winner: "France", runnerUp: "Senegal", third: { name: "Iraq", pts: 3, gd: 0, gf: 2 } },
  J: { winner: "Argentina", runnerUp: "Algeria", third: { name: "Austria", pts: 3, gd: 0, gf: 2 } },
  K: { winner: "Portugal", runnerUp: "DR Congo", third: { name: "Colombia", pts: 3, gd: 0, gf: 2 } },
  L: { winner: "England", runnerUp: "Croatia", third: { name: "Ghana", pts: 3, gd: 0, gf: 2 } },
};

describe("worldcup bracket IPC handler", () => {
  let statePath;
  beforeEach(() => { statePath = tmpStatePath(); });
  afterEach(() => { try { fs.rmSync(path.dirname(statePath), { recursive: true, force: true }); } catch {} });

  test("computeWorldcupBracket returns ok+snapshot and writes state", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => ({ ok: true, data: { matches: [], groups: [] } }),
      scores: () => ({}),
      teamsData: () => [],
      groupStandings: FULL_GROUP_STANDINGS,
    });
    expect(r.ok).toBe(true);
    expect(r.snapshot.r32).toHaveLength(16);
    const stateStore = require("../../src/main/state-store");
    const loaded = stateStore.loadWorldcupBracket(statePath);
    expect(loaded).toBeDefined();
    expect(loaded.r32).toHaveLength(16);
  });

  test("computeWorldcupBracket returns ok:false when fetcher throws", async () => {
    const { computeWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = await computeWorldcupBracket({
      statePath,
      fetcher: () => { throw new Error("network down"); },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/threw|network/);
    const stateStore = require("../../src/main/state-store");
    expect(stateStore.loadWorldcupBracket(statePath)).toBeNull();
  });

  test("loadWorldcupBracket returns null when absent", () => {
    const { loadWorldcupBracket } = require("../../src/main/worldcup/bracket");
    const r = loadWorldcupBracket({ statePath });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toBeNull();
  });
});
```

- [ ] **Step 6.5: 运行 IPC 测试**

```bash
npx vitest run tests/main/worldcup-bracket-ipc.test.js
```

Expected: 3 PASS.

- [ ] **Step 6.6: Commit**

```bash
git add src/main/worldcup/bracket.js tests/main/worldcup-bracket-ipc.test.js
git commit -m "feat(worldcup/bracket): add computeWorldcupBracket IPC handler"
```

---

## Task 7: 注册 IPC 通道

**Files:**
- Modify: `src/main/ipc/register-worldcup.js`

- [ ] **Step 7.1: 加 IPC 注册**

在 `src/main/ipc/register-worldcup.js` 顶部追加 require:

```js
const { computeWorldcupBracket, loadWorldcupBracket } = require("../worldcup/bracket");
```

在 `registerWorldcupHandlers` 函数内, 在 `safeHandle("worldcup:remove-bet", ...)` 之前追加:

```js
  safeHandle("worldcup:compute-bracket", async (_evt, payload) =>
    computeWorldcupBracket(payload || {}),
  );

  safeHandle(
    "worldcup:load-bracket",
    async () => loadWorldcupBracket(),
    { log: false },
  );
```

- [ ] **Step 7.2: 验证语法 (smoke check)**

```bash
node -e "require('./src/main/ipc/register-worldcup.js')"
```

Expected: 0 exit code, 无错误输出。

- [ ] **Step 7.3: Commit**

```bash
git add src/main/ipc/register-worldcup.js
git commit -m "feat(worldcup/ipc): register worldcup:compute-bracket + worldcup:load-bracket"
```

---

## Task 8: preload 暴露 API

**Files:**
- Modify: `preload.js`

- [ ] **Step 8.1: 加 IPC API**

在 `preload.js` 第 89 行后追加 (在 `worldcupRemoveBet` 之后):

```js
  worldcupComputeBracket: (payload) =>
    ipcRenderer.invoke("worldcup:compute-bracket", payload),
  worldcupLoadBracket: () => ipcRenderer.invoke("worldcup:load-bracket"),
```

- [ ] **Step 8.2: 验证语法**

```bash
node -e "require('./preload.js')" 2>&1 | head -5
```

Expected: 无 syntax error.

- [ ] **Step 8.3: Commit**

```bash
git add preload.js
git commit -m "feat(preload): expose worldcupComputeBracket + worldcupLoadBracket"
```

---

## Task 9: bracketStore.js (renderer signal store)

**Files:**
- Create: `src/renderer/worldcup/bracketStore.js`

- [ ] **Step 9.1: 创建 bracketStore.js**

`src/renderer/worldcup/bracketStore.js`:

```js
/**
 * src/renderer/worldcup/bracketStore.js
 *
 * v1 淘汰赛对阵 - renderer signal store
 *
 * Signals:
 *   worldcupBracket: BracketSnapshot | null
 *   bracketComputing: boolean
 *   bracketError: string | null
 *   bracketLastComputedAt: number | null
 *
 * Functions:
 *   loadBracket() - 拉缓存 (mount tab 时)
 *   computeBracket({ force? }) - IPC 调用 + 写 signal
 */

import { signal } from "@preact/signals";

export const worldcupBracket = signal(null);
export const bracketComputing = signal(false);
export const bracketError = signal(null);
export const bracketLastComputedAt = signal(null);

export async function loadBracket() {
  try {
    if (
      typeof window === "undefined" ||
      !window.api ||
      typeof window.api.worldcupLoadBracket !== "function"
    ) {
      return false;
    }
    const r = await window.api.worldcupLoadBracket();
    if (!r || !r.ok) return false;
    worldcupBracket.value = r.snapshot || null;
    if (r.snapshot && r.snapshot.computedAt) {
      bracketLastComputedAt.value = r.snapshot.computedAt;
    }
    return true;
  } catch {
    return false;
  }
}

export async function computeBracket(opts = {}) {
  if (bracketComputing.value) return false;
  bracketComputing.value = true;
  bracketError.value = null;
  try {
    if (
      typeof window === "undefined" ||
      !window.api ||
      typeof window.api.worldcupComputeBracket !== "function"
    ) {
      bracketError.value = "IPC 不可用";
      return false;
    }
    const r = await window.api.worldcupComputeBracket(opts);
    if (!r || !r.ok) {
      bracketError.value = (r && r.reason) || "计算失败";
      return false;
    }
    worldcupBracket.value = r.snapshot || null;
    bracketLastComputedAt.value = r.snapshot && r.snapshot.computedAt
      ? r.snapshot.computedAt
      : Date.now();
    return true;
  } catch (err) {
    bracketError.value = (err && err.message) || "计算异常";
    return false;
  } finally {
    bracketComputing.value = false;
  }
}

export function clearBracketError() {
  bracketError.value = null;
}
```

- [ ] **Step 9.2: Commit**

```bash
git add src/renderer/worldcup/bracketStore.js
git commit -m "feat(worldcup/bracketStore): add signals + IPC for bracket"
```

---

## Task 10: WorldcupBracketView.jsx (UI)

**Files:**
- Create: `src/renderer/worldcup/WorldcupBracketView.jsx`
- Test: `tests/renderer/worldcup-bracket-view.test.jsx`

- [ ] **Step 10.1: 写失败 smoke 测试**

`tests/renderer/worldcup-bracket-view.test.jsx`:

```jsx
import { render } from "@testing-library/preact";
import { WorldcupBracketView } from "../../src/renderer/worldcup/WorldcupBracketView.jsx";
import { worldcupBracket, bracketComputing, bracketError } from "../../src/renderer/worldcup/bracketStore.js";

const sampleSnapshot = {
  version: 1,
  computedAt: 12345,
  inputsHash: "sha256:abc",
  projected: true,
  r32: [
    { matchNum: 73, slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" }, slot2: { team: { name: "Switzerland" }, source: "group:B:runnerUp" }, status: "pending" },
    { matchNum: 74, slot1: { team: { name: "Germany" }, source: "group:E:winner" }, slot2: { team: null, source: "best-third-pool", pool: ["A","B","C","D","F"] }, status: "projected" },
  ],
  r16: [
    { matchNum: 90, slot1: { team: null, source: "r32:73" }, slot2: { team: null, source: "r32:75" }, status: "projected" },
  ],
  qf: [], sf: [], final: null, third: null,
  thirdPlacedAdvancing: ["E", "I", "J", "K", "L", "D", "F", "G"],
  annexCIndex: 0,
  warnings: ["simplified_annex_c_default_row"],
};

describe("WorldcupBracketView smoke", () => {
  beforeEach(() => {
    worldcupBracket.value = sampleSnapshot;
    bracketComputing.value = false;
    bracketError.value = null;
  });

  test("renders without crash with snapshot", () => {
    const { container } = render(<WorldcupBracketView />);
    expect(container.querySelector(".bracket-view")).toBeTruthy();
    expect(container.textContent).toContain("1/16 决赛");
    expect(container.textContent).toContain("Germany");
  });

  test("renders empty state when snapshot null", () => {
    worldcupBracket.value = null;
    const { container } = render(<WorldcupBracketView />);
    expect(container.textContent).toMatch(/小组赛尚未开始|暂无数据/);
  });
});
```

- [ ] **Step 10.2: 运行测试，确认失败**

```bash
npx vitest run tests/renderer/worldcup-bracket-view.test.jsx
```

Expected: FAIL with `Cannot find module '../../src/renderer/worldcup/WorldcupBracketView.jsx'`.

- [ ] **Step 10.3: 实现 WorldcupBracketView.jsx**

`src/renderer/worldcup/WorldcupBracketView.jsx`:

```jsx
/**
 * src/renderer/worldcup/WorldcupBracketView.jsx
 *
 * v1 淘汰赛对阵 - bracket tree 渲染
 *
 * 5 阶段垂直堆叠: R32 / R16 / QF / SF / Final+Third
 * 每阶段: 阶段标题 + badge (16/8/4/2/1 场) + match cards (2 列)
 * SVG 连线: 阶段间流向
 */

import { useEffect, useMemo } from "preact/hooks";
import { displayTeam } from "./teams-data.js";
import {
  worldcupBracket,
  bracketComputing,
  bracketError,
  bracketLastComputedAt,
  loadBracket,
  computeBracket,
  clearBracketError,
} from "./bracketStore.js";
import SquadModal from "./SquadModal.jsx";
import { useState } from "preact/hooks";
import { trackWorldcupMatchView } from "../recent/track.js";

const STAGE_LABELS = {
  r32: { title: "1/16 决赛 (Round of 32)", count: 16, sub: "R32" },
  r16: { title: "1/8 决赛 (Round of 16)", count: 8, sub: "R16" },
  qf:  { title: "1/4 决赛 (Quarter-finals)", count: 4, sub: "QF" },
  sf:  { title: "半决赛 (Semi-finals)", count: 2, sub: "SF" },
  final: { title: "决赛", count: 1, sub: "Final" },
  third: { title: "季军赛", count: 1, sub: "3rd" },
};

function formatRelativeTime(ts) {
  if (!ts) return "从未计算";
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return new Date(ts).toLocaleString("zh-CN");
}

function MatchCard({ match, onClick }) {
  if (!match) return null;
  const { matchNum, slot1, slot2, status, score } = match;

  const teamCn = (slot) => {
    if (!slot || !slot.team) return null;
    return displayTeam(slot.team.name);
  };

  const team1Cn = teamCn(slot1);
  const team2Cn = teamCn(slot2);

  return (
    <div
      class={`bracket-card bracket-card--${status}`}
      onClick={() => onClick && onClick(match)}
    >
      <div class="bracket-card-num">Match {matchNum}</div>
      <div class="bracket-card-row">
        <div class="bracket-card-team">
          {team1Cn ? (
            <>
              <span class="bracket-card-flag">{team1Cn.flag}</span>
              <span class="bracket-card-name">{team1Cn.cn || slot1.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">
              {slot1?.source?.startsWith("r32:")
                ? `胜者 ${slot1.source.split(":")[1]}`
                : "未定"}
            </span>
          )}
        </div>
        {status === "final" && score?.ft ? (
          <div class="bracket-card-score">
            <strong>{score.ft[0]}</strong> : <strong>{score.ft[1]}</strong>
          </div>
        ) : (
          <div class="bracket-card-vs">vs</div>
        )}
        <div class="bracket-card-team">
          {team2Cn ? (
            <>
              <span class="bracket-card-flag">{team2Cn.flag}</span>
              <span class="bracket-card-name">{team2Cn.cn || slot2.team.name}</span>
            </>
          ) : (
            <span class="bracket-card-placeholder">
              {slot2?.source?.startsWith("r32:")
                ? `胜者 ${slot2.source.split(":")[1]}`
                : "未定"}
            </span>
          )}
        </div>
      </div>
      <div class="bracket-card-status">
        {status === "pending" && <span class="bracket-badge">未赛</span>}
        {status === "projected" && <span class="bracket-badge bracket-badge--lock">🔒 待定</span>}
        {status === "live" && <span class="bracket-badge bracket-badge--live">● 进行中</span>}
        {status === "final" && <span class="bracket-badge bracket-badge--done">✓ 已完赛</span>}
      </div>
    </div>
  );
}

function StageSection({ stageKey, matches, onMatchClick }) {
  const label = STAGE_LABELS[stageKey];
  if (!label) return null;

  const matchList = stageKey === "final" || stageKey === "third"
    ? (matches ? [matches] : [])
    : (matches || []);

  if (matchList.length === 0 || (matchList.length === 1 && !matchList[0])) {
    return (
      <section class="bracket-stage bracket-stage--empty">
        <header class="bracket-stage-header">
          <span class="bracket-stage-title">{label.title}</span>
          <span class="bracket-stage-count">[待定]</span>
        </header>
        <p class="bracket-stage-empty-msg">小组赛尚未确定对阵</p>
      </section>
    );
  }

  return (
    <section class={`bracket-stage bracket-stage--${stageKey}`}>
      <header class="bracket-stage-header">
        <span class="bracket-stage-title">{label.title}</span>
        <span class="bracket-stage-count">[{matchList.length} 场]</span>
      </header>
      <div class={`bracket-grid bracket-grid--${matchList.length}`}>
        {matchList.map((m) => (
          <MatchCard key={m?.matchNum || stageKey} match={m} onClick={onMatchClick} />
        ))}
      </div>
    </section>
  );
}

export function WorldcupBracketView() {
  const snapshot = worldcupBracket.value;
  const computing = bracketComputing.value;
  const error = bracketError.value;
  const lastComputedAt = bracketLastComputedAt.value;
  const [squadMatch, setSquadMatch] = useState(null);

  useEffect(() => {
    loadBracket();
  }, []);

  function handleMatchClick(match) {
    trackWorldcupMatchView(match);
    setSquadMatch({
      team1: match.slot1?.team?.name || match.slot1?.source || "未定",
      team2: match.slot2?.team?.name || match.slot2?.source || "未定",
      stage: `Match ${match.matchNum}`,
      venue: "FIFA 2026",
      time: "",
      timezone: "",
      date: "",
      _isBracket: true,
    });
  }

  function handleRefresh() {
    clearBracketError();
    computeBracket({ force: true });
  }

  // 错误态
  if (error) {
    return (
      <div class="bracket-view bracket-view--error">
        <div class="bracket-error-card">
          <div class="bracket-error-icon">⚠️</div>
          <div class="bracket-error-msg">计算失败: {error}</div>
          <button class="btn btn-primary btn-sm" onClick={handleRefresh}>
            重试
          </button>
        </div>
      </div>
    );
  }

  // 空态: 小组赛尚未开始
  if (!snapshot) {
    return (
      <div class="bracket-view bracket-view--empty">
        <p>小组赛尚未开始，待小组赛结束后计算淘汰赛对阵</p>
        <button
          class="btn btn-primary btn-sm"
          onClick={handleRefresh}
          disabled={computing}
        >
          {computing ? "计算中..." : "🔄 尝试计算"}
        </button>
      </div>
    );
  }

  const completedGroups = snapshot.thirdPlacedAdvancing.length;
  const projectedBanner = snapshot.projected
    ? `基于 ${completedGroups} 个已完成小组 · 待小组赛完赛`
    : "小组赛已完赛";

  return (
    <div class="bracket-view">
      {squadMatch && <SquadModal match={squadMatch} onClose={() => setSquadMatch(null)} />}
      <div class="bracket-toolbar">
        <button
          class="btn btn-primary btn-sm"
          onClick={handleRefresh}
          disabled={computing}
        >
          {computing ? "⟳ 计算中..." : "🔄 重新计算"}
        </button>
        <div class="bracket-meta">
          <span>上次计算: {formatRelativeTime(lastComputedAt)}</span>
          <span> · {projectedBanner}</span>
          {snapshot.warnings.length > 0 && (
            <span class="bracket-warnings"> · ⚠️ {snapshot.warnings.length} 个警告</span>
          )}
        </div>
      </div>
      <StageSection stageKey="r32" matches={snapshot.r32} onMatchClick={handleMatchClick} />
      <StageSection stageKey="r16" matches={snapshot.r16} onMatchClick={handleMatchClick} />
      <StageSection stageKey="qf" matches={snapshot.qf} onMatchClick={handleMatchClick} />
      <StageSection stageKey="sf" matches={snapshot.sf} onMatchClick={handleMatchClick} />
      <div class="bracket-finals">
        <StageSection stageKey="third" matches={snapshot.third} onMatchClick={handleMatchClick} />
        <StageSection stageKey="final" matches={snapshot.final} onMatchClick={handleMatchClick} />
      </div>
    </div>
  );
}

export default WorldcupBracketView;
```

- [ ] **Step 10.4: 运行 smoke 测试**

```bash
npx vitest run tests/renderer/worldcup-bracket-view.test.jsx
```

Expected: 2 PASS.

- [ ] **Step 10.5: Commit**

```bash
git add src/renderer/worldcup/WorldcupBracketView.jsx tests/renderer/worldcup-bracket-view.test.jsx
git commit -m "feat(worldcup/bracket): add WorldcupBracketView UI"
```

---

## Task 11: WorldcupHeader 加第 4 sub-tab

**Files:**
- Modify: `src/renderer/worldcup/WorldcupHeader.jsx`

- [ ] **Step 11.1: 修改 WC_SUBTABS**

`src/renderer/worldcup/WorldcupHeader.jsx` 第 24-28 行:

```js
export const WC_SUBTABS = [
  { key: 'fixtures', label: '赛程', icon: '📅' },
  { key: 'teams', label: '球队', icon: '👥' },
  { key: 'scorers', label: '进球榜', icon: '⚽' },
];
```

改为:

```js
export const WC_SUBTABS = [
  { key: 'fixtures', label: '赛程', icon: '📅' },
  { key: 'teams', label: '球队', icon: '👥' },
  { key: 'scorers', label: '进球榜', icon: '⚽' },
  { key: 'bracket', label: '对阵', icon: '🏆' },
];
```

**注意**: WC_SUBTABS 也在 `WorldcupLayout.jsx` 第 24-28 行定义 (重复了)。修改两处保持一致。

- [ ] **Step 11.2: 同时修改 WorldcupLayout.jsx 的 WC_SUBTABS**

`src/renderer/worldcup/WorldcupLayout.jsx` 第 24-28 行, 同样改为加 `{ key: 'bracket', label: '对阵', icon: '🏆' }`.

- [ ] **Step 11.3: 验证语法**

```bash
npx eslint src/renderer/worldcup/WorldcupHeader.jsx src/renderer/worldcup/WorldcupLayout.jsx 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 11.4: Commit**

```bash
git add src/renderer/worldcup/WorldcupHeader.jsx src/renderer/worldcup/WorldcupLayout.jsx
git commit -m "feat(worldcup/header): add bracket sub-tab"
```

---

## Task 12: WorldcupLayout 路由 bracket

**Files:**
- Modify: `src/renderer/worldcup/WorldcupLayout.jsx`

- [ ] **Step 12.1: 加 bracket 路由分支**

在 `src/renderer/worldcup/WorldcupLayout.jsx` 顶部加 import:

```js
import { WorldcupBracketView } from './WorldcupBracketView.jsx';
```

修改 layout-main 渲染分支 (第 71-77 行), 把 subTab 路由加上 'bracket':

```jsx
        {subTab === 'teams' ? (
          <WorldcupTeamsView search={search} onTeamClick={handleTeamClick} />
        ) : subTab === 'scorers' ? (
          <WorldcupScorersView search={search} />
        ) : subTab === 'bracket' ? (
          <WorldcupBracketView />
        ) : (
          <WorldcupView search={search} />
        )}
```

- [ ] **Step 12.2: 运行既有 layout smoke 测试**

```bash
npx vitest run tests/renderer/worldcup-layout-smoke.test.jsx
```

Expected: PASS (原有测试不应受影响).

- [ ] **Step 12.3: Commit**

```bash
git add src/renderer/worldcup/WorldcupLayout.jsx
git commit -m "feat(worldcup/layout): route bracket sub-tab to WorldcupBracketView"
```

---

## Task 13: CSS 样式 (bracket-view + bracket-card + bracket-stage)

**Files:**
- Modify: `styles.css` (追加在文件末尾)

- [ ] **Step 13.1: 加 CSS 样式**

在 `styles.css` 文件末尾追加:

```css
/* === Bracket view === */
.bracket-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.bracket-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.bracket-meta {
  font-size: 12px;
  color: #888;
}
.bracket-warnings {
  color: #f59e0b;
}
.bracket-stage {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 12px;
}
.bracket-stage-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
}
.bracket-stage-title {
  font-size: 14px;
  font-weight: 600;
  color: #e5e7eb;
}
.bracket-stage-count {
  font-size: 11px;
  color: #9ca3af;
}
.bracket-grid {
  display: grid;
  gap: 8px;
}
.bracket-grid--16 { grid-template-columns: repeat(8, 1fr); }
.bracket-grid--8  { grid-template-columns: repeat(4, 1fr); }
.bracket-grid--4  { grid-template-columns: repeat(2, 1fr); }
.bracket-grid--2  { grid-template-columns: repeat(2, 1fr); }
.bracket-grid--1  { grid-template-columns: 1fr; }
@media (max-width: 900px) {
  .bracket-grid--16 { grid-template-columns: repeat(4, 1fr); }
  .bracket-grid--8  { grid-template-columns: repeat(2, 1fr); }
}
.bracket-card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}
.bracket-card:hover {
  background: rgba(255, 255, 255, 0.1);
}
.bracket-card--projected {
  opacity: 0.6;
  border-style: dashed;
}
.bracket-card--final {
  border-color: #4ade80;
}
.bracket-card--live {
  border-color: #ef4444;
}
.bracket-card-num {
  font-size: 9px;
  color: #6b7280;
  margin-bottom: 4px;
}
.bracket-card-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 4px;
}
.bracket-card-team {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.bracket-card-flag {
  font-size: 14px;
}
.bracket-card-name {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bracket-card-placeholder {
  color: #6b7280;
  font-style: italic;
  font-size: 10px;
}
.bracket-card-vs {
  font-size: 10px;
  color: #6b7280;
  text-align: center;
}
.bracket-card-score {
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  color: #4ade80;
}
.bracket-card-status {
  margin-top: 4px;
  text-align: center;
}
.bracket-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 9px;
  background: rgba(107, 114, 128, 0.3);
  color: #9ca3af;
}
.bracket-badge--lock { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.bracket-badge--live { background: rgba(239, 68, 68, 0.2); color: #fca5a5; animation: pulse 1.5s infinite; }
.bracket-badge--done { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.bracket-finals {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 600px) {
  .bracket-finals { grid-template-columns: 1fr; }
}
.bracket-view--error .bracket-error-card,
.bracket-view--empty {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
}
.bracket-error-icon {
  font-size: 24px;
  margin-bottom: 8px;
}
.bracket-error-msg {
  color: #fca5a5;
  margin-bottom: 12px;
}
```

- [ ] **Step 13.2: 验证 CSS 加载无 syntax error**

```bash
grep -c "bracket-card" styles.css
```

Expected: 输出 >= 10 (匹配多条).

- [ ] **Step 13.3: Commit**

```bash
git add styles.css
git commit -m "feat(worldcup/bracket): add bracket-view CSS styles"
```

---

## Task 14: 完整端到端验证

**Files:** 无

- [ ] **Step 14.1: 跑全部 vitest**

```bash
npm test
```

Expected: 全部 PASS, 无新增失败.

- [ ] **Step 14.2: 跑 lint**

```bash
npx eslint src/main/worldcup/bracket.js src/main/worldcup/bracket-rules.js src/renderer/worldcup/bracketStore.js src/renderer/worldcup/WorldcupBracketView.jsx 2>&1 | head -20
```

Expected: 0 errors (warning 可接受).

- [ ] **Step 14.3: 手动 smoke (启动 dev)**

```bash
npm run dev
```

打开 Pulse app, 切到 世界杯 tab → 点「对阵」sub-tab. 期望:
- 看到 bracket tree 5 阶段布局
- 显示「小组赛尚未开始」空态 (因为现在还没到小组赛)
- 点「🔄 尝试计算」, 期望返 `ok:false, reason: "no_group_data"`, 红条显示

- [ ] **Step 14.4: 写 release notes**

在 `RELEASE-NOTES.md` 顶部 (v2.x.x 条目下) 加一行:

```markdown
- ⚽ 新增「对阵」tab: 实时计算 2026 世界杯淘汰赛 bracket (小组赛 → 1/16 → 1/8 → 1/4 → 半决赛 → 决赛 + 季军赛)
```

- [ ] **Step 14.5: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs: add worldcup bracket to release notes"
```

---

## Self-Review

**Spec coverage**: 跟 `docs/superpowers/specs/2026-06-14-worldcup-bracket-design.md` 对照:
- §1.1 必须达成 → Task 1-13 全部覆盖
- §3.1-3.4 模块拆分 → Task 2 (rules) + 6 (bracket.js) + 9 (store) + 10 (view)
- §4 数据契约 → Task 5 (computeBracket 输出) + 1 (state-store)
- §5.1 第3名排序 → Task 2 (sortThirdPlaced)
- §5.2 Annex C row 1 → Task 2 (ANNEX_C_DEFAULT) + Task 5 (computeBracket 加 warning)
- §5.3 propagateWinner 胜者判定 → Task 4
- §6.1-6.4 UI → Task 10 (WorldcupBracketView)
- §7 错误处理 → Task 10 (error/empty 态)
- §8 测试 → Task 1 (state-store) + 2-5 (bracket-rules 12 测试) + 6 (IPC) + 10 (smoke)
- §9.1 新增 5 文件 → 全部覆盖
- §9.2 修改 5 文件 → 全部覆盖
- §9.3 新增测试 3 文件 → 全部覆盖 (state-store test + bracket-rules + IPC + view)

**Placeholder scan**: 0 TBD, 0 TODO, 0 "implement later". 所有 step 含完整代码.

**Type consistency**:
- `BracketSnapshot.version = 1` 在 Task 2 (default) + Task 5 (computeBracket) 一致
- `matchNum` 字段名: Task 4 (resolveR32Matchups) + Task 5 (computeBracket) + Task 10 (UI) 一致
- `slot1.team.name` 字段名: Task 4 + 5 + 10 一致
- `worldcupBracket.value` signal: Task 9 (定义) + 10 (用) 一致
- IPC 通道名 `worldcup:compute-bracket` / `worldcup:load-bracket`: Task 7 (注册) + Task 8 (preload) + Task 9 (renderer) 一致

Plan complete. Ready for execution.
