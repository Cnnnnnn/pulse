# I6 v2 — Wechat-Hot SideNav 角标清零 设计

> 日期: 2026-06-24 | 状态: 设计已批准 | 上游: `2026-06-19-product-roadmap-design.md` §13.4 wechat-hot badge

## 1. 背景

roadmap §13.4 推荐 wechat-hot badge 是 I6 v2 唯一未做的项:
> wechat-hot badge — 复用 I6 刚做的 SideNavItem badge 扩展点 + navBadges map; 需给 wechat-hot 从零补 read 概念(仿 ithome). 评分 7(预估).

**对账(2026-06-24)**:I6 v2 wechat-hot 基建 100% 已落地:
- `state.json.wechat_hot.readIds` 持久化 + `read-store.js` (loadReadIds / markItemRead)
- IPC `wechat-hot:load-read` / `wechat-hot:mark-read` + `wechat-hot:updated` 推送
- renderer `wechatHotReadIds` / `wechatHotNewIds` / `wechatHotUnreadBadge` (computed)
- SideNav 集成 `navBadges['wechat-hot']` + `sidenav-wechat-hot-badge.test.jsx`
- `bootstrapWechatHotTab` 在 view mount 时拉 readIds + diff newIds
- 单行 mark `markWechatHotRead(title)`

**唯一缺口**:`setActiveNav('wechat-hot')` 时**不清** `wechatHotNewIds`,导致角标只通过用户点行 markRead 单条消除,从未批量清零。对照:
- `setActiveNav('funds')` → `clearFundNavBadge()` (line 121)
- `setActiveNav('ai-usage')` → `clearAiUsageNavBadge()` (line 124)
- `setActiveNav('ithome')` → 调 `trackIthomeView` (角标由 view 内部 setIthomeSelectedDate / setIthomeViewMode 等触发清)
- `setActiveNav('wechat-hot')` → ❌ 无任何清零逻辑

## 2. 现状

`src/renderer/worldcup/navStore.js`:
```js
export function setActiveNav(key) {
  if (!NAV_KEYS.has(key)) return;
  const prev = activeNav.value;
  activeNav.value = key;
  if (key === "funds" && prev !== "funds") {
    trackFundView();
    clearFundNavBadge();
  }
  if (key === "ai-usage" && prev !== "ai-usage") {
    clearAiUsageNavBadge();
  }
  if (key === "ithome" && prev !== "ithome") {
    trackIthomeView();
  }
  // ❌ wechat-hot: 没清角标逻辑
}
```

**用户感知**:打开 wechat-hot tab 一次,本 session 内 wechatHotNewIds 累加的所有"新词"角标都"消失"(用户没有读,但也算"看过"),与 funds / ai-usage 行为一致。

## 3. 范围

### 3.1 做

- **`src/renderer/wechat-hot/store.js`**: 新增 `clearWechatHotUnreadBadge()` 函数:
  ```js
  export function clearWechatHotUnreadBadge() {
    wechatHotNewIds.value = {};
  }
  ```
- **`src/renderer/worldcup/navStore.js`**: `setActiveNav` 切到 `wechat-hot` 时调:
  ```js
  if (key === "wechat-hot" && prev !== "wechat-hot") {
    clearWechatHotUnreadBadge();
  }
  ```

### 3.2 不做

- ❌ 改 ithome 模式 (在 view 内部清) — 现状 ithome 是 setIthomeViewMode / setIthomeSelectedDate 触发的,不影响 wechat-hot
- ❌ 加 IPC `wechat-hot:clear-unread` — 清角标是 renderer-only 操作,不需要持久化 (wechatHotNewIds 本来就是 session 级, 重启归 0)
- ❌ SideNav 角标 UI 改动 — 已存在
- ❌ trackWechatHotView 加 recent activity — 跟 ithome / funds 不一致, YAGNI

## 4. 接口

### `clearWechatHotUnreadBadge()`

- 无参数, 无返回值
- 直接重置 `wechatHotNewIds.value = {}`
- 调用方: `setActiveNav('wechat-hot')` 时
- 不影响 `wechatHotReadIds` (持久化的已读词不动)

## 5. 验收

- `tests/renderer/nav-store-clear-wechat-hot.test.js` (新, 至少 4 case):
  - `setActiveNav('wechat-hot')` 从其他 tab 切过来 → `clearWechatHotUnreadBadge` 被调, `wechatHotNewIds.value = {}`
  - `setActiveNav('wechat-hot')` 已经在 wechat-hot (prev === 'wechat-hot') → 不重复清
  - 切到其他 tab (funds/ai-usage/ithome/versions) → 不调 `clearWechatHotUnreadBadge`
  - `wechatHotReadIds` 在清角标后保持不变 (持久化数据不动)
- 现有 `tests/renderer/sidenav-wechat-hot-badge.test.jsx` 不回归
- 现有 `tests/renderer/wechat-hot/store.test.js` 不回归
- 现有 `tests/renderer/wechat-hot-store.test.js` 不回归

## 6. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 用户进 tab 一次就算"看过",未读热点消失 | 中 | 跟 funds / ai-usage 一致行为, 用户已熟悉 |
| 误调用清空后用户期待恢复 | 低 | 刷新 wechat-hot 后 newIds 重新累加, 行为可观察 |
| wechatHotReadIds (持久化) 被误清 | 低 | 本 spec 只动 wechatHotNewIds, readIds 不变 |

## 7. 实施

2 文件改动 + 1 文件测试。预计 ~30 行 + 测试。

- `src/renderer/wechat-hot/store.js` — `clearWechatHotUnreadBadge` 函数
- `src/renderer/worldcup/navStore.js` — `setActiveNav` 切到 wechat-hot 时调用
- `tests/renderer/nav-store-clear-wechat-hot.test.js` — 新增

## 8. 后续

- 跟 I6 v2 (v2.41 已合并) 的 funds/ai-usage 行为完全对齐
- 后续若产品决定"必须读才清", 可改为 wechat-hot view 内部 markWechatHotRead 时清, 但需要重新设计 user 体验