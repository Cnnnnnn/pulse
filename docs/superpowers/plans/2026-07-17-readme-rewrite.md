# Pulse README 与用户功能手册重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将根 README 重写为面向普通用户的精简产品首页，并将用户功能手册更新为与当前 Pulse 导航和实际入口一致的完整常青文档。

**Architecture:** 采用双层文档结构：`README.md` 负责定位、核心能力、安装、隐私和开发入口；`docs/user-features-guide.md` 负责当前一级模块、全局功能、快捷键、设置、数据和故障排查。两份文档只引用当前代码和发布配置能证实的能力，历史实现细节不反向污染用户文档。

**Tech Stack:** Markdown、Electron、Preact、`@preact/signals`、Vitest、Playwright、Node.js 验证脚本

## Global Constraints

- 只修改 `README.md`、`docs/user-features-guide.md`；已批准规格 `docs/superpowers/specs/2026-07-17-readme-rewrite-design.md` 仅作为事实依据。
- 不修改应用代码、配置、依赖、测试、历史规格、计划或 Release Notes。
- 不新增截图，也不引用不存在的 `docs/screenshots/` 资源。
- 两份文档采用常青写法，不绑定当前版本号，不使用 `v2.x+` 功能标签。
- 产品定位统一为“以应用更新管理为核心的个人桌面信息中心”。
- 一级模块名称统一为：首页、新闻、世界杯、投资、AI 用量、版本检查、GitHub 收录、游戏优惠。
- 新闻是 IT 新闻与微博热搜的统一入口；投资是基金、贵金属与选股的统一入口。
- AI 内容生成 Provider 只写 DeepSeek、MiniMax、GLM；AI 用量监控只写 MiniMax、GLM。
- macOS 发布 Apple Silicon 与 Intel 包；Windows 当前发布工作流只构建 x64，不承诺 arm64 原生包。
- 贵金属是纯行情看板，不宣称提供持仓、交易、总市值或盈亏记账。
- 版本检查不宣称已退役的延后、版本历史、行级回滚或应用行关注入口。
- 首页快捷键只写当前实现的 `⌘/Ctrl+1–6`，不写任意 `1–N`。
- 保留当前工作区其他未提交改动，不覆盖、不暂存、不提交。
- 未经用户明确要求，不创建 Git commit。

---

### Task 1: 重写完整用户功能手册

**Files:**

- Modify: `docs/user-features-guide.md`（整文件替换）

**Interfaces:**

- Consumes: `src/renderer/worldcup/navStore.js` 的一级导航；各 Layout、Page、Store 中的当前用户入口；`package.json` 与 Release 工作流中的平台事实
- Produces: README 的“完整指南”链接目标；当前 Pulse 用户操作的单一详细说明

- [ ] **Step 1: 将手册替换为当前信息架构**

用下面的完整内容替换 `docs/user-features-guide.md`：

````markdown
# Pulse 用户功能手册

Pulse 是面向 macOS 与 Windows 的个人桌面信息中心。它以应用版本检查与升级为核心，同时整合新闻、世界杯、投资行情、AI 用量、GitHub 项目和游戏优惠。

本文档描述当前界面中可实际操作的功能。底层实现、历史设计和发布流程请参阅文末的相关文档。

## 目录

- [一、界面与导航](#一界面与导航)
- [二、首页](#二首页)
- [三、新闻](#三新闻)
- [四、世界杯](#四世界杯)
- [五、投资](#五投资)
- [六、AI 用量](#六ai-用量)
- [七、版本检查](#七版本检查)
- [八、GitHub 收录](#八github-收录)
- [九、游戏优惠](#九游戏优惠)
- [十、全局功能与快捷键](#十全局功能与快捷键)
- [十一、设置与本地数据](#十一设置与本地数据)
- [十二、故障排查与限制](#十二故障排查与限制)

## 一、界面与导航

Pulse 由首页、侧边导航、当前模块内容区和全局弹窗组成。

- **首页**：汇总各模块的实时状态、未读数量和快捷入口。
- **侧边导航**：进入新闻、世界杯、投资、AI 用量、版本检查、GitHub 收录和游戏优惠。
- **内容区**：展示当前模块的页面、筛选器和操作入口。
- **全局弹窗**：提供搜索、提醒、最近活动、关注列表等跨模块功能。

离开首页后，侧边导航会显示在窗口左侧。它支持折叠、拖拽排序、隐藏不常用模块和恢复已隐藏模块。Pulse 会记住最近进入的一级模块，并在下次启动时恢复落点。

## 二、首页

首页以卡片方式展示全部一级模块。卡片可显示模块摘要、未读角标或最近数据，例如新闻数量、投资状态、AI 配额和应用更新数量。

### 卡片管理

- 点击卡片进入对应模块。
- 收藏的卡片会优先显示。
- 拖拽卡片可以调整顺序。
- 首页与侧边导航共用排序、收藏和隐藏偏好。
- “最近访问”入口可快速回到上次使用的模块。

### 键盘操作

- `⌘/Ctrl+1–6`：打开当前排序中的前六张卡片。
- `←`、`→`、`↑`、`↓`：移动卡片焦点。
- `Enter` 或空格：打开聚焦卡片。
- `Home`、`End`：跳到第一张或最后一张卡片。

## 三、新闻

新闻模块把 IT 新闻与微博热搜放在同一个一级入口中，通过页内标签切换。

### IT 新闻

- 浏览当月新闻，并按日期切换。
- 按标题或分类搜索。
- 将文章加入收藏，收藏内容长期保留。
- 手动刷新当前日期的资讯。
- 数据请求失败但本地已有缓存时，继续显示上次成功结果。

IT 新闻内部提供“本月新闻”和“收藏”两个视图。

### 微博热搜

- 查看当前热搜榜。
- 按关键词筛选热搜条目。
- 手动刷新，连续刷新之间有 15 秒冷却时间。
- 已读状态和未读数量会同步到新闻入口角标。
- 请求失败时显示错误；若已有旧数据，可继续查看上次结果。

## 四、世界杯

世界杯模块围绕 2026 世界杯提供四个子页面：

- **赛程**：按日期浏览比赛，并按球队或场地搜索。
- **球队**：浏览参赛球队，点击球队查看大名单。
- **进球榜**：查看球员进球排名。
- **对阵**：查看淘汰赛对阵关系。

比分会接收主进程推送，并以定时刷新作为兜底。点击比赛通知后，Pulse 会回到赛程页并定位相关比赛。

## 五、投资

投资模块统一包含基金、贵金属和选股三个子模块。

### 基金

基金模块提供概览和列表两个视图：

- 查看持仓市值、成本、累计盈亏和今日盈亏。
- 添加、编辑和删除基金持仓。
- 查看组合趋势、单只基金净值历史和持仓明细。
- 按代码、名称、分类或自选状态筛选。
- 将基金加入关注列表或对比池。
- 设置盈利和亏损阈值；净值刷新后越过阈值时发送系统通知。

删除的基金持仓会进入可恢复流程，具体提示以删除确认框为准。

### 贵金属

贵金属是行情看板，不提供交易或持仓记账：

- 查看不同贵金属品种的实时行情。
- 查看国际报价换算后的人民币每克价格。
- 打开品种详情查看更完整的报价信息。
- 将品种加入或移出关注列表。
- 手动刷新行情和汇率。

汇率尚未加载时，依赖人民币换算的字段会暂时显示不可用状态。

### 选股

选股提供“筛选”和“个股分析”两个视图：

- 根据筛选条件获取股票列表并调整排序。
- 请求 AI 生成筛选建议，再由用户决定是否应用。
- 搜索股票并进入个股诊断。
- 查看多维诊断卡片，并将诊断报告导出为 PNG。
- 将股票、上市基金或映射后的贵金属品种加入对比池。
- 对比池最多保留四项，支持横向查看价格、估值和诊断分数。

使用 AI 建议或诊断前，需要先在“版本检查 → 设置 → AI 配置”中完成连接设置。

## 六、AI 用量

AI 用量模块监控 MiniMax 与 GLM 编程套餐配额，两者的数据和告警设置相互独立。

- 在 MiniMax 与 GLM 之间切换。
- 查看滚动窗口、周窗口及 Provider 返回的其他配额窗口。
- 查看已用比例、剩余额度和重置倒计时。
- 根据前后两次快照估算当前消耗速度和预计耗尽时间。
- 查看历史趋势和异常提示。
- 设置配额阈值告警。
- 手动刷新，也可使用启动时加载的最近缓存。

上游接口暂时不可用时，页面会保留最近一次成功快照并显示错误状态。

## 七、版本检查

版本检查是 Pulse 的核心模块，包含“应用列表”“诊断”“设置”三个子页面。

### 应用列表

首次没有检测结果时，点击“运行首次检查”。有结果后可以：

- 在表格视图与卡片视图之间切换。
- 按应用名称搜索。
- 按全部、有更新、已是最新、出错筛选。
- 按应用分类筛选，并一键清除全部过滤条件。
- 查看已安装版本、最新版本、检测状态和错误提示。
- 展开应用信息查看 Changelog。

### 单项升级与静音

- 当检测结果提供可执行升级路径时，应用行显示“升级”按钮。
- 升级失败且配置了官方下载地址时，Pulse 会尝试打开下载页。
- 在表格行空白处点击右键可设置静音：1 天、7 天、30 天、90 天或永久。
- 静音会跳过相应通知；再次右键可以取消静音。

当前应用行不提供延后、版本历史、行级回滚或加入关注入口。

### 批量升级

“一键升级”会打开批量升级弹窗：

- 按数据源分组展示可升级应用。
- 只勾选存在自动升级路径的条目。
- macOS 使用支持的 Homebrew 路径，Windows 使用支持的 winget 路径。
- 显示等待、升级中、完成、失败、跳过和取消状态。
- 支持取消任务、重试单个失败项、重试全部失败项和查看输出日志。

不同检测源不一定提供自动升级能力；没有升级路径的条目只展示检测结果。

### 更多操作

应用列表右上角的更多菜单提供：

- 关注列表。
- 错误诊断。
- Reminders。
- Recent Activity。
- 导出当前检测结果为 JSON 或 CSV。
- 查看 Release Notes。

AI 任务按钮位于同一操作区。

### 诊断与 Pulse 自更新

诊断页提供：

- 错误总数、级别统计、启动和性能指标。
- 高频失败项和按关键词、级别筛选的错误记录。
- 复制错误、打开日志目录、清理旧日志和导出诊断包。
- 导出或导入可迁移配置。
- 当发现 Pulse 新版本时，显示下载进度并提供“退出并安装”。

Pulse 自更新采用半自动流程，不会在应用退出时无提示地自动安装。

## 八、GitHub 收录

GitHub 收录用于建立本地开源项目库。

### 添加与浏览

- 粘贴 GitHub 仓库地址添加单个项目。
- 切换到批量模式，每行输入一个地址；以 `#` 开头的行会被忽略。
- 查看项目名称、描述、语言、Star、License 和主页信息。
- 打开详情抽屉查看 README、AI 解析和 Release 更新。
- 刷新 README 或在浏览器中打开原仓库。

### Release 跟踪

- 手动检查全部项目的新 Release。
- 只重试上次检查失败的项目。
- 标记单个或全部更新为已读。
- 在 Pulse 运行期间按设置的间隔自动检查，并可在发现更新时发送桌面通知。

### Token 与备份

公开仓库无需 Token 即可使用，但 GitHub 未认证请求的额度较低。可以在“版本检查 → 设置 → GitHub”中配置 Personal Access Token、调整自动检查、导出项目备份或导入备份。

GitHub Token 保存在本机应用的浏览器存储中，不使用 AI 密钥的 `safeStorage` 加密机制。请不要在共享系统账户中保存敏感 Token。

## 九、游戏优惠

游戏优惠模块按平台和浏览模式组织数据。

### 平台

当前平台标签包括 Steam、Epic、Xbox、PlayStation 和 Switch。进入模块时默认选择 Steam。

### 浏览模式

- **折扣力度**：查看普通折扣，可按折扣门槛和排序方式筛选。
- **免费活动**：只展示免费入库、Key 赠送、免费周末或限时试玩等活动。
- **热门 Top10**：查看当前平台的热门榜单。

免费活动与普通折扣分开显示。活动卡片会尽量标明活动类型、结束时间、领取条件和数据提供方；“免费周末”或 Xbox Free Play Days 只代表限时游玩，不等同于永久入库。

Epic、Steam 和 Xbox 支持后台检查免费活动。可在“版本检查 → 设置 → 游戏”中调整检查开关、间隔和桌面通知。PlayStation 或 Switch 在某些模式下可能没有可用数据。

页面显示“含示例数据”时，相关内容不是实时价格；使用第三方数据源时，页面底部会展示来源署名。

## 十、全局功能与快捷键

### 全局搜索

按 `⌘/Ctrl+K` 打开搜索，当前可检索新闻、AI 任务、提醒、基金和应用。使用 `↑`、`↓` 选择结果，按 `Enter` 跳转，按 `Esc` 关闭。

### 提醒

按 `⌘/Ctrl+Shift+R` 打开提醒并进入新建状态。提醒支持一次、每天、工作日和每周重复；触发后发送系统通知并等待完成或忽略。完成重复提醒后，Pulse 会计算下一次时间。

### 最近活动

Recent Activity 按时间倒序记录应用检查与升级、提醒、基金和新闻等操作。可以按类别过滤，并从记录跳回相关模块。

### 关注列表

关注列表统一管理基金、贵金属、关键词和历史上已加入的应用条目：

- 基金和贵金属可从各自列表或详情页加入。
- 关键词可直接在关注列表中添加，用于匹配新闻和热搜。
- 当前版本检查应用行没有新增关注入口，但已有应用关注项仍可查看或移除。

### AI 任务

AI 任务会扫描支持的本地 AI 编程工具会话，按日期和应用分组。选择任务后可以调用已配置的 Provider 生成摘要，并查看生成状态或打开原会话。

### 每日早报

Pulse 可根据当天的重要变化生成早报并发送系统通知。点击早报通知会打开早报抽屉；没有重要变化时显示空状态。

### Release Notes 与主题

- 新版本首次启动时可以显示 Release Notes；也可从版本检查的更多菜单手动打开。
- 主题支持跟随系统、浅色和深色，可在设置中切换。

### 快捷键汇总

| 快捷键 | 功能 |
|---|---|
| `⌘/Ctrl+K` | 打开或关闭全局搜索 |
| `⌘/Ctrl+F` | 聚焦当前模块支持的搜索框 |
| `⌘/Ctrl+Shift+R` | 打开提醒新建表单 |
| `⌘/Ctrl+Shift+F` | 进入投资模块的基金页 |
| `⌘/Ctrl+Shift+M` | 进入投资模块的贵金属页 |
| `⌘/Ctrl+1–6` | 在首页打开当前排序中的前六张卡片 |
| `Esc` | 关闭当前弹窗、菜单或搜索 |

## 十一、设置与本地数据

设置位于“版本检查 → 设置”，分为四个页签。

### 常规

- 切换跟随系统、浅色或深色主题。
- 查看最近活动。
- 查看、完成和删除提醒。
- 导出或导入关注列表、提醒、基金与 AI Prompt 等可迁移配置。

### GitHub

- 保存或清除 GitHub Personal Access Token。
- 导出或导入完整 GitHub 项目备份。
- 设置自动检查间隔和新 Release 通知。

### 游戏

- 开启或关闭免费活动自动检查。
- 设置自动检查间隔。
- 开启或关闭新免费活动通知。

### AI 配置

AI 配置包含“连接设置”和“Prompt 模板”：

- 内容生成 Provider：DeepSeek、MiniMax、GLM。
- 配置 Model、Base URL 和 API Key，并测试连接。
- 自定义不同 AI 场景使用的 Prompt 模板。

AI 内容生成配置与“AI 用量”页的套餐监控是两套用途：前者用于生成摘要或分析，后者用于显示 MiniMax 与 GLM 配额。

### 数据位置与安全

主要状态文件：

- macOS：`~/Library/Application Support/pulse/state.json`
- Windows：`%APPDATA%\pulse\state.json`

提醒、最近活动、关注列表、检测缓存和部分模块状态保存在应用数据目录。删除 `state.json` 会重置其中的本地状态；操作前建议先导出需要保留的数据。

AI API Key 通过 Electron `safeStorage` 加密后写入应用数据目录下的 `ai-keys` 文件夹：

- macOS 由系统 Keychain 提供加密能力。
- Windows 由 DPAPI 提供加密能力。
- 密钥文件使用 `.bin` 后缀，历史 `.enc` 文件仍可兼容读取。

GitHub 项目和设置主要保存在应用的浏览器存储中，GitHub Token 不使用 `safeStorage`。GitHub 模块提供独立的导入与导出功能。

## 十二、故障排查与限制

### 应用可以检测但不能自动升级

不是所有检测源都有升级命令。macOS 自动升级通常依赖 Homebrew，Windows 自动升级通常依赖 winget；没有自动升级路径时，请使用应用官方渠道。

### 外部数据加载失败

新闻、行情、比赛、版本、GitHub、游戏和 AI 都可能访问外部服务。检查网络、代理和服务状态后重试；模块有最近成功缓存时会尽量继续展示旧数据。

### AI 密钥无法保存或调用失败

确认系统的安全存储可用，并在“AI 配置 → 连接设置”重新保存密钥和测试连接。更多信息见 [Keychain 故障排查](keychain-troubleshooting.md)。

### GitHub 检查频繁失败

未配置 Token 时 GitHub API 限额较低。可以配置只读取公开仓库所需的 Token，并适当增加自动检查间隔。

### 游戏内容为空或标记为示例

不同平台和模式的数据覆盖不同。空列表不一定是错误；“含示例数据”表示该部分不是实时价格，应以平台商店页面为准。

### 状态文件损坏

Pulse 会尝试备份损坏的状态文件并恢复可启动状态。界面出现恢复提示后，建议检查关键数据并重新导入备份。

### 平台限制

- 支持 macOS 和 Windows。
- Linux 不受支持。
- Windows 当前发布流程提供 x64 安装包，不提供原生 arm64 安装包。

## 相关文档

- [README](../README.md)
- [UI 设计系统](ui-design-system.md)
- [主题切换说明](ui-theme-switching.md)
- [GitHub Release 跟踪规格](github-release-tracking-spec.md)
- [Release Notes 维护说明](release-notes-howto.md)
- [历史设计规格](superpowers/specs/)
````

- [ ] **Step 2: 核对手册的一级结构与过期承诺**

运行：

```bash
node - <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('docs/user-features-guide.md', 'utf8');
const required = [
  '## 一、界面与导航',
  '## 二、首页',
  '## 三、新闻',
  '## 四、世界杯',
  '## 五、投资',
  '## 六、AI 用量',
  '## 七、版本检查',
  '## 八、GitHub 收录',
  '## 九、游戏优惠',
  '## 十、全局功能与快捷键',
  '## 十一、设置与本地数据',
  '## 十二、故障排查与限制',
];
const forbiddenHeadings = [
  '## IT 新闻',
  '## 微博热搜',
  '## 基金管理',
  '## 贵金属',
];
for (const heading of required) {
  if (!text.includes(heading)) throw new Error(`missing heading: ${heading}`);
}
for (const heading of forbiddenHeadings) {
  if (text.includes(heading)) throw new Error(`retired top-level heading: ${heading}`);
}
for (const retired of ['OpenAI', 'Anthropic', '版本历史抽屉', '延后菜单']) {
  if (text.includes(retired)) throw new Error(`retired claim: ${retired}`);
}
console.log('user guide structure: OK');
NODE
```

Expected: 输出 `user guide structure: OK`，退出码为 0。

---

### Task 2: 重写根 README 为精简产品首页

**Files:**

- Modify: `README.md`（整文件替换）

**Interfaces:**

- Consumes: Task 1 产出的 `docs/user-features-guide.md`；`package.json`、`.github/workflows/release.yml` 中的安装与构建事实
- Produces: GitHub 仓库首页、下载入口、完整手册入口和最短开发入口

- [ ] **Step 1: 将 README 替换为精简产品首页**

用下面的完整内容替换 `README.md`：

````markdown
# Pulse

面向 macOS 与 Windows 的个人桌面信息中心：以应用版本检查与升级为核心，同时整合新闻、投资行情、世界杯、AI 用量、GitHub 项目和游戏优惠。

Pulse 常驻系统托盘，把分散在不同应用和网站里的日常信息集中到一个桌面窗口中。主要数据保存在本机；需要联网的模块只在获取对应内容时访问外部服务。

## 核心能力

| 模块 | 能力 |
|---|---|
| 首页 | 汇总模块状态、未读角标、收藏和快捷入口 |
| 新闻 | 整合 IT 新闻与微博热搜 |
| 世界杯 | 查看赛程、球队、进球榜和淘汰赛对阵 |
| 投资 | 管理基金，查看贵金属行情，并进行选股分析 |
| AI 用量 | 监控 MiniMax 与 GLM 编程套餐配额和趋势 |
| 版本检查 | 检测应用更新，并通过支持的升级路径执行升级 |
| GitHub 收录 | 建立本地开源项目库，跟踪 README 与 Release |
| 游戏优惠 | 聚合多个平台的折扣、免费活动和热门榜 |

跨模块能力包括：

- 全局搜索。
- 本地提醒和最近活动。
- 基金、贵金属、关键词等内容的统一关注列表。
- 本地 AI 编程会话摘要。
- 每日早报与系统通知。
- 跟随系统、浅色和深色主题。
- Release Notes、诊断和 Pulse 自更新。

完整操作说明见 [Pulse 用户功能手册](docs/user-features-guide.md)。

## 下载与安装

从 [GitHub Releases](https://github.com/Cnnnnnn/pulse/releases/latest) 下载最新安装包。

### macOS

发布包同时覆盖：

- **Apple Silicon**：文件名包含 `arm64`，适用于 M 系列芯片。
- **Intel**：文件名包含 `x64`，适用于 Intel Mac。

安装步骤：

1. 下载对应架构的 DMG。
2. 打开 DMG，将 Pulse 拖入“应用程序”。
3. 首次启动时按系统提示授予应用目录访问和通知权限。

如果不确定架构，请打开“关于本机”查看“芯片”或“处理器”。

### Windows

当前发布流程提供 **x64** NSIS 安装包，适用于主流 Intel 与 AMD Windows 设备。暂不提供原生 Windows arm64 安装包。

安装步骤：

1. 下载文件名包含 `x64` 的 EXE。
2. 双击安装包，并按向导选择安装目录。
3. 如需自动升级已安装应用，请确认系统可使用 winget。

## 快速开始

1. 启动 Pulse，从首页进入需要的模块。
2. 打开“版本检查”，首次使用时点击“运行首次检查”。
3. 在“版本检查 → 设置”中调整主题、GitHub、游戏和 AI 配置。
4. 使用 `⌘/Ctrl+K` 搜索新闻、AI 任务、提醒、基金和应用。

首页支持收藏、拖拽排序和 `⌘/Ctrl+1–6` 快速打开前六张卡片。更多快捷键和模块操作见 [用户功能手册](docs/user-features-guide.md)。

## 应用升级

Pulse 会区分“检测到新版本”和“存在自动升级路径”：

- macOS 的自动升级通常使用 Homebrew。
- Windows 的自动升级通常使用 winget。
- 没有自动升级路径的应用仍可显示版本状态，但需要通过官方渠道安装。

Pulse 自身支持检查和下载更新。发现新版本后，可在“版本检查 → 诊断”中查看状态，并在下载完成后选择退出安装。

## 隐私与本地数据

Pulse 不提供云端账户，主要状态保存在本机应用数据目录：

- macOS：`~/Library/Application Support/pulse/`
- Windows：`%APPDATA%\pulse\`

其中 `state.json` 保存提醒、最近活动、关注列表、检测缓存和部分模块状态。删除该文件会重置对应本地状态，请先导出需要保留的数据。

AI API Key 使用 Electron `safeStorage` 加密：

- macOS 使用系统 Keychain。
- Windows 使用 DPAPI。
- 加密文件保存在应用数据目录的 `ai-keys` 文件夹。

GitHub Token 保存在本机应用的浏览器存储中，不使用 `safeStorage`。不要在共享系统账户中保存敏感 Token。

新闻、行情、比赛、版本、GitHub、游戏和 AI 模块会访问各自的外部服务。具体数据来源和降级行为见 [用户功能手册](docs/user-features-guide.md)。

## 开发

需要 Node.js 和 npm。

```bash
npm install
npm run dev
npm test
npm run build:mac
npm run build:win
```

- `npm run dev`：构建 renderer 并以开发模式启动 Electron。
- `npm test`：运行 Vitest。
- `npm run build:mac`：构建 macOS arm64 与 x64 安装包。
- `npm run build:win`：构建 Windows x64 安装包。

主要技术栈：Electron、Preact、`@preact/signals`、esbuild、Vitest、Playwright。

更多项目文档：

- [用户功能手册](docs/user-features-guide.md)
- [UI 设计系统](docs/ui-design-system.md)
- [主题切换说明](docs/ui-theme-switching.md)
- [Release Notes 维护说明](docs/release-notes-howto.md)
- [历史设计规格](docs/superpowers/specs/)
- [版本记录](RELEASE-NOTES.md)

## 已知限制

- Linux 不受支持。
- Windows 当前只发布 x64 安装包。
- 自动升级能力取决于 Homebrew、winget 和各应用的数据源。
- 外部服务不可用、公司网络限流或代理配置可能导致部分模块刷新失败。
- 部分游戏平台或浏览模式可能暂时没有数据；标记为示例的内容不是实时价格。

## License

MIT
````

- [ ] **Step 2: 检查 README 篇幅和核心事实**

运行：

```bash
node - <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('README.md', 'utf8');
const lines = text.trimEnd().split(/\r?\n/).length;
if (lines < 120 || lines > 180) {
  throw new Error(`README line count ${lines}, expected 120-180`);
}
const required = [
  '个人桌面信息中心',
  'docs/user-features-guide.md',
  'GitHub Releases',
  'Windows 当前只发布 x64 安装包',
  'npm run build:mac',
  'npm run build:win',
  'safeStorage',
];
for (const item of required) {
  if (!text.includes(item)) throw new Error(`missing README fact: ${item}`);
}
console.log(`README facts: OK (${lines} lines)`);
NODE
```

Expected: 输出 `README facts: OK`，行数在 120–180 之间，退出码为 0。

---

### Task 3: 交叉验证两份文档

**Files:**

- Verify: `README.md`
- Verify: `docs/user-features-guide.md`
- Reference: `docs/superpowers/specs/2026-07-17-readme-rewrite-design.md`

**Interfaces:**

- Consumes: Task 1 与 Task 2 的最终文档
- Produces: 无失效链接、旧版本、过期 Provider、旧导航和占位内容的可交付文档集

- [ ] **Step 1: 运行常青内容与术语检查**

运行：

```bash
node - <<'NODE'
const fs = require('fs');
const files = ['README.md', 'docs/user-features-guide.md'];
const docs = files.map((file) => [file, fs.readFileSync(file, 'utf8')]);
const forbiddenText = [
  'Pulse-2.46.0',
  'Pulse-Setup-2.19.0',
  'docs/screenshots/CAPTURE.md',
  'OpenAI',
  'Anthropic',
  'Windows arm64 安装包',
];
const placeholderText = ['TO' + 'DO', 'TB' + 'D'];
for (const [file, text] of docs) {
  for (const token of [...forbiddenText, ...placeholderText]) {
    if (text.includes(token)) throw new Error(`${file}: forbidden text ${token}`);
  }
  if (/\bv\d+\.\d+(?:\.\d+)?\+?/i.test(text)) {
    throw new Error(`${file}: version-bound feature label found`);
  }
}
const names = ['首页', '新闻', '世界杯', '投资', 'AI 用量', '版本检查', 'GitHub 收录', '游戏优惠'];
for (const name of names) {
  for (const [file, text] of docs) {
    if (!text.includes(name)) throw new Error(`${file}: missing module ${name}`);
  }
}
console.log('evergreen terminology: OK');
NODE
```

Expected: 输出 `evergreen terminology: OK`，退出码为 0。

- [ ] **Step 2: 验证全部相对 Markdown 链接存在**

运行：

```bash
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const files = ['README.md', 'docs/user-features-guide.md'];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of text.matchAll(re)) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || /^(https?:|mailto:)/i.test(href)) continue;
    const target = decodeURIComponent(href.split('#')[0]);
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      throw new Error(`${file}: missing link target ${href}`);
    }
  }
}
console.log('relative links: OK');
NODE
```

Expected: 输出 `relative links: OK`，退出码为 0。

- [ ] **Step 3: 检查 Markdown 空白错误和最终差异范围**

运行：

```bash
git diff --check -- README.md docs/user-features-guide.md docs/superpowers/specs/2026-07-17-readme-rewrite-design.md
git diff --stat -- README.md docs/user-features-guide.md docs/superpowers/specs/2026-07-17-readme-rewrite-design.md
```

Expected:

- `git diff --check` 无输出并以 0 退出。
- `git diff --stat` 只展示 README、用户手册和已批准规格的文档改动。
- 不运行完整 Vitest 或 renderer 构建，因为本次没有运行时代码改动。

- [ ] **Step 4: 人工交叉核对最终文案**

逐项确认：

- README 保持产品首页角色，未复制用户手册的大段操作细节。
- 用户手册所有操作都能在当前界面找到入口。
- 新闻和投资使用合并后的一级导航结构。
- 贵金属明确为纯行情看板。
- 游戏优惠明确区分折扣、免费活动和热门榜。
- Windows 只写 x64；macOS 写 arm64 与 x64。
- AI 内容生成与 AI 用量监控的 Provider 范围没有混淆。
- 版本检查未承诺延后、版本历史、行级回滚或应用行关注。
- 两份文档没有截图占位、旧安装包版本或失效相对链接。
