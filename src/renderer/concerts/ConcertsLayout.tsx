/**
 * src/renderer/concerts/ConcertsLayout.tsx
 *
 * 演出票价监控主视图（v2.84 布局重构：苹果原生风）.
 *   header: 标题 + 监听数/更新时间 + 刷新
 *   addbar: 胶囊粘贴链接 → 识别平台（票牛 / 摩天轮 / 摩天轮国际）
 *   stats: 监听中 / 当前降价场次 / 已钉选票档 / 缺货登记（由现有数据派生）
 *   卡片: 平台 chip + 标题 + 盯档 strip + 场次行（最低价/票面/状态/票档展开）
 *   票档: ★ 钉选、购票张数（单价随张数变）
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
  CONCERT_PLATFORM_SITE,
  CONCERT_SESSION_STATUS_LABEL,
} from "../../shared/concerts-constants.ts";

/** 平台官网链接（跳系统浏览器） */
function SiteLink({ platform, label }: { platform: keyof typeof CONCERT_PLATFORM_SITE; label: string }) {
  return (
    <a
      href="#"
      class="concerts-site-link"
      title={`打开${label}官网`}
      onClick={(e: Event) => {
        e.preventDefault();
        api.openUrl(CONCERT_PLATFORM_SITE[platform]);
      }}
    >
      {label}
    </a>
  );
}

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

  // 概览统计：全部由现有监听数据派生
  let droppingSessions = 0;
  let soldoutSessions = 0;
  let pinnedCount = 0;
  for (const w of watches) {
    pinnedCount += Array.isArray(w?.watchedTierIds) ? w.watchedTierIds.length : 0;
    const snap = snapshots[w?.id];
    if (!snap) continue;
    for (const s of Array.isArray(snap.sessions) ? snap.sessions : []) {
      const d = (sessionDeltas as any)[w.id]?.[s.id];
      if (typeof d === "number" && d < 0) droppingSessions += 1;
      if (s && s.hasTicket === false) soldoutSessions += 1;
    }
  }

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
            {watches.length > 0 && <span>{watches.length} 个监听</span>}
            {fetchedLabel ? <span>数据更新：{fetchedLabel}</span> : null}
            <span>后台约每 2 分钟刷新，降价发通知</span>
            {concertsError.value ? (
              <span class="concerts-header__err">{concertsError.value}</span>
            ) : null}
          </div>
        </div>
        <div class="concerts-header__actions">
          <button class="concerts-btn" onClick={() => refreshConcerts()} title="刷新全部">
            {loading ? "刷新中…" : "↻ 刷新"}
          </button>
        </div>
      </div>

      <div class="concerts-addbar">
        <span class="concerts-addbar__icon" aria-hidden="true">🔗</span>
        <input
          class="concerts-addbar__input"
          type="text"
          placeholder="粘贴票牛 / 摩天轮演出详情页链接，一键开始盯价…"
          value={urlInput}
          onInput={(e: any) => setUrlInput(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") submitAdd();
          }}
        />
        <span class="concerts-addbar__hint">
          官网：
          <SiteLink platform="piaoniu" label="票牛" />
          ·
          <SiteLink platform="motianlun" label="摩天轮" />
          ·
          <SiteLink platform="moretickets" label="摩天轮国际" />
        </span>
        <button
          class="concerts-btn concerts-btn--primary"
          disabled={concertsAddBusy.value}
          onClick={submitAdd}
        >
          {concertsAddBusy.value ? "添加中…" : "添加监听"}
        </button>
      </div>
      {concertsAddError.value ? (
        <div class="concerts-addbar__error">{concertsAddError.value}</div>
      ) : null}

      {!loaded ? <div class="concerts-empty">加载中…</div> : null}
      {loaded && watches.length === 0 ? (
        <div class="concerts-empty">
          <p>还没有监听任何演出。</p>
          <p class="concerts-empty__hint">
            打开 <SiteLink platform="piaoniu" label="票牛" /> /{" "}
            <SiteLink platform="motianlun" label="摩天轮国内" /> 详情页 /{" "}
            <SiteLink platform="moretickets" label="摩天轮国际" /> 详情页，
            复制地址粘贴即可。票档可 ★ 钉选；后台约每 2 分钟刷新，降价发系统通知。
          </p>
        </div>
      ) : null}

      {watches.length > 0 && (
        <div class="concerts-stats">
          <div class="concerts-stat">
            <span class="concerts-stat__num">{watches.length}</span>
            <span class="concerts-stat__label">监听中</span>
          </div>
          <div class="concerts-stat">
            <span class={`concerts-stat__num${droppingSessions > 0 ? " concerts-stat__num--down" : ""}`}>
              {droppingSessions}
            </span>
            <span class="concerts-stat__label">当前降价场次</span>
          </div>
          <div class="concerts-stat">
            <span class="concerts-stat__num">{pinnedCount}</span>
            <span class="concerts-stat__label">已钉选票档</span>
          </div>
          <div class="concerts-stat">
            <span class={`concerts-stat__num${soldoutSessions > 0 ? " concerts-stat__num--warn" : ""}`}>
              {soldoutSessions}
            </span>
            <span class="concerts-stat__label">缺货登记</span>
          </div>
        </div>
      )}

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
              <span class="concerts-chip">{CONCERT_PLATFORM_LABEL[watch.platform]}</span>
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
            <span class={`concerts-chip concerts-chip--${watch.platform}`}>
              {CONCERT_PLATFORM_LABEL[watch.platform]}
            </span>
            <a
              class="concerts-card__title"
              href="#"
              title={snapshot.detailUrl}
              onClick={(e: Event) => {
                e.preventDefault();
                api.openUrl(snapshot.detailUrl);
              }}
            >
              {snapshot.title || watch.id}
            </a>
            {snapshot.error ? (
              <span class="concerts-card__stale" title="本轮刷新失败，显示上次数据">
                缓存
              </span>
            ) : null}
          </div>
          {snapshot.city || snapshot.venue ? (
            <div class="concerts-card__meta">
              {[snapshot.city, snapshot.venue].filter(Boolean).join(" · ")}
            </div>
          ) : null}
        </div>
        <button class="concerts-card__remove" onClick={onRemove} title="取消监听">
          ✕
        </button>
      </div>

      {hasTiers && pinnedTiers.length > 0 ? (
        <div class="concerts-pinned">
          <span class="concerts-pinned__label">★ 盯档</span>
          {pinnedTiers.map((t) => {
            const qty = qtyMap[t.id] || watch.ticketCount || 1;
            return (
              <span class="concerts-ptier" key={`pin-${t.id}`}>
                <button
                  class="concerts-tier__pin concerts-tier__pin--on"
                  onClick={() => togglePin(t.id)}
                  title="取消盯价"
                  type="button"
                >
                  ★
                </button>
                <span class="concerts-ptier__name">{t.name}</span>
                {t.sessionName ? <span class="concerts-ptier__session">{t.sessionName}</span> : null}
                <label class="concerts-ptier__qty">
                  <select
                    value={qty}
                    onChange={(e: any) => setQty(t.id, Number(e.target.value) || 1)}
                    title="购票张数"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} 张
                      </option>
                    ))}
                  </select>
                </label>
                <span class="concerts-ptier__price">
                  ¥{tierUnitPrice(t, qty) ?? "—"}
                  <em>/{qty}张单价</em>
                </span>
                {tierDeltas && tierDeltas[t.id] != null ? <DeltaBadge d={tierDeltas[t.id]} /> : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {sessions.length === 0 ? (
        <div class="concerts-card__empty">
          {snapshot.error === "pending" ? "尚未抓取到数据" : "暂无在售场次"}
        </div>
      ) : (
        <div class="concerts-sessions">
          {sessions.map((s) => {
            const d = sessionDeltas ? sessionDeltas[s.id] : undefined;
            const sessionTiers: any[] = Array.isArray(s.tiers) ? s.tiers : [];
            return [
              <div class="concerts-session" key={s.id}>
                <div class="concerts-session__lead">
                  <div class="concerts-session__name">{s.name}</div>
                  {s.time ? <div class="concerts-session__time">{s.time}</div> : null}
                </div>
                <span
                  class={`concerts-status concerts-status--${(s.status || "").toLowerCase()}`}
                >
                  {s.hasTicket ? CONCERT_SESSION_STATUS_LABEL[s.status] || s.status : "缺货登记"}
                </span>
                <div class="concerts-session__price">
                  <span class="concerts-session__min">
                    {s.minPrice != null ? (
                      <>
                        {s.currencySymbol || ""}{s.minPrice}
                        {d != null ? <DeltaBadge d={d} /> : null}
                      </>
                    ) : (
                      <span class="concerts-session__noprice">—</span>
                    )}
                  </span>
                  {s.originalPrice != null ? (
                    <span class="concerts-session__face">
                      票面 {s.currencySymbol || ""}{s.originalPrice}
                    </span>
                  ) : null}
                </div>
                {hasTiers ? (
                  <button class="concerts-tiers-toggle" onClick={() => toggleTiers(s)}>
                    {expandedSession === s.id
                      ? "收起 ▴"
                      : `票档 ${sessionTiers.length || 0} ▸`}
                  </button>
                ) : null}
              </div>,
              expandedSession === s.id && hasTiers ? (
                <div class="concerts-tiers" key={`${s.id}-tiers`}>
                  {sessionTiers.length === 0 ? (
                    <span class="concerts-tiers__empty">暂无票档数据（刷新后可获取）</span>
                  ) : (
                    sessionTiers.map((t: any) => (
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
                    ))
                  )}
                </div>
              ) : null,
            ];
          })}
        </div>
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
