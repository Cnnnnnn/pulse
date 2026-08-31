/**
 * 按当前 nav 动态推荐话术
 */
import { DIGEST_QUERY_PROMPT } from "../../shared/digest-labels.ts";
export function getChatSuggestions(activeNav: string): string[] {
  const base = ["有哪些应用需要更新？"];
  switch (activeNav) {
    case "invest":
      return [
        "我的基金盈亏怎样？",
        "黄金行情怎么样？",
        "推荐低估值选股策略",
        "这只股票诊断怎么样？",
        "搜索茅台股票",
        ...base,
      ];
    case "news":
      return [
        DIGEST_QUERY_PROMPT,
        "解读这篇财经新闻",
        "总结这篇 IT 资讯",
        "帮我搜一条新闻",
        ...base,
      ];
    case "ai-leaderboard":
      return ["AI 模型排名第一是谁？", "对比一下 GPT 和 Claude", ...base];
    case "versions":
      return [
        "检查一下更新",
        "把所有有更新的都升了",
        "明天上午9点提醒我开会",
        "帮我搜索 Chrome",
        ...base,
      ];
    case "github":
      return ["哪些 GitHub 项目有新 release？", "打开 GitHub 页", ...base];
    case "ai-usage":
      return ["Minimax 用量还剩多少？", "GLM 配额怎么样？", ...base];
    case "home":
      return [
        DIGEST_QUERY_PROMPT,
        "最近有什么热映电影？",
        "我有什么提醒？",
        "我的基金盈亏怎样？",
        ...base,
      ];
    case "movies":
      return ["最近有什么热映电影？", "即将上映有哪些？", "打开电影页", ...base];
    case "concerts":
      return ["我监控的演出票价怎样？", "有哪些演出在盯价？", "打开演出页", ...base];
    default:
      return [
        DIGEST_QUERY_PROMPT,
        "我有什么待办提醒？",
        "Minimax 用量多少？",
        "帮我搜索 Chrome",
      ];
  }
}
