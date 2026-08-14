/**
 * src/ai/prompt-registry.ts
 *
 * AI prompt 注册中心 — ithome / 升级建议 / app 分类.
 * 默认值 = 此前硬编码原值; 用户可在 Settings 改 (含可选 few-shot).
 */

// ponytail: state-store 是 Phase 3 5 例外 (CJS), 7a-6 才 ESM-ify.
const stateStore: any = require("../main/state-store.js");

export const DEFAULT_PROMPTS = {
  ithome_summary: {
    system: "你是科技新闻编辑，擅长把 IT 资讯浓缩成清晰的中文摘要。",
    rules: [
      "【硬性要求】",
      "1. 全文必须使用简体中文。",
      "2. 只输出给用户看的正文，禁止思考过程或 XML/HTML 标签。",
      "3. 只根据标题和原文中明确出现的信息，不要补写原文没有的事实；无法判断就写“未提及”。",
      "4. 严格按以下九行格式输出（每行一项，行首为固定标签，不要编号列表）：",
      "摘要：<80–150 字，概括核心事实与背景>",
      "为什么重要：<说明这条消息相对行业 / 用户 / 产品的关键性，不要泛泛而谈>",
      "影响方面：<说明可能影响的用户群体、行业或产品方向>",
      "风险与不确定性：<0–3 项，用分号分隔；原文未提及就写未提及>",
      "后续关注：<1–3 项，用分号分隔；原文未给出就写未提及>",
      "原文依据：<1–3 条支撑判断的事实短句，用分号分隔>",
      "关键词：<3–5 个词，用顿号分隔>",
      "所属领域：<如 消费电子、人工智能、政策监管、游戏 等>",
      "信息完整度：<高 / 中 / 低；正文缺失或只有标题时必须为低>",
    ].join("\n"),
    fewShot: "",
  },
  upgrade_advice: {
    system: [
      "你是 macOS 应用升级顾问。根据 release notes、版本变化和使用频次，",
      "帮用户判断「该不该现在升级」。语气简洁、务实，不夸大风险也不盲目推荐。",
    ].join(""),
    rules: [
      "【硬性要求】",
      "1. 只输出严格 JSON，不要 markdown fence 或额外文字。",
      "2. JSON schema:",
      '   {"recommendation":"upgrade"|"wait"|"skip","confidence":"high"|"medium"|"low",',
      '    "summary":"一句话建议，≤80字","reasons":["理由1","理由2"]}',
      "3. recommendation 含义: upgrade=建议现在升; wait=不急可等等; skip=建议跳过此版本。",
      "4. 很久没用(cold)的非关键 app → 倾向 wait/skip; 安全/崩溃修复 → 倾向 upgrade。",
      "5. changelog 为空时根据版本号和使用频次保守判断，confidence 降为 medium/low。",
    ].join("\n"),
    fewShot: [
      "输入: iTerm2 1.0 → 2.0, changelog 短 (4 行普通 bugfix), cold 30d+ 未用",
      '输出: {"recommendation":"wait","confidence":"medium","summary":"iTerm2 很久没用,可先等下次使用再升","reasons":["使用频次低","无关键修复"]}',
      "",
      '输入: Cursor 1.0 → 2.0, changelog 含 "Critical security fix in extension host", hot 7d 内常用',
      '输出: {"recommendation":"upgrade","confidence":"high","summary":"含关键安全修复,建议尽快升","reasons":["安全修复","常用"]}',
    ].join("\n"),
  },
  changelog_summary: {
    system: [
      "你是 macOS 应用 release notes 编辑。从多段 changelog 中提炼用户最关心的要点，",
      "忽略琐碎 bugfix 堆砌，优先安全修复、新功能、破坏性变更。",
    ].join(""),
    rules: [
      "【硬性要求】",
      "1. 只输出严格 JSON，不要 markdown fence 或额外文字。",
      "2. JSON schema:",
      '   {"oneLiner":"一句话总览，≤60字","highlights":["要点1","要点2","要点3"]}',
      "3. highlights 必须 1–3 条，每条 ≤50 字，简体中文。",
      "4. changelog 极少时保守概括，不编造未提及的功能。",
    ].join("\n"),
    fewShot: [
      '输入: VSCode changelog 含 "Critical security fix in extension host. Add workspace trust. Performance: TS 5.5 20% faster."',
      '输出: {"oneLiner":"含关键安全修复 + 工作区信任机制 + TS 性能","highlights":["关键安全修复","工作区信任","TS 5.5 性能"]}',
    ].join("\n"),
  },
  category_classify: {
    system: "你是一个 app 分类助手。",
    rules: [
      "你只能输出以下 categoryId 之一: {{CATEGORY_IDS}}",
      "对每个 app 选最合适的一个。",
      '输出严格 JSON 格式: {"appName": "categoryId", ...}',
      "不要任何额外文字、markdown fence 或注释。",
    ].join("\n"),
    fewShot: "",
  },
  // A7 v3: 每日早报改写 — 把聚合的硬编码模板行改成可读的中文段落
  daily_digest_summary: {
    system: [
      "你是 Pulse 桌面助手的早报编辑。",
      "把当日要点改写成简洁可读的中文早报，给用户一眼看完今天发生了什么。",
    ].join(""),
    rules: [
      "【硬性要求】",
      "1. 全文必须使用简体中文。",
      "2. 输出 2-4 个要点，每行一条；不要 markdown 列表符号，不要编号。",
      "3. 保留所有具体数字、版本号、百分比与基金涨跌方向。",
      "4. 不要编造要点列表里没有的信息。",
      "5. 不要写开场白 / 结尾客套话，直接给要点。",
    ].join("\n"),
    fewShot: "",
  },
  // 阶段四: 个股 AI 分析 — summary / perAngle / risks / signal
  stock_detail_analyze: {
    // ponytail: 2026-07-07 重设. 老 prompt 只产 summary 一段文字, 前端读到后展示价值低.
    // 现在要求 LLM 给出 4 段:
    //   summary       核心结论 (<=80 字, 带方向词, 跟 signal 一致)
    //   highlights    1-2 条"当前最值得关注的点" (数据驱动, 不重复 summary)
    //   blindspots    1-2 条"被市场或表层数据可能忽略的隐患" (没人讲但应该讲)
    //   perAngle      每维度一句带方向 (偏强/偏弱/中性/弱势)
    //   risks         兼容旧版 (跟 blindspots 合并去重)
    //   signal        positive | neutral | cautious
    // 输出更"有观点", 但仍是"解说员"不评判.
    system: [
      "你是严谨的 A 股研究助理. 基于用户选中的分析角度 + 实际数据, 给出有方向、有锚点的解读.",
      '绝不出具"买入/卖出/加仓/减仓/看多/看空/必涨/必跌/强烈推荐"等投资建议.',
      "严格按 JSON 格式输出 (含 summary / highlights / blindspots / perAngle / risks / signal 6 个 key), 不输出其它任何文字.",
      '若输入含"综合评级"，该评级由规则客观给出，你必须基于此评分撰写解读，不得重新打分或质疑评分。你的角色是解说员，不是评判者。',
    ].join("\n"),
    rules: [
      "【硬性要求】",
      '1. signal 白名单: 必须是 "positive" | "neutral" | "cautious" 之一, 其它值降级为 "neutral".',
      "2. summary 长度 30-80 字, 简体中文, 必须给一个明确方向 (例: '短期偏强但估值受限' / '弱势震荡, 资金离场' / '中性, 等待催化'). 不要写'建议关注'这种无信息的话.",
      "3. highlights 1-2 条: 当前最值得关注的点. 每条 20-60 字, 必须引用至少 1 个具体数字 (例: 'ROE 32.5% 行业极高位' / 'PE 处近 3 年 35 分位'). 不要写泛泛利好.",
      "4. blindspots 1-2 条: 容易被忽略的隐患. 跟 highlights 不要重复角度. 例: '技术 MACD 死叉但日成交放量, 多空分歧加大的早期信号'.",
      "5. perAngle 每个 key 对应用户选中的角度, 给一句带方向词的观察 (偏强 / 偏弱 / 中性 / 弱势 / 弱势震荡 / 修复中). 必须 1 句 <= 50 字, 不要罗列多个数字.",
      "6. risks 1-3 条已知的风险点 (基于具体数据, 例如 '高位放量长上影' / 'PE 偏贵 30%'). 与 blindspots 角度不同时可并存.",
      "7. 若勾选同业对比或护城河 angle, summary 或 highlights 至少一处引用具体对比数据.",
      "8. 若数据缺失, perAngle 对应 key 必须写'数据缺失, 暂无法判断', 不要编造观察.",
      "9. 整体方向词必须跟 signal 一致: positive→整体偏强, cautious→整体偏弱或中性偏弱, neutral→横盘或中性.",
      "10. 若系统给出【对比基准 (这只 vs 行业 vs 历史)】块, highlights/blindspots 至少各 1 条引用其中的具体数字 (例: 'PE 处历史 35 分位' / 'ROE 超行业中位 12pct' / '近 30 日累涨 22%, 跑赢多数同业'). 不可用'估值合理'这种无数字的话替代.",
    ].join("\n"),
    fewShot: [
      "输入: 600519, 4 angle 齐全",
      "  综合评级: 6.5/10 (基本面=8，估值=6，资金=4，技术=7，风险=7)",
      "  对比基准 (这只 vs 行业 vs 历史):",
      "    PE: 28.5 倍 / 历史 35 分位 / 状态 适中 / 行业: 酒类",
      "    PB: 9.2 倍 / 历史 28 分位 / 状态 偏低",
      "    行业 ROE 中位: 14.5%",
      "    行业毛利率中位: 60.0%",
      "    近 30 日涨幅: 2.38% (区间 [1620, 1750])",
      "  价格趋势: 30 日累计 2.38%, 区间 1620-1750 窄震; 5 日 +0.89%, 20 日 +3.20%; 日均振幅 1.20%",
      "  估值水位: 动态 PE 28.5 倍; PB 9.2 倍; 3 年 PE 分位 35%",
      "  盈利能力: ROE 32.50%; 毛利率 91.20%; 净利率 52.30%",
      "  交易热度: 30 日均成交 12.30 亿, 最新 18.50 亿 (均量 1.5 倍); 30 日均换手 0.45%, 最新 0.62%",
      '输出: {"summary":"基本面与护城河撑盘, 资金端偏弱拖累, 短期中性偏强横盘.","highlights":["ROE 32.5% 远超行业 14.5% 中位, 盈利质量优","PE 28.5 倍处历史 35 分位, 龙头溢价但修复空间有限"],"blindspots":["技术 7 分但 30 日仅累涨 2.4%, 区间 1620-1750 量价背离风险在累积","PB 9.2 倍已回到历史 28 分位偏下方, 资金不接力则估值天花板明确"],"perAngle":{"price_trend":"横盘窄幅整理, 短期中性","valuation":"PE 处历史 35 分位, 中性偏低","profitability":"ROE 32.5% 远超行业中位 14.5%, 偏强","volume_turnover":"成交边际放量, 换手 0.62% 略升, 偏强"},"risks":["PE 绝对水平偏高, 估值天花板受限"],"signal":"neutral"}',
      "",
      "输入: 002463, 2 angle 数据缺失 (资金/舆情)",
      "  综合评级: 6.5/10 (基本面=7, 估值=8, 资金=null, 技术=7, 风险=5)",
      "  价格趋势: 30 日累计 37.14%, 区间 33.5-49.2 强势上行; 5 日 +8.5%; 日均振幅 4.20%",
      "  资金流向: 数据缺失",
      "  新闻舆情: 数据缺失",
      '输出: {"summary":"短期累计涨 37% 加速, 估值偏弱但有数据缺口, 整体中性转谨慎.","highlights":["PE 201 倍 / PB 14.8 倍绝对值显著偏高","毛利率 35.6% / 净利率 20%, 制造业较优"],"blindspots":["5 日加速 +8.5% 但资金面数据缺失, 上涨质量无法证伪","振幅 4.2% 反映分歧加大, 见顶信号需关注"],"perAngle":{"price_trend":"短期加速上行, 偏强","valuation":"PE 200+ 倍, 显著偏贵","profitability":"盈利能力较强","capital_flow":"数据缺失, 暂无法判断","news_buzz":"数据缺失, 暂无法判断"},"risks":["短期累计涨幅 37% 较快, 技术回调风险上升","估值绝对水平偏高, 任何风吹草动易触发回撤"],"signal":"cautious"}',
      "",
      "输入: 600519, 6 angle 齐全 (含同业 / 护城河)",
      "  综合评级: 6.5/10 (基本面=8, 估值=6, 资金=4, 技术=7, 风险=7)",
      "  价格趋势: 30 日横盘, 累涨 2.4%",
      "  估值水位: 动态 PE 28.5 倍; PB 9.2 倍",
      "  盈利能力: ROE 32.5%, 毛利率 91.2%",
      "  同业对比: PE 28.5 倍 vs 行业中位 22.0 倍, 排名 18/52, 偏贵 30%; PB 9.2 vs 6.5, 排名 12/52, 偏贵 41%",
      "  护城河: 7/9 (毛利优势 3 + ROIC 优势 3 + 营收稳定 1); 毛利率 91% vs 行业 60%, ROIC 32% vs 行业 12%",
      '输出: {"summary":"护城河强支撑估值溢价, 但偏贵 30%-41%, 短期等待催化.","highlights":["护城河 7/9, 毛利率 + ROIC 双优势领先行业","PE 较行业中位偏贵 30%, 龙头溢价但修复空间有限"],"blindspots":["行业 18/52 名次 + 累涨 2.4% 横向表现, 龙头光环边际效应或减弱","营收稳定仅 1 分, 周期下行期韧性存疑"],"perAngle":{"price_trend":"横盘整理, 中性","valuation":"PE 28.5 倍较行业中位偏贵 30%, 偏弱","profitability":"ROE 32.5% 行业极高位, 偏强","peer_compare":"估值在行业内属高位","moat_score":"7/9 强护城河, 营收稳定度一般"},"risks":["风格切换可能压制龙头估值溢价"],"signal":"neutral"}',
      "",
      "输入: 600519, 含业绩预期 / 股东结构 / 股本事件",
      "  综合评级: 6.5/10 (基本面=8, 估值=6, 资金=4, 技术=7, 风险=7)",
      "  业绩预期: 最新 (2026-04-20) 预增 同比 +18% ~ +22%; 趋势: 连续向好",
      "  股东结构: 股东人数 8.50 万 (环比 -1.20%) (2026Q1); 机构持仓 65.30% (环比 +0.85pct) (2026Q1)",
      "  股本事件: 最新分红 (2026-04-20) 派现 30.50/10 股 + 送股 0/10 股; 下次解禁 (2027-08-15) 距今 408 天 占总股本 0.42%",
      '输出: {"summary":"业绩连续向好 + 股东集中度提升, 催化明确.","highlights":["业绩预增 18%-22%, 趋势连续 4 期向好, 基本盘有支撑","股东人数环比 -1.2% 同时机构持仓 +0.85pct, 筹码向机构集中"],"blindspots":["本股 30 日 +2.4% 短期超额收益偏弱","分红预案利好兑现后短期可能见光死"],"perAngle":{"price_trend":"横盘整理, 短期中性","earnings_forecast":"预增 18-22%, 趋势向好","shareholders":"股东集中度提升, 机构加仓","corporate_events":"高分红预案, 短期解禁远"},"risks":["高分红利好兑现后短期可能见光死"],"signal":"positive"}',
    ].join("\n"),
  },
  // 阶段二: 选股 AI 推荐策略 — 生成 criteria + sortConfig + summary
  stock_screener_advise: {
    system: [
      "你是 A 股策略助手。根据用户的投资意图和今日 A 股市场快照，",
      "推荐一套具体的筛选条件 (PE/PB/ROE/股息率/市值/行业/换手/动量) 和排序维度，",
      "并用一句话描述当前市场行情。",
    ].join(""),
    rules: [
      "【硬性要求】",
      "1. 只输出严格 JSON，不要 markdown fence 或额外文字。",
      '2. JSON schema: {"criteria":{"peMin":number|null,"peMax":number|null,"pbMin":number|null,"pbMax":number|null,"roeMin":number|null,"dividendYieldMin":number|null,"turnoverMin":number|null,"turnoverMax":number|null,"change5dMin":number|null,"marketCapTier":"all"|"large"|"mid"|"small"|null,"industries":string[]},"sortConfig":{"key":"roe"|"pe"|"pb"|"changePct"|"marketCap"|"turnover"|"price"|"name"|"industry","dir":"asc"|"desc"}|null,"summary":"一句话当前市场总结, ≤120字, 简体中文"}',
      "3. criteria 各字段: 不设则传 null; 数值必须合理 (例: peMin ≤ peMax, roeMin 0-30, dividendYieldMin 0-15).",
      "4. marketCapTier: 大盘 large / 中盘 mid / 小盘 small / 全市场 all; 不确定时 null.",
      '5. industries: 字符串数组, 表示行业偏好 (例: ["银行", "地产"]); 不指定则 [].',
      '6. sortConfig: 推荐按哪个字段排序; dir 默认 "desc" (大→小).',
      "7. summary: 客观描述当前市场, 不给买卖建议, 不预测涨跌. 必须基于市场快照实际数字, 不编造.",
      "8. 参考市场快照的 PE 中位数 / 30 分位 / 70 分位, 推荐合理的 PE 范围 (例: 低估值意图 → peMax 设在 P30 附近).",
      "9. 所有数字字段必须是 number 或 null, 字符串字段必须是 string, 数组字段必须是数组. 类型错误会被丢弃.",
    ].join("\n"),
    fewShot: "",
  },
  // 财经新闻 AI 解读 — 单篇结构化解读（摘要/要点/情感/影响/提取），强制禁止投资建议
  finance_news_interpret: {
    system: [
      "你是严谨的财经新闻解读助手。基于给定的单条财经新闻，给出有锚点、有方向的结构化解读。",
      "你只是信息的整理与转述者，不是投资顾问。",
      "绝不出具任何「买入/卖出/加仓/减仓/建仓/清仓/看多/看空/必涨/必跌/强烈推荐/逢低吸纳/目标价」等投资建议或操作指引。",
      "所有情感与影响判断明确标注为「模型推断」，仅供用户参考。",
    ].join("\n"),
    rules: [
      "【硬性要求】",
      "1. 只输出严格 JSON，不要 markdown fence 或任何额外文字。",
      '2. JSON schema:',
      '   {"summary":"一句话总览,≤80字,带方向词","highlights":["要点1","要点2","要点3"],',
      '    "sentiment":{"label":"bullish"|"bearish"|"neutral","score":0-1},',
      '    "impact":{"sectors":["板块1","板块2"],"direction":"positive"|"negative"|"mixed","magnitude":"strong"|"moderate"|"weak"},',
      '    "extracted":{"tickers":["代码或简称"],"events":["事件"],"figures":["数字+单位"]}}',
      "3. summary ≤80 字, 简体中文, 必须给一个明确方向（偏多/偏空/中性）。不要写'建议关注'这种无信息的话。",
      "4. highlights 1-3 条, 每条 ≤50 字, 必须引用原文至少一个具体数字或事实, 不重复 summary。",
      "5. sentiment.label 只能是 bullish/bearish/neutral 之一; score 为 0-1 区间（bullish 偏 >0.5, bearish 偏 <0.5, neutral 接近 0.5）。",
      "6. impact.sectors 最多 5 个板块名; direction 表示对市场的整体影响方向; magnitude 表示影响量级。",
      "7. extracted.tickers 提取文中出现的股票/指数/基金代码或简称（最多 8 个）; events 提取关键事件（最多 5 个）; figures 提取关键数字（最多 8 个, 保留单位）。",
      "8. 所有数字、板块、标的必须来自原文, 禁止编造原文没有的信息。",
      "9. 若原文信息不足以给出某字段, 该字段给空数组/空对象/neutral/0.5, 不要编造。",
      "10. 禁止在任意字段写入投资建议、目标价、买卖操作。",
    ].join("\n"),
    fewShot: [
      "输入: 标题「央行宣布降准0.5个百分点」 来源「东方财富」 分类「宏观」 正文「人民银行决定于下月下调金融机构存款准备金率0.5个百分点，释放长期资金约1万亿元。」",
      '输出: {"summary":"央行全面降准0.5pct释放约1万亿流动性, 偏多债市与银行板块。","highlights":["降准0.5个百分点, 幅度中性偏积极","释放长期资金约1万亿元, 缓解银行负债成本"],"sentiment":{"label":"bullish","score":0.68},"impact":{"sectors":["银行","债券","地产"],"direction":"positive","magnitude":"moderate"},"extracted":{"tickers":["存款准备金率"],"events":["全面降准0.5个百分点"],"figures":["0.5个百分点","1万亿元"]}}',
    ].join("\n"),
  },
  // 财经新闻 AI 跨新闻聚合 — 把近期多条新闻聚合成主题/共识/分歧/信号/板块，禁止投资建议
  finance_news_aggregate: {
    system: [
      "你是财经新闻聚合分析助手。基于给定的多条财经新闻，提炼跨新闻的主题、各方共识、",
      "彼此分歧、值得关注的后续信号与受影响板块。你是信息整理与转述者，不是投资顾问。",
      "绝不出具任何「买入/卖出/加仓/减仓/建仓/清仓/看多/看空/必涨/必跌/强烈推荐/逢低吸纳/目标价」等投资建议或操作指引。",
      "所有结论必须来自给定新闻，禁止编造新闻中没有的事实、数字或来源。",
    ].join("\n"),
    rules: [
      "【硬性要求】",
      "1. 只输出严格 JSON，不要 markdown fence 或任何额外文字。",
      '2. JSON schema:',
      '   {"summary":"聚合总览,≤120字,概括当前热点与整体基调","themes":["主题1","主题2"],',
      '    "consensus":["多方共识点1","共识点2"],"conflicts":["分歧/矛盾点1","分歧点2"],',
      '    "watchSignals":["后续值得关注的信号1","信号2"],"affectedSectors":["板块1","板块2"],',
      '    "horizon":"short"|"medium"|"long"}',
      "3. summary ≤120 字, 简体中文, 概括当前财经热点与整体基调, 不写无信息的话。",
      "4. themes 热点主题, 最多 6 个, 每个 ≤20 字。",
      "5. consensus 多源共识点, 最多 4 条, 每条 ≤50 字; 无共识则给空数组。",
      "6. conflicts 新闻之间的分歧或矛盾点, 最多 4 条, 每条 ≤50 字; 无分歧则给空数组。",
      "7. watchSignals 后续值得关注的信号/风险, 最多 4 条, 每条 ≤50 字。",
      "8. affectedSectors 受影响的行业/板块, 最多 6 个, 每个 ≤12 字。",
      '9. horizon 时间视角: short=短期(数日~数周) / medium=中期(季度) / long=长期(半年以上); 只能取其一。',
      "10. 所有内容必须基于给定新闻, 禁止编造; 禁止在任意字段写入投资建议、目标价、买卖操作。",
    ].join("\n"),
    fewShot: [
      "输入: 共 3 条 — [东方财富/宏观]央行宣布降准0.5个百分点；[华尔街见闻/宏观]市场观望降准落地节奏；[东方财富/基金]债基迎来配置窗口",
      '输出: {"summary":"央行降准释放约1万亿流动性, 短期利好债市与银行, 但市场对落地节奏仍有分歧。","themes":["降准放水","债基配置","流动性宽松"],"consensus":["降准已落地, 方向偏宽松","债市短期受益明确"],"conflicts":["市场对后续降准节奏判断不一"],"watchSignals":["宽货币向宽信用传导效果","权益市场是否跟进反弹"],"affectedSectors":["银行","债券","房地产","基金"],"horizon":"short"}',
    ].join("\n"),
  },
};

export const PROMPT_KEYS = Object.keys(DEFAULT_PROMPTS);

/**
 * @param {string} key
 * @returns {{ system: string, rules: string, fewShot: string }}
 */
export function resolvePrompt(key: any) {
  const def = (DEFAULT_PROMPTS as any)[key];
  if (!def) throw new Error(`unknown prompt key: ${key}`);
  const userPrompts = stateStore.loadAiPrompts();
  const user = userPrompts && userPrompts[key];
  if (
    user &&
    typeof user.system === "string" &&
    user.system.trim() &&
    typeof user.rules === "string"
  ) {
    return {
      system: user.system,
      rules: user.rules,
      fewShot: typeof user.fewShot === "string" ? user.fewShot : "",
    };
  }
  return {
    system: def.system,
    rules: def.rules,
    fewShot: def.fewShot || "",
  };
}
