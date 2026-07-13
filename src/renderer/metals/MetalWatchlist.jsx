/**
 * src/renderer/metals/MetalWatchlist.jsx
 *
 * 行情榜 (单栏, 占满宽): 取代原 MetalTable 的密集表格.
 * 点行 → 调 onSelect(metalId) 弹出详情弹窗 (MetalLayout 控制).
 * 行内 ★ 关注 (watchlist-store). 红涨绿跌 + ▲▼ 字形双编码.
 *
 * 纯行情看板: 不含持仓/交易列 (原 MetalTable 的 "持仓" 列与 "+ 录入持仓" 入口已移除).
 */
import {
  quoteCache, fxCache, historyMap,
} from "./metalStore.js";
import { METALS } from "../../metals/metal-config.js";
import { calcChange } from "../../metals/metal-calc.js";
import { Sparkline } from "../components/Sparkline.jsx";
import { PinIcon, IconAlert } from "../components/icons.jsx";
import { showToast } from "../store.js";
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

/** 国际品种 (USD/oz) → ¥/克; 国内品种 (CNY) 原价即 ¥/克. fx 缺失返 null. */
function getRefPriceCNY(quote, fx) {
  if (!quote) return null;
  if (quote.currency === "CNY") return quote.price;
  if (fx == null) return null;
  return (quote.price * fx) / GRAM_PER_OZ;
}

/** 每克涨跌额 (¥/克), 国际品种经 FX 换算. */
function getChangePerGramCNY(quote, fx) {
  if (!quote) return null;
  if (quote.currency === "CNY") return calcChange(quote).change;
  if (fx == null) return null;
  return (calcChange(quote).change * fx) / GRAM_PER_OZ;
}

export function MetalWatchlist({ onSelect }) {
  return (
    <section class="metals-panel" aria-label="行情榜">
      <div class="metals-panel-head">
        <h2>行情</h2>
        <span class="metals-panel-tag">{METALS.length} 品种 · ¥/克 · 点击查看详情</span>
      </div>
      <div class="metals-watchlist">
        {METALS.map((m) => (
          <WatchRow key={m.id} metal={m} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function WatchRow({ metal, onSelect }) {
  const quote = quoteCache.value.data[metal.id];
  const error = quoteCache.value.errors[metal.id];
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

  const chgClass = direction === "up" ? "metals-up" : direction === "down" ? "metals-down" : "";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "—";
  const sparkColor = direction === "up"
    ? "var(--metals-up)"
    : direction === "down"
    ? "var(--metals-down)"
    : "var(--metals-flat)";

  const pinned = isMetalPinned(metal.id);
  const togglePin = (e) => {
    e.stopPropagation();
    if (pinned) {
      removeWatchlistItem({ type: "metal", ref: metal.id });
      showToast(`已取消关注 ${metal.shortName}`, "info", 2500);
    } else {
      addWatchlistItem({ type: "metal", ref: metal.id });
      showToast(`已加入关注 ${metal.shortName}`, "info", 2500);
    }
  };

  const select = () => { if (onSelect) onSelect(metal.id); };
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select();
    }
  };

  const tagline = `${metal.currency === "CNY" ? "国内" : "国际"} · ${metal.unit === "g" ? "克" : "盎司"}`;

  return (
    <div
      class={`metals-watch-row${error ? " is-error" : ""}`}
      role="button"
      tabindex="0"
      onClick={(e) => { if (e.target.closest(".metals-pin")) return; select(); }}
      onKeyDown={onKeyDown}
      aria-label={`${metal.name} 现价 ${refCNY != null ? formatCNY(refCNY) : "—"} ${arrow} ${changePct.toFixed(2)}%`}
    >
      <div class="metals-wr-name">
        <span class="metals-wr-name-short">{metal.shortName}</span>
        <span class="metals-wr-name-tag">{tagline}</span>
      </div>

      <div class={`metals-wr-price ${chgClass}`}>
        {error ? (
          <span class="metals-up"><IconAlert size={12} /> 失败</span>
        ) : !quote || refCNY == null ? (
          <span class="metals-cell-skeleton" />
        ) : (
          <span>
            {formatCNY(refCNY)}<span class="metals-wr-price-unit">/克</span>
          </span>
        )}
      </div>

      <div class={`metals-wr-chg ${chgClass}`}>
        {!quote ? (
          <span class="metals-cell-skeleton" style={{ width: "50px" }} />
        ) : (
          <>
            <span>{arrow} {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%</span>
            {changePerGram != null && (
              <span class="metals-wr-chg-amt">
                {changePerGram >= 0 ? "+" : ""}{formatCNY(changePerGram)}/克
              </span>
            )}
          </>
        )}
      </div>

      <div class="metals-wr-spark">
        {hasHistory ? (
          <Sparkline
            closes={closes}
            width={84}
            height={30}
            upColor={sparkColor}
            downColor={sparkColor}
            flatColor={sparkColor}
          />
        ) : (
          <span class="metals-wr-spark-loading">加载中</span>
        )}
      </div>

      <button
        type="button"
        class={`metals-pin${pinned ? " is-active" : ""}`}
        onClick={togglePin}
        title={pinned ? "取消关注" : "加入关注"}
        aria-label={pinned ? `取消关注 ${metal.shortName}` : `关注 ${metal.shortName}`}
        aria-pressed={pinned}
      >
        <PinIcon filled={pinned} size={16} />
      </button>
    </div>
  );
}

export default MetalWatchlist;
