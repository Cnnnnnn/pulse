# 游戏优惠数据源调研报告

> 调研日期：2026-07-17
> 触发：用户要求"继续探索 GitHub 看看还有没有"其他数据源
> 范围：PS 备选源、跨平台聚合器、各平台替代方案
> 方法：GitHub Search API（17 个 query）+ WebSearch + 源码深挖 + 可达性实测

## 一、核心结论

**当前五大平台数据源已是各自最优，无需替换。**

| 平台 | 当前源 | 状态 | GitHub 是否有更好替代 |
|---|---|---|---|
| Steam | CheapShark | ✅ live 40 条 | ❌ 无（CheapShark 是事实标准，132 仓库封装） |
| Epic | CheapShark | ✅ live 40 条 | ❌ 无（Epic 无公开 GraphQL API，CheapShark 是最佳聚合） |
| Xbox | ITAD（需 key） | ✅ live 40 条 | ❌ 无（ITAD 是唯一含 Microsoft Store 折扣的源） |
| **PlayStation** | **PSGameSpider** | ✅ **live 40 条**（本轮新落地） | ❌ **无**（PS 价格历史唯一开源源） |
| Switch | Nintendo Algolia | ✅ live 40 条 | ⚠️ DekuDeals 可选增强（沙箱不可达，待用户验证） |

---

## 二、GitHub 搜索覆盖

共 17 个搜索 query，评估 30+ 仓库：

| 角度 | Query | 结果数 |
|---|---|---|
| PS 价格追踪 | `playstation store price tracker` | 11 |
| PS 折扣 API | `psn api deals discount` | 0 |
| PS 爬虫 | `playstation store scraper` | 19 |
| 跨平台聚合 | `game deals aggregator multi platform` | rate limit |
| ITAD 替代 | `is there any deal alternative` | 17（多为无关） |
| CheapShark | `cheapshark api` | 132 |
| Epic 免费 | `epic games free games tracker` | 26 |
| Switch 价格 | `nintendo switch price tracker` | 8 |
| Steam 折扣 | `steam deals discount api` | 2 |
| awesome 列表 | `awesome game deals` | 2（无关） |
| Epic GraphQL | `epic games store api graphql` | 0 |
| PSN 历史 | `psn profiles price history` | 0 |

---

## 三、重点候选评估

### ✅ 已采纳：PSGameSpider（github.com/RavelloH/PSGameSpider）

- **62 ★，2026-07-17 当天仍在更新**
- 用 cheerio 爬 `store.playstation.com/{lang}/pages/browse` 全量游戏 + `#mfe-jsonld-tags` 提取价格
- **每日 GitHub Actions 自动跑**，数据以 JSON 发布在 raw.githubusercontent.com（不被 WAF 拦）
- 覆盖 14,903 个游戏、3,165 个当前折扣
- 我们只消费其 JSON，不自己爬 → 避开所有反爬
- **落地结果**：PS 从 7 条 → 40 条真实折扣

### ❌ 评估后未采纳

#### Ephellon/game-store-catalog（github.com/Ephellon/game-store-catalog）

- **五大平台全覆盖**：PSN 19k + Xbox 17k + Nintendo 14k + Steam 173k + Epic 5.8k
- ✅ JSON 通过 raw.githubusercontent.com 可直连，MIT，USD
- ❌ **不含折扣/原价/现价字段** —— 只有单一 `price`（当前价）
- ⚠️ README 声明 "Not updated regularly"（最近 2026-07-14）
- **定位**：不能做折扣源，但可作为未来"元数据补全"备用（封面/链接/平台/评分）

#### Ephellon/store-scraper（github.com/Ephellon/store-scraper）

- 今日（2026-07-16）更新，Python，五大平台 adapter
- ❌ 是 scraper 需自己跑 `crawl.bat` 生成 JSON，不是数据发布仓库
- 不适合直接消费

#### PSNScraper（github.com/ltarr/PSNScraper）

- 用 GraphQL `categoryGridRetrieve` + SHA256 hash
- ❌ 端点 `web.np.playstation.com/api/graphql/v1` 被 Akamai WAF 拦 403（实测确认）

#### ps-scraper（github.com/fabriciolak/ps-scraper）

- 8 ★，puppeteer headless 浏览器
- ❌ 需打包 puppeteer（Electron 体积爆炸），不可用于主进程

#### PyStation（github.com/paavoto7/PyStation）

- 作者自述 "some things are broken and don't seem to work as expected"
- ❌ 不可靠

#### psnprices（pypi.org/project/psnprices）

- 依赖 chihiro API（已知不暴露折扣字段）
- ❌ 数据源限制

#### thinakaranmanokaran/free_epic_games（59 ★）

- README 是 Vite 模板默认，质量存疑
- ❌ 我们 Epic 已通过 CheapShark live，无需替换

#### DekuDeals（deku.deals）

- 知名 Switch 价格追踪站，40+ 区服对比 + 价格历史
- ⚠️ **沙箱 DNS NXDOMAIN 不可达**（`www.deku.deals` 无法解析）
- 用户本机或许可访问；若可达且有 API，可比 Algolia 更优（含价格历史）
- **定位**：可选增强，非阻塞（Switch 当前已 live 40 条）

---

## 四、各平台数据源权威性确认

### PlayStation
- `psn api deals discount` → 0 结果
- `psn profiles price history` → 0 结果
- **PSGameSpider 是 GitHub 上唯一提供 PS 价格历史的开源数据源**
- PSGameSpider 本身用 cheerio 爬官方商店（避开 WAF），我们消费其 JSON（避开反爬）—— 双重规避

### Steam / Epic
- `cheapshark api` → 132 个仓库封装 CheapShark
- `epic games store api graphql` → 0 结果（Epic 无公开 GraphQL）
- **CheapShark 是事实标准**，无更好替代

### Xbox
- ITAD 文档确认：deals/prices 只收录 Microsoft Store(Xbox)，PS Store/Nintendo eShop 无数据
- **ITAD 是 Xbox 折扣唯一可行源**

### Switch
- Nintendo Algolia 是官方免密搜索后端
- DekuDeals 可选（沙箱不可达，待用户验证）

---

## 五、可选增强（非阻塞，待用户决定）

1. **DekuDeals（Switch 价格历史）** —— 用户本机验证 `https://www.deku.deals/` 可达性后，可评估是否有 API；若有，可比 Algolia 多给价格历史维度。
2. **game-store-catalog 元数据补全** —— 当某游戏缺封面/链接时，查 `raw.githubusercontent.com/Ephellon/game-store-catalog/main/{platform}/!.json` 补全（需写一个 enrich 函数）。

---

## 六、本轮未改代码

纯调研，未修改任何源码。PSGameSpider 接入在上一轮已完成（见 `2026-07-17.md` 记忆"PlayStation 接入 PSGameSpider 突破"段落）。

---

**调研人**：UI Designer（像素君）
**调研日期**：2026-07-17
**结论**：当前数据源配置已是各自最优，五大平台全部 live，无需进一步替换。
