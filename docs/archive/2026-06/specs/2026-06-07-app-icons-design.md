# 真实 App 图标 设计 Spec (Phase 25)

- **日期**: 2026-06-07
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (AppUpdateChecker v2.x)
- **目标特性**: 真实 app 图标（替换字母头像）

## 1. 背景

AppUpdateChecker 的 row 列表里每个 app 用字母头像（"C" / "M" / "K"），彩色 gradient 背景。虽然已经按 app 名首字母区分，但视觉识别度低。换成真实 app 图标后用户能扫一眼就认出。

## 2. 目标

- row mount 时异步加载真实 app 图标（来自 `/Applications/X.app`）
- 字母头像保留作为 fallback（加载失败 / app 不在 /Applications）
- 缓存：in-memory signal，session 内不重复加载
- macOS only（其他平台 .icns 解析不靠谱）

## 3. 非目标 (YAGNI)

- Linux / Windows 支持
- 持久化图标缓存到 disk（重启重读就够，~200ms）
- 圆形头像 / 阴影 / 边框等额外装饰
- 多个尺寸（只 32x32）
- 自定义头像上传
- 高 DPI 自适应（用 64x64 资源让 retina 看着清楚）
- Tray icon 用真实 app 图标（tray 是单 app 的，不是 per-app）

## 4. UX 行为

### 4.1 视觉变化
- 之前：`<div class="app-avatar">C</div>` 字母头像，30-32px 圆形 gradient
- 之后：
  - 加载中：字母头像（即时显示，< 16ms）
  - 加载完成：`<img src="data:image/png;base64,..." class="app-avatar-img" />`，32x32 圆角 6px
  - 加载失败：字母头像（永久 fallback，不再重试）

### 4.2 时序
1. row mount → 立即渲染字母头像
2. useEffect 触发 `loadAppIcon(bundle)`
3. ~200ms 后 main 进程读完 .icns → dataUrl 回来
4. setAppIcon(bundle, dataUrl) → signal 更新
5. AppAvatar 重新渲染，img 替换字母

### 4.3 缓存
- 同 bundle 并发只发 1 次 IPC（in-flight Promise 缓存）
- 成功 / 失败都缓存（失败缓存 null，避免重试风暴）
- 缓存范围：单次 session（重启清空，~200ms 成本可接受）

## 5. 架构

### 5.1 数据流

```
[AppRow mount]
  ↓ useEffect
loadAppIcon(bundle)
  ├─ appIcons signal 已有 dataUrl → noop (cache hit)
  ├─ in-flight Promise 已有 → 复用
  └─ 都没有
       ↓
api.getAppIcon(bundle)
  ↓ IPC
[main] get-app-icon handler
  ↓
getAppIcon(bundlePath)
  ├─ fs.existsSync → false → return null
  ├─ nativeImage.createFromPath(bundlePath) → isEmpty() → return null
  └─ resize(64, 64) + toDataURL → return dataUrl
  ↓
{ dataUrl } | { error }
  ↓
setAppIcon(bundle, dataUrl) → signal 更新
  ↓
AppAvatar 重新渲染
```

### 5.2 nativeImage 用法

```js
// src/main/app-icon.js
const { nativeImage } = require('electron');
const fs = require('fs');

async function getAppIcon(bundlePath) {
  try {
    if (!fs.existsSync(bundlePath)) return null;
    const img = nativeImage.createFromPath(bundlePath);
    if (img.isEmpty()) return null;
    const resized = img.resize({ width: 64, height: 64, quality: 'normal' });
    return resized.toDataURL();
  } catch (err) {
    return null;
  }
}
```

注意：`nativeImage.createFromPath` 对 `.app` bundle 会自动读 `Info.plist` 的 `CFBundleIconFile`，无需手动指定 .icns 路径。

### 5.3 状态管理

```js
// src/renderer/store.js
export const appIcons = signal(new Map()); // Map<bundle, dataUrl | null>

export function setAppIcon(bundle, dataUrl) {
  const next = new Map(appIcons.value);
  next.set(bundle, dataUrl); // null 也存 (失败标记)
  appIcons.value = next;
}
```

```js
// src/renderer/icons.js
const inFlight = new Map(); // bundle → Promise

export async function loadAppIcon(bundle) {
  if (!bundle) return;
  // cache hit
  if (appIcons.value.has(bundle)) return;
  // in-flight dedup
  if (inFlight.has(bundle)) return inFlight.get(bundle);

  const p = (async () => {
    try {
      const result = await window.api.getAppIcon(bundle);
      setAppIcon(bundle, result && result.dataUrl ? result.dataUrl : null);
    } catch {
      setAppIcon(bundle, null);
    } finally {
      inFlight.delete(bundle);
    }
  })();
  inFlight.set(bundle, p);
  return p;
}
```

### 5.4 IPC 3 处同步（per memory lesson）

1. `src/main/ipc.js` — `ipcMain.handle('get-app-icon', ...)` —— 实际**已存在**（Phase 22 前的旧代码），但 impl 是 `return null`。需要替换成 `getAppIcon(bundlePath)` 调用。
2. `preload.js` — `getAppIcon: (b) => ipcRenderer.invoke('get-app-icon', b)` —— 已存在 ✅
3. `src/renderer/api.js` — `createApi` 加 `getAppIcon: pick(overrides, 'getAppIcon')` —— 需要加

## 6. 文件改动

| 路径 | 操作 | 说明 |
|---|---|---|
| `src/main/app-icon.js` | **new** | `getAppIcon(bundlePath)` 纯函数 (async, nativeImage) |
| `src/main/ipc.js` | edit | 把现有 `get-app-icon` handler 的 null 替换成真 getAppIcon |
| `src/renderer/api.js` | edit | createApi 加 getAppIcon |
| `src/renderer/store.js` | edit | 加 `appIcons` signal + `setAppIcon` setter |
| `src/renderer/icons.js` | **new** | `loadAppIcon(bundle)` + in-flight dedup |
| `src/renderer/components/AppAvatar.jsx` | edit | 有 dataUrl 渲染 img，否则字母 |
| `src/renderer/components/AppRow.jsx` | edit | useEffect: mount 时 `loadAppIcon(bundle)` |
| `styles.css` | edit | `.app-avatar-img` 样式 (32x32, border-radius, object-fit) |
| `tests/main/app-icon.test.js` | **new** | 4 case (mock nativeImage, 成功 / 失败 / 不存在) |
| `tests/renderer/app-avatar.test.jsx` | **new** | 4 case (无 dataUrl 字母 / 有 dataUrl img / null fallback) |
| `tests/renderer/icons.test.js` | **new** | 3 case (loadAppIcon 调 API / dedup / 错误不爆) |

## 7. CSS

```css
.app-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.app-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* 字母头像 (现有 fallback) 保留 */
```

## 8. 测试策略

### 8.1 Unit (`tests/main/app-icon.test.js`, 4 case)
- mock `nativeImage.createFromPath` 返带 `isEmpty: () => false, resize: () => self, toDataURL: () => 'data:...'`
- `getAppIcon('/Applications/Cursor.app')` → 'data:...'
- `nativeImage.createFromPath` 返 `isEmpty: () => true` → null
- `fs.existsSync` 返 false → null
- 抛错 → null

### 8.2 Component (`tests/renderer/app-avatar.test.jsx`, 4 case)
- appIcons signal 没该 bundle → 渲染字母 (用 .app-avatar class)
- appIcons signal 有 dataUrl → 渲染 `<img class="app-avatar-img" src="...">`
- appIcons signal 显式 null (已失败) → 渲染字母
- 多次 mount 同一 bundle → 第二次不重试 (cache hit)

### 8.3 Module (`tests/renderer/icons.test.js`, 3 case)
- `loadAppIcon('X')` → 调 `api.getAppIcon('X')` 一次
- 同一 bundle 并发 load 2 次 → IPC 只发 1 次
- `api.getAppIcon` 抛错 → setAppIcon(bundle, null) → 不爆

## 9. 风险

| 风险 | 缓解 |
|---|---|
| .icns 5-10MB 读内存 | resize 64x64 后 PNG ~5KB |
| nativeImage 慢（同步读文件 100-200ms）| async；视觉是字母 → 真实图标 < 200ms 切换 |
| 11 个 app 11 次 IPC | dedup + 并发；总耗时 < 500ms |
| 失败重试死循环 | 失败写 null，不再调 |
| Bundle 路径不对 | fs.existsSync guard |
| IPC handler 重复注册 (memory 提到的 3 处必须同步) | preload + api.js 已检查；ipc.js 改 body |

## 10. 实施顺序

1. `app-icon.js` + 测试 (1h)
2. ipc.js + api.js + preload 检查 (20min)
3. store.js + icons.js (30min)
4. AppAvatar + AppRow + CSS (30min)
5. App-avatar + icons 测试 (1.5h)
6. 全测 + build + 手动 (30min)

**总计 3-3.5h**

## 11. 后续 (out of scope)

- Linux / Windows .ico 支持
- 持久化图标缓存到 disk (sandbox)
- 不同尺寸 (16 / 32 / 64 / 128)
- 圆形 mask / 边框装饰
- Tray icon 显示具体 app（当前是 AppUpdateChecker 自己的）
- 动画 (icon fade-in)

## 12. Implementation Status (2026-06-07 02:37)

✅ **v5 已 ship** (5 个迭代都失败, 第 5 个 work):

| v | 方案 | 失败原因 |
|---|---|---|
| v1 | `nativeImage.createFromPath(bundlePath)` | 返 app 自己的 icon (跟路径无关) — 错 |
| v2 | `app.getFileIcon('large').resize().toDataURL()` | SIGTRAP (NativeImage GC race on arm64 + Electron 35) |
| v3 | `app.getFileIcon('normal').toDataURL()` | `getFileIcon` 是 **async**! 不 await → 11 app 全 1634 字节 generic placeholder |
| v4 | `nativeImage.createFromPath(.icns)` | Electron **不支持 .icns** (只 PNG/JPG/BMP/TIFF), 11 个都 image empty |
| **v5** | **`sips` CLI → Buffer → base64, 绕过 nativeImage** | **work** |

### v5 实现细节

`src/main/app-icon.js`:
```js
// 1. findIcnsPath: Info.plist CFBundleIconFile → .icns 全路径. 失败 → Resources glob.
// 2. spawnSync('sips', ['-s','format','png','-z','256','256', icnsPath, '--out', out])
// 3. fs.readFileSync(out) → Buffer
// 4. Buffer.toString('base64') → data:image/png;base64,...
```

DI 注入 (测试用): `fs`, `app.getPath('temp')`, `spawn`, `sipsPath`. 永远不调 `nativeImage`.

### 验证

- 35/35 test files, 404 passed + 4 skipped
- `/Applications/AppUpdateChecker.app` 已装 v5 build (02:37)
- 4 进程 alive (main / renderer / GPU / helper)
- 11/11 app 真实 icon 显示 (Cursor 黑锥 / Kimi 黑 K / ima.copilot 绿熊 / WorkBuddy 绿盾 / QClaw 橙龙虾 / Marvis 黑鸟 / QoderWork 绿气泡 / CodexBar 蓝 </> ...)
- DataUrl 长度 12-62KB, 11 个各不相同 → 证明 sips 拿到的是真 icon, 不是 generic placeholder
