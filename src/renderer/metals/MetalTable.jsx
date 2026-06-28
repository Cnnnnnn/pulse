/**
 * src/renderer/metals/MetalTable.jsx
 *
 * Bloomberg 风格表格: 6 列, 4 行 (XAU / XAG / AU9999 / AG9999).
 * 内嵌 sparkline + 持仓盈亏 + 添加持仓文字链.
 *
 * 颜色: A 股 — 涨红 (--metals-up) / 跌绿 (--metals-down).
 */
import { config, quoteCache, fxCache, historyMap } from "./metalStore.js";
import { METALS } from "../../metals/metal-config.js";
import {
  calcChange, calcHoldingPnl,
} from "../../metals/metal-calc.js";
import { Sparkline } from "../components/Sparkline.jsx";
import { PinIcon, IconMoreHorizontal, IconAlert } from "../components/icons.jsx";
import {
  isMetalPinned, addWatchlistItem, removeWatchlistItem,
} from "../watchlist/watchlist-store.js";

const GRAM_PER_OZ = 31.1035;

function formatCNY(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })}`;
}

function getRefPriceCNY(quote, fx) {
  if (!quote) return null;
  if (quote.currency === "CNY") return quote.price;
  if (fx == null) return null;
  return (quote.price * fx) / GRAM_PER_OZ;
}

function getChangePerGramCNY(quote, fx) {
  if (!quote) return null;
  if (quote.currency === "CNY") return calcChange(quote).change;
  if (fx == null) return null;
  return (calcChange(quote).change * fx) / GRAM_PER_OZ;
}

export function MetalTable({ onEdit }) {
  return (
    <table class="metals-table">
      <thead>
        <tr>
          <th>品种</th>
          <th class="num">最新价</th>
          <th class="num">涨跌</th>
          <th>30 天走势</th>
          <th class="num metals-col-holding">持仓</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {METALS.map((m) => (
          <MetalTableRow key={m.id} metal={m} onEdit={onEdit} />
        ))}
      </tbody>
    </table>
  );
}

function MetalTableRow({ metal, onEdit }) {
  const quote = quoteCache.value.data[metal.id];
  const error = quoteCache.value.errors[metal.id];
  const holding = config.value.holdings[metal.id];
  const fx = fxCache.value.rate;
  const arr = historyMap.value[metal.id] || [];
  const closes = arr.map((p) => p.close / (metal.unitDivisor || 1));
  const hasHistory = closes.length >= 2;

  const refCNY = getRefPriceCNY(quote, fx);
  const changePerGram = getChangePerGramCNY(quote, fx);
  let changePct = 0;
  let direction = "flat";
  if (quote) {
    const c = calcChange(quote);
    changePct = c.changePct;
    direction = c.change > 0 ? "up" : c.change < 0 ? "down" : "flat";
  }
  const priceClass = direction === "up" ? "metals-pos"
    : direction === "down" ? "metals-neg" : "";

  const holdingPnl = holding && quote
    ? calcHoldingPnl(holding, quote, fx) : null;

  const pinned = isMetalPinned(metal.id);
  const togglePin = (e) => {
    e.stopPropagation();
    if (pinned) removeWatchlistItem({ type: "metal", ref: metal.id });
    else addWatchlistItem({ type: "metal", ref: metal.id });
  };

  const sparklineColor = direction === "up"
    ? "var(--metals-up)"
    : direction === "down"
    ? "var(--metals-down)"
    : "var(--metals-flat)";

  return (
    <tr class={error ? "metals-row-error" : ""}>
      <td>
        <div class="metals-cell-name">
          <span class="metals-cell-name-short">{metal.shortName}</span>
          <span class="metals-cell-name-tag">
            {metal.currency === "CNY" ? "国内" : "国际"}
            {metal.proxyLabel ? ` · ${metal.proxyLabel}` : ""}
          </span>
        </div>
      </td>

      <td class="num">
        {error ? (
          <span class="metals-cell-price" style={{ color: "var(--metals-up)" }}>
            <IconAlert size={12} /> 数据获取失败
          </span>
        ) : !quote || refCNY == null ? (
          <span class="metals-cell-skeleton" />
        ) : (
          <span class={`metals-cell-price ${priceClass}`}>
            {formatCNY(refCNY)}<span class="metals-cell-price-unit">/克</span>
          </span>
        )}
      </td>

      <td class="num">
        {!quote ? (
          <span class="metals-cell-skeleton" style={{ width: "50px" }} />
        ) : (
          <div class="metals-cell-change">
            <span class={`metals-cell-change-pct ${priceClass}`}>
              {direction === "up" ? "↑" : direction === "down" ? "↓" : "—"}
              {" "}{Math.abs(changePct).toFixed(2)}%
            </span>
            {changePerGram != null && (
              <span class="metals-cell-change-amount">
                ({changePerGram >= 0 ? "+" : ""}{formatCNY(changePerGram)})
              </span>
            )}
          </div>
        )}
      </td>

      <td>
        <div class="metals-cell-sparkline">
          {hasHistory ? (
            <Sparkline
              closes={closes}
              width={140}
              height={28}
              upColor={sparklineColor}
              downColor={sparklineColor}
              flatColor={sparklineColor}
            />
          ) : (
            <span class="metals-cell-sparkline-loading">30 天加载中</span>
          )}
        </div>
      </td>

      <td class="num metals-col-holding">
        {holding ? (
          <div class="metals-cell-holding">
            <span class="metals-cell-holding-qty">
              {holding.quantity.toLocaleString("zh-CN")} {metal.unit}
            </span>
            {holdingPnl && (
              <span class={`metals-cell-holding-pnl ${
                holdingPnl.pnlCNY > 0 ? "metals-pos"
                : holdingPnl.pnlCNY < 0 ? "metals-neg" : ""
              }`}>
                {holdingPnl.pnlCNY >= 0 ? "+" : ""}{formatCNY(holdingPnl.pnlCNY)}
              </span>
            )}
          </div>
        ) : (
          <button
            class="metals-add-holding-text"
            onClick={() => onEdit(metal.id)}
          >
            + 录入持仓
          </button>
        )}
      </td>

      <td>
        <div class="metals-cell-actions">
          <button
            type="button"
            class={`metals-cell-action-btn${pinned ? " is-active" : ""}`}
            onClick={togglePin}
            title={pinned ? "取消关注" : "加入关注列表"}
            aria-label={pinned ? "取消关注" : "加入关注列表"}
          >
            <PinIcon filled={pinned} size={14} />
          </button>
          <button
            type="button"
            class="metals-cell-action-btn"
            onClick={() => onEdit(metal.id)}
            title="编辑"
            aria-label="编辑"
          >
            <IconMoreHorizontal size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default MetalTable;
