/**
 * src/ai/assistant-tools-schema.ts
 *
 * Function Calling 工具 schema（OpenAI tools / Anthropic tools 共用描述）.
 */
import { NAV_REGISTRY } from "../shared/nav-keys";
import { PULSE_URI_CHEATSHEET } from "../shared/pulse-href";
import { DIGEST_UI_TITLE } from "../shared/digest-labels";

type JsonSchema = Record<string, unknown>;

function obj(
  props: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema {
  return { type: "object", properties: props, required };
}

const NAV_ENUM = ["home", ...NAV_REGISTRY.map((e) => e.key)];

export const ASSISTANT_TOOL_DEFS: Array<{
  name: string;
  description: string;
  parameters: JsonSchema;
}> = [
  {
    name: "pulse_open",
    description:
      "【推荐】Pulse UI 深链跳转。打开/跳转/详情页优先用此工具。href 为 pulse:// URI。速查：\n" +
      PULSE_URI_CHEATSHEET,
    parameters: obj({
      href: {
        type: "string",
        description:
          "pulse:// URI，如 pulse://nav/versions、pulse://movies/detail?title=八仙、pulse://overlay/search",
      },
    }, ["href"]),
  },
  {
    name: "navigate",
    description: "切换 Pulse 页面（可用 pulse_open 代替）",
    parameters: obj({
      nav: { type: "string", enum: NAV_ENUM, description: "目标模块" },
      tab: { type: "string", enum: ["funds", "metals", "stocks"], description: "投资子 tab" },
      route: { type: "string", enum: ["library", "settings", "diagnostics"], description: "版本检查子路由" },
      subTab: { type: "string", enum: ["ithome", "finance", "wechat-hot"], description: "新闻子 tab" },
    }, ["nav"]),
  },
  { name: "open_search", description: "打开全局搜索 (Cmd+K)", parameters: obj({}) },
  { name: "trigger_check", description: "触发 App 版本检查", parameters: obj({}) },
  {
    name: "open_settings",
    description: "打开设置页",
    parameters: obj({
      tab: { type: "string", enum: ["ai", "general"] },
    }),
  },
  {
    name: "open_digest",
    description: `打开${DIGEST_UI_TITLE}抽屉（含应用更新/热搜/资讯/基金/用量）`,
    parameters: obj({}),
  },
  {
    name: "open_reminders",
    description: "打开提醒事项弹窗",
    parameters: obj({}),
  },
  { name: "query_apps", description: "查询已监控 App 更新状态", parameters: obj({}) },
  {
    name: "search",
    description: "全局搜索应用/基金/新闻等",
    parameters: obj({
      q: { type: "string", description: "搜索关键词" },
      source: { type: "string", enum: ["app", "fund", "news", "reminder", "ai-task"] },
    }, ["q"]),
  },
  { name: "list_nav", description: "列出可导航模块", parameters: obj({}) },
  { name: "query_funds", description: "查询基金持仓与盈亏", parameters: obj({}) },
  {
    name: "query_digest",
    description:
      `查询${DIGEST_UI_TITLE}：汇总今日变化（应用可升级、微博热搜、IT 头条、基金异动、AI 用量）。用户说要点/早报/日报/今天有什么变化时用；不是单独拉新闻列表`,
    parameters: obj({}),
  },
  {
    name: "query_leaderboard",
    description: "查询 AI 模型榜单排名",
    parameters: obj({
      category: { type: "string", enum: ["text", "vision", "code"] },
      limit: { type: "number" },
    }),
  },
  { name: "query_metals", description: "查询贵金属行情", parameters: obj({}) },
  {
    name: "query_stocks",
    description: "搜索股票",
    parameters: obj({
      q: { type: "string", description: "股票名称或代码" },
    }, ["q"]),
  },
  {
    name: "open_search_result",
    description: "跳转到搜索结果",
    parameters: obj({
      source: { type: "string", enum: ["app", "fund", "news", "reminder", "ai-task"] },
      nativeId: { type: "string" },
    }, ["source", "nativeId"]),
  },
  {
    name: "upgrade_app",
    description: "升级指定应用到最新版本（需用户确认）",
    parameters: obj({
      appName: { type: "string", description: "应用名称，如 Chrome" },
    }, ["appName"]),
  },
  {
    name: "bulk_upgrade_all",
    description: "批量升级所有有更新的应用（需用户确认）",
    parameters: obj({}),
  },
  {
    name: "query_github",
    description: "查询已收录 GitHub 项目及新版本",
    parameters: obj({}),
  },
  {
    name: "query_stock_diagnosis",
    description: "查询个股诊断评分（估值/盈利/资金/技术等）",
    parameters: obj({
      code: { type: "string", description: "股票代码，省略则用当前页股票" },
    }),
  },
  {
    name: "query_ai_usage",
    description: "查询 AI 编程套餐用量（Minimax / GLM）",
    parameters: obj({}),
  },
  {
    name: "query_reminders",
    description: "查询待办提醒事项",
    parameters: obj({}),
  },
  {
    name: "create_reminder",
    description: "创建提醒事项（需用户确认）",
    parameters: obj({
      title: { type: "string", description: "提醒标题" },
      triggerAt: {
        type: "string",
        description: "触发时间：ISO 8601 或相对 +1h / +1d / +30m",
      },
      repeat: {
        type: "string",
        enum: ["once", "daily", "weekdays", "weekly"],
      },
      weekday: { type: "number", description: "weekly 时 0=周日…6=周六" },
    }, ["title", "triggerAt"]),
  },
  {
    name: "interpret_finance",
    description: "AI 解读财经新闻（结构化摘要/情绪/影响）",
    parameters: obj({
      id: { type: "string", description: "文章 id，省略则用当前页选中" },
      title: { type: "string", description: "标题关键词搜索" },
      force: { type: "boolean", description: "忽略缓存重新解读" },
    }),
  },
  {
    name: "summarize_ithome",
    description: "AI 摘要 IT 之家资讯文章",
    parameters: obj({
      id: { type: "string", description: "文章 id" },
      title: { type: "string", description: "标题关键词搜索" },
      force: { type: "boolean", description: "忽略缓存重新生成" },
    }),
  },
  {
    name: "advise_stocks",
    description: "AI 选股策略建议（低估值/高分红/动量等）",
    parameters: obj({
      intent: {
        type: "string",
        enum: [
          "low_value",
          "high_div",
          "oversold",
          "growth_momentum",
          "industry_leader",
          "balanced",
        ],
        description: "策略意图",
      },
      freeText: { type: "string", description: "补充偏好说明" },
      q: { type: "string", description: "同 freeText" },
    }),
  },
  {
    name: "open_movie_detail",
    description: "打开电影详情页（场次/简介）",
    parameters: obj({
      title: { type: "string", description: "片名关键词，如 八仙" },
      movieId: { type: "string", description: "电影 id（已知时优先）" },
    }),
  },
  {
    name: "open_finance_article",
    description: "打开财经新闻文章详情",
    parameters: obj({
      title: { type: "string", description: "标题关键词" },
      id: { type: "string", description: "文章 id" },
    }),
  },
  {
    name: "open_ithome_article",
    description: "打开 IT 之家资讯文章详情",
    parameters: obj({
      title: { type: "string", description: "标题关键词" },
      id: { type: "string", description: "文章 id" },
    }),
  },
  {
    name: "open_stock_diagnosis",
    description: "打开股票个股诊断分析页",
    parameters: obj({
      code: { type: "string", description: "6 位股票代码" },
      name: { type: "string", description: "股票名称关键词" },
    }),
  },
  {
    name: "query_movies",
    description: "查询热映/即将上映电影片单",
    parameters: obj({
      mode: {
        type: "string",
        enum: ["now", "coming", "all"],
        description: "热映 / 待映 / 全部",
      },
    }),
  },
  {
    name: "query_concerts",
    description: "查询已监控演出/演唱会的票价与场次",
    parameters: obj({}),
  },
  {
    name: "open_concerts",
    description: "打开演出票价监控页面",
    parameters: obj({}),
  },
  {
    name: "add_concert_watch",
    description: "添加票牛/摩天轮/更多票链接到演出监控",
    parameters: obj({
      url: { type: "string", description: "演出详情页 URL" },
    }, ["url"]),
  },
  {
    name: "remove_concert_watch",
    description: "从演出监控列表移除一场演出",
    parameters: obj({
      id: { type: "string", description: "watch id" },
      title: { type: "string", description: "演出标题关键词" },
    }),
  },
  {
    name: "refresh_concerts",
    description: "刷新已监控演出的票价与场次数据",
    parameters: obj({}),
  },
];

export function toOpenAiTools() {
  return ASSISTANT_TOOL_DEFS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function toAnthropicTools() {
  return ASSISTANT_TOOL_DEFS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

export const TOOL_NAMES = new Set(ASSISTANT_TOOL_DEFS.map((t) => t.name));
