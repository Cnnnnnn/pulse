# 附近美食推荐 功能 设计 Spec

- **日期**: 2026-06-22
- **作者**: Mavis (brainstorming)
- **状态**: 待用户 review
- **项目类型**: macOS / Windows 菜单栏 Electron 应用 (Pulse v2.x)
- **目标特性**: Pulse 新增 1 个独立 nav tab「附近美食」(🍜),用户输入位置或授权浏览器定位,获取当前位置附近的美食店铺列表,展示店名/距离/类型/评分/人均价。MVP 仅做基础列表。

---

## ⚠️ 数据源合规说明

本功能**调用大众点评公开搜索页面**以获取店铺评分信息。严格意义上,这可能违反其 `robots.txt` 与服务条款(ToS)。

- 仅供个人学习与本地使用
- 大众点评可随时调整反爬策略,功能可能随时失效
- Spec 维护者不承担数据准确性、商户推荐倾向性的责任
- 不发布到任何商业渠道 / 不作为公开服务

这一节必须在 spec 显眼位置,任何用户/PR reviewer 必须先看到再往下读。

---

## 1. 背景 & 目标

Pulse 是一个菜单栏 app 版本监控工具,在 v2.9+ 演进成多功能面板(worldcup / funds / metals / ai-usage / ithome / wechat-hot)。

用户新需求:在 Pulse 内能快速查看**当前位置附近的美食推荐**,整合高德地图(POI 数据,合规)与大众点评(评分/评论,数据更丰富)。

### 1.1 目标(MVP)

1. SideNav 加 1 个新 tab「🍜 附近美食」
2. 用户可手动输入位置(文字地址)或授权浏览器 Geolocation 获取坐标
3. 主进程并行调用 高德 around-search + 大众点评搜索 → 合并 → 返回前 30 条
4. 列表展示:店名 / 距离 / 类型 / 评分 / 评论数 / 人均 / 地址
5. Amap key 在 AI/集成 配置面板里配,safeStorage 加密存储(跟 AI key 一致)
6. per-location 内存缓存 30 分钟,避免重复请求

### 1.2 非目标(YAGNI)

明确不做,留作未来扩展(防止 scope creep):

- ❌ 不做菜系筛选(川菜/粤菜/日料...)
- ❌ 不做收藏 / 历史记录 / 想吃清单
- ❌ 不做地图预览 / 地图选点
- ❌ 不做"导航过去"按钮(只展示地址,用户复制)
- ❌ 不做评论区展示 / 用户评论读取
- ❌ 不做"分享给朋友"功能
- ❌ 不做后台预热(启动不自动拉,必须用户主动搜)
- ❌ 不做系统通知"附近新开了一家"
- ❌ 不联动 `recent-activity.js`(用户主动搜是 obvious 行为,不污染时间线)
- ❌ 不持久化 last-searched-location(位置敏感,默认不记)
- ❌ 不爬大众点评详情页(只爬搜索结果列表字段)
- ❌ 不接入美团(反爬更严 + API 申请门槛,留给未来)

---

## 2. UX 行为

### 2.1 首次进入(冷启动)

```
用户点 🍜 "附近美食" tab
  ↓
FoodHeader 显示: [位置输入框: ____________________] [📍 定位] [半径: 1000m ▾] [↻ 搜索]
FoodList 显示: EmptyState "请输入位置或授权定位"
  ↓
用户选其一: 输入文字 / 点 📍
  ↓
列表 Loading → 渲染结果
```

### 2.2 列表卡片 (FoodCard)

```
┌─────────────────────────────────────────────────────┐
│ 店名                                  850m · 步行    │
│ 类型: 川菜 · 人均 ¥85                               │
│ ⭐ 4.5 (328 评论) · 北京市朝阳区建国路 88 号         │
└─────────────────────────────────────────────────────┘
```

- **店名**: 高德 POI 字段(主),大众点评覆盖(辅助)
- **距离**: 高德 POI 返回的 distance 字段(米),自动换算显示 "850m" 或 "1.2km"
- **类型**: 高德 POI 的 `type` 大类(川菜/粤菜/...)
- **人均**: 大众点评字段,缺失时隐藏
- **评分 + 评论数**: 大众点评字段,**缺失时整行隐藏**(不显 "暂无评分")
- **地址**: 高德 POI 的 `address` 字段

### 2.3 交互

| 触发 | 行为 |
|---|---|
| 点 📍 定位按钮 | 调 `navigator.geolocation.getCurrentPosition` (10s 超时),成功后自动触发搜索 |
| 输入文字地址 | 防抖 600ms,自动触发 geocode → 搜索 |
| 切换半径 (500/1000/2000) | 自动重新搜索 |
| 切换排序 (距离/评分) | 仅前端重排,不发请求 |
| 点 ↻ 手动刷新 | 强制跳过 cache 重新拉 |
| 关闭 app | cache 清空(in-memory) |

### 2.4 Empty / Error / Loading 态

| 状态 | UI |
|---|---|
| 未配 Amap key | "请先在 ⚙️ AI/集成 配置里设置高德 API key" + 跳转按钮 |
| 没位置 | EmptyState:位置输入框 + 📍 按钮(已有,只是 placeholder) |
| 加载中 | Skeleton 卡片 × 5 |
| 无结果 | "附近 1000m 内暂无美食数据,试试扩大半径" |
| Amap 401/403 | Toast "高德 key 无效,请检查配置" |
| 大众点评失败 | 列表照常显示,评分字段整行隐藏 |
| 网络失败 | Toast "附近服务暂时不可达,稍后重试" + 自动 2 次重试(由 http-client) |

---

## 3. 架构

### 3.1 模块布局

```
src/
  main/
    food/                                  ← 新模块 (主进程)
      amap-client.js                       (高德 around-search + geocode 封装)
      dianping-scraper.js                  (大众点评搜索结果解析)
      food-aggregator.js                   (合并 POI + 评分,排序)
      food-cache.js                        (per-location TTL 30min 内存缓存)
      food-config.js                       (Amap key 持久化,走 safeStorage)
      amap-client.test.js                  (单测)
      dianping-scraper.test.js             (单测)
      food-aggregator.test.js              (单测)
      food-cache.test.js                   (单测)
    ipc.js                                 (+ 4 handlers: food:fetch-nearby / get-current-location / get-config / save-config)
    index.js                               (+ bootstrapFood() 启动)
  preload.js                               (+ foodFetchNearby / foodGetConfig / foodSaveConfig / foodHasConfig)
  renderer/
    food/                                  ← 新模块 (渲染进程)
      foodStore.js                         (4 signal: list / loading / error / config)
      FoodLayout.jsx                       (顶层布局: Header + List + Empty)
      FoodHeader.jsx                       (输入框 + 定位 + 半径 + 排序 + 刷新)
      FoodList.jsx                         (列表渲染)
      FoodCard.jsx                         (单卡片)
      FoodEmpty.jsx                        (空态:没 key / 没位置 / 无结果)
      foodStore.test.js                    (单测)
    components/
      AppShell.jsx                         (+ nav === 'food' ? <FoodLayout />)
      SideNav.jsx                          (+ NAV_ITEMS 加 food 项)
    worldcup/
      navStore.js                          (+ NAV_KEYS 加 'food')
    api.js                                 (+ food* pick)
```

### 3.2 数据流(单次 fetch)

```
FoodHeader 触发 search({ location, radius })
  ↓
window.api.foodFetchNearby({ location, radius })  ← preload 暴露
  ↓ IPC: food:fetch-nearby
main: handle('food:fetch-nearby')
  ├─ 解析 location:
  │     ├─ 文字 → amapClient.geocode(address) → {lat, lng}
  │     └─ 经纬度 → 直接用
  ├─ cache.get(key):
  │     ├─ HIT & 未过期 → 直接返回
  │     └─ MISS / 过期 → fetcher
  ├─ fetcher.fetchNearby({lat, lng, radius})
  │     ├─ 并行:
  │     │   ├─ amapClient.aroundSearch({location, radius, keywords: '美食'})
  │     │   │     → POI 列表 ~20
  │     │   └─ dianpingScraper.search({lat, lng, keyword: '美食'})
  │     │         → 评分补充 [{name, rating, reviewCount, avgPrice}]
  │     └─ aggregator.merge(pois, ratings)
  │           ├─ 店名 fuzzy match (Levenshtein ≤ 2 OR includes)
  │           ├─ 命中: 合并评分字段
  │           └─ 未命中: 仅 POI 信息
  ├─ 排序: 默认 distance asc,排序切换时前端重排
  ├─ 截断到 30 条
  ├─ cache.set(key, data, TTL=30min)
  └─ 返回 { list, locationLabel }
```

### 3.3 Geolocation 流程

> 注意:`navigator.geolocation` 是 **renderer-only** API,主进程不能直接调。

```
用户点 📍 定位按钮 (FoodHeader.jsx)
  ↓
navigator.geolocation.getCurrentPosition(success, error, {timeout: 10000})
  ├─ success({coords: {latitude, longitude}})
  │     ↓
  │     FoodHeader 拿到 lat/lng → 触发 fetchNearby({location: {lat, lng}, ...})
  │
  ├─ error(PERMISSION_DENIED) → Toast "已拒绝定位,请手动输入" + 输入框 focus
  ├─ error(POSITION_UNAVAILABLE) → Toast "定位失败,请手动输入"
  ├─ error(TIMEOUT) → Toast "定位超时,请手动输入"
  └─ 没 navigator (旧浏览器?) → 兜底手动输入
```

主进程**不参与** Geolocation。

---

## 4. IPC 通道设计

| 通道名 | 方向 | 参数 | 返回 |
|---|---|---|---|
| `food:fetch-nearby` | invoke | `{ location: string\|{lat,lng}, radius?: 500\|1000\|2000, sortBy?: 'distance'\|'rating', forceRefresh?: boolean }` | `{ list: FoodItem[], locationLabel: string, cachedAt: number }` 或 `{ error: 'no_key'\|'geocode_failed'\|'amap_error'\|'network' }` |
| `food:get-config` | invoke | — | `{ hasAmapKey: boolean }` |
| `food:save-config` | invoke | `{ amapKey: string }` | `{ ok: true }` 或 `{ error: 'invalid_key' }` |

> 注:food:get-current-location **不需要 IPC**,Geolocation 在 renderer 直接调。
>
> 注:Amap key 写入走 `safeStorage`,文件位置 `~/Library/Application Support/pulse/food_keys/amap.bin` (mode 0o600)。

### 4.1 FoodItem schema

```js
{
  id: string,             // 由主进程生成, hash(lat,lng,name)
  name: string,           // 高德 POI name (主)
  address: string,        // 高德 POI address
  location: { lat: number, lng: number },
  distance: number,       // 米
  type: string,           // 高德 type 大类
  rating: number|null,    // 0-5, 大众点评, 失败为 null
  reviewCount: number|null,
  avgPrice: number|null,  // 元
}
```

---

## 5. 关键设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 数据源 1 | 高德 POI around-search | 唯一合规路径,key 易申请 |
| 数据源 2 | 大众点评搜索结果 | 用户最关心的"评分/人均",无合规替代 |
| 爬取字段 | 仅搜索结果列表字段 (店名/评分/评论数/人均) | 详情页反爬更严,列表够用 |
| 文字定位 | 高德 geocode API | 复用 Amap key,无需额外集成 |
| POI 关键词 | 固定 "美食" | MVP 不做分类 |
| 搜索半径 | 默认 1000m,可选 500/2000 | 步行 15min 内为主,远近切换 |
| 数量上限 | 30 条 | 高德 around-search 默认 20,扩到 30 仍轻量 |
| 评分缺失 | 整行隐藏 | "暂无评分"信息密度低 |
| 缓存粒度 | per-location (key = round(lat,3)+round(lng,3)+radius) | 经纬度 3 位小数 ≈ 110m,容许小范围漂移 |
| 缓存 TTL | 30 分钟 | 跟项目其他模块(worldcup/ithome 几分钟 ~ funds/metals 几小时)同量级 |
| 缓存层 | 主进程 in-memory Map,LRU cap 100 | 不持久化(重启清空) |
| Key 配置入口 | ⚙️ AI/集成 配置面板里加 1 个 tab | 复用 safeStorage UI 模式 |
| 排序 | 默认距离 asc,可切评分 desc | 前端重排,不发请求 |
| 失败降级 | 大众点评失败 → 仅 POI,评分隐藏 | 不阻塞主流程 |
| Geolocation 超时 | 10s | 移动设备冷启动定位常 >5s |
| 防抖 | 输入文字 600ms | 平衡响应感 vs 误触发 |
| ponytail: 缓存容量 | LRU cap 100 条 | 单用户单进程,够用。超额场景是搜索几十个城市,放弃最旧的 |
| ponytail: fuzzy match | Levenshtein 距离 ≤ 2 OR includes | 大众点评店名常有 "(建国路店)" 后缀,includes 兜底 |
| ponytail: User-Agent | 自定义 desktop UA | 不模拟浏览器指纹,降低触发反爬的概率 |

---

## 6. 错误处理矩阵

| 场景 | 表现 | 处理 |
|---|---|---|
| 未配 Amap key | "请先在 ⚙️ AI/集成 配置里设置高德 API key" 引导卡 | FoodEmpty + 跳转 Settings 按钮 |
| Amap key 无效 (401/403) | Toast "高德 key 无效,请检查配置" | log error,用户自纠正 |
| Amap 网络失败 / 超时 | Toast "附近服务暂时不可达,稍后重试" | http-client 自带 2 次重试 |
| 大众点评爬虫失败 | 列表仍显示,评分行隐藏 | 静默降级,log warn |
| 大众点评反爬升级 | 列表正常显示,评分字段持续空 | log warn,不打扰用户 |
| Geolocation 拒绝授权 | Toast "已拒绝定位,请手动输入" | 输入框 focus |
| Geolocation 超时 | Toast "定位超时,请手动输入" | 同上 |
| Geolocation 不可用 | 不显示 📍 按钮,只让手动输入 | `typeof navigator.geolocation === 'undefined'` 时隐藏按钮(Electron BrowserWindow 默认支持,理论极端情况兜底) |
| 文字地址 geocode 失败 | 输入框旁小红字 "地址解析失败,换个写法" | 输入框不空,让用户改 |
| 地址搜索无结果 | "附近 1000m 内暂无美食,试试扩大半径" | 提示调半径 |
| 主进程异常 (catch-all) | Toast "附近服务异常" + log error | 不暴露内部错误细节 |

---

## 7. 测试策略

> ponytail 规则:非 trivial 逻辑留 1 个跑得通的最小测试。

### 7.1 主进程单测

| 文件 | 覆盖 |
|---|---|
| `food-aggregator.test.js` | merge 逻辑 4 case: 全命中 / 部分命中 / 全不命中 / 排序 |
| `food-cache.test.js` | TTL 过期 / key 命中 / LRU 淘汰 |
| `amap-client.test.js` | URL 拼接 + 错误归一 (用 stub http) |
| `dianping-scraper.test.js` | HTML 解析 (用 fixture 测 rating/reviewCount/avgPrice 抽取) |

### 7.2 渲染进程单测

| 文件 | 覆盖 |
|---|---|
| `foodStore.test.js` | signal 状态机: loading → data / loading → error 切换 |

### 7.3 不测

- UI 渲染 (项目惯例)
- IPC handler 端到端 (其他模块没测)
- happy-dom 集成 (其他模块没测)
- 大众点评真实抓取 (反爬升级不可控,只测 fixture)

---

## 8. 改动规模 & 文件清单

**新增 17 文件**:

主进程 (6 + 4 测试 + 1 fixture):
```
src/main/food/food-config.js
src/main/food/amap-client.js
src/main/food/dianping-scraper.js
src/main/food/food-aggregator.js
src/main/food/food-cache.js
src/main/food/index.js                  ← orchestrator (Task 6)
src/main/food/amap-client.test.js
src/main/food/dianping-scraper.test.js
src/main/food/food-aggregator.test.js
src/main/food/food-cache.test.js
tests/fixtures/dianping-search-sample.html
```

渲染进程 (2 + 5):
```
src/renderer/food/foodStore.js
src/renderer/food/foodStore.test.js
src/renderer/food/FoodLayout.jsx
src/renderer/food/FoodHeader.jsx
src/renderer/food/FoodList.jsx
src/renderer/food/FoodCard.jsx
src/renderer/food/FoodEmpty.jsx
```

**修改 5 文件**:

```
src/main/ipc.js                  (+ 3 food handlers)
src/main/index.js                (+ bootstrapFood)
preload.js                       (+ 4 food 暴露)
src/renderer/api.js              (+ food* pick)
src/renderer/components/AppShell.jsx     (+ food 分支)
src/renderer/components/SideNav.jsx      (+ food nav item)
src/renderer/worldcup/navStore.js        (+ 'food' key)
src/renderer/components/AISettingsModal.jsx  (+ 美食 key tab, 待评估; 或单独 FoodSettingsModal)
```

> AISettingsModal 是否扩展待 `writing-plans` 阶段确定:若增加 tab 会影响该组件,风险较高;可选独立 FoodSettingsModal(更安全,符合"最少改动")。

---

## 9. 风险 & 缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 大众点评反爬升级导致功能失效 | 高 | 中 | 评分字段静默降级,主流程不阻塞 |
| 高德 key 配额耗尽 | 低 | 中 | 免费配额 6000/日,个人够用;超限 toast 提示 |
| Geolocation 不可用 | 中 | 低 | 手动输入兜底 |
| IP 被大众点评封禁 | 中 | 中 | 默认 User-Agent 自定义,失败重试不激进 |
| 大众点评 ToS 法律风险 | 低 | 高 | spec 头部合规声明;不做分发;MVP 个人使用 |
| 经纬度精度导致 cache key 漂移 | 低 | 低 | round 3 位小数 ≈ 110m 容差 |
| 多 tab 同时 fetch 同一 location | 低 | 低 | 主进程串行 + cache 命中 |

---

## 10. 开放问题 (留待 plan 阶段细化)

1. AISettingsModal 是否扩展 vs 独立 FoodSettingsModal
2. 高德 key 申请文档链接是否需要内置在 spec(留 README 写)
3. 大众点评 fixture HTML 来源:实测抓 1 次保存,还是 mock?
4. Geolocation 在 Windows / macOS WebView 下的兼容性是否需要实测

---

## 11. 拍板项 checklist

- [x] 数据源: 高德 POI + 大众点评爬虫
- [x] MVP 范围: 基础列表
- [x] 定位: 手动输入 + Geolocation
- [x] 执行层: 主进程抓数据
- [x] Key 配置: Settings 里配, safeStorage
- [x] 缓存: 30min TTL
- [x] 模块边界: 自己独立目录 + IPC 通道
- [x] 错误处理: 全部失败路径
- [x] 测试: ponytail 最小覆盖
- [x] YAGNI: 12 项明确不做
- [x] 合规声明: 头部显眼位置
