# Q5 — Timer 持有 / 重复 schedule 治理设计 (Phase Q5 v1)

| 日期       | 作者 | 状态     |
| ---------- | ---- | -------- |
| 2026-06-22 | brainstorming | 设计已批准,待 writing-plans |

> 本 spec 对应产品路线图 §5.1 **Q5 memory 治理**(评分 7,Next 状态,动工状态 ⚫ 未立项)。
> 上游文档:[2026-06-19-product-roadmap-design.md](2026-06-19-product-roadmap-design.md) §5.1 / §7 / §10.2。

## 1. 背景与目的

Pulse 仓库内 **没有任何 timer 集中管理机制**:14+ 个 `setInterval / setTimeout` 散落在 `src/main/**` 与 `src/renderer/**`,清理路径(`app.once("before-quit", ...)` 内 `clearInterval`)只在 `bootstrap/schedulers.js` 等少数模块手动写。

**Q5 v1 目标**(本次范围,严格不超出):

- 提供一个**轻量 timer 注册表 API**(`setManagedInterval` / `setManagedTimeout` / `clearManaged` / `clearAllManaged` / `listManaged` / `getStats`)
- 提供一个**fixture-based 启动 audit**(`auditTimers`),不读真实仓库(安全边界)
- 给出 **1 个示范迁移**(`bootstrap/schedulers.js` 的 `autoCheckTimer`)走新 API,作为模板
- 在 `app.once("before-quit", ...)` 里**兜底调 `clearAllManaged()`**,防止注册表自身 leak
- 100% 纯单测,无 IPC,无 UI 钩子,无新依赖

**Q5 v1 明确不做**(留给后续版本):

- 全局 `setInterval` 拦截
- 真实仓库静态扫描(留给 v2.27 + 独立 CLI)
- leak 主动检测(`process.memoryUsage()` 周期采样)
- 自动修复 orphan timer
- IPC stats(Q1 诊断面板补完时接)
- renderer 进程 timer 管理(独立进程,本次不通)

## 2. 架构与模块边界

### 2.1 新增文件 1 个

**`src/main/timer-registry.js`** — 纯 CommonJS,无 Electron 依赖,可被 vitest 直接 require。

### 2.2 API 表面

```js
// 写入端
setManagedInterval(fn, ms, meta?)   // → handle { id, clear() }
setManagedTimeout(fn, ms, meta?)    // → handle { id, clear() }

// 读出端
listManaged()                       // → Array<{ id, type, label, file, line, startedAt }>
getStats()                          // → { count, byType: { interval: N, timeout: M } }

// 控制端
clearManaged(handle)                // 单个清理(原 + 数组移除)
clearAllManaged(labelPrefix?)       // 全部 / 按 label 前缀

// 启动 audit(读 fixture)
auditTimers(rootDir, opts?)         // 同步扫 fixture + 写 main log
                                    // → { total, clean, orphan, debounce, dupSchedule, entries }
```

`meta?` 是 `{ label?: string, file?: string, line?: number }`,调用方**不必**传(meta 缺省时审计信息会标注 `(caller unknown)`)。本次 v1 不做 stack-trace 自动捕获(避免性能损耗)。

### 2.3 调用方改动(只 2 处)

| 文件 | 改动 | diff |
| --- | --- | --- |
| `src/main/bootstrap/schedulers.js` | `autoCheckTimer` 的 `setInterval` → `setManagedInterval`;`before-quit` 的 `clearInterval` → `clearManaged` | ≤ 5 行 |
| `src/main/index.js` | `app.whenReady` 之后调 `auditTimers(__dirname + '/../tests/fixtures/timer-audit', { fixturesOnly: true })`,套 try/catch 失败只 warn | ≤ 8 行 |

**完全不动**(避免爆炸式 diff):

- `schedulers.js` 里其他 4 个 scheduler(fund / reminders / worldcup-goal / recent-activity listener)
- `tray.js`(`rebuildTimer` debounce)
- `digest/daily-summary-job.js`(`_handle.interval` — 已知 dup-schedule,本次只报告不修)
- `worldcup/goal-watcher.js`(`_sweepTimer`)
- `metals/metal-scheduler.js`(`this.intervalId`)
- `ai-usage-refresh-scheduler.js`(`intervalHandle`)
- `index.js:402 metalsTrayTimer`
- renderer 所有 setInterval / setTimeout
- `preload.js`

### 2.4 模块依赖

- 必须:`node:fs` / `node:path` / `node:timers`
- lazy require:`../log` 的 `mainLog`,测试时不依赖 mainLog 也能跑
- 禁止:`electron`(本次 v1 不入 Electron runtime;`app.once("before-quit", ...)` 留给 bootstrap 调用方)

## 3. 数据流与算法

### 3.1 启动 audit 数据流

```
[tests/fixtures/timer-audit/*.js]  ← 5 个 fixture 文件(committed)
       │
       │ app.whenReady 之后
       ▼
[auditTimers(rootDir, { fixturesOnly: true })]
       │
       │ 同步扫描(不引 @babel/parser 避免重型依赖)
       │ 1) readdirSync(rootDir).filter(js)
       │ 2) 对每个文件:readFileSync + 行扫描
       │ 3) 过滤:
       │    - ^\s*// 跳过 (注释)
       │    - 1-shot setTimeout(fn, 0/1/<5ms) 跳过 (微任务)
       │    - if (x) clearTimeout(x); x = setTimeout(...) 标记 kind: 'debounce'
       │ 4) 提取 var 名字:const|let|var X = setInterval(...)
       │ 5) 同文件后续 50 行内是否出现 clearInterval(X) / clearTimeout(X)
       │    - 有 → hasCleanup: true → kind: 'clean'
       │    - 无 + setInterval → kind: 'orphan'
       │    - 无 + setTimeout + 同一 var 多次赋值 → kind: 'dup-schedule'
       ▼
[entries[]]  →  [{ file, line, code, var, ms?, hasCleanup, kind }]
       │
       ▼
[mainLog.info]  ← "[timer-registry] audit: total=5 clean=2 orphan=1 debounce=1 dupSchedule=1"
[mainLog.info]  ← "[orphan] <file>:<line> setInterval <ms>ms (no clearInterval found in 50 lines)"
[mainLog.info]  ← "[dup-schedule] <file>:<line> setInterval <ms>ms (var X reassigned <N> times without prior clear)"
       │
       ▼
[return summary]  → 供后续 IPC stats 消费
```

### 3.2 关键算法

**hasCleanup 判断**:扫同一个文件,`app.once('before-quit', ...)` 闭包内 / `app.on('before-quit', ...)` / 局部 `try { ... }` 块内,出现 `clearInterval(var)` / `clearTimeout(var)` 匹配该 `var` 名字 → `hasCleanup: true`。50 行容差(实测 `bootstrap/schedulers.js` 内的 `autoCheckTimer` 从 setInterval 到 clearInterval 跨 28 行)。

**debounce 识别**:同文件出现 `if (t) clearTimeout(t); t = setTimeout(...)` 或 `t && clearTimeout(t); t = setTimeout(...)` → 标记 `kind: 'debounce'`,从 orphan 总数中剥离。

**dup-schedule 检测**:同一文件,同一个 `var` 名字,出现 ≥2 次 `setInterval` / `setTimeout` 赋值且这两次赋值之间没有 `clearInterval / clearTimeout(var)` 介入 → 标记 `kind: 'dup-schedule'`。本次 audit 输出标记,**不**做修复。

### 3.3 错误处理

- `auditTimers` 读文件失败 → `mainLog.warn` 跳过该文件,不抛
- `setManagedInterval(fn, ms)` 的 `fn` 抛错 → 让它自然抛(跟原生 setInterval 行为一致);registry **不** try/catch
- `clearManaged` 传入已失效 handle(已不在数组)→ noop,不抛
- `app.whenReady` 之后调 `auditTimers` 套 try/catch,失败只 `mainLog.warn` 不能 crash 主进程
- `app.once("before-quit", () => clearAllManaged())` 兜底注册表自身 leak

## 4. 测试护栏(纯单测)

### 4.1 `tests/main/timer-registry.test.js`(≥ 6 case)

1. `setManagedInterval` 登记到 `listManaged` 含正确 `type: 'interval'`
2. `clearManaged` 从 `listManaged` 移除 + 原生 `clearInterval` 被调(spy on global.setInterval return value)
3. `clearAllManaged` 按 label 前缀过滤(混合 label 场景)
4. 重复 `setManagedInterval` 同一 label,内部 id 不重复 + `getStats().count` 正确
5. `setManagedTimeout` 默认 type 区分 + 1-shot 行为正常
6. `clearManaged` 接受已失效 handle 不抛(no-throw 保证)

### 4.2 `tests/main/timer-registry-audit.test.js`(≥ 5 case)

fixture 目录:`tests/fixtures/timer-audit/`,5 个文件(committed):

| 文件 | 模式 | 期望 kind |
| --- | --- | --- |
| `clean.js` | setInterval + 50 行内 clearInterval | `clean` |
| `orphan.js` | setInterval 无 clearInterval | `orphan` |
| `debounce.js` | setTimeout 反复 clearTimeout/重赋值 | `debounce` |
| `dup-schedule.js` | 同一 var setInterval 两次,中间无 clear | `dup-schedule` |
| `commented.js` | 注释行里的 setInterval | (skip, 不计入 total) |

case:

1. clean 模式被识别
2. orphan 模式被识别 + hasCleanup: false
3. debounce 模式被剥离出 orphan 集合
4. 注释行跳过
5. tests/fixtures/timer-audit 外的文件不被读
6. summary 数字:total / clean / orphan / debounce / dupSchedule 各自正确

### 4.3 覆盖率

- 新文件 `src/main/timer-registry.js` 单测覆盖率 ≥ 80%(行)
- 不破坏现有 230+ 测试(`npm test` 全绿)

## 5. 风险

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 注册表自身 leak(忘记 clear) | 中 | `app.once("before-quit", () => clearAllManaged())` 兜底,放在 `src/main/index.js` after-quit-cleanup 段 |
| `mainLog` 在测试环境不可用 | 低 | `try { require('../log') } catch { use console.log fallback }` |
| audit fixture 文件污染仓库 | 低 | 放 `tests/fixtures/timer-audit/`,跟现有 `tests/fixtures/codexbar/` 同模式,无需 .gitignore |
| 启动 audit 拖慢 app boot | 极低 | fixture 目录 5 个文件,<10ms |
| 跟未来 Q1 诊断面板改造冲突 | 低 | 留 `getStats() / listManaged()` 只读 API,Q1 v2 可直接消费 |
| "audit 只扫 fixture"让 v1 价值变薄 | 中 | 明确 v1 价值 = 工具就位 + 1 个示范迁移;真实仓库扫描留 v2.27 增量做 |

## 6. 范围之外(明确不做)

- 全局 `setInterval` 拦截
- 真实仓库静态扫描(`cli:bin/audit-timers.js` 命令,v2.27 增量)
- leak 主动检测(`process.memoryUsage()` 周期采样)— 留给 Q5 v2 / Q1 补完
- 自动修复 orphan / dup-schedule
- IPC 暴露给 renderer
- renderer 进程的 setInterval / setTimeout 管理(独立进程,治理逻辑不通)

## 7. 验收清单

- [ ] `src/main/timer-registry.js` 落地,API 8 个函数全部导出
- [ ] `tests/main/timer-registry.test.js` ≥ 6 case 全部通过
- [ ] `tests/main/timer-registry-audit.test.js` ≥ 5 case 全部通过
- [ ] `tests/fixtures/timer-audit/` 含 5 个 fixture 文件(committed)
- [ ] `src/main/bootstrap/schedulers.js` 的 `autoCheckTimer` 改用 `setManagedInterval` + `clearManaged`(diff ≤ 5 行)
- [ ] `src/main/index.js` 在 `app.whenReady` 之后调 `auditTimers`,失败只 warn
- [ ] `before-quit` 钩子兜底 `clearAllManaged`(放在 index.js)
- [ ] `npm test` 全绿(不破坏现有 230+ 测试)
- [ ] 启动 audit 输出在 main log 可见(manual: `npm start` 跑一次看)
- [ ] 新文件单测覆盖率 ≥ 80%

## 8. Rollout

- commit message:`feat(timer-registry): managed interval API + fixture-based audit (Phase Q5 v1)`
- 路线图 §5.1 Q5 动工状态:`⚫ 未立项` → `🟢 已合入`
- 路线图 §10.2 Q5 行:从 `❌ Next 未开始` / `⚫ 未立项` 更新为 `🟢 已合入`
- 不开新 tag(v2.25 / v2.26 由作者决定)
- 不发 release notes(本次是基础设施,不影响用户功能)

## 9. 与路线图的对齐

| 项 | 引用 |
| --- | --- |
| 上游候选 | `2026-06-19-product-roadmap-design.md` §5.1 Q5(评分 7,Next) |
| 状态机 | §2.3 优先级 + §2.4 动工状态(本次 v1 合入后:`🟢 Next + 🟢 已合入`) |
| 流程纪律 | §9:每条 Next 项进入开发前先写 `spec → plan`(本次 spec 落地,下一步是 writing-plans) |
| 流程偏差 | §10.4 第 1 条:状态机补动工列(已落);§10.4 第 3 条:Next 项先写 spec(本次实践) |
