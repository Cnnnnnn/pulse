# Pulse Daily Digest — I1 Drawer + I5 Notification (2026-06-20)

| 日期       | 作者         | 状态     |
| ---------- | ------------ | -------- |
| 2026-06-20 | brainstorming | 设计中   |

## 1. 背景与目的

Pulse 在 v2.24.x 已有 **AI 会话摘要抽屉**(`AIDigestDrawer`,见 `docs/superpowers/specs/2026-06-09-pulse-digest-drawer-ui-design.md`),但它只覆盖 AI 会话这一类信息。Roadmap(`2026-06-19-product-roadmap-design.md`)里 **I1 计划把抽屉扩展到覆盖热搜 / IT 新闻 / 基金变动 / 世界杯 / AI 用量预警**,并把 **I5 每日早报通知**也建在同一聚合层之上。

**本文档合并实施 I1 + I5:**

- **I1**: 全源聚合 + 多 section 抽屉 UI(替代/并列于现有 AI digest 抽屉)
- **I5**: 每日定时通过系统通知推一条精简摘要(最多 6 行)

目标:用户**不用打开 app 就知道**关键变化,同时提供完整的抽屉视图供展开。

## 2. 范围与非范围

### 范围内

1. **Pure aggregator**(`src/main/digest/aggregate.js`):纯函数,输入 state + 各 fetcher 输出,产出 `{date, sections: [{kind, items: []}], lines: []}`(lines 最多 6 行 + "查看全部 →")
2. **Drawer UI**(`src/renderer/components/DigestDrawer.jsx`):480px 右抽屉,每个 source 一个 section,带 section header + 列表 + 点击跳源
3. **Scheduler**(`src/main/digest/daily-summary-job.js`):setInterval(60s) 检测触发,持久化 `last_digest_push_date` 避免同日重复
4. **Notification**:复用 `check-runner.js` 的 `Notification` 注入模式 + `notification-policy.js` 的 `inQuietHours`,click → `webContents.send('digest:open')` + showWindow
5. **Settings UI**:新增 Daily Digest section(`AISettingsModal` 内或独立 panel)— `{enabled: true, time: "08:30"}`
6. **State schema**:`state.json.daily_digest = {enabled, time, last_push_date}`(进 PRESERVE_FIELDS,新字段,forward-compat)
7. **空状态 / 静默**:aggregator 返回空 lines 时**不推送通知**(零打扰是 I5 重点)
8. **Quiet hours**:复用 `inQuietHours`,在 quiet hours 内即使时间到也不推
9. **首次权限**:`Notification.isSupported()` 检查,不支持时只在抽屉显示 banner

### 非范围(留给后续)

- 推送渠道扩展(邮件 / Telegram / Slack)— YAGNI
- 用户自定义推送时间粒度(目前只能 HH:MM)— YAGNI
- 推送频率选项(每天 / 每周 / 仅工作日)— YAGNI,只支持每日
- 模板化推送(用户自选 section)— YAGNI,固定 6 section 优先级
- 抽屉内搜索 / 过滤 — YAGNI,先看完整列表再说
- 桌面 widget / Live Activity — 非本期目标

## 3. 数据源与优先级

aggregator 从 state-store + 各 IPC handler 拿数据。section 排序固定(高价值优先),最多展示 6 个 section(每 section 1-2 行内容):

| 顺序 | kind          | 数据来源                                | 单 section 行数 |
| ---- | ------------- | --------------------------------------- | --------------- |
| 1    | `updates`     | state.apps (has_update=true)            | 最多 3          |
| 2    | `hot`         | state.ithome_news / state.wechatHot     | 3               |
| 3    | `news`        | state.ithome_news (头条)                | 1               |
| 4    | `funds`       | state.funds (今日涨跌 >1%)              | 2               |
| 5    | `ai_usage`    | state.ai_usage (任意 provider >80%)     | 1               |
| 6    | `worldcup`    | state.worldcup_scores (今日比赛)        | 1               |

**Lines 拼装** (push 通知用):
- 每个 section 取首行
- 拼接成 "🌅 Pulse 早报 · 2026-06-20\n• Cursor 3.6.32 → 3.6.33\n• 热搜: xxx\n..." 最多 6 行
- 每行 ≤ 60 字符,超长截断 + "…"
- 末尾固定 `查看全部 →`(title 链接)

## 4. 架构与文件结构

```
src/main/digest/
  aggregate.js              # 纯函数: state → {date, sections, lines}
  daily-summary-job.js      # scheduler: setInterval + last_push_date gate
  digest-fetcher.js         # 包装 IPC + state,提供 fetchSection(kind)

src/renderer/digest/
  DigestDrawer.jsx          # 抽屉 UI(替换/并列 AI digest 抽屉)
  digest-store.js           # signal: digestDrawerOpen, digestSections, digestLoading
  DigestSection.jsx         # 单 section 渲染(根据 kind 选样式)
```

**修改**:
- `src/main/index.js`:启动期 `bootstrapDigestJob()`
- `src/main/state-store.js`:`PRESERVE_FIELDS` 加 `daily_digest`
- `src/main/state-store-schema.js`:`daily_digest` 加到 FIELD_SPECS(object,可选)
- `src/main/ipc/register-core.js`:新增 IPC `digest:open` handler / `digest:fetch-sections`
- `src/main/ipc/context.js`:不需要改动
- `preload.js`:`digestFetchSections()` + `onDigestOpen(cb)` exposure
- `src/renderer/api.js`:对应 wrapper
- `src/renderer/store/index.js`:re-export digest-store
- `src/renderer/index.jsx`:订阅 `onDigestOpen`,打开抽屉
- `src/renderer/App.jsx`:挂载 `<DigestDrawer />`
- `src/renderer/components/AISettingsModal.jsx`(或新建):新增 Daily Digest section
- `src/main/bootstrap/schedulers.js`(可选):若已有 scheduler 注册点,挂上去
- `styles.css`:`.digest-drawer` 系列样式

## 5. 数据流

### Aggregator (纯函数)

```
aggregate(state, {now, maxLines=6}) → {date, sections: [...], lines: [...]}

state shape:
  {
    apps: {Cursor: {has_update: true, latest_version: '3.6.33', ...}},
    ithome_news: {articles: [...]},
    wechatHot: [...],
    funds: {holdings: [{code, name, today_change_pct}]},
    ai_usage: {providers: {minimax: {percent: 87}, glm: {percent: 45}}},
    worldcup_scores: {entries: {...}},
    daily_digest: {last_push_date: '2026-06-19'},
  }
```

**关键不变量**:
- aggregator **只读 state**,不发起任何 IPC / fetch
- 所有数据源已通过 check 周期预热,aggregator 是纯计算
- `lines` 是 push 通知内容,`sections` 是 drawer 内容
- aggregator **不写 state**(last_push_date 由 job 写)

### Scheduler

```
daily-summary-job.start({getState, setState, getConfig, sendNotification, aggregate})
  每 60s 检查:
    if (!state.daily_digest.enabled) return
    const now = new Date()
    const target = parseHHMM(state.daily_digest.time || '08:30')
    if (inQuietHours(now, ...)) return
    if (now.getHours() * 60 + now.getMinutes() !== target) return
    if (state.daily_digest.last_push_date === ymd(now)) return  // 已推过
    
    const result = aggregate(state, {now})
    if (result.lines.length === 0) return   // 静默跳过
    
    sendNotification({title: `🌅 Pulse 早报 · ${ymd(now)}`, body: lines.join('\n')})
    setState({daily_digest: {...state.daily_digest, last_push_date: ymd(now)}})
```

**关键约束**:
- `setInterval(60_000)`,不需精确到秒级
- `last_push_date` 用 `YYYY-MM-DD` 本地时区(不是 UTC)
- 启动时**先跑一次** `checkAndPush()`,避免重启后漏推(若今天没推过)
- job 单例(module-level state),不会重复注册

### Notification click

```
notification.on('click', () => {
  showWindow()       // index.js 现有 helper
  sendToRenderer('digest:open', {date: '2026-06-20'})
})
```

renderer 端 `index.jsx` 订阅 `onDigestOpen` → 设置 `digestDrawerOpen.value = true`

## 6. IPC 接口

| Channel                | Direction       | Payload     | Response                  |
| ---------------------- | --------------- | ----------- | ------------------------- |
| `digest:fetch-sections`| renderer → main | (none)      | `{date, sections: [...]}` |
| `digest:open`          | main → renderer | `{date}`    | (fire-and-forget)         |
| `digest:update-settings` | renderer → main | `{enabled, time}` | `{ok: true}`         |

**preload**:
```js
digestFetchSections: () => ipcRenderer.invoke("digest:fetch-sections"),
digestUpdateSettings: (cfg) => ipcRenderer.invoke("digest:update-settings", cfg),
onDigestOpen: (cb) => ipcRenderer.on("digest:open", (_, data) => cb(data)),
```

## 7. Settings UI

`AISettingsModal` 内新增 section(或新建 `DailyDigestSettings.jsx` 作为独立 modal,根据工期决定):

```jsx
<section class="settings-section">
  <h3>每日早报通知</h3>
  <label class="settings-row">
    <input type="checkbox" 
           checked={cfg.daily_digest?.enabled ?? true}
           onChange={...} />
    <span>启用每日早报</span>
  </label>
  <label class="settings-row">
    <span>推送时间</span>
    <input type="time" 
           value={cfg.daily_digest?.time ?? "08:30"}
           disabled={!cfg.daily_digest?.enabled}
           onChange={...} />
  </label>
  <p class="settings-hint">
    无重要变化时不推送。Quiet hours (23:00-08:00) 内也会跳过。
  </p>
</section>
```

## 8. 错误处理

| 场景                          | 行为                                        |
| ----------------------------- | ------------------------------------------- |
| `Notification.isSupported()` = false | 启动时 log warn,job 仍跑但 notification 调用被 noop |
| aggregator 抛异常(state 损坏)| job 捕获 + log warn + 不推送,明天再试       |
| `setState` 失败                | 明天仍会再触发(幂等性 OK)                  |
| renderer 未启动时收到 click    | `showWindow()` 仍能开,但 `onDigestOpen` 监听器不在,fallback 到默认 tab |
| time 字段解析失败              | fallback 到 '08:30'                         |

## 9. 测试

### 单元测试(纯函数)

- `aggregate.test.js` (8+ cases)
  - 空 state → 空 sections,空 lines
  - 仅 has_update → 1 section, 1 line
  - 多 section 优先级正确
  - 每 section 行数限制
  - lines 总数 ≤ 6 + truncate 行为
  - 长字段(>60 字符)截断
  - 基金涨跌 =0 不入 section
  - AI 用量阈值 (>80%) 边界

- `daily-summary-job.test.js` (5+ cases,需 useFakeTimers)
  - 时间匹配触发一次
  - 同日重复触发被 last_push_date 跳过
  - quiet hours 内跳过
  - 启动时已过时间点 → 第一次 setInterval 立即触发补推(若今天没推过)
  - 空 lines 静默跳过

- `digest-policy.test.js` (3+ cases)
  - enabled=false 不跑
  - time 解析失败 fallback
  - ymd 本地时区正确(不是 UTC)

### 集成测试

- IPC `digest:fetch-sections` happy path
- notification click → `digest:open` IPC push

### 手动 e2e

1. 启动 dev,设 time = 现在 + 2 分钟,enable
2. 等触发,看系统通知
3. 点通知,主窗口打开 + Digest tab 激活
4. 抽屉显示完整 sections
5. 改 enabled = false,等 1 分钟,不再触发
6. 把所有 state 清成空,触发 → 无通知

## 10. 文件清单

**新增**:
- `src/main/digest/aggregate.js`
- `src/main/digest/daily-summary-job.js`
- `src/main/digest/digest-fetcher.js`
- `src/renderer/digest/DigestDrawer.jsx`
- `src/renderer/digest/DigestSection.jsx`
- `src/renderer/digest/digest-store.js`
- `src/renderer/components/DailyDigestSettings.jsx` (或并入 AISettingsModal)
- `tests/main/digest/aggregate.test.js`
- `tests/main/digest/daily-summary-job.test.js`
- `tests/renderer/digest/DigestDrawer.test.jsx`

**修改**:
- `src/main/index.js`(启动期 + notification click handler)
- `src/main/state-store.js`(`PRESERVE_FIELDS` +1)
- `src/main/state-store-schema.js`(`FIELD_SPECS` +1)
- `src/main/ipc/register-core.js`(2 个 IPC handler)
- `preload.js`(+3 method)
- `src/renderer/api.js`(+3 wrapper)
- `src/renderer/store/index.js`(+1 export)
- `src/renderer/index.jsx`(订阅 + 订阅 onDigestOpen)
- `src/renderer/App.jsx`(+1 mount)
- `styles.css`(+~50 行)
- `RELEASE-NOTES.md`(新 Unreleased section)

## 11. 风险与缓解

| 风险                                | 缓解                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| 通知频率过高变骚扰                  | enabled 开关 + 空状态静默 + quiet hours                    |
| 平台通知权限缺失                    | `Notification.isSupported()` 检查 + fallback log           |
| 启动时间变慢(job + fetcher)         | job 启动开销 < 10ms,aggregator 是纯函数(< 5ms)            |
| state schema 变更影响老 user         | `daily_digest` 进 FIELD_SPECS 为可选 + PRESERVE_FIELDS     |
| aggregator 依赖多源数据              | 每个 section 单独 try/catch,失败降级为空,其他继续         |
| 8:30 触发时 user 在用 app            | 通知仍发,click 行为走标准 IPC,不影响正常使用              |
| last_push_date 跨时区                | 用 `YYYY-MM-DD` 本地时区,user 移动时区不重复推送          |

## 12. Self-Review

1. **范围检查**:合并 I1 + I5 是否过大?— 不算过大,因为 aggregator 一次写好,UI 渲染复用既有 drawer 模式(2026-06-09 那份 spec 的 480px + header/footer 结构)。
2. **占位符扫描**:无 TBD。
3. **内部一致性**:aggregator 输出 `sections`(drawer 用)+ `lines`(push 用)— 同一函数不同投影,逻辑清晰。
4. **歧义**:lines 拼接顺序按 section priority 排,已明确写;section 内 item 排序规则需在 plan 阶段细化。
5. **TypeScript exhaustiveness**:JS 项目,无需 `never` check,但 aggregator 用 `kind` 字符串可加显式 switch 列出所有 kind,新增 kind 时 throw 提示。

## 13. Handoff

Spec 完成后:
1. 用户审阅(spec 文件已 commit)
2. 调用 `writing-plans` 技能,产 `plans/2026-06-20-i1-i5-daily-digest-plan.md`
3. plan 批准后,subagent-driven 实施
