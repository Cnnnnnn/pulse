# IT 新闻「分享卡片」设计 Spec

- **日期**: 2026-06-18
- **作者**: Mavis (brainstorming-2)
- **状态**: 待用户 review
- **项目类型**: macOS 菜单栏 Electron 应用 (Pulse v2.x)
- **目标特性**: IT 新闻 AI 总结完成后,多一个「📤 分享」按钮,将整张新闻卡片(含摘要)渲染为 1080×1080 PNG,自动写入系统剪贴板,用户用 ⌘V / Ctrl+V 粘贴到任意应用。

## 1. 背景

IT 新闻模块在 `src/renderer/ithome/`,现已有「✨ AI 总结」按钮(`NewsArticleRow.jsx`),总结后卡内可展开摘要。用户希望把这种"已经过 AI 浓缩"的优质内容,做成一张**视觉效果精美的图片**,方便分享到微信、Slack、Notion、小红书等场景。

## 2. 目标

1. 在已有 AI 总结的新闻卡片上,新增「📤 分享」按钮。
2. 点击后,**主进程**渲染一张 1080×1080 的 PNG,**包含**:来源标签 / 时间 / 大标题 / AI 摘要 / 关键词 chips / Pulse 水印。
3. PNG 直接写入**系统剪贴板**,用户 ⌘V 粘贴。
4. 不弹保存对话框(避免破坏"一键分享"的体感)。
5. 失败时 toast 提示,**不**留死按钮、不留半成品窗口。

## 3. 非目标 (YAGNI)

- 不做保存为文件 / 另存为 —— 剪贴板即最终交付
- 不做 PNG 历史记录
- 不做"分享到指定应用"深度集成(走系统剪贴板,系统负责下一步)
- 不做自定义主题 / 模板切换 —— 单一精美模板
- 不做 9:16 / 16:9 等多尺寸 —— 仅 1080×1080 正方形(适配主流社交平台)
- 不在 favorites tab 加分享按钮(同上,本设计范围仅 news 视图)
- 不在无 summary 状态加分享按钮(用户已确认"仅 AI 总结后")
- 不在分享卡片里塞原文链接 / 二维码(超出范围)

## 4. UX 行为

### 4.1 按钮出现条件

```
hasSummary === true  →  显示「📤 分享」按钮
hasSummary === false →  不显示
```

### 4.2 按钮位置

`NewsArticleRow.jsx` 的 foot 区,在「阅读原文」与「重新生成」之间:

```
[✨ 摘要] [阅读原文] [📤 分享] [重新生成]
                          ↑ 仅当 hasSummary 时显示
```

### 4.3 点击生命周期

```
[ready]   ─click─►   [sharing]
                       │ IPC invoke
                       │ (1~3s)
                       ▼
                  ┌─────────────┐
                  │ ok?         │
                  └──────┬──────┘
                yes/    \no
                /        \
        [ready]    [ready]  + toast(error)
        + toast(ok)
```

- 期间按钮 `disabled`,文案:`生成图片中…`
- 成功 toast:`✅ 已复制到剪贴板,可 ⌘V 粘贴`,3s 自动消失
- 失败 toast:`❌ 图片生成失败,请重试`,3s 自动消失
- 多次连点同一卡片:disabled 防抖生效
- 不同卡片之间**不**互锁

### 4.4 错误边界

| 场景 | 行为 |
|------|------|
| `summary.text` 为空 | 不显示按钮(防御,正常不应发生) |
| 主进程找不到 article | toast 错误,console 详细堆栈 |
| HTML 加载超时 (>10s) | 强制销毁窗口,toast 错误 |
| `capturePage()` 返回空 image | toast 错误 |
| `clipboard.writeImage` 抛错 | toast 错误 |

## 5. 架构

### 5.1 模块拆分(三个新模块 + 编辑)

#### a) `src/renderer/ithome/NewsShareCard.jsx` (新)
**职责:** 纯展示 Preact 组件,渲染 1080×1080 卡片布局。**无状态、无副作用**。

Props:`{ article, summary }`

#### b) `share-card.html` + `src/renderer/ithome/NewsShareCardPage.jsx` (新)
**职责:** 离屏渲染入口。独立 HTML 页只引用 `news-share-card.bundle.js`,挂载 `NewsShareCardPage`。监听 IPC `share-data`,收到后调 `<NewsShareCard>`,渲染完后设 `window.__renderReady = true`。

#### c) `src/main/ithome/share-card-renderer.js` (新)
**职责:** `createShareCardPng({ article, summary }) → Promise<Buffer>`。建隐藏 BrowserWindow → loadFile → 注入数据 → 等 `__renderReady` → capturePage → toPNG → destroy。

#### d) `src/main/ithome/clipboard-image.js` (新)
**职责:** `writePngToClipboard(pngBuffer) → void`,封装 `clipboard.writeImage(nativeImage.createFromBuffer(...))`。

#### e) `src/main/ipc/register-ithome-share.js` (新)
**职责:** IPC handler `ithome:share-card`,组装数据 → renderer → clipboard → 返回 `{ ok, bytes | reason }`。

### 5.2 数据流

```
NewsArticleRow 「📤 分享」按钮 onClick
  ↓
shareIthomeArticle(id)           // renderer store
  ├─ sharingIds.value[id] = true // 乐观锁
  ├─ window.api.ithomeShareCard({ id })  // IPC invoke
  ├─ await 结果
  ├─ sharingIds.value[id] = false
  └─ 弹 toast(ok | error)
  ↓ IPC invoke
register-ithome-share.js handle
  ├─ newsStore.getArticle(id)   // 主进程
  ├─ newsStore.getSummary(id)
  ├─ renderShareCard({ article, summary })
  │   ├─ new BrowserWindow({ show: false, 1080×1080 })
  │   ├─ win.loadFile("share-card.html")
  │   ├─ win.webContents.send("share-data", payload)
  │   ├─ await executeJavaScript("window.__renderReady")  // 10s 超时
  │   ├─ setTimeout(100)        // 留一帧 paint
  │   ├─ image = await webContents.capturePage()
  │   ├─ win.destroy()
  │   └─ return image.toPNG()
  ├─ writePngToClipboard(pngBuffer)
  └─ return { ok: true, bytes } | { ok: false, reason }
  ↓
renderer toast
```

### 5.3 IPC 契约

**`ithome:share-card`**
```js
// invoke
{ id: string }
// return
{ ok: true, bytes: number } | { ok: false, reason: string }
```

**`share-data`** (main → renderer,事件)
```js
{
  article: { id, title, link, category, pubDate },
  summary: { text: string, keywords?: string[], domain?: string, impact?: string }
}
```

## 6. 视觉规范

### 6.1 布局 (1080×1080)

```
┌─────────────────────────────────────────┐
│  渐变背景 #1e1b4b → #7c3aed             │
│  (40px 安全区内边距)                    │
│                                          │
│  ┌─ 顶部 meta ──────────────────────┐   │
│  │  [IT之家] [科技]  06-17 14:30    │   │  chip 行
│  └─────────────────────────────────────┘   │
│                                          │
│  ┌─ 大标题 (粗体 56px) ──────────────┐   │
│  │  Claude 4.5 发布,编程能力大幅提升  │   │
│  └─────────────────────────────────────┘   │
│                                          │
│  ┌─ 摘要卡 (半透明白底,圆角 16px) ─┐    │
│  │  Anthropic 正式发布 Claude 4.5... │    │
│  │  本次更新重点提升了 SWE-bench...  │    │
│  └─────────────────────────────────────┘   │
│                                          │
│  ┌─ 关键词 chips (紫底白字) ────────┐   │
│  │  #AI  #Claude  #编程              │   │
│  └─────────────────────────────────────┘   │
│                                          │
│  ┌─ 底部水印 (白 60%) ──────────────┐   │
│  │  ◆ Pulse · IT之家新闻速读          │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 6.2 色板

| 元素 | 颜色 |
|------|------|
| 背景渐变起 | `#1e1b4b` (深靛) |
| 背景渐变终 | `#7c3aed` (紫罗兰) |
| 标题 / 顶部 meta | `#ffffff` |
| 摘要卡背景 | `rgba(255, 255, 255, 0.92)` |
| 摘要卡文字 | `#1f2937` (深灰) |
| 关键词 chip 背景 | `#7c3aed` (紫罗兰) |
| 关键词 chip 文字 | `#ffffff` |
| 水印 | `rgba(255, 255, 255, 0.6)` |

### 6.3 摘要截断

- `summary.text.length ≤ 300` → 全部展示
- `> 300` → 截断到 300 字 + `...`
- 关键词 chips 最多取前 5 个
- 任一字段缺失 → 该区域不渲染(不要"暂无XX"的占位,渐变背景直接露出来)

### 6.4 字体

继承 `styles.css` 现有字体栈:
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
             "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
```

## 7. 文件改动

| 路径 | 操作 | 说明 |
|------|------|------|
| `src/renderer/ithome/NewsShareCard.jsx` | **new** | 分享卡片 Preact 组件 |
| `src/renderer/ithome/NewsShareCardPage.jsx` | **new** | 离屏页面入口,监听 `share-data` |
| `src/renderer/ithome/NewsShareToast.jsx` | **new** | 轻量 toast 组件 |
| `share-card.html` | **new** | 离屏渲染 HTML(引 `news-share-card.bundle.js` + `styles.css`) |
| `src/main/ithome/share-card-renderer.js` | **new** | 主进程:建窗口 → 渲染 → capturePage → Buffer |
| `src/main/ithome/clipboard-image.js` | **new** | 主进程:`clipboard.writeImage` 封装 |
| `src/main/ipc/register-ithome-share.js` | **new** | IPC handler:组装数据 → 渲染 → 写剪贴板 |
| `src/main/ipc/index.js` | edit | 注册 `ithome:share-card` IPC |
| `src/renderer/ithome/store.js` | edit | 新增 `sharingIds` signal + `shareIthomeArticle(id)` |
| `src/renderer/ithome/NewsArticleRow.jsx` | edit | 渲染「📤 分享」按钮 + 调 store + 渲染 toast |
| `preload.js` | edit | 暴露 `ithomeShareCard: (id) => invoke("ithome:share-card", id)` |
| `styles.css` | edit | 新增 `.share-card-*` 与 `.news-share-toast-*` 类 |
| `package.json` | edit | `build:renderer` 新增 entry 输出 `news-share-card.bundle.js` |
| `tests/renderer/ithome-news-share-card.test.jsx` | **new** | `<NewsShareCard>` 5 case |
| `tests/renderer/ithome-news-article-row.test.jsx` | edit | +5 case:按钮显示/隐藏/状态切换/toast |
| `tests/renderer/ithome-news-store.test.js` | edit | +2 case:`shareIthomeArticle` 信号 + 失败回滚 |
| `tests/main/ithome-share-card-renderer.test.js` | **new** | 超时 / 空 image / destroy 兜底 3 case |

## 8. 测试策略

### 8.1 单元 (renderer 组件, happy-dom)

**`ithome-news-share-card.test.jsx`**
1. 接收 `{ article, summary: { text: "x" } }` 渲染所有区段(顶部 meta / 标题 / 摘要 / 关键词 / 水印)
2. 摘要 > 300 字 → 截断到 300 字 + `...`
3. 关键词 8 个 → 只渲染前 5 个
4. 关键词 3 个 → 全部渲染
5. `summary.text` 空 → 摘要区不渲染(露背景)

### 8.2 组件 (NewsArticleRow, happy-dom)

**`ithome-news-article-row.test.jsx` (+5)**
1. `summary.text` 有 → 渲染「📤 分享」按钮
2. `summary.text` 无 → 不渲染分享按钮
3. 点击分享 → `sharingIds.value[id] === true`,按钮 disabled,文案 `生成图片中…`
4. IPC 成功 → toast 显示 `✅ 已复制到剪贴板`,`sharingIds[id] === false`,按钮恢复
5. IPC 失败(`{ ok: false, reason }`) → toast 显示 `❌ 图片生成失败`,`sharingIds[id] === false`,按钮恢复

### 8.3 Store

**`ithome-news-store.test.js` (+2)**
1. `shareIthomeArticle(id)` 同步设 `sharingIds[id] = true`,fire IPC,成功后清回
2. IPC reject → `sharingIds[id]` 清回,捕获错误

### 8.4 主进程

**`ithome-share-card-renderer.test.js` (vitest mock BrowserWindow)**
1. HTML 加载 / `__renderReady` 超时 (>10s) → 抛 `render_timeout`,窗口 `destroy` 被调
2. `webContents.capturePage()` 返回空 NativeImage → 抛错,窗口 `destroy`
3. 正常路径 → 返回 PNG Buffer(用 stub mock `capturePage` 返回预设 NativeImage)

## 9. 风险

| 风险 | 缓解 |
|------|------|
| macOS 某些 App 不支持粘贴 PNG | 平台限制,接受;toast 文案明示"复制到剪贴板" |
| `share-card.html` 路径 dev/prod 不一致 | 用 `app.getAppPath()` 拼绝对路径 |
| CJK 字体在离屏 BrowserWindow 显示异常 | 沿用 styles.css 现有字体栈;主窗口能渲染 → 离屏也能 |
| 1080×1080 在高 DPI 屏模糊 | `webPreferences.zoomFactor = 1` + 显式 width/height;CI/手动覆盖 1x 与 2x |
| 用户连点 5 次 → 5 个 BrowserWindow | renderer `sharingIds` 防抖;主进程同 id 互斥(后续优化,本期前端防抖够用) |
| 长时间运行离屏窗口泄漏 | `try/finally` 必 destroy;10s 超时保险 |
| macOS 沙盒权限 `clipboard.writeImage` | Electron 标准 API,无需权限声明 |
| `share-card.html` 漏引 styles.css | HTML 内 `<link rel="stylesheet" href="styles.css">` 显式声明 |
| `build:renderer` 多 entry 命名混乱 | bundle 输出 `renderer-dist/news-share-card.bundle.js`,HTML 路径对齐 |
| 摘要区超长溢出 1080 高度 | 前端截断 300 字,首版不做自适应高度 |

## 10. 实施顺序

1. **package.json + share-card.html + esbuild entry** —— 1h
2. **NewsShareCard.jsx 组件 + 样式** —— 1h
3. **NewsShareCardPage.jsx + `__renderReady` 通信** —— 0.5h
4. **share-card-renderer.js + clipboard-image.js** —— 1h
5. **IPC handler + preload 暴露** —— 0.5h
6. **NewsShareToast + store.js `shareIthomeArticle`** —— 1h
7. **NewsArticleRow.jsx 按钮接入** —— 0.5h
8. **全部测试 + 手动 smoke** —— 1h

**总计: ~6.5h**

## 11. 后续 (out of scope)

- 9:16 / 16:9 等多尺寸模板
- 主题切换(浅色 / 深色 / 自定义)
- PNG 历史记录面板
- 分享按钮位置自定义(标题旁 / 摘要旁)
- 摘要区高度自适应 + 多页 PNG
- 关键词区支持 hash 风格 / 自定义 chip
- favorites tab 同步加分享按钮
- 分享后埋点统计