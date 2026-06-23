# Release Notes Onboarding — 设计 (代号: ON)

| 日期       | 作者         | 状态                          |
| ---------- | ------------ | ----------------------------- |
| 2026-06-23 | brainstorming | 设计已批准, 待 writing-plans  |

> 本 spec 不在 `2026-06-19-product-roadmap-design.md` 已立项项目中;
> 是用户 2026-06-23 临时新增的需求,作为独立增量。

## 1. 背景与目的

Pulse 当前是 `2.31.0` 之前的多个版本一路小迭代来的 (见 `.release-notes-2.25.7.md` … `.release-notes-2.31.0.md`)。
用户每次升级 Pulse 后,**没法知道"这版加了什么 / 改了哪里 / 我应该试试哪些新功能"**:

- README 里有零散的功能说明 (v2.11+ reminders / v2.13+ AI usage / v2.5+ AI digest),
  但 **每次发版的 release notes 只在仓库 `.release-notes-<ver>.md` 文件里**,没暴露给最终用户
- `ChangelogPanel.jsx` 是 detector 拉的 **每个被监控 app** 的 release notes,
  不是 Pulse 自己的 release notes
- 没有"首启引导 / onboarding / 已查看"机制, 全仓 grep 零命中

ON v1 解决 3 个问题:

1. **升级可见**:Pulse 升级到新版本后, 首次启动自动弹本版本 release notes + 功能介绍
2. **新功能可发现**:不只贴 changelog, 而是一个简短的多步向导引导用户了解本版本重点功能
3. **可重看**:Header 加个 📖 按钮, 用户随时能重新打开当前版本的 release notes

## 2. 现状 (代码基线)

通过 grep 验证 (2026-06-23):

- **无** `onboarding` / `firstLaunch` / `firstRun` / `intro` / `tour` 命中 → 真·零基础
- **无** `lastSeen` / `seen` / `lastViewed` 命中 → 无"已查看"状态机制
- **已有** release notes 文件:`.release-notes-2.25.7.md` / `2.28.0` / `2.29.0` / `2.30.0` / `2.31.0` (仓库根)
- **已有** markdown → 安全 HTML 渲染管线:
  - `src/renderer/changelog.js` `renderChangelog(src, format, changelogUrl)`
    走 `marked` → `DOMPurify.sanitize`
  - `src/renderer/components/ChangelogPanel.jsx` 已用此管线
- **已有** `state.json` schema v=1 扩展点: `state-store-schema.js` 的 `PRESERVE_FIELDS`
- **已有** atomic write + corruption recovery (Q8): `setMute` 等字段都走 saveAll
- **已有** IPC bootstrap 模式: `preload.js` 暴露 `window.api.*`,
  `src/main/index.js` `registerCore(api)` 注册 handlers
- **已有** modal / drawer 模式: `App.jsx` 根级挂 `<BulkUpgradeModal />` / `<DigestDrawer />` / `<WatchlistDrawer />`

## 3. v1 范围 (本次 spec 必做, 严格不超出)

### 3.1 数据模型 (state.json 新字段)

```json
{
  "v": 1,
  "...": "...",
  "last_seen_release": {
    "version": "2.32.0",
    "at": 1750000000000
  }
}
```

字段语义:

- `last_seen_release.version` (string, 与 `app.getVersion()` 对齐的 semver)
- `last_seen_release.at` (number, ms, 用户关向导的时间)

**兼容性**: 老 state.json 无 `last_seen_release` → 视为 `null` → 弹 (视为"从未看过")。

写入点:

- `state-store.js` 新增 `getLastSeenRelease()` / `setLastSeenRelease(version, at)`
- 走现有 `saveAll` atomic write, 不另起一份文件
- `state-store-schema.js` `PRESERVE_FIELDS` 加 `last_seen_release`

### 3.2 内容源

**第 1 页 (强制)**: `.release-notes-<currentVersion>.md` 全文
**第 2..N 页 (可选)**: `src/release-notes-content/<currentVersion>/slides.json`

`slides.json` Schema:

```json
{
  "version": "2.32.0",
  "slides": [
    {
      "id": "watchlist-v1",
      "title": "📌 可订阅 Watchlist",
      "subtitle": "把重要的 app pin 起来, 一有更新就单独通知你",
      "body": "主列表每行右侧有 ⭐ 按钮, 点了就 pin.\npinned app 升级会触发独立通知, 跟普通升级提醒分开.\n\nHeader ⭐ 按钮可以打开抽屉, 看到所有 pinned app.",
      "screenshot": null
    }
  ]
}
```

- `version` — 必填, loader 校验
- `slides[]` — 0..N 个 slide
- `id` — 唯一 id (测试断言用)
- `title` / `subtitle` / `body` — markdown lite (加粗 / 列表 / 链接)
- `screenshot` — 可选, 本期 schema 留位, `null` 时不渲染图片

**优雅降级**:

| 情况 | 行为 |
| ---- | ---- |
| 找不到 `.release-notes-<ver>.md` | `getCurrent()` 返回 `null` → 不弹 |
| `slides.json` 不存在 | wizard 单页 changelog + "无功能介绍, 完成" |
| `slides.json` parse 失败 | log warn, 单页退化 |
| schema 校验失败 (缺 `version` / `slides`) | log warn, 单页退化 |
| `slides = []` | 同"找不到", 单页 |

### 3.3 触发与判定

**真相**: `app.getVersion()` (main 读 `package.json` 的 `version` 字段, Electron 标准)
**本地记录**: `state.json.last_seen_release.version`

判定逻辑:

```text
seen = stateStore.getLastSeenRelease()
currentVersion = app.getVersion()

if (!seen || seen.version !== currentVersion)
  → 弹 (自动)
else
  → 不弹
```

判定时机: renderer bootstrap 完成后, 在 `applyCachedResults` 之后, `triggerCheck` 之前 (避免与 check 抢焦点)。

### 3.4 IPC 接口

`preload.js` 暴露:

```js
window.api.releaseNotes = {
  getCurrent: () => Promise<{version, alreadySeen, changelogMd, slides} | null>,
  getVersion: (version) => Promise<{version, changelogMd, slides}>,
  markSeen: (version) => Promise<{ok: boolean, version: string}>,
};
```

**`null` 语义**: main 找不到 `.release-notes-<version>.md` → 返回 `null` → renderer 不弹, 不报错。

### 3.5 组件清单

**新增**:

```
src/
├── release-notes/
│   └── loader.js                       ← main 侧纯函数: readReleaseNotes / readSlides
├── main/
│   └── release-notes.js                ← IPC handlers + 启动推送
├── renderer/
│   ├── release-notes-store.js          ← signals: open / version / loading
│   └── components/
│       ├── ReleaseNotesWizard.jsx      ← modal, 向导本体
│       └── ReleaseNotesTrigger.jsx     ← Header 📖 按钮 (带 "NEW" 红点)
└── release-notes-content/              ← 新增 (实际内容, 发版时手工填)
    └── 2.32.0/
        └── slides.json
```

**修改**:

```
src/main/state-store.js                 ← 加 getLastSeenRelease / setLastSeenRelease
src/main/state-store-schema.js          ← PRESERVE_FIELDS 加 last_seen_release
src/main/index.js                       ← registerReleaseNotes(api) 接入
preload.js                               ← 暴露 release-notes:* API
src/renderer/index.jsx                  ← bootstrap 后调 get-current 决定是否自动弹
src/renderer/App.jsx                    ← 挂 <ReleaseNotesWizard /> (modal 在 root)
src/renderer/components/AppShell.jsx    ← Header 注入 <ReleaseNotesTrigger />
styles.css                                ← wizard 样式 (modal 遮罩 + 翻页 + 进度点)
```

### 3.6 UI 形态

**Wizard (modal, 遮罩)**

- 全屏遮罩 + 居中卡片 (宽度约 560px, 高度 max 80vh, 滚动)
- 顶部:进度点 (● ● ● ● ○ ○, 已看 / 总数)
- 中部:当前 slide 内容
  - slide 0 (第 1 页): changelog 全文, 走 `renderChangelog` (marked + DOMPurify)
  - slide 1..N: title + subtitle + body
- 底部: [跳过] [← 上一步] [下一步 →] [完成]
- 关闭路径 (全部等价, 都调 mark-seen):
  - 点 [跳过]
  - 翻到最后一页点 [完成]
  - 按 ESC
  - 点遮罩 (modal 外部)

**Header 📖 按钮 (ReleaseNotesTrigger)**

- 与现有 ⏰🕒⭐⚙️ 等按钮并列
- 未看时 (last_seen_release.version !== currentVersion) 显示红点 "NEW"
- 已看时无红点
- 点击 → 打开 wizard (同自动弹的 wizard), 但**不**调 mark-seen

### 3.7 状态机

```text
[hidden]
   │ auto-open (首次升级)  /  click 📖 (手动)
   ▼
[loading]                  ← 拉取中, spinner
   │ resolve
   ▼
[browsing]                 ← 显示当前 slide, prev/next 可点
   │ user 跳过/完成/ESC/点遮罩
   │ IPC: mark-seen (auto-open 路径)
   │ resolve
   ▼
[hidden]                   ← 红点消失

manual 路径 (click 📖): 不调 mark-seen, 关闭后 state 不变
```

### 3.8 可访问性

- modal `role="dialog"` `aria-modal="true"` `aria-labelledby="rnw-title"`
- 焦点 trap: 打开时焦点进 modal, 关闭时回 Header 📖 按钮
- ESC 关闭
- 键盘: ← → 翻页, Enter 完成
- 屏幕阅读: title + subtitle + body 都可读

## 4. 错误处理

| 失败点                       | 行为                                                         |
| ---------------------------- | ------------------------------------------------------------ |
| `app.getVersion()` 读不到    | 不弹 (electron 保证不发生)                                   |
| `state.json` 加载失败        | 视为 `last_seen_release = null` → 弹, 不阻断 bootstrap      |
| `.release-notes-<ver>.md` 缺 | `getCurrent()` 返回 `null` → 不弹 (发版漏 md 的容错)         |
| `slides.json` 缺 / parse 错 | log warn, wizard 单页 changelog                              |
| `mark-seen` IPC 失败         | toast "保存失败, 下次启动还会再弹" (warn 级, 不阻断关闭)    |
| `renderChangelog` marked 抛错 | try-catch 包, 失败时显示原文纯文本 + 关闭按钮              |
| DOMPurify 不可用              | fail-closed: 不显示内容 + toast "无法安全渲染"              |

## 5. 测试策略

### 5.1 `tests/main/release-notes.test.js` — loader + state-store

- `readReleaseNotes(version)`: 找到 / 找不到 / parse 失败
- `readSlides(version)`: 找到 / 找不到 / parse 失败 / schema 失败 / 空数组
- `getLastSeenRelease` / `setLastSeenRelease`: 写入 / 读取 / 老 state 兼容

### 5.2 `tests/main/register-core-release-notes.test.js` — IPC handlers

- `release-notes:get-current` 6 路径:
  - 已看 (`alreadySeen: true`)
  - 未看 (`alreadySeen: false` + payload)
  - 全新装 (last_seen_release 缺 → 未看)
  - 找不到 md → `null`
  - slides 缺 → `slides: null`
  - state-store 抛错 → `alreadySeen: true` (fail-safe, 不弹)
- `release-notes:mark-seen`: 正常写 / 写失败不抛错 (log warn)
- `release-notes:get-version`: 同 version 时等同 get-current, 不同 version 强制返回

### 5.3 `tests/renderer/ReleaseNotesWizard.test.jsx` — 向导组件

- 默认隐藏
- open signal → 显示 + 焦点 trap
- prev / next / 翻页到底
- skip / 完成 / ESC / 遮罩 → 调 mark-seen + 关闭
- mark-seen IPC 失败 → 显示 toast 但仍关闭
- 只有 changelog 无 slides → 单页 + 完成按钮
- slides body 走 marked → DOMPurify 渲染 (断言不出现 `<script>`)

### 5.4 `tests/renderer/ReleaseNotesTrigger.test.jsx` — Header 按钮

- 首次未看 → 显示 "NEW" 红点
- 已看 → 不显示红点
- 点击 → open wizard (payload 一致), **不**调 mark-seen

### 5.5 Fixture

`tests/release-notes-content/2.32.0/slides.json` — 给 loader test 用

## 6. 范围外 (明确不做)

- ❌ 多语言 / i18n (当前 Pulse 全中文 UI)
- ❌ 截图 / 视频嵌入 (`screenshot` 字段留 null, schema 占位)
- ❌ "以后不再提示" 永久跳过
- ❌ 全局开关 (Settings 里加 "禁用首启引导")
- ❌ Tray 菜单入口 (Header 📖 即可)
- ❌ 老版本补 slides.json (历史 `.release-notes-2.25~2.31.md` 不补, 未来发版才会带 slides)
- ❌ 视觉庆祝动画
- ❌ 桌面通知 (升级引导本身不弹系统通知)

## 7. 验收 (发版后 smoke)

1. **首次装 Pulse 全新 state.json** → 启动 → wizard 自动弹
2. **看完任何方式关闭** → 重启 → wizard 不弹
3. **从 2.31.0 升 2.32.0** (state.json 有 `last_seen_release=2.31.0`) → 启动 → wizard 自动弹
4. **完成向导** → 重启 → 不弹
5. **手动点 Header 📖** → wizard 弹, 但**不**调 mark-seen → 关闭 → 重启 (2.32.0 还没看) → 仍然弹
6. **Header 📖 红点** — 已看则无红点, 未看则有
7. **不发 slides.json** (只发 md) → wizard 只显示 changelog 一页
8. **删 state.json** 模拟 corruption 恢复 → wizard 弹 (视为未看)
9. **ESC / 遮罩 / 跳过 / 完成** 四种关闭路径 → 都调 mark-seen
10. **翻页 ← →** 正常; 焦点 trap 进 modal 不跑

## 8. 风险与降级

| 风险                                          | 等级 | 缓解                                                  |
| --------------------------------------------- | ---- | ----------------------------------------------------- |
| 发版漏 `.release-notes-<ver>.md`              | 中   | `getCurrent` 返回 `null` → 不弹 + log warn            |
| state-store 写失败                            | 低   | mark-seen 失败 → toast + log warn, 下次启动会再弹     |
| 用户跳过了 2.32.0 直接装 2.32.1               | 低   | 装 2.32.1 后 version 不一致 → 弹 2.32.1 的内容 (自然) |
| 旧版本 (< 2.32.0) 升到 2.32.0                 | 低   | last_seen_release 缺字段 / 不一致 → 弹 2.32.0        |
| 跨大版本号 (2.x → 3.x) 从没见过               | 低   | 同上, 弹就弹, 没历史包袱                              |
| 多用户共享同一台 Mac (state.json 是 user-level) | 低 | 跟现有 mutes / last_opened 同样语义, 视为"用户行为"   |

## 9. 实施顺序 (在 writing-plans 里展开)

1. state-store 新字段 + schema PRESERVE_FIELDS + 单元测试
2. release-notes loader (readReleaseNotes / readSlides) + 单元测试
3. main IPC handlers (getCurrent / getVersion / markSeen) + 单元测试
4. preload.js 暴露 + 集成进 main/index.js
5. renderer release-notes-store signals
6. ReleaseNotesWizard 组件 + 单元测试
7. ReleaseNotesTrigger 组件 + 单元测试
8. AppShell Header 注入 + App.jsx 挂载
9. styles.css 样式
10. bootstrap 接入自动弹
11. 全量 vitest 绿 + 手测脚本验证

## 10. 上游依赖

无。复用:

- `marked` + `dompurify` (package.json 已有)
- `state.json` atomic write (已有)
- IPC bootstrap 模式 (已有)
- modal / drawer 模式 (已有)
- `ChangelogPanel.jsx` 渲染管线 (已有)
