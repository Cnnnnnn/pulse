# Pulse

面向 macOS 与 Windows 的个人桌面信息中心：以应用版本检查与升级为核心，同时整合新闻、投资行情、世界杯、AI 用量、GitHub 项目和游戏优惠。

Pulse 常驻系统托盘，把分散在不同应用和网站里的日常信息集中到一个桌面窗口中。主要数据保存在本机；需要联网的模块只在获取对应内容时访问外部服务。

## 核心能力

| 模块 | 能力 |
| --- | --- |
| 首页 | 汇总模块状态、未读角标、收藏和快捷入口 |
| 新闻 | 整合 IT 新闻与微博热搜 |
| 世界杯 | 查看赛程、球队、进球榜和淘汰赛对阵 |
| 投资 | 管理基金，查看贵金属行情，并进行选股分析 |
| AI 用量 | 监控 MiniMax 与 GLM 编程套餐配额和趋势 |
| 版本检查 | 检测应用更新，并通过支持的升级路径执行升级 |
| GitHub 收录 | 建立本地开源项目库，跟踪 README 与 Release |
| 游戏优惠 | 聚合多个平台的折扣、免费活动和热门榜 |
| AI 榜单 | 按厂商 / 维度（ELO、智能指数、代码、数学、推理、性价比）筛选主流大模型排名 |

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

当前发布流程提供 **x64** NSIS 安装包，适用于主流 Intel 与 AMD Windows 设备。暂不提供原生 Windows arm64 构建。

安装步骤：

1. 下载文件名包含 `x64` 的 EXE。
2. 双击安装包，并按向导选择安装目录。
3. 如需自动升级已安装应用，请确认系统可使用 winget。

## 快速开始

1. 启动 Pulse，从首页进入需要的模块。
2. 打开“版本检查”，首次使用时点击“运行首次检查”。
3. 在“版本检查 → 设置”中调整主题、GitHub、游戏和 AI 配置。
4. 使用 `⌘/Ctrl+K` 搜索新闻、AI 任务、提醒、基金和应用。

首页支持收藏、拖拽排序和 `⌘/Ctrl+1–9` 快速打开前九张卡片。更多快捷键和模块操作见 [用户功能手册](docs/user-features-guide.md)。

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

> **⚠️ `.env` 文件**：仓库根目录的 `.env`（已 gitignore，不入库）可能包含 `GITHUB_TOKEN` / `ITAD_API_KEY` / `ARTIFICIAL_ANALYSIS_API_KEY` 等真实凭据，供本地开发调用限流 API。请勿将其提交、截图或分享给他人；如凭据已泄露请立即在对应平台轮换。

### 可选 API Key

模块需要的凭据可在仓库根 `.env` 中配置（参考 `.env.example`）。所有 key 均为可选，缺失时对应模块会自动回退到示例数据，不会阻断启动。

| Key | 作用 | 缺失影响 |
| --- | --- | --- |
| `GITHUB_TOKEN` | GitHub 收录 / Release 追踪：解除未登录 60 次/小时限流 | 仍可浏览，但频繁调用可能被 GitHub 限流 |
| `ITAD_API_KEY` | 游戏优惠：Xbox（Microsoft Store）实时折扣 | Xbox 走示例数据；PlayStation / Switch 始终走示例数据 |
| `ARTIFICIAL_ANALYSIS_API_KEY` | AI 榜单：客观分 / 价格 / 速度维度（每日 1000 次） | AA 维度回退 GitHub 社区快照；Arena 主源与 OpenRouter 仍可用 |

### AI 榜单模块

数据来源：Arena AI 社区快照（ELO 主观评分）+ Artificial Analysis（客观分 / 价格 / 速度）+ OpenRouter（目录骨架兜底）。任意源失败都会自动降级，**全链路永不空白**；当所有源都不可用时回退内置示例数据，UI 用「示例」徽标明示非实时。

当前已上线：LLM / 多模态 / 代码 三个分类，ELO / 智能指数 / 代码 / 数学 / 推理 / 性价比 六个维度。
「图像生成」和「视频」分类 Tab 暂以「即将上线」占位（数据源覆盖不足），不会触发请求。模块设计详见 `docs/ai-leaderboard-architecture.md`。

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
- Windows 当前只发布 x64 安装包，原生 arm64 设备需通过兼容层运行 x64 版本。
- 自动升级能力取决于 Homebrew、winget 和各应用的数据源。
- 外部服务不可用、公司网络限流或代理配置可能导致部分模块刷新失败。
- 部分游戏平台或浏览模式可能暂时没有数据；标记为示例的内容不是实时价格。

## License

MIT
