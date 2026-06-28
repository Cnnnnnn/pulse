# Release Notes 发版流程 (ON 机制)

> 维护者发新版 Pulse 时必读。对应特性:ON (Release Notes Onboarding)。
> 设计 spec:`docs/superpowers/specs/2026-06-23-on-release-notes-onboarding-design.md`

## 行为速览

每个版本首次启动 → 自动弹一个多步向导(changelog + 重点功能 slides)。
唯一让"下次启动不再弹"的路径:**翻到最后页点【完成】→ 确认弹窗点【收到】**。
其余关闭方式(跳过 / ESC / 点遮罩 / 稍后再说)都只关掉当前窗口 → 下次启动还会弹。
Header 📖 按钮可随时手动重看(走 manual 入口,永不写"已看",不影响红点)。

判定真相:`state.json.last_seen_release.version` 是否等于 `app.getVersion()`。
不等就弹;相等就不弹。

## 发版必做清单

### 1. bump 版本号

`package.json` 的 `version` 字段改成新版本(如 `2.31.1` → `2.31.2`)。

```json
{
  "version": "2.31.2",
}
```

> **关键**:这是 wizard 判定"是否弹"的依据(`app.getVersion()` 读这里)。
> 没改版本号 → 升级后 version 不变 → 不弹。

### 2. 放 changelog md(必须)

在仓库 `versions/` 目录新建 `<新版本>.md`(参考 `versions/2.31.1.md` 模板)。

```markdown
# v2.31.2 — <一句话主题>

> 发版日期: 2026-06-24

## 新增
- **xxx**: 说明
## 优化
- ...
```

> **关键**:文件名必须跟 `app.getVersion()` 严格对应(带 `v` 不带 `v` 不影响,
> loader 按 `.release-notes-${version}.md` 拼)。忘了放 → `getCurrent` 返回 `null`
> → wizard 不弹(发版漏 md 的兜底,不报错,但用户看不到更新)。

### 3. 放 slides(可选)

新建 `src/release-notes-content/<新版本>/slides.json`。

```json
{
  "version": "2.31.2",
  "slides": [
    {
      "id": "feature-1",
      "title": "🚀 功能标题",
      "subtitle": "副标题",
      "body": "正文,**markdown lite** 支持 (加粗/列表/链接)",
      "screenshot": null
    }
  ]
}
```

| 字段 | 要求 |
|---|---|
| `version` | 必填,要跟目录名一致,loader 会校验 |
| `slides` | 必填数组,至少 1 个 |
| `slides[].id` | 必填唯一,测试断言用 |
| `slides[].title/subtitle/body` | 必填,走 marked + DOMPurify 安全渲染 |
| `slides[].screenshot` | 留位,本期始终 `null`(不渲染图) |

**降级行为**(缺/坏都不报错,只退化):
- 文件不存在 / JSON parse 失败 / `version` 字段缺 / `slides` 字段缺 → wizard 单页 changelog
- `slides: []`(空数组)→ 同上,单页

> **JSON 语法坑**:body 里有引号时用中文「」或转义 `\"`,别直接用英文 `"` 嵌在
> JSON 字符串里(parse 会炸,loader 静默返回 null 退化成单页,很难发现)。

### 4. 验证 loader 能读到

不用启动 app,直接 node 跑一下:

```bash
node -e "
const { readReleaseNotes, readSlides } = require('./src/release-notes/loader.js');
const v = '2.31.2';  // 换成你的新版本
console.log('md:', readReleaseNotes(v) ? 'OK' : 'NULL');
console.log('slides:', (() => { const s = readSlides(v); return s ? ('OK ' + s.slides.length + ' slides') : 'NULL'; })());
"
```

`md` 必须 `OK`,`slides` 可 `OK` 或 `NULL`(NULL = 单页模式)。

### 5. 跑测试

```bash
npx vitest run
```

ON 相关 5 个测试文件应全绿(state / loader / IPC / Wizard / Trigger)。

### 6. 手测(可选但推荐)

```bash
bash scripts/on-smoke.sh reset   # 清"已看"标记
bash scripts/on-smoke.sh run     # 启动
```

按 `bash scripts/on-smoke.sh <1-10>` 的指引逐项验证。

### 7. 出包

```bash
npm run build:mac   # 或 build:win / build:all
```

## 升级后用户的体验

```
覆盖安装 2.31.1 → 2.31.2
  → package.json 版本 = 2.31.2
  → state.json.last_seen_release.version 还是 2.31.1
  → 不等 → 启动自动弹 wizard
  → 用户看完点【完成】→【收到】
  → state.json.last_seen_release.version = 2.31.2
  → 下次启动不弹,直到 2.31.3
```

## 常见坑(踩过的)

1. **bump 了版本但没放 `.release-notes-<ver>.md`** → 不弹,也不报错。
   发版前一定跑第 4 步的 node 校验。

2. **slides.json 里用了英文引号没转义** → JSON parse 失败 → 退化单页,用户只看到
   changelog 看不到 slides。同样第 4 步能发现。

3. **改了 release notes 代码但没 rebuild renderer** → `npm run dev` / `build:mac`
   会自动 rebuild,但直接 `electron .`(跳过 prestart)不会。生产用 build 脚本。

4. **IPC 链断**(历史上踩过):`preload.js` 暴露 → `renderer/api.js` 包装 →
   `index.jsx` 调用,三处命名必须一致(当前是 `api.releaseNotes.getCurrent/Version/markSeen`
   嵌套形式)。单测会 mock 掉 api 模块,**掩盖生产链断**,所以发版前一定要真启动手测一次。

## 相关文件地图

| 文件 | 责任 |
|---|---|
| `src/release-notes/loader.js` | 纯函数读 md + slides.json,缺/坏返回 null |
| `src/main/release-notes.js` | IPC handlers: get-current / get-version / mark-seen |
| `src/main/state-store.js` | `getLastSeenRelease` / `setLastSeenRelease` |
| `preload.js` | 暴露 `releaseNotes: { getCurrent, getVersion, markSeen }` |
| `src/renderer/api.js` | 包装成 `api.releaseNotes.*` |
| `src/renderer/release-notes-store.js` | signals: open / entryPath / payload |
| `src/renderer/components/ReleaseNotesWizard.jsx` | 向导 modal + 完成确认 |
| `src/renderer/components/ReleaseNotesTrigger.jsx` | Header 📖 按钮 + 红点 |
| `scripts/on-smoke.sh` | 手测助手 |
| `versions/<ver>.md` | 每版本 changelog(仓库 `versions/` 目录) |
| `src/release-notes-content/<ver>/slides.json` | 每版本重点功能(可选) |
