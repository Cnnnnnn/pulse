// news_buzz.data 结构 (见 src/stocks/detail-fetchers/news-buzz.js):
//   { items: [{ title, date, sentiment }] }   sentiment ∈ {positive,neutral,negative}
// 没有 count/total/顶层 sentiment 字段, 数量取 items.length, 情感倾向按多数票聚合
// (与 diagnosis-scorer.js 的 aggregateNewsSentiment 一致).
const SENTIMENT_LABEL = { positive: "偏多", negative: "偏空", neutral: "中性" };

function aggregateSentiment(items) {
  let pos = 0;
  let neg = 0;
  for (const it of items) {
    if (it.sentiment === "positive") pos++;
    else if (it.sentiment === "negative") neg++;
  }
  if (pos > neg) return SENTIMENT_LABEL.positive;
  if (neg > pos) return SENTIMENT_LABEL.negative;
  return SENTIMENT_LABEL.neutral;
}

export function NewsCard({ data }) {
  const d = data?.status === "ok" ? data.data : null;
  const items = Array.isArray(d?.items) ? d.items : null;
  return (
    <div class="module-card module-card--news">
      <div class="module-card-title">📰 舆情</div>
      {items && items.length > 0 ? (
        <div class="module-card-body">
          <div>本周 {items.length} 条</div>
          <div>情感倾向: {aggregateSentiment(items)}</div>
        </div>
      ) : (
        <div class="module-card-empty">{items ? "暂无舆情" : "数据不足"}</div>
      )}
    </div>
  );
}

export default NewsCard;
