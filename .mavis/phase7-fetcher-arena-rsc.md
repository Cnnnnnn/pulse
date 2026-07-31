# Phase 7 — fetcher-arena 走 arena.ai 官方 RSC

**状态**: 草案待 user 拍板
**前置**: Phase 6 收尾 (commit b8c860a) — tests/ 全量 .ts/tsx
**预估**: 4-6h
**分支**: 同 main, 单 PR

---

## TL;DR

把 `src/main/ai-leaderboard/fetcher-arena.ts` 从 `api.wulong.dev` 镜像迁到 `arena.ai/leaderboard` 官方 RSC 数据。**一次性收益**: webdev 132 entries (`code` 101 + `image-to-code` 31)、总数据 758 entries vs 现 394、字段 18 vs 6 (含 license/price/context/releaseType)。**单一来源**砍掉 wulong 镜像老/少字段问题。

**核心决策**（必须 user 拍板）：

1. **是否砍 wulong 完全回退**？  
   现链 `wulong` 主 → `oolong-tea-2026/arena-ai-leaderboards GitHub raw` 回退。  
   方案 A: 砍掉回退，只走 arena.ai（极简，但 arena 改 SSR 方式即断）  
   方案 B: arena 主 → wulong 回退（保守，保持现有缓存兼容）  
   方案 C: wulong 专抓它独有的 `agent` board（10 entries），其余走 arena（合并方案）  
   **推荐 C**：最大化覆盖 + 解耦两个源 + 不丢 `agent` 数据。

2. **默认 board 数量 5 → ?**  
   现 `BOARDS = ["text","vision","code","text-to-image","text-to-video"]`。  
   arena 11 board: text / vision / code (webdev) / text-to-image / image-edit / text-to-video / image-to-video / document / search / image-to-code (webdev img) / video-to-video。  
   选项:  
   - **A. 默认仍 5**（保持行为）：老用户视角/排序不变，只是数据更全/字段更多。**推荐**  
   - B. 默认 11：每个 board 都开。数据 ×3，但首次 load 时间 + tab UI 复杂度 ↑↑。  
   - C. 默认 5 + arena 独有 6 标 opt-in：新 board 走 `sources.arena.webdev=true` 才显示。

3. **新字段映射**（arena 18 → 现有 schema）  
   `rating` → score；`modelOrganization` → vendor (走 `VENDOR_ALIASES`)；`modelDisplayName` → name；  
   `rankUpper/Lower` → 派生 ci (upper-lower)；`votes` → votes；`license` → license；  
   新增（**全部可选，灰度上**）: `modelUrl`、`inputPricePerMillion/outputPricePerMillion/contextLength`、`pricePerImage/pricePerSecond/releaseType`、`ratingUpper/ratingLower`。  
   **建议先 1 期只映射原有 6 字段**，新字段预留切片位（如 `m.arena[board].prices/context/url`）二期上线。

---

## 实施步骤

### 1. RSC payload 解析器 — `src/main/ai-leaderboard/arena-rsc-parser.ts` (新建, 80 行)

ponytail: 不引 cheerio/jsdom — arena HTML 5MB 不需 DOM 树, RSC 自闭合 + JSON-friendly 字符串。

```ts
// 抓 https://arena.ai/leaderboard, 用正则抓 self.__next_f.push([1,"..."]) blocks
// 拼接所有 block, brace match 抽 "leaderboards":[...] 和 "initialModels":[...]
// 输出标准 JSON. fallback 用 wulong mirror.
```

输出 shape: `{ leaderboards: Leaderboard[], models: Model[] }`

- 测试: `tests/ai-leaderboard/arena-rsc-parser.test.ts` snapshot 真实 HTML（5MB fixture 进 `tests/fixtures/arena-rsc-page.html`）

### 2. fetcher-arena.ts 重写（核心 ~180 行 → 300 行）

```diff
-const ARENA_BASE = "https://api.wulong.dev/arena-ai-leaderboards/v1/leaderboard";
-const ARENA_GITHUB_RAW = "https://raw.githubusercontent.com/oolong-tea-2026/arena-ai-leaderboards/main";
+const ARENA_OFFICIAL = "https://arena.ai/leaderboard";  // RSC
+// 回退仅保留 wulong 的 agent board (10 entries, arena 没有)
+const WLONG_AGENT = "https://api.wulong.dev/arena-ai-leaderboards/v1/leaderboard?name=agent";

-const BOARDS = ["text", "vision", "code", "text-to-image", "text-to-video"];
+const BOARDS = ["text", "vision", "code", "text-to-image", "text-to-video", "image-edit",
+                "image-to-video", "document", "search", "image-to-code", "video-to-video"];
+// 默认 5 (text/vision/code/text-to-image/text-to-video) 保持用户感知不变
+// 6 个新 board opt-in, 走 sources.arena.extra 字段 (见 §3)
```

### 3. types.ts 扩展（types.ts +5 行）

加 `arenaRscBoard` 切片 (新字段名，**不污染**原有 5 字段)：

```ts
interface ArenaRscBoard {
  rank: number;
  score: number;       // = rating
  ci: number;          // = rankUpper - rankLower 派生
  votes: number;
  // 新字段二期上:
  url?: string;
  prices?: { input?: number; output?: number; perImage?: number; perSecond?: number };
  contextLength?: number;
  releaseType?: string | null;
  ratingUpper?: number;
  ratingLower?: number;
}
```

`m.arena[board]` 用现有 `{rank, score, ci, votes}` — **新字段预留但本期不消费**。  
Renderer 现有 6 个文件 (aiLeaderboardStore/ModelRow/ArenaBoardBars/LeaderboardTable/LeaderboardFilterBar/TopPodium/AiLeaderboardPage/exportMarkdown/format) **零改动** — 因 board schema 没变。

### 4. aggregator.ts（零行为改动）

`aggregator.ts:150-174` 调 `arenaFetcher.normalize` — schema 不变 (m.arena[b]={rank,score,ci,votes})，aggregator 不知道数据来自 wulong 还是 arena。  
`history.ts:21-109` 缓存落盘 `{boards:{[b]:payload}}` — payload 字段名不变 (rank/score/ci/votes) — history 也零改。

**关键检查**: `ranking.ts:34-37` 走 `item.arena[board].score` — 字段名保留，无需改。

### 5. 测试 (tests/ai-leaderboard/)

- **新** `arena-rsc-parser.test.ts` — 抓 fixture HTML 解析 → snapshot
- **改** `main.test.ts:223-242,297-305` — mock URL 从 `api.wulong.dev` → `arena.ai/leaderboard`；mock payload 改 arena schema (18 字段)
- **改** `main.test.ts:525-533` — `arenaFetcher.normalize` 输入从 wulong shape 改 arena shape
- **新** `fetcher-arena-arena-rsc.test.ts` — 端到端：RSC parse → normalize → AiModel[] → 验证 schema

### 6. Renderer 改动（**最小**）

如果走 "默认 5 board 不变" 决策：**0 行改**。  
Renderer 现有 `ARENA_BOARDS = 5 个` 不动。

如果走 "默认开新 board" 决策：`src/renderer/ai-leaderboard/types.ts:88-96` `ARENA_BOARDS` 加 6 项 + `ARENA_BOARD_KEYS` 加 6 个；  
`AiLeaderboardPage.tsx:178` boardLabel 渲染不需改（已 iterate）；  
`LeaderboardFilterBar.tsx:22,83-87` 自动渲染新增 chip（已 iterate）。  
但 + 6 chip 截图需更新 visual baseline（.mavis/skill 提一下）。

### 7. AGENTS.md 更新

数据源表 `fetcher-arena.ts` 行加备注："v2.80 起走 arena.ai 官方 RSC，wulong 仅回退 `agent` board"。  
"视角 tab" 节可加 "WebDev" 段（如果 §3 决策 B/C 开）。

---

## 风险

| 风险 | 缓解 |
|---|---|
| arena.ai 改 SSR 方式 (RSC inline → client fetch) | 回退链 → wulong 镜像 (单一 board 模式) |
| arena.ai HTML 5MB 体积大 | fetchJson 8s timeout + 24h TTL 缓存 (现成) |
| 11 board 一次抓太慢 | 仍 Promise.all 并发 (现 fetch() 范式) |
| modelKey 跨 board 不同 (`claude-fable-5-v2-image-to-webdev` vs `claude-fable-5-v2-text`) | 用 `modelDisplayName` (去掉 board 后缀) 当 dedup key，不是 modelKey |
| RSC 解析正则 fragile | 单测覆盖真实 HTML (fixture 进 git) + 解析失败时整链 fallback 到 wulong 整 mirror |
| 默认 board 5 → 11 老用户行为变 | 选 A (默认不变) 即避免；选 B/C 需 release notes v2.80 标注 |

---

## 验收

1. `npm test` 4869+ tests pass（新增 RSC parser 测 ≥ 5 case）
2. `npm run typecheck` 5/5 pass
3. 真实跑一次 `fetcher-arena.fetch()` → 11 board entry 数 ≥ 700 (现 wulong 394)
4. `image-to-code` board 至少有 MiniMax-M3 (rank #16, 1481 ELO) → 在 Arena 视角切到 webdev tab 能看到
5. 24h TTL 缓存复用，第二次 fetch < 1s
6. wulong 回退 (agent board) 至少 10 entries

---

## 文件清单

| 文件 | 动作 | 行数预估 |
|---|---|---|
| `src/main/ai-leaderboard/arena-rsc-parser.ts` | **新增** | +80 |
| `src/main/ai-leaderboard/fetcher-arena.ts` | **重写** | 230 → 300 |
| `src/main/ai-leaderboard/types.ts` | 改 (加 ArenaRscBoard interface) | +10 |
| `tests/ai-leaderboard/arena-rsc-parser.test.ts` | **新增** | +60 |
| `tests/ai-leaderboard/fetcher-arena-arena-rsc.test.ts` | **新增** | +80 |
| `tests/ai-leaderboard/main.test.ts` | 改 mock | ~10 行 |
| `tests/fixtures/arena-rsc-page.html` | **新增** (snapshot) | ~5MB |
| `src/renderer/ai-leaderboard/types.ts` | 改 (如选 B/C) | +6 行 |
| `AGENTS.md` | 改 | +5 行 |
| `RELEASE-NOTES.md` | 加 v2.80 节 | +10 行 |

合计 ~6 文件, +200/-50 行 (重写 fetcher-arena 是净增)

---

## TODO (待 user 拍板)

- [ ] 决策 1: wulong 回退方案 — A (砍掉) / B (arena→wulong) / C (C = wulong 只抓 agent) **推荐 C**
- [ ] 决策 2: 默认 board 数量 — A (5 不变) / B (11 全开) / C (5+6 opt-in) **推荐 A**
- [ ] 决策 3: 新字段 (price/context/url/releaseType) 本期是否上 — **建议二期**
- [ ] 决策 4: 是否需要先跑一次 `curl -sSL https://arena.ai/leaderboard -o tests/fixtures/arena-rsc-page.html` 验当前 HTML 仍 RSC inline (距 .mavis/arena-analysis 文档 1 天)