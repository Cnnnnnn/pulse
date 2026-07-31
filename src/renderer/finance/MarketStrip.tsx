/**
 * src/renderer/finance/MarketStrip.tsx
 *
 * 实时行情条：上证 / 深证 / 创业板 / 沪深300 / 科创50 + 美元/人民币。
 * 数字统一 tabular-nums；A 股红涨绿跌（--color-up / --color-down）。
 * 某标的解析失败 → 显示 "--" 不抛错。
 */

import { financeQuotes } from "./financeStore.ts";
import { INDEX_SYMBOLS, shortName } from "../../shared/finance-symbols";

function QuoteCell({ label, data }: { label: string; data: any }) {
  if (!data || typeof data.price !== "number") {
    return (
      <div class="finance-quote finance-quote-empty">
        <span class="finance-quote-label">{label}</span>
        <span class="finance-quote-price">--</span>
      </div>
    );
  }
  // FX 仅展示中间价，不显示涨跌（D2：FX 字段无可靠昨收，避免误导）
  if (data.isFx) {
    return (
      <div class="finance-quote is-flat">
        <span class="finance-quote-label">{label}</span>
        <span class="finance-quote-price tabular-nums">
          {data.price.toFixed(2)}
        </span>
        <span class="finance-quote-mid">中间价</span>
      </div>
    );
  }
  const up = data.change > 0;
  const down = data.change < 0;
  const cls = up ? "is-up" : down ? "is-down" : "is-flat";
  const sign = up ? "+" : "";
  return (
    <div class={`finance-quote ${cls}`}>
      <span class="finance-quote-label">{label}</span>
      <span class="finance-quote-price tabular-nums">
        {data.price.toFixed(2)}
      </span>
      <span class="finance-quote-change tabular-nums">
        {sign}
        {data.change.toFixed(2)} ({sign}
        {data.changePct.toFixed(2)}%)
      </span>
    </div>
  );
}

export function MarketStrip() {
  const q = financeQuotes.value;
  const indices = (q && q.indices) || {};
  const fx = (q && q.fx) || {};
  const usdcny = fx.USDCNY;

  return (
    <div class="finance-market-strip" role="region" aria-label="实时行情">
      {INDEX_SYMBOLS.map((s) => (
        <QuoteCell
          key={s.symbol}
          label={shortName(s)}
          data={indices[s.symbol]}
        />
      ))}
      <QuoteCell key="USDCNY" label="美元/人民币" data={usdcny} />
    </div>
  );
}

export default MarketStrip;
