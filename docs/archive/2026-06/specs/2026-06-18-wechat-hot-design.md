# 微信热搜栏目设计 Spec

- **日期**: 2026-06-18 (init) → 2026-06-18 (v2.24.1 替换为微博热搜)
- **作者**: Mavis (brainstorming-2)
- **状态**: v2.24.0 已发 + 立即 hotfix v2.24.1
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.x)
- **目标特性**: 在 Pulse 增加「📈 微信热搜」栏目，实时拉取最新热搜榜，用户可手动刷新，点击条目跳转到原始 URL。

> **v2.24.1 hotfix 变更 (2026-06-18)**:
> - 用户确认要的是**微博热搜**,不是微信热搜。v2.24.0 上线后才发现上游 `tenhot-api.vercel.app/api/hotsearch/wxrank` 已 404,且命名也是误传。
> - 整体替换为微博热搜:
>   - **主源**: `https://v2.xxapi.cn/api/weibohot` (返 `{code:200, data:[{index,title,hot,url}]}`)
>   - **Fallback**: `https://weibo.com/ajax/side/hotSearch` (微博官方 ajax, 返 `{ok:1, data:{realtime:[...]}}`,需 Referer/UA 头,50 条上限)
> - UI 同步: 图标 `📈` → `🔥`,label/tooltip `微信热搜` → `微博热搜`,Header 副标题 `微信指数` → `微博热搜榜`
> - IPC channel / preload / 组件命名 / SideNav key / Cmd+F 焦点 id / `open-url:open` / 15s 冷却 / 4 种 empty-state / CSS 样式全部沿用,**无需清缓存, 数据流无缝切换**
> - 完整变更见 [RELEASE-NOTES.md v2.24.1](../../../../RELEASE-NOTES.md)
> - 本 spec 文档以下章节保留为 v2.24.0 原始设计稿;实际代码以 v2.24.1 hotfix 为准

## 1. 背景

Pulse 现已有 IT 新闻 🆕 / 世界杯 🏆 / 基金管理 💰 / 贵金属 🥇 / AI 用量 📊 / 版本检查 🔄 六个栏目。用户在桌面工作时常想快速看一眼"现在在聊什么"，但每次开浏览器 → 打开微信热搜页 → 等待加载，体验割裂。

希望在 Pulse 内部新开一个「📈 微信热搜」栏目：
- 进入 tab 即拉取（**纯实时，不后台定时**，与 IT 新闻 / 基金同结构）
- 顶栏显式 ↻ 按钮供用户主动刷新
- 每行点击跳系统浏览器到原始 URL

## 2. 目标

1. 新增 SideNav 栏目 `wechat-hot`，与现有栏目并列
2. 主进程通过聚合 API 拉取微信热搜，缓存为标准化 payload
3. Renderer 端以"排名 + 标题"为主显示，前三名颜色强调；API 给出热度/标签时也展示
4. 手动刷新有 15s 冷却防滥用
5. 单测覆盖 fetcher / parser / cache / renderer store / 组件

## 3. 非目标 (YAGNI)

- ❌ 不做定时自动刷新（与"实时"诉求相悖，用户主动控制节奏）
- ❌ 不做 state.json 持久化（关 app 数据丢，符合"实时"语义）
- ❌ 不做历史热搜 / 趋势分析
- ❌ 不做收藏 / 已读标记
- ❌ 不做多源切换 UI（结构上预留 `source` 字段，UI 不暴露）
- ❌ 不做托盘入口
- ❌ 不做分享卡片
- ❌ 不做热搜详情抓取（直接跳源 URL）

## 4. UX 行为

### 4.1 SideNav 位置

按用户拍板：插入在 `ithome`（IT 新闻）之后，position = 第 2 项。

```
📰 IT 新闻
📈 微信热搜    ← 新增
🏆 世界杯
💰 基金管理
🥇 贵金属
📊 AI coding plan 用量
🔄 版本检查
```

### 4.2 顶栏（WechatHotHeader）

复用 `ithome-header` 视觉风格：

```
┌────────────────────────────────────────────────────────────┐
│  📈 微信热搜                                                 │
│  微信指数 · API: tenhot · 30 条 · 更新于 13:42                  │
│                                                            │
│  [↻ 刷新  冷却 8s]                  [搜索框……]                  │
└────────────────────────────────────────────────────────────┘
```

- 副标题区显示「API 源 / 条数 / 最后更新时间」
- 刷新按钮在冷却中：按钮文案变 `冷却 {N}s` 且 `disabled`，每秒 tick 倒计时
- 搜索框 `id="wechat-hot-search-input"`，与 Cmd+F 拦截对应

### 4.3 主体（WechatHotList）

```
┌────────────────────────────────────────────────────────────┐
│  1  微信支付上线新功能……                    12.3万  沸   │
│  2  苹果发布会定档……                          爆          │
│  3  某明星工作室声明……                      8.1万  热      │
│  4  ……                                                  热 │
│  ……                                                          │
│  30 ……                                                       │
└────────────────────────────────────────────────────────────┘
```

- 整行点击 → `api.openUrl(url)`，系统浏览器打开
- 排名数字颜色：
  - 1–3 名：🔴 / 🟡 / 🟠（用 CSS class，不依赖 emoji fallback）
  - 4–10：默认文本色
  - 11–30：浅灰
- 右侧「热度 / 标签」chip：API 给就显示，没有就隐藏（不渲染空容器）

### 4.4 空态 / 错误态

| 状态 | 显示 |
|---|---|
| 首次加载中 | "正在拉取热搜…" |
| 加载失败 + 列表空 | 错误文案 + 「重新拉取」按钮 |
| 列表空（API 返 0 条） | "暂无热搜数据" + 重新拉取按钮 |
| 列表空（搜索无结果） | "未找到「xxx」" |
| 列表非空 + 后台拉失败 | 顶部 banner 灰底 + 「重新拉取」链接，列表照常显示 |

### 4.5 状态机

```
[empty]
  │ bootstrap → refresh()
  ▼
[loading]
  │ ok           │ err
  ▼              ▼
[ready]        [error-empty]
                 │ user click ↻
                 ▼
              [loading] (冷却中则忽略 / 按钮显倒计时)
```

### 4.6 搜索

- 顶栏搜索框匹配 `title` 字段（不区分大小写、含子串）
- 搜索结果只影响展示，不影响 cache
- 搜索框清空恢复全量

## 5. 架构

### 5.1 模块边界

```
┌─────────────────────────────────────────────────┐
│  main 进程                                       │
│  ┌────────────────────────────────────────┐     │
│  │ src/main/wechat-hot/                    │     │
│  │   fetcher.js     (HttpClient + URL)       │     │
│  │   list-parser.js  (raw → standardized)    │     │
│  │   cache.js        (in-memory + guard)     │     │
│  └────────────────────────────────────────┘     │
│         ▲   safeHandle('wechat-hot:load')       │
│         │   safeHandle('wechat-hot:refresh')    │
│  ┌──────┴──────────────────────────────────┐     │
│  │ src/main/ipc/register-wechat-hot.js      │     │
│  └─────────────────────────────────────────┘     │
└─────────────────────────────────────────────────┘
                ▲ ipcRenderer.invoke
                ▼
┌─────────────────────────────────────────────────┐
│  preload.js                                      │
│  wechatHotLoad() / wechatHotRefresh()            │
│  onWechatHotUpdated(cb)                          │
└─────────────────────────────────────────────────┘
                ▲
                ▼
┌─────────────────────────────────────────────────┐
│  renderer 进程                                   │
│  ┌────────────────────────────────────────┐     │
│  │ src/renderer/wechat-hot/                │     │
│  │   store.js          (signals + bootstrap) │     │
│  │   WechatHotLayout.jsx                    │     │
│  │   WechatHotHeader.jsx                    │     │
│  │   WechatHotList.jsx                      │     │
│  │   WechatHotRow.jsx                       │     │
│  │   utils.js                               │     │
│  └────────────────────────────────────────┘     │
│  SideNav 新增 nav item: 📈 微信热搜              │
│  AppShell: nav === 'wechat-hot' → <WechatHotLayout/> │
└─────────────────────────────────────────────────┘
```

边界规则：
- `wechat-hot/*` 在 main 侧**不**导入 `electron`，通过 `register-wechat-hot.js` 作为唯一 IPC 边界
- renderer 不直接调 `fetch`，必须走 IPC
- `cache.js` 内存态，**不**写 state.json（与方案 A 对齐）

## 6. 数据契约

### 6.1 标准化 payload（main → renderer 唯一形状）

```ts
type WechatHotItem = {
  rank: number;        // 1..30
  title: string;       // 热搜标题
  url: string;         // 跳转 URL（系统浏览器打开）
  heat?: string;       // 热度值（如 "12.3万"），API 给就有
  tag?: string;        // 分类标签（API 给就有）
};

type WechatHotPayload = {
  items: WechatHotItem[];  // 按 rank 升序
  fetchedAt: number;       // epoch ms, 主进程拉取成功的时刻
  source: string;          // 'tenhot' | 'vvhan' | ... (未来可配置)
};
```

### 6.2 tenhot API（默认源）

```
GET https://tenhot-api.vercel.app/api/hotsearch/wxrank
→ {
  code: 0,
  data: {
    list: [
      {
        id: "xxxx",
        title: "微信支付上线新功能",
        url: "https://...",
        hot: { value: "12.3万", desc: "热度描述" },
        label: { name: "沸" }  // 标签
      }
    ]
  }
}
```

### 6.3 list-parser 归一化

- 顶层 `code === 0` 才算成功，否则抛 `parse_failed`
- 过滤 `title` 长度 < 1 的条目
- 按上游 API 返回顺序赋 rank = i+1（依赖 tenhot 已按热度返回，不在客户端重排）
- `hot.value` → `heat`（原样字符串），`label.name` → `tag`
- 失败时 throw 一组 reason：
  - `fetch_failed`：HTTP 4xx/5xx
  - `parse_failed`：code ≠ 0 / JSON 损坏
  - `http_timeout`：>10s

### 6.4 主进程 IPC 行为

| IPC | 行为 |
|---|---|
| `wechat-hot:load` | 同步返内存 cache；没数据时 `{ items: [], fetchedAt: 0, source: 'tenhot' }`，**不**触网 |
| `wechat-hot:refresh` | 触发 fetch（**单 in-flight** guard），成功后写 cache 并 push `'wechat-hot:updated'` 给所有 webContents；返最新 payload |

### 6.5 15s 冷却（renderer 端）

- `wechatHotLastRefreshAt` signal
- 调 `refreshWechatHot()` 时，若 `Date.now() - lastRefreshAt < 15000`，静默 return `false`
- 顶栏 `↻` 按钮处于冷却中：`disabled + 倒计时`（每秒 tick 一次，类似 AI 用量页面）

## 7. 错误边界

| 场景 | 主进程 reason | renderer 表现 |
|---|---|---|
| HTTP 200 非 JSON | `parse_failed` | 错误态 + 重新拉取 |
| HTTP 4xx/5xx | `fetch_failed` | 错误态 + 重新拉取 |
| 超时（>10s） | `http_timeout` | 错误态 + 重新拉取 |
| `code !== 0` | `parse_failed` | 错误态 + 重新拉取 |
| 列表为空 | OK 但 `items: []` | "暂无热搜" + 重新拉取 |
| IPC channel 缺失 | `ipc_unavailable` | "系统通信异常，请重启" |
| 切 tab 时 in-flight | n/a | 静默等待，不重复触发 |
| 用户连点 15s 内 | n/a | 按钮 disabled + 倒计时 |

## 8. 测试

| 文件 | 覆盖 |
|---|---|
| `tests/main/wechat-hot/list-parser.test.js` | 正常 payload；code ≠ 0；缺字段；热度字符串；tag 透传；过滤空 title；按 id 排序 |
| `tests/main/wechat-hot/fetcher.test.js` | 注入 mock HttpClient：成功路径；HTTP 4xx/5xx 抛 `fetch_failed`；超时 `http_timeout`；非 JSON 抛 `parse_failed` |
| `tests/main/wechat-hot/cache.test.js` | load 返空 payload；refresh 成功后写 cache；in-flight guard 拒绝并发 |
| `tests/renderer/wechat-hot/store.test.js` | `bootstrapWechatHotTab`；冷却 < 15s 静默；`applyPayload` 派生 signals；`onWechatHotUpdated` push |
| `tests/renderer/wechat-hot/wechat-hot-list.test.jsx` | 渲染 rank+title+url；点击调 `api.openUrl`；空态显示「重新拉取」；错误态 reason；前三名颜色 class |
| `tests/renderer/wechat-hot/wechat-hot-header.test.jsx` | 刷新按钮 disabled；冷却倒计时；时间戳 HH:mm 格式 |
| `tests/renderer/wechat-hot/wechat-hot-row.test.jsx`（如独立 row 组件） | 排名 class；热度/标签 chip 渲染/隐藏 |

## 9. 文件清单

```
新增:
  src/main/wechat-hot/fetcher.js
  src/main/wechat-hot/list-parser.js
  src/main/wechat-hot/cache.js
  src/main/ipc/register-wechat-hot.js
  src/renderer/wechat-hot/store.js
  src/renderer/wechat-hot/WechatHotLayout.jsx
  src/renderer/wechat-hot/WechatHotHeader.jsx
  src/renderer/wechat-hot/WechatHotList.jsx
  src/renderer/wechat-hot/WechatHotRow.jsx
  src/renderer/wechat-hot/utils.js
  tests/main/wechat-hot/list-parser.test.js
  tests/main/wechat-hot/fetcher.test.js
  tests/main/wechat-hot/cache.test.js
  tests/renderer/wechat-hot/store.test.js
  tests/renderer/wechat-hot/wechat-hot-list.test.jsx
  tests/renderer/wechat-hot/wechat-hot-header.test.jsx

改动:
  src/main/ipc/index.js                (注册 wechat-hot handlers)
  preload.js                            (+ wechatHotLoad + wechatHotRefresh + onWechatHotUpdated)
  src/renderer/api.js                   (包装 3 个方法)
  src/renderer/components/SideNav.jsx   (NAV_ITEMS 加 wechat-hot)
  src/renderer/components/AppShell.jsx  (nav === 'wechat-hot' → <WechatHotLayout/>)
  src/renderer/worldcup/navStore.js     (NAV_KEYS + setActiveNav 加 wechat-hot 分支)
  package.json                          (version 2.23.0 → 2.24.0)
  RELEASE-NOTES.md                      (新增 v2.24.0 段落)
  styles.css                            (+ .wechat-hot-* 样式复用 ithome-header / list)
```

## 10. 兼容性 / 回归

- 不动现有 `ithome` / `metals` / `worldcup` / `funds` / `ai-usage` 任何 signal / store / IPC
- SideNav 默认 `activeNav` 保持 `'versions'`，用户首次启动不会被新 tab "劫持"
- `Cmd+F` 拦截在 `wechat-hot` 时 focus `wechat-hot-search-input`（与现有模式一致）
- IPC channel 命名遵循 `wechat-hot:*` 与 `register-ithome.js` / `register-worldcup.js` 同风格
- 不引入新依赖（用项目已有 `HttpClient` + `preact` + `preact/signals`）
