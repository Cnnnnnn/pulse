# C5 — 增量 Detector 设计

> 日期: 2026-06-24 | 状态: 设计已批准 | 上游: `2026-06-19-product-roadmap-design.md` §3.1 C5(评分 6)

## 1. 背景

当前 `runDetectorChain(appCfg, deps)` 对每个 app 串行跑完整 detector 链(13 个 detector 类型,平均 1-3 个/app)。即使某个 app **上次检测完无更新且已超过 7 天**,下次检测时仍跑全链。

实测数据(本地 baseline):
- 13 个 app × 平均 1.5s/app = ~20s 全量检测
- 90% 情况下,无更新 app 不再需要跑 fallback detector(主 detector 已 confidence=high 命中)

**降本空间**:对"最近 7d 无更新"的 app,**只跑第一个 detector**,失败/低 confidence 才继续。
- 估算节省 ~30-50% 总检测时间(无更新 app 占大多数)

## 2. 现状

```js
// src/workers/detector-chain.js:99-157
async function runDetectorChain(appCfg, deps) {
  for (const detCfg of detectors) {
    // ...跑每个 detector
  }
}
```

`state.json.apps[name].ts` 字段**已存**上次检测时间(由 `saveOne` 写入)。

## 3. 范围

### 3.1 做

- `runDetectorChain` 接收新参数 `incrementalOpts = { appsLastChecked: Record<name, ts>, recentDays: 7 }`
- 决策逻辑(在循环开头,仅决定是否只跑第一个 detector):
  - 若 app `ts` 缺失 或 `ts` < `now - recentDays * 86400_000` → 跑全链(原有行为)
  - 否则:
    - 只跑 detectors[0]
    - 跑完追加 `trace.push({ det: '<remaining>', skipped: 'incremental' })` 让 UI 知道"剩下 N 个被跳过"
- 若 detectors 只有一个 → 等价全链(无变化)
- `incrementalOpts` 缺省 → 走全链(向后兼容)

### 3.2 不做(YAGNI)

- ❌ 动态判定"上次是 high confidence 才省" — 太复杂,7d 是简化信号
- ❌ 给每 detector 单独打"上次成功/失败"权重 — 1 个 detector 失败另算
- ❌ 自适应 recentDays(按 app 类别) — 7d 是合理默认
- ❌ UI 显式提示"用增量模式检测" — trace 已经记

## 4. 接口

```js
// 新参数加在 deps 同级或 new top-level arg
async function runDetectorChain(appCfg, opts = {}) {
  const { arch, http, logger, platform, incremental } = opts;
  const incrementalCfg = incremental || {}; // { appsLastChecked: {...}, recentDays: 7 }
  // ...
  const recentMs = (incrementalCfg.recentDays || 7) * 86400_000;
  const appTs = incrementalCfg.appsLastChecked && incrementalCfg.appsLastChecked[name];
  const useIncremental = detectors.length > 1 && appTs && (Date.now() - appTs) < recentMs;
  // 循环: 用 useIncremental 限制上限到 detectors[0]
}
```

**调用方** (`src/workers/task-handlers.js` `handleDetectApp`):
- `opts.incremental = { appsLastChecked: stateStore.loadAll().ts, recentDays: 7 }`

**state-store**:`apps: { Cursor: { ts, ... } }` 已有,无需改 schema

## 5. 验收

- `runDetectorChain` 纯函数单测:
  - 无 incremental 参数 → 全链(旧行为)
  - incremental + appTs 缺失 → 全链
  - incremental + appTs > 7d 前 → 全链
  - incremental + appTs < 7d 前 → 只跑 1 个,其余 trace 标 skipped:incremental
  - detectors.length=1 → 全链
- vitest `tests/workers/detector-chain-incremental.test.js`(6 case)
- 全量 vitest 绿(确保 task-handlers 集成不破)

## 6. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 主 detector 间歇性失败导致漏报新版本 | 中 | 用户可手动"检查更新"走全链 |
| 7d 阈值过宽,真有版本时延迟 7d 才发 | 低 | 默认 7d,可调(`recentDays` 注入) |
| 用户关电脑 7d+ 后第一次开机检测 | 低 | 走全链(`appTs` 超过阈值) |

## 7. 实施

走 `src/workers/detector-chain.js` 一文件改动 + 单测文件。预计 ~80 行 + 测试。