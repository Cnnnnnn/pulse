# Pulse minimax Coding Plan 用量监控

- **日期**: 2026-06-14
- **作者**: brainstorming-2 (with user)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.11+)
- **目标特性**: 在 Pulse 内查看 minimax Token Plan (Coding Plan) 订阅的剩余配额 (5h 滚动窗口 + 周窗口)，复用 minimax 已有的 safeStorage API Key 调官方 `GET /v1/token_plan/remains` API，落到 state.json 顶层缓存，SideNav 新增第 5 个页面渲染。

## 0. 决策日志 (brainstorming-2 产出)

| 决策点 | 选择 | 备选 + 否决理由 |
|---|---|---|
| 范围 | **只 minimax, 远程拉取** | 本地埋点（题目实际是远程，不是统计 Pulse 自己调了多少） |
| Region | **写死 CN** (`api.minimaxi.com`) | Global (`.io`) / 双 region picker（你确认 CN，YAGNI） |
| 目录 | **新 `src/ai-usage/`** (sibling of `ai-sessions/`) | 并入 `ai-sessions/`（语义糊）/ webview 嵌入 console（体验差） |
| 端点 | **`https://www.minimaxi.com/v1/token_plan/remains`** | scrape HTML（脆弱）/ 双端点探测（YAGNI） |
| 认证 | **复用 safeStorage 里 `minimax` providerId 现有 key** | 单独存 subscription key（用户多一把）/ env var only（破坏现有密钥体系） |
| 缓存 | **`state.json` 顶层 `ai_usage_snapshot`**（启动可显示） | 不缓存（启动空白）/ sqlite（工程过重） |
| 解析 | **`current_interval_usage_count` 实际是 remaining**，转 `used = total - remaining` | 显示原始字段（方向反，会误导） |
| 字段兼容 | **多候选 key + `_pickNumber` 兜底**（schema drift 安全） | 强耦合字段名（issue #99 教训） |
| 刷新 | **手动 + 启动后台预热 1 次**（不阻塞） | 自动 5min（流量）/ 每次 LLM 后（竞态） |
| 并发 | **`_inFlight` 单例 promise**（共享 1 次 HTTP） | 不限（race 写 state.json） |
| UI 入口 | **SideNav 第 5 项 `📊 AI 用量`** | AI 配置 subtab（不直观）/ Header 小图标（空间紧） |
| 倒计时 | **前端每秒算**（基于 `resetAt` + `Date.now()`） | 后端推送（复杂度不值） |
| 历史 | **v1 不存历史**（current-only） | 7/30 天（v1 不需要） |
| 错误 | **`show-last-good`**（保留上次快照 + 红条原因） | 静默（用户不知）/ 自动重试（API 已稳定） |
| 限额 | **v1 不做** | 软/硬限额（题目明确 v1 不做） |
| CSV 导出 | **v1 不做**（题目最后定的是 quota，跟 CSV 不相关） | 跟原方案混淆 |
| 测试 mock | **白盒注入 mock HttpClient**（跟 `ai-sessions/storage.js` 的 `__setSafeStorageForTest` 范式一致） | 起本地 nock server（黑盒，CI 慢） |

## 1. 目标

### 1.1 必须达成

- [A] `src/ai-usage/` 新目录，4 个核心模块: `client.js` / `normalize.js` / `store.js` / `index.js`
- [A] `MiniMaxQuotaClient.fetchOnce(opts)` 调官方 `GET /v1/token_plan/remains`，返 `{ok, snapshot, reason?, error?, status?}`
- [A] `_inFlight` 单例 promise: 同时间多次 fetch 共享同一次 HTTP（正确性，非 UI 防抖）
- [A] `normalize(rawResponse, opts)` 防御性解析，输出 `{provider, region, fetchedAt, endpoint, windows: {5h, weekly}, credits}`
- [A] API 字段反直觉处理: `current_interval_usage_count` = remaining（不是 used），需 `used = total - remaining`
- [A] 多候选 key 容错: `_pickNumber(obj, [key1, key2])` 接受 fallback 列表（应对 schema 漂移，如 `coding_plan` → `token_plan`）
- [A] `state.json` 顶层新字段 `ai_usage_snapshot`，老 state.json 无该字段 → load 返 null
- [A] 复用现有 `patchState` 范式，写 snapshot 不丢其他字段
- [A] 复用 `safeStorage` 里 `minimax` providerId 现有 key，不另存
- [A] 3 个 IPC 通道: `ai-usage:get-snapshot` / `ai-usage:fetch` / 启动后 `bootstrap fetch`
- [A] `ai-usage:fetch` 失败时**不**写 state.json（保留上次成功快照）
- [A] 启动后 `setImmediate` 后台异步 fetch 1 次（不阻塞 main 启动）；失败仅 mainLog warn，不打扰用户
- [A] SideNav 新增第 5 项 `📊 AI 用量` 入口，App.jsx 加路由分支 `<AIUsagePage />`
- [A] `<AIUsagePage />` 渲染 2 张卡 (5h / 周) + 进度条 + 数字 (剩余/总数/已用) + 重置倒计时 + 🔄 刷新按钮 + 最后更新时间 + 失败红条
- [A] 倒计时纯前端算（`setInterval(1s)`），unmount 时 clear
- [A] 错误信息人话化: `auth_401` → "API Key 无效，请到 AI 配置更新" + 跳配置按钮（复用 `openAISettings(true)`）
- [A] 单窗口字段缺失时该卡显示「暂无数据」，整体仍成功，不崩
- [A] `ai-usage-store.js` signals: `aiUsageSnapshot` / `aiUsageFetching` / `aiUsageLastError` / `aiUsageLastFetchedAt`

### 1.2 应该达成 (nice-to-have)

- [B] 首次打开 SideNav `usage` 页面时主动 fetch 1 次（防陈旧数据）
- [B] 「最后更新: X 秒前」自动刷新显示（轻量 setInterval）
- [B] 倒计时两级粒度：>1h 显示 HH:MM:SS，<1h 每秒倒计时
- [B] `MINIMAX_TOKEN_PLAN_URL` env var 覆盖 endpoint（debug 用）
- [B] SideNav badge 显示当前 5h 已用比例（醒目提示）

### 1.3 不会做 (out of scope)

- ❌ 多 provider quota (deepseek/其它) — 留 v2
- ❌ Global region (.io) — 你确认 v1 只 CN
- ❌ 历史趋势 / 折线图 — 留 v2
- ❌ Budget / 限额 / 告警 / notification — 题目明确 v1 不做
- ❌ CSV 导出 — 跟 quota 不相关（之前跟本地用量混淆）
- ❌ 自动 5min 轮询 — 流量考虑 + 用户主动控制
- ❌ session cookie 模式 (issue #88) — 留 v2 (极端兜底)
- ❌ desktop notification — 留 v2
- ❌ webview 嵌入控制台 — 体验差
- ❌ 本地埋点统计 Pulse 调了多少 — 跟题目无关，已明确放弃

## 2. 架构

```
┌──────────────────────────────────────────────────────────────┐
│  src/ai-usage/                  (新目录, sibling of ai-sessions/) │
│  ├── client.js           MiniMaxQuotaClient: HTTP GET /v1/token_plan/remains
│  ├── normalize.js        raw response → 标准化 { windows: { 5h, weekly } }
│  ├── store.js            state.json ai_usage_snapshot 读写 + 启动预热 hook
│  └── index.js            统一导出 + main 入口
└──────────────────┬────────────────────────────────────────────┘
                   │ IPC: ai-usage:get-snapshot / ai-usage:fetch
                   ▼
   ┌─────────────────────────────────────────┐
   │  main process:                          │
   │  - MiniMaxQuotaClient 单例               │
   │  - 复用 safeStorage minimax apiKey       │
   │  - HttpClient (timeout 15s, retry 0)    │
   │  - 启动后 setImmediate 预热 1 次         │
   └────────┬─────────────────────────────────┘
            │
            ▼
   ┌─────────────────────────────────────────┐
   │  renderer:                              │
   │  - <AIUsagePage />  SideNav 第 5 项     │
   │    2 个进度卡 (5h / 周) + 重置倒计时     │
   │    + 刷新按钮 + 最后更新时间 + 失败标记 │
   │  - aiUsageStore.js signals              │
   └─────────────────────────────────────────┘
```

**职责边界**:
- `ai-usage/` 只管「配额查询 + 解析 + 缓存」，跟 `ai-sessions/`（任务总结）零耦合
- 不复用 `LLMSummarizer` / `provider-cloud.js`（那是 LLM 推理路径，跟 quota API 是不同的端点）
- 复用现有 `safeStorage`（拿 minimax apiKey）、`HttpClient`（HTTP 调用）、`mainLog`（失败日志）、`patchState`（atomic write）

**关键流程**:
1. **启动** → main process 读 state.json 拿上次快照（可能为 null）→ `setImmediate` 后台异步 fetch 1 次 → 成功就写覆盖
2. **用户进 SideNav `usage`** → renderer 调 `ai-usage:get-snapshot` 拿到 `aiUsageSnapshot`（立刻显示，不空白）→ 用户点 🔄 → IPC `ai-usage:fetch` → main 重新拉 → 返结果同时写快照
3. **失败** → 显示上次快照 + 红条「刷新失败: ...」+ 不闪退

**目录命名**（跟 ai-sessions 一致）:
- `src/ai-usage/` 是 sibling，不进 `src/main/` 或 `src/renderer/`，因为跨 main/renderer 都用到

## 3. 数据层

### 3.1 `state.json` 新字段

```json
{
  "...": "...",
  "ai_usage_snapshot": {
    "provider": "minimax",
    "region": "cn",
    "fetchedAt": 1780846000000,
    "endpoint": "https://www.minimaxi.com/v1/token_plan/remains",
    "windows": {
      "5h": {
        "total": 6000,
        "remaining": 4200,
        "used": 1800,
        "resetAt": 1780864000000,
        "resetInSec": 18000,
        "label": "5 小时滚动窗口"
      },
      "weekly": {
        "total": 50000,
        "remaining": 38000,
        "used": 12000,
        "resetAt": 1781350000000,
        "resetInSec": 504000,
        "label": "周窗口"
      }
    },
    "credits": null
  }
}
```

**字段语义**:
- `provider`: 写死 `"minimax"`（v1 只此一个 provider，留字段方便以后扩）
- `region`: `"cn"` / `"global"`，影响 endpoint 选择（v1 写死 `cn`）
- `fetchedAt`: 服务端响应时间戳（用于 UI「最后更新: X 秒前」）
- `endpoint`: 实际命中的 URL（debug 用）
- `windows`: 标准化后的窗口数据；以后加 1d 之类直接扩对象
- `credits`: 订阅附带的 credits 配额，v1 始终 null（API 不一定返，留接口）

**关键转换** (API 字段反直觉):
- `remaining = current_interval_usage_count` (直接拿)
- `used = current_interval_total_count - remaining`
- `resetAt = Date.now() + parseDdHhMmSs(interval_remains_time)` (格式 `DD:HH:MM:SS`)

### 3.2 解析容错

API 字段可能因版本变动缺这缺那 ([issue #99](https://github.com/MiniMax-AI/MiniMax-M2/issues/99) 教训)。normalize.js **防御性读取**:

```js
// 伪代码
const raw = JSON.parse(body);
// 必须有 base_resp.status_code == 0 才算成功
if (!raw?.base_resp || raw.base_resp.status_code !== 0) {
  return { ok: false, reason: raw?.base_resp?.status_msg || 'api_error' };
}

// window 字段全可选, 缺哪个就返 null 不崩
const windows = {};
const intervalBlock = Array.isArray(raw.model_remains) && raw.model_remains.length > 0
  ? raw.model_remains[0] : null;
if (intervalBlock) {
  windows['5h'] = _buildWindow({
    total: _pickNumber(intervalBlock, ['current_interval_total_count']),
    remaining: _pickNumber(intervalBlock, ['current_interval_usage_count']),
    resetSec: _parseDdHhMmSs(_pickString(intervalBlock, ['interval_remains_time'])),
  });
}
```

**为什么这样写**:
- 官方字段命名误导过开发者，schema 改过至少 2 次 (`coding_plan` → `token_plan`)，强耦合字段会爆
- `_pickNumber` / `_pickString` 接受多个候选 key（兼容旧字段名）
- 任何字段缺失 → 那个窗口返 `null`，**整体仍能成功**（用户能看到的部分就显示能看的）

### 3.3 `state.json` 兼容

- 老 state.json（无 `ai_usage_snapshot`） → load 时 `null`，UI 显示「尚无数据，点 🔄 拉取」
- 不做 GC（snapshot 只有 1 个对象，不是数组）
- 用 `patchState` 写，跟现有 `task_summaries` / `ai_sessions_config` 同样范式
- **不递增 SCHEMA_VERSION**（参考 task_summaries 的做法——加 optional 字段不破坏老 state）

### 3.4 不写失败

**关键**: `ai-usage:fetch` 失败时**不**写 state.json（保留上次成功快照）。失败原因只走 IPC 返给 renderer + mainLog warn。这样既符合 `show-last-good`，又避免快照被错误数据污染。

## 4. Runtime 层

### 4.1 `src/ai-usage/client.js`

```js
class MiniMaxQuotaClient {
  /**
   * @param {object} [opts]
   * @param {object} [opts.httpClient]    注入 HttpClient (测试用)
   * @param {string} [opts.apiKey]         注入 apiKey (测试用)
   * @param {string} [opts.region]         'cn' | 'global'
   * @param {string} [opts.endpoint]       全 URL override (env)
   * @param {object} [opts.log]            logger
   */
  constructor(opts = {}) { /* ... */ }

  /**
   * @param {object} [opts]
   * @param {string} [opts.region]         override 区域
   * @returns {Promise<{ok: boolean, snapshot?: object, reason?: string, error?: string, status?: number}>}
   */
  async fetchOnce(opts = {}) {
    // _inFlight 单例 promise 共享
  }
}

module.exports = { MiniMaxQuotaClient };
```

**Endpoint 路由**:
```js
const ENDPOINTS = {
  cn:     'https://www.minimaxi.com/v1/token_plan/remains',
  global: 'https://www.minimax.io/v1/token_plan/remains',
};
// env override: MINIMAX_TOKEN_PLAN_URL
```

**HTTP 调用**:
- method: GET
- headers: `Authorization: Bearer <minimax apiKey>` + `Content-Type: application/json`
- timeout: 15s
- retry: 0 (手动刷新用户可重试)
- 用现有 `HttpClient` (`src/main/http-client.js`)

### 4.2 `src/ai-usage/normalize.js`

```js
/**
 * @param {object} rawResponse   parsed JSON
 * @param {object} [opts]        { fetchedAt, endpoint, provider, region }
 * @returns {{ ok: boolean, snapshot?: object, reason?: string, error?: string }}
 */
function normalize(rawResponse, opts = {}) {
  // 1) base_resp 校验
  // 2) 防御性读 model_remains[0]
  // 3) _pickNumber / _pickString 多候选 key
  // 4) _parseDdHhMmSs 解析重置时间
  // 5) used = total - remaining (反直觉转换)
  // 6) 组装 snapshot, 单窗口字段缺 → null
}

module.exports = { normalize, _pickNumber, _pickString, _parseDdHhMmSs };
```

**关键**: 全部纯函数，无副作用，单测 ≥ 95% 覆盖。

### 4.3 `src/ai-usage/store.js`

```js
/**
 * @param {string} [statePath]
 * @returns {object|null}
 */
function loadAiUsageSnapshot(statePath = defaultPath()) { /* ... */ }

/**
 * @param {object} snapshot
 * @param {string} [statePath]
 * @returns {object} 写完后的完整 state
 */
function saveAiUsageSnapshot(snapshot, statePath = defaultPath()) { /* ... */ }
```

**走 `patchState`** 范式（跟 `task_summaries` 一致），atomic write。

### 4.4 `src/ai-usage/index.js`

```js
const { MiniMaxQuotaClient } = require('./client');
const normalize = require('./normalize');
const store = require('./store');

module.exports = {
  MiniMaxQuotaClient,
  normalize,
  store,
  ENDPOINTS,
};
```

### 4.5 bootstrap 预热

`src/main/index.js` 启动流程里，**`setImmediate` 后**调用（不阻塞 main 启动）:

```js
setImmediate(async () => {
  try {
    const client = global.__pulse_aiUsageClient || new MiniMaxQuotaClient({ log: mainLog });
    const r = await client.fetchOnce({ region: 'cn' });
    if (r.ok) {
      stateStore.saveAiUsageSnapshot(r.snapshot);
      mainLog.info('[ai-usage] bootstrap fetch ok');
    } else {
      mainLog.warn('[ai-usage] bootstrap fetch failed:', r.reason);
    }
  } catch (err) {
    mainLog.warn('[ai-usage] bootstrap fetch threw:', err.message);
  }
});
```

**不**给 renderer 推送事件 — 用户没进页面时不打扰。

## 5. IPC 层

### 5.1 `src/main/ipc/register-ai-usage.js`

```js
function registerAiUsageHandlers(ctx) {
  const { safeHandle } = ctx;

  // 同步读 state.json
  safeHandle('ai-usage:get-snapshot', async () => {
    return { ok: true, snapshot: stateStore.loadAiUsageSnapshot() };
  });

  // 触发拉取, 成功写盘
  safeHandle('ai-usage:fetch', async () => {
    try {
      const client = global.__pulse_aiUsageClient || new MiniMaxQuotaClient({ log: mainLog });
      const r = await client.fetchOnce({ region: 'cn' });
      if (r.ok) {
        stateStore.saveAiUsageSnapshot(r.snapshot);
        return { ok: true, snapshot: r.snapshot };
      }
      return { ok: false, reason: r.reason, error: r.error, status: r.status };
    } catch (err) {
      return { ok: false, reason: 'threw', error: err.message };
    }
  }, { logMeta: () => ({ provider: 'minimax' }) });
}

module.exports = { registerAiUsageHandlers };
```

### 5.2 通道汇总

| channel | 方向 | 用途 |
|---|---|---|
| `ai-usage:get-snapshot` | renderer → main | 启动时拿上次快照（同步读 state.json） |
| `ai-usage:fetch` | renderer → main | 触发一次拉取（点 🔄 时） |
| `bootstrap fetch` | main → main | 启动后台预热 1 次（不暴露给 renderer） |

### 5.3 并发安全 (`_inFlight`)

**必须做的硬约束**（跟 UI 防抖无关，是正确性问题）:

```js
// client.js 内部
let _inFlight = null;
async function fetchOnce(opts) {
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try { return await _doFetch(opts); }
    finally { _inFlight = null; }
  })();
  return _inFlight;
}
```

避免并发写 state.json 导致 race。**不暴露给 renderer**，用户感知不到。

## 6. UI 层

### 6.1 SideNav 入口

`src/renderer/components/SideNav.jsx` 的 `NAV_ITEMS` 里**追加**一项（不重排现有顺序）:

```jsx
{ key: 'usage', icon: '📊', label: 'AI 用量', tooltip: 'minimax 订阅配额 + 剩余' },
```

`activeNav` 已有 4 个值（ithome/worldcup/funds/versions），加第 5 个 `usage`。`App.jsx` 加路由分支 `<AIUsagePage />`，跟其他 4 个并列。

### 6.2 `<AIUsagePage />` 布局

```
┌─────────────────────────────────────────────────────────┐
│  📊 AI 用量 — minimax (中国版)            [🔄 刷新]      │
│  最后更新: 30 秒前                                       │
├─────────────────────────────────────────────────────────┤
│  ┌─ 5 小时滚动窗口 ─────────────────────────────┐      │
│  │  ████████████░░░░░░░░  70%                   │      │
│  │  剩余 4,200 / 6,000   已用 1,800              │      │
│  │  距离重置: 4 时 59 分                         │      │
│  └──────────────────────────────────────────────┘      │
│                                                         │
│  ┌─ 周窗口 ────────────────────────────────────┐      │
│  │  ██████░░░░░░░░░░░░░░  24%                  │      │
│  │  剩余 38,000 / 50,000  已用 12,000           │      │
│  │  距离重置: 5 天 22 时                        │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### 6.3 状态分支

- **无快照 + 未拉过**: 居中显示「尚无数据，点 🔄 拉取」+ 大按钮
- **拉取中**: 进度条变 skeleton spinner, 🔄 按钮转圈, 数字保持上次值（不消失）
- **拉取失败**: 顶部红条「刷新失败: 401 — API Key 无效，请到 AI 配置更新」+ 数据仍显示上次快照（不消失）+ 失败时间
- **窗口数据 null** (API 没返): 该卡片显示「暂无数据」占位，不崩
- **倒计时已过 `resetAt`**: 该卡显示「已可重置」+ 橙色提示，建议用户点 🔄 刷新

### 6.4 错误信息人话化

`reason` (机器可读) → UI 文案 (人类可读):

```js
const ERROR_MESSAGES = {
  api_key_missing: '请先到 AI 配置设置 minimax key',
  api_key_decrypt_failed: 'API Key 解密失败，请重新设置',
  auth_401: 'API Key 无效，请到 AI 配置更新',
  auth_403: 'API Key 无权限，请到 AI 配置更新',
  rate_limited: '调用太频繁，请稍后再试',
  network_failed: '网络失败，请检查网络',
  timeout: '请求超时，请重试',
  response_not_json: 'API 返回异常',
  api_error: 'API 返回错误',
  http_status_404: 'endpoint 404，可能是官方更新，请反馈',
  http_status_5xx: '服务端暂时不可用',
};
```

底层 `reason` + `error` 详情进 mainLog 给 debug。

### 6.5 倒计时 (前端)

```jsx
function ResetCountdown({ resetAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (resetAt == null) return <span>—</span>;
  const remainingMs = resetAt - now;
  if (remainingMs <= 0) return <span class="reset-due">已可重置</span>;
  // 两级粒度: > 1h 显示 HH:MM:SS, < 1h 每秒倒计时
  return <span>{formatRemaining(remainingMs)}</span>;
}
```

**关键**: unmount 时 clearInterval（防泄漏）。

### 6.6 `src/renderer/store/ai-usage-store.js` (signals)

```js
import { signal } from '@preact/signals';
import { api } from '../api.js';

export const aiUsageSnapshot = signal(null);
export const aiUsageFetching = signal(false);
export const aiUsageLastError = signal(null);    // { reason, error, at }
export const aiUsageLastFetchedAt = signal(0);

export async function refreshAiUsage() { /* ... */ }
export async function loadAiUsageSnapshot() { /* ... */ }
```

### 6.7 `src/renderer/api.js` 扩展

```js
aiUsage: {
  getSnapshot: () => ipcRenderer.invoke('ai-usage:get-snapshot'),
  fetch: () => ipcRenderer.invoke('ai-usage:fetch'),
},
```

## 7. State + 持久化

### 7.1 `state.json` (顶层新字段)

```json
{
  "...": "...",
  "ai_usage_snapshot": {
    "provider": "minimax",
    "region": "cn",
    "fetchedAt": 1780846000000,
    "endpoint": "https://www.minimaxi.com/v1/token_plan/remains",
    "windows": { "5h": {...}, "weekly": {...} },
    "credits": null
  }
}
```

- 老 state.json (无字段) → load 返 null
- 用 `patchState` atomic write, 保留其他顶层字段
- **不递增 SCHEMA_VERSION**

### 7.2 API Key

**完全复用** safeStorage 里 `minimax` providerId 现有 key（`src/ai-sessions/storage.js` 的 `loadApiKey('minimax')`）。

**不**另存 subscription key——minimax 的 API Key 和 Subscription Key 是**同一把**（按 [官方文档](https://platform.minimax.io/docs/token-plan/quickstart)），用户已经配置过。

### 7.3 IPC 通道

| channel | 方向 | 用途 |
|---|---|---|
| `ai-usage:get-snapshot` | renderer→main | 同步读 state.json 当前快照 |
| `ai-usage:fetch` | renderer→main | 触发一次 HTTP 拉取，成功写盘 |
| bootstrap fetch | main→main | 启动 setImmediate 后台预热 1 次 |

## 8. 边界 / 错误处理

| 场景 | 行为 |
|---|---|
| safeStorage 里没 minimax key | `{ok:false, reason:'api_key_missing'}` → UI「请先到 AI 配置设置 minimax key」+ 跳配置按钮 |
| safeStorage 解密失败 | `{ok:false, reason:'api_key_decrypt_failed'}` → UI 同样提示 + mainLog warn 详情 |
| HTTP 401/403 | `{ok:false, reason:'auth_401'/'auth_403'}` → UI「API Key 无效」+ 跳配置. **不**自动清 key |
| HTTP 429 | `{ok:false, reason:'rate_limited'}` → UI「调用太频繁，请稍后再试」 |
| HTTP 5xx | `{ok:false, reason:'http_status_5xx'}` → UI「服务端暂时不可用」 |
| HTTP 404 | `{ok:false, reason:'http_status_404'}` → UI「endpoint 404，可能是官方更新」 |
| 网络 ECONNREFUSED | `{ok:false, reason:'network_failed', error}` → UI「网络失败: ...」 |
| Timeout 15s | `{ok:false, reason:'timeout'}` → UI「请求超时，请重试」 |
| 非 JSON 响应 | `{ok:false, reason:'response_not_json'}` → UI「API 返回异常」 |
| base_resp.status_code !== 0 | `{ok:false, reason:'api_error', error:status_msg}` → UI「API 返回错误: ...」 |
| 字段全缺 (normalize 后 windows 空) | `{ok:true, snapshot:{windows:{}}}` → 2 张卡都显示「暂无数据」+ 不算错误 |
| 单窗口字段缺 (e.g. 有 weekly 没 5h) | `{ok:true, snapshot:{windows:{5h:null, weekly:{...}}}}` → 只 weekly 卡显示, 5h 卡「暂无数据」 |
| 启动 bootstrap fetch 失败 | mainLog warn，**不**弹 UI（用户没进页面时不应被打扰） |
| 并发 fetch (同 in-flight) | 共享同一 promise（§5.3），所有调用方拿到同结果 |
| 用户系统时钟偏差 | 倒计时基于 `Date.now()`，偏差大时重置不准。v1 不修（极端场景） |
| safeStorage 不可用 (Linux 无 keyring) | safeStorage 已返 null → 触发 `api_key_missing` 链路 |
| minimax 域名变更 / 404 | `{ok:false, reason:'http_status_404'}` → UI 红条明确提示 |

**核心原则**:
- 任何错误都不抛到 main process 顶层、不 crash Pulse
- 失败时**保留上次快照**，UI 不消失数据
- 区分 `reason` (机器可读) 和 `error` (人类可读详情)
- 错误文案人话化，底层 detail 进 mainLog

## 9. 测试策略

### 9.1 新增测试 (~65 cases)

**`tests/ai-usage/client.test.js`** (~15):
- HTTP 200 + 标准 payload → 解析完整
- HTTP 200 + model_remains[0] 缺字段 → ok 但窗口 null
- HTTP 200 + 无 model_remains → windows 全 null
- HTTP 200 + 错 base_resp → reason: `api_error`
- HTTP 401/403 → reason: `auth_401`/`auth_403`, status 保留
- HTTP 429 → reason: `rate_limited`
- HTTP 500 → reason: `http_status_500`
- 非 JSON 响应 → reason: `response_not_json`
- network reject → reason: `network_failed`
- timeout → reason: `timeout`
- 并发 fetch × 3 → 只发 1 次 HTTP, 3 caller 都拿到同结果
- _inFlight 完成后第二次 fetch 重新发 HTTP

**`tests/ai-usage/normalize.test.js`** (~20):
- 完整 payload → 所有窗口正常
- `current_interval_usage_count` 当 remaining 处理（**关键反直觉，锁定 spec**）
- `interval_remains_time` 解析 `DD:HH:MM:SS` → 秒数
- 边界: `00:00:00:00` → 0
- 边界: `00:01:00:00` → 3600
- 缺 `current_interval_total_count` → 5h.total = null
- 缺 `current_interval_usage_count` → 5h.remaining = null, used = null
- 缺 `interval_remains_time` → 5h.resetAt = null
- 旧字段名兼容（`_pickNumber` 多 key fallback）
- 缺 base_resp → 视为成功（容错，老 schema 可能没）
- base_resp.status_code !== 0 → 整个失败
- 数字字段是 string (`"6000"`) → coerce 成 number
- 数字字段是负数/NaN → 当 null
- weekly 解析同上 7 个 case
- credits 字段 v1 始终 null

**`tests/ai-usage/store.test.js`** (~10):
- 老 state.json 无 `ai_usage_snapshot` → load 返 null
- round-trip save → load
- 写 snapshot 不影响其他顶层字段 (patchState 隔离)
- 不存在的 statePath → 优雅返 null
- snapshot 字段类型校验（防 schema drift）

**`tests/ai-usage/ipc.test.js`** (~8):
- `ai-usage:get-snapshot` 无数据 → `{ok:true, snapshot:null}`
- `ai-usage:get-snapshot` 有数据 → 返完整 snapshot
- `ai-usage:fetch` 成功 → 写 state.json + 返 snapshot
- `ai-usage:fetch` 失败 → **不**写 state.json + 返 `{ok:false, reason}`
- bootstrap fetch 失败 → mainLog warn, 不抛
- 并发 IPC fetch × 2 → 实际只 1 次 HTTP

**`tests/renderer/AIUsagePage.test.jsx`** (~12):
- snapshot=null + fetching=false → 空状态
- snapshot 有 5h+weekly → 2 张卡显示
- snapshot 只有 weekly → 5h 卡「暂无数据」
- fetching=true → spinner + 🔄 转圈
- lastError 存在 → 红条 + 仍显示上次数据
- 倒计时: resetAt 未来 → 「距离重置: 4 时 59 分」
- 倒计时: resetAt 已过 → 「已可重置」+ 橙色
- 跳配置按钮点击 → 调 `openAISettings(true)`
- 刷新按钮点击 → 调 `refreshAiUsage()`
- unmount → clearInterval 倒计时
- 「最后更新: X 秒前」随时间更新

### 9.2 现有测试更新 (+5 cases)

**`tests/main/load-smoke.test.js`** (+2):
- `src/ai-usage/*.js` require OK
- `src/main/ipc/register-ai-usage.js` require OK

**`tests/main/state-store.test.js`** (+3):
- `ai_usage_snapshot` 读写
- 缺字段 fallback
- 写 snapshot 不丢其他字段

### 9.3 关键 fixture

- `tests/fixtures/minimax-token-plan-ok.json` — 标准 200 响应
- `tests/fixtures/minimax-token-plan-partial.json` — 只有 weekly 字段
- `tests/fixtures/minimax-token-plan-error.json` — base_resp.status_code !== 0
- `tests/fixtures/minimax-token-plan-old-schema.json` — 旧字段名, 验证 fallback

**测试 mock 策略**:
- 不打真实 HTTP（test suite 必须 offline）
- 白盒注入 mock HttpClient（跟 `ai-sessions/storage.js` 的 `__setSafeStorageForTest` 范式一致）
- `client.js` 暴露 `__setHttpClientForTest(mockFn)` 注入

### 9.4 覆盖率目标

- 新模块整体 ≥ 80%
- `normalize.js` ≥ 95%（纯函数，全覆盖合理）

## 10. 实施 phases (后续, 进 writing-plans)

预计 4 phases，每 phase 1 commit，独立可 rollback:

1. **Phase U1: Client + Normalize 基础** (~35 test)
   - `src/ai-usage/client.js` + `normalize.js`
   - HTTP 调用 + 字段映射 + 防御性解析
   - `_inFlight` 单例
   - 全部 unit test

2. **Phase U2: State 持久化 + IPC** (~18 test)
   - `store.js` (state.json 读写)
   - `register-ai-usage.js` (3 个 IPC: get-snapshot / fetch / bootstrap)
   - `main/index.js` 接入
   - 全部 test

3. **Phase U3: UI 页面 + Store** (~12 test)
   - `ai-usage-store.js` (signals)
   - `api.js` 加 2 个方法
   - `<AIUsagePage />` (2 卡片 + 倒计时 + 错误条)
   - SideNav 入口
   - App.jsx 路由
   - 全部 component test

4. **Phase U4: Polish + E2E** (~5 test)
   - 错误信息人话化
   - 视觉调整
   - 性能 (倒计时不阻塞)
   - e2e: mock HTTP → 进页面 → 刷新 → 验证显示
   - 全部 integration test

## 11. 开放问题 (后续处理, 不阻塞 spec)

| 问题 | 决策 | 备注 |
|---|---|---|
| minimax schema 又变 (issue #99 教训) | `_pickNumber` 多候选 key + fixture 维护 | CONTRIBUTING |
| minimax 改 endpoint 路径 | `MINIMAX_TOKEN_PLAN_URL` env override | §4.1 |
| 用户换 provider (e.g. deepseek coding plan) | v1 不支持；以后扩 client.js + state.json 字段 | §3.1 留 `provider` 字段 |
| 用户同时有 CN + Global 账号 | v1 只 CN；以后加 region picker | §3.1 留 `region` 字段 |
| minimax 加 credits 字段 | normalize.js 留 `credits` 占位, v1 始终 null | §3.1 留接口 |
| 5h 窗口的动态滚动逻辑 | 不在本地模拟，纯展示服务端给的 `resetAt` | 服务端是 source of truth |
| 倒计时跨过 0 | UI「已可重置」+ 提示用户手动 🔄 | 不自动刷避免喧宾夺主 |
| 用户改 API key 后旧 snapshot | 新 fetch 自然覆盖 | §3.4 不写失败 |
| SideNav badge 显示当前已用比例 | v1 不做；v2 评估 | YAGNI |
| 拉取历史图表 | v1 不做（你确认 current-only）；v2 评估 | §3.1 不存历史 |
| minimax quota API 频率限制 | 单 endpoint 1 次/用户点 + 并发共享 promise | §5.3 |
| 倒计时 client 时钟偏差 | v1 不修；v2 评估 | 极端场景 |
| minimax 用 session cookie 替代 API key (issue #88) | v1 不支持；401 持续按 reason 明确报错 | §8 |
| desktop notification (quota 即将用完) | v1 不做（无预算/限额）；v2 评估 | §1 决策 |
| 是否要给 renderer 推送 snapshot 变更事件 | v1 不做（用户进页面时主动 load 即可） | 简化 |

## 12. 设计原则摘要

1. **本地缓存是 source of truth for UI** — 启动就有数据可看，不等待
2. **服务端是 source of truth for 数据** — 不本地推算已用/剩余，全部来自 API
3. **失败不污染快照** — 写盘只写成功响应
4. **并发安全但不打扰用户** — `_inFlight` 单例是底层正确性，不是 UI 防抖
5. **跟现有 ai-sessions 零耦合** — 不同业务不同目录，避免边界糊
6. **复用 > 重造** — safeStorage / HttpClient / patchState / SideNav / signals / safeHandle 全部复用
7. **YAGNI** — 多 region / 多 provider / 历史趋势 / 限额 / 告警 全部 out of scope v1

## 13. 备选技术 (v2 评估, 记录)

| 决策 | 当前 | 备选 | 何时切 |
|---|---|---|---|
| Region 切换 | 写死 CN | UI region picker + 双 endpoint 探测 | 用户提需求时 |
| Provider 多选 | 只 minimax | 抽象 client registry (deepseek / 其它) | 其它 provider 有 quota API 时 |
| 历史趋势 | 不存 | 存最近 7 天快照 + 折线图 | 用户提需求时 |
| 主动告警 | 不做 | desktop notification + SideNav badge | 用户提需求时 |
| session cookie 模式 | 不支持 | 弹 webview 登录拿 cookie (issue #88) | minimax API key 永久失效时 |
| 倒计时实时刷新 | 每秒 | 30s 间隔 (精度要求不高) | 性能瓶颈时 |
| 拉取频率 | 手动 + 启动 1 次 | 自动 5min / 智能预测 (用户进 IDE 前) | 用户提需求时 |
| 双 key 区分 | API Key == Subscription Key | subscription 单独存 | minimax 强制分开时 |
