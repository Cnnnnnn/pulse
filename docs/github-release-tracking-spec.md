# GitHub 收录模块 — Release 更新追踪 设计规格

> 状态：设计稿已就绪 · 视觉稿 `deliverables/github-collection-ui-mockup.html` 已同步静态 UI（待实现确认）
> 作者：UI Designer
> 最后更新：2026-07-16

## 1. 功能目标与范围

让收录的 GitHub 项目能追踪 **GitHub Releases**，使用户第一时间发现新版本。本功能与 Pulse 核心的「更新检查」定位一致，并复用现有 README / AI 解析双 tab 的交互与视觉语言，新增第三个语义轴——**更新状态**（收录状态 / 解析状态 / 更新状态 三者分离）。

**范围**
- 行/卡片级「有新版本」徽标
- 抽屉内「更新」tab：版本对比条 + Release 时间线
- 顶部「检查更新」：手动 + 首次进入静默自动检查
- 标记已读（消除徽标）

**不在范围**：自动下载/升级、跨项目依赖分析、版本 diff 代码对比。

---

## 2. 数据契约（需后端配合）

### 2.1 `project` 对象新增字段

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `latestVersion` | `string` | `releases/latest` 的 `tag_name` 去 `v/V` 前缀 | 当前最新版本 |
| `latestVersionPublishedAt` | `number` | `releases/latest` 的 `published_at` (ms) | 最新版发布时间 |
| `lastSeenVersion` | `string` | 首次收录时 = `latestVersion` | 用户上次「已读」版本，用于派生 `hasUpdate` |
| `releases` | `Array<{version, publishedAt, notesUrl, body}>` | `releases?per_page=5` | 抽屉时间线用，最近 5 条 |
| `releaseFetchedAt` | `number` | 写入时 `Date.now()` | 同步时间戳，用于「N 天前检查」 |

### 2.2 派生状态（renderer 侧 `computed`）

```js
const hasUpdate = !!p.latestVersion && p.latestVersion !== p.lastSeenVersion;
const isStale   = !p.latestVersion; // 从未成功拉到 release（无 release / API 受限）
```

- 首次收录：`lastSeenVersion = latestVersion` → 不立即误报「有更新」。
- 之后版本变化（同步后 `latestVersion` 改变）→ `hasUpdate = true`，徽标出现。

### 2.3 后端扩展点

- **`api.githubFetch` 的 main handler**：抓 README/元数据后，额外请求 `releases?per_page=5`（未登录 60 次/小时限制，收录量小可接受），把 `latestVersion` / `latestVersionPublishedAt` / `releases` 塞入 `meta`。
- **新增 `api.githubReleases(owner, repo)`**（按需 + 手动刷新抽屉时间线用），与 `githubFetch` 共用同一 HTTP 工具与 UA 头。
- 字段加入 store 的 `sanitizeConfig` 等价「项目对象白名单」（参考既有 `enrich_only` 教训：新增字段必须同步进持久化白名单，否则 `loadGithubProjects` 后丢失）。

---

## 3. UI 规格

### 3.1 列表行 / 卡片 — 更新状态徽标

位置：meta 区（Star / 语言 / 收录时间 同一行）末尾追加。

三态：

| 状态 | 形态 | 令牌 | 交互 |
|------|------|------|------|
| `hasUpdate` | `● 新版本 vX.Y.Z`（带脉冲点） | 文字 `--accent-primary`，点 `--accent-primary`，背景 `color-mix(--accent-primary 14%)` | 点击 → 打开抽屉「更新」tab 并标记已读 |
| `!hasUpdate && latestVersion` | `vX.Y.Z`（静态，低调） | 文字 `--text-secondary`，无背景 | 无（纯信息） |
| `isStale` | 不显示；或中性「无 release」 | `--text-tertiary` | 无 |

尺寸与对齐：复用 `.github-chip` 结构（高度、字重、圆角 pill），新增修饰类 `.github-chip--update`；脉冲点 8×8，`margin-right: var(--space-1)`，脉冲动画 `prefers-reduced-motion` 下关闭。

### 3.2 抽屉 — 「更新」tab（第三 tab）

现有 README / AI 解析双 tab 扩展为三 tab，新增 `IconTag`/`IconHistory` 图标 + 文案「更新」。

**Tab 头部对比条**
- 左：最新 `vX.Y.Z` · 发布于「N 天前」（相对时间，hover 显示绝对日期）
- 右：「标记已读」文本按钮（仅 `hasUpdate` 时高亮为 `--accent-primary`）

**Release 时间线**
- 竖直时间轴：左侧节点（圆点 `--accent-primary` / 已读节点 `--text-tertiary`）+ 连接线 `--bg-secondary`。
- 每条：`版本号`（tabular-nums）→ `相对日期`（--text-secondary）→ `↗ release page` 链接（跳 `html_url`）→ 可折叠的 release notes 摘要（`body` 前 N 行 / 标记化截断）。
- 顶部第一条标「最新」徽标。

**加载态**：复用 `.github-skel__block` 主题安全 shimmer，新增 `.github-rel-skel` 系列（对比条 + 3 条时间线条），与 README/AI 骨架屏一致。

**错误态**：复用 AI 解析的 error + 重试模式（网络失败 / 限流 → 中文 reason + 重试按钮）。

**空态**：无任何 release → 「该项目还没有发布 Release」。

### 3.3 顶部工具栏 — 检查更新

- 搜索/排序栏右侧新增「检查更新」按钮（`.github-btn--ghost` 同款，前置 `IconRefresh`）。
- 点击：批量拉取所有项目 release，按钮进入 spinner + 文案「检查中 N/M」，完成后 toast / 顶部提示「X 个项目有新版本」。
- 首次进入模块：自动静默检查一次（写入 `latestVersion`/`releaseFetchedAt`，不强制标记已读 → 不会误报）。

---

## 4. 设计令牌与对齐

- **三语义轴配色**（避免混淆）：
  - 收录状态：中性灰（chip 默认）
  - 解析状态：已解析 `--app-codex`（绿）/ 待解析 `--accent-amber`（琥珀）
  - 更新状态：`--accent-primary`（蓝，表示「新 / 可操作」）
- 复用：`.github-chip`、`.github-btn--ghost`、`.github-skel__block`、错误/空态模式。
- 新增：`.github-chip--update`、`.github-rel-timeline`、`.github-rel-node`、`.github-rel-skel`、脉冲 keyframes。
- **禁止裸 hex**，全部走令牌；主题安全（深/浅均可见）。
- 触控目标 ≥ 44px（徽标、标记已读按钮）。

---

## 5. 组件拆解与文件改动

| 文件 | 改动 |
|------|------|
| `src/renderer/store/github-projects-store.js` | `proj` 加 release 字段；`addGithubProject` 写入 `latestVersion`/`lastSeenVersion`/`releases`；新增 `checkGithubUpdates()`（批量）/ `markGithubSeen(id)` / `fetchGithubReleases(id)`；持久化白名单同步 |
| `src/renderer/github/GithubProjectList.jsx` | 行/卡片加更新徽标（基于 `hasUpdate` 派生）；顶部加「检查更新」按钮 |
| `src/renderer/github/GithubProjectDrawer.jsx` | 加第三 tab「更新」+ 进入时 `markGithubSeen` 逻辑 |
| `src/renderer/github/GithubReleasesView.jsx` | **新增**：对比条 + 时间线 + 骨架 + 错误态 + 空态 |
| `src/renderer/github/github.css` | 徽标、时间线、节点、脉冲、`.github-rel-skel` 样式 |
| `src/renderer/components/icons.jsx` | 新增 `IconTag`（更新 tab 图标） |
| `deliverables/github-collection-ui-mockup.html` | 同步：行/卡片更新徽标 + 抽屉「更新」tab 静态稿 + 检查更新按钮 |
| `tests/renderer/github-releases-view.test.jsx` | **新增**：加载/错误/空/时间线渲染 + 标记已读 |
| `tests/renderer/github-project-list.test.jsx` | 扩展：`hasUpdate` 徽标出现 / 静态版本显示 / 无 release 不显示 |

---

## 6. 验证点

- `npm run build:renderer` 通过
- `stylelint github.css` 0 错误（无裸 hex，令牌存在）
- `vitest run` 全量通过，新增 Release 测试无回归
- 视觉稿 `github-collection-ui-mockup.html` 同步且可交互预览（徽标 + 更新 tab + 检查更新）
- 主题安全：浅/深主题下徽标与时间线均清晰可读；`prefers-reduced-motion` 关闭脉冲
