# Q4 — Startup performance budget 设计 (Phase Q4 v1)

| 日期       | 作者 | 状态     |
| ---------- | ---- | -------- |
| 2026-06-23 | brainstorming | 设计已批准,待 writing-plans |

> 本 spec 对应产品路线图 §5.2 **Q4 startup time 目标化(< 800ms)**(评分 6,Maybe 状态,动工 ⚫ 未立项)。
> 上游文档:[2026-06-19-product-roadmap-design.md](2026-06-19-product-roadmap-design.md) §5.2 / §10.2 / §10.4。
>
> **Q1 已为本次 v1 铺好路**:`src/main/diagnostics.js` 提供 `markBootstrapDone` /
> `markRendererReady` / `getStartup` 三个里程碑 API + `startup_samples` 持久化(cap 20)。

## 1. 背景与目的

诊断面板的"启动时间"区块目前**永远显示 `-`**——Q1 v2 暴露了
`markBootstrapDone` / `markRendererReady` 两个 setter,但**全代码库 0 个调用点**(grep 验证)。

这暴露两个问题:

1. **Q1 端到端断链**:diagnostics drawer 顶部 "bootstrap / renderer ready ms" 永久 `-`,
   用户看不到真实数据
2. **startup 优化无 baseline**:没有这两个里程碑的数据,Q4 优化的"目标 < 800ms"
   没有测量锚点

本次 v1 目标:**打通 Q1 断链 → 拿到真实 startup baseline → 实施 1-2 个最有把握的优化**

## 2. 现状(实测)

通过 `scripts/q4-baseline.js`(本次新增)跑了 main 进程冷启动 baseline
(node 18.17 / darwin / 3 跑取中位数):

| 阶段 | ms (median) |
| --- | --- |
| 全部 main require 链 (25 个模块) | **24 ms** |
| `src/main/ipc` (大头, registerCoreHandlers) | 16 ms |
| `src/main/bootstrap/ai-tasks.js` | 1.5 ms |
| 其余 23 个模块 | ≤ 0.8 ms 每个 |

**结论:main 进程 require + whenReady 阶段 ~24 ms,远低于 800ms 预算。**
**真正大头是 Electron BrowserWindow + renderer 加载,这部分沙箱无法测,
需要在真实 macOS 跑(`npx electron .` 后从 drawer 看 readyMs)。**

## 3. v1 范围(本次 spec 必做,严格不超出)

### 3.1 接入 Q1 milestones(必修,1 commit,低风险)

- `src/main/index.js` 顶部 require `./diagnostics`(只 require,不调 API,
  让 t0 被采)
- `src/main/index.js` 在 `whenReady → bootstrap()` 完成(tray / window / pool
  全装好)后调 `markBootstrapDone()`
- `src/main/window.js` 在已有 `webContents.on('did-finish-load')` 里追加
  `markRendererReady()`

**预期收益**:diagnostics drawer 的"启动时间"区块从永久 `-` → 显示真实 ms;
state.json `startup_samples` 开始累积 → 用户长跑可以看趋势。

### 3.2 1 个低风险 main 启动优化(选修,1 commit)

`src/main/ipc/register-core.js` 14ms 是大头,因为它转手 registerCoreHandlers
立即执行所有 `safeHandle(...)`——其中一部分 IPC handler require 重量级模块
(`error-aggregator` / `version-history` / `backup` 等),全部在 main 启动期同步加载。

**优化方向**:**轻量 IPC(纯 state 读写)在 register 阶段就加载;重量级 IPC
(handler 内部 lazy require 重量模块)保持原状**。

具体做法:review register-core.js,把已经在 handler 内部 lazy require 的模块
确认无重复;如果某个模块在 handler 内 lazy require **且**文件顶部 require 也
引用,**去掉顶部 require**——纯函数性收益,不改变行为。

**预期收益**:ipc require 从 16ms → 10ms 左右,**节省 ~6ms**(具体看
review 结果)。这是确定性收益,但小;大头仍是 renderer 加载。

### 3.3 真实 baseline 测量(留给用户跑,不在 commit 里)

- 加 `npm run baseline:q4` package script 跑 `scripts/q4-baseline.js`
- 用户本地真启 app 一次,打开 diagnostics drawer,看 `readyMs` 数字
- 数字 > 800ms → 启动 §4 列出的优化池(本次不做);数字 ≤ 800ms → Q4 完成

## 4. v1 明确不做(留给 Q4 v2)

- 真正的 renderer 加载优化(webpackChunks / dynamic import / preload 拆分):
  沙箱不可测,改了不知道是否好,等 v1 拿到 baseline 数字再说
- Windows 平台特别优化:Windows 启动基线 ~1500-2500ms,跟 macOS 机制不同,
  独立 spec
- 启动期后台 detector 链路的并发重构(C4 已做)
- state-store 持久化的 lazy 化(state-store 自身 < 1ms,不是瓶颈)

## 5. 验收

- [ ] `src/main/diagnostics.js` 在 `src/main/index.js` 顶部 require
- [ ] `src/main/index.js` 在 `whenReady → bootstrap()` 末尾调 `markBootstrapDone()`
- [ ] `src/main/window.js` 在 `webContents.on('did-finish-load')` 调 `markRendererReady()`
- [ ] `scripts/q4-baseline.js` 落地,`npm run baseline:q4` 可跑
- [ ] 全套 vitest 绿(包括 diagnostics 测试新增 case 验证 milestone 接上)
- [ ] 手动 smoke:启 app → 看 drawer bootstrap / readyMs 显示具体数字
      (而非 `-`)
- [ ] 真启动时间 < 800ms(用户本地测;若 > 800ms → 转入 v2 优化池)

## 6. 风险

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| `markRendererReady` 在 `did-finish-load` 触发,但 preload 还没完全 ready | 低 | `did-finish-load` 是 renderer 完整加载完成(包括所有同步 script),spa 启动后所有 dom ready 信号都行 |
| 在 vitest 环境下 require diagnostics 会采 t0,污染测试 | 低 | vitest 不 require index.js(它需要 electron),直接跑 diagnostics.test.js 仍然 fresh |
| Lazy require 改动影响 IPC handler 行为 | 低 | 仅去掉"handler 内已有 lazy require 但顶部也 require"的重复 require,**不动行为** |
| 真实 baseline > 800ms | 中 | 留 v2 优化池(webpackChunks 等);v1 先打通 telemetry |

## 7. 与路线图的对齐

- 上游候选:`2026-06-19-product-roadmap-design.md` §5.2 Q4(评分 6,Maybe)
- 状态机:§2.3 优先级 + §2.4 动工状态(本次 v1 合入后:`🟢 Next + 🟢 已合入`)
- 流程纪律:§9 spec → plan(本次 spec 已落,下一步 writing-plans)

## 8. Brainstorming 决策记录

| # | 问题 | 用户选 |
|---|---|---|
| 1 | 测量口径 | B. 从 main 启动到 markRendererReady(用 Q1 signal) |
| 2 | 目标值颗粒度 | A. 统一 < 800ms |
| 3 | 优化范围 | A. 只优化 main 启动到 renderer ready,不动自动检测 |
| 4 | 优化手段约束 | A. 零新依赖,纯代码优化 |
| 5 | Profiler 工具 | A. hrtime + 日志(零依赖,复用 Q1) |

**额外发现(不在 5 选):**

- v1 必修 `markBootstrapDone` / `markRendererReady` 接入 index.js / window.js
  —— Q1 暴露了 API 但 0 个调用点(grep 验证),drawer 启动时间区块当前
  永久 `-`,这是 P0 数据丢失 bug,优先级高于"优化"
- v1 选修为 main 启动端最轻的优化:`src/main/ipc/register-core.js` 顶部
  重复 require 剔除,确定性 6ms 收益,几乎零风险
- 真正的 renderer 加载优化留给 v2,因为沙箱测不了,改了不知道是否好