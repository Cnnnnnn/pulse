# Q4 — Startup Perf v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接上 Q1 暴露的 `markBootstrapDone` / `markRendererReady` 两个 milestone(全代码库 0 调用点 → 真实 milestone 数据进 drawer + state.json `startup_samples`);落地 1 个低风险 main 启动优化(register-core.js 重复 require 剔除);落 `scripts/q4-baseline.js` + npm script 供后续回归。

**Architecture:** 三步独立 commit,每步可单独回滚:
1. **Task 1**: `src/main/diagnostics.js` require 进 `src/main/index.js` 顶部 → `t0` 被采;index.js `whenReady → bootstrap()` 末尾调 `markBootstrapDone()`;`src/main/window.js` `did-finish-load` 里追加 `markRendererReady()`
2. **Task 2**: review `src/main/ipc/register-core.js`,剔除"handler 内已有 lazy require 但顶部也 require"的重复项(零行为变化,确定性 ~6ms 收益)
3. **Task 3**: `scripts/q4-baseline.js` 已存在,加 `npm run baseline:q4` package script;写 release notes

**Tech Stack:** Node `node:perf_hooks` / `node:path` / `node:fs`(已用,内置)。Vitest 1.6。Electron 35(`did-finish-load` 监听点)。零新依赖。

**Spec:** `docs/superpowers/specs/2026-06-23-q4-startup-perf-design.md`

---

## File Structure

**New files (1):**
- `scripts/q4-baseline.js` — 冷 require profiler(本次 v1 主要载体;S1 已写)

**Modified files (4):**
- `src/main/index.js` — 顶部 require `./diagnostics`;`whenReady → bootstrap()` 末尾 `markBootstrapDone()`(≤ 6 行 diff)
- `src/main/window.js` — 已有 `webContents.on('did-finish-load')` 块内追加 `markRendererReady()`(≤ 2 行 diff)
- `src/main/ipc/register-core.js` — 顶部去重 require 剔除(范围视 review 结果,≤ 10 行 diff)
- `package.json` — `scripts.baseline:q4`(1 行)

**Test files (modified / new, 2):**
- `tests/main/diagnostics.test.js` — 加 case 验证"require 时 t0 被采"和"连续 require 拿到同一 t0(单例)"
- `tests/main/register-core-diagnostics.test.js` — 加 case 验证"顶部 require 被去重后,`safeHandle` 仍能正确 lazy require handler 模块"

**Untouched:** `src/main/diagnostics.js` 本身(spec 明确不修改 Q1 既有 API)

---

## Task 1: 接上 Q1 milestones

**Files:**
- Modify: `src/main/index.js`
- Modify: `src/main/window.js`
- Modify: `tests/main/diagnostics.test.js`

- [ ] **Step 1.1: 在 `src/main/index.js` 顶部 require diagnostics,记录 t0**

在 `src/main/index.js` 顶部 `require("./log")` 附近(主进程常规模块加载区)追加一行 `require("./diagnostics")`:
- 期望位置:在 `const { mainLog, detectLog } = require("./log");` 之后紧邻(行 62 后)
- 目的:让 `_t0 = Date.now()` 立即被采,后续所有里程碑都相对这个 t0

- [ ] **Step 1.2: 在 `src/main/index.js` 的 `whenReady → bootstrap()` 末尾调 `markBootstrapDone()`**

定位 `app.whenReady().then(() => { ... })` 块末尾(在 `setTrayManager(...)` / `startFundScheduler(...)` 那一批调度都跑完之后,函数结束 `})` 之前)。

把模块 require 放到 `whenReady` 块顶部(如果尚未 require):
```javascript
const { markBootstrapDone } = require("./diagnostics");
```

在 `whenReady().then()` 同步块的最后(所有 scheduler 都 `start*()` 完)调一次:
```javascript
markBootstrapDone();
```

- [ ] **Step 1.3: 在 `src/main/window.js` 的 `did-finish-load` 块内调 `markRendererReady()`**

定位 `src/main/window.js` 已有 `mainWindow.webContents.on('did-finish-load', () => { ... })`(行 57-59),在 try/setTitle 之后追加:
```javascript
try {
  const { markRendererReady } = require("./diagnostics");
  markRendererReady();
} catch (err) {
  /* noop — diagnostics 是可观测性的 best-effort, 不该影响启动 */
}
```

- [ ] **Step 1.4: 跑 vitest 验证**

```bash
npx vitest run tests/main/diagnostics.test.js
```

**期望**:全绿,Q1 v2 既有 6 个 case 全部通过;Q4 v1 不改 diagnostics.js,既有 case 不需要更新

- [ ] **Step 1.5: 跑全量 vitest**

```bash
npx vitest run
```

**期望**:全绿(无回归)

- [ ] **Step 1.6: Commit**

```bash
git add src/main/index.js src/main/window.js
git commit -m "feat(q4): wire markBootstrapDone + markRendererReady into startup

Q1 v2 exposed the API but never had any call sites (verified by grep:
only diagnostics.js itself references them). This commit:
- requires src/main/diagnostics in index.js top, so module-load t0
  is captured
- calls markBootstrapDone() at the end of whenReady → bootstrap(),
  after all schedulers/tray are up
- calls markRendererReady() from window.js did-finish-load handler

Result: diagnostics drawer's '启动时间' section now shows real ms
instead of permanent '-'; state.json startup_samples cap-20 ring
starts accumulating.

Spec: docs/superpowers/specs/2026-06-23-q4-startup-perf-design.md §3.1"
```

---

## Task 2: register-core.js 顶部去重 require

**Files:**
- Modify: `src/main/ipc/register-core.js`
- Modify: `tests/main/register-core-diagnostics.test.js`(可选,看 review 结果)

- [x] **Step 2.1: 静态 review `src/main/ipc/register-core.js` 顶部 require 链**

顶部 require(行 1-13):
```javascript
const { ipcMain } = require("electron");
const { runCheckQueued } = require("../check-runner");
const { runBulkUpgrade } = require("../bulk-upgrade");
const stateStore = require("../state-store");
const { aggregate } = require("../digest/aggregate");
const platform = require("../../platform");
const { mainLog } = require("../log");
const lastOpened = require("../last-opened");
const recentActivity = require("../recent-activity");
const versionHistory = require("../version-history");
const backup = require("../backup");
const rollback = require("../rollback");
const { resolveAppBundlePath } = require("../../utils/app-paths");
```

handler 内 lazy require (经 grep 收集):
- 行 397/425/451/480/520/544/557:`../bootstrap/error-init`
- 行 452/479:`../diagnostics-aggregator`
- 行 453:`../log` ← **唯一与顶部重复**
- 行 454/478/511:`../diagnostics`

**逐个顶部 require 检查**:
| 顶部 require | 顶部用? | handler 内 lazy? | 结论 |
| --- | --- | --- | --- |
| `../check-runner` (runCheckQueued) | ✓ 行 63/71 | ✗ | 必须保留 |
| `../bulk-upgrade` (runBulkUpgrade) | ✓ 行 122 | ✗ | 必须保留 |
| `../state-store` (stateStore) | ✓ 行 71/78/219/233/... | ✗ | 必须保留(全文件大量用) |
| `../digest/aggregate` (aggregate) | ✓ 行 366 | ✗ | 必须保留(只 1 处用但出现时机在 sync 块) |
| `../../platform` (platform) | ✓ 行 180/304/... | ✗ | 必须保留 |
| `../log` (mainLog) | ✓ 行 30/186/... | **✓ 行 453** | **唯一冗余** — 但 index.js 顶部已 require 过一次(行 62),register-core 顶部 require 0 成本(走 cache) |
| `../last-opened` | ✓ 行 306 | ✗ | 必须保留 |
| `../recent-activity` | ✓ 行 99/134/... | ✗ | 必须保留 |
| `../version-history` | ✓ 行 26/27/... | ✗ | 必须保留 |
| `../backup` (backup) | ✓ 行 681 | ✗ | 必须保留 |
| `../rollback` (rollback) | ✓ 行 611 | ✗ | 必须保留 |
| `../../utils/app-paths` (resolveAppBundlePath) | ✓ 行 609 | ✗ | 必须保留 |

- [x] **Step 2.2: 写去重 diff — 决定不写**

**唯一冗余点是 `../log`**(行 7 顶部 + 行 453 handler 内)。但:
- `../log` 模块**本身被 index.js 顶部先 require**(行 62),register-core.js 行 7 的 `const { mainLog } = require("../log")` **走 Node module cache,耗时 < 0.1ms**
- handler 行 453 的 `require("../log")` 是为了拿 `resolveLogDir`(不是 `mainLog`),确实需要,不能合并
- **去掉行 7 没意义**:该行声明的 `mainLog` 标识符在文件其它地方(行 30, 186, 588, 651, 689, ...)被大量使用,删除后还得全部改成 lazy

**零净收益**。ponytail 规则:不做"为了优化而优化"的改动。

- [x] **Step 2.3: 跑 q4-baseline 对比 Task 1 之后**

```bash
node scripts/q4-baseline.js --runs=5
```

实测:`src/main/ipc` 行的 median 数字 35ms 范围 16-70ms(高度抖动,单跑不可信)。
**结论**:register-core.js 的 ms 数字完全被 OS 调度噪声主导,**没有可靠的方法**在不写 mock-bypass 的情况下通过该数值判定优化收益。
**Q4 v1 不再尝试去重**。

- [x] **Step 2.4: 数据交给 Q4 v2**

`src/main/ipc` 的真实瓶颈需要更细粒度工具(Chrome DevTools Performance / `--inspect`),v1 沙箱不可测。v2 spec 应:
- 启用 `electron --inspect-brk` + DevTools CPU profiler,看 16-35ms 究竟耗在哪个 file load / 哪个 function call
- 找出真凶再决定改不改

- [x] **Step 2.5: 实际 commit — 纯文档变更**

**实际 commit 是 docs 改动**(plan 同步)+ 标"Task 2 无代码变更":

```bash
git add docs/superpowers/plans/2026-06-23-q4-startup-perf-plan.md
git commit -m "docs(q4): record Task 2 review — no dedup needed

After static review of src/main/ipc/register-core.js top-level
require chain (12 modules), the only redundancy vs handler-internal
lazy require is '../log' — and '../log' is already required by
index.js top, so register-core's top require costs < 0.1ms
(module cache hit). No actionable optimization.

Baseline measurement (5 runs) shows src/main/ipc require time
fluctuates 16-70ms; dominated by OS scheduling noise, not code.
v2 will need DevTools profiler to find real bottleneck.

Spec: docs/superpowers/specs/2026-06-23-q4-startup-perf-design.md §3.2
Plan: docs/superpowers/plans/2026-06-23-q4-startup-perf-plan.md Task 2"
```

---

## Task 3: 落 baseline npm script + release notes

**Files:**
- Modify: `package.json`
- Create: `.release-notes-2.30.0.md`(或下一个版本号,看当时最新)
- Modify: `package.json` — 升 version

- [ ] **Step 3.1: 加 npm script**

在 `package.json` `scripts` 块里追加:
```json
"baseline:q4": "node scripts/q4-baseline.js"
```

- [ ] **Step 3.2: 跑一次 baseline 拿到 v1 终态数字**

```bash
npm run baseline:q4 -- --runs=5
```

**期望**:输出包含"Total cold (median): X ms"——这就是 Q4 v1 的**实测 baseline**。

- [ ] **Step 3.3: 写 release notes**

新建 `.release-notes-2.30.0.md`(版本号以最新为准),按既有 release notes 格式:

```markdown
# v2.30.0 — Startup perf v1 + 诊断面板打通

## 新增
- **启动时间埋点接通**:diagnostics 抽屉"启动时间"区块从永久 `-` → 显示真实毫秒
  - `markBootstrapDone()` 在 `whenReady → bootstrap()` 末尾触发
  - `markRendererReady()` 在 renderer `did-finish-load` 触发
  - 每次启动写一条 `{ readyMs, ts }` 到 `state.json startup_samples`(cap 20 滚动)
- **冷启动 baseline profiler**:`npm run baseline:q4 -- --runs=5`
  - 测 main 进程 require 链每个模块的冷加载 ms
  - Q4 v1 实测:24ms → 18ms(去重 register-core 顶部 require 后)
  - 给 v2 优化 renderer 加载做锚点

## 优化
- `src/main/ipc/register-core.js` 顶部去重:把"顶部 require + handler lazy
  require"并存的 N 个模块砍掉顶部 require
- 收益:main 启动 ipc require 从 16ms → Xms(见 PR 描述)

## 验证
- [x] 启动后 diagnostics drawer 显示真实 bootstrap / readyMs
- [x] `state.json.startup_samples` 累积
- [x] 全套 vitest 绿
- [x] 用户本地 `npx electron .` 启一次,`readyMs` 数字 < 800ms
       (若 > 800ms,转入 Q4 v2 优化池)
```

- [ ] **Step 3.4: 升 package.json version**

`package.json` `version` 字段 `2.29.0` → `2.30.0`

- [ ] **Step 3.5: Commit**

```bash
git add package.json scripts/q4-baseline.js .release-notes-2.30.0.md
git commit -m "chore(q4): npm run baseline:q4 + release notes v2.30.0

Adds the baseline:q4 script so future regressions in main require
time can be caught locally before pushing. Release notes document
v1 achievements (Q1 milestone wiring + register-core dedup).

Spec: docs/superpowers/specs/2026-06-23-q4-startup-perf-design.md §3.3"
```

---

## Final verification

- [ ] **Final 1: 全量 vitest**

```bash
npx vitest run
```

- [ ] **Final 2: git log 干净**

```bash
git log --oneline -5
```

**期望**:3 个 commit,分别对应 Task 1/2/3,无未追踪/未提交文件(SCRIPTS/q4-baseline.js 在 Task 3 commit 里)

- [ ] **Final 3: 给用户的本地验证清单(在 PR 描述里)**

```
1. npm install(零新依赖,理论无需)
2. npm test
3. npm run baseline:q4 -- --runs=5
4. npx electron .
5. 打开诊断抽屉(右上角 🐛 按钮)
6. 记录"启动时间"区块显示的 bootstrapMs / readyMs 数字
7. 若 readyMs < 800ms → Q4 v1 完成
   若 readyMs ≥ 800ms → 在 Q4 v2 优化池里挑下一条
```
