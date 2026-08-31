/**
 * src/renderer/concerts/ConcertsLayout.tsx
 *
 * 演出票价监控主视图.
 *   header: 标题 + 更新时间 + 刷新
 *   add: 粘贴详情页 URL → 识别平台（票牛 / 摩天轮）
 *   卡片: 场次 × 实时最低价；票牛可展开票档、钉选盯价，并选购票张数（单价随张数变）
 */
import { useEffect, useState } from "preact/hooks";
import "./concerts.css";
import { api } from "../api.ts";
import {
  bootstrapConcertsTab,
  subscribeConcertsUpdates,
  cleanupConcertsUpdates,
  refreshConcerts,
  addConcertWatch,
  removeConcertWatch,
  setConcertWatchedTiers,
  computeSessionDeltas,
  computeTierDeltas,
  flattenSnapshotTiers,
  tierUnitPrice,
  formatConcertsFetchedAt,
  concertsWatches,
  concertsSnapshots,
  concertsPrevSnapshots,
  concertsLoaded,
  concertsLoading,
  concertsError,
  concertsLastFetched,
  concertsAddBusy,
  concertsAddError,
} from "./store.ts";
import {
  CONCERT_PLATFORM_LABEL,
  CONCERT_SESSION_STATUS_LABEL,
} from "../../shared/concerts-constants.ts";

export function ConcertsLayout() {
  const [urlInput, setUrlInput] = useState("");

  useEffect(() => {
    bootstrapConcertsTab();
    subscribeConcertsUpdates();
    return () => {
      cleanupConcertsUpdates();
    };
  }, []);

  const watches = concertsWatches.value;
  const snapshots = concertsSnapshots.value;
  const prev = concertsPrevSnapshots.value;
  const qtyByWatch: Record<string, Record<string, number>> = {};
  for (const w of watches) {
    if (w && w.id && w.watchedTierQty) qtyByWatch[w.id] = w.watchedTierQty;
  }
  const sessionDeltas = computeSessionDeltas(snapshots, prev);
  const tierDeltas = computeTierDeltas(snapshots, prev, qtyByWatch);
  const loading = concertsLoading.value;
  const loaded = concertsLoaded.value;
  const fetchedLabel = formatConcertsFetchedAt(concertsLastFetched.value);

  const submitAdd = async () => {
    if (!urlInput.trim()) return;
    const ok = await addConcertWatch(urlInput);
    if (ok) setUrlInput("");
  };

  return (
    <div class="concerts-layout">
      <div class="concerts-header">
        <div class="concerts-header__left">
          <div class="concerts-header__title">演出票价监控</div>
          <div class="concerts-header__meta">
            <span>{watches.length} 个监听</span>
            {fetchedLabel ? <span>数据更新：{fetchedLabel}</span> : null}
            {concertsError.value ? (
              <span class="concerts-header__err">{concertsError.value}</span>
            ) : null}
          </div>
        </div>
        <div class="concerts-header__actions">
          <button
            class="concerts-btn"
            disabled={loading || !loaded && false}
            onClick={() => refreshConcerts()}
            title="刷新全部"
          >
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>
      </div>

      <div class="concerts-add">
        <div class="concerts-add__control">
          <input
            class="concerts-add__input"
            type="text"
            placeholder="粘贴演出链接到此处开始监控，如：https://…"
            value={urlInput}
            onInput={(e: any) => setUrlInput(e.target.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") submitAdd();
            }}
          />
          <button class="concerts-btn concerts-btn--primary" disabled={concertsAddBusy.value} onClick={submitAdd}>
            {concertsAddBusy.value ? "添加中…" : "添加监听"}
          </button>
        </div>
      </div>
      {concertsAddError.value ? (
        <div class="concerts-add__error">{concertsAddError.value}</div>
      ) : null}

      {!loaded ? <div class="concerts-empty">加载中…</div> : null}
      {loaded && watches.length === 0 ? (
        <div class="concerts-empty">
          <p>还没有监听任何演出。</p>
          <p class="concerts-empty__hint">
            打开 <b>票牛</b> / <b>摩天轮国内</b>详情页 / <b>摩天轮国际</b> 详情页，
            复制地址粘贴即可。票档可 ★ 钉选；后台约每 2 分钟刷新，降价发系统通知。
          </p>
        </div>
      ) : null}

      <div class="concerts-list-head" aria-hidden="true">
        <span>演出信息</span>
        <span>最低在售价 / 票面价</span>
        <span>价格变化</span>
        <span>余票</span>
        <span>已锁定票档（数量）</span>
        <span>操作</span>
      </div>

      <div class="concerts-list">
        {watches.map((watch) => {
          const snap = snapshots[watch.id];
          return (
            <ConcertCard
              key={watch.id}
              watch={watch}
              snapshot={snap}
              sessionDeltas={(sessionDeltas as any)[watch.id]}
              tierDeltas={(tierDeltas as any)[watch.id]}
              onRemove={() => removeConcertWatch(watch.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface CardProps {
  watch: any;
  snapshot: any;
  sessionDeltas?: Record<string, number>;
  tierDeltas?: Record<string, number>;
  onRemove: () => void;
}

function ConcertCard({ watch, snapshot, sessionDeltas, tierDeltas, onRemove }: CardProps) {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  if (!snapshot) {
    return (
      <div class="concerts-card" key={watch.id}>
        <div class="concerts-card__head">
          <div class="concerts-card__lead">
            <div class="concerts-card__title-row">
              <span class="concerts-card__platform">{CONCERT_PLATFORM_LABEL[watch.platform]}</span>
              <span class="concerts-card__title">{watch.id}</span>
            </div>
            <div class="concerts-card__meta">等待首次抓取</div>
          </div>
        </div>
        <div class="concerts-card__loading">等待首次抓取…</div>
      </div>
    );
  }

  const sessions: any[] = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  const hasTiers = watch.platform === "piaoniu" || watch.platform === "motianlun";
  const watchedIds: string[] = Array.isArray(watch.watchedTierIds) ? watch.watchedTierIds : [];
  const watchedSet = new Set(watchedIds);
  const qtyMap: Record<string, number> =
    watch.watchedTierQty && typeof watch.watchedTierQty === "object" ? { ...watch.watchedTierQty } : {};
  const allTiers = flattenSnapshotTiers(snapshot);
  const pinnedTiers = allTiers.filter((t) => watchedSet.has(t.id));

  const persistPins = (ids: string[], qty: Record<string, number>) => {
    const nextQty: Record<string, number> = {};
    for (const id of ids) nextQty[id] = qty[id] || 1;
    setConcertWatchedTiers(watch.id, ids, nextQty);
  };

  const togglePin = (tierId: string) => {
    if (watchedSet.has(tierId)) {
      const ids = watchedIds.filter((id) => id !== tierId);
      const qty = { ...qtyMap };
      delete qty[tierId];
      persistPins(ids, qty);
    } else {
      const defaultQty = watch.ticketCount || qtyMap[tierId] || 1;
      persistPins([...watchedIds, tierId], { ...qtyMap, [tierId]: defaultQty });
    }
  };

  const setQty = (tierId: string, qty: number) => {
    persistPins(watchedIds.includes(tierId) ? watchedIds : [...watchedIds, tierId], {
      ...qtyMap,
      [tierId]: qty,
    });
  };

  const toggleTiers = (session: any) => {
    setExpandedSession(expandedSession === session.id ? null : session.id);
  };

  return (
    <div class="concerts-card" key={watch.id}>
      <div class="concerts-card__head">
        <div class="concerts-card__lead">
          <div class="concerts-card__title-row">
            <span class={`concerts-card__platform concerts-card__platform--${watch.platform}`}>
              {CONCERT_PLATFORM_LABEL[watch.platform]}
            </span>
            <a class="concerts-card__title" href="#" title={snapshot.detailUrl} onClick={(e: Event) => { e.preventDefault(); api.openUrl(snapshot.detailUrl); }}>
              {snapshot.title || watch.id}
            </a>
            {snapshot.error ? (
              <span class="concerts-card__stale" title="本轮刷新失败，显示上次数据">缓存</span>
            ) : null}
          </div>
          {(snapshot.city || snapshot.venue) ? (
            <div class="concerts-card__meta">{[snapshot.city, snapshot.venue].filter(Boolean).join(" · ")}</div>
          ) : null}
        </div>
        <button class="concerts-card__remove" onClick={onRemove} title="取消监听">✕</button>
      </div>

      {hasTiers && pinnedTiers.length > 0 ? (
        <div class="concerts-pinned">
          <div class="concerts-pinned__label">盯档</div>
          {pinnedTiers.map((t) => {
            const qty = qtyMap[t.id] || watch.ticketCount || 1;
            return (
              <TierRow
                key={`pin-${t.id}`}
                tier={t}
                pinned
                qty={qty}
                delta={tierDeltas ? tierDeltas[t.id] : undefined}
                onTogglePin={() => togglePin(t.id)}
                onQtyChange={(q) => setQty(t.id, q)}
                showSession
                showQtyPicker
              />
            );
          })}
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <div class="concerts-card__empty">
          {snapshot.error === "pending" ? "尚未抓取到数据" : "暂无在售场次"}
        </div>
      ) : (
        <table class="concerts-table">
          <thead>
            <tr>
              <th>场次</th>
              <th>状态</th>
              <th class="concerts-table__price-col">最低在售价</th>
              <th class="concerts-table__price-col">参考票面</th>
              {hasTiers ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const d = sessionDeltas ? sessionDeltas[s.id] : undefined;
              const sessionTiers: any[] = Array.isArray(s.tiers) ? s.tiers : [];
              return [
                <tr key={s.id}>
                  <td>
                    <div class="concerts-table__name">{s.name}</div>
                    {s.time ? <div class="concerts-table__time">{s.time}</div> : null}
                  </td>
                  <td>
                    <span class={`concerts-status concerts-status--${(s.status || "").toLowerCase()}`}>
                      {s.hasTicket ? CONCERT_SESSION_STATUS_LABEL[s.status] || s.status : "缺货登记"}
                    </span>
                  </td>
                  <td class="concerts-table__price-col">
                    {s.minPrice != null ? (
                      <span class="concerts-table__min">
                        {s.currencySymbol || ""}
                        {s.minPrice}
                        {d != null ? <DeltaBadge d={d} /> : null}
                      </span>
                    ) : (
                      <span class="concerts-table__noprice">—</span>
                    )}
                  </td>
                  <td class="concerts-table__price-col concerts-table__origin">
                    {s.originalPrice != null ? `${s.currencySymbol || ""}${s.originalPrice}` : "—"}
                  </td>
                  {hasTiers ? (
                    <td>
                      <button class="concerts-tiers-toggle" onClick={() => toggleTiers(s)}>
                        {expandedSession === s.id ? "收起" : `票档${sessionTiers.length ? ` ${sessionTiers.length}` : ""}`}
                      </button>
                    </td>
                  ) : null}
                </tr>,
                expandedSession === s.id && hasTiers ? (
                  <tr key={`${s.id}-tiers`} class="concerts-tiers-row">
                    <td colspan={5}>
                      {sessionTiers.length === 0 ? (
                        <span class="concerts-table__time">暂无票档数据（刷新后可获取）</span>
                      ) : (
                        <div class="concerts-tiers">
                          {sessionTiers.map((t: any) => (
                            <TierRow
                              key={t.id}
                              tier={t}
                              pinned={watchedSet.has(t.id)}
                              qty={qtyMap[t.id] || watch.ticketCount || 1}
                              delta={watchedSet.has(t.id) && tierDeltas ? tierDeltas[t.id] : undefined}
                              onTogglePin={() => togglePin(t.id)}
                              onQtyChange={(q) => setQty(t.id, q)}
                              showQtyPicker={watchedSet.has(t.id)}
                              showQtyHint={watch.platform === "piaoniu"}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DeltaBadge({ d }: { d: number }) {
  return (
    <span class={d > 0 ? "concerts-delta concerts-delta--up" : "concerts-delta concerts-delta--down"}>
      {d > 0 ? "▲" : "▼"}
      {Math.abs(d)}
    </span>
  );
}

function TierRow({
  tier,
  pinned,
  qty,
  delta,
  onTogglePin,
  onQtyChange,
  showSession,
  showQtyPicker,
  showQtyHint,
}: {
  tier: any;
  pinned: boolean;
  qty: number;
  delta?: number;
  onTogglePin: () => void;
  onQtyChange: (_qty: number) => void;
  showSession?: boolean;
  showQtyPicker?: boolean;
  showQtyHint?: boolean;
}) {
  const unit = tierUnitPrice(tier, qty);
  const qtyPrices: Array<{ qty: number; salePrice: string }> = Array.isArray(tier.qtyPrices)
    ? tier.qtyPrices
    : [];
  const qtyOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  return (
    <div class={`concerts-tier ${pinned ? "concerts-tier--pinned" : ""}`}>
      <button
        class={`concerts-tier__pin ${pinned ? "concerts-tier__pin--on" : ""}`}
        onClick={onTogglePin}
        title={pinned ? "取消盯价" : "盯这个档位"}
        type="button"
      >
        {pinned ? "★" : "☆"}
      </button>
      <span class="concerts-tier__name">
        {tier.name}
        {showSession && tier.sessionName ? (
          <em class="concerts-tier__session"> · {tier.sessionName}</em>
        ) : null}
        {showQtyHint && qtyPrices.length > 1 ? (
          <em class="concerts-tier__qtyhint">
            {" "}
            {qtyPrices.map((p) => `${p.qty}张¥${p.salePrice}`).join(" · ")}
          </em>
        ) : null}
      </span>
      {showQtyPicker ? (
        <label class="concerts-tier__qty">
          <select
            value={qty}
            onChange={(e: any) => onQtyChange(Number(e.target.value) || 1)}
            title="购票张数"
          >
            {qtyOptions.map((n) => (
              <option key={n} value={n}>
                {n} 张
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <span class={`concerts-tier__stock ${tier.hasTicket ? "" : "concerts-tier__stock--out"}`}>
        {tier.hasTicket ? `余 ${tier.ticketsNum ?? "?"}` : "缺货"}
      </span>
      <span class="concerts-tier__price">
        ¥{unit ?? "—"}
        {showQtyPicker ? <em>/{qty}张单价</em> : null}
        {delta != null ? <DeltaBadge d={delta} /> : null}
        {tier.originPrice != null ? <em>/面¥{tier.originPrice}</em> : null}
      </span>
    </div>
  );
}
