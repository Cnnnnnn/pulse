# v2.7.0 → v2.7.1: Library UI Polish Design Spec

> **Status**: ✅ 已实施 (v2.7.1 commit b7cd74d)
> **Date**: 2026-06-10
> **Scope**: v2.7.0 引入的 5 个新组件 (PinnedSection / LibrarySection / TagBar / TagInput / DetectorWizardModal) 视觉打磨
> **设计目标**: 跟现有 Pulse 视觉语言对齐 (macOS light theme, #007aff 主色, 13px/500 字号, 150ms ease), 不引入新 design token, 不换技术栈 (仍 vanilla CSS 变量 + Preact)

## 已知 patch (v2.7.1.1)

### Fix: DetectorWizardModal class 名跟项目其它 modal 不一致

**真机验时发现**: 我 v2.7.0/v2.7.1 写 modal 用了 `class="modal"` / `class="modal-close"` / `<h2 class="modal-title">`, 但 Pulse 现有所有 modal (BulkUpgradeModal / AISettingsModal) 用的真实 class 是:
- `class="modal-card"` (有 `width: 560px` / `max-width` / `max-height: calc(100vh - 64px)` / `border-radius: var(--radius-lg)` / `box-shadow` 关键样式)
- `class="btn-close"` (有 `font-size: 20px` / `color: var(--text-tertiary)`)
- `<h2>` (无 class, 走 `.modal-header h2` 选择器)

**症状**:
1. modal 没居中, 没背景遮罩
2. 11 个 detector 排成 1 列 (不是 spec 的 2 列 grid) — 因为没限宽, 父容器窄到 1 列
3. modal 高度超过视窗, footer 被截, 浏览器滚动条反而出现
4. × 关按钮跟 stepper 行的 ① 撞位置

**修法**: 改 3 处 class 名 (`modal` → `modal-card`, `modal-close` → `btn-close`, `<h2 class="modal-title">` → `<h2>`), CSS 那边同名样式自动生效.

**教训**: v2.7.0/v2.7.1 实施时我没 grep 现有 modal 怎么用 class, 自己拍脑袋写了 — 拍脑袋风险. 下次写 modal 前先 grep 现有 modal.

---

## 1. 当前问题 (v2.7.0 验收截图)

1. **LibrarySection 行堆叠**: `appName / bundleName / version / bundleId` 全在两行 plain text, 视觉上像 debug dump, 不像产品
2. **未监控 29 app 贴脸平铺**: 没有 padding / 分组 / 分隔线, 用户看到 29 行连续行 = 信息过载
3. **"监控" / "忽略" 按钮**: 大块蓝底 + 灰底, 跟旁边 ⭐ 不对齐, 视觉权重失衡
4. **TagBar empty 状态**: "+ dev+ ai+ design" 灰色, 1px 高度, 不显眼, 用户看不到入口
5. **FilterBar chip**: ⭐ / 📦 跟 status tab 同色, 用户分不清 "这是状态 tab 还是 library 视角"
6. **空状态文案**: 0 匹配时直接显示 "✓ 所有已装 app 都在监控列表" 一行, 缺 icon / 留白 / 引导

## 2. 设计原则 (跟 Pulse 现有风格对齐)

### 2.1 设计 token (全部沿用 styles.css 现有变量, 不新增)

| 类别 | 变量 | 值 |
|---|---|---|
| **主色** | `--accent-blue` / `#007aff` | macOS 蓝, focus / primary button |
| **文本** | `--text-primary` | 主文本 |
| | `--text-secondary` | 次要文本 (副标题, count) |
| | `--text-tertiary` | 三级 (placeholder, disabled) |
| **背景** | `--bg-primary` | 页面底色 |
| | `--bg-card` | 卡片 / 输入框 |
| | `--bg-secondary` | 容器底 (tab group) |
| | `--bg-hover` | hover 态 |
| **边框** | `--border` | 分隔线 |
| **圆角** | `--radius-sm` | 4px (input, small) |
| **阴影** | `--shadow-sm` | 浅阴影 (active 态) |
| **字号** | `13px / 500` | tab / button |
| | `12px / 400` | count / meta |
| **过渡** | `150ms ease` | 通用 |

### 2.2 视觉规则

1. **层级靠 spacing + 圆角, 不靠颜色**: 用 `padding: 12px 16px`, 不用特别背景色
2. **action button 右对齐**: 主操作 (`监控`) 跟次操作 (`忽略`) 间距 8px
3. **count 用 tabular-nums**: 数字不晃动
4. **active 态用 #007aff**: 跟 status tab 区分 — library chip 走 #FF9500 (orange) 或 #AF52DE (purple)? 决定用 #FF9500 — ⭐ 语义天然 "favorite / warm"
5. **空状态必须有 icon + 引导**: 跟 WeeklyBanner / BulkUpgradeModal 现有空状态对齐 (96px icon circle + 标题 + 副标题 + action)

## 3. 各组件设计

### 3.1 LibrarySection (主战场)

**当前**: 29 个 app 贴脸堆叠, 行高 50px, 无 card
**目标**: card 化 + 紧凑网格 + 空状态 icon

```
┌─────────────────────────────────────────────────────────────┐
│  📦 未监控的应用                              ↻ 重新扫描     │  ← header: 24px padding
│  29 个等你加进监控                                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Acrobat Reader           [⭐] [👁 监控] [忽略]          ││  ← 48px 行, card
│  │  Adobe Acrobat Reader.app · v26.001 · com.adobe.Reader ││     12px 副标题
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │  AgentDeck                [⭐] [👁 监控] [忽略]          ││
│  │  AgentDeck.app · v0.1.0 · com.agentdeck.desktop         ││
│  └─────────────────────────────────────────────────────────┘│
```

#### 3.1.1 行布局
- **卡片化**: 每个 app 一张 card (`background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 16px`)
- **行高**: 48px 主行 + 14px 副标题 = 62px total
- **主行**: 左侧 appName 14px / 600, 右侧 button group 右对齐, gap 8px
- **副标题**: 12px / 400 / `--text-tertiary`, `bundle · version · bundleId` 用 `·` 分隔
- **hover**: 整行 `background: var(--bg-hover)`, button 不变
- **已 pin 行**: 左侧加 `⭐` 图标小标, 卡片左边框 2px `var(--accent-blue)`
- **已 ignored 行**: opacity 0.5 + 灰

#### 3.1.2 按钮 group
| 按钮 | 形态 | 颜色 |
|---|---|---|
| ⭐ pin | icon-only 28x28px | ghost 默认, primary active (有 ⭐) |
| 👁 监控 | sm 按钮, 文字 | `primary` 蓝填充 |
| 忽略 | sm 按钮, 文字 | `ghost` 默认, disabled "已忽略" |

#### 3.1.3 header
- 标题: "📦 未监控的应用" 16px / 600
- count badge: 紧跟标题, 12px / `--text-secondary`, `· 29 个等你加进监控`
- 右侧: `↻ 重新扫描` 按钮 (sm, ghost)

#### 3.1.4 空状态 (0 匹配)
- 96px 圆 icon ✓
- 标题: "所有已装 app 都在监控列表"
- 副标题: "装了新 app 后点 ↻ 重新扫描能看到"
- 居中, 64px padding

#### 3.1.5 间距
- 卡片之间: `margin-bottom: 8px`
- 整个 section: `padding: 16px 24px`
- 跟 FilterBar 视觉连续, 跟 ResultsView 区分 (左侧 4px border-bottom 用 `--border`)

### 3.2 PinnedSection (顶部 chip 区)

**当前**: 单行 chip 横条, 简单
**目标**: 跟 FilterBar 视觉连贯, 但显著区别 (sticky 顶部 / 浅蓝底)

```
┌─────────────────────────────────────────────────────────────┐
│  ⭐ 我关注的                            只看这些 →            │
│  [Cursor ×] [Kimi ×] [MiniMax Code ×] [WorkBuddy ×]         │  ← 36px 高
└─────────────────────────────────────────────────────────────┘
```

- 容器: `background: rgba(0, 122, 255, 0.04); border-bottom: 1px solid var(--border); padding: 8px 24px`
- 标题: `⭐ 我关注的` 13px / 500, 紧跟 pinned 数量
- 右侧: `只看这些 →` ghost button
- chip: 28px 高, 12px 字号, `border-radius: 14px` (胶囊), `background: var(--bg-card)`, hover 暗一点
- chip 的 `×` 按钮: 8px 圆形, hover 红
- 无 pinned: 整 section 不渲染 (跟现状一致)

### 3.3 TagBar

**当前**: 单行小字, 视觉权重低
**目标**: 跟 PinnedSection 同行 / 同行下方, 视觉一致, 区分 (无 emoji / 颜色)

```
┌─────────────────────────────────────────────────────────────┐
│  tag: [dev 2] [ai 1] [design 1] [work 3] [media 1]  清空 × │
└─────────────────────────────────────────────────────────────┘
```

- 容器: `padding: 6px 24px`, 跟 PinnedSection 合并到一条 (gap 16px, 用 `flex-wrap`)
- 标签: `tag:` 12px / 500, 灰
- chip: 26px 高, 12px 字号, `background: var(--bg-secondary)`, active 时 `background: #007aff; color: #fff`
- 清空: 12px / 灰, hover 红

#### 3.3.1 empty 状态
- 容器保留, 显示 3 个 popular 灰 chip: `+ dev` `+ ai` `+ design`
- 12px 提示: "点 app 行的 + tag 加 tag"

### 3.4 TagInput (单 app 行内)

**当前**: 输入框 + chip 列表挤一行
**目标**: chip 横排 + 圆形 + button, 跟 status tab 视觉同源

```
  [dev ×] [ai ×] [+ tag]  ← 单行, 36px 高
```

- chip: 24px 高, 11px 字号, `border-radius: 12px` (胶囊)
- + tag 按钮: ghost, 12px, 28px 高
- input 展开: 80px 宽, 12px 字号, focus 边框 1px `#007aff`

### 3.5 DetectorWizardModal

**当前**: 11 detector 卡 + 字段表, 结构 OK 但视觉太"data form", 不像 wizard
**目标**: 加 wizard 步骤感 (step 1 选 type → step 2 填字段 → step 3 确认), 视觉 stepper 走顶部

#### 3.5.1 三步 stepper
```
┌─────────────────────────────────────────────────────────────┐
│  ① 选 detector  ──── ② 填字段  ──── ③ 确认                  │  ← 顶部 64px
└─────────────────────────────────────────────────────────────┘
```

- 步骤圆: 24px 圆形, 1-2-3, active 蓝, done 蓝填充+✓, future 灰
- 步骤名: 12px / 500, 跟圆水平
- step 1: 选 detector (现在的大 grid)
- step 2: 填字段 (现在的字段表)
- step 3: 确认 + preview ("将添加 Cursor 到监控")

#### 3.5.2 detector card 视觉升级
- 现状: 全等宽 11 个 card 一行 (横排)
- 改: 2 列 grid, 每张 140x80px, icon + label + 一句话 hint
- hover: 边框 1px `#007aff`
- active: 背景 `rgba(0, 122, 255, 0.08)`, 边框 1px `#007aff`, 右上角 ✓

#### 3.5.3 字段
- 现状: label + input 上下排
- 改: label 12px / 500 在 input 上方 4px, input 32px 高, 跟现有 BulkUpgradeModal 一致

#### 3.5.4 footer
- 现状: [取消] [保存并监控]
- 改 (3 步): [← 上一步] (step 2-3 显示, step 1 隐藏)  [取消] [下一步 →] / [保存并监控] (step 3)
- 取消按钮移到右上角 (×)

## 4. 实施顺序

| # | 任务 | 文件 | 估计 |
|---|---|---|---|
| 1 | styles.css 加 .library-section / .pinned-section / .tag-bar / .tag-input / .wizard-* 类 | `styles.css` | 30min |
| 2 | LibrarySection.jsx 重构 (card 化, 行布局, 空状态) | `LibrarySection.jsx` | 30min |
| 3 | PinnedSection.jsx 微调 (加 padding, chip 圆角) | `PinnedSection.jsx` | 10min |
| 4 | TagBar.jsx 改 empty 状态 (popular 灰 chip) | `TagBar.jsx` | 10min |
| 5 | TagInput.jsx 视觉统一 (chip 圆角, 字号) | `TagInput.jsx` | 10min |
| 6 | DetectorWizardModal.jsx 3 步 stepper + 2 列 grid | `DetectorWizardModal.jsx` | 40min |
| 7 | 跑测试 + build + 真机验 | (全套) | 20min |

**总**: ~2.5h

## 5. 不做的 (跟 v5 草稿的边界)

- ❌ 拖拽 manual reorder (v2.7.0 已知 follow-up)
- ❌ bundleId → detector 自动推荐 (v2.7.0 已知 follow-up)
- ❌ dark mode (Pulse 还没这能力)
- ❌ 动画 / 过渡 (除现有 150ms ease)

## 6. 测试策略

- 跑全套 1041 个测试, 0 失败 (改视觉不动 logic)
- 跑 esbuild, bundle size 增加 < 5kb (CSS 加几行, JSX 重排)
- 真机验: 重点看 29 app 列表视觉感受, 不爆框
