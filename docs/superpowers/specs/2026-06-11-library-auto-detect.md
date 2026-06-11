# v2.7.2: Library Auto-Detect Detector — Design Spec

> **Status**: 设计 → 实施
> **Date**: 2026-06-11
> **Scope**: LibrarySection "监控" 按钮 → 不再弹 3 步 wizard, 改成 auto-detect
> **设计目标**: 用户零负担, 自动探查 4 层优先级链, 命中 1 键确认

---

## 1. 背景 (为啥做)

v2.7.0/v2.7.1/v2.7.1.1/v2.7.1.2 4 轮迭代, wizard 形态从 form → 3 步 stepper → master-detail, 越改越复杂, 根因都指向同一件事:

> **让用户选 detector 是错的方向** — 用户不知道 11 个 detector 啥区别, 也不知道自己 app 用哪个.

Pulse 工具本来就**自动**检测 11 个 app 更新, 手动加新 app **也该自动**.

## 2. 优先级链 (4 层, 0 优先 + 3 试探 + 1 fallback)

| 优先级 | 探查方式 | 配置 | 典型命中时间 | 失败兜底 |
|---|---|---|---|---|
| **1️⃣** | `bundleId` 静态表反查 (11 个已知 app) | 0 | <10ms | 进 2️⃣ |
| **2️⃣** | 启发式试探 (appName / bundleId 字符串) | 0 | ~3s/项 | 进 3️⃣ |
| **3️⃣** | `brew info --cask <guess>` | 0 | ~2s | 进 4️⃣ |
| **4️⃣** | 用户手选 (3 步 wizard fallback) | 需填 | 用户驱动 | 永远成功 |

每层返回: `{ ok: true, type, fields: {...}, probe: '<耗时>' }` 或 `{ ok: false, reason, probe: '<失败原因>' }`.

并行: **2️⃣ 跟 3️⃣ 跑 `Promise.allSettled`**, 8s 总 timeout, 谁先返回有效 `latest_version` 谁赢.

## 3. 优先级 1: bundleId 静态表

### 已知 app 清单 (11 个, 跟 v2.7.0 config.json 同)

```js
// src/main/library/known-apps.js
const KNOWN_APPS = {
  'com.cursor.Cursor':        { type: 'cursor_redirect',    fields: {} },
  'com.cursor.cursor':        { type: 'cursor_redirect',    fields: {} },
  'com.minimax.MiniMaxCode':  { type: 'electron_yml',       fields: { url: 'https://filecdn.minimax.chat/public/minimax-agent-prod/release/latest-mac.yml' } },
  'com.codebuddy.workbuddy':  { type: 'api_json',           fields: { url: 'https://www.codebuddy.cn/v2/update?platform=workbuddy-darwin-{arch}' } },
  'com.qclaw.app':            { type: 'qclaw_api',          fields: { url: 'https://jprx.m.qq.com/data/4066/forward' } },
  'com.electronlark.lark':    { type: 'redirect_filename',  fields: { url: 'https://marvis.qq.com/download/dmg' } },
  'com.qoder.qoderwork':     { type: 'electron_yml',       fields: { url: '...' } },  // 待 v2.8.0 fixture 填真实 url
  // 5 个 v2.7.0 已支持的:
  'com.apple.itunes.Kimi':    { type: 'redirect_filename',  fields: { url: 'https://appsupport.moonshot.cn/api/app/pkg/latest/macos/download' } },
  'com.tencent.imamac':       { type: 'app_store_lookup',   fields: { url: 'https://itunes.apple.com/lookup?id=6737188438&country=cn' } },
  'cursor':                   { type: 'cursor_redirect',    fields: {} },  // legacy, macOS 早期 bundleId
  'workbuddy':                { type: 'api_json',           fields: {} },
};
```

**0 网络 0 配置**, bundleId 一查就返.

## 4. 优先级 2: 启发式 + 并行试探

### 启发式规则

| 触发 | 推测 type |
|---|---|
| appName 包含 `code` / `ide` / `studio` / `dev` (case-insensitive) | `electron_yml` |
| bundleId 包含 `electron` / `com.github.` / `.io.` | `api_json` |
| appName 包含 `chat` / `assistant` / `copilot` | `app_store_lookup` (itunes 试探) |
| appName 包含 `reader` / `player` / `viewer` | `app_store_lookup` |
| 都不命中 | 不试探, 进 3️⃣ |

### 试探超时

每条规则触发后, 跑对应 detector 一次 (复用 worker pool, 8s timeout). 命中 (有 `latest_version` 且 ≠ 已装) 算成功.

## 5. 优先级 3: brew 试探

### 猜 cask name

```js
// 来自 bundleId / appName 启发
guessCaskName(item) {
  const a = item.appName || item.bundleName.replace(/\.app$/, '');
  return a.toLowerCase().replace(/[^a-z0-9]/g, '-');  // 'Xsentinel' → 'xsentinel'
}
```

### 跑探测

`brew info --cask <cask>` → JSON parse → 有 `versions.stable` 算命中. 用现成 `brew_local_cask` 路径.

## 6. UI 形态 (1 步)

### AutoDetectModal (新)

```
┌──────────────────────────────────────────────────┐
│ 监控 Xsentinel                           [×]    │
├──────────────────────────────────────────────────┤
│ 自动探查中...                                     │
│                                                   │
│ ✓ 静态表反查 (跳过, 无 bundleId 命中)           │
│ ⏳ 启发式探测...                                 │
│   ⏳ JSON API (试探)                             │
│   ⏳ Brew Cask (试探)                            │
│ ⏸  fallback (用户手选)                          │
│                                                   │
│  [progress bar 30%]                              │
│                                                   │
├──────────────────────────────────────────────────┤
│              [取消]                               │
└──────────────────────────────────────────────────┘
```

进度通过 `library:auto-detect` IPC 推 `library:auto-detect-progress` 事件.

### 探查完成 (命中 1 个)

```
┌──────────────────────────────────────────────────┐
│ 监控 Xsentinel                           [×]    │
├──────────────────────────────────────────────────┤
│ 自动探查完成 (3.2 秒)                            │
│                                                   │
│ ✓ Homebrew Cask (首选)                           │
│   cask: xsentinel                                 │
│   brew info 返回: 1.16.6 (3 秒前)                │
│   ↑ 1 命中, 准备监控                              │
│                                                   │
│ ⚠ JSON API (跳过)                                │
│   api.example.com/version → 404 (2.8 秒)         │
│                                                   │
│ ────────────────────────────────────────────────  │
│ 选 Homebrew Cask 监控 Xsentinel?                  │
│                                                   │
│            [取消]  [手动选择 →]  [监控它 →]       │
└──────────────────────────────────────────────────┘
```

### 探查完成 (命中 N 个)

跟"命中 1 个"一样, 但自动选最高优先级, 用户可点 "手动选择 →" 跳 3 步 wizard.

### 探查完成 (都没命中)

```
┌──────────────────────────────────────────────────┐
│ 自动探查完成 — 没有匹配                          │
│                                                   │
│ ✗ 静态表反查 (无 bundleId 命中)                  │
│ ✗ JSON API (404)                                 │
│ ✗ Homebrew Cask (cask 'xsentinel' not found)      │
│                                                   │
│ → 手动选择 detector                               │
│                                                   │
│              [取消]  [手动选择 →]                 │
└──────────────────────────────────────────────────┘
```

## 7. IPC

| 通道 | 方向 | 作用 |
|---|---|---|
| `library:auto-detect` | renderer→main | 传 `{appName, bundleName, bundleId}`, 返 Promise<{ results, best }> |
| `library:auto-detect-progress` | main→renderer | 推 `{phase, status, results[]}` |
| `library:auto-detect-cancel` | renderer→main | 取消当前探测 |

## 8. 改动文件

### 新文件 (5)

- `src/main/library/known-apps.js` — 11 静态表
- `src/main/library/detect.js` — orchestrator (4 层优先级)
- `src/main/library/brew-probe.js` — `brew info` wrapper
- `src/renderer/components/AutoDetectModal.jsx` — 1 步 modal
- `tests/main/library-detect.test.js` — 优先级链 + 并行 + timeout

### 改文件 (4)

- `src/main/ipc.js` — 加 `library:auto-detect` 通道
- `preload.js` + `src/renderer/api.js` — 暴露新 API
- `src/renderer/components/LibrarySection.jsx` — [监控] 按钮改触发 auto-detect
- `src/renderer/components/DetectorWizardModal.jsx` — 保留作 fallback, 加 "来自 auto-detect fallback" 提示

## 9. 实施顺序

1. 写 `known-apps.js` + 单测 (~30min)
2. 写 `brew-probe.js` + 单测 (~20min)
3. 写 `detect.js` orchestrator + 单测 (~1h, 含并行 + timeout + 4 层优先级)
4. 加 IPC 通道 + preload (~20min)
5. 写 `AutoDetectModal.jsx` (~1h, 含 4 状态: 探查中 / 命中 1 / 命中 N / 都没命中)
6. LibrarySection 接新按钮 (~10min)
7. DetectorWizardModal 保留作 fallback (~5min)
8. 跑全套 + 真机验 (~30min)

**总**: ~4h, 比 v2.7.1 (2.5h) 多, 因为 detect orchestrator 复杂

## 10. 决策点 (用户拍板)

| 决策 | 选项 | 拍板 |
|---|---|---|
| bundleId 静态表覆盖范围 | 仅 11 已知 / 扩展 30+ / 社区共享 | **11 已知** (跟现状 config 同, 不开新机制) |
| 并行试探粒度 | 全 4 层并行 / 仅 2️⃣3️⃣ 并行 | **2️⃣3️⃣ 并行, 1️⃣4️⃣ 串行** (4️⃣ 是 fallback 不并行) |
| 试探 timeout | 8s / 5s / 3s | **8s/项** (跟现状 check-updates 一致) |
| 命中 N 个时默认选 | 最高优先级 / 让用户选 | **最高优先级, 按钮可跳"手动选择"** |
| 探查过程是否显示 | 显示进度 / 只显示最终结果 | **显示进度** (用户知道系统在干啥, 不焦虑) |
| 失败兜底 | wizard (3 步) / 简化 1 步 select | **保留 3 步 wizard 作 fallback** (现成代码不浪费) |

## 11. 测试

- 静态表 11 case
- 启发式规则 6 case
- brew 试探 2 case (成功 / cask not found)
- 并行 allSettled 1 case
- timeout 2 case (8s 兜底)
- 优先级链 5 case (1️⃣→4️⃣ 顺序)
- 总: 17 case
- 全套 0 失败 (1061 passed | 4 skipped 估算)

## 12. 不做的 (跟 v5 brainstorm 边界)

- ❌ AI LLM 试探 (LLM 猜 detector, 太重, 留给 v2.9+)
- ❌ GitHub release 自动探测 (没线索猜 repo, 留着)
- ❌ 社区共享已知 app 库 (单机版, 团队共享留给 v3.0+)
- ❌ detector 试用历史 (用户上次选过, 这次优先用 — v2.9+ 可考虑)
