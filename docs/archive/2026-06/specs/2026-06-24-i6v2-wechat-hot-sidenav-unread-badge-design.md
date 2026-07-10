# I6 v2 — 微博热搜未读角标 + SideNav 联动 设计

| 日期       | 作者         | 状态     |
| ---------- | ------------ | -------- |
| 2026-06-24 | brainstorming | 设计已批准 |

> 上游:`2026-06-19-product-roadmap-design.md` §4.1 I6(内容标记已读)。
> 本 spec 是 **I6 v1 (ithome SideNav badge, v2.32.0) 的姊妹篇** — 给 wechat-hot
> 补齐同等的 read + badge 能力,把 SideNav 两个内容面板的未读体验拉齐。

## 1. 背景与目的

I6 v1 给 ithome 接上了 SideNav 未读角标,并顺手在 `SideNavItem` 留了 `badge` prop +
`SideNav.navBadges` map 这个**通用扩展点**。但 wechat-hot(微博热搜)完全没有
read 概念 —— 不像 ithome 早有 `readAt` 持久化,wechat-hot 的 `cache.js` 注释明确
写着"不写 state.json (spec §3 YAGNI)"。

本 spec 给 wechat-hot 补一套**与 ithome 对称**的 read 机制:
- 点击热搜行(打开微博) → 标记已读,行变灰
- SideNav「🔥 微博热搜」item 右上角显示未读数字胶囊
- 已读状态持久化到 state.json,重启保留

### 1.1 现状对账(代码事实)

| 能力 | ithome (v1, 已落地) | wechat-hot (本 spec 目标) |
| ---- | ------------------- | ------------------------ |
| main 端持久化 readAt | ✅ `news-store.js` markArticleRead | ❌ **缺口** (cache.js 不写盘) |
| IPC mark-read | ✅ `ithome:mark-read` | ❌ **缺口** |
| renderer readIds/newIds signal | ✅ `ithomeReadIds`/`ithomeNewIds` | ❌ **缺口** |
| 行级已读变灰 | ✅ `NewsArticleRow is-read` | ❌ **缺口** |
| computed 未读数 | ✅ `ithomeUnreadBadge` | ❌ **缺口** |
| SideNav badge 联动 | ✅ `navBadges.ithome` | ❌ **缺口** (扩展点已就绪) |

## 2. 范围(严格不超出)

### 2.1 做

- main 端新建 `read-store.js`:state.json 加 `wechat_hot.readIds`,markItemRead 纯函数 + 落盘
- `state-store.js` 加 load/save wechat_hot read 的封装 + schema 注册(PRESERVE_FIELDS)
- IPC 加 `wechat-hot:mark-read` handler + `wechat-hot:load-read` (bootstrap 拉回 readIds)
- preload 桥接 `wechatHotMarkRead` / `wechatHotLoadRead`
- renderer store 加 3 signal (`wechatHotReadIds` / `wechatHotNewIds` /
  `wechatHotUnreadBadge` computed) + applyPayload diff + markItemRead
- `WechatHotList.jsx` 点行 = 标记已读 + openExternal,已读行 `is-read` 变灰
- `SideNav.jsx` navBadges 加 `wechat-hot` 键

### 2.2 不做(YAGNI)

- ❌ 收藏 / 摘要 / 分享(ithome 有,wechat-hot 不需要)
- ❌ "全部已读"按钮
- ❌ readIds 容量上限(热搜词轮回,distinct 词数有限,不会爆)
- ❌ auto-refresh 定时拉取(现状是手动 bootstrap + Header 刷新,不改)
- ❌ ithome / 其他面板改动(本 spec 只动 wechat-hot)

## 3. 设计

### 3.1 数据层 main — `src/main/wechat-hot/read-store.js` (新建)

纯函数 + state.json 读写,仿 ithome `news-store.js` 的 markArticleRead:

```js
// state.json 结构: { ..., wechat_hot: { readIds: { "<title>": <readAt(ms)> } } }

/**
 * 从 state.json 读 wechat_hot.readIds (无则返 {})
 * @param {string} statePath
 * @returns {Record<string, number>}
 */
function loadReadIds(statePath) { ... }

/**
 * 标记一个热搜词已读 — 写 readIds[title] = now, 落盘.
 * 幂等: 重复标记只更新 readAt.
 * @param {string} title  热搜词 (diff key)
 * @param {string} statePath
 * @returns {{ ok: boolean, readIds?: object }}
 */
function markItemRead(title, statePath) { ... }
```

**diff key = `title`**:`rank` 随热度浮动不稳定;`url` 由 word 生成也可,但 `title`
是热搜词的真实身份,最直接可读。readIds 的 key 就是 title 字符串。

**持久化范围**:只存 `readIds`(已读词)。`newIds` 是 session 级,重启清零,
跟 ithome 一致,不落盘。

### 3.2 state-store 封装 + schema

`src/main/state-store.js` 加(仿现有 `loadAppSnooze`/`saveAppSnooze` 模式):

```js
function loadWechatHotRead(state) {
  return (state && state.wechat_hot && state.wechat_hot.readIds) || {};
}
function saveWechatHotRead(state, readIds) {
  return { ...state, wechat_hot: { ...(state.wechat_hot || {}), readIds } };
}
```

`src/main/state-store-schema.js` 把 `wechat_hot` 注册进 PRESERVE_FIELDS
(kind=object, 跨 saveAll 保留;子字段 `readIds` 是 object)。
**forward compat**:老 state.json 无 `wechat_hot` 字段 → load 返 {} 兼容(Q8 自愈兜底)。

### 3.3 IPC — `register-wechat-hot.js` + preload

`register-wechat-hot.js` 加 2 个 handler(仿现有 wechat-hot:load/refresh 的 safeHandle):

```js
safeHandle("wechat-hot:load-read", () => loadReadIds(STATE_PATH));
safeHandle("wechat-hot:mark-read", (_e, title) => markItemRead(title, STATE_PATH));
```

`preload.js` 桥接(紧跟现有 `wechatHotLoad`/`wechatHotRefresh`):

```js
wechatHotLoadRead: () => ipcRenderer.invoke("wechat-hot:load-read"),
wechatHotMarkRead: (title) => ipcRenderer.invoke("wechat-hot:mark-read", title),
```

### 3.4 renderer store — `src/renderer/wechat-hot/store.js`

加 3 signal + applyPayload diff + markItemRead(仿 ithome):

```js
import { signal, computed } from "@preact/signals";

export const wechatHotReadIds = signal({});
export const wechatHotNewIds = signal({});

/**
 * SideNav 未读角标 (I6 v2) — 本 session 新增且未读的热搜词数.
 * 派生自 wechatHotNewIds, 行为完全跟随:
 *   点行 (markItemRead) → -1; refresh 产生新词 → +N; 重启 → 归 0.
 */
export const wechatHotUnreadBadge = computed(
  () => Object.keys(wechatHotNewIds.value).length
);
```

**applyPayload 增强**(在现有写 `wechatHotItems` 后,加 diff):

```js
export function applyPayload(payload) {
  // ... 现有 wechatHotItems / fetchedAt / loaded 逻辑不动 ...

  // I6 v2: diff 产生 newIds — 本 session 首次出现且未读的词
  const prevIds = new Set(Object.keys(wechatHotNewIds.value));
  const newMap = { ...wechatHotNewIds.value };
  let mutated = false;
  for (const it of (payload.items || [])) {
    const title = it && it.title;
    if (title && !prevIds.has(title) && !wechatHotReadIds.value[title]) {
      newMap[title] = 1;
      mutated = true;
    }
  }
  if (mutated) wechatHotNewIds.value = newMap;
}
```

**markItemRead**(乐观更新 + fire-and-forget IPC):

```js
export async function markWechatHotRead(title) {
  if (!title) return { ok: false, reason: "invalid_args" };
  const now = Date.now();
  wechatHotReadIds.value = { ...wechatHotReadIds.value, [title]: now };
  if (wechatHotNewIds.value[title]) {
    const next = { ...wechatHotNewIds.value };
    delete next[title];
    wechatHotNewIds.value = next;
  }
  try { await api.wechatHotMarkRead(title); } catch { /* signal is source of truth */ }
  return { ok: true };
}
```

**bootstrap 增强**:bootstrapWechatHotTab 开头先拉 readIds:

```js
export async function bootstrapWechatHotTab() {
  try {
    // I6 v2: 先拉已读词, 再 load/refresh (diff 依赖 readIds)
    wechatHotReadIds.value = await api.wechatHotLoadRead();
    const cached = await api.wechatHotLoad();
    applyPayload(cached);
    // ... 现有 refresh 兜底逻辑不动 ...
```

### 3.5 行渲染 — `WechatHotList.jsx`

onClick 改成 `markWechatHotRead(title)` + `openExternal(url)`:
已读行加 `is-read` class(仿 ithome NewsArticleRow)。

需要 props 注入 `readIds` 和 `onMarkRead`:

```jsx
export function WechatHotList({ items = [], query = "", reason = "empty",
                                 readIds = {}, onMarkRead } = {}) {
  // ... 现有 filter 逻辑不动 ...
  return (
    <ul class="wechat-hot-list">
      {filtered.map((it) => {
        const isRead = !!readIds[it.title];
        return (
          <li key={it.url}>
            <button
              type="button"
              class={`wechat-hot-list-row${isRead ? " is-read" : ""}`}
              aria-label={`打开热搜：${it.title}`}
              onClick={() => {
                if (onMarkRead) onMarkRead(it.title);
                if (it.url) openExternal(it.url);
              }}
            >
              {/* rank / title / tag / heat 不变 */}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

`WechatHotLayout.jsx` 把 `wechatHotReadIds.value` 和 `markWechatHotRead`
透传给 `<WechatHotList>`。

### 3.6 SideNav 装配 — `SideNav.jsx`

navBadges 加一行(扩展点已就绪):

```js
import { ithomeUnreadBadge } from '../ithome/store.js';
import { wechatHotUnreadBadge } from '../wechat-hot/store.js';
// ...
void ithomeUnreadBadge.value;
void wechatHotUnreadBadge.value;
const navBadges = {
  ithome: ithomeUnreadBadge.value,
  'wechat-hot': wechatHotUnreadBadge.value,
};
```

CSS 的 `.side-nav-badge` 已现成(v2.32.0),无需改。

### 3.7 行级已读 CSS — `styles.css`

新增 `.wechat-hot-list-row.is-read`(仿 ithome `.ithome-row.is-read`):

```css
.wechat-hot-list-row.is-read {
  opacity: 0.5;
}
```

(已读行半透明,跟 ithome `is-read` 视觉一致;具体值实施时对齐现有 ithome 样式)

## 4. 验收

- [ ] `read-store.js` 纯函数:markItemRead 写 readIds、重复幂等、load 无字段返 {} (3 case)
- [ ] state-store load/save wechat_hot read + schema forward compat (2 case)
- [ ] renderer store: applyPayload diff 产生 newIds、markItemRead 减 newIds、
      bootstrap 拉 readIds (3 case)
- [ ] WechatHotList: 点行调 onMarkRead、已读行 is-read class (2 case)
- [ ] SideNav 集成: wechat-hot item 带 badge、ithome badge 不受影响 (1-2 case)
- [ ] 全套 vitest 绿
- [ ] 用户本地手测:
      1. 切到微博热搜, bootstrap 拉列表 → SideNav 热搜 item 右上有红数字
      2. 点开一个热搜词 → 行变灰 + badge -1
      3. 重启 → 行仍变灰(readIds 持久化), badge 归 0(newIds session 级)
      4. refresh 拉到新词 → badge 增量

## 5. 风险

| 风险 | 等级 | 缓解 |
| ---- | ---- | ---- |
| title 微变(微博加 emoji/标点)导致 diff 不准 | 低 | 热搜词本身较稳定;不准也只是 badge 数字偏差,不影响主功能(行已读/打开正常) |
| readIds 无限累积撑爆 state.json | 极低 | 热搜词轮回,实际 distinct 词数有限;必要时加 LRU cap(v2) |
| markItemRead 与 openExternal 时序 | 无 | markItemRead 乐观更新 + fire-and-forget IPC,不阻塞跳转 |
| bootstrap 先拉 readIds 再 load 增加一次 IPC 往返 | 极低 | 两个 invoke 并行即可,不串行等待 |

## 6. 与路线图对齐

- 上游候选:`2026-06-19-product-roadmap-design.md` §4.1 I6(I6 v1 已落地,本为 v2)
- §13.4 推荐下一步第 1 项
- 状态机:合入后 I6 的 wechat-hot 子项完成,Pillar 2 信息聚合 badge 体验完整
- 流程:§9 spec → plan(本 spec 已落)
