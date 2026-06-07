# Pulse Phase 28/29 实施计划

- **来源 spec**: `docs/superpowers/specs/2026-06-07-pulse-rebrand-and-last-opened-design.md`
- **日期**: 2026-06-07
- **作者**: Mavis (brainstorming-2 → writing-plans fallback)
- **范围**: 9 个 sub-task, 2 phases, 总计 9-10h
- **执行策略**: Phase 28 (4 sub-task, ~3h) 单线执行我自己开干; Phase 29 (5 sub-task, ~5-6h) 视工作量决定是否走 `mavis-team` 并行

---

## Phase 28 — Identity (单线, 我自己干)

### 28a — SVG 源 + render script (~1h)

**新增文件**:
- `assets/iconTemplate.svg` — ECG path (3-9 段), stroke 2.2, round caps
- `assets/iconBadgeTemplate.svg` — ECG + 红圆 placeholder (red circle, no digit yet)
- `scripts/render-icons.js` — 读 SVG 源, 调 `@resvg/resvg-js` 渲染到 4 个 PNG

**改动**:
- `package.json` 加 devDep `@resvg/resvg-js` (or 已有 `sharp`)
- `scripts/render-icons.js` 输出:
  - `assets/iconTemplate.png` 16x16
  - `assets/iconTemplate@2x.png` 32x32
  - `assets/iconBadge.png` 32x16 (no digit, 由 28b 处理)
  - `assets/iconBadge@2x.png` 64x32

**验证**:
- `node scripts/render-icons.js` exit 0
- `sips -g pixelWidth -g pixelHeight` 4 个文件 = 期望尺寸
- 手画 1-2 轮微调直到 ECG 形态 OK

**risk**: 1x 看不出 retina 像素差, 2x 优先 review; 字母 / 几何需要准 → SVG source 必须准确

### 28b — 4 PNG 资源 + tray.js 改造 (~1h)

**改动**:
- `src/main/tray.js`:
  - 删 `createTrayIcon()` 的 pixel buffer 逻辑
  - 加 `loadIconTemplate()` / `loadIconBase()` 从 assets 读
  - `setTemplateImage(true)` 保留
  - `createBadgeIcon(updateCount)` 重写:
    - 读 `iconBadge@2x.png` 作 base
    - **updateCount 1-9**: 加载预渲染 `iconBadge-1.png` ~ `iconBadge-9.png` (12 个)
    - **updateCount 10-99**: 加载 `iconBadge-XX.png` (用 `XX=` `${n}` padStart(2, '0'))
    - **updateCount > 99**: 加载 `iconBadge-99plus.png`
- `scripts/render-icons.js` 扩展: 生成 13 个 badge PNG (1-9, 00-99? 跳过 0 算 1 个, 实际 1-9 + 10-99 = 99 个 + 1 个 99+ = 101 个 — **太膨胀**)

**Decision (28b)**: 改 13 → 4 + 12 = 16 个文件

- 4 个 base: `iconTemplate.png`, `iconTemplate@2x.png`, `iconBadge.png`, `iconBadge@2x.png`
- 12 个 pre-rendered badge: `iconBadge-1.png` (16x16) ~ `iconBadge-9.png` + `iconBadge-10.png` ~ `iconBadge-99.png` 共 99 个? — too much

**Final 28b decision**: 用 `@napi-rs/canvas` 在 runtime 画 digit 在 base PNG 上。@napi-rs/canvas ~10MB 一次, 比 ship 100 个 PNG (~200KB) 划算, 而且未来可以支持 N+ 数字。

**改回**: render-icons.js 只生成 4 个 base PNG; tray.js 启动时 +badge 数字时用 canvas 画。

**新增 devDep**: `@napi-rs/canvas` (or `canvas`)

**验证**:
- 菜单栏视觉: 启动 app 看 icon 是否 ECG 形态 + 颜色对
- Badge: 模拟 updateCount = 1, 5, 12, 99, 200 看数字是否对、位置对

### 28c — package.json + window.js + README + RELEASE-NOTES (~30min)

**改动**:
- `package.json`:
  - `name`: `app-update-checker` → `pulse`
  - `productName`: `AppUpdateChecker` → `Pulse`
  - `description`: → `macOS 菜单栏更新监测器 — Pulse`
  - `build.appId`: `com.appupdatechecker` → `com.appupdatechecker.pulse`
- `src/main/window.js`: window title `AppUpdateChecker` → `Pulse`
- `index.html`: `<title>` 改 `Pulse`
- `README.md`: 标题 + 简介 (保留 changelog 内容)
- `RELEASE-NOTES.md`: 加 v2.2.0 (Phase 28) 章节 (icon + 改名)

**验证**:
- `grep -rn "AppUpdateChecker" src/ index.html package.json --include="*.js" --include="*.json" --include="*.html"` 应只剩:
  - `package.json` `build.appId` 的 `com.appupdatechecker.pulse` (字符串保留 org 段)
  - `config.json.bak` (历史备份, 仓库已 gitignore, 不在 grep 范围)
  - 旧 release notes (v2.0.0, v2.1.0) 历史记录不改
- `npm start` 看窗口 title = "Pulse"

### 28d — Smoke test + 装 .dmg (~30min)

**步骤**:
1. `npm test` 全过 (465 个 case 应不受 Phase 28 影响)
2. `npm run build` 出 `.dmg`
3. 装到 `/Applications/Pulse.app`
4. 启动看 menu bar icon
5. 测 toggle 数量: 让 detector 跑一次, badge 数字 1, 5, 12
6. 测深浅模式切换 (System Settings → 切 dark mode, 看 icon 是否反色)

**rollback plan**:
- Phase 28 改的全是字符串 + asset 文件, 回滚 = revert 1 commit
- 不动 detector / state / business logic, rollback 风险极低

---

## Phase 29 — Last-opened + Tiered Mute (5 sub-task, ~5-6h)

**执行决策点 (post-Phase 28)**:
- Phase 28 落地后, 我评估是否拆 mavis-team
- 拆点: 29a + 29b 可并行 (last-opened.js + tier.js 都新模块, 无依赖)
- 29c 之后串行 (state-store 改动影响 29d 的 renderer)
- 29d 单线 (UI 改动)
- 29e 串行最后 (集成 + 验证)

如果 Phase 28 顺利 (< 3.5h), 我倾向用 mavis-team 拆 29a + 29b 并行, 节省 ~1.5h。

### 29a — `src/main/last-opened.js` + tests (~1.5h)

**新增文件**:
- `src/main/last-opened.js` — 完整实现 (spec §4.2.1)
- `tests/main/last-opened.test.js` — 7+ cases:
  - mdls hit (mock exec 返 "kMDItemLastUsedDate = 2026-06-07 09:30:45 +0800")
  - mdls returns (null) → fallback
  - mdls throws → fallback
  - mdls timeout → fallback
  - atime hit (mock stat)
  - both fail → unknown
  - bundlePath null → unknown
  - 注入 execFileImpl (DI 模式, 跟 Phase 16 notification-policy 一样)

**依赖**: `child_process.execFile`, `stat` BSD command

**验证**: `npx vitest run tests/main/last-opened.test.js` 全过

### 29b — `src/main/tier.js` + tests (~1h)

**新增文件**:
- `src/main/tier.js` — 完整实现 (spec §4.2.2)
- `tests/main/tier.test.js` — 12+ cases:
  - getTier boundary: now-lastMs = 6天 → hot; 7天 → warm; 30天 → warm; 31天 → cold
  - getTier null → unknown
  - recommendedMuteSeconds 4 个 tier 各自返对
  - rankMuteOptions:
    - hot: 1d 置顶+recommended, 7d 30d 90d 升序, forever 最后
    - warm: 7d 置顶+recommended
    - cold: 30d 置顶+recommended
    - unknown: 7d 置顶+recommended (default)

**纯函数**, 无 IO, 100% unit-testable

### 29c — state-store 扩展 + ipc + preload (~1h)

**改动**:
- `src/main/state-store.js`:
  - 加 `loadLastOpened(statePath, now?)` 读
  - 加 `saveLastOpened(map, statePath)` atomic write
  - `saveAll` / `markNotified` 写盘时同时保留 last_opened
- `src/main/ipc.js`:
  - `get-last-opened` handler 返 cache
  - `refresh-last-opened` 异步 fire-and-forget
- `preload.js`: 暴露 `getLastOpened` / `refreshLastOpened`
- `src/main/index.js`: 主进程在 check-on-launch 完成后, async refresh last-opened, 完成后 `mainWindow.webContents.send('last-opened-updated', map)`

**测试**:
- 扩展 `tests/main/state-store.test.js`:
  - loadLastOpened 缺字段兜底
  - saveLastOpened atomic
  - saveAll 写盘时 mutes + last_opened 都保留
- 扩展 `tests/main/ipc.test.js` (or 新建 `tests/main/last-opened-ipc.test.js`)

### 29d — Renderer 改造 (~1.5h)

**改动**:
- `src/renderer/store.js`:
  - `lastOpenedApps` signal
  - `loadLastOpened()` async
  - `refreshLastOpened()` async
  - `getLocalTier(name, now?)` (前端 tier 计算, 同主进程 logic)
- `src/renderer/index.jsx`:
  - bootstrap: `await Promise.allSettled([loadMutes(), loadLastOpened()])`
  - 订阅 `api.onLastOpenedUpdated(...)` (主进程推)
- `src/renderer/components/AppInfo.jsx`:
  - 新 sub-line: `上次打开 · 2 天前` / `未使用` / `上次打开 · 估算 · 5 天前`
  - 复用 `relativeTime()` (Phase 12 已有)
- `src/renderer/components/MuteMenu.jsx`:
  - 订阅 `lastOpenedApps.value`
  - `getLocalTier(appName)` → `rankMuteOptions(tier)`
  - 渲染 5 个 button, 推荐项加 `.recommended` class + ✨推荐 标签
- `src/renderer/api.js`:
  - `getLastOpened: pick(overrides, 'getLastOpened')`
  - `refreshLastOpened: pick(overrides, 'refreshLastOpened')`
  - `onLastOpenedUpdated: pick(overrides, 'onLastOpenedUpdated')`
- `styles.css`:
  - `.mute-menu-item.recommended` 背景
  - `.mute-menu-recommended-tag` 标签
  - `.app-last-opened` 子标题样式

**测试**:
- 扩展 `tests/renderer/app-info.test.jsx`:
  - "上次打开 · N 天前"
  - "未使用"
  - "估算 · N 天前" 装饰
  - lastOpenedApps 没数据 → 不显示子标题
- 扩展 `tests/renderer/mute-menu.test.jsx`:
  - hot tier: 1 天置顶 + ✨推荐
  - warm tier: 7 天置顶
  - cold tier: 30 天置顶
  - unknown tier: 7 天置顶 (default)
  - forever 永远 last 不变

### 29e — 集成 + smoke test (~1h)

**步骤**:
1. `npx vitest run` 全过 (target ~520 passing)
2. 手动 smoke:
   - 启动 app, 跟 Phase 28 一样的 menu bar 验证
   - 右键一个 hot app (≤7天用过) → 1 天置顶 + ✨推荐
   - 右键一个 cold app (>30天) → 30 天置顶
   - 静音一个 app, badge 显示到期时间
   - 在系统里打开 Cursor 等, 等 1 分钟, refresh → tier 变 hot → MuteMenu 选项重排
3. 装 .dmg, 完整测一次

**风险**:
- Spotlight 没索引某些 dev app → atime fallback 准不准
- atime 系统会更新 (文件 IO 也会), 标 "估算" 提示
- 缓存 stale: TTL 5min, 配合 refresh on check 足够

---

## 测试目标

| 阶段 | 起始 | 目标 | 新增 case |
|---|---|---|---|
| 当前 (Phase 27 落地后) | 465 | — | — |
| Phase 28 落地 | 465 | 465 (不变, 业务逻辑无改动) | 0 (icon 渲染走 manual smoke) |
| Phase 29 落地 | 465 | ~520 | +55 (last-opened 12 + tier 15 + state-store 5 + AppInfo 4 + MuteMenu 12 + store 7) |

---

## 实施 checklist (28 → 29 总览)

- [ ] **Phase 28** (我执行, ~3h)
  - [ ] 28a: SVG 源 + render script
  - [ ] 28b: tray.js 改造 + canvas digit
  - [ ] 28c: package.json + window.js + README + RELEASE-NOTES
  - [ ] 28d: smoke test + 装 .dmg
- [ ] **Phase 28 commit** (1 commit 或拆 2 commit — 看 icon 跟 string 是否好分)
- [ ] **Phase 29** (我执行, 或 mavis-team 拆 29a+29b 并行, ~5-6h)
  - [ ] 29a: last-opened.js + tests
  - [ ] 29b: tier.js + tests
  - [ ] 29c: state-store + ipc + preload
  - [ ] 29d: renderer 改造
  - [ ] 29e: 集成 + smoke
- [ ] **Phase 29 commit** (建议拆 4 commit: 29a / 29b / 29c+29d / 29e — 每个独立可回滚)
- [ ] **RELEASE-NOTES 更新 v2.2.0 (Phase 28+29) 章节**
- [ ] **.dmg 重新发布**

---

## 风险回顾 (spec §6 摘要)

- Icon 美感 → 28d smoke 必跑真机
- appId 保留 org 段避免升级冲突
- mdls 慢 1s → 后台 async, 不阻塞 UI
- Spotlight 未索引 → atime fallback 标 "估算"
- Tier 阈值 hardcode 7/30, 后期 v2.3 暴露 config
- ✨推荐太家长式 → 弱 highlight, 不强制
- MuteMenu 顺序变 → ✨推荐 + 选项不消失, 习惯冲突低
