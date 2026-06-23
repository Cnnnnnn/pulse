# Q4 — Startup Performance v2 设计 (Phase Q4 v2)

| 日期       | 作者 | 状态     |
| ---------- | ---- | -------- |
| 2026-06-23 | brainstorming | 设计已批准,等用户本地 profile 数据 |

> 本 spec 是 **v1 的延续**:`docs/superpowers/specs/2026-06-23-q4-startup-perf-design.md` 已经做了
> milestone 接入 + baseline 工具 + 文档,详见 §3 现状。
> 本 v2 目标是 **真正让 startup 落到 < 800ms**——v1 没动 renderer,纯 main 已经是
> ~16ms;大头(预计 500-700ms)在 renderer 加载,沙箱测不了,需要 DevTools profiler。
>
> 上游:产品路线图 §5.2 Q4 / §10.2 / §10.6.5。
> **Q4 v1 release notes**: `.release-notes-2.30.0.md`。

## 1. 背景与目的

v1 跑完 baseline:`main` require 链 median 16.1ms (range 14.9-55.3ms,OS 抖动),
`src/main/ipc` 是大头 (median 9.9ms)。**离 < 800ms 目标还差一大截**——大头是
`BrowserWindow` 创建 + `loadFile(index.html)` + renderer (preact + esbuild bundle) 加载 +
`webContents 'did-finish-load'`。

但 v1 没碰 renderer 一行,问题: **没有任何数据知道 renderer 加载的真实耗时**。

v2 目标:
1. **采集真实 profile**:用户本地跑 DevTools,采集 main 启动 / renderer 启动的 CPU 火焰图
2. **从数据定真凶**:不靠猜,profile 直接显示哪个 file / function 占用多少 ms
3. **实施 1-2 个最有把握的优化**:基于 profile 决策,**不预先下结论**

## 2. 现状(v1 落地后, 2026-06-23)

通过 `scripts/q4-baseline.js` v1 跑出的数据(5 跑取中位数):

| 阶段 | ms (median) | 来源 |
| --- | --- | --- |
| 全部 main require 链 | **16.1ms** | 沙箱可测,Q1-S1 baseline |
| `src/main/ipc` 单模块 require | 9.9ms | 同上 |
| `app.whenReady` 到 `bootstrap()` 完成 | **未测** | 沙箱没 display,需 Electron |
| `BrowserWindow.createWindow` | **未测** | 同上 |
| `loadFile → did-finish-load` | **未测** | 同上, **大头预计在这段** |
| 总启动 (process start → did-finish-load) | **未测** | 真实数据要 DevTools |

**关键缺口**:用户本地 `npx electron .` 启一次,看 `markRendererReady` 的 `readyMs`
数字是唯一"端到端"测量——**v1 接上了这个数据通路**,但还没真数据回来。

## 3. v2 范围(本次 spec 必做, 严格不超出)

### 3.1 用户本地 DevTools 采集流程(必做, 阻塞后续)

**目标**:采到 main + renderer 启动期 CPU profile,识别 renderer 端最大耗时点。

**步骤**(用户执行, 我提供脚本和说明):

1. **启 app 带 inspect flag**:
   ```bash
   npx electron . --inspect=9229
   ```
   这会让 main process 在 9229 端口开 Node Inspector。

2. **另开一个 Chrome 访问 `chrome://inspect`**,在 "Remote Target" 里能看到
   `pulse` (electron main)。点 **inspect** → DevTools 弹出。

3. **在 DevTools → Performance 面板 → Start recording**,然后手动关 app(从 tray 退出
   或 Cmd+Q),等下次冷启再来一次。**目标**:采一次完整 cold start 的火焰图。

4. **导出 profile**:DevTools → Performance → Save profile → 存为
   `~/Desktop/pulse-startup-main.cpuprofile.json`。

5. **renderer profile**(更难):
   - 在 `chrome://inspect` 里同时找 renderer target (一般是 `pulse` 也有一个
     `Page` target, 标题是 index.html)
   - 同样在 Performance 面板采一次,导出 `pulse-startup-renderer.cpuprofile.json`
   - 或者用更简单的 `--enable-tracing`:
     ```bash
     npx electron . --enable-tracing --trace-startup=*
     # 然后在 chrome://tracing 加载 trace file
     ```

6. **回发 profile 文件给我**(或者发火焰图截图 + 关键数字)。

### 3.2 数据分析 → 决策(我执行, 基于用户数据)

拿到 profile 后,我会:

1. 解析 `.cpuprofile.json` 找 top-10 最耗时的 self-time function
2. 区分 main / renderer 各自的热点
3. 跟 baseline (16.1ms main) 对比,**看 main 端的 markBootstrapDone → markRendererReady
   之间到底多少 ms,落到了哪里**
4. **写 v2 优化 plan**:每条优化必须有"profile 显示这函数 X ms,改完后应当减 Y ms"
   的因果链

**v1 故意没做这一段**,因为没有数据。ponytail 规则:不靠猜改代码。

### 3.3 1-2 个 renderer / 启动优化(具体哪条, 视 profile 而定)

候选优化池(按"先验 ROI 排序",但**真做哪条看 profile**):

| 候选 | 假设收益 | 风险 | 备注 |
| --- | --- | --- | --- |
| **renderer bundle 拆 chunk**(esbuild 配置) | 100-300ms (主 chunk 减半) | 中 | esbuild 支持 `splitting: true`,但 iife 格式要改,可能引入 esm 注入 |
| **preact jsx 改 `/** @jsxImportSource preact */` + production 模式** | 10-50ms | 低 | 验证 v1 build:renderer 已 `--define:process.env.NODE_ENV="production"`,但 dev 模式可能没关 |
| **loadFile → 自定义 preload 提前注入** | 30-100ms | 中 | Electron 文档没明说,但有人提过 `loadFile` 比 `loadURL(file://)` 快 |
| **main 启动 `app.commandLine.appendSwitch` (disable-gpu-vsync 等)** | 10-30ms | 高 | Windows 平台才相关,macOS 收益存疑 |
| **renderer `window.requestIdleCallback` 推迟非关键 signal 初始化** | 50-150ms | 中 | digest-store / ai-tasks-store 等可能首屏不必要 |

**v2 实施时**:选 1-2 个 profile 数据**直接证明**有收益的;**不预先承诺任何具体值**。

### 3.4 验收(无 profile 数据前无法量化)

- [ ] 用户提交 main + renderer 两份 profile(或火焰图截图)
- [ ] 我解析后定真凶,写 v2 优化 plan(commit 形式)
- [ ] 实施 1-2 个优化, 每个 commit 跑 baseline + 全量 vitest 绿
- [ ] 用户本地 `npx electron .` 重测 `readyMs`, **数字 < 800ms** → Q4 v2 完成
- [ ] 若仍 > 800ms, 转 v3 优化池(更激进的 bundle 拆 / preload 优化)

## 4. v2 明确不做(留给 Q4 v3)

- Windows 平台特别优化(目前 v1 都没真测 Windows)
- 自动检测链路(C4 早就做完)
- lazy 化 state-store 加载(state-store 自身 < 1ms,profile 大概率显示不是瓶颈)
- 弃用 esbuild 切 vite/rollup(成本 4,超出"低成本优化"原则)

## 5. 风险

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 用户无法跑 DevTools(无 Chrome / 沙箱限制) | 中 | 提供 `--enable-tracing` fallback + 火焰图截图路线 |
| profile 数据噪声大(单跑抖动) | 中 | 要求至少 3 跑取中位数,跟 baseline 同样套路 |
| esbuild bundle 拆 chunk 影响 main bundle 结构 | 中 | 拆 chunk 后跑全量 vitest,验证 CJS/ESM interop 不破 |
| 优化后 < 800ms 但回归(后续 commit 让 readyMs 涨回) | 低 | 留 `npm run baseline:q4` 持续可跑,失败即警告 |
| profile 显示瓶颈是 Electron 自身(无法改) | 中 | 接受 baseline 1000ms, 把目标调到 1000ms |

## 6. 与路线图的对齐

- 上游候选:`2026-06-19-product-roadmap-design.md` §5.2 Q4(评分 6)
- 状态机:v2 合入后 `🟢 Next + 🟢 已合入`(从 v1 的"🟢 已合入 + 待 telemetry"升级)
- 流程纪律:§9 spec → plan(本次 spec 已落, 等 profile 数据后写 plan)

## 7. Brainstorming 决策记录

| # | 问题 | 决策 |
|---|---|---|
| 1 | profile 工具 | A. Chrome DevTools (`--inspect=9229` + chrome://inspect) |
| 2 | profile 范围 | A. main + renderer 都采 (v1 沙箱做不到, v2 必须补) |
| 3 | 数据提交方式 | A. 用户本地跑, 发 .cpuprofile.json + 火焰图截图回我 |
| 4 | 优化决策依据 | A. **必须有 profile 数据**才能定哪条; 不靠猜 |
| 5 | 目标值 | A. < 800ms 维持(roadmap §5.1) |

**额外发现**:
- v1 接上的 `markRendererReady` 是**用户本地**唯一能拿到的"端到端"数据通路
- esbuild iife bundle 单文件 ~X KB(需 profile 后才知道); 拆 chunk 改 format
  可能引入"窗口期" 期间 renderer bundle 暂时无 main 引用,要小心
- **如果用户拒绝跑 DevTools**, v2 降级方案:
  1. 只做 v1 既有的 `markRendererReady` 用户跑通后看 readyMs 数字
  2. 若 < 800ms 直接结题(v2 不做); 若 > 800ms 写 v3 spec 委托用户跑 profile
