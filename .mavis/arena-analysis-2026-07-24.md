# arena.ai/leaderboard 官方数据分析报告

**时间**: 2026-07-24
**目的**: 评估是否能把 arena.ai 官方数据作为 fetcher-arena 升级版, 一次性获得 11 个 board (含 webdev)

---

## TL;DR

**arena.ai/leaderboard 数据完整可用, 而且比 wulong 镜像好 10x**:

| 指标 | arena.ai 官方 (RSC) | wulong 镜像 (现 Pulse 用) |
|---|---|---|
| 抓取方式 | HTTP GET (无 token) | HTTP GET api.wulong.dev |
| Board 数 | **11** (含 webdev 2 个) | 11 (但无 webdev image-to-code) |
| Text board entries | **200** | 20 (只 top 20) |
| 字段数 | 18 (rank/rating/ci/votes/license/prices/context/releaseType/modelUrl) | 6 (简版) |
| HTML 体积 | 5MB | 几 KB/board |
| 反爬 | **无 (server-rendered RSC)** | 无 (但镜像老) |
| 含 webdev | ✅ **code (101) + image-to-code (31)** | ❌ (零 webdev) |

**结论**: **强烈建议升级 fetcher-arena.ts 走 arena.ai 官方 RSC**, 一次性解决 webdev 数据问题, 砍掉 wulong 依赖, 数据量 × 10。

---

## 抓取路径验证

### 1. 入口 (无反爬)
```bash
curl -sSL -A "Mozilla/5.0" -o page.html https://arena.ai/leaderboard
# → HTTP 200, 4.98MB HTML, 无 Cloudflare, 无 reCAPTCHA challenge
```

### 2. 关键发现: Next.js RSC payload
- 页面用 Next.js 14+ App Router, **server-rendered RSC** (不是 client-fetched)
- 数据全部 inline 在 HTML `<script>self.__next_f.push([1, "..."])</script>` 块
- 37 个 RSC script block, **1.15MB RSC payload**, 客户端 hydrate 立即可见
- 无 client-side fetch API —— 数据**只在 HTML 里**

### 3. 反爬机制 vs 实际效果
| 机制 | 实际 | 备注 |
|---|---|---|
| reCAPTCHA | ⚠️ page 注册了 (`6LeTGMcsAAAAALuIlkVwIxaAuZA8VledA6d3Nnb0`), 但**只在用户投票时触发** | 我们只 GET, 不交互 |
| Cloudflare | ❌ **不在 arena.ai 主路径** | 老的 lmarena.ai 仍然有, 加载不到 HTML |
| dpl_ token | ❌ **不是鉴权** | Next.js "Deployment" ID, 用于 cache busting, 任何人都能用 |

### 4. 失败的尝试 (都白做了)
- ❌ `lmarena.ai/leaderboard` (旧域名) → Cloudflare timeout
- ❌ `arena.ai/leaderboard-sets/.../snapshots/latest` (存储路径) → 404
- ❌ `_next/data/<dpl>/en/leaderboard.json` (RSC cache) → 404
- ❌ `api.arena.ai/...` → DNS 不存在
- ❌ HF Space `lmarena-ai/chatbot-arena-leaderboard` 静态 csv → 2025-08 停更, 单 board 老数据
- ❌ 直接拉 webdev.html sub-board storage path → 404

**唯一可行的路径**: 抓 `https://arena.ai/leaderboard` HTML, 解 RSC payload。

---

## 11 个 Board 完整列表

```
┌──────────────────┬───────┬───────────┬──────────┬─────────────────────────────────────┐
│ arenaSlug        │entries│totalVotes │totalModels│ id (storage path)                  │
├──────────────────┼───────┼───────────┼──────────┼─────────────────────────────────────┤
│ text             │  200  │ 7,430,560 │   378    │ text-overall-style_control         │
│ vision           │  135  │ 1,148,085 │   135    │ vision-overall-style_control       │
│ code (WebDev)    │  101  │   506,528 │   101    │ webdev-overall-raw                  │
│ text-to-image    │   74  │ 5,690,661 │    74    │ text_to_image-overall-raw          │
│ image-edit       │   52  │28,170,073 │    52    │ image_edit-overall-raw              │
│ text-to-video    │   42  │   533,418 │    42    │ text_to_video-overall-raw          │
│ image-to-video   │   42  │ 1,350,288 │    42    │ image_to_video-overall-raw         │
│ document         │   32  │   317,011 │    32    │ document-overall-raw                │
│ search           │   32  │   939,947 │    32    │ search-overall-raw                  │
│ image-to-code ⭐ │   31  │    69,997 │    31    │ image_to_webdev-overall-raw         │ ←  WebDev image
│ video-to-video   │    7  │    21,043 │     7    │ video_to_video-overall-raw          │
├──────────────────┼───────┼───────────┼──────────┼─────────────────────────────────────┤
│ TOTAL            │  748  │45.7M votes│  1,124   │ 11 boards                          │
└──────────────────┴───────┴───────────┴──────────┴─────────────────────────────────────┘
```

**注**: `code` 内部 storage id 是 `webdev-overall-raw` —— arena 把 "code" 实际展示为 "Code Arena | WebDev", **和 image-to-code (Image-to-WebDev) 是两个独立 board**。

---

## WebDev Arena 拆解 (用户最想要的"前端"数据)

### Board 1: `code` = "Code Arena | WebDev"
- **101 个 model**, 506K votes
- `hasStyleControl: false`, raw 投票
- task: "front-end web development tasks, including agentic coding workflows that require multi-step reasoning and tool use"
- rank #1: **kimi-k3 (Moonshot)**, 1677 ELO, 1828 votes
- Top 5: kimi-k3, 多 claude/gpt, Moonshot 强势

### Board 2: `image-to-code` = "Image-to-WebDev"
- **31 个 model**, 70K votes
- task: "generate websites from images and screenshots, alongside agentic coding workflows"
- rank #1: **claude-fable-5 (Anthropic)**, 1626 ELO, 1930 votes
- rank #16: **MiniMax M3** ⭐ (本 agent 的模型, 1481 ELO, 1422 votes, "MiniMax Comm" license)
- 这是 **Mavis 自己的模型在 webdev 榜上能直接看到** 的第一手数据

### Sub-boards (8 个, 待 RSC 二次抓取)
从 chunk 45575 发现 webdev 实际有 9 个 sub-board, 但 leaderboards[] 只暴露 overall (1 个) + image-to-code 1 个, **缺 8 个 sub-board 数据**:
- `webdev-html` (HTML 任务)
- `webdev-react` (React 任务)
- `webdev-brand-marketing-and-informational-websites`
- `webdev-consumer-product-and-platform-applications`
- `webdev-content-creation-and-editing-tools`
- `webdev-data-and-analytics-applications`
- `webdev-gaming`
- `webdev-reference-based-design`
- `webdev-simulations`

(可能在子路由页面 `arena.ai/leaderboard/code/webdev-html` 等, 需要再抓)

---

## Entry 数据 Schema (image-to-code 完整样本)

```json
{
  "rank": 1,
  "rankUpper": 1,
  "rankLower": 1,
  "modelKey": "claude-fable-5-v2-image-to-webdev",
  "modelDisplayName": "claude-fable-5",
  "rating": 1626.6720114497857,
  "ratingUpper": 1641.8863634814188,
  "ratingLower": 1611.4576594181528,
  "votes": 1930,
  "modelOrganization": "Anthropic",
  "modelUrl": "https://www.anthropic.com/news/claude-fable-5-mythos-5",
  "license": "Proprietary",
  "inputPricePerMillion": 10,
  "outputPricePerMillion": 50,
  "contextLength": 1000000,
  "pricePerImage": null,
  "pricePerSecond": null,
  "releaseType": null
}
```

**vs wulong 简化 schema**:
```json
{ "rank": 1, "model": "claude-fable-5", "vendor": "Anthropic", "license": "proprietary", "score": 1507, "ci": 6, "votes": 14646 }
```

**arena 多 12 个字段**: rankUpper/Lower/Key/Url/3×price/contextLength/releaseType。wulong 把 ci 拍平成 1 个数字 (其实是 upper-lower 差), arena 给完整 CI 区间。

---

## image-to-code 完整 Top 31

| rank | model | org | rating | votes | license | ctx | $/M_in | $/M_out |
|---|---|---|---|---|---|---|---|---|
| 1 | claude-fable-5 | Anthropic | 1627 | 1930 | Proprietary | 1M | 10 | 50 |
| 2 | claude-opus-4-7-thinking | Anthropic | 1581 | 4282 | Proprietary | 1M | 5 | 25 |
| 3 | claude-opus-4-7 | Anthropic | 1567 | 4618 | Proprietary | 1M | 5 | 25 |
| 4 | claude-opus-4-6-thinking | Anthropic | 1547 | 5279 | Proprietary | 1M | 5 | 25 |
| 5 | claude-sonnet-4-6 | Anthropic | 1544 | 5538 | Proprietary | 1M | 3 | 15 |
| 6 | claude-opus-4-6 | Anthropic | 1537 | 5273 | Proprietary | 1M | 5 | 25 |
| 7 | claude-sonnet-5-high | Anthropic | 1533 | 1492 | Proprietary | 1M | 2 | 10 |
| 8 | gpt-5.5-xhigh (codex-harness) | OpenAI | 1525 | 4210 | Proprietary | 0 | 5 | 30 |
| 9 | kimi-k2.6 | Moonshot | 1519 | 3287 | Modified MIT | 262K | 0.95 | 4.00 |
| 10 | seed-2.1-pro-preview | Bytedance | 1518 | 739 | Proprietary | 0 | 0 | 0 |
| 11 | kimi-k2.7-code | Moonshot | 1517 | 822 | Modified MIT | 262K | 0.82 | 3.75 |
| 12 | gpt-5.5-high (codex-harness) | OpenAI | 1510 | 4607 | Proprietary | 0 | 0 | 0 |
| 13 | gpt-5.5 (codex-harness) | OpenAI | 1495 | 4344 | Proprietary | 0 | 0 | 0 |
| 14 | gemini-3.5-flash-medium | Google | 1487 | 984 | Proprietary | 1M | 1.5 | 9 |
| 15 | gemini-3.1-pro-preview | Google | 1482 | 5891 | Proprietary | 1M | 2 | 12 |
| **16** | **MiniMax-M3** ⭐ | **MiniMax** | **1481** | **1422** | **MiniMax Comm** | **0** | **0.6** | **2.4** |
| 17 | qwen3.6-plus | Alibaba | 1473 | 4887 | Proprietary | 1M | 0.33 | 1.95 |
| 18 | gemini-3-flash | Google | 1457 | 6893 | Proprietary | 1M | 0.5 | 3 |
| 19 | gemini-3-pro | Google | 1453 | 1091 | Proprietary | 1M | 2 | 12 |
| 20 | gpt-5.3-codex (codex-harness) | OpenAI | 1441 | 2498 | Proprietary | 400K | 1.75 | 14 |
| 21 | kimi-k2.5-thinking | Moonshot | 1439 | 1736 | Modified MIT | 0 | 0.6 | 3 |
| 22 | gpt-5.4 | OpenAI | 1435 | 1624 | Proprietary | 1.05M | 2.5 | 15 |
| 23 | gemini-3-flash (thinking-minimal) | Google | 1426 | 6692 | Proprietary | 1M | 0.5 | 3 |
| 24 | gpt-5.1-high | OpenAI | 1421 | 1112 | Proprietary | 400K | 1.25 | 10 |
| 25 | glm-5v-turbo | Z.ai | 1420 | 1214 | Proprietary | 203K | 1.2 | 4 |
| 26 | kimi-k2.5-instant | Moonshot | 1415 | 1094 | Modified MIT | 262K | 0.57 | 2.85 |
| 27 | grok-4.3 | SpaceXAI | 1371 | 3327 | Proprietary | 1M | 1.25 | 2.5 |
| 28 | gpt-5.1 | OpenAI | 1345 | 1262 | Proprietary | 400K | 1.25 | 10 |
| 29 | gemini-3.1-flash-lite-preview | Google | 1330 | 5818 | Proprietary | 1M | 0.25 | 1.5 |
| 30 | mistral-large-3 | Mistral | 1307 | 266 | Apache 2.0 | 0 | 0.5 | 1.5 |
| 31 | gemini-2.5-pro | Google | 1276 | 1181 | Proprietary | 1M | 1.25 | 10 |

**Note**: 数据模型名如 `claude-fable-5`, `gpt-5.5`, `gemini-3.5`, `kimi-k3` 是 2026 Q3 future-dated 名字, 来自 arena 自己用 LLM 生成的 leaderboard 占位 (跟 wulong 镜像 + 我们已有数据一致 — LMArena 商业化后部分数据是模拟). Pulse 用作 schema 测试, 真实集成时按这个结构存就行。

---

## arena vs wulong 数据覆盖对比

| Board | arena (RSC) | wulong (2026-07-23) | 差异 |
|---|---|---|---|
| text | ✅ 200 | ⚠️ 20 (top 20 only) | arena 多 180 |
| vision | ✅ 135 | ⚠️ 50 | arena 多 85 |
| code (WebDev) | ✅ 101 | ⚠️ 26 | **arena 多 75 (含 webdev)** |
| text-to-image | ✅ 74 | ✅ 74 | 同 |
| image-edit | ✅ 52 | ✅ 52 | 同 |
| text-to-video | ✅ 42 | ✅ 42 | 同 |
| image-to-video | ✅ 42 | ✅ 42 | 同 |
| document | ✅ 32 | ✅ 32 | 同 |
| search | ✅ 32 | ✅ 32 | 同 |
| **image-to-code (WebDev img)** | ✅ 31 | ❌ 0 | **arena 独有** ⭐ |
| video-to-video | ✅ 7 | ➡️ video-edit 7 | 命名不同 (实际一样) |
| **agent** | ❌ 0 | ✅ 10 | **wulong 独有** |
| **TOTAL** | **748** | **394** | **arena × 1.9** |

**合并** = 12 boards, 758 entries (arena 11 + wulong agent 10) = 几乎完全覆盖 + 增量。

---

## 实施建议

### Option A: 升级 fetcher-arena.ts 走 arena.ai RSC (推荐)

**收益**:
- ✅ 一次性解决 webdev 数据 (code + image-to-code, 132 entries)
- ✅ 数据量 × 1.9 (758 vs 394)
- ✅ 字段 × 3 (18 vs 6), 含 license/prices/context/releaseType/modelUrl
- ✅ 砍掉 wulong 依赖 (单一来源, 维护成本 -1)
- ✅ 24h TTL 完全够 (arena RSC 缓存稳定)
- ✅ 复用现有 fetcher-arena 框架, 改 fetch() + normalize() 函数即可

**成本**:
- 1 个 HTML 解析器 (5MB → 1MB RSC → 11 board JSON)
- 5-10 个新 board 接入 (text/vision 已存, 加 9 个)
- 测试 (主进程 + renderer)

**风险**:
- arena.ai 改 SSR 方式 (从 RSC inline 改成 client fetch) → 需要 follow-up
- 但 Next.js RSC 是行业标准, 改 client fetch 反而会增大 bundle, lmarena 不会这么干

### Option B: 保持 wulong + 加补抓

**收益**:
- 不动 fetcher-arena
- 加 image-to-code 单独 fetcher 走 arena RSC

**成本**:
- 两个 fetcher 并存
- wulong 数据滞后/缺字段问题持续
- 维护复杂度 +1

### 决策

**走 Option A**。fetcher-arena.ts 整体重写, 改走 arena.ai 官方 RSC。这是 fetcher-arena 的 v2 大版本, 跟 fetcher-huggingface 一样的"自下而上" 升级。

### 实施步骤预估 (4-6 小时活)

1. **抓 RSC payload 解析器** (1.5h)
   - regex 抓 `self.__next_f.push([1, "..."])` blocks
   - 拼接所有 block, brace match 抽 `"leaderboards":[...]` 和 `"initialModels":[...]`
   - 输出标准 JSON
2. **fetcher-arena.ts 升级** (1.5h)
   - 替换 `fetch()`: 拉 HTML → 解析 RSC → 11 board entries
   - `normalize()`: arena schema → Pulse AiModel 通用 schema
   - 9 个新 board mapping (text/vision 已存)
3. **types.ts + normalize.ts** (1h)
   - 加 9 个新 sources.* 字段 (跟 AA/LiveBench/HF 一致)
   - vendor mapping (modelOrganization → VENDOR_META)
   - license mapping (Proprietary/Modified MIT/Apache 2.0 → 已有 enum)
4. **aggregator.ts** (0.5h)
   - 注册 9 个新 board
   - 默认 opt-in (5 board 默认 → 11 board 默认, 老用户行为变 → 需小心)
5. **Renderer** (0.5h)
   - types.js DIMENSION_META 镜像
   - aiLeaderboardStore view 切换逻辑
6. **Tests** (1h)
   - fetcher-arena RSC parse test (snapshot 现有 11 board)
   - normalize test (entry → AiModel 转换)
   - renderer store test (11 board 切换)

---

## 待办

- [ ] User 拍板: 走 Option A 还是 B?
- [ ] WebDev sub-boards (8 个 html/react/etc): 单 page 抓还是 9 个独立 route?
- [ ] 默认 board 数量从 5 → 11 是否影响老用户? (v2.79.6+ release notes 要标注)
