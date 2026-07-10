# I2 — 可订阅 Watchlist 设计 (Phase I2 v1)

| 日期       | 作者 | 状态     |
| ---------- | ---- | -------- |
| 2026-06-23 | brainstorming | 设计已批准,待 writing-plans |

> 本 spec 对应产品路线图 §5.4 **I2 可订阅 Watchlist**(评分 6,🟢 Next,🟤 立项中)。
> 上游文档:[2026-06-19-product-roadmap-design.md](2026-06-19-product-roadmap-design.md) §5.4 / §10.2 / §10.6.5。
>
> **v1 范围严格限定**:仅 pin **app 升级**事件。基金 / 贵金属 / 关键词 留 v2。
> 选 app 而非其他三类的原因:
> - **数据源最熟**:`runCheckQueued` 已经在事件循环里,挂点最小
> - **通知基建已有**:`electron.Notification` + `inQuietHours` / `cooldown` 已就绪
> - **用户最高频操作**:升 app 是用户每天最关心的,pin 的需求最大
>
> 基金 / 关键词 走类似模板即可,推 v2 时复用本 spec 的 schema / IPC / 抽屉骨架。

## 1. 背景与目的

目前 Pulse 已经把"哪些 app 有更新"显示在主列表里,但**用户没有"重点关注"**机制:
- 主列表每次都列 N 个 app 状态,无法区分"我天天看的 3 个"和"凑数装的 20 个"
- 升更新走"全局通知"(`runCheckQueued` 末端的 batch 通知),**关键 app 的更新被淹没在噪声里**
- 没有"上次提醒过没"的状态,每次 check 都会重新通知一次已升级的

I2 v1 解决 3 个问题:

1. **关注列表**:用户能 pin 任意已配置 app,UI 标记 ⭐
2. **独立通知通道**:pinned app 的升级单独高优先级通知(标题 `⭐ {appName} 升级`),不被 batch 噪声淹没
3. **去重**:`state.json` 记录 `lastNotifiedVersion`,**同 app 同版本只通知一次**(重启不重发)

## 2. 现状(代码基线)

通过 grep 验证(2026-06-23):
- 全仓 **无** `watchlist` / `watch_list` 命中 → 真·零基础
- 通知基建: `electron.Notification` (check-runner.js:18, schedulers.js:8) + `notification-policy.js` 已有 `inQuietHours` / `suppressedByCooldown`
- `state.json` schema: 已有 `version_history / startup_samples / daily_digest_state` 等独立字段,本次加 `watchlist`
- 主进程 check 完事件:`runCheckQueued` 返 `{results: [{name, hasUpdate, latestVersion}]}`,IPC handler 在 `register-core.js:62-90`
- 渲染端 app 列表: `src/renderer/components/AppList.jsx` 渲染 `apps` 列表,每行有 update badge

## 3. v1 范围(本次 spec 必做,严格不超出)

### 3.1 数据模型(state.json 新字段)

```json
{
  "watchlist": [
    {
      "appName": "Visual Studio Code",
      "addedAt": 1719177000000,
      "lastNotifiedVersion": "1.95.3"   // 升级后写入, 启动去重依赖此字段
    }
  ]
}
```

- `appName`:与 `config.apps[].name` **完全相等**(exact match)。若用户 rename config,旧 pin 自动失配(下次 match 时跳过,UI 提示"已下架")
- `addedAt`:排序用(Watchlist 抽屉按添加时间倒序)
- `lastNotifiedVersion`:`null` (从未通知) 或 `'X.Y.Z'`。check 时:若 `result.latestVersion === lastNotifiedVersion` → 跳过通知

### 3.2 IPC 通道(3 个, 全部走 `safeHandle`)

| channel | 入参 | 出参 | 用途 |
| --- | --- | --- | --- |
| `watchlist:list` | — | `{ ok, items: [{appName, addedAt, lastNotifiedVersion}] }` | 渲染端启动时拉 |
| `watchlist:add` | `{ appName }` | `{ ok, items }` | 加 pin |
| `watchlist:remove` | `{ appName }` | `{ ok, items }` | 去 pin |

不加 `watchlist:update` / `watchlist:clear` — 抽屉里不需要编辑,只增删。

### 3.3 主进程匹配逻辑

`runCheckQueued` 跑完拿到 `results[]` 后,**新挂一个 watchlist checker**:

```javascript
// 在 src/main/watchlist.js 新模块
function checkWatchlistUpdates({ results, watchlist, sendNotification, now }) {
  if (!Array.isArray(watchlist) || watchlist.length === 0) return { checked: 0, notified: 0 };
  const byName = new Map(results.map(r => [r.name, r]));
  let notified = 0;
  for (const w of watchlist) {
    const r = byName.get(w.appName);
    if (!r || !r.hasUpdate) continue;
    if (w.lastNotifiedVersion === r.latestVersion) continue;  // 已通知
    sendNotification({
      title: `⭐ ${w.appName} 升级`,
      body: `新版本 ${r.latestVersion}`,
    });
    w.lastNotifiedVersion = r.latestVersion;
    notified += 1;
  }
  return { checked: watchlist.length, notified };
}
```

`runCheckQueued` 末尾追加调用(改 `check-runner.js`):
- **不动** `runCheck` 既有行为(向后兼容)
- **不动** batch 通知逻辑(用户已 pin 的 app **仍出现在 batch 里**,但**会被新通知先打到**,用户感知上更醒目)
- 走 `inQuietHours` 策略:`sendNotification` 内部实现(已存在)会先过滤

### 3.4 渲染端 UI

- **App 列表项右侧**:`⭐` 按钮(空星 / 实星 toggle)。点击调 `api.watchlistAdd` / `api.watchlistRemove`
- **Header**:`⭐` 按钮,点击开 Watchlist 抽屉
  - 抽屉列表:每个 pinned app 一行,显示 `name / 最新版本 / 上次通知时间 / 去 pin 按钮`
  - 空态:"还没有 pin 的 app,点列表项右侧的 ⭐ 加一个"
- **store**:`src/renderer/watchlist/watchlist-store.js`(`signal([])`)+ `watchlistDrawerOpen`
- **preload**:`window.api.watchlistList / watchlistAdd / watchlistRemove`

### 3.5 持久化与迁移

- 旧 `state.json` 没 `watchlist` 字段 → `loadWatchlist()` 返 `[]`,不报错
- `PRESERVE_FIELDS` 加 `watchlist`(跟 `startup_samples` / `version_history` 同样套路)
- 卸载 watchlist 中所有 app(从 config 移除)→ 不自动清 pin(用户可能暂时关闭 app 检测),**抽屉加一个 "已下架" 标记**即可

## 4. v1 明确不做(留给 I2 v2)

- 基金净值 / 贵金属 / 关键词 substring 匹配 → v2,复用本 spec 的 schema / IPC / 抽屉骨架,新增 type 字段
- 全局"开启/关闭 watchlist 通知"的开关 → 复用现有 `notifications: { quiet_hours_* }` 配置
- pin 顺序拖拽 → 跟 I3 SideNav 拖拽联动,但 I3 用 localStorage,本 pin 用 state.json(避免混淆)
- 系统通知 rate-limit(cooldown by app) → v1 直接复用 batch 通知的 cooldown(已在)
- 删除全部 watchlist / 批量管理 → 抽屉逐条加,简单

## 5. 验收

- [ ] `state.json` 加 `watchlist` 字段,schema 跟 §3.1 一致
- [ ] 旧 `state.json` 没 watchlist 时 `loadWatchlist()` 返 `[]`,不报错
- [ ] 3 个 IPC handler 注册: `watchlist:list / add / remove`
- [ ] `runCheckQueued` 末尾调用 `checkWatchlistUpdates`,pinned app 新版本触发 `electron.Notification`,标题 `⭐ ${appName} 升级`
- [ ] 同一 app 同版本**只通知一次**(重启后不重发,验证:`lastNotifiedVersion` 持久化)
- [ ] `inQuietHours` 期间不通知(走 `sendNotification` 内置策略)
- [ ] 主列表 `AppList.jsx` 每行右侧加 `⭐` 按钮
- [ ] Header 加 `⭐` 按钮 → 抽屉(列 pinned app + 去 pin + 空态文案)
- [ ] 抽屉每次打开调 `api.watchlistList` refresh
- [ ] `preload.js` 暴露 `watchlistList / watchlistAdd / watchlistRemove`
- [ ] 全套 vitest 绿(新增 `tests/main/watchlist.test.js` 覆盖 checker 逻辑 + add/remove round-trip)
- [ ] 手动 smoke:app 列表点 ⭐ → 抽屉出现 → 触发 check → 通知触发 → 同版本不重发
- [ ] release notes v2.31.0

## 6. 风险

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| pinned app 被改名/卸载后,UI 仍显示但 check 不命中 | 低 | 抽屉加"已下架"标记(latestVersion=null),用户可手动去 pin |
| 通知风暴:用户 pin 10 个 app,全有更新 → 10 条通知 | 中 | `sendNotification` 已走 `inQuietHours` + batch 端 cooldown;v2 加 per-app cooldown |
| `lastNotifiedVersion` 持久化失败 → 重复通知 | 低 | `try-catch` 包 save,失败 log warn,不阻断主流程 |
| renderer ⭐ 按钮与 batch 通知的"视觉去重":用户既看到 batch 又看到 pin 通知 | 低 | pin 通知标题带 ⭐ 前缀区分,用户能识别 |
| 旧 state.json 迁移失败 | 低 | 新字段独立,缺失视为 `[]`,零迁移代码 |

## 7. 与路线图的对齐

- 上游候选:`2026-06-19-product-roadmap-design.md` §5.4 I2(评分 6)
- 状态机:本次 v1 合入后 `🟢 Next + 🟢 已合入`(从 `🟤 立项中` 升级)
- 流程纪律:§9 spec → plan → 实施,本次 v1 完整跑通
- 后续 v2:基金 / 贵金属 / 关键词 走同样模板,扩展 `watchlist` schema 加 `type` 字段

## 8. Brainstorming 决策记录

| # | 问题 | 用户选 |
|---|---|---|
| 1 | 存储位置 | A. 合并进 state.json(加 watchlist 字段) |
| 2 | v1 范围 | A. **只 pin app 升级**(基金/关键词 v2) |
| 3 | 匹配方式 | A. app name 用 exact match,keyword 用 substring |
| 4 | 触发点 | A. 实时(check 完立即匹配) |
| 5 | UI 入口 | A. app 列表项右侧加 ⭐ Pin 按钮 |
| 6 | 重复通知 | A. 同 app 同一版本只通知一次 |
| 7 | SideNav 行为 | A. SideNav 不动,Header 加 ⭐ Watchlist 抽屉 |
| 8 | 实施节奏 | A. spec → plan → 实施,完整跑通(今天) |

**额外发现(不在 8 选):**

- v1 严格限定 app 升级,基金 / 关键词 / 贵金属 / 关键词 substring 都留 v2(同 spec 模板,扩 type 字段即可)
- 通知基建(`electron.Notification` + `inQuietHours` / cooldown)已就绪,v1 不引入新基建
- `state.json` 已有 `PRESERVE_FIELDS` 套路,直接复用
- 主进程 check 挂点最小:`runCheckQueued` 末尾追加 `checkWatchlistUpdates(results)`,不动既有 batch 通知
- 跟 I3 SideNav 拖拽**没有代码冲突**(I3 用 localStorage,本 pin 用 state.json,刻意的"关注列表"用持久化)