# README 截图采集

README.md 在 GitHub 仓库首页直接展示, **有图比没图转化率高 50%** (Pinterest 2015 数据, 2026 仍然成立 — text-only README 的 star rate 显著低于有 hero image 的).

本目录是 Pulse 主仓库 README 用的 4 张截图的来源, **每次重大 UI 变化都需重新截一次** (e.g. 升 major version / 重做主题 / 改布局).

## 4 张图

| 文件名 | 内容 | 何时截 |
|---|---|---|
| `main-window.png` | 主窗口: 顶部 category tab + app 列表 (有几行有 "升级" 按钮, 几行 "已是最新") | 任何 v2.x stable release |
| `tray-menu.png` | macOS 菜单栏 tray icon 展开后的菜单 (含 "打开面板" / "检查更新" / stale 提示 / AI 用量 / 退出) | 加新 tray 行后 (e.g. P52 自更新 / stale) |
| `ai-summary.png` | AIUsagePage 或 ChangelogSummary 的真实截图, 显示 👍/👎 按钮 + AI 提炼文案 | 改 A8 反馈 UI 后 |
| `digest-drawer.png` | DigestDrawer 展开, 显示某天的"今日要点 + AI 摘要 + 升级建议" | 改 digest UI 后 |

## 截图步骤 (macOS)

### 准备

```bash
# 1) 启动 dev 模式 (用真实数据, 不用 production)
cd /Users/shien.liang/Desktop/AppUpdateChecker-Electron
npm run dev

# 2) 触发一次完整 check (填充 has_update 状态)
# 在主面板点 "检查更新" 或 ⌘R
```

### 截主窗口

```bash
# macOS 自带截屏快捷键: ⌘⇧4 然后空格 (窗口模式)
# 或 cmdline:
screencapture -o -W docs/screenshots/main-window.png
# -o: 阴影
# -W: 点窗口
# 选 Pulse 主窗口

# 然后裁剪窗口白边:
# 1. Preview 打开 → Tools → Adjust Size → 1440x? (16:9 缩略图, 实际可 2x retina)
# 2. 导出 PNG, optimize: optipng -o7 docs/screenshots/main-window.png
```

### 截 tray 菜单

```bash
# macOS 不支持 cmdline 直接截 NSMenu. 三选一:
# A) ⌘⇧4 区域截图, 手动框出菜单区域
# B) 在 app 内部加 dev-only hotkey (e.g. ⌘⌥T 触发 capture) — 维护成本高
# C) 用 AppleScript 弹出菜单再截:
osascript -e 'tell application "System Events" to tell process "Pulse" to click menu bar item 1 of menu bar 2' 2>&1
sleep 1  # 等菜单完全展开
screencapture -o docs/screenshots/tray-menu.png
# 注意: macOS 13+ 需要辅助功能权限, 第一次会弹窗
```

### 截 AI summary / digest

```bash
# AIUsagePage 单独截图:
# 1. 在 app 内点 "📊 AI 用量" (或 sidenav 切到 AI 用量页)
# 2. ⌘⇧4 选窗口
screencapture -o -W docs/screenshots/ai-summary.png

# DigestDrawer 单独截图:
# 1. 在 app 内 ⌘⇧D 打开 daily digest
# 2. 等 AI 加载完 (1-2s)
# 3. ⌘⇧4 选窗口
screencapture -o -W docs/screenshots/digest-drawer.png
```

## 命名 + 尺寸规范

- 文件名: kebab-case + `.png`
- 尺寸: 1280-1600 宽 (16:10 / 16:9 适合 GitHub README 居中展示)
- 透明背景 ❌ (README 会变花)
- Retina (2x): 推荐, 4K 屏幕看更清
- 文件大小: < 500KB 最佳 (用 `optipng -o7` 压)
- 避免文字重叠: 截图前用 "全屏" 模式让 layout 自然撑开

## 后期

- 把图加到 README.md 的 "## 它做什么" 之前 (作为 hero)
- 加上 alt text: `![Pulse 主窗口: 12 个 app 的升级状态一览](docs/screenshots/main-window.png)`
- dark mode / light mode 各一份? GitHub README 跟随系统主题, 提供 2 张用 `<picture>` 标签切换 (见 GH docs)

## 自动化 (可选)

`scripts/capture-screenshots.cjs` 可以包成:

```js
// pseudocode — 需要 electron 启动 + 触发 IPC 切到目标页 + 等待渲染
const { app, BrowserWindow } = require('electron');
const screenshot = require('electron-screenshot');  // 第三方

app.whenReady().then(async () => {
  const win = new BrowserWindow({...});
  win.loadFile('index.html');
  await delay(2000);
  await win.webContents.executeJavaScript('window.cutToAIPage()');  // 业务方法
  await delay(1500);
  await screenshot({ output: 'docs/screenshots/ai-summary.png' });
  app.quit();
});
```

**但 4 张图的工作量不值得专门维护自动化脚本** — 截一次能撑 5-10 个版本. 真正的 ROI 在做
distribution 营销时 (Twitter / Reddit / Hacker News), 不在日常 dev 循环.

## 何时重新截

触发条件 (满足任一即重截):

- [ ] major version bump (e.g. 2.46 → 2.47)
- [ ] 改主面板布局 (新增 sidebar / 改 row 高度 / 改 theme)
- [ ] 加新的 AI provider / 反馈按钮 / changelog 板块
- [ ] 改 tray 菜单结构 (e.g. P52 自更新后多一行)

不触发:

- 修 bug
- 加单元测试
- 重构内部 module (renderer 输出不变)
- 新增 IPC channel
