# 游戏免费活动多数据源设计

## 目标

- 将“喜 +1 免费领”改名为“免费活动”。
- Epic、Steam、Xbox 的真实免费活动统一展示在该标签中。
- Steam 包含直接免费入库、Key 赠送和免费周末。
- Xbox Free Play Days 标记为“限时试玩 / 需 Game Pass”，不冒充永久入库。
- 后台检查与桌面通知覆盖 Epic、Steam、Xbox。
- 本轮不改变热门 Top10 的数据与排序逻辑。

## 数据源

Epic 继续使用现有 `freeGamesPromotions` 官方公开接口。

Steam 使用 GamerPower 无鉴权 REST API，并只接收 `platform=steam&type=game` 的活动。活动根据返回标题、描述和领取说明分类为直接免费入库、Key 赠送或免费周末。该分类是启发式判断，数据模型保留提供方和原始领取链接，界面展示 GamerPower 署名。

Xbox 使用 Microsoft Store 内部公开的 `collection/FreePlayDays` 列表获取商品 ID，再通过 Display Catalog 批量补齐标题、图片和商店链接。该接口不是正式开放 API；请求失败或结构变化时返回空列表，不使用示例活动兜底。

## 统一数据模型

在现有 `GameDeal` 上增加以下可选字段：

- `promotionType`: `giveaway`、`key`、`free-weekend` 或 `free-play-days`
- `requirements`: 领取条件或资格说明
- `provider`: 活动数据提供方

所有免费活动继续使用 `isFree: true`。现有 Epic 数据映射为 `giveaway`；Steam 根据活动内容分类；Xbox 固定映射为 `free-play-days`。

## 聚合与展示

`mode=free` 时按所选平台请求对应免费活动数据：

- Epic：官方免费游戏
- Steam：GamerPower Steam 活动
- Xbox：Microsoft Free Play Days
- PlayStation、Switch：本轮返回空列表

免费活动按结束时间升序排列，无结束时间的活动排在最后。卡片根据 `promotionType` 展示“免费入库”“Key 赠送”“免费周末”或“限时试玩”，并在有值时显示领取条件。页面底部在出现 GamerPower 数据时展示署名。

免费活动只按稳定活动 ID 去重；同一游戏在不同平台的活动分别保留，避免丢失任一领取入口。

普通折扣模式继续排除 `isFree`；热门 Top10 保持当前行为。

## 后台检查与通知

调度器改为请求全部平台的 `mode=free` 聚合结果，而不是只请求 Epic。已通知集合继续按稳定活动 ID 去重。通知标题改为“游戏免费活动”，正文包含平台和活动类型；点击通知仍跳转到“免费活动”标签。

单个平台请求失败不得阻断其他平台结果。全部平台都失败时返回空列表并等待下一轮调度，不发送错误通知。

## 边界与限制

- GamerPower 可能包含有数量限制或额外任务的 Key 活动，界面必须展示领取条件。
- Steam 活动类型分类使用文本启发式；已知上限是上游文案变化，升级路径是上游提供结构化活动类型后改为直接映射。
- Xbox Free Play Days 通常要求 Game Pass，且只提供临时游玩权。
- 不抓取小黑盒内部接口，也不依赖第三方 GitHub 项目的托管服务。
- 不新增运行时依赖。

## 验证

- 单元测试覆盖 GamerPower 三种 Steam 活动分类、无效响应和稳定 ID。
- 单元测试覆盖 Xbox 商品 ID 与 Display Catalog 映射、请求失败回退。
- 聚合测试确认各平台免费活动合并、单源失败隔离、PS/Switch 为空。
- 渲染测试确认标签改名、活动类型和领取条件展示。
- 调度器测试确认跨平台去重、通知文案和点击跳转。
- 运行完整 Vitest 套件与 renderer 构建。
