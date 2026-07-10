# 数据库换型评估: state.json → SQLite

**评估日期**: 2026-06-13
**评估人**: AI assistant
**结论**: **当前不迁移 SQLite**. 维持 state.json, 大集合字段拆独立文件作为未来备选.

---

## 1. 当前状态 (实测)

state.json 实际大小: **53 KB** (路径: `~/Library/Application Support/AppUpdateChecker/state.json`)

### 1.1 字段占用分布

| 字段 | 大小 | 类型 | 备注 |
|---|---|---|---|
| `apps` | 24 KB | object | 11 个 app, 含 changelog_history |
| `recentActivity` | 18 KB | array | 184 条, **已有 cap (默认 200, 上限 1000)** |
| `worldcup_txt` | 8 KB | object | Football.TXT 缓存 |
| `task_summaries` | 1.8 KB | object | 3 条 AI 总结 |
| `last_opened` | 0.6 KB | object | 11 个 app |
| `ai_sessions_config` | 0.1 KB | object | provider/model |
| `mutes` / `ts` / `active_category` / `v` | < 0.1 KB | mixed | |

### 1.2 增长分析 (基于代码常量)

| 字段 | 是否有界 | 1 年估算 |
|---|---|---|
| `apps.changelog_history` | ✅ 每 app cap 10 条 | ~5 KB |
| `recentActivity` | ✅ cap 200-1000 条 (FIFO) | ~50-100 KB |
| `ithome_news.articles` | ✅ **按自然月 prune** (月外全删) | ~3-5 MB (高峰期) |
| `ithome_news.dayStats` | ✅ 自然月 prune | ~3 KB |
| `funds.dailySnapshots` | ✅ cap 400 天 (`MAX_SNAPSHOT_DAYS`) | ~50 KB |
| `worldcup_match_insights` | ✅ 按 fixture 集大小有界 | ~10 KB |

### 1.3 真正"无界增长"的字段

**无**. 所有集合字段都已有 cap:
- `recentActivity`: cap 200-1000 (FIFO)
- `ithome_news.articles`: 按自然月 prune
- `funds.dailySnapshots`: cap 400 天
- `apps.changelog_history`: 每 app cap 10 条

**理论上限**: state.json 最大约 10-15 MB (所有字段同时拉满). 实际场景下长期运行在 1-5 MB 区间.

---

## 2. 风险评估

| 维度 | 53 KB | 1 MB | 10 MB | 50 MB |
|---|---|---|---|---|
| JSON.parse 耗时 | < 1ms | ~5ms | ~50ms | ~300ms |
| 原子写 (tmp+rename) | < 5ms | ~10ms | ~100ms | ~500ms |
| `load()` 全量读 (每次 save 都做) | ✅ | ✅ | ⚠️ 感知卡顿 | ❌ 严重卡顿 |
| `preserveExtraFields` 全量拷贝 | ✅ | ✅ | ⚠️ | ❌ |

**结论**: 当前 53 KB, 离 SQLite 划算的阈值 (典型 >10 MB) **差 200 倍**.

---

## 3. 推荐方案 (按 ROI 排序)

### 方案 A: 维持现状 + 加 1 个 cap (推荐, 立即做)

**改动**: `funds.dailySnapshots` 加 cap (保留最近 365 天), 跟 `ithome_news` 一致.

**成本**: ~20 行代码 + 测试.
**收益**: 彻底消除最后一个无界字段.

### 方案 B: 大集合字段拆独立文件 (中期, 文件超 1 MB 时做)

**思路**: 元数据 (apps/mutes/last_opened/active_category) 留 state.json; 大集合 (`ithome_news`/`recentActivity`/`funds.dailySnapshots`/`worldcup_match_insights`) 各自一个独立 JSON.

**收益**:
- 写 `apps` 不会触发几十 MB IT 新闻数据的 read+parse+write
- 改动局部化 (每个 store 加 ~30 行)
- 仍全 JSON, 零新依赖, 零数据迁移

**成本**: ~1 天工作量, 影响约 5 个 store 模块.

### 方案 C: 迁移 SQLite (长期, 不推荐当前做)

**触发条件** (满足任一):
- state.json (或其拆分后任一文件) 超过 50 MB
- 出现可观测的 save 卡顿 (>100ms)
- 需要跨字段事务/复杂查询 (当前没有这种需求)

**代价**:
- 引入 `node:sqlite` (Electron 35+ 已支持, 需 `--experimental-sqlite` flag, 项目已开) 或 `better-sqlite3` (需 rebuild)
- 15-20 个 store 模块重写
- 老 state.json → 各表的数据迁移脚本
- 1-2 周工作量

---

## 4. 决策

**采纳方案 A** (现状即正确 — 代码 review 后确认所有集合字段都已有 cap, 不需要改动).
**方案 B 备选** (未来文件超 1 MB 时启动, 把大集合拆独立文件).
**方案 C 暂缓** (除非方案 B 也不够用; 触发条件见 §3).

## 5. 后续监控建议

- 在 `RELEASE-NOTES.md` 或 CI 里加一个 size 检查: 启动时若 `state.json > 5 MB`, 写一条 warn 日志 (用已有的 `mainLog`).
- 触发方案 B 的阈值: 用户 state.json 实际 > 1 MB (持续超过 1 周).
- 触发方案 C 的阈值: 单字段文件 > 50 MB, 或 save 卡顿可观测.
