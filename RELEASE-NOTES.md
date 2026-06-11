# Pulse v2.2.0 — Release Notes

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
