# Pulse C2 等下次再升调度 (2026-06-21)

| 日期       | 作者         | 状态     |
| ---------- | ------------ | -------- |
| 2026-06-21 | brainstorming | 设计中   |

## 1. 背景与目的

Pulse 检测到有可用更新后,只能立刻升 — 这对 "正在开会" / "这台机器现在不能中断" / "刚升完需要观察一下" 的用户不友好。Roadmap `2026-06-19-product-roadmap-design.md §3.1 C2`(价值 3 / 成本 2 / 风险 1,总分 7):

> "等下次再升"调度(今晚 / 周末 / 跳过此版本)

目标:让用户在 app 行上一键延后升级,同时不丢失"等会儿提醒"。

## 2. 范围与非范围

### 范围内

1. **Per-app snooze**:每个 app 独立的 `snoozeUntil`(epoch ms)和 `skippedVersion`(string)字段,写到 `state.json.app[name]`
2. **SnoozeMenu 组件**:在 AppRow 已有 "..." 菜单中新增 4 个预设选项 — 今晚 22:00 / 明早 9:00 / 本周末(周六 10:00)/ 跳过此版本
3. **取消按钮**:app 当前已 snooze 时,菜单显示 "已延后到 X / 取消跳过"
4. **检测输出抑制**:`result-builder.js` 检测时若 app 处于 snooze 状态,把 `has_update` 设为 false 但保留 `latest_version`(用户仍能看到 "有更新但已跳过")
5. **Badge 抑制**:tray 端的 update badge 也跳过 snoozed app
6. **自动重置**:`skippedVersion` 在用户手动升级该 app 后自动清除(检测时 latest_version 变了就清)
7. **State helper**:`setAppSnooze(name, {until?, version?})` + `clearAppSnooze(name)` + `isAppSnoozed(state, name, now)`

### 非范围(留给后续)

- 自定义日期 / 时间 — YAGNI,4 个预设覆盖 90% 用例
- 全局 "暂停检测 N 小时" — YAGNI,per-app 已足够
- snooze 期满后自动升级 — YAGNI,snooze 是"不打扰",不是"自动执行"
- snooze 历史 / 审计 — YAGNI
- Snooze 跨设备同步 — 非 Pulse 范畴

## 3. 数据格式

`state.json.app[name]` 新增字段:

```json
{
  "Cursor": {
    "name": "Cursor",
    "installed_version": "3.6.32",
    "latest_version": "3.6.33",
    "has_update": true,
    "...": "...",
    "snoozeUntil": 1750513200000,    // 可选,epoch ms,到期自动失效
    "skippedVersion": "3.6.33"      // 可选,同版本不提示,升级后自动清
  }
}
```

## 4. 4 个预设时间计算

```js
function presetTime(preset, now = Date.now()) {
  const d = new Date(now);
  switch (preset) {
    case 'tonight':    // 今晚 22:00
      d.setHours(22, 0, 0, 0);
      return d.getTime();
    case 'tomorrow':   // 明早 9:00
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    case 'weekend':    // 本周六 10:00(若今天已是周六则下周六)
      const day = d.getDay(); // 0=Sun, 6=Sat
      const delta = (6 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      d.setHours(10, 0, 0, 0);
      return d.getTime();
    case 'skip-version': // 不设 until,只存 skippedVersion
      return null;
  }
}
```

**校验**:若 `presetTime` 返回的 epoch 已过去,自动 +1 天(避免"今晚 22:00"对 23:00 用户失效)。

## 5. 架构与文件结构

**新增**:
- `src/main/snooze.js` — pure helper: `presetTime` / `isAppSnoozed(state, name, now)` / `applySnoozeFilter(results, state, now)`
- `src/renderer/components/SnoozeMenu.jsx` — Preact 组件,4 选项 + 取消
- `tests/main/snooze.test.js` — 10+ tests
- `tests/renderer/SnoozeMenu.test.jsx` — 5+ tests

**修改**:
- `src/main/state-store.js` — `setAppSnooze(name, {until?, version?})` / `clearAppSnooze(name)` / `loadAppSnooze(name)`
- `src/main/state-store-schema.js` — `app` 字段 spec 增加 `snoozeUntil`(number)和 `skippedVersion`(string)子字段
- `src/workers/detector-chain.js` — 检测完成后,若 app 在 state.app[name].skippedVersion 匹配,自动清除
- `src/workers/result-builder.js` — 输出 result 时检查 snooze,把 has_update 设为 false 但保留 latest_version
- `src/main/check-runner.js` — tray badge 计算跳过 snoozed app
- `src/renderer/components/AppRow.jsx` — 在 "..." 菜单中挂 SnoozeMenu
- `src/renderer/api.js` + `preload.js` — 新方法 `setAppSnooze` / `clearAppSnooze`
- `src/main/ipc/register-core.js` — 2 新 IPC handler
- `src/renderer/store/check-store.js`(或类似) — snooze state signal(可选,直接读 state 即可)
- `styles.css` — `.snooze-menu` styles(与 MuteMenu 同款下拉)
- `RELEASE-NOTES.md` — 新 section

## 6. 数据流

### 设置 snooze

```
User clicks "..." → SnoozeMenu opens
  → User picks "今晚 22:00"
  → SnoozeMenu calls api.setAppSnooze(name, {until: presetTime('tonight')})
  → IPC 'snooze:set' → main handler
  → stateStore.setAppSnooze(name, {until})  // writes to state.json.app[name].snoozeUntil
  → SnoozeMenu refreshes, shows "已延后到 06-21 22:00"
  → AppRow shows subtle "已延后" badge (subtle, not intrusive)
```

### 跳过版本

```
User picks "跳过此版本"
  → SnoozeMenu calls api.setAppSnooze(name, {version: latestVersion})
  → IPC 'snooze:set' → stateStore.setAppSnooze(name, {version})
  → state.json.app[name].skippedVersion = latestVersion
  → Next detection: detector-chain.js sees skippedVersion match → clears it ONLY if version changed
```

### 检测输出抑制

```
runCheckQueued(results) returns results[]
  → result-builder builds the final result objects
  → for each result: if state.app[name].snoozeUntil > now OR skippedVersion == latestVersion
    → has_update = false (in the OUTPUT, not in state.json)
    → latest_version preserved
    → Add `snoozed: true, snoozeReason: 'until' | 'version'` to result for UI
  → tray badge count: skip snoozed apps
```

### 自动清除 skippedVersion

```
saveAll(results) writes new state.app[name]
  → for each result: if existing.skippedVersion && existing.skippedVersion !== new.latest_version
    → delete new.skippedVersion  (user upgraded past the skipped version)
  → if existing.skippedVersion === new.latest_version → keep (user skipped this version)
```

## 7. IPC 接口

| Channel                | Direction       | Payload                  | Response              |
| ---------------------- | --------------- | ------------------------ | --------------------- |
| `snooze:set`           | renderer → main | `{name, until?, version?}` | `{ok, name}`        |
| `snooze:clear`         | renderer → main | `{name}`                  | `{ok, name}`         |

**preload**:
```js
setAppSnooze: (name, opts) => ipcRenderer.invoke("snooze:set", name, opts),
clearAppSnooze: (name) => ipcRenderer.invoke("snooze:clear", name),
```

## 8. SnoozeMenu UI

```
┌──────────────────────────┐
│ 等下次再升                │
├──────────────────────────┤
│ ⏰ 今晚 22:00            │
│ ☀️ 明早 9:00             │
│ 📅 本周六 10:00           │
│ ⊘ 跳过此版本 (3.6.33)    │
├──────────────────────────┤
│ 已延后到 06-21 22:00 [取消]│  ← 仅当 snoozeUntil > now
│ 跳过版本 3.6.33       [取消]│  ← 仅当 skippedVersion 存在
└──────────────────────────┘
```

**风格**:复用 `.menu-popup` / `.menu-item` 类(MuteMenu 已有),新增 `.snooze-menu` wrapper 区分。

## 9. 错误处理

| 场景                          | 行为                                        |
| ----------------------------- | ------------------------------------------- |
| setAppSnooze IPC 失败         | UI 回退到显示旧状态 + toast "保存失败"     |
| state.json 写失败              | log warn + 在 UI 显示红色 "延后失败"       |
| snoozeUntil 已过期             | helper 函数返 false,UI 显示 "已过期,重新选择" |
| latest_version 为空(skippedVersion 比对) | 跳过版本抑制(无 version 不能 skip） |

## 10. 测试

### 单元测试

- `snooze.test.js` (10+ cases)
  - presetTime(tonight) returns today 22:00
  - presetTime(tomorrow) returns tomorrow 9:00
  - presetTime(weekend) returns Saturday 10:00(若今天周六则下周六)
  - presetTime(skip-version) returns null
  - presetTime 过去时间 fallback(+1 天)
  - isAppSnoozed: snoozeUntil 未来 → true
  - isAppSnoozed: snoozeUntil 过去 → false
  - isAppSnoozed: skippedVersion match → true
  - applySnoozeFilter: snoozed apps have has_update=false 但 latest_version 保留
  - applySnoozeFilter: 多个 snoozed apps + non-snoozed 都正确处理
  - applySnoozeFilter: 失败 case(没有 latest_version 不影响)

- `SnoozeMenu.test.jsx` (5+ cases)
  - 渲染 4 个预设选项
  - 点 "今晚 22:00" → 调 api.setAppSnooze(name, {until: ...})
  - 点 "跳过此版本" → 调 api.setAppSnooze(name, {version: ...})
  - 已 snooze 时显示 "已延后到 X" + 取消按钮
  - 取消按钮调 api.clearAppSnooze

## 11. 文件清单

**新增** (3):
- `src/main/snooze.js` (~80 行)
- `src/renderer/components/SnoozeMenu.jsx` (~120 行)
- 2 个测试文件

**修改** (~9):
- `src/main/state-store.js` (+3 functions)
- `src/main/state-store-schema.js` (+2 子字段描述)
- `src/workers/detector-chain.js` (skippedVersion 自动清除)
- `src/workers/result-builder.js` (snooze 输出过滤)
- `src/main/check-runner.js` (badge 跳过 snoozed)
- `src/renderer/components/AppRow.jsx` (挂 SnoozeMenu)
- `src/main/ipc/register-core.js` (+2 safeHandle)
- `preload.js` (+2 method)
- `src/renderer/api.js` (+2 wrapper)
- `styles.css` (+~30 行)

## 12. 风险与缓解

| 风险                                | 缓解                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| snooze 让用户错过重要安全更新      | 默认 22:00 / 9:00 / 周六都是 24h 内会到期;UI 仍显示 latest_version 但有"snoozed"标记 |
| "跳过此版本" 用户忘了一直不升      | skippedVersion 自动在版本变更时清除(用户升了别的就重置) |
| snoozeUntil 写盘后进程崩溃         | patchState 走 atomic write(已有机制),崩了重新 load 还是没设 |
| 已 snooze app 仍触发 IPC notify     | check-runner 在 tray badge 计算前过滤(本任务实现)        |

## 13. Self-Review

1. **范围**:per-app row menu + 4 presets + 跳过版本 + 取消 — 不大,实现路径清晰。
2. **占位符**:无。
3. **内部一致性**:`snoozeUntil` (epoch ms) vs `skippedVersion` (string) — 两个不同维度,清楚。
4. **歧义**:"今晚 22:00" 用户跨午夜的 case 由 `setHours` 自然处理(若现在 23:00,今天 22:00 已过,fallback +1 天到明晚 22:00)。
5. **迁移**:`snoozeUntil` / `skippedVersion` 都是可选字段,旧 state.json 兼容。

## 14. Handoff

Spec 完成后 → writing-plans → subagent-driven。
