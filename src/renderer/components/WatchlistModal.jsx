/**
 * src/renderer/components/WatchlistModal.jsx
 *
 * Phase 33: 关注列表 弹窗版 (替代原 WatchlistDrawer 480px 抽屉).
 *
 * 设计:
 *   - 顶栏: title + 计数 + 关闭
 *   - 工具栏: type filter chips (全部 / App / 基金 / 关键词 / 贵金属)
 *   - 关键词 始终在顶部一行 inline form (快捷入口, 不藏)
 *   - 4 个分组 section: App / 基金 / 贵金属 / 关键词
 *     每个分组可单独折叠, 显示 count + 空态
 *   - 每行: 图标 + 名字 + meta (上次通知版本/净值/价/匹配) + 移除按钮
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  watchlistModalOpen,
  watchlistItems,
  refreshWatchlist,
  removeWatchlistItem,
  addWatchlistItem,
  itemKey,
} from "../watchlist/watchlist-store.js";
import { getMetalById } from "../../metals/metal-config.js";
import { ModalShell, ModalHeader } from "./ModalShell.jsx";
import { IconStar, IconX, WatchlistTypeIcon } from "./icons.jsx";

function fmtTs(ts) {
  if (!ts || typeof ts !== "number") return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TYPE_LABEL = {
  app: { key: "app", label: "App", icon: "📦" },
  fund: { key: "fund", label: "基金", icon: "💰" },
  metal: { key: "metal", label: "贵金属", icon: "🥇" },
  keyword: { key: "keyword", label: "关键词", icon: "🔍" },
};

const TYPE_ORDER = ["app", "fund", "metal", "keyword"];

const FILTERS = [
  { key: "all", label: "全部" },
  ...TYPE_ORDER.map((t) => ({ key: t, label: TYPE_LABEL[t].label })),
];

function entryTitle(w) {
  if (w.type === "app") return w.ref;
  if (w.type === "fund") return w.ref;
  if (w.type === "metal") {
    const m = getMetalById(w.ref);
    return m ? m.shortName : w.ref;
  }
  return `「${w.ref}」`;
}

function entryMeta(w) {
  if (w.type === "app") {
    return w.lastNotifiedVersion
      ? `上次通知版本: ${w.lastNotifiedVersion}`
      : "尚未通知";
  }
  if (w.type === "fund") {
    return w.lastNotifiedNav != null
      ? `基准净值: ${Number(w.lastNotifiedNav).toFixed(4)}`
      : "等待首次净值";
  }
  if (w.type === "metal") {
    return w.lastNotifiedPrice != null
      ? `基准价: ${Number(w.lastNotifiedPrice).toFixed(2)}`
      : "等待首次报价";
  }
  if (w.type === "keyword") {
    return w.lastMatchKey
      ? `最近匹配: ${w.lastMatchKey}`
      : "等待首次匹配";
  }
  return "";
}

function WatchlistRow({ w, onRemove }) {
  const type = TYPE_LABEL[w.type] || TYPE_LABEL.app;
  return (
    <li class="watchlist-row" data-id={itemKey(w)}>
      <span class="watchlist-row__icon" aria-hidden="true">
        <WatchlistTypeIcon type={w.type} size={14} />
      </span>
      <div class="watchlist-row__main">
        <div class="watchlist-row__name">
          <span class={`watchlist-row__type watchlist-row__type--${w.type || "app"}`}>
            {type.label}
          </span>
          <span class="watchlist-row__title">{entryTitle(w)}</span>
        </div>
        <div class="watchlist-row__meta">
          <span>{entryMeta(w)}</span>
          {w.addedAt && (
            <span class="watchlist-row__added">· 添加 {fmtTs(w.addedAt)}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onClick={onRemove}
        aria-label={`从关注列表移除 ${w.ref}`}
        data-testid="watchlist-remove"
      >
        移除
      </button>
    </li>
  );
}

function TypeSection({ type, items, onRemove, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const meta = TYPE_LABEL[type] || TYPE_LABEL.app;
  return (
    <section class="watchlist-section" data-testid={`watchlist-section-${type}`}>
      <button
        type="button"
        class="watchlist-section__header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid={`watchlist-toggle-${type}`}
      >
        <span class={`watchlist-section__chevron${expanded ? " is-open" : ""}`} aria-hidden="true">
          ▸
        </span>
        <span class={`watchlist-row__type watchlist-row__type--${type}`}>{meta.label}</span>
        <span class="watchlist-section__count">{items.length}</span>
      </button>
      {expanded && (
        items.length === 0
          ? <div class="watchlist-section__empty">暂无</div>
          : (
            <ul class="watchlist-section__list">
              {items.map((w) => (
                <WatchlistRow key={itemKey(w)} w={w} onRemove={onRemove(w)} />
              ))}
            </ul>
          )
      )}
    </section>
  );
}

export function WatchlistModal() {
  const open = watchlistModalOpen.value;
  const items = watchlistItems.value;
  const [filter, setFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (open) refreshWatchlist();
  }, [open]);

  function close() {
    watchlistModalOpen.value = false;
  }

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((w) => w.type === filter);
  }, [items, filter]);

  // 按 type 分组
  const grouped = useMemo(() => {
    const out = { app: [], fund: [], metal: [], keyword: [] };
    for (const w of filtered) {
      if (out[w.type]) out[w.type].push(w);
    }
    return out;
  }, [filtered]);

  const counts = useMemo(() => {
    const out = { app: 0, fund: 0, metal: 0, keyword: 0 };
    for (const w of items) if (out[w.type] != null) out[w.type] += 1;
    return out;
  }, [items]);

  // 移除一行, 已按 (type, ref) 闭包绑定
  const onRemove = (w) => () => {
    removeWatchlistItem({ type: w.type, ref: w.ref });
  };

  async function onAddKeyword(e) {
    e.preventDefault();
    const kw = keyword.trim();
    if (!kw) return;
    setAdding(true);
    try {
      await addWatchlistItem({ type: "keyword", ref: kw });
      setKeyword("");
    } finally {
      setAdding(false);
    }
  }

  const header = (
    <ModalHeader className="watchlist-modal-header">
      <h2>
        <span class="watchlist-modal-icon" aria-hidden="true"><IconStar size={18} /></span>
        关注列表
        <span class="watchlist-modal-sub">{items.length} 项</span>
      </h2>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onClick={close}
        aria-label="关闭"
        data-testid="watchlist-close"
      >
        <IconX size={14} />
      </button>
    </ModalHeader>
  );

  return (
    <ModalShell
      open={open}
      onClose={close}
      backdropClass="modal-backdrop watchlist-modal-backdrop"
      cardClass="watchlist-modal"
      ariaLabel="关注列表"
      header={header}
      bodyClass="watchlist-modal-body"
    >
      <form class="watchlist-add-form" onSubmit={onAddKeyword} data-testid="watchlist-add-form">
        <input
          type="text"
          class="watchlist-add-input"
          placeholder="添加关键词 (热搜/IT之家...)"
          value={keyword}
          onInput={(e) => setKeyword(e.currentTarget.value)}
          maxLength={40}
          data-testid="watchlist-add-input"
        />
        <button
          type="submit"
          class="btn btn-sm"
          disabled={adding || !keyword.trim()}
          data-testid="watchlist-add-submit"
        >
          {adding ? "添加中…" : "+ 关键词"}
        </button>
      </form>

      <div class="watchlist-filters" role="tablist" aria-label="按类型筛选">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            class={`watchlist-filter-chip${filter === f.key ? " active" : ""}`}
            onClick={() => setFilter(f.key)}
            data-testid={`watchlist-filter-${f.key}`}
          >
            {f.label}
            {f.key !== "all" && counts[f.key] > 0 && (
              <span class="watchlist-filter-chip__count">{counts[f.key]}</span>
            )}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div class="watchlist-empty">
          <div class="watchlist-empty__title">还没有关注</div>
          <div class="watchlist-empty__hint">
            在应用列表、基金/贵金属卡片点星标关注，或上方添加关键词
          </div>
        </div>
      ) : (
        <div class="watchlist-sections">
          {TYPE_ORDER.map((t) => (
            <TypeSection
              key={t}
              type={t}
              items={grouped[t]}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </ModalShell>
  );
}

export default WatchlistModal;
