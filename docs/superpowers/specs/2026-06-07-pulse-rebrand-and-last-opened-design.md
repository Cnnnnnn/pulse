# Pulse 品牌重塑 + 最近打开分级静音 (Phase 28/29)

- **日期**: 2026-06-07
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (AppUpdateChecker v2.x → Pulse v2.2)
- **目标特性**:
  - **Phase 28 (Identity)**: 应用名 AppUpdateChecker → Pulse，重画 menu bar icon，更新所有用户可见字符串
  - **Phase 29 (Feature)**: 监听每个 app 的"最近打开时间"，按热度（hot/warm/cold）智能排序 MuteMenu 静音选项

## 0. 决策日志 (brainstorming-2 产出)

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| 命名语言 | **中英双行 · 英文为主** | 中文古典调性 (知更/守望/一叶/听风) → 走偏，离"工具干啥的"太远 |
| 名字 | **Pulse** | Upstream (Linux 黑话); Version (干瘪); Patcher (太窄) |
| Icon 风格 | **ECG 单线 + 橙红 #e85d3a, monochrome template** | 中文文学隐喻 (晨星/哨塔窗/单叶/声波) → 不像 menu bar icon |
| Icon 实现 | **手画 SVG → 1x/2x PNG 静态资源 ship** | 用 pixel buffer 动态画 (现在 tray.js 那种) → 不够精致 |
| Last-opened 数据源 | **mdls kMDItemLastUsedDate 优先 + ls -lu atime fallback** | ls-lu only (不准); 手工记录 (不能感知真实使用) |
| Tier 分级 | **hot (≤7天) / warm (7-30天) / cold (>30天) / unknown** | 2-tier (太粗); 4-tier (过度); 不分级 (浪费数据) |
| 静音 UX | **5 选项不变 + tier-aware 排序 + ✨推荐 标签** | 改选项数 (破坏 Phase 27 习惯); 改默认 focus (太小改动) |
| 阶段拆法 | **2 phases: 28 identity / 29 feature** | 一次大改 (高风险); 3 phases (过度) |

## 1. 目标

### 1.1 必须达成

- [P28] App 名 `productName` 从 `AppUpdateChecker` 改为 `Pulse`
- [P28] Menu bar icon 是 4 个 PNG 资源文件 (1x/2x template + 1x/2x badge)，ECG 形态、橙红色调
- [P28] Tray tooltip / window title / README 标题 / release notes 章节全部跟 `Pulse` 对齐
- [P29] `state.json` 新字段 `last_opened` 持久化每个 app 的最近打开时间
- [P29] 主进程能查 11 个 app 的 `kMDItemLastUsedDate` (mdls)，未索引的 fallback 到 `ls -lu`
- [P29] Tier 模块根据 last-opened 算出 hot/warm/cold，**MuteMenu 选项根据 tier 重排**并在合理选项上加 ✨推荐 标签
- [P29] AppInfo 显示"上次打开 · 2 天前"子标题；冷 (unknown) 时显示"未使用"

### 1.2 非目标 (YAGNI)

- 不支持 Linux / Windows（仍 macOS only）
- 不改 detector / worker / 通知 / bulk upgrade 业务逻辑
- 不重写 UI 框架（仍 Preact + signals + custom CSS）
- 不持久化 icon cache（重启重新 mdls 一下 200ms 内查完 12 app）
- 不做 last-opened 的 cloud sync / 跨设备统计
- 不做 age-based auto-mute（用户必须 right-click 主动设）
- 不暴露"我标记为活跃"按钮（用 OS 真实使用数据，不二选一）
- 不重画 / 优化 AppRow 内 app 头像 (Phase 25 已 ship)
- 不重做发布 / 打包流程 (electron-builder 配置只改 productName)

## 2. 阶段拆分

| Phase | 范围 | 涉及文件 | 估计 |
|---|---|---|---|
| **28** | Identity (rename + icon) | 4 PNG asset + package.json + tray.js + window.js + README + RELEASE-NOTES | 1-2h |
| **29** | Last-opened + tiered mute | 新 last-opened.js + 新 tier.js + state-store 扩展 + store.js + AppInfo + MuteMenu + ipc + preload + 6 个 test | 4-5h |

Phase 28 必须先 ship，因为 Phase 29 的 UI 字符串要嵌 Pulse 字样。两个 phase 独立可回滚。

---

## 3. Phase 28 — Identity (Rename + Icon)

### 3.1 Naming

#### 3.1.1 改动清单

| 位置 | 旧值 | 新值 |
|---|---|---|
| `package.json` `productName` | `AppUpdateChecker` | `Pulse` |
| `package.json` `name` | `app-update-checker` | `pulse` (npm 内部 id) |
| `package.json` `description` | `macOS 菜单栏应用更新检查工具 — Electron 版` | `macOS 菜单栏更新监测器 — Pulse` |
| `package.json` `build.mac.category` | (无) | `public.app-category.utilities` (不变) |
| `src/main/tray.js` tooltip | `AppUpdateChecker` / `AppUpdateChecker — N 个更新` | `Pulse` / `Pulse — N 个更新` |
| `src/main/window.js` window title | `AppUpdateChecker` | `Pulse` |
| `README.md` 标题 + 第一段 | (旧) | 改 Pulse |
| `RELEASE-NOTES.md` | (无章节) | 加 v2.2.0 (Phase 28) 章节 |
| `index.html` `<title>` | `AppUpdateChecker` | `Pulse` |
| `config.json` `apps[].name` | 用户自己的 app 名 | **不变** (这是用户的 app 配置 key) |
| `state.json` mutes / last_opened 字段 | (无) | 不变 (v=1 schema 兼容) |

**关键约束**: `config.json.apps[].name` 是 user 给 app 起的人读名（Cursor/Kimi/...），不是 product name，**不能**因为产品改名而改。这个值是 detector 索引 + UI 渲染的 key。

#### 3.1.2 Electron-builder

`package.json` `build` 字段:
```json
{
  "productName": "Pulse",
  "appId": "com.appupdatechecker.pulse",
  "mac": {
    "category": "public.app-category.utilities",
    "target": ["dmg"]
  }
}
```

`appId` 改 `com.appupdatechecker.pulse`（保留 v2.0.0 的 org 段以避免与已装版本冲突——升级安装不被识别为同一 app，需要 uninstall 旧版）。**不**强行改成全新 `com.something.pulse`，避免用户已装版本冲突。

### 3.2 Icon

#### 3.2.1 资源文件 (4 个 PNG)

存到 `assets/` 目录 (新)：

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `assets/iconTemplate.png` | 16x16 | Tray base, 1x display |
| `assets/iconTemplate@2x.png` | 32x32 | Tray base, 2x display (Retina) |
| `assets/iconBadge.png` | 32x16 | Tray badge, 1x (有更新时) |
| `assets/iconBadge@2x.png` | 64x32 | Tray badge, 2x (Retina) |

#### 3.2.2 设计规范

- **iconTemplate**: ECG 单线 path, monochrome 黑白 (Apple template image 标准)。line cap round, line width 2.2 (在 32x32 上视觉 ≈ 1.1px retina 清晰)
- **iconBadge**: 同 ECG 单线在左 16x16 区域，**右 16x16 区域是红圆 + 白数字**，数字 font weight bold sans-serif
- **颜色**:
  - Template 路径: `#1a1a1a` (light mode) / `#f0f0f0` (dark mode) — Apple 模板自适应
  - Badge 圆: `#e85d3a` (vivid orange-red, 不随深浅模式变)
  - Badge 数字: `#ffffff`
- **SVG source** (in `assets/iconTemplate.svg` 源) 用于设计可读 + 改色:

```svg
<!-- iconTemplate.svg (设计源) -->
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="M 3 16 L 9 16 L 11 12 L 13 22 L 15 9 L 17 23 L 19 16 L 29 16"
        fill="none" stroke="currentColor" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

**生成方式**:
- 1) 维护 SVG source 1 个
- 2) `scripts/render-icons.js` 用 `sharp` 或 `@resvg/resvg-js` (Node lib) 渲染到 1x/2x PNG
- 3) 静态 PNG commit 进 git, runtime 不用重画
- 4) Badge 变体: 程序化绘制 = base ECG + 红圆 + 数字 (用 `canvas` 库 OR 在 PNG 上 `sharp` 合成)

**注**: 选 `@resvg/resvg-js` 而非 `sharp`: 纯 Rust + 无原生依赖, ~5MB; sharp 更快但绑定 native, Electron rebuild 时麻烦。

#### 3.2.3 Tray 集成 (tray.js 改动)

```js
// 之前: 16x16 pixel buffer 动态生成
function createTrayIcon() { ... Buffer.alloc(W*H*4) ... }

// 之后: 从 asset 加载
const path = require('path');
const ASSETS = path.join(__dirname, '..', '..', 'assets');

function createTrayIcon() {
  // 选 retina 或非 retina based on display scale
  const png = nativeImage.createFromPath(
    path.join(ASSETS, 'iconTemplate@2x.png')
  );
  png.setTemplateImage(true);  // 关键: Apple 自动 dark/light 适配
  return png;
}
```

`createBadgeIcon(updateCount)` 改为:
- 加载 `iconBadge@2x.png` 作为 base
- **如果 updateCount > 9**: 用 32x16 双位数字 (红圆放大 1.5x)
- **如果 updateCount >= 100**: 改成 32x16 "99+" 截断 (业界惯例)
- 否则 1-2 位数字居中

数字绘制: 用 `@napi-rs/canvas` (无原生 binding 问题) 在 PNG buffer 上画。或者更轻: 维护 12 个预渲染 `iconBadge-1.png` ~ `iconBadge-9.png` + `iconBadge-99.png`, 程序选。

**决定**: 维护 12 个预渲染 badge PNG。理由: 数字 0-9 + 99+ 是有限集合, 预渲染是 O(1) lookup 0ms, 不引 canvas 依赖。`scripts/render-icons.js` 一次性生成。

### 3.3 验证 (Phase 28)

| 项 | 验证方法 |
|---|---|
| 4 个 PNG 存在 | `ls assets/icon*.png \| wc -l` = 4 |
| 4 个 PNG 尺寸正确 | `sips -g pixelWidth -g pixelHeight assets/iconTemplate.png` (读 header) |
| 4 个 PNG byte-equal 在 CI | `shasum -a 256` 跟 committed `.icon-hash.txt` 比对 |
| 菜单栏 template 模式 | Electron 文档要求 setTemplateImage(true) 调用存在 |
| 字符串替换 | `grep -rn "AppUpdateChecker" src/ --include="*.js" --include="*.jsx"` 应只剩注释 / 旧 release notes 历史 |
| `productName` | `cat package.json \| jq .productName` = "Pulse" |
| npm test 全过 | `npx vitest run` (现有 465 个不应受 Phase 28 影响) |

### 3.4 风险

- **icon 美感风险**: 用户对 "OK 啊" 的定义主观。**缓解**: 1x/2x 都画 3 轮候选, 用 brainstorming 阶段已确认的 ECG 形态; 真机装 `.dmg` 看效果 (Phase 28 必跑 smoke test)
- **appId 冲突**: 已装 v2.0.0 用户升级 v2.2 会变成 "新 app" 而不是 "覆盖". **缓解**: appId 保留 `com.appupdatechecker.*` 段; README + release notes 提示用户先卸载旧版
- **build size 不变**: 4 个 PNG 加起来 ~10KB, 跟当前 pixel buffer 同量级, 不影响 .dmg 大小

---

## 4. Phase 29 — Last-opened + Tiered Mute

### 4.1 数据模型

#### 4.1.1 state.json 新字段

```jsonc
{
  "v": 1,                  // schema 版本, 不变
  "ts": 1750000000000,     // 跟 mutes 一致, 任意 write 都会更新
  "apps": { ... },         // 已有
  "mutes": { ... },        // 已有 (Phase 27)
  "last_opened": {         // 新字段 (Phase 29)
    "Cursor":    { "ms": 1750000000000, "source": "spotlight" },
    "Kimi":      { "ms": 1740000000000, "source": "atime" },
    "WorkBuddy": { "ms": null,          "source": "unknown" }
  }
}
```

**字段语义**:
- `ms`: epoch ms of last time user actually launched the app. `null` = 不知道
- `source`: `spotlight` | `atime` | `unknown`
  - `spotlight`: `mdls` 拿到 `kMDItemLastUsedDate` — 高置信
  - `atime`: Spotlight 没索引, fallback 到 bundle atime (`ls -lu`) — 估算, 标 ❓
  - `unknown`: 都没拿到 (罕见: app 被 sandbox 隔离 / Spotlight disabled)

**schema 兼容**: 老 state.json 无 `last_opened` 字段 → load() 仍 OK, getLastOpened 兜底 `{}` (跟 Phase 27 mutes 一致 pattern)。

#### 4.1.2 In-memory cache

主进程 `lastOpenedCache: Map<name, {ms, source, fetchedAt}>`
- TTL: 5 分钟
- check-on-launch / 手动 check 完成后, **后台 async** 刷一次
- IPC `get-last-opened` 读 cache (不阻塞)
- IPC `refresh-last-opened` 强制刷 (fire-and-forget)

Renderer signal:
- `lastOpenedApps: signal(new Map())` (同 mutedApps 模式)
- bootstrap: `loadLastOpened()` 从主进程拉
- 之后 `refreshLastOpened()` 异步触发

### 4.2 主进程模块

#### 4.2.1 `src/main/last-opened.js`

```js
/**
 * Phase 29: 从 macOS 查 app 的"最近打开时间"
 * 数据源: mdls (Spotlight) 优先, ls -lu atime fallback.
 */
const { execFile } = require('child_process');

const QUERY_TIMEOUT_MS = 2000;  // 单个 app 最多 2s
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * @param {string} bundlePath  e.g. "/Applications/Cursor.app"
 * @param {object} [opts]      注入: execFileImpl (测试)
 * @returns {Promise<{ms: number|null, source: 'spotlight'|'atime'|'unknown'}>}
 */
async function getLastOpened(bundlePath, opts = {}) {
  const exec = opts.execFileImpl || execFile;
  if (!bundlePath) return { ms: null, source: 'unknown' };

  // 1) Spotlight
  try {
    const out = await runMdls(exec, bundlePath);
    if (out && out.ms) return { ms: out.ms, source: 'spotlight' };
  } catch { /* mdls 失败/超时, 不 throw, 走 fallback */ }

  // 2) atime fallback
  try {
    const out = await runLsLu(exec, bundlePath);
    if (out && out.ms) return { ms: out.ms, source: 'atime' };
  } catch { /* noop */ }

  return { ms: null, source: 'unknown' };
}

function runMdls(exec, bundlePath) {
  return new Promise((resolve, reject) => {
    const child = exec('mdls', ['-name', 'kMDItemLastUsedDate', bundlePath],
      { timeout: QUERY_TIMEOUT_MS },
      (err, stdout) => {
        if (err) return reject(err);
        // stdout: "kMDItemLastUsedDate = 2026-06-07 09:30:45 +0800"
        const m = stdout.match(/=\s*(.+)/);
        if (!m || m[1].trim() === '(null)') return resolve(null);
        const ms = Date.parse(m[1].trim());
        if (Number.isNaN(ms)) return resolve(null);
        resolve({ ms });
      });
    child.on('error', reject);
  });
}

function runLsLu(exec, bundlePath) {
  // 用 BSD stat 取 atime epoch seconds (locale 无关, 稳定).
  // `stat -f '%a' /path` → "1750000000\n"
  return new Promise((resolve, reject) => {
    const child = exec('stat', ['-f', '%a', bundlePath],
      { timeout: QUERY_TIMEOUT_MS },
      (err, stdout) => {
        if (err) return reject(err);
        const sec = parseInt(stdout.trim(), 10);
        if (Number.isNaN(sec) || sec <= 0) return resolve(null);
        resolve({ ms: sec * 1000 });
      });
    child.on('error', reject);
  });
}

module.exports = { getLastOpened, QUERY_TIMEOUT_MS, CACHE_TTL_MS };
```

**注**: `ls -lu` 输出格式多变 (locale 影响月份, "今天" vs "历史" 字段不同), 实现上用 `stat -f %a` (BSD stat) 更稳, 返 epoch sec: `stat -f '%a' /Applications/Cursor.app` → 1234567890。

#### 4.2.2 `src/main/tier.js`

```js
/**
 * Phase 29: last-opened → tier + 静音推荐
 */

const HOT_MAX_DAYS = 7;
const WARM_MAX_DAYS = 30;

const TIER = { HOT: 'hot', WARM: 'warm', COLD: 'cold', UNKNOWN: 'unknown' };

/** @param {number|null} lastMs  @param {number} [now] (注入测试) */
function getTier(lastMs, now) {
  const t = (typeof now === 'number') ? now : Date.now();
  if (lastMs == null) return TIER.UNKNOWN;
  const ageDays = (t - lastMs) / 86400_000;
  if (ageDays <= HOT_MAX_DAYS) return TIER.HOT;
  if (ageDays <= WARM_MAX_DAYS) return TIER.WARM;
  return TIER.COLD;
}

/** 每个 tier 的"推荐静音时长" (秒) */
const RECOMMENDED = {
  hot:     1 * 86400,         // 1 天 — 你天天用, 别错过
  warm:    7 * 86400,         // 7 天 — 中等
  cold:    30 * 86400,        // 30 天 — 你都不开
  unknown: 7 * 86400,         // 默认 7 天 (跟 mute 7 天对等)
};

/** 5 个基础选项 (跟 Phase 27 一致) */
const BASE_OPTIONS = [
  { seconds: 1 * 86400,  label: '1 天' },
  { seconds: 7 * 86400,  label: '7 天' },
  { seconds: 30 * 86400, label: '30 天' },
  { seconds: 90 * 86400, label: '90 天' },
  { seconds: 0,          label: '永远' },
];

/**
 * 重排: 推荐项置顶, 其它按"短→长"升序, 永远放最后
 * @returns {Array<{seconds:number, label:string, recommended:boolean}>}
 */
function rankMuteOptions(tier) {
  const rec = RECOMMENDED[tier] ?? RECOMMENDED.unknown;
  const items = BASE_OPTIONS.map((o) => ({ ...o, recommended: o.seconds === rec }));
  return items.sort((a, b) => {
    if (a.seconds === 0) return 1;
    if (b.seconds === 0) return -1;
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return a.seconds - b.seconds;
  });
}

module.exports = { TIER, HOT_MAX_DAYS, WARM_MAX_DAYS, getTier, RECOMMENDED, BASE_OPTIONS, rankMuteOptions };
```

#### 4.2.3 `src/main/ipc.js` 扩展

新 handler:
- `get-last-opened` → 返当前 cache `{ name: {ms, source} }`
- `refresh-last-opened` → 强制刷全部 11 app, **fire-and-forget** (Promise resolve 后台跑), 完成后推 `last-opened-updated` 事件给 renderer

#### 4.2.4 `src/main/state-store.js` 扩展

新增函数 (不破坏 Phase 27):
- `loadLastOpened(statePath, now?)` → 读 + 过滤 (cleanup 同样 lazy)
- `saveLastOpened(map, statePath)` → atomic write
- `lastOpenedMap` 跟 `mutes` 平行, 写盘时独立 (saveAll 写 mutes + last_opened 一起, 但 lastOpenedMap 的 entry 没有 expiry 概念, 永不清)

### 4.3 Renderer 改动

#### 4.3.1 `src/renderer/store.js`

新增:
```js
export const lastOpenedApps = signal(new Map());  // name → {ms, source}

export async function loadLastOpened() {
  const r = await api.getLastOpened();
  const map = (r && r.lastOpened) || {};
  const next = new Map(Object.entries(map));
  lastOpenedApps.value = next;
  return map;
}

export async function refreshLastOpened() {
  // fire-and-forget; 主进程完成后会推 last-opened-updated 事件
  await api.refreshLastOpened();
}

/** 跟主进程 tier.js 一致 (前端不调 IPC, 直接本地算) */
export function getLocalTier(name, now) {
  const v = lastOpenedApps.value.get(name);
  if (!v || v.ms == null) return TIER.UNKNOWN;
  // ... 跟主进程一样的实现
}
```

**注**: tier 逻辑前端也跑一份 (不调 IPC), 减少主进程来回。Phase 27 mute filter 同 pattern (`isMuted` 在 store 里有)。

#### 4.3.2 `src/renderer/index.jsx` bootstrap

```js
// 跟 loadMutes 并行
await Promise.allSettled([loadMutes(), loadLastOpened()]);
```

#### 4.3.3 `src/renderer/components/AppInfo.jsx`

新 sub-line:
```jsx
const lastOpened = lastOpenedApps.value.get(result.name);
const lastOpenedLabel = lastOpenedLabel(lastOpened?.ms, lastOpened?.source);
// ...
<div class="app-last-opened" title={...}>
  {lastOpenedLabel}  {/* "上次打开 · 2 天前" / "未使用" / "上次打开 · 估算 · 5 天前" */}
</div>
```

`lastOpenedLabel`:
- `{ms: null, source: any}` → `"未使用"`
- `{ms: X, source: 'spotlight'}` → `"上次打开 · " + relativeTime(X)` (e.g. "2 天前")
- `{ms: X, source: 'atime'}` → `"上次打开 · 估算 · " + relativeTime(X)` (e.g. "5 天前")

`relativeTime(ms, now?)` 已有 (Phase 12, in AppInfo.jsx), 复用。

#### 4.3.4 `src/renderer/components/MuteMenu.jsx`

```jsx
import { getLocalTier, rankMuteOptions, lastOpenedApps } from '../store.js';

export function MuteMenu({ ... }) {
  // 订阅 lastOpenedApps.value 触发重渲染
  const tier = getLocalTier(appName);
  const ranked = rankMuteOptions(tier);  // 5 个 {seconds, label, recommended}

  return (
    <div class="mute-menu">
      ...
      {ranked.map((opt) => (
        <button class={`mute-menu-item${opt.recommended ? ' recommended' : ''}`} ...>
          <span class="mute-menu-item-icon">🔇</span>
          静音 {opt.label}
          {opt.recommended && <span class="mute-menu-recommended-tag">✨ 推荐</span>}
        </button>
      ))}
    </div>
  );
}
```

CSS 新增:
```css
.mute-menu-item.recommended {
  background: rgba(232, 93, 58, 0.08);  /* 橙红 tint */
}
.mute-menu-recommended-tag {
  margin-left: auto;
  font-size: 10px;
  color: #e85d3a;
  letter-spacing: 0.3px;
}
```

#### 4.3.5 MuteMenu tier badge (可选, nice-to-have)

MuteMenu header 加一行 "热 / 温 / 冷" 提示, 让用户知道排序依据:
```
🔔  Cursor  上次打开: 2 天前  (热)
─────────
🔇 静音 1 天  ✨推荐
🔇 静音 7 天
🔇 静音 30 天
...
```

如果 v1 不做也行 (MuteMenu header 已经显示到期时间).

---

## 5. 跨阶段 (Cross-cutting)

### 5.1 state.json 兼容性

- v=1 不变
- 老 state.json: 无 `mutes` (Phase 27 已处理) + 无 `last_opened` (Phase 29 同样) → load() 不报错, 字段为 undefined
- 新 state.json: `{v, ts, apps, mutes, last_opened}` — 写盘时 5 字段全 in

### 5.2 测试矩阵

| 模块 | 测试文件 | 新增 case |
|---|---|---|
| `last-opened.js` | `tests/main/last-opened.test.js` | mdls hit/miss/null/timeout; ls -lu fallback; both fail → unknown; bundlePath 校验 |
| `tier.js` | `tests/main/tier.test.js` | tier boundary (7d/30d); recommended mapping; rankMuteOptions 重排顺序; 永远 last |
| `state-store.js` | 扩展 `tests/main/state-store.test.js` | loadLastOpened 缺字段兜底; saveLastOpened atomic; mutes + last_opened 独立写 |
| `ipc.js` | 扩展 | get-last-opened 返回 cache; refresh-last-opened 异步 fire |
| `AppInfo.jsx` | 扩展 `tests/renderer/app-info.test.jsx` | "上次打开 · N 天前" / "未使用" / "估算" 三态 |
| `MuteMenu.jsx` | 扩展 `tests/renderer/mute-menu.test.jsx` | tier=hot → 1 天置顶 + ✨; tier=warm → 7 天; tier=cold → 30 天; forever 永远在 last |
| `store.js` | 扩展 | lastOpenedApps signal; loadLastOpened 兜底 |
| `index.jsx` | 扩展 | bootstrap 并行 loadMutes + loadLastOpened |

**目标**: Phase 29 落地后 ~520 passing (从 465 起步)。

### 5.3 CI smoke (Phase 28)

- `scripts/render-icons.js` 跑通 + 生成 4 PNG
- 4 PNG byte-hash 跟 `.icon-hash.txt` 一致
- `npx vitest run` 全过
- `npm run build` 出 `.dmg`

---

## 6. 风险 + 缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| Icon 美感不达用户预期 | 品牌重塑失败, 用户觉得"还是老的好" | Phase 28 必跑 `.dmg` smoke; icon 改 1 个 asset 文件就重 ship, 风险低 |
| `appId` 改了导致升级 = 全新 app | 老用户被装了 2 个 app | appId 保留 `com.appupdatechecker.*` 段; release notes 提示先 uninstall |
| `mdls` 慢 (12 app × 100ms) | bootstrap 卡 1.2s | check-on-launch 已经 ~1s, 加 1s 可接受; 改成后台 async, UI 不阻塞 |
| Spotlight 索引 disabled | 全部 fallback 到 atime | 标 "估算" UI 上明示; atime 不可信但够用 |
| 用户开了 app 但 atime 没更新 (sandbox) | 数据失真 | UI 标 "估算" + tooltip 解释 |
| Tier 阈值 (7/30 天) 主观 | 跟用户预期不符 | 阈值 hardcode 进常量, 后期 v2.3 暴露到 config |
| `recommend` 标签太"家长式" | 用户觉得被指挥 | 默认显示, 不强 highlight; 推荐 ≠ 必须 |
| MuteMenu 选项重排让老用户找不到"30 天" | 习惯冲突 | ✨推荐视觉提示; 选项没消失, 只是顺序变 |

---

## 7. Out of scope (v2.2)

- Tier 阈值可配置 (config)
- Age-based auto-mute (老了自动静音)
- Last-opened 数据 export / 图表
- 多用户 / 跨设备 last-opened 同步
- "我标记为活跃" 按钮 (有 Spotlight 数据就够, 不需要 second source)
- Linux / Windows 平台

---

## 8. 实施顺序 (planning 阶段细化)

1. **Phase 28a** — 准备 SVG 源 + render script (1h)
2. **Phase 28b** — 4 个 PNG 资源 + tray.js 改造 (1h)
3. **Phase 28c** — package.json + window.js + README + RELEASE-NOTES (30min)
4. **Phase 28d** — smoke test (装 .dmg 看 menu bar) (30min)
5. **Phase 29a** — last-opened.js + tests (1.5h)
6. **Phase 29b** — tier.js + tests (1h)
7. **Phase 29c** — state-store 扩展 + ipc + preload (1h)
8. **Phase 29d** — renderer store + AppInfo + MuteMenu 改造 + tests (1.5h)
9. **Phase 29e** — 集成 + smoke test (1h)

**总计 9-10h**, 可拆 2 个 plan 串行 (28 + 29)。

---

## 9. 用户 Review 检查点

- [ ] 阶段拆法 (28 + 29) 同意?
- [ ] Icon 形态 (ECG 单线) 同意?
- [ ] 颜色 (橙红 #e85d3a) 同意?
- [ ] Tier 阈值 (7/30 天) 同意?
- [ ] 推荐标签文案 (✨推荐) 同意?
- [ ] 数据源策略 (mdls + atime fallback) 同意?
- [ ] appId 保留 `com.appupdatechecker.*` 段同意?
- [ ] state.json 新字段 `last_opened` schema 同意?

确认后切到 `writing-plans` 出实施计划。
