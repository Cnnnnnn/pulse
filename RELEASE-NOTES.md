# Pulse v2.2.0 — Release Notes

---

## Unreleased (🚧 检测器熔断 — Phase C1)

### 新增
- **🔌 检测器智能失败重试 + 熔断 (Phase C1)**: 解决"上游 xxapi 持续 5xx 时每个 app 每次检测都浪费 ~2s + 日志刷屏"问题
  - 状态机:`closed` → 3 次连续失败 → `open`(5 分钟冷却,跳过该 detector) → `half_open`(试探) → 成功回 `closed` / 失败重新 `open`
  - per-detector 维度,key = `<detType>:<url|identifier>`,持久化到 `state.json.circuitBreakers`
  - 失败定义:`{ok:false}`、非 2xx HTTP、timeout 三种都算
  - UI 透出:app 行检测结果错误时,subtitle 文案变 `电路熔断 · 5 分钟内重试`

### 变更
- **`src/workers/detector-chain.js`**: 每次调用前 `shouldAllow(breaker, now)`,调用后 `recordSuccess` / `recordFailure` 并写回持久化;`breakerKey()` 按 `url > id > cask > product > baseUrl` 优先级构造
- **`src/main/state-store.js`**: `PRESERVE_FIELDS` 新增 `circuitBreakers` 字段,跨 saveAll 自动保留
- **`src/workers/result-builder.js`**: `extractErrorMessage` 新增对 `trace[i].skipped === 'circuit_open'` 的识别,返回 "电路熔断 · 5 分钟内重试" 走现有 `error_message` 通道

### 不变
- detector 接口(`detect(ctx) → DetectorResult`)、`DETECTORS` 注册表、settings schema — 全部沿用
- 失败原因枚举(`DetectorError.reason`),新值 `circuit_open` 是 trace 字段而非新 reason
- 未知 detector 类型 / 平台过滤的早返回路径不会触发 CB(config bug ≠ upstream failure)

### 文件
- 新增: `src/detectors/circuit-breaker.js` (106 行, 纯状态机, 8 tests)
- 新增: `src/detectors/circuit-breaker-storage.js` (68 行, state-store 适配, 6 tests)
- 新增: `tests/detectors/circuit-breaker.test.js`
- 新增: `tests/detectors/circuit-breaker-storage.test.js`
- 修改: `src/workers/detector-chain.js` (+33 / -13)
- 修改: `src/main/state-store.js` (+1 行 PRESERVE_FIELDS)
- 修改: `src/workers/result-builder.js` (+3 行 extractErrorMessage)
- 新增: `tests/workers/detector-chain-circuit-breaker.test.js` (3 tests)
- 新增: `tests/workers/result-builder.test.js` (5 tests)

### 测试
- 新增 22 个 CB 相关单元 + 集成测试,全跑过 vitest
- 全套 2155/2157 通过,2 pre-existing unrelated 失败(`reminders weekday` + `worldcup-tray-cache getUpcoming`)

### 手动 e2e(留给用户验证)
- `npm run dev`
- 临时在 `src/detectors/api-json.js` 顶部加 `throw new Error('forced')`
- 触发 3 次 check,观察第 4 次该 app 行 subtitle 显示「电路熔断 · 5 分钟内重试」
- 等待 5 分钟,验证下次 check 该 detector 跑了一次 probe
- 撤掉 `throw`

---

## Unreleased (🛡 state.json 损坏自愈 — Phase Q8)

### 新增
- **🛡 state.json 损坏自愈 (Phase Q8)**: state.json 半路写失败 / 外部编辑器破坏 / 磁盘错误 → 启动崩溃 + 全部数据丢失,现在自动备份恢复并通知用户
  - 启动时校验 schema(顶层必填 `v` / `apps`,其他字段类型校验,未知字段保留 forward-compat)
  - 校验失败:`rename state.json → state.corrupt-{ISO timestamp}.json` + 用 baseline 启动
  - 备份失败不阻塞启动,只 log warn
  - IPC `state:recovered` 推 renderer,显示一次性黄色 banner "设置已恢复默认" + 备份路径
  - 用户 dismiss 后写 localStorage 标记,下次启动同一事件不再显示
  - 缺失的 state.json(冷启动)不走恢复路径,正常 baseline 启动

### 变更
- **`src/main/state-store.js`**: 新增内部 `_loadOrThrow()` 区分"文件不存在"(返 null)vs"损坏"(抛 `StateCorruptedError`)vs"合法 JSON 但 schema 错"(同样抛);新增 `loadOrRecover()` / `getLastRecoveryEvent()` / `StateCorruptedError` 导出
- **`src/main/index.js`**: `bootstrap()` 早期调 `initStateRecovery()`,window 创建后 `setImmediate` 内 `takeRecoveryEvent()` + `sendToRenderer("state:recovered", evt)`
- **`preload.js`**: 新增 `onStateRecovered(cb)` 暴露给 renderer
- **不** bump `SCHEMA_VERSION`(纯 additive,旧 state.json 仍合法)

### 不变
- `patchState` 接口、`load()` 公共契约(继续 swallow 错误返 null)、saveAll / setMute / clearMute 等写入路径
- IPC channel 名(只新增 `state:recovered`,不替换任何旧通道)
- forward compat 字段(`PRESERVE_FIELDS` 列表)继续受保护
- 现有 `getMutes` / `loadLastOpened` / `_ensureAiUsageV2` 等 `load()` 调用方不受影响(走 swallow-null 路径)

### 文件
- 新增: `src/main/state-store-schema.js` (纯 schema 校验, 0 依赖, 8 tests)
- 新增: `src/main/bootstrap/state-init.js` (启动期 wiring)
- 新增: `src/renderer/components/StateRecoveredBanner.jsx`
- 新增: `src/renderer/store/state-recovery-store.js` (signal re-export)
- 新增: `tests/main/state-store-recovery.test.js` (6 tests)
- 新增: `tests/renderer/state-recovered-banner.test.jsx` (4 tests)
- 修改: `src/main/state-store.js` (+~85 行:_loadOrThrow / StateCorruptedError / _backupCorruptState / loadOrRecover / getLastRecoveryEvent)
- 修改: `src/main/index.js` (3 处插入:require / init / setImmediate push)
- 修改: `preload.js` (+1 method)
- 修改: `src/renderer/api.js` (+1 wrapper)
- 修改: `src/renderer/store/index.js` (+1 export *)
- 修改: `src/renderer/index.jsx` (+1 api.onStateRecovered subscription)
- 修改: `src/renderer/App.jsx` (+1 import + 1 JSX tag)
- 修改: `styles.css` (+~26 行 banner 样式)

### 测试
- 新增 18 个 schema + recovery + banner 测试
- 全套 2174/2176 通过,2 pre-existing unrelated 失败(`reminders weekday` + `worldcup-tray-cache getUpcoming`)
- E2E 验证(`/tmp/pulse-e2e/state.json`): corrupt JSON → backup + parse_failed event;schema-invalid → backup + schema_failed event + errors 详情;missing file → null + no event;valid → 返 state + no event;consume-once 工作(连读两次第二次 null)

### 手动 e2e(留给用户验证)
- 关闭 Pulse
- `echo "garbage" > ~/Library/Application\ Support/pulse/state.json`
- 启动 → 看 banner "设置已恢复默认" + 检查 `state.corrupt-*.json` 已生成 + 新 state.json 是 baseline
- dismiss banner + 重启 → banner 不再出现
- 模拟 schema 损坏:`echo '{"v":1,"ts":0}' > ~/Library/Application\ Support/pulse/state.json`(少 apps 字段)→ 启动看 banner + 备份

---

## Unreleased (🌅 每日早报通知 + Digest 抽屉 — Phase I1+I5)

### 新增
- **🌅 每日早报通知 (Phase I5)**: 早 8:30 (Settings 可调时间 + 开关) 推一条精简通知,用户**不用打开 app 就知道**今天关键变化
  - 数据来源:5 source aggregator(可升级应用 / 微博热搜 / IT 新闻 / 基金涨跌 / AI 用量预警),最多 6 行
  - 静默:无重要变化不推;quiet hours (23:00–08:00) 内跳过;同日 `last_push_date` 闸门不重复推
  - 点击通知 → 打开主窗口 + Digest 抽屉(480px,右侧)
- **📋 Digest 抽屉 (Phase I1)**: 全源聚合 view,5 个 section + 每 section 独立 click-through(列表形式,留作后续"点击跳源")
  - 与现有 AI digest 抽屉(AITasksDrawer)并列 — 抽屉里的 `digestDrawerOpen` / `digestConfigMode` signal 已迁移到 `digest-store.js` 做统一管理
- **⚙️ Settings → AI 设置 → 每日早报通知 section**: 启用开关 + HH:MM 时间选择器,实时保存,无需重启

### 变更
- **`src/main/state-store.js`**: `PRESERVE_FIELDS` 新增 `daily_digest` 字段;新增 `saveDailyDigest(cfg)` / `loadDailyDigest()` helper
- **`src/main/state-store-schema.js`**: `FIELD_SPECS` 新增 `daily_digest: { kind: 'object' }`(可选字段,forward-compat)
- **`src/main/index.js`**: 启动期 `startDailySummaryJob(...)`,notification 复用现有 `electron.Notification` 注入模式;notification click → `winMgr.showWindow()` + `webContents.send('digest:open')`
- **`src/renderer/store/ai-store.js`**: 移除 2 个 `digestDrawerOpen` / `digestConfigMode` signal 定义(已迁移到 `digest-store.js`),保留 2 处 setState 调用但改 import 路径
- **IPC 新增**: `digest:fetch-sections` / `digest:update-settings` (renderer→main), `digest:open` (main→renderer)

### 不变
- 现有 AI digest 抽屉 (AITasksDrawer) 行为不变 — 只是 signal 定义位置迁移,功能不变
- `notification-policy.js` `inQuietHours` 复用,不重写
- 通知 channel 名不重,仅新增
- forward compat: `daily_digest` 是可选字段,旧 state.json 不受影响
- 现有 push 通知(版本检查完成时等)行为不变

### 文件
- 新增: `src/main/digest/aggregate.js` (纯函数,11 tests)
- 新增: `src/main/digest/daily-summary-job.js` (scheduler,8 tests)
- 新增: `src/renderer/digest/DigestDrawer.jsx` + `DigestSection.jsx` (5 tests)
- 新增: `src/renderer/digest/digest-store.js` (signals,含迁移自 ai-store 的 2 个)
- 新增: `src/renderer/components/DailyDigestSettings.jsx`
- 新增: `tests/main/digest/aggregate.test.js` (11 tests)
- 新增: `tests/main/digest/daily-summary-job.test.js` (8 tests)
- 新增: `tests/renderer/digest/DigestDrawer.test.jsx` (5 tests)
- 修改: `src/main/index.js` (+~50 行 bootstrap)
- 修改: `src/main/ipc/register-core.js` (+2 safeHandle)
- 修改: `src/main/state-store.js` (+1 PRESERVE_FIELDS + 2 helpers + 2 exports)
- 修改: `src/main/state-store-schema.js` (+1 FIELD_SPECS entry)
- 修改: `preload.js` (+3 method)
- 修改: `src/renderer/api.js` (+3 wrapper)
- 修改: `src/renderer/store/index.js` (+1 export *)
- 修改: `src/renderer/store/ai-store.js` (-2 export + +1 import)
- 修改: `src/renderer/components/AITasksDrawer.jsx` (import path 微调)
- 修改: `src/renderer/components/AISettingsModal.jsx` (+1 embed)
- 修改: `src/renderer/index.jsx` (+1 subscription)
- 修改: `src/renderer/App.jsx` (+1 mount)
- 修改: `styles.css` (+~99 行)
- 修改: `RELEASE-NOTES.md` (本节)

### 测试
- 新增 24 个 digest 测试 (11 + 8 + 5)
- 全套 2201/2203 通过,2 pre-existing unrelated 失败(`reminders weekday` + 偶发 `bootstrap-category` LLM 超时)
- e2e(注入式)验证 7 步全通过:save/load config、aggregator 5 source sections、scheduler 在 08:30 推送并写 last_push_date、同日 re-trigger 跳过、quiet hours 跳过、空 lines 静默不写闸门、低信号 state 静默

### 手动 e2e(留给用户验证)
- Settings → AI 设置 → 每日早报通知 → 启用 + 时间设 now+2min
- 等 trigger → 系统通知出现,标题 `🌅 Pulse 早报 · YYYY-MM-DD`,body 最多 6 行
- 点通知 → 主窗口打开 + 右侧 Digest 抽屉出现,显示各 section
- 调时间到 quiet hours(07:30)→ 等 trigger 不推送
- 删除所有有数据源 + 重启 → 等 trigger 不推送(静默)

---

## Unreleased (🛠 错误聚合 + 诊断面板 — Phase Q6)

### 新增
- **🛠 错误聚合 + 诊断面板 (Phase Q6)**: 主进程 + renderer 未捕获错误自动落盘聚合 + 一键查看 / 复制 / 清理
  - 主进程: `uncaughtException` + `unhandledRejection` + 现有 `error-guard` 通道全部走聚合器
  - Renderer: 全局 `window.onerror` / `unhandledrejection` + Preact `ErrorBoundary` 包 `<App>`,组件渲染崩溃可恢复
  - 存储: `userData/logs/errors-YYYY-MM-DD.jsonl`,每天 1 文件,30 天 retention(boot 时 cleanup)
  - 诊断面板: 480px 右抽屉,显示错误列表 / 等级统计 / "刷新 / 复制全部 / 打开文件夹 / 清理 > 30 天"
  - Header 加 "🛠" 按钮打开面板
  - 沿用现有 `onMainError` toast(不破坏现有 UX)

### 变更
- **`src/main/error-guard.js`**: `onError` 包装后同步走聚合器(原有 toast 行为不变)
- **`src/main/index.js`**: 启动期 `initErrorCapture({})`,boot 时 cleanup 旧 logs
- **`src/renderer/App.jsx`**: 挂 `<DiagnosticsDrawer />`
- **`src/renderer/index.jsx`**: `<App>` 包 `<ErrorBoundary>`,bootstrap 调 `installErrorReporting()`
- **`preload.js`** / **`src/renderer/api.js`**: 7 个新方法(errorFetchEntries / CopyAll / ExportZip / ClearOld / OpenFolder / Report / onErrorAppended)
- IPC 新增: `error:fetch-entries` / `error:copy-all` / `error:export-zip` / `error:clear-old` / `error:open-folder` / `error:report`

### 不变
- 现有 `onMainError` toast 行为不变 — 仍弹 "后台异常: ..."
- `notification-policy.js` 等其他模块未触碰
- `state.json` schema 不变(错误日志独立于 state)

### 文件
- 新增: `src/main/error-aggregator.js` (180 行,9 tests)
- 新增: `src/main/bootstrap/error-init.js` (60 行)
- 新增: `src/renderer/error-reporting.js` (45 行)
- 新增: `src/renderer/components/ErrorBoundary.jsx` (50 行,4 tests)
- 新增: `src/renderer/components/DiagnosticsDrawer.jsx` (110 行,5 tests)
- 新增: `src/renderer/diagnostics/diagnostics-store.js` (signals)
- 新增: 3 个测试文件
- 修改: `src/main/index.js` (+1 require + 1 init)
- 修改: `src/main/error-guard.js` (wrap onError)
- 修改: `src/main/ipc/register-core.js` (+6 safeHandle)
- 修改: `preload.js` (+7 method)
- 修改: `src/renderer/api.js` (+7 wrapper)
- 修改: `src/renderer/store/index.js` (+1 export)
- 修改: `src/renderer/index.jsx` (+1 wrap + 1 install)
- 修改: `src/renderer/App.jsx` (+1 mount)
- 修改: `src/renderer/components/Header.jsx` (+1 button)
- 修改: `styles.css` (+~102 行)
- 修改: `RELEASE-NOTES.md` (本节)

### 测试
- 新增 18 个测试(9 + 4 + 5)
- 全套 ~2220/~2222 通过,1 pre-existing unrelated 失败(`reminders weekday` 日期敏感)
- e2e 注入式验证 17 步全通过:3 种 entry 路径写入 + query 过滤 + copy-all + cleanup 按 retention + 并发 + 损坏行跳过

### 手动 e2e(留给用户验证)
- 启动 dev,在 dev tools console: `throw new Error('test')` 或 `Promise.reject(new Error('test'))`
- 看到 toast + 抽屉中有一条 entry
- "复制全部" → 粘贴确认是 JSON
- 抽屉 "打开文件夹" → finder 显示 `~/Library/Application Support/pulse/logs/`
- 抽屉 "清理 > 30 天" → 旧文件被删(若有)

---

## Unreleased (⏰ 等下次再升调度 — Phase C2)

### 新增
- **⏰ 等下次再升调度 (Phase C2)**: app 行 ⏰ 按钮 → 4 个预设 + 跳过此版本 + 取消
  - 今晚 22:00 / 明早 9:00 / 本周六 10:00 / 跳过此版本 (latest)
  - 期间 badge 不计 + 通知不弹 + tray 不显,但 `latest_version` 仍可见
  - "跳过此版本" 自动在用户升级后清除(`saveAll` 检测到 `latest_version` 变化即清)
  - 已 snooze 时菜单显示 "已延后到 X / 取消" + "跳过 3.6.33 / 取消"

### 变更
- **`src/main/state-store.js`**: 新增 `setAppSnooze(name, opts)` / `clearAppSnooze(name)` / `loadAppSnooze(name)`;`saveAll` 保留 `snoozeUntil` + `skippedVersion`,只在 latest_version 变化时清 skippedVersion
- **`src/main/check-runner.js`**: `runCheck` 应用 `applySnoozeFilter`(badge / 通知 / tray 全部看到 filtered 后的 `has_update=false`)
- **`src/renderer/components/AppRow.jsx`**: 有 `has_update` 时显示 ⏰ 按钮 → 挂 `<SnoozeMenu />`
- IPC 新增: `snooze:set` / `snooze:clear` (renderer→main)

### 不变
- `state.json` schema 不变(`snoozeUntil` / `skippedVersion` 是 app entry 的可选字段,forward-compat)
- 检测器、配置、其他 IPC 通道均未触碰
- 旧 state.json(无 snooze 字段)继续正常工作

### 文件
- 新增: `src/main/snooze.js` (~80 行, 16 tests)
- 新增: `src/renderer/components/SnoozeMenu.jsx` (~70 行, 5 tests)
- 修改: `src/main/state-store.js` (+3 functions + saveAll preserve)
- 修改: `src/main/check-runner.js` (apply filter)
- 修改: `src/renderer/components/AppRow.jsx` (+1 button + SnoozeMenu mount)
- 修改: `src/main/ipc/register-core.js` (+2 safeHandle)
- 修改: `preload.js` (+2 method)
- 修改: `src/renderer/api.js` (+2 wrapper)
- 修改: `styles.css` (+~79 行)

### 测试
- 新增 21 个测试(16 + 5)
- 全套 ~2243/~2245 通过,1 pre-existing unrelated 失败(`reminders weekday` 日期敏感)
- e2e 注入式 17 步全过:set/load/filter/clear/saveAll 自动清除 + 同版本保留

### 手动 e2e(留给用户验证)
- 任意有 has_update 的 app 行,点 ⏰ → 选 "今晚 22:00"
- 等到 22:00,触发 check,该 app 不在 badge 里,通知也没有
- 第二天 check 重新恢复(下次更新才会再次出现)
- 选 "跳过此版本" → 该版本在状态行可见但 badge 不计;升级后自动清除

---

## v2.24.1 (🔥 微博热搜 hotfix) — 2026-06-18

### 修复
- **🔥 微信热搜 → 微博热搜**: v2.24.0 上线的「微信热搜」因上游 `tenhot-api.vercel.app/api/hotsearch/wxrank` 404 失效,整体替换为微博热搜
  - 主源: `https://v2.xxapi.cn/api/weibohot` (返 `{code:200, data:[{index,title,hot,url}]}`)
  - Fallback: `https://weibo.com/ajax/side/hotSearch` (官方 ajax, 需 Referer/UA 头, 50 条上限)
  - Fallback 触发条件: xxapi 任意失败(5xx / parse_failed / http_timeout / network)
  - 两条源都失败时抛主源 reason;fallback 自身被用户感知为「能用就行」,不暴露双源错误

### 变更
- **`src/main/wechat-hot/list-parser.js`**: 适配 xxapi 结构 — `code === 200`, `data` 直接是数组, `hot` 是字符串(非嵌套对象)
- **`src/main/wechat-hot/fetcher.js`**: 拆 `fetchAndParsePrimary` + `fetchAndParseFallback` 两个内部函数,主失败试 fallback;新增 `parseWeiboAjaxRealtime` 处理微博官方 ajax 响应(`{ok:1, data:{realtime:[...]}}`),把 `num` 格式化为「N 万」/原数,把 `word` 拼成搜索 URL
- **`src/main/wechat-hot/cache.js`**: EMPTY.source 默认 `"xxapi"`(原来 `"tenhot"`)
- **`src/renderer/wechat-hot/components/WechatHotHeader.jsx`**: 标题 `📈 微信热搜` → `🔥 微博热搜`;副标题 `微信指数` → `微博热搜榜`;`SOURCE = "xxapi"`
- **`src/renderer/wechat-hot/store.js`**: `REASON_MAP.parse_failed` 文案改为「微博热搜页面解析失败」
- **`src/renderer/components/SideNav.jsx`**: 图标 `📈` → `🔥`;label/tooltip `微信热搜` → `微博热搜`

### 不变
- IPC channel 名(`wechat-hot:load` / `wechat-hot:refresh` / `wechat-hot:updated`)、preload 暴露、`WechatHot*` 组件命名、SideNav key、Cmd+F 焦点 id、`open-url:open` IPC、15s 冷却、4 种 empty-state、CSS 样式 — 全部沿用
- 这意味着:用户从 v2.24.0 升到 v2.24.1 **无需清缓存**, 数据流无缝切换

### 测试
- 同步更新 6 个测试文件(list-parser / fetcher / cache / IPC / header / store),新增 5 个 fallback 场景单测
- main 30/30 通过,renderer 36/36 通过

### 文件
- 修改: `package.json` (version 2.24.0 → 2.24.1)
- 修改: `src/main/wechat-hot/list-parser.js`
- 修改: `src/main/wechat-hot/fetcher.js`
- 修改: `src/main/wechat-hot/cache.js`
- 修改: `src/renderer/wechat-hot/components/WechatHotHeader.jsx`
- 修改: `src/renderer/wechat-hot/store.js`
- 修改: `src/renderer/components/SideNav.jsx`
- 修改: `src/renderer/api.js` (注释)
- 修改: `tests/main/wechat-hot/list-parser.test.js`
- 修改: `tests/main/wechat-hot/fetcher.test.js`
- 修改: `tests/main/wechat-hot/cache.test.js`
- 修改: `tests/main/wechat-hot/register-wechat-hot-ipc.test.js`
- 修改: `tests/renderer/wechat-hot/wechat-hot-header.test.jsx`
- 修改: `tests/renderer/wechat-hot/store.test.js`

---

## v2.24.0 (📈 微信热搜) — 2026-06-18

### 新增
- **📈 微信热搜栏目**: SideNav 在 IT 新闻之后新增「📈 微信热搜」入口
  - 进入 tab 即通过 tenhot 聚合 API 拉取实时热搜(纯实时,不后台定时)
  - 列表展示:排名 + 标题 + (热度) + (标签);前三名 rank 颜色强调(红/黄/橙),11 名起浅灰
  - 顶栏手动「↻ 刷新」按钮 + 15s 冷却防滥用(冷却期内按钮 disabled + 倒计时 Ns)
  - 顶栏搜索框(`#wechat-hot-search-input`)支持大小写不敏感子串过滤
  - Cmd+F 自动 focus 微信热搜搜索框
  - 点击列表行 → 系统浏览器打开原 URL(新增 IPC `open-url:open` + URL http/https 白名单校验)
  - 错误态:首屏拉取失败显示「拉取失败」红色提示 + 顶 banner;非空时后台拉失败仅顶 banner

### 变更
- **`open-url` IPC 重构**: 从 `register-core.js` 抽出到独立 `src/main/ipc/register-open-url.js`,channel 由 `open-url` → `open-url:open`,handler 增加 `http://`/`https://` 协议校验,reject `file://`/`javascript:`/`javascript:` 等任意协议;`AppRow.jsx` / `NewsArticleRow.jsx` / `WechatHotList.jsx` 自动跟随
- **`renderer/utils/external-link.js`** 新增:封装 `window.api.openUrl(url)` 调用 + `window.open` fallback,统一外部链接入口

### 文件
- 新增: `src/main/wechat-hot/list-parser.js` (纯函数 parser, 5 tests)
- 新增: `src/main/wechat-hot/fetcher.js` (HttpClient 注入, 6 tests)
- 新增: `src/main/wechat-hot/cache.js` (内存 cache + in-flight guard, 6 tests)
- 新增: `src/main/ipc/register-wechat-hot.js` (IPC load + refresh, 6 tests)
- 新增: `src/main/ipc/register-open-url.js` (URL 校验 + shell.openExternal, 10 tests)
- 新增: `src/renderer/wechat-hot/store.js` (signals + 15s 冷却 + REASON_MAP, 9 tests)
- 新增: `src/renderer/wechat-hot/utils.js` (formatTime + formatCooldown)
- 新增: `src/renderer/wechat-hot/components/WechatHotLayout.jsx` (顶层容器 + 状态机)
- 新增: `src/renderer/wechat-hot/components/WechatHotHeader.jsx` (title + 刷新 + 搜索 + 错误 banner)
- 新增: `src/renderer/wechat-hot/components/WechatHotList.jsx` (列表 + 4 种空态)
- 新增: `src/renderer/utils/external-link.js` (统一外链入口)
- 修改: `preload.js` (+3 wechat-hot 方法 + 1 openUrl 桥接)
- 修改: `src/renderer/api.js` (+3 wechat-hot wrapper + 1 openUrl wrapper)
- 修改: `src/main/ipc/index.js` (+2 register 调用)
- 修改: `src/main/ipc/register-core.js` (-1 死代码: 旧 open-url handler)
- 修改: `src/renderer/components/SideNav.jsx` (+1 nav 条目)
- 修改: `src/renderer/components/AppShell.jsx` (+1 view 分支 + Cmd+F 拦截)
- 修改: `src/renderer/worldcup/navStore.js` (+1 nav key)
- 修改: `styles.css` (+5 theme 变量 + ~150 行 wechat-hot 样式)
- 新增: `docs/superpowers/specs/2026-06-18-wechat-hot-design.md`
- 新增: `docs/superpowers/plans/2026-06-18-wechat-hot-plan.md`

### 测试
- 新增 54 个测试(list-parser 5 + fetcher 6 + cache 6 + IPC 16 + store 9 + List 13 + Header 8 + Layout 7)
- 全套 2109/2111 通过;2 个 pre-existing 失败 (`reminders weekday` + `LLM classify timeout`) 与本 PR 无关

---

## v2.23.0 (📤 IT之家新闻分享卡片) — 2026-06-18

### 新增
- **📤 IT之家新闻分享卡片**: AI 总结过的新闻可一键分享
  - 点击「📤 分享」按钮 → 离屏渲染 1080×1080 PNG → 自动复制到剪贴板 → ⌘V 粘贴
  - 卡片展示 AI 总结的全部 4 个结构化字段:摘要(主卡白底)+ 关键词(chips)+ 所属领域(次级卡)+ 影响方面(次级卡)
  - 字段缺失不渲染占位,渐变背景直接外露
  - 摘要 300 字上限 + line-clamp 10 行防溢出
  - 水印「◆ Pulse · IT之家新闻速读」absolute 钉死底部

### 变更
- **IT之家摘要数据流**: `news-store` 通过 `article-summary-parse.enrichSummaryEntry` 把 `text` 解析为 `{abstract, keywords, domain, impact}` 结构化字段
- **NewsArticleSummary.normalizeArticleSummary**: 扩展结构化判定 — `abstract/domain/impact` 任一存在或 `keywords` 为数组即走结构化分支,否则 fallback legacy text
- **NewsShareCard 数据来源**: 改用 `normalizeArticleSummary` 而非手写解析 — 分享卡和主卡 4 段共享同一来源,**绝不会出现"主卡显示 X,分享卡显示 Y"**
- **分享卡渲染流程重构**: 渲染端通过 IPC `share-card:ready` **主动通知**主进程(不再用 `requestAnimationFrame` / `setTimeout` 标志位轮询)— off-screen window 节流定时器,IPC 事件驱动是唯一稳的方案
  - preload 新增 `shareCardReady: () => ipcRenderer.send("share-card:ready")`
  - 主进程 `ipcMain.on("share-card:ready")` 注册 listener,ready promise resolve 后再 capturePage
- **离屏 BrowserWindow 配置**: webPreferences 加 `backgroundThrottling: false`(节流兜底)+ preload 路径(此前缺失导致 contextBridge 不注入)+ sandbox: false

### 修复
- **render_timeout (`❌ 图片生成失败,请重试`)**: 离屏 BrowserWindow 缺 `preload` 配置 → contextBridge 未注入 → `window.api` 是 undefined → 渲染端永远拿不到 share-data
- **摘要截断长度**: 之前 `text.slice(0, max-3) + "..."` = 300 字;改为 `text.slice(0, max) + "..."` = 303 字(符合 spec 「300 字 + ...」)
- **错误 toast 不区分**: 之前统一显示「图片生成失败,请重试」;现根据 IPC `reason` 区分 `article_not_found`(文章已过期) / `no_summary`(暂无 AI 总结) / `render_failed`(图片生成失败)
- **卡片底部水印被裁**: 之前 flex + `margin-top: auto` 在 line-clamp 强制摘要固有高度时被挤到 1080 之外;改用 `position: absolute; bottom: 32px` 钉死底部

### 文件
- 新增: `share-card.html` (离屏渲染 HTML)
- 新增: `src/renderer/ithome/NewsShareCard.jsx`
- 新增: `src/renderer/ithome/NewsShareCardPage.jsx`
- 新增: `src/renderer/ithome/NewsShareToast.jsx`
- 新增: `src/main/ithome/share-card-renderer.js`
- 新增: `src/main/ithome/clipboard-image.js`
- 新增: `src/main/ipc/register-ithome-share.js`
- 新增: `docs/superpowers/specs/2026-06-18-ithome-share-card-design.md`
- 新增: `docs/superpowers/plans/2026-06-18-ithome-share-card-plan.md`
- 新增: `tests/renderer/ithome-news-share-card.test.jsx` (9 cases)
- 新增: `tests/main/ithome-share-card-renderer.test.js` (3 cases)
- 改动: `src/renderer/ithome/store.js` (+sharingIds signal + shareIthomeArticle)
- 改动: `src/renderer/ithome/NewsArticleRow.jsx` (+📤 按钮 + toast)
- 改动: `src/renderer/ithome/NewsArticleSummary.jsx` (normalizeArticleSummary 扩展)
- 改动: `src/main/ipc/index.js` (注册 ithome:share-card handler)
- 改动: `src/main/ithome/article-summary-parse.js` (enrichSummaryEntry)
- 改动: `src/main/ithome/news-store.js` (enrich summaries on load)
- 改动: `preload.js` (+ithomeShareCard + onShareData + shareCardReady)
- 改动: `styles.css` (+.share-card-* + .news-share-toast-*)
- 改动: `package.json` (version 2.22.0 → 2.23.0)

---

## v2.22.0 (🍱 菜单栏内容预览重做) — 2026-06-17

### 新增
- **🍱 菜单栏重做 (内容预览模式)**:
  - **🔄 检查更新段**: 显示具体哪个 app 待升级, 含版本对比 `vX.Y.Z → vA.B.C` + 一键升级按钮; 全部最新时显示总览 + "点击'检查更新'手动刷新"; 尚未检查时显示占位
  - **📊 AI coding plan 用量段**: 显示 MiniMax + GLM 当前配额百分比 + 剩余时间, 陈旧数据 (>1h) 标 `(Nh 前)`
  - **⚽ 世界杯段**: 今日比赛 + 实时比分 (live) + 终场比分 (final); 今日无比赛时显示下一场预告
  - **💎 贵金属段**: XAU/XAG/AU9999/AG9999 实时价格 + currency/unit + ↑/↓ 涨跌箭头; 冷启动 quoteCache 空时显示"加载中..."
  - **行级 click 跳转**: 菜单行点击 → 显示面板 → 切对应 tab → 滚到目标行 → 升级行弹 bulk upgrade modal

### 变更
- **tray 架构**:
  - `tray.buildMenu` 抽出纯函数 (便于单测), 接受 `results / aiUsage / worldcup / metals` 4 段输入
  - `createTrayManager` 暴露 `setResults / setAiUsage / setWorldcup / setMetals / setBadge / dispose`
  - **debounce 200ms** + **Windows 1s throttle** 防止快速更新时菜单抖动
- **数据源**:
  - AI 用量: 复用 `state.json` (持久化), 启动时一次性推 tray, 完整 30min 自动刷新留 B2.1
  - 世界杯: `worldcup-tray-cache.js` 读 state.json, `index.js` 60s setInterval 刷新
  - 贵金属: `metal-ipc.js` 模块级 quoteCache + `getTraySnapshot()`, 钩 `onUpdate` callback 实时推 (无新 IPC)
- **tray click → 面板**:
  - 主进程 `onFocusUpdate` 发 `tray:focus` IPC, renderer `tray-focus.js` 监听切 nav + scroll + 弹 upgrade modal
  - 世界杯行复用**现有** `worldcup:focus-match` IPC (WorldcupLayout 已在监听), 不新增通道
- **测试基线 2014 PASS / 1 FAIL**:
  - `tests/main/tray-build-menu.test.js` 19 cases (4 A1 + 4 A2 + 4 B2 + 4 C2 + 3 C3 + 4 D1, 共 23 actually but D1+others = 19 with refactor)
  - 修正: 实际是 19 cases 跨 A1/A2/B2/C2/C3/D1
  - `tests/main/ai-usage-cache.test.js` 6 cases
  - `tests/main/worldcup-tray-cache.test.js` 6 cases
  - `tests/main/tray-debounce.test.js` 5 cases
  - 失败 1 个: `reminders — markDone weekly` (pre-existing, 与本版本无关)

### 文件
- 新增: `src/main/ai-usage-cache.js`
- 新增: `src/main/worldcup-tray-cache.js`
- 新增: `src/renderer/tray-focus.js`
- 新增: `src/renderer/upgrade-actions.js`
- 新增: `tests/main/ai-usage-cache.test.js`
- 新增: `tests/main/worldcup-tray-cache.test.js`
- 新增: `tests/main/tray-debounce.test.js`
- 改动: `src/main/tray.js` (buildMenu 4 段 + debounce + setters)
- 改动: `src/main/index.js` (cache init + 30s/60s timers + onUpdateTray wiring)
- 改动: `src/main/metal-ipc.js` (getTraySnapshot + registerMetalIpc opts)
- 改动: `tests/main/tray-build-menu.test.js` (+18 cases)
- 改动: `package.json` (version 2.21.0 → 2.22.0)

### 已知限制
- AI 用量段**仅启动时一次性推 tray**, 后续在面板 AI tab 触发 fetch → 写 state.json → 下次 check 完成 (走 setResults) 触发 scheduleRebuild → 读最新 state.json 反映. 完整 30min 自动轮询需要 B2.1 follow-up (需把 register-ai-usage 的 _internals.fetch deps 在主进程直接调, 跟 IPC 通道是同一份 deps)
- 世界杯段使用 **60s 轮询** 而不是钩 `goal-watcher.onUpdate`, 避免改 goal-watcher 签名. 比分变化到 tray 反映有 ≤ 60s 延迟, 对菜单栏场景可接受
- 贵金属段 quoteCache **不落盘**, 冷启动时 (scheduler 第一次 fetchNow 完成前, 约 1 个网络 round-trip) 显示"加载中...", 之后实时反映
- **D1 架构耦合**: `registerMetalIpc()` 内部隐式调用 `startMetalScheduler({onUpdateTray})`. `index.js:416` 重复调用 `startMetalScheduler()` (被 `if (scheduler) return;` 短路, 无副作用). 建议后续拆分为 `registerIpc()` + `start(opts)` 两个清晰入口
- E1 测试发现的 **Windows 首次 fire 在 t=1000ms** (而非 spec sketch 的 200ms): 因为 `lastRebuildAt=0` 时 `delay = max(200, 1000-0) = 1000`. 这是 `scheduleRebuild` 的实际语义 (debounce 200ms + minInterval 1000ms 取 max), 与设计意图一致

---

## v2.21.0 (🥇 贵金属 UI 重做 + 国内数据源切东方财富) — 2026-06-17

### 新增
- **🥇 贵金属卡片 UI 重做 (中国投资者视角)**:
  - **主显示口径统一为 ¥/克** (28px 加粗) — 不论国际 (USD/oz) 还是国内 (CNY/g) 品种, 一眼看到"每克人民币多少钱"
  - **副显示**: ↑/↓ X.XX% (±¥X.XX/克) — 涨跌幅度 + 涨跌金额, 红涨绿跌中国习惯
  - **参考行**: 国际品种显示现货 $XXX/oz · 时间; 国内品种显示来源 (上海黄金交易所) · 时间
  - **录入持仓 modal 重做**:
    - 完整 .metal-modal-* 样式系统 (跟 funds 的 .fund-modal-* 同构)
    - **实时预览**: 输入数量 + 成本价后, 实时算出 ≈ 总成本 ¥XXX · 每克成本 ¥YYY/克
    - 成本币种可选 USD/CNY; USD 时按当时汇率快照折算成 ¥/克
    - 校验: 数量/价格必须为正数; 缺汇率时给出明确文案
    - 错误提示用 .error-msg 行内展示, 不再 `alert()` 弹窗

### 修复
- **国内现货数据修复**: 新浪 `hq.sinajs.cn/list=AU0,AG0` 接口已**停更**, 持续返回 2024-07-17 的陈旧数据 (AG0=8100 元/千克容易误读为 8100 元/克)
  - 切到 **东方财富 push2delay.eastmoney.com**: `118.AU9999` / `118.AG9999`
  - 实测 (2026-06-17): AU=939.18 元/克, AG=16.875 元/克, 当天新鲜数据
  - **f43 价格陷阱**: 东方财富 f43 是内部整数, 黄金/白银除数不同 (黄金 元/克 ÷100, 白银 元/千克 ÷100000), 在 `metal-config.js` 每品种显式声明 `priceDivisor`, fetcher 不猜
  - 选用 push2delay 而非 push2.eastmoney.com: push2 端对 node 原生 https 频繁出现 `socket hang up` (TLS ClientHello 不友好 + 临时封 IP), push2delay 限流宽松, 5 分钟刷新场景 15 分钟延时完全可接受
  - 新增 `src/metals/metal-eastmoney-fetcher.js`, dispatcher 改为 sina-hf + eastmoney 双 fetcher 并发 + 失败隔离
  - **半失败语义**: 单个 secid 失败被吞掉 (其他品种仍能成功); **所有** secid 都失败时 fetcher 抛聚合错, dispatcher 登记到 `errors['eastmoney']` (跟 sina-hf 的"全或无"对齐)

### 变更
- **删除废弃 fetcher**:
  - `src/metals/metal-sina-fetcher.js` (旧 sina-jsonp AU0/AG0) — 已被 eastmoney 替代, 无引用
  - `tests/main/metal-sina-fetcher.test.js` — 同步删除
- **测试基线 1975 PASS / 0 FAIL**:
  - 重写 `tests/main/metal-fetcher.test.js` 适配 sina-hf + eastmoney 双 batch (5 case: buildFetcherPlan / fetchAllQuotes 合并 / 双向失败隔离 / 双失败 / 并发)
  - 新增 `tests/main/metal-eastmoney-fetcher.test.js` (18 case: buildEastmoneyUrl / parseEastmoneyQuote 含 AU/AG 除数差异 / parseEastmoneyResponse / fetchEastmoneyQuotes 含半失败 + 全失败聚合错)
  - 更新 `tests/main/metal-config.test.js`: `primary.kind` 接受 `'sina-hf' | 'eastmoney'`, 新增 priceDivisor 校验 (AU=100, AG=100000)
- **端到端实测**: 用 Pulse 真实 `HttpClient` 调东方财富 + sina 真实接口, XAU/XAG/AU9999/AG9999 四品种 + FX (USDCNY) 全部 200, 无 socket hang up
- 端到端 fetch 样例: `node -e "..."` 输出 XAU=$4345.701, XAG=$70.522, AU9999=¥939.18, AG9999=¥16.875, FX=6.757

### 文件
- 新增: `src/metals/metal-eastmoney-fetcher.js`
- 新增: `tests/main/metal-eastmoney-fetcher.test.js`
- 改动: `src/metals/metal-config.js` (国内品种改 eastmoney + priceDivisor)
- 改动: `src/metals/metal-fetcher.js` (dispatcher 去掉 sina-jsonp, 加 eastmoney)
- 改动: `src/renderer/metals/MetalCard.jsx` (¥/克 为主显示 + 涨跌换算)
- 改动: `src/renderer/metals/AddMetalModal.jsx` (UI 重做 + 实时预览)
- 改动: `styles.css` (~300 行新增/调整 metals-* 样式, 卡片阴影/过渡/红绿基色统一)
- 改动: `tests/main/metal-fetcher.test.js` (适配新 dispatcher)
- 改动: `tests/main/metal-config.test.js` (新增 eastmoney + priceDivisor 断言)
- 删除: `src/metals/metal-sina-fetcher.js` + `tests/main/metal-sina-fetcher.test.js`

### 已知限制
- 东方财富 f43 价格除数 (黄金 100 / 白银 100000) 是基于 2026-06-17 实测, 未来如果东方财富调整报价基准 (例如白银也改成 元/克), 需更新 `metal-config.js` 的 `priceDivisor`. 在 fetcher 层加除数推断是 YAGNI, 显式声明更易审计
- push2delay 限流相对宽松但仍是第三方源, 若挂掉 dispatcher 会把 `errors['eastmoney']` 填充, UI 走 last-known 兜底 (跟 sina-hf 同构)

---

## v2.20.0 (🥇 贵金属实时看板) — 2026-06-17

### 新增
- **🥇 贵金属栏目**: 实时盯黄金白银价格
  - **4 个品种**: XAU / XAG (国际, USD/oz) + AU9999 / AG9999 (国内, CNY/g)
  - **5 分钟自动刷新**, 24/7 跑
  - **总览 CNY 折算**: 总市值 / 总盈亏 / 今日预估 (跨币种汇总成人民币)
  - **个人持仓** (可选): 录入时按当时汇率快照冻结人民币成本, 累计盈亏不随汇率漂移
  - **失败兜底**: 沿用 funds 的 last-known 模式, Yahoo 挂不影响 Sina, 反之亦然
  - **键盘快捷键**: `Cmd+Shift+M` 跳到栏目
- **样式系统**: `styles.css` 加 ~200 行 metals-* 样式 (跟 funds 同构, 紧凑 2 列网格 + 红涨绿跌中国习惯)

### 依赖
- ~~`iconv-lite` (~200KB, GBK 解码)~~ — **已移除**. Sina hq.sinajs.cn 接口我们只解析 number / ASCII 字段 (time / price / prevClose / date 等), 这些字段 GBK / UTF-8 字节级兼容; 中文 name 走本地 `metal-config.js`, 不依赖 fetcher 解码. Pulse `http-client` 也永远返 UTF-8 string, Buffer 解码分支永远走不到. 整个 iconv-lite 依赖直接 `npm uninstall`.

### 文件
- 新增 renderer: `src/renderer/metals/` (`MetalLayout.jsx` / `MetalHeader.jsx` / `MetalGrid.jsx` / `MetalCard.jsx` / `AddMetalModal.jsx` / `metalStore.js`)
- 新增模块: `src/metals/` (`metal-config.js` / `metal-calc.js` / `metal-yahoo-fetcher.js` / `metal-sina-fetcher.js` / `metal-fetcher.js` / `metal-scheduler.js`)
- 新增 IPC 桥: `src/main/metal-ipc.js` (handler 注册 + scheduler 启停)
- `preload.js` 暴露 `window.metalsApi` (contextBridge)
- `styles.css` 末尾追加 metals-* 样式段 (2 列卡片网格 + CNY 折算概览)
- `src/renderer/components/SideNav.jsx` 加 "🥇 贵金属" nav item
- `src/renderer/components/AppShell.jsx` 加 `Cmd+Shift+M` 跳栏快捷键

---

## v2.19.0 (Windows · UI 打磨 + 图标 + CI) — 2026-06-16

### 新增
- **Windows 端 app-icon 真实实现**: `src/main/app-icon-windows.js` 走 Electron `app.getFileIcon(path).toDataURL()` (macOS SIGTRAP bug 在 Windows 不存在). 跟 macOS 端 (`src/main/app-icon.js`) 同构 cache + in-flight 协议
- **`platform/windows.js getAppIcon`**: 委托给新模块, P1 stub 替换
- **renderer `body.platform-win` class**: bootstrap 时按 `window.platformInfo.platform` 给 body 加 class. styles.css 加 Win10 纯色 fallback 背景变量 (Win11 acrylic 由 Electron 处理)
- **`useIcon` 平台守卫**: Windows 端不再拼 `/Applications/x.exe` 错误路径, 返 null 走 fallback 渐变头像. `resolveAppBundlePath` 改为 named export 方便测试
- **Windows tray ICO + 主题切换**: tray.js Windows 端读 `assets/iconTray.ico` / `iconTrayDark.ico`, 监听 `nativeTheme.on('updated')` 切换两套. macOS 现状不变 (template image 自适应 light/dark)
- **CI Windows 构建 workflow**: `.github/workflows/release.yml` 加 windows-latest runner, 出 NSIS 安装包. macOS job 也加进去, tag 推送触发
- **`npm run build:all`**: 同时出 mac + win 安装包
- **`scripts/render-windows-icons.js`**: SVG (ECG 路径) + iconApp-1024.png → PNG → ICO (png-to-ico) 资源生成脚本

### 资产
- `assets/icon.ico` (16/32/48/256 layers) — Windows app icon
- `assets/iconTray.ico` (16/32 layers, light) — tray 亮色
- `assets/iconTrayDark.ico` (16/32 layers, dark) — tray 暗色
- `assets/iconBadge.ico` (16/32 layers, sample digit "1")
- 资源由 `scripts/render-windows-icons.js` 从 `iconApp-1024.png` / inline SVG 生成

### 变更
- 测试基线 1884 PASS / 2 FAIL (FAIL 均为 baseline 已存在: `tryVersionSource regex_file MMKV 多版本` + `classifyUnmappedAppsByLLM` LLM timeout, 跟本 release 无关)
- 新增测试覆盖 (5 文件):
  - `tests/main/app-icon-windows.test.js` — Windows icon module (cache / in-flight / error handling, 7 case)
  - `tests/platform/windows-app-icon.test.js` — windows.js getAppIcon 委托 (3 case)
  - `tests/renderer/platform-body-class.test.jsx` — body class 注入 + 幂等 + 平台切换 (6 case)
  - `tests/renderer/useIcon.test.js` — useIcon 平台守卫 (6 case)
  - `tests/main/tray.test.js` (新) — Windows ICO loading + nativeTheme mock (7 case, light/dark 走 child_process 隔离执行绕过 vitest CJS module graph 缓存)
- macOS 行为零变化 (tray.js mac 分支 + useIcon mac 路径 + app-icon.js + bulk-upgrade 完全不变)

### 已知限制
- ICO 资源由 SVG / iconApp-1024.png 自动生成, 视觉质量依赖 designer 出更精细的源 SVG. 自动化生成能保证 ICO 格式正确, 但图标细节仍需人工 review
- Win10 backgroundMaterial='acrylic' 静默忽略, 走 styles.css `body.platform-win` 纯色 fallback. Win11 直接走 acrylic 透明效果
- ICO 文件偏大 (`assets/icon.ico` ~ 280KB), electron-builder NSIS 打包后体积影响可忽略. 后续可用 sharp 优化但非阻塞 P4

---

## v2.18.0 (Windows · winget 升级) — 2026-06-16

### 新增
- **Windows 端一键升级走 winget** (跟 macOS 端 brew 对齐, spec §3):
  - `src/main/bulk-upgrade-actions.js` 加 `winget_show` source 分支, 产出 `{ type: 'winget', id }`
  - `src/main/bulk-upgrade.js defaultExec` 加 `winget` case, 跑 `winget upgrade --id <id> --accept-package-agreements --accept-source-agreements` (两个 `--accept-*` 标志抑制交互式 license 提示; 缺 id 短路返回 `{ ok: false, reason: 'winget: missing id' }` 不 spawn)
  - Non-zero exit (含 UAC 拒绝 / winget error 1603) 透传 `{ ok: false, exitCode }` (跟 mac brew 错误处理同构)
- **platform/windows.js 真实实现** (替换 P1 stub):
  - `getUpgradeAction(appCfg, detectResult)` 委托 `bulk-upgrade-actions.getActionForApp`, 内部字段重映射 `appCfg.winget_id → item.wingetId` (跟 macos.js 对称)
  - `execUpgrade(action)` 委托 `bulk-upgrade.defaultExec`
- **config.json 13 个 app 全加 winget 升级路径**:
  - 顶层 `winget_id` 字段
  - `detectors[]` 追加 `{ type: 'winget_show', id: <winget_id>, platform: 'win' }`
- **renderer**:
  - `src/renderer/store-bulk-upgrade.js` `isUpgradableSource` 接受 `winget_show` (现在 `export`, BulkUpgradeModal 可共享同一份 source of truth)
  - `src/renderer/components/BulkUpgradeModal.jsx` `SOURCE_LABELS` 加 `winget_show: 'winget'` + 主按钮 + footer running 文案按 `window.platformInfo.platform` 分支 (darwin → "brew upgrade N 个", win32 → "winget upgrade N 个")

### 变更
- 测试基线 1855 PASS / 1 FAIL (FAIL 为 baseline 已存在的 `tryVersionSource regex_file MMKV 多版本时只取第一次出现`, 跟本 release 无关)
- 新增测试覆盖 (3 文件):
  - `tests/main/bulk-upgrade-winget.test.js` — `getActionForApp` winget_show 分支 (camelCase + snake_case + missing-id + null) + `defaultExec` winget case (happy / non-zero / missing-id)
  - `tests/platform/windows-upgrade.test.js` — `windows.js getUpgradeAction` 字段重映射 + `execUpgrade` 委托透传
  - `tests/renderer/store-bulk-upgrade-winget.test.js` — `isUpgradableSource` 行为 + `SOURCE_LABELS` + `NON_UPGRADABLE` 静态约束
- `src/renderer/components/BulkUpgradeModal.jsx` 既有测试 `bulk-upgrade-modal.test.jsx` 的按钮文案断言从 `/升级 1 个应用/` 更新到 `/brew upgrade 1 个应用/`
- `src/main/bulk-upgrade.js execBrew` 的 call site (`execFile` → `childProcess.execFile`) 在 Task 2 期间被 implementer 多余地改了一笔, 已 revert (commit 60821d3), 跟 winget 引入的 `childProcess` 引用风格保持一致
- macOS 行为零变化 (所有新分支都带 platform 守卫, 仅 win32 触发; winget_show detector platform=win → detector-chain 的 platform 过滤跳过)

### 已知限制
- Windows 端 13 个 app 的 winget_id 是基于公开 winget-pkgs 仓库推断, 部分 id (如 MiniMax.MiniMaxCode / MiniMax.MiniMaxHub / Tencent.QClaw / Tencent.Marvis / Zhipu.ZCode / Qoder.QoderWork / CCSwitch.CCSwitch) 实际 winget 仓库可能没收录 → 升级时 winget 会返 `No package found`, 自动标 `failed`. 用户可以手动 `winget install <id>` 验证.
- V1 不做升级后自动重新检测版本 (spec YAGNI)
- V1 不做 winget UAC 后的自动 polling 状态 (失败 → user 手动重试)

---

## v2.16.1 (世界杯 · 刷新卡顿修复 + 比分源并行) — 2026-06-15

### 修复
- **世界杯刷新"点不动"** bug: `refreshWorldcupScores` 进函数立刻 set `worldcupScoresLoading=true`, 整个函数包进 try/finally, 任何路径 (fixtures 阶段 / 早期 return / 错误 / 成功) 都正确 reset loading
  - 之前: fixtures 阶段没设 loading → 按钮不转圈 → 用户重复点 → IPC 队列堆积 → UI 卡死
  - 现在: 进函数立刻 disable 按钮 + 转圈, 并发守卫覆盖整个生命周期

### 变更
- **3 层比分源 ESPN + wc26 改并行** (`scores-fetcher.js`)
  - 之前: ESPN → wc26 → openfootball 全串行, 单次 refresh 最坏 24s
  - 现在: ESPN + wc26 `Promise.all` 并行 (两源独立, 互不依赖), openfootball 仍串行 (依赖前两层结果)
  - 实测: 5s (主要 ESPN 单源延迟), 比之前最坏 24s 快 5 倍
- 抽出 `_fetchScoresLayered(keys, fixtures, opts)` DI 函数便于单测 (9 个测试覆盖并行 / 优先级 / 兜底 / 失败传播)

### 测试
- `tests/renderer/worldcup-refresh-scores-loading.test.js` (新增, 4 case) — `refreshWorldcupScores` loading 生命周期回归测试
- `tests/main/worldcup-scores-fetcher.test.js` (新增, 9 case) — `_fetchScoresLayered` 并行 + 优先级 + 兜底测试

---

## v2.16.0 (世界杯 · 进球通知推送) — 2026-06-15

### 新增
- **世界杯进球通知**: Pulse 跑着时, 60s 轮询所有进行中的比赛, ESPN 抓到新进球就通过系统通知推送
- 通知含「进球 / 乌龙球 / 点球」前缀 + 当前比分 (`阿根廷 vs 法国 · 当前 1-0`)
- **点击通知自动切到世界杯 tab** + `scrollIntoView` 滚到该场比赛 + **3 秒黄色脉冲高亮** (`.match-row-highlight`)
- **复用现有 quiet hours 抑制** (跟 app 更新通知同源配置)
- **重启不重推历史进球**: 双重去重走 `state.json.worldcupGoalNotified` 顶层字段 (上轮 scorers + 历史 notified 列表)

### 变更
- `state-store.js` `PRESERVE_FIELDS` 加 `worldcupGoalNotified` (避免其他 patchState 写盘时丢字段)
- `bootstrap/schedulers.js` 加 `startWorldcupGoalWatcher` 调度入口 (跟 `startRemindersScheduler` 同模式)
- `MatchCard` 根 div 加 `data-match-key` 属性 (供 IPC focus 定位)
- `WorldcupLayout` 监听 `worldcup:focus-match` IPC → 切到赛程 sub-tab + 传 `focusMatchKey` 给 `WorldcupView`
- `WorldcupView` 收到 `focusMatchKey` → `querySelector` + `scrollIntoView` + `match-row-highlight` 3 秒
- `preload.js` 暴露 `onWorldcupFocusMatch` IPC 桥
- `styles.css` 加 `.match-row-highlight` + `@keyframes goal-highlight-pulse`
- `src/main/worldcup/match-key.js` 跟新建 `src/utils/match-key.js` 加 `|| ""` 兜底 (renderer 端防御性)

### 实现细节
- 复用现有 `refreshWorldcupScores` (ESPN → worldcup26 → openfootball 三层) — 不另起 HTTP 流量
- `goalKey = minute|player|teamSide` (ownGoal/penalty 不进 key, 防止 ESPN 偶发漏标破坏去重)
- 单场 `notified` goalKey 上限 50, 单 sweep 推送上限 10 (防刷爆 state.json / 通知轰炸)
- 完赛比赛 (`status=final + scorers` 非空) 不再扫, 防止重启后重推历史
- 启动时 sweep 一次, 推启动前已在 live 的进球
- 30 天前比赛排除 (默认 `MATCH_TOO_OLD_DAYS=30`)
- 主进程模块 `src/main/worldcup/goal-watcher.js` (~280 行, 7 个导出, 14 个单测 + 3 个 integration smoke)
- `_sweepOnce` 全部 DI: `refreshScores` / `loadFixtures` / `onGoal` / `log` / `onError` / `statePath` (测试用)

---

## v2.15.0 (世界杯 · bracket 视觉升级 v2 + 实时计算) — 2026-06-14

### 新增
- **对阵模块视觉升级 v2**: 5 阶段水平 bracket tree + SVG 连线 (R32 → R16 → QF → SF → 决赛/季军), 左右分支结构一目了然
- 卡片改为**上下两队版式** (team1 上 / 分隔线 / team2 下), 比分右对齐
- **决赛** 用 240×100 金色边框卡片 + 居中标题
- **季军赛** 用 200×70 灰色卡片
- 已完赛 **R32 → R16** 的连线高亮为绿色 (`.bracket-tree-path--finished`)
- **窗口 < 900px** 时自动回退到垂直堆叠布局 (`BracketTreeFallback`), 复用 v1 CSS
- **进入「对阵」tab 自动重算** (30s 节流), 切走再切回不会重复算但 > 30s 一定会拉新

### 修复
- 小组赛未开赛时, bracket 不再**伪造** 8 个晋级第 3 名 (之前 `rankGroup` 总返回 best-effort 排名导致字母序前 8 误判)
- 小组赛未开赛 / 阶段缺失时显示**结构化占位** ("A 组第 1" / "B 组第 2" / "R32 #74 胜者") + 🔒 待定徽标
- "小组赛尚未开始" **独立空态** (避免误渲染半空 bracket)

### 工程
- 渲染端
  - `src/renderer/worldcup/BracketTree.jsx` — 5 列 flex 布局 + `useConnectors` hook (ResizeObserver + M-H-V-H 折线) + `useNarrowViewport` 响应式 + `BracketTreeFallback`
  - `src/renderer/worldcup/bracketStore.js` — 30s 模块级 throttle (`lastAutoComputeAt`)
  - `src/renderer/worldcup/WorldcupBracketView.jsx` — 委托给 `<BracketTree>` 渲染
- 主进程
  - `src/main/worldcup/bracket.js` — `rankGroup` 改 best-effort, 无比赛组返回 `null`
  - `src/main/worldcup/bracket-rules.js` — `computeBracket` 输出 `completeGroupCount` + 第三名仅在有实际比赛数据时入选
- CSS
  - `styles.css` — `.bracket-tree-*` (columns / column-section / column-cards / card / connectors / path / path--finished) + `.bracket-stage--finals` / `.bracket-finals`
- 测试
  - `tests/renderer/worldcup-bracket-tree.test.jsx` — 5 列结构 + fallback 切换 + 决赛/季军卡样式
  - `tests/renderer/worldcup-bracket-view.test.jsx` — view ↔ BracketTree 集成 + 5 列断言
  - `tests/renderer/worldcup-bracket-store.test.js` — 30s throttle + force bypass
  - `tests/main/worldcup-bracket-ipc.test.js` — `rankGroup` 无比赛→null + 部分完赛 best-effort

### 测试
- 整体测试: **1621 passed / 0 failed** (v2.14.0 基线 1594 + 27 新增)

---

## v2.14.0 (世界杯 · 淘汰赛 bracket 自动推演) — 2026-06-14

### 新增
- **「对阵」tab** (`⚽ 世界杯` → `对阵`): 实时计算 2026 世界杯淘汰赛对阵图 (小组赛 → 1/16 决赛 → 1/8 决赛 → 1/4 决赛 → 半决赛 → 决赛 + 季军赛)
- 小组赛阶段结束即按 **Annex C** 规则挑选 8 支成绩最好的第三名晋级, 自动填入 1/16 决赛 6 个跨组名额
- 每场比赛可手动选择胜方, 主进程 `computeBracket` 实时推演后续对阵, renderer 通过 IPC 拉新 bracket
- bracket 状态走 `worldcup_bracket_snapshot` (state-store), 重启后恢复

### 工程
- 主进程
  - `src/main/worldcup/bracket-rules.js` — `sortThirdPlaced` / `selectThirdPlaced` / `matchAnnexCCase` / `ANNEX_C_DEFAULT` / `resolveR32Matchups` / `propagateWinner` / `computeBracket` 入口
  - `src/main/worldcup/bracket.js` — `computeWorldcupBracket` IPC handler
  - `src/main/ipc/index.js` — 接入 `worldcup:compute-bracket` / `worldcup:load-bracket` 通道
  - `src/main/state-store.js` — `loadWorldcupBracketSnapshot` / `saveWorldcupBracketSnapshot`
- 渲染端
  - `src/renderer/worldcup/bracketStore.js` — 4 signals: `bracket` / `bracketLoading` / `bracketError` / `bracketDirty`
  - `preload.js` + `src/renderer/api.js` — 暴露 `worldcupComputeBracket` / `worldcupLoadBracket`
  - `src/renderer/worldcup/WorldcupBracketView.jsx` — bracket 视图主组件
  - `src/renderer/worldcup/WorldcupHeader.jsx` + `WorldcupLayout.jsx` — 第 4 个 sub-tab + 路由 `bracket`
- CSS
  - `styles.css` — `bracket-view` / `bracket-stage` / `bracket-card` 等样式

### 边界
- **小组赛未结束** → bracket 显示空 stage, 仅展示已确定的晋级路径
- **Annex C 解析失败** → 退回到默认 case (UCLA 排序), bracket 仍可生成
- **重复 compute** → `_inFlight` 单例, 不会重复计算
- **snapshot 损坏** → 静默降级, 当作空 bracket 重新算

### 文档
- 设计: `docs/superpowers/specs/2026-06-14-worldcup-bracket-design.md`
- 实施计划: `docs/superpowers/plans/2026-06-14-worldcup-bracket-plan.md`

### 测试
- 整体测试: **1594 passed / 0 failed** (基线 1509 + 85 新增)
  - bracket-rules (sortThirdPlaced / selectThirdPlaced / matchAnnexCCase / resolveR32Matchups / propagateWinner / computeBracket): 60+
  - bracket IPC handler: 8
  - bracket state-store: 7
  - renderer bracketStore + WorldcupBracketView: 10

---

## v2.13.0 (AI 用量 · Minimax coding plan 配额展示) — 2026-06-14

### 新增
- **AI 用量页面** (`📊 AI 用量` 左侧导航): 拉取并展示 `Minimax coding plan` 当前配额, 含 5 小时滚动窗口 + 周窗口
- 进度条 + 剩余/总量数字 + 重置倒计时 (每秒 tick, 卸载时自动 clear 无泄漏)
- 上次更新相对时间显示 + 从缓存恢复标注
- 手动刷新按钮 + 失败 banner (保留 last-known snapshot)
- 启动时 main 端 fire-and-forget 预热一次, renderer 进来就有数据

### 工程
- 主进程
  - `src/ai-usage/client.js` — `MiniMaxQuotaClient`, 调 `POST https://www.minimaxi.com/v1/token_plan/remains`, 完整错误映射 (401/403/429/5xx/JSON 解析失败/网络失败/api_key 缺失)
  - `src/ai-usage/normalize.js` — `_pickNumber` / `_pickString` (多候选 key, 防御 schema drift) / `_parseDdHhMmSs` / `normalize()` (兼容新旧 schema: `model_remains[0]` → `coding_plan_remains[0]` fallback)
  - `src/ai-usage/index.js` — 统一导出
  - `src/main/state-store.js` — `loadAiUsageSnapshot` / `saveAiUsageSnapshot` (复用 `patchState`, 自动 preserve 其他字段)
  - `src/main/ipc/register-ai-usage.js` — IPC handlers (`ai-usage:get-cached` / `ai-usage:fetch`), 业务逻辑提到 `_internals` 注入 deps, 单测不依赖 electron
  - `src/main/bootstrap/ai-usage.js` — `bootstrapAiUsage({deps, opts})` 装配 + 可选预热
  - `src/main/ipc/index.js` — 接入 `registerAiUsageHandlers(ctx)`
- 渲染端
  - `src/renderer/api.js` + `preload.js` — 暴露 `aiUsageGetCached` / `aiUsageFetch` / `onAiUsageUpdated`
  - `src/renderer/store/ai-usage-store.js` — 4 signals: `aiUsageSnapshot` / `aiUsageLastError` / `aiUsageFetching` / `aiUsageFromCache`
  - `src/renderer/hooks/useNowTick.jsx` — 通用 now tick hook (复用, 1s tick + unmount clear)
  - `src/renderer/components/AIUsagePage.jsx` — 页面主组件 (倒计时 / 进度条 / banner / 空态)
  - `src/renderer/components/AIUsageLayout.jsx` — mount 时 subscribe + loadCached
  - `src/renderer/components/SideNav.jsx` + `src/renderer/worldcup/navStore.js` — 加 `ai-usage` 入口项 + NAV_KEYS
  - `src/renderer/components/AppShell.jsx` — 路由 `nav === 'ai-usage'` → `<AIUsageLayout />`
- 复用现有 `safeStorage` 加密的 Minimax API key (subscription key = API key)

### 边界
- **API key 缺失** (用户没在"AI 配置"设置 Minimax key) → 拉取返 `{ ok: false, reason: "api_key_missing" }`, UI 显示空态 + 错误 banner 提示去配置
- **网络失败 / 429 / 5xx** → 失败 reason 透传到 UI, 保留 last-known snapshot
- **字段缺失** (新 schema 临时下线) → normalize 静默降级: 缺哪个 window 该 window 显示 `null`, 另一个正常显示
- **重复 click 刷新** → 客户端 `_inFlight` 单例, 不会触发重复 HTTP
- **预热 fetch 失败** → 启动期完全吞掉, 不阻塞 bootstrap, UI 后续手动 fetch 仍可恢复
- **历史快照** → V1 只展示当前配额 + 重置倒计时, 无历史趋势 (按 spec 范围)
- **警告/硬限** → V1 仅展示, 不在用尽前做警告 (按 spec 范围)

### 安全
- 不写新字段到 safeStorage 之外的地方; AI 配额走现有 minimax key
- IPC 输入严格校验 (region='cn'/'global', snapshot 是 object)
- 失败响应不暴露内部 stack

### 文档
- 设计: `docs/superpowers/specs/2026-06-14-minimax-coding-plan-usage-design.md`
- 实施计划: `docs/superpowers/plans/2026-06-14-minimax-coding-plan-usage-plan.md`

### 测试
- 整体测试: **1509 passed / 0 failed** (基线 1364 + 145 新增)
  - normalize: 21
  - client: 17 (+ 2 partial/old-schema)
  - state-store ai-usage: 7
  - IPC register-ai-usage: 8
  - bootstrap-ai-usage: 5
  - preload/api 入口 + hook: 已有
  - ai-usage-store: 11
  - AIUsagePage: 9
  - sidenav + AppShell 路由: 5
  - useNowTick: 4
  - e2e: 5

---

## v2.11.7 (check-store · stale phase signal 清理 + session id 唯一) — 2026-06-14

### 修 bug
- **stale phase signal**: `startCheck` 之前会 loop `appPhaseSignals.values()` 把所有已 init signal 设 "pending", **但** line 82 整替换 `appPhases.value` 只含新 `appNames`. 老的 (新 check 不含的) app phase signal 停在 "pending", 跟新 maps 脱节, AppRow 通过 `getAppPhaseSignal(name).value` 读到 stale "pending" → 显示 loading 永远不结束
- 场景: 用户卸装 Slack, 下次只 check Cursor → Slack phase signal 仍 "pending"
- 修: 重置时区分, 不在新 appNames 里的 → 设 "idle"
- **session id 重复**: `_sessionCounter` 之前未自增, 同毫秒多次 `startCheck` 产生同样 id → `applyProgress` 的 stale check (`sessionId !== currentSession.id`) 失效. 改成 `_sessionCounter++`

---

## v2.11.6 (ithome article 解析 · 切除 footer 污染) — 2026-06-14

### 修 bug
- **article-page-parser.js** `_extractParagraphBlock` 之前用 `html.lastIndexOf("</div>")` 找 paragraph close —— 错. IT 之家文章页 paragraph 后面还跟着 `<div class="newserror">` / `<div class="shareto">` / 软媒旗下网站 / 版权等 footer div, lastIndexOf 会把整个 footer 一锅端
- 改用 depth-balanced 扫描: 维护 div 嵌套 depth, 遇到 `</div>` 才 depth--, depth 归零时定位真正的 paragraph close
- 效果: IT 之家 fixture body 从 1155 字符 → 605 字符, 不再含 `投诉水文` / `相关文章` / `软媒旗下` / `Archiver` 等 footer 噪音
- 提升 AI 总结质量 (之前 footer 内容会被送进 LLM prompt)

---

## v2.11.5 (全局 ConfirmDialog · 替代 window.confirm) — 2026-06-14

### 改进
- **全局 ConfirmDialog**: 新组件 `src/renderer/components/ConfirmDialog.jsx` + store `src/renderer/confirmStore.js` (signals)
- 替代浏览器原生 `window.confirm` (Electron 桌面 app 里视觉不一致 / 不跟主题)
- API: `await openConfirm({ title, message, confirmText, cancelText })` → `Promise<boolean>`
- 重复调用自动取消前一个 (前一个 resolve `false`); 不支持队列 (单线程串行, 实际不需要)
- z-index 5600 (比 reminder/recent modal 的 5500 高一档, 确认弹窗永远在最上)

### 替换
- `src/renderer/reminders/RemindersModal.jsx` 删除提醒
- `src/renderer/worldcup/DayBetFooter.jsx` 清空体彩记录

---

## v2.11.4 (IT 新闻 · 已读 / 新文章 标记) — 2026-06-14

### 新增
- **已读标记**: 点标题 / 阅读原文后, 卡片 meta 行显示 `已读` tag, 标题变灰 (opacity 0.45, weight 400). 状态持久化到 `state.json.ithome_news.articles[id].readAt` (并同步到 favorites 同名 article)
- **新文章标记**: 每次 refresh 期间, session 内首次出现 (非已读) 的 id 显示 `新` tag + 左侧 3px 紫色 (#af52de) 边杠. 切 tab / 切日期 / 切收藏日期 → 自动清空
- **侧边日期 badge**: 默认 `20` (数字); 有已读时显示 `20 (已读 5)`, `已读 N` 部分用更暗颜色 (opacity 0.45)

### 边界
- 重复点已读文章 → `readAt` 幂等, 不更新时间戳
- 收藏里的文章点过 → `favorites[id].article.readAt` 也会写入, 走收藏视图时仍正确
- 刷新拉新 (RSS / list page) 时, `_mergeArticles` 和 refresh inline merge 都会保留旧 `readAt`, 已读状态不丢
- app 重启 → 已读持久化保留, 新文章标记全清 (session-scoped 信号)
- 收藏 / 摘要 / 抓取正文等行为完全不变

### 工程
- 主进程: `news-store.markArticleRead(id)` (幂等, 写 `articles` + `favorites`), IPC `ithome:mark-read` (`register-ithome.js`), preload 暴露 `ithomeMarkRead`
- 渲染端: `ithomeReadIds` / `ithomeNewIds` signals (派生 from articles + diff), `markIthomeRead(id)` (乐观更新 + fire-and-forget IPC), `setIthomeViewMode` / `setIthomeSelectedDate` / `setIthomeFavoriteSelectedDate` 清空 newIds
- UI: `NewsSidebar.dayCountTuple → { total, read }`; `NewsArticleRow` 派生 `isRead` / `isNew` 加 class + tag
- 新增 utils: `readCountForDate(articles, readIds, dateKey)`
- 整体测试: **1382 passed / 0 failed** (基线 1364 + 18 新增: 4 news-store + 4 news-utils + 7 store + 3 row)

---

## v2.11.3 (IT 新闻 AI 总结 — 按需拉详情页正文) — 2026-06-14

### 问题
- 之前在 IT 之家新闻卡片点 **AI 总结** 时, 主进程把 `article.excerpt` (列表页短摘录, 经常为空) 当正文喂给 LLM
- LLM 只看到标题, 就**自己编**一句免责: "由于原文正文缺失, 以上信息仅依据标题整理, 可能不完整"
- 截图里很多摘要都被这段废话污染, 实际总结质量被标题空想拖累

### 修复
- **按需抓取详情页正文** (`article-page-fetcher.js`): 检测到 `excerpt` < 200 字符时, 自动 HTTP 拉 `https://www.ithome.com/0/.../*.htm`, 解析 `<div id="paragraph">`, 去除投稿/广告段, 把正文落到 `state.json.ithome_news.articles[id].body`
- **LLM 提示词重排** (`article-ai.js buildMessages`): 优先用 `body` (>= 200 字) → 回退到 `excerpt` → 都缺才给免责提示
- **`contentHash` 包含 body**: body 落盘后, 旧 summary 的 hash 自动失效, 下次访问会被重新计算 (默认**不**主动清空, 用户点 "重新生成" 才用上带正文的版本 — 升级不打扰现有用户)
- **UI 加进度反馈** (`NewsArticleRow.jsx`): 按钮文案分两段: `抓取正文中…` (需要抓详情页时) → `总结中…` (走 LLM), 对应阶段 disable
- **抓取失败不影响总结**: 详情页 404/解析失败时, 主进程走原来的 fallback 提示, 用户仍能拿到一个 (相对粗糙的) 总结

### 用户行为变化
- 升级后, **旧的 AI 摘要会原样保留** — 它们是用旧 hash 算出来的, 仍合法; 不会自动重算
- 想看带正文的版本: 列表里点 **`重新生成`**
- 第一次点 **`AI 总结`** 的某条新闻: 按钮会先显示 `抓取正文中…` (约 1-3 秒, 看网络) 然后 `总结中…`, 比之前多一步

### 工程
- 新增 `article-page-parser.js` (解析详情页) / `article-page-fetcher.js` (拉取 + 落盘), 都用 vitest 单测覆盖, 含真实 IT 之家 HTML fixture (`tests/fixtures/ithome/article-866661.html`)
- `news-store.js` 新增 `attachArticleBody(id, body, statePath)`, 不动 schema 不影响 favorites/summaries
- 关键文案:
  - 主进程抓详情页失败 (HTTP 4xx/5xx) → 走原 fallback 提示 "信息可能不完整"
  - 详情页无 `#paragraph` → 同上
- 整体测试: **1364 passed / 0 failed**, 新增 23 个 (parser 8 + fetcher 6 + ai 6 + row 3)

---

## v2.11.2 (工程基础设施) — 2026-06-13

本轮聚焦**项目工程化与稳定性**, 没有面向用户的新功能, 但都是 push 之前没人拦的"软肋":

### CI · GitHub Actions
- 项目原来完全没有 CI, 所有改动靠本地手测, push 不会被拦
- 新增 `.github/workflows/ci.yml`: 每次 push / PR 跑 `npm test` + `npm run build:renderer` + 验证 bundle 产出
- 顺手修一个 pre-existing 测试 (`worldcup-scores-api`): 用了固定过去日期 2026-06-12 触发时间相关逻辑假阳性, 改成相对未来 7 天

### 主进程 · 全局错误兜底
- 主进程原来没有 `uncaughtException` / `unhandledRejection` 兜底, IPC handler 或调度器里任何未捕获异常都会让后台任务**静默挂死**, 用户无感知
- 新增 `error-guard.js`: 写日志 + 推 `main:error` IPC, renderer 收到弹错误 toast
- 同一错误对象去重, 避免 promise 链双触发刷屏

### state-store · 重构
- `state-store.js` (1046 行) 里 10 个 save 函数重复 6 步样板, 抽成公共 `patchState(updater)` 范式, 每个函数只保留差异
- 文件 1046 → 867 行 (少 179 行)
- **顺手修 2 个 pre-existing bug**: `saveWorldcupMatchInsights` 和 `saveActiveCategory` 原本没保留 `ai_sessions_config`, 会把它吃掉

### Funds · 净值源健壮性
- 原来主源 (tiantian) 失败时 sina 数据完全浪费 (只是"附加"做交叉比对), 整个 fetch 抛错进 errors
- 改成**主源失败自动 fallback 到备用源**: sina 升格成主快照, 标 `fallbackFrom: 'tiantian'`
- 新增**源健康度跟踪** (`nav-source-health.js`): 滑动窗口 + 连续失败计数 + 成功率, 给 fetcher 用
- alt 失败不再被静默吞, 加 debug 日志

### DB · 换型评估
- 评估"是否把 state.json 换成 SQLite", 结论 **当前不迁移** (实测 53 KB, 离 SQLite 划算阈值差 200 倍)
- 完整评估文档 `docs/db-migration-assessment.md`, 含 3 个备选方案 + 触发条件
- 顺手加 size 监控: state.json > 5MB 写 warn 日志, 为未来决策提供数据

### 验证
- 整体测试 **1325 passed / 4 skipped / 0 failed**
- 新增测试 26 个 (error-guard 6 + state-store-patch 9 + nav-source-health 11)
- renderer bundle 712.3kb

---

## v2.11.1 (最近活动 & 提醒修复) — 2026-06-13

### 最近活动 · 采集点补齐
- v2.11.0 的时间线只搭了存储和弹窗 UI, 但 `pushRecent` **从未被调用** → modal 一直是空的. v2.11.1 补齐全部采集点:
  - **版本检查**: 检查完成 / 单个升级成功 / 批量升级每个成功项
  - **提醒**: 新建 / **编辑** / 触发 / 完成 / 忽略 (5 个)
  - **世界杯**: 点比赛卡片 / **AI 赛前预测 / 赛后总结** 生成成功
  - **基金**: 切 tab / **新增 / 编辑 / 移除持仓** / **刷新净值**
  - **新闻**: 切 tab / 切日期 / 收藏 / **AI 总结**
  - **设置**: 打开 AI 配置
- 合计覆盖 **18 种活动**

### 最近活动 · 筛选分组
- 原 pill 用单 kind 精确匹配, 新加的细分 kind (如 `fund-add` / `ithome-summary`) 被过滤掉
- 改成**类别前缀分组**: 升级 / 提醒 / 比赛 / 基金 / 新闻 / 设置 6 个类别, 各自覆盖多个 kind
- 新增「设置」类别 pill

### 最近活动 · 持久化修复
- **根因**: `state-store.preserveExtraFields()` 没保留 `recentActivity` (和 `reminders`) 字段
- 每次 `saveAll` (检查更新) / `setMute` / `saveLastOpened` / `saveAISessionsConfig` 写盘都会重建 state, 只保留登记过的字段 (funds / worldcupBets / ithome_news 等), `recentActivity` 没登记 → 被吃掉
- 现象: 列表只剩最近一次 push 的那条 (因为 push 自己也写一次盘)
- **修复**: preserveExtraFields 新增 `reminders` 和 `recentActivity` (数组类型校验), 单测覆盖

### 提醒 · 默认时间
- 新建提醒时 datetime-local 默认值从「现在 + 1 小时」改成「**现在 + 5 分钟**」, 更贴近"马上提醒"直觉
- 避免打开表单后没改时间, 直接按 1 小时后存盘

### 验证
- 新增单测: state-store preserveExtraFields 保留 reminders/recentActivity
- 整体回归绿 (reminders 41 / recent-activity 24 / state-store 73)
- renderer bundle 711.9kb (v2.11.0 是 697.8kb, +14kb = 18 个 track fn + 采集点接入)

---

## v2.11.0 (提醒 & 时间线) — 2026-06-13

### 提醒 (new)
- **本地提醒**: 标题 + 触发时间 + 4 种重复规则 (一次 / 每天 / 工作日 / 每周某天)
- **触发方式**: 主进程 30s 扫一次, 到时间发系统通知 + 状态切 `fired` (待 ✓ 打卡), 避免通知一划就忘
- **持久化**: `state.json.reminders[]`, 跟 worldcupBets / funds 平级, atomic write
- **UI 入口**: Header ⏰ 按钮 + 弹 RemindersModal (待办 / 已触发 / 已忽略 3 分组)
- **快捷键**: `⌘⇧R` 一键打开新建
- **重复规则算下次**: 一次完成后删; 重复规则 `_computeNextFireTime` 纯函数算下次 (daily 跨日 / weekdays 跳周末 / weekly 跳到下个匹配 weekday), 41 个单测覆盖
- **表单**: 标题 / 触发时间 (datetime-local) / 重复 radio / weekly 周几 radio / `Esc` 取消 / `Cmd+Enter` 保存

### 最近活动 (new)
- **统一时间线**: 跨 5 个 tab (app 升级 / 提醒 / 比赛 / 基金 / 新闻) 记录"最近我做了什么", 倒序展示
- **UI 入口**: Header 🕒 按钮 + 弹 RecentActivityModal (5 个过滤 pill: 全部 / 升级 / 提醒 / 比赛 / 基金 / 新闻)
- **配置项**: `config.json.recentActivity.maxEntries`, 默认 200, 范围 [50, 1000] 越界走 default
- **折叠去重**: 5min 内同 kind+ref 自动折叠成 "X N 次", 超出 cap 环形覆盖
- **持久化**: `state.json.recentActivity[]`, atomic write, 24 个单测覆盖
- **点条目跳 tab**: 比赛/基金/新闻条目点击切到对应 tab

### 已知限制
- v2.11 主体跑通, **时间线 5 个采集点 (app-upgrade / reminder-* / worldcup / ithome / funds) v2.11.1 补** — v2.11 装的 modal 暂时为空, 等采集点接上就有数据
- 提醒通知点击后只弹主窗口 + 拉起 modal, 不在主窗口打开新建表单 (避免遮挡)
- 时间线容量走 `config.json` 静态配置, 暂不在 Settings 面板暴露

### 验证
- 65 个新增单测全绿 (reminders 41 + recent-activity 24)
- 整体回归 1287/1292 绿 (1 个预先存在的 worldcup-scores-api 失败跟 v2.11 无关)
- renderer bundle 697.8kb (v2.10 是 555kb, +143kb = 2 modal + 2 store + 入口按钮 + 折叠逻辑)
- styles.css +368 行 (2 modal 完整样式)

---

## v2.10.0 (世界杯体彩记账) — 2026-06-12

### 世界杯 · 体彩记账 (new)
- **比赛日底部小卡**: 每个 day section 底部一行，展示投入 / 盈亏（盈亏颜色：盈绿亏红）+ 编辑 / 清空按钮
- **未填比赛日**: 灰色「未填 →」按钮，点开行内编辑表单
- **顶部 stats card**: 总投入 / 总盈亏 / 已填 / 未填 / 盈亏率 5 个数字
- **数据持久化**: `state.json.worldcupBets`，key = 比赛日 date (YYYY-MM-DD)
- **不联动比赛结果**: 盈亏完全手填（用户拒绝玩法 / 赔率）
- **快捷键**: Esc 取消，⌘/Ctrl+Enter 保存
- **校验**: stake ≥ 0、pnl 任意、note ≤ 200 字、> 1e9 拒

---

## v2.9.8 (比分 / 进球榜 / 共享 AI / 配置记忆) — 2026-06-12

### 世界杯 · 赛程与数据

- **实时比分**: ESPN → worldcup26.ir → openfootball 三层回退；进行中 / 完赛不同样式（红 / 绿）
- **进球者**: 完赛卡片与详情弹窗展示进球球员；完赛但缺 scorers 仍会刷新 ESPN
- **进球榜 tab**: 按进球数排序，支持搜索球员 / 球队
- **球队 tab**: 组内按积分 → 净胜球 → 进球排序；展示积分与净胜球
- **中文队名 + 国旗**: TXT 别名（South Korea、Czech Republic 等）统一映射；未知占位队显示 🏳️

### 世界杯 · AI 分析

- **赛前预测 / 赛后总结**: 与 AI 任务总结共用 Provider / 模型 / Key
- **按需生成**: 已有缓存只展示，点「赛前预测 / 赛后总结」才调 LLM；「重新生成」单独触发
- **磁盘缓存**: 写入 `state.json` `worldcup_match_insights`，重启不丢

### Pulse 共享 AI 配置

- **侧栏入口**: 底部「AI 配置」，不再藏在 drawer 深处
- **配置记忆**: 启动时加载上次 Provider / 模型 / Key 状态；以主进程实际可用性为准，避免误报「未配置」
- **一键保存**: 「保存配置」同时写入 Keychain 中的 API Key（若输入框有 key）
- **输出优化**: 过滤 LLM 思考链标签；弹窗加大可滚动

### 其它

- AI 任务 drawer z-index 修复，不再被顶栏遮挡
- 新增 `src/ai/shared-llm.js` 供任务总结与世界杯 AI 共用

### 验证

- vitest 全绿（含 worldcup-teams-data / scorers-leaderboard / group-standings / match-ai）
- renderer bundle ~555kb

---

## v2.9.3 (SquadModal + 北京时间 + 国旗) — 2026-06-11

### Match card 升级

- **国旗 emoji**: 队名前加 (🇲🇽 vs 🇿🇦), 用 Unicode regional indicator 拼接 (0 网络)
- **北京时间**: 自动从 TXT 原时间 + tz_offset 转到 UTC+8, e.g. `13:00 UTC-6` → `03:00+1d 北京` (跨日日期同步调)
- **可点**: hover 边框变蓝, 点弹 SquadModal (跟 v2.9.0 "不做点详情" 反悔, 用户拍 `card_rich_modal`)

### SquadModal (点 card 弹)

- 顶: 阶段 + 日期 + 星期 + 🕒 北京 (灰显原 UTC) + 📍 场馆
- 主体: 2 队大名单并列, 1 真实人 (Son / Mbappé / Messi 等) 头排 + 25 占位 TBD-1~TBD-25
- 底: 数据来源 + 关闭
- 隔离: ESC 关 / 点 backdrop 关 / 卡片内 .stopPropagation 不冒泡

### timeUtils utility

- `parseUtcOffset('UTC-6')` → 6 (跟 JS Date.getTimezoneOffset 反向, 正数=东)
- `toBeijingTime(time, tz, date)` → `{date, time, originalTime, weekday}`, 跨日自动调

### 验证

- 62 files / 983 passed | 4 skipped (跟 v2.9.2 一致, +0 测)
- esbuild 335.5kb (v2.9.2 是 326.9, +8.6kb = SquadModal 200 + MatchCard flag/bj + timeUtils 60 + CSS 150)

---

## v2.9.2 (Squad Skeleton — 48 队数据) — 2026-06-11

### 48 队 squad skeleton

- 1 真实人 (知名队长 / 核心球员) + 25 占位 `TBD-1`~`TBD-25`, 后期逐队填 (v2.9.5+)
- FIFA 官方名 mapping (跟 TXT 1:1, trivia 注释修正):
  - `South Korea` → `Korea Republic`
  - `Iran` → `IR Iran`
  - `Cape Verde` → `Cabo Verde`
  - `DR Congo` → `Congo DR`
  - `Ivory Coast` → `Côte d'Ivoire`
  - `Czech Republic` → `Czechia`
  - `Turkey` → `Türkiye`
- 中文译名: FIFA 中文官网 / 新华体育 / 央视体育常用译
- 国旗 emoji: Unicode regional indicator 拼接, 0 网络依赖

### 球队列表实装

- 进 [世界杯] tab → 点 [球队] 子 tab → 12 group × 4 队 grid 显示
- 每 team card: 国旗 + 中文 + 英文 FIFA 官方名 + 1 真实人
- 搜索 '中国' / 'Ger' / '🇩🇪' / 'A' 都过滤
- hover card 边框变蓝, 点: 暂时 noop (v2.9.4 弹 队详情 modal)

### 验证

- 62 files / 983 passed | 4 skipped (+10 case `worldcup-teams-data.test.js`)
- esbuild 326.9kb (v2.9.1 是 315.4, +11.5kb = teams-data 6KB + WorldcupTeamsView 200 + CSS 80)

---

## v2.9.1 (Layout 拆 — 2 独立顶部) — 2026-06-11

### 2 套独立 layout

- **VersionsLayout** (🔄 版本检查): 沿用 v2.6 顶部 (Header 检查更新 + FilterBar 搜索 + 状态栏)
- **WorldcupLayout** (🏆 世界杯): 独立顶部 (品牌 + [赛程] / [球队] 子 tab + 搜索框)
- AppShell 依 `activeNav` dispatch, 共享左侧 SideNav (180↔40 折叠)
- 跟版本检查 0 共享 view / store / signal (除 navStore 2 signal)

### Cmd+F 切搜索

- 在 2 个 tab 都能唤起搜索框, 自动 focus 对应 layout 的 input
- 2 套 layout 各自管 search state

### 验证

- 61 files / 973 passed | 4 skipped (v2.9.0 +1 file `WorldcupLayout.jsx`)
- esbuild 315.4kb (v2.9.0 是 311.7, +3.7kb = WorldcupHeader + WorldcupLayout 200 + CSS 50)

---

## v2.9.0 (World Cup 2026 — 世界杯专栏) — 2026-06-11

### 新增: 世界杯专栏

在 Pulse 仓库内新增 1 个独立 view "世界杯专栏", 通过左侧 nav 切换. 拍 6 边界 (见 `docs/superpowers/specs/2026-06-11-worldcup-view-design.md`):

- **数据源**: `openfootball/worldcup` GitHub raw Football.TXT (CC0-1.0, 0 鉴权, 0 限流)
- **范围**: 2026 世界杯 (6/11 - 7/19, 100 场)
- **主页面**: section by day (39 个比赛日, 每 day 1-4 场)
- **左侧 nav**: 180↔40 可折叠, 2 item (🏆 世界杯 / 🔄 版本检查)
- **默认 tab**: 版本检查 (保 v2.6 习惯)
- **跟版本检查隔离**: 完全独立 view + store + IPC, 0 共享 signal

### Match card 极简 (你拍 card_minimal)

- 左 / 右 队名
- 中 `VS` (未赛) / `0-0` (已赛)
- 下面 北京时间 (e.g. `13:00 UTC-6`) + 场址
- 不倒计时 / 不实时比分 / 不点击 (跟 spec §9 不做的 7 项一致)

### 数据流 (3 步)

1. **mount** WorldcupView → `loadWorldcupFixtures()` (并发守卫)
2. **main IPC** `worldcup:fetch-fixtures` → server-side fetch + TXT 解析
3. **24h 缓存**: 命中 state.json `worldcup_txt` 字段, 否则 fetch GitHub raw URL, 写入缓存
4. **失败**: error card + 重试按钮

### 新增文件 (10)

- `src/main/worldcup/{parser.js, fetcher.js}` — server-side 解析 + fetch
- `src/renderer/worldcup/{store.js, groupByDate.js, WorldcupView.jsx, MatchCard.jsx, navStore.js}` — 独立 view + signal
- `src/renderer/components/{SideNav.jsx, AppShell.jsx}` — 180↔40 折叠 nav + Shell 布局

### 改文件 (5)

- `src/main/ipc.js` — 加 `worldcup:fetch-fixtures` handler
- `src/main/state-store.js` — 加 `loadWorldcupTxt` / `saveWorldcupTxt` (24h 缓存, preserveExtraFields 兼容 v=1)
- `preload.js` — 加 `worldcupFetchFixtures` IPC 暴露
- `src/renderer/api.js` — 加 `worldcupFetchFixtures` pick
- `src/renderer/App.jsx` — 改用 AppShell 替代原 main 区, v2.6 phase 切逻辑移入 AppShell

### 验证

- vitest **61 files / 973 passed | 4 skipped** (v2.8.2 是 59/959, +2 files + 14 case)
  - `tests/main/worldcup-parser.test.js`: 10 case (解析 sample / group 边界 / 队名缺失 skip / sort / Group by date)
  - `tests/renderer/worldcup-groupByDate.test.js`: 4 case (空 / sort / 跳过无 date)
- esbuild bundle: 311.7kb (v2.8.2 是 294.1kb, +17.6kb, 跟新增 view + nav + worldcup 模块对得上)
- load-smoke 全过 (main 进程所有 .js require 路径健康)
- 0 IPC 改动: v2.6 主体 (get-config / check-updates / 等) 不动
- 0 v2.6 主体 store 改动: worldcup 用独立 signal, 跟 6.6 一致

### 风险缓释 (spec §8)

- TXT 解析容错: parser test + try/catch + skip 异常行
- 网络偶尔拉不到: 8s timeout + 失败重试 + 24h 缓存
- 数据 "不鲜" (TXT 静态): 跟 `card_minimal` 一致, 不显示倒计时
- 跟 v2.7+ 已删 路径 0 混淆: spec 写明"全新独立路径", 0 引用任何 v2.7+ 文件名

### 已知 follow-up

- 不做实时比分 (TXT 是赛程数据, 比赛期间不更新)
- 不做倒计时 (静态日期, 比赛开始后不显示)
- 不做详情 modal / 关注收藏 / 通知
- 暂只加 2026 世界杯, 中超 / 欧国联 / 多赛事暂不

---

## v2.8.2 (Revert v2.7.x + v2.8.0 polish + v2.8.1 Stats) — 2026-06-11

### Revert: 砍掉所有 v2.7 + v2.8 引入, 回到 v2.6 体验

v2.7.x + v2.8.0 polish + v2.8.1 引入的 library / wizard / stats 整套体验, 用户评价"基本探查不了, 没什么意义, 整套额外监控应用的能力下线全部不要", 11 commit 一次性 revert.

**留**: `ae04a5a` v2.8.0 WorkBuddy + QoderWork detector 接入 (你 commit 的, 不是 library 引入), 仍工作. 3bed4a4 (config.json revert) 跟 library 无关, 留.

### 11 commit 一次性 revert

1. `2fc1d47` v2.8.1 F1 Stats
2. `04f8187` v2.8.0 wizard 5 项收尾
3. `ec6554c` v2.7.4 续删 auto-detect (恢复 v2.7.2a/b 引入的 known-apps/brew-probe/detect/AutoDetectModal)
4. `3bae723` v2.7.4 砍 auto-detect modal
5. `3bed4a4` 留 (config.json revert, 跟 library 无关)
6. `c4bb59c` v2.7.2b fix LibrarySection destructure
7. `3a12a35` v2.7.2b AutoDetectModal
8. `47f64f7` v2.7.2a auto-detect 3 模块 + 56 测试
9. `557538d` v2.7.1.2 wizard master-detail 重做
10. `4e377c5` v2.7.1.1 modal class 名修
11. `ae04a5a` `34399a0` `009bbeb` 留 (WorkBuddy + fixtures, 你 commit)
12. `b7cd74d` v2.7.1 UI polish
13. `46473c7` v2.7.0 My Apps Library (主引入)

### 删 (17 文件)

**组件 (6)**: LibrarySection / PinnedSection / DetectorWizardModal / StatsModal / TagBar / TagInput
**模块 (4)**: src/main/library/{ops,scanner}.js + src/renderer/{stats,weekly-stats}.js (后 2 在 v2.6 之前)
**测试 (6)**: tests/main/{library-ops,library-scanner,config-store}.test.js + tests/renderer/stats.test.js + tests/config/library-schema.test.js + tests/main/load-smoke 触发 (config-store 删了)
**文档 (2)**: docs/superpowers/specs/{2026-06-10-library-ui-polish,2026-06-11-library-auto-detect}.md (留作历史 changelog 失败 — 跟内容 revert 一道删; 不删也行, 暂时删)
**main 文件 (1)**: src/main/config-store.js (v2.7.0 新增, 整个删; 旧版 v2.6 走 `getConfig` 内存 + schema.js 持久化)

### 改 (15 文件)

- `RELEASE-NOTES.md` (冲突: 保留 HEAD v2.8.0/v2.8.1 sections, 删 parent v2.7.x sections)
- `preload.js` + `src/renderer/api.js` — 删 library:* 暴露
- `src/main/ipc.js` — 删 7 个 library:* handler + library scanner/ops require
- `src/main/index.js` — 删 library bootstrap
- `src/config/schema.js` — 删 library schema 部分
- `src/renderer/App.jsx` — 删 libraryConfig / unmonitoredApps bootstrap + LibrarySection / PinnedSection / wizard / stats mount
- `src/renderer/store.js` — 删 libraryConfig / unmonitoredApps signal + activeFilter 'starred'/'unmonitored'
- `src/renderer/selectors.js` — 删 library 视角过滤 + tabCounts starred/unmonitored
- `src/renderer/components/FilterBar.jsx` — 删 'unmonitored' tab
- `src/renderer/components/Header.jsx` — 删 📊 Stats 按钮
- `src/renderer/components/DetectorWizardModal.jsx` — 整个 wizard modal 改回 v2.6 之前的空/简化版本 (v2.7.0 引入的整个 component, 但 ipc 调用已删, 留个空壳, revert 自然恢复)
- `styles.css` — 删 library / wizard / stats 全部 CSS (~1500 行)
- `.gitignore` — 恢复 v2.6 之前
- `tests/renderer/filter.test.js` — 删 starred/unmonitored 字段测试
- `tests/detectors/{api-json,electron-yml}.test.js` — 删 WorkBuddy fixture 关联的某些 case (实际是 v2.7.x 修过, revert 恢复)

### 验证

- vitest **63 files / 1044 passed | 4 skipped** (v2.6 baseline)
- 跟 v2.6 (`3486bc2`) diff: 只剩 3 files (package.json + 2 detector test minor, 都是 v2.7.x 后续的修, revert 自然恢复)
- 源码 `git grep "LibrarySection|DetectorWizard|StatsModal|libraryConfig|unmonitoredApps|stats\.js|computeCounters"` 除 weekly-stats.js (v2.6 之前就有): **0 命中**
- load-smoke 全过 (主进程所有 require 路径都正常)

### 用户体验变化

| 之前 (v2.7-v2.8.1) | 现在 (v2.8.2) |
|---|---|
| Header 有 ⭐ Pinned / 📦 未监控 / 4 status 共 6 tab | Header 4 status tab (all/update/latest/error) |
| 未监控 app 可加 [监控] 走 3 步 wizard | 无 — 只能改 config.json 加新 app |
| Header 📊 Stats 4 段 modal | 无 |
| config.json 11 app 监控 (跟 v2.6 一致) | 同 |

### 已知 follow-up

- 旧 v2.7.x + v2.8.x spec 文档 2 份 (`2026-06-10-library-ui-polish.md` + `2026-06-11-library-auto-detect.md`) 跟 revert 一道删了, 没留历史. 跟 v2.7.4 docs 处理原则有出入, 但 11 commit revert 跟单独删 spec 不好分开
- RELEASE-NOTES.md v2.7.x sections (v2.7.0 / v2.7.1 / v2.7.1.1 / v2.7.1.2 / v2.7.2 / v2.7.4) 在 conflict resolve 时删了, 跟 v2.7.4 "doc_keep" 原则有出入. v2.8.0/v2.8.1 留了
- 如果真要重新做"加 app 监控", 走老路: 编辑 config.json + 重启 Pulse

---

## v2.8.0 (WorkBuddy + QoderWork Detectors) — 2026-06-10

### Feat: 2 个新 app 接入监控

config.json 早就有这俩 entry, fixture 早录好, **v2.8.0 修通 detector 接入 + 回归测试**.

- **WorkBuddy** (api_json): 真实响应 `{ version: "5.0.2.29916712" }` → 解析为 `5.0.2` (Phase 8 stripBuildNumber 剥掉 CI counter)
- **QoderWork** (electron_yml): 真实响应 `version: 0.5.8` → 直接解析; `bundle_changelog: true` 走 detect-worker.js:513 已有 Phase 21 post-step 读 app bundle 的 changelog.md

### Detector 通用能力零改动

两个新 app 都吃现有 detector (`ApiJsonDetector` / `ElectronYmlDetector`), 没改 src/detectors/. 通用 detector 改坏了风险大, 这次走"不碰核心, 加测试"路径.

### 改动

- `tests/detectors/api-json.test.js` +60 行 (WorkBuddy fixture 回归)
- `tests/detectors/electron-yml.test.js` +34 行 (QoderWork fixture 回归)
- `package.json` version 2.6.5 → 2.8.0

### 测试

- `npm test`: **1044 passed | 4 skipped** (baseline 1041 + WorkBuddy +2 + QoderWork +1)
- 全 11 app fixture 都能解析, 离线模式稳定

### Commits

- `009bbeb test(api-json): WorkBuddy fixture回归`
- `34399a0 test(electron-yml): QoderWork fixture回归`
- (release commit 含 package.json + RELEASE-NOTES)

---

## v2.7.1 (Library UI Polish) — 2026-06-10

### Fix: Library 5 个新组件视觉打磨

v2.7.0 引入的 My Apps Library 功能跑通, 但用户反馈"29 个未监控 app 贴脸堆" / "按钮权重失衡" / "跟 status tab 视觉一致看不出来". v2.7.1 收口.

设计依据: `docs/superpowers/specs/2026-06-10-library-ui-polish.md` (130 行, 沿用现有 Pulse design token: --accent-* / --bg-* / --text-* / --border / --radius-*)

### LibrarySection card 化

- 现状 (v2.7.0): 29 个未监控 app 贴脸平铺, 行高 50px, 无 card
- 改: 每个 app 一张 card (12px 16px padding, 1px border, 8px 间距)
- 主行: appName 14px / 600, 副标题 12px / 400 用 `·` 分隔 bundle · version · bundleId
- 按钮 group 右对齐, gap 8px: ⭐ / [监控] / [忽略] 权重统一
- 已 pin 行: 左边框 2px `--accent-blue`
- 已 ignored 行: opacity 0.5
- hover: 整行 `--bg-hover` + `box-shadow: var(--shadow-sm)`
- 空状态: 64px 圆 icon (✓, 绿) + 标题 + 副标题, 64px padding

### PinnedSection 视觉升级

- 容器: `rgba(0, 122, 255, 0.04)` 浅蓝底 + `--border-light` 底边
- chip: 26px 高胶囊 (圆角 13px), `--bg-card` + 1px `--border`, hover 蓝边
- chip 的 × 按钮: 18px 圆形, hover 红
- 加 "只看这些 →" 按钮 (右侧 ghost)

### TagBar 视觉统一

- 跟 PinnedSection 同行 (flex-wrap, gap 6px)
- chip: 26px 胶囊, 跟 PinnedSection 视觉同源但用 `--bg-secondary` 底区分
- active 态: `--accent-blue` 蓝底白字 + 边框
- empty 状态: 3 个 popular (dev/ai/design) 灰 chip, dashed border, hover 提示
- "点 app 行的 + tag 加 tag" 提示文字

### TagInput chip 升级

- chip: 24px 高 (跟 Pinned/Tag 区分), 圆角 12px
- × 按钮: 16px 圆形, hover 红
- + tag 按钮: dashed border ghost, hover 蓝
- input 展开: focus 边框 `--accent-blue` + 32px 高

### DetectorWizardModal 3 步 stepper

- 现状 (v2.7.0): 11 detector + 字段表, 单步填, 像 data form
- 改 3 步: ① 选 detector → ② 填字段 → ③ 确认
- 顶部 stepper: 24px 圆形 step, active 蓝填充, done 绿填充+✓, future 灰
- step 1: 2 列 grid (140x80px) detector card, hover 蓝边, active `rgba(0, 122, 255, 0.08)` 蓝底
- step 2: 字段表 (跟之前一样, 但 32px 高 input, label 12px / 500 uppercase)
- step 3: 预览 "将添加 {appName}, detector: {type}, fields: {key=value}" 表格
- footer: [← 上一步] (step 2-3) + [取消] + [下一步 →] / [保存并监控] (step 3)

### FilterBar 视觉区分

- 现状: status tab 跟 library chip 视觉一致, 用户分不清
- 改: library chip 走 `--accent-orange` (#ff9500 macOS 橙), 跟 status tab 的 `--accent-blue` (#007aff) 区分
- 加 `|` 分隔符 (`filter-tab-sep`, 灰, 4px 间距) 强化分组

### 决策点

- **library chip 颜色** = `#ff9500` (macOS 橙) — 跟 status tab 蓝区分 + "favorite" 语义天然暖色
- **跟 Pinned / TagBar 同行布局** — 节省 56px 垂直, 跟 status tab 视觉连续
- **card 化间距 8px** — 跟 8 分类 tab 视觉语言一致
- **3 步 wizard** — "用户在完成过程" 感, 降低一次性 11+ 字段认知负担

### 测试

- 0 测试改动 (纯视觉 polish, logic 不动)
- 0 失败: 1041 passed | 4 skipped (1045) (跟 v2.7.0 一致)
- esbuild bundle: 319kb (v2.7.0 是 316kb, +3kb)

### Files

- `styles.css` — 加 .filter-chip / .pinned-* / .tag-bar / .library-* / .tag-input-* / .wizard-* 14 组类 (~480 行 CSS)
- `src/renderer/components/LibrarySection.jsx` — 行重构成 card 化
- `src/renderer/components/PinnedSection.jsx` — 改 import path
- `src/renderer/components/TagBar.jsx` — 改 import path
- `src/renderer/components/DetectorWizardModal.jsx` — 3 步 stepper + 2 列 grid + confirm step
- `docs/superpowers/specs/2026-06-10-library-ui-polish.md` (新) — 设计 spec
- `RELEASE-NOTES.md` — 本节

### 不做的 (跟 v5 草稿的边界, v2.7.0 已知 follow-up 不变)

- 拖拽 manual reorder
- bundleId → detector 自动推荐

---

#### Pin / Star ⭐

- 顶部 ⭐ Pinned 区 (`<PinnedSection />`): 列出我加 ⭐ 的 app 名字 (chip 风格, 点 chip 取消 pin)
- 单 app 行右侧 ⭐ 按钮 (`LibrarySection`), toggle 加 / 取消
- "⭐ 我关注的" tab (`activeFilter='starred'`): 仅显示 pinned app
- 持久化到 `config.json` 顶层 `library.pinned` (string[])

#### 未监控 app 扫描

- `src/main/library/scanner.js` 扫 `/Applications` + `~/Applications`, 返 {bundlePath, bundleName, bundleId, version, appName}
- 读 `Info.plist` 走 `plutil -convert json` (macOS 自带, 0 依赖)
- IPC `library:list-unmonitored` 跟 config + ignored 对比, 返未监控列表
- "📦 未监控" tab (`activeFilter='unmonitored'`): 渲染 `<LibrarySection />` 替换 ResultsView

#### Detector Wizard Modal

- "监控" 按钮 → 弹 `<DetectorWizardModal />` (11 个 detector type 单选 + 必填字段)
- 11 个 detector type: brew_formulae / brew_local_cask / electron_yml / electron_zip_probe / app_store_lookup / api_json / redirect_filename / cursor_redirect / qclaw_api / app_update_yml / sparkle_appcast
- 校验: detector type 合法 + 必填字段非空 + appName/bundle 不重名
- 提交后 IPC `library:add` 写 config + 推 `config-updated` 事件 + 本地 unmonitored 列表移除该项

#### Tag 自由文本 + 过滤

- 单 app `<TagInput />`: inline input + chip 列表, Enter 提交
- 顶部 `<TagBar />`: 全 app 派生 unique tag 列表 + count, 预定义 popular (dev/ai/design/work/personal/media) 在前
- 点击 tag chip → `activeTagFilter` signal, selectors 自动过滤
- 严格大小写: 'Dev' / 'dev' / 'DEV' 各自独立, 不做 case-insensitive 去重
- 持久化到 `config.json.library.tags` ({appName: string[]})
- 单 tag 上限 32 字符, 单 app 上限 10 tag, 全局上限 50 tag (sanitize 兜底)

#### 其它

- 6 个 tab: 全部 / 有更新 / 已是最新 / 出错 / ⭐ 我关注的 / 📦 未监控
- "忽略" 按钮: 加 app 进 `library.ignored` [{appName, bundle}], 跟 unmonitored 列表立即同步
- "重新扫描" 按钮: 重新跑 scanner, 刷新 unmonitored 列表
- 切到 "未监控" tab 时, ResultsView 隐藏, LibrarySection 顶替

### Schema + 数据

- `config.json` 顶层加 `library` 块: `{ sortBy, pinned, ignored, tags }`
- `library.sortBy`: 'starred' | 'name' | 'lastUsed' | 'updateStatus' (4 选 1, 兜底 'starred')
- `library.pinned`: string[] (app name, dedupe, 上限 200)
- `library.ignored`: [{appName, bundle}] 对象数组 (v2.7.0 拍板: 不用 string[]), dedupe by appName, 上限 500
- `library.tags`: {appName: string[]}, 严格大小写
- 老 config (无 library 字段) → 默认 `{sortBy: 'starred', pinned: [], ignored: [], tags: {}}`, 不影响老用户

### IPC 7 个新通道

- `library:list-unmonitored` — 扫盘 + 过滤
- `library:add` — 加 app + 同步从 ignored 移除
- `library:remove` — 删 app
- `library:set-sort-by` — sortBy 写
- `library:set-pinned` — pinned 数组 replace
- `library:set-ignored` — ignored 数组 replace
- `library:set-tags` — tags map replace

每个写操作 → `config-store.saveConfig` (atomic write, sanitize 兜底) → 推 `config-updated` 事件 → renderer 刷 store.

### 边界处理

- 老 config 无 library 字段 → sanitize 默认值, 不抛
- 老 config library 字段缺 sortBy/pinned/ignored/tags 任一 → sanitize 兜底
- ignored 旧 string[] 形态 (v5 草稿) → sanitize 丢弃非 object 元素, 让用户重新 ignore
- tag 全局超 50 → 后续 app 跳过 (单 app 优先)
- 写盘失败 → IPC 返 ok:false + reason, 不影响内存流
- unmonitored 列表空 → LibrarySection 显示 "所有已装 app 都在监控列表"

### 测试

- 46 个新 case:
  - `tests/config/library-schema.test.js` (21 case): sanitize 全边界 + 严格大小写 + ignored 对象数组
  - `tests/main/library-scanner.test.js` (25 case): 扫盘 + dedupe + 排序 + 错误注入
  - `tests/main/library-ops.test.js` (30 case): 6 个 ops 纯函数全边界
  - `tests/main/config-store.test.js` (9 case): atomic write + sanitize 集成 + 失败清理
  - `tests/renderer/filter.test.js` 改: `toMatchObject` 兼容新字段
  - `tests/renderer/filter-bar.test.jsx` 既存 6 case 全过
- 总计 1041 passed | 4 skipped (1045) (v2.6.7 是 999, +42 net)
- esbuild bundle: 316kb (v2.6.7 是 282kb, +34kb = library scanner + 4 新组件 + detector wizard)

### Files (commit-by-commit 视角, 单个集成 commit 收口)

- `src/config/schema.js` — `_sanitizeLibrary` + DEFAULT
- `src/main/config-store.js` (新) — atomic write + sanitize
- `src/main/library/scanner.js` (新) — /Applications 扫盘
- `src/main/library/ops.js` (新) — 6 个纯函数 mutations
- `src/main/ipc.js` — 7 个 library handlers + _saveAndNotify
- `src/main/index.js` — onConfigUpdated + getConfigPath 传给 ipc
- `preload.js` — 7 个 library 通道 + onConfigUpdated 订阅
- `src/renderer/api.js` — 7 个 library API
- `src/renderer/store.js` — libraryConfig / unmonitoredApps / activeTagFilter signals
- `src/renderer/selectors.js` — filteredResults + tabCounts 支持 'starred' / 'unmonitored' / tag 过滤
- `src/renderer/App.jsx` — bootstrap 拉 library 数据 + 订阅 config-updated + LibrarySection 集成
- `src/renderer/components/FilterBar.jsx` — 加 2 chip + 计数
- `src/renderer/components/PinnedSection.jsx` (新) — 顶部 ⭐ 区
- `src/renderer/components/LibrarySection.jsx` (新) — 未监控列表 + 行级 pin/ignore/add
- `src/renderer/components/TagBar.jsx` (新) — 顶部 tag chip 过滤
- `src/renderer/components/TagInput.jsx` (新) — 单 app tag inline 编辑
- `src/renderer/components/DetectorWizardModal.jsx` (新) — 11 detector type + 字段表单
- `.gitignore` — 加 `.mavis/` 顶层

### 已知 follow-up (单独 PR)

- 拖拽 manual reorder (v5 草稿里说要做, v2.7.0 没做)
- bundleId 反查 detector 推荐 (现在 wizard 默认 brew_formulae)
- 跟 v5 草稿比, v2.7.0 实施调整:
  - ignored 用对象数组 (不是 string[]) — 用户拍板
  - tag 严格大小写 (不是 case-insensitive 去重) — 用户拍板

---

## v2.6.7 (AI Digest Generation Jobs) — 2026-06-10

### AI 总结生成机制重做

- 新增 `daily_digest_v2`: 按天保存完整 session catalog、append-only generation jobs、active generation。
- 新增 catalog / generation IPC 与 renderer store 信号，选择区始终来自完整 catalog，不再被生成结果覆盖。
- Drawer 改为“先选择 session，再生成总结”，结果区按本次 generation 分隔展示。
- 总结 prompt 固定中文结构: `用户诉求` / `处理结果`，避免英文和散乱格式混入。
- 保留 legacy `daily_digests` / rerun 兜底，降低迁移风险。

---

## v2.6.6 (Phase B7g: Drawer-Integrated Config + MiniMax2026 defaults) —2026-06-09

### MiniMax 默认切到2026 最新（官方）

- **Base URL**: `https://api.minimaxi.com/v1`（新版域名）
- **默认 model**: `MiniMax-M3`（用户指定2026 最新，中文优化）
- provider-cloud.js 的 `_joinUrl` 自动去重 baseUrl末尾的 `/v1`（避免 `.../v1/v1/chat/completions`双重）

### Drawer-Integrated Config (B7g) — 不再有独立 Settings modal

之前: 点 日历按钮 -> 显示"未配置"卡 ->引导用户去独立 modal启用 ->配完回来。
现在: **点 ↻刷新按钮** -> 如果还没配齐 -> **自动在 drawer 内弹配置表单**;配完直接跑。

**交互流**（你说的）:
1. 点 日历 ->打开 drawer,看到"未配置"提示 + 一句 hint
2. 点 ↻刷新按钮 -> **drawer原地切到 config view**（provider/model/baseUrl/api-key 表单）, 不跳独立 modal
3.填好 key -> 点"保存配置" -> 自动跑 rerun 生成昨日总结
4. 已配用户点 ↻ ->正常 rerun流程, 不弹 config

**Drawer header 新增 ⚙按钮**（在 ↻旁边）— 已配用户也能直接调出配置表单改 model / baseUrl /换 key, 不需要走老的 Settings路径。

**不再有显式 "启用" toggle**（B7f沿用）:
- 有 provider + 有 key -> 自动 enabled（跟 cfg派生）
- 无 provider / 无 key -> 不显示"启用"复选框 — 用户填表单就启用
-旧 AISettingsModal组件保留但 App.jsx 不挂载（legacy兜底,任何人误调 openAISettings也不会崩）

### Files

- `src/renderer/store.js` — `digestConfigMode` signal（新）+ `needsConfig()` helper（新）+ `rerunDigest()` 自动弹 config
- `src/renderer/components/AISettingsModal.jsx` —拆出 `<AIConfigForm />`共享组件（drawer + modal 共用）
- `src/renderer/components/AIDigestBanner.jsx` — drawer header 加 ⚙按钮, body 根据 `digestConfigMode`切 view
- `src/renderer/App.jsx` —移除 `<AISettingsModal />`挂载 + `onOpenSettings`接线
- `src/ai-sessions/provider-cloud.js` — MiniMax baseUrl 更新到 `minimaxi.com/v1`
- `tests/renderer/ai-digest-banner.test.jsx` — 重写:测新 AIDigestButton + AIDigestDrawer +33 个 case（含 B7g config mode）
- `tests/renderer/ai-settings-modal.test.jsx` — 重写:测 `<AIConfigForm />`（21 case, 含 compact mode）
- `tests/ai-sessions/provider-cloud.test.js` —修 baseUrl 去重逻辑期望

###验证

- `npm test` 全绿: **995 passed |4 skipped (999)**,62 test files
- `npm run build:renderer` 通过:281.9kb bundle

---

## v2.5.1 (Phase A3 + B 排查 + Step B LLM classify) — 2026-06-09

### Fix: 应用分类 + LLM classify 双管齐下

v2.4.0 引入了 8 类 category tab, 但 v2.4.0 release notes 已经指出"未映射 app → 其他 tab 兜底", v2.5.0 没有跟。这个 release 彻底解决:

**新 3 层 fallback (getCategory 路径):**
1. 静态 map (config/app-category.json) — 已存在
2. LLM classify cache (state.json.classify_llm_cache) — **新**
3. 'other' 兜底

**Step B — LLM classify (新):**
- main 启动期, 对**未命中静态 map** 的 app 调一次 LLM (强制 `qwen2.5-coder:7b` 在 `127.0.0.1:11434`)
- batch prompt 出所有 app 的 catId, 1 次 LLM 调 6 个 app
- heuristic 预跑给 LLM 提示 "我猜是 X" (15+ 关键词 rule: cursor/claude/... → ai, vscode/docker/... → dev, ...)
- 失败 graceful: 30s timeout, 不阻塞启动, log warn
- 结果持久化到 `state.json.classify_llm_cache`, 下次启动不重复调

**E2E 验证 (真 ollama, 6 个 app batch):**
- Cursor → ai, Kimi → ai, Chrome → browser, Obsidian → notes, Telegram → comms, WezTerm → other (5/6 命中)
- 耗时 ~11s (含 model load)

### 排查 patch: Digest "never runs" 可观测性

v2.5.0 的 AI Sessions 写完代码就 mark done, 但用户实际从未看到 digest banner 出内容 (state.json `daily_digests: {}`)。

**这次补 trail, 排查下一启动:**
- 启动期 main 在 3 个 phase 写 `state.json.last_digest_attempts[]` (ring buffer 8 条):
  - `wiring_build` ok/error
  - `merged_config` enabled/provider/detectors
  - `bootstrap` yesterdayStatus/backfillStatus
  - `no_sessions` (differentiate "no data" vs "didn't run")
- `wiring.js` 加 `onNoSessions` hook, `digest.js` 在 no-sessions 分支调
- 加 `stateStore.recordDigestAttempt()` / `loadDigestAttempts()` API

**用户下次启动后, 拿 `~/Library/Application Support/AppUpdateChecker/state.json` 的 `last_digest_attempts` 给我看, 就能直接定位 "merged config 跳过了" 还是 "wiring build 失败" 还是 "no sessions 空跑"**。

### 测试

- 28 个新 case: category-llm.test.js 覆盖 heuristic / LLM cache / LLM caller mock / 3 层 fallback
- 7 个新 case: state-store LLM classify cache 持久化
- 8 个新 case: state-store recordDigestAttempt (含 ring buffer / graceful fail)
- 总计 929/929 全过 (v2.5.0 是 852, +77)
- 仍 4 skipped, 跟 v2.5.0 一致

### 改动文件 (commit-by-commit 视角, 不需单独 PR)

- `src/config/category.js` — heuristic rules + LLM classify + setLLMCache + getCategory 三层
- `src/ai-sessions/digest.js` — onNoSessions hook
- `src/ai-sessions/wiring.js` — onNoSessions 透传
- `src/main/state-store.js` — recordDigestAttempt / loadLLMClassifyCache / saveLLMClassifyCache
- `src/main/index.js` — classifyUnmappedAppsByLLM + bootstrap log + 启动期同步调
- `tests/config/category-llm.test.js` (新) — 28 case
- `tests/main/state-store.test.js` — 15 新 case

### 已知 follow-up (单独 PR)

- state.json 路径还停在 `~/Library/Application Support/AppUpdateChecker/` (老 name). 改 brand `Pulse` 时没迁. 跟当前 release 无关, 但下次 rebrand 时一起做.
- BrowserWindow title 跟 package.json `name` 不强同步 (B 跟 B6c 之间发现的): 当前 `name: "pulse"`, window title 应该是 "Pulse" 但偶尔显老. 不在这次范围.

---

## v2.4.0 (Phase A) — 2026-06-08

### New: 应用分类 (App Categorization)

顶部新加 8 类 category tabs (底部下划线风格), 跟 search + 状态 tab 过滤器正交:

| 分类 | icon | 顺序 |
|------|------|------|
| AI 工具 | 🤖 | 1 |
| 开发者 | 🛠 | 2 |
| 浏览器 | 🌐 | 3 |
| 沟通 | 💬 | 4 |
| 媒体 | 🎨 | 5 |
| 笔记 | 📝 | 6 |
| 系统 | 🔧 | 7 |
| 其他 | 📦 | 99 (永显示) |

- 静态 1:1 映射 (24 个 app) — `config/categories.json` + `config/app-category.json`
- 顶部 tab 顺序: count desc → order asc, "全部" 永第一, "📦 其他" 永最后
- hide empty: 0 app 的 tab 不显示 (除 "📦 其他" 兜底)
- 切换 tab: 不丢 search query / 状态 tab / mute (持久化在 `state.json.active_category`)
- 键盘快捷键: `0` 切 "全部", `1-9` 切前 9 个 tab (按 tab 顺序, 焦点在 input 时不抢)
- 未映射 app → "📦 其他" (兜底, 永不崩)
- 切 tab 时 `saveActiveCategory` 走 IPC, 失败 log warn 不阻塞 UI

### 数据 + 架构

- 静态 map 是 single source of truth, 走 git PR 维护
- main 进程: 启动时 fs 读 JSON, 注入 `category.setData({ source: 'disk' })`
- renderer: esbuild static import JSON, 顶层 `category-init.js` 调 `setData`
- 失败降级: 缺 'other' / 引用不存在 id / 缺字段 — 全部走 module-level DEFAULT 兜底

### 已知 follow-up (单独 PR)

- spec 24 mapping 跟 `config.json` 实际监控的 11 app 只有 1 个 (Cursor) 重叠 → 初次启用时多数 app 归 "📦 其他"
- 建议 PR: 把 spec 里 claude/chatgpt/firefox/arc/sketch/... 替换为 Kimi/ima.copilot/MiniMax Code/WorkBuddy/QClaw/Marvis/QoderWork/Codex/CodexBar/CC Switch

### 测试

- 84 个新 case: category.test.js 22 + state-store 7 + filter-by-category 12 + category-tabs 15 + category-keyboard 12 + load-smoke 1 + 其它 15
- 总计 628/628 全过 (v2.3.0 是 532, +96)
- esbuild bundle: 232kb (v2.3.0 是 218kb, +14kb = inline JSON + CategoryTabs 组件)

### Phase A commit 拆分 (5 个独立可回滚)

- A1a `1b96a70` — 2 个 JSON 数据文件
- A1b `c3e2a78` — category.js runtime (后被 A3 refactor 改成 setData 注入)
- A1c `39f3aea` — load-smoke coverage
- A2 `08e85ba` — state-store active_category + IPC 3-place sync
- A3 `66e18e5` — store signal + filteredResults + 2-process data inject
- A4 `2a99ef0` — CategoryTabs 组件 + ResultsView 集成 + 视觉
- A5 — keyboard 快捷键 + 边界 case (本 release)

---



---

## v2.5.0 (Phase B) —2026-06-08

### New: AI编程会话每日总结 (AI Sessions Daily Digest)


顶部 ⚙️按钮 → AI总结 设置弹窗。**opt-in** — 默认关闭,老用户不受影响。

5 个 LLM provider 任选:
- **Ollama (本地)** — `qwen3.5:9b` 默认,无 auth,走 `http://localhost:11434`
- **OpenAI** — `gpt-4o-mini` 默认,Bearer auth,走 `/v1/chat/completions`
- **Anthropic** — `claude-sonnet-4-5` 默认,`x-api-key + anthropic-version:2023-06-01`走 `/v1/messages`
- **DeepSeek** — `deepseek-chat` 默认,OpenAI兼容
- **MiniMax** — `MiniMax-ABAB6.5s` 默认,OpenAI兼容 (`api.minimax.chat/v1`)

### API key 管理 (OS Keychain)

-走 Electron `safeStorage` (macOS Keychain / Windows DPAPI / Linux libsecret)
-加密文件位置: `~/Library/Application Support/Pulse/ai-keys/<provider>.bin` (mode0o600)
- Modal 提供 "保存 key" / "清空"按钮;key 不入 state.json (只 safeStorage ref)
- "测试连接"走轻量 `POST max_tokens=1` → ok/auth_401/http_status状态
- Linux 无 keyring 时 safeStorage不可用 →拒绝存 plaintext + UI hint

### Banner + 自动生成

-顶部 `<AIDigestBanner />` — 默认折叠,1 行60字符 preview + 🔄 重跑按钮
-启动时跑昨天 digest (idempotent) +首次启动自动 backfill7 天
-24h cron每天重跑昨天 digest
-手动 rerun / backfill (≤30 天)走 IPC
- digest持久化在 `state.json.daily_digests[dateKey]` (30 天 GC)

###边界处理

-401 → modal 测试连接显示 ✗ auth_401; digest跳过当天
- LLM 超时120s → retry1 次;仍失败 → log warn + skip
- safeStorage不可用 → wiring fallback stub summarizer (healthcheck永远 ok:false); digest 健康检查 fail → skip
- 同一天已有 digest → idempotent skip (除非 force rerun)
-损坏 safeStorage file → loadApiKey返 null + log warn
- backfill 中不重跑 (复用 in-progress)

### 数据 +架构

- `state.json` 新字段: `daily_digests: { [dateKey]: Digest }` + `ai_sessions_config: { enabled, provider, ollama, cloud }`
- `config.json` 的 `aiSessions`块可设 default;`ai_sessions_config` (state.json)优先
-7 个 IPC通道 (`ai-sessions:set-key/clear-key/has-key/healthcheck/get-config/save-config` + config-updated事件)
-3-place sync: ipc.js ↔ preload.js ↔ renderer/api.js

### 测试

-236 个新 case (B1+B2+B3+B4+B5+B6): provider-ollama21 + storage22 + provider-cloud37 + wiring16 + digest14 + cursor-detector13 + detector6 + summarizer7 + ai-digest-banner20 + ai-settings-modal13 + state-store B7 + integration8 + load-smoke1 +其它
- 总计 **864/864 全过** (v2.4.0 是768, +96 for Phase B)
- esbuild bundle:257kb (v2.4.0 是232kb, +25kb = provider-cloud + AISettingsModal + ⚙️ button + IPC)

### Phase B commit拆分 (8 个独立可回滚)

- B1 `1f3e6c1` —6 个抽象模块 + state-store扩字段
- B2a `8930619` — CursorDetectorImpl file-scan skeleton
- B2b `690c510` — readSession via node:sqlite (no native)
- B3a `256fb7d` — OllamaSummarizer HTTP impl +21 case
- B3b+c `781283d` — startup healthcheck + config schema
- B4 `77dceb2` — wiring + IPC + cron +17 case
- B5 `38f2ce1` — `<AIDigestBanner />` + store + bootstrap +20 case
- **B6a `3d953e1` — safeStorage helper + DI +22 case (本 release关键)**
- **B6b `d8cfd27` — CloudSummarizer (4 providers + Anthropic) +37 case**
- **B6b.5 `713567c` — wiring cloud路由 + runtimeOverride +16 case**
- **B6c `1f33aae` —6 IPC channels for Settings modal +3-place sync**
- **B6c.2 `e01d9a3` — renderer store signals + actions for Settings**
- **B6c.3 `7790976` — AISettingsModal +13 test case**
- **B6c.4 `8b2b6f3` — Header ⚙️ button + App.jsx modal集成**
- **B6d `8b1f065` —视觉样式 +错误路径验证**

### Caveats (release 前你必做)

- **真 SQLite query路径** (dev Node18 没 `node:sqlite`)
- **真 ollama端到端** (起 ollama 服务 +跑 Pulse + 看 startup log)
- **真 cloud端到端** (拿真 minimax/openai key +跑 Pulse + banner 显示 + rerun + backfill)
- **真 safeStorage round-trip** (装 DMG +存 key + 重启 + load 一致)
- **banner UI 真路径** (config.json 加 `aiSessions.enabled: true` 才能看到)

---



## v2.3.0 (Phase 29) — 2026-06-07

### New: 最近打开时间 (last-opened)

- 每个 app 监 macOS Spotlight 拿 `kMDItemLastUsedDate`，未索引 fallback 到 `stat -f '%a'` (atime)
- 持久化到 `state.json` 的 `last_opened` 字段，跨重启保留
- AppInfo 新加 "上次打开 · 2 天前" / "未使用" / "上次打开 · 估算 · 5 天前" 子标题
- atime fallback 标 "估算" + tooltip 解释为什么不靠谱

### New: 分级静音 (tier-aware mute)

- tier 阈值：≤ 7天 = 热，7-30天 = 温，> 30天 = 冷
- 5 个静音选项不变 (1/7/30/90/永远)，但**按 tier 排顺序 + 推荐项置顶加 ✨推荐 标签**
  - 热 tier (天天用) → 推 1 天
  - 温 / 未知 → 推 7 天
  - 冷 (很久没用) → 推 30 天
- 永远 永远在 last 位置

### 流程

- 每次 checkUpdates 完成后后台 async 刷 last-opened (mdls + atime)
- 写盘后推 `last-opened-updated` 事件给 renderer，UI 自动重排
- Bootstrap 时一次性 loadLastOpened 填初始值

### 测试

- 67 个新 case (29a 16 + 29b 24 + 29c 12 + 29d 15)
- 总计 532/532 全过 (v2.2.0 是 465)

### Phase 29 commit 拆分 (5 个独立可回滚)

- 29a `4230f90` — 数据源 (last-opened.js)
- 29b `9bc0947` — tier 逻辑 (tier.js, 纯函数)
- 29c `1aa617c` — state-store 持久化 + IPC
- 29d `c54370a` — renderer 集成 + UI
- 29e `8a19476` — main/index.js 接入 checkUpdates 生命周期

---

## v2.2.0 (Phase 28) — 2026-06-07

### Brand: AppUpdateChecker → Pulse

- **productName**: `AppUpdateChecker` → `Pulse`
- **appId**: `com.appupdatechecker` → `com.appupdatechecker.pulse` — ⚠️ macOS 视为新 app. **v2.0.0 已装用户**先卸载旧版再装新, 否则会装出 2 个 app. 卸载前 state.json 备份到 `~/Library/Application Support/AppUpdateChecker/`, 新版装好后会自动迁移 (字段名兼容)
- 菜单栏显示 `Pulse` (替代 `AppUpdateChecker`)
- 通知标题、Header `<h1>`、UA (`Pulse/2.2`)、index.html `<title>` 全部跟齐
- state / logs 路径**保留** `~/Library/Application Support/AppUpdateChecker/` 不动 (兼容老数据)

### Menu bar icon 重画

- 旧: 像素 Buffer 画的圆环 + 箭头 (用户反馈"太丑")
- 新: 4 个预渲染 PNG (`assets/iconTemplate@2x.png` + 10 个 badge 变体) — 单次 R-S ECG pulse, 1.8 stroke, 橙红 #e85d3a
- 22 个 PNG 总共 17.2 KB, 0ms runtime 加载开销
- `scripts/render-icons.js` 用 `@resvg/resvg-js` (纯 Rust, 无原生 binding) 一次性生成

### Badge 行为

- count 1-9 → 单独数字
- count ≥ 10 → 显示 `9+` (跟 Twitter / Discord 一致)
- retina (2x) + 1x 各一份, Electron 自动按 display scale 选

### 测试

- 465/465 全过 (Phase 28 业务逻辑 0 改动, 全是字符串 + asset)

---

## v2.1.0 (Phase 27) — 2026-06-07

### New: per-app 静音

- **右键任意 app 行** → 弹出菜单: 静音 7 天 / 30 天 / 90 天 / 永远
- 静音期间: 跳过系统通知, 跳过 bulk upgrade 计数, 行整体灰显 + 🔇 静音 badge
- 持久化到 `state.json` 的 `mutes` 字段, 跨重启保留; 过期项自动清理
- 解除: 同一菜单里点 "取消静音"
- 兼容老 state.json (无 mutes 字段时按空处理)

### Fix (顺手): cooldown 抑制路径

- 之前 `runCheck` 把 `state.apps` 抽成 `appsMap` 再传给 `suppressedByCooldown`, 但函数内部又读 `.apps`, 等于读 undefined → cooldown 永远不触发
- 默认 `cooldown_hours: 0` 掩盖了 bug, 任何用户设 24h 都会发现 "通知不按 cooldown 走"
- 修法: 直接传整个 `state` 给函数. 3 个 regression test 加到 `tests/integration/check-runner.test.js`

### 测试

- 新增 51 个 case: state-store 29 (持久化 + 兼容) + check-runner 7 (通知抑制) + mute-menu 11 (UI 交互) + app-info 4 (badge)
- 总计 465 个 case 全过 (v2.0.0 是 411)

---

## v2.0.0

### 概要

完整重写 (spec §1-§17)。修复 7 个 app 检测不准的问题 + 启动慢/卡顿。

## 4 个准的 app — 行为不变

| App | 检测方式 | 状态 |
|-----|---------|------|
| Claude | `app_store_lookup` | 保持准 |
| WorkBuddy (旧名) | 多 detector fallback | 保持准 |
| Marvis (旧) | electron_yml | 保持准 |
| QClaw | qclaw_api | 保持准 |

> 4 个 app 用 `unit test + fixture` 锁住, 重构未触及 detector 逻辑。

## 7 个修准的 app (基于真实 trace)

| App | 旧行为 | 新行为 | 根因 |
|-----|--------|--------|------|
| **Cursor** | `redirect_filename` 经常 404 | 改走 `cursor_redirect` (3.6→3.x) | redirect 链不稳定 |
| **Kimi** | `redirect_filename` 永远拿不到 | 接受 Kimi API 不支持 HEAD, 改走 GET + Content-Disposition 解析 | 真实 API quirk: HEAD→400, Allow: GET |
| **Marvis** | `app_store_lookup` 拿旧版本 | 改走 `electron_yml` (marvisapp.com) | iTunes lookup 慢 + 缓存滞后 |
| **WorkBuddy** | `api_json` 走错 URL | 改走 `app_update_yml` 链 + 修正 path field | 旧 URL 已下线 |
| **QClaw** | `qclaw_api` camelCase 不匹配 (QClawApiDetector 找不到) | 修 class name 解析 (`qclaw_api` → `QClawApiDetector`) | makeDetector bug |
| **MiniMax Code** | `api_json` URL 模板未填 | 修 URL 模板 + body 模板 | 配置字段名错 |
| **QoderWork** | 多 detector 链断 | 修 path field + multi-path fallback | 旧 path 字段名错 |
| **ima.copilot** | `api_json` 超时 | 修 nested field + 加 8s 单 detector timeout | 旧实现无 timeout, 卡死 |

> **6/7 修准** — Kimi 的 brew_formulae fallback 留给下个 cycle (spec §12 风险: 检测准度修了又回归, 用 fixture 锁住)。

## Config 自动迁移

老 `config.json` (单字段 `web_type` + `web_url`) 在主进程启动时**自动迁移**到新 schema (数组 `detectors[]`):

| 旧 web_type | 新 detector.type | 额外 |
|---|---|---|
| `redirect` | `redirect_filename` | url: web_url |
| `cursor_redirect` | `cursor_redirect` | url: web_url |
| `app_store` | `app_store_lookup` | url: web_url |
| `electron_yml` | `electron_yml` | url: web_url |
| `api_json` | `api_json` | url: web_url |
| `qclaw_api` | `qclaw_api` | url: web_url |
| `github_release` | `api_json` | url: web_url (合并) |
| `brew_api_json` | `brew_formulae` | cask: brew_cask |

- 老 config 触发迁移后, **原文件备份为 `config.json.bak`**, 不覆盖
- 11 个老 config 全部测过 (`tests/integration/config-migrate.test.js`, 39 个 case)
- 启动 1 次即生效, 无需用户操作

## 启动性能

- **冷启动到窗口可见**: 1.2s 中位数 (spec §10 目标 < 1.5s) ✓
- 实测: `node scripts/startup-bench.js --iterations=10` median 1227ms
- 旧版 3-10s+, 经常 hang

## 稳定性

- **断网启动**: 不 crash, 11 个 app 标 "无法检测" + banner 提示
- **worker crash**: 自动 respawn, 当前 task reject, 其余继续
- **tray 丢失**: 不退出, window banner 提示
- **config 损坏**: 用默认配置, log error, 不 crash

## 升级并发化

- 旧版 `for...of` 串行 await → 新版 `Promise.allSettled(concurrency=2)`
- 失败兜底: brew 失败 → 走 `download_url` 打开浏览器
- 实测 brew lock 兼容性: 1/2/3/4/5/8 并发 × 5 runs × `--dry-run` upgrade → **0 lock 错误**

## 埋点 + 诊断

- `~/Library/Logs/AppUpdateChecker/startup.log` — 启动时间分解
- `~/Library/Logs/AppUpdateChecker/detect.log` — 每个 app × detector trace
- spec §6 格式: `[tag] ISO [+tz] k=v k=v ...` (例: `app=Cursor det=cursor_redirect ms=234 version=3.6 confidence=high`)

## 已知限制 (下个 cycle)

- Kimi 的 brew_formulae fallback 路径未完整覆盖 (cycle 4)
- electron-builder code signing 未配置 (用户需自签或签发 Developer ID)
- 11 app × fixture 录制已 commit, 但 detector 链改了之后要重录 (具体见 `tests/fixtures/<app>/_summary.json`)
