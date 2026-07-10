# 可靠性 + 自动化 设计 Spec (Phase 24)

- **日期**: 2026-06-07
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (AppUpdateChecker v2.x)
- **目标特性**: 自动重检 / 网络重试 / 检查间隔可配

## 1. 背景

Phase 22 Bulk Upgrade 之后用户反馈：
> "我点了升级之后，显示是成功了，但看起来并没有升级成功，因为我打开 codex 应用的时候。还是提示我有更新"

根因不是 sparkle 升级失败（修了 `open_url`），而是 **modal 关闭后 state.json 还显示 "有更新"** —— bulk upgrade 完成后没自动重检。同样的问题在 brew upgrade 后也存在。

另外两个 reliability 项：
- HTTP 调用偶发 ECONNRESET / TIMEOUT 失败（没有重试）
- check 间隔硬编 6 小时（用户没法改）

## 2. 目标

3 个子特性：

1. **Bulk Upgrade 完成后自动重检** —— 修 "升级完还显示有更新" 的 UX bug
2. **HTTP 网络失败重试 1 次** —— 偶发网络抖动不导致漏检
3. **检查间隔可配** —— config.json 加 `notifications.check_interval_hours`

## 3. 非目标 (YAGNI)

- 多次重试（1 次就够，2 次拖累整体 check 时间）
- 重试 4xx/5xx（BE 问题不重试）
- 间隔的 UI（用户在 config.json 改）
- Per-app 间隔
- 间隔表达式 / cron（只支持整数小时）
- 重试退避策略（固定 3s）

## 4. UX 行为

### 4.1 Auto-recheck
- 用户在 modal 里点 "升级 1 个应用" → main 跑 brew upgrade / open app
- main 推 `bulk-upgrade:done` 事件到 renderer
- renderer 收到 done 后：
  - 更新 `bulkUpgradeSummary` signal
  - 显示 done summary 在 modal 里
  - **2s 后** 调 `triggerCheck()` (跟用户手动点 "检查更新" 一样)
- 用户行为：modal 关闭（点 X 或 Close）→ 看到列表刷新成 "已是最新"
- 2s 缓冲：brew cask install / sparkle .zip 解压都需要时间

### 4.2 HTTP 重试（用户不可见）
- 检测器调 `http.get()` 时，Transport 错误（ETIMEDOUT / ECONNRESET / ENOTFOUND / ECONNREFUSED）→ 静默等 3s → 重试 1 次
- 用户感知：check 偶尔一次失败不再显示 error，而是稍等重试成功
- 4xx/5xx 不重试（透传给 detector 的 status 解析）

### 4.3 检查间隔
- config.json：
  ```json
  {
    "notifications": {
      "check_interval_hours": 6
    }
  }
  ```
- 默认 6，clamp 0-24，0 = 关闭
- 在 `index.js` 启动时读，配 setInterval 时长
- 0 时不调 setInterval（停掉自动 check）
- 不加 UI

## 5. 架构

### 5.1 HTTP 重试

```js
// src/main/http-client.js
const TRANSPORT_ERROR_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN']);

async function withRetry(fn, { retries = 1, delayMs = 3000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      if (!err || !TRANSPORT_ERROR_CODES.has(err.code)) break;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// HttpClient.get / post / head 改成包 withRetry
```

### 5.2 Auto-recheck 数据流

```
[main] runBulkUpgrade 完成
  ↓
ipcMain → webContents.send('bulk-upgrade:done', summary)
  ↓
[renderer] api.onBulkUpgradeDone(applyBulkUpgradeDone)
  ↓
[index.jsx] 同回调里 setTimeout(() => triggerCheck(), 2000)
  ↓ (2s 后)
api.checkUpdates() → ipcMain.handle('check-updates') → runCheck
  ↓
worker pool 跑 detect-app tasks
  ↓
[renderer] applyProgress × N → finishCheck
  ↓
state 刷新, modal 关闭后用户看到 "已是最新"
```

注意：
- 用 setTimeout，2s 内用户可关 modal
- 用户手点 "检查更新" 时（`onCheck` 触发）应 clear pending timeout 防 race
- Recheck 失败不影响后续手点

### 5.3 Interval 配置

```js
// src/main/index.js
const checkIntervalHours = runtimeConfig?.notifications?.check_interval_hours ?? 6;
if (checkIntervalHours > 0) {
  const intervalMs = checkIntervalHours * 60 * 60 * 1000;
  const autoCheckTimer = setInterval(() => {
    runCheck(..., { silent: true });
  }, intervalMs);
}
```

```js
// src/config/schema.js
function sanitizeNotifications(notif) {
  let hours = notif.check_interval_hours;
  if (typeof hours !== 'number' || !Number.isFinite(hours)) hours = 6;
  hours = Math.max(0, Math.min(24, Math.floor(hours)));
  return { ...notif, check_interval_hours: hours };
}
```

## 6. 文件改动

| 路径 | 操作 | 说明 |
|---|---|---|
| `src/main/http-client.js` | edit | 加 `withRetry` helper + 包 get/post/head |
| `src/main/check-runner.js` | edit | (无改动 — interval 在 index.js 管) |
| `src/main/index.js` | edit | 读 cfg.notifications.check_interval_hours，配 setInterval |
| `src/config/schema.js` | edit | sanitize check_interval_hours |
| `src/renderer/index.jsx` | edit | 订阅 bulk-upgrade:done → setTimeout 2s 触发 triggerCheck |
| `tests/main/http-client.test.js` | edit | +5 case（retry on network, retry on timeout, no retry 5xx, no retry 4xx, retry success 第 2 次） |
| `tests/integration/check-runner.test.js` | edit | +2 case（interval from config, 0 = 关闭） |
| `tests/integration/config-migrate.test.js` | edit | +3 case（默认值 / clamp / 类型错误 fallback） |
| `tests/renderer/auto-recheck.test.js` | **new** | 3 case（done → recheck 2s 后 / 用户手点 check 时取消 pending / recheck 失败不爆） |

## 7. 测试策略

### 7.1 Unit

**http-client.test.js (+5)**
- ECONNRESET 一次 + 成功 一次 → 返成功
- ECONNRESET 连续 2 次 → 抛错
- ECONNRESET 一次 + 失败 一次 → 抛错（重试用完）
- HTTP 4xx → 不重试，立即返 4xx
- HTTP 5xx → 不重试，立即返 5xx
- TIMEOUT 一次 + 成功 → 返成功

**config-migrate.test.js (+3)**
- 缺 `check_interval_hours` → 默认 6
- `check_interval_hours: 100` → clamp 到 24
- `check_interval_hours: "abc"` → fallback 6
- `check_interval_hours: 6.7` → floor 到 6
- `check_interval_hours: 0` → 0（合法）

**check-runner.test.js (+2)**
- 注入 cfg.interval=0 → 不调 setInterval
- 注入 cfg.interval=6 → setInterval 6h

### 7.2 Component / Integration

**auto-recheck.test.js (+3)** — happy-dom
- mock api.onBulkUpgradeDone 注册回调 → emit done 事件 → 2s 后 triggerCheck 触发（用 fake timer）
- 用户在 2s 内手点 "检查更新" → pending timeout 被 clear（不会触发双 check）
- recheck 失败（triggerCheck 抛）→ 不影响下一次 done

## 8. 风险

| 风险 | 缓解 |
|---|---|
| 重试让整体 check 慢（极端情况 11 app × 3s × 1 = 33s） | 失败概率低；happy path 不变；只 1 次重试 |
| Auto-recheck 跟用户手点 check 撞 | clearTimeout 避免重复 IPC |
| interval 0 误关后台检查 | 文档化；config schema 接受 0 是显式 disable |
| 2s 缓冲太短（brew 慢） | 2s 够 brew cask 升完成；用户可手点重检 |
| 重试 3s 期间用户关 app | main 进程要持续跑（setTimeout 在 main 进程不会被打断） |
| withRetry 加在 http-client.js 会影响现有所有 detector | 是好事（透明）；如果有 detector 不希望重试，0 retries |

## 9. 实施顺序

1. `http-client.js` withRetry (+5 unit test) — 1h
2. `config/schema.js` sanitize + 3 case test — 30min
3. `index.js` 读 interval 配 setInterval + 2 case test — 30min
4. `renderer/index.jsx` 订阅 done 触发 recheck + 3 case test — 1h
5. 全测 + build — 30min

**总计: 3.5h**

## 10. 后续 (out of scope)

- 重试退避（指数 backoff）
- HTTP 请求 cache（同一 URL 1h 内复用）
- Auto-recheck 间隔（不是 bulk upgrade 后，而是定时重检）
- Per-app 间隔
- 设置 UI（目前用户在 config.json 改）
- 通知点击触发 bulk upgrade（需要 Phase 25 通知增强先做）
