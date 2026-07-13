/**
 * src/renderer/components/NewCarReleaseDetail.jsx
 *
 * 详情视图: 大图册占位网格 + 标题/品牌/日期 + 参数表 + 价格区间条 + 来源链接 + Ghost 返回.
 * 顶部调用 fetchCarDetails(id) (MVP 返 null, 不阻断); P1 接 API 后可补 gallery/specs.
 * 仅引用现有设计令牌, 无裸 hex.
 */

import { useEffect, useState } from 'preact/hooks';
import { fetchCarDetails } from '../../newcar/dataset.js';
import { api } from '../api.js';
import {
  STATUS_TOKEN,
  STATUS_TOKEN_BG,
  formatPriceRange,
} from '../../newcar/types.js';

/** 价格区间条比例尺上限 (万元). */
const PRICE_SCALE = 120;

/**
 * @param {object} props
 * @param {import('../../newcar/types.js').ReleaseRecord|null} props.record
 * @param {() => void} props.onBack
 */
export function NewCarReleaseDetail({ record, onBack }) {
  const [details, setDetails] = useState(null);

  useEffect(() => {
    let alive = true;
    setDetails(null);
    if (record && record.id) {
      fetchCarDetails(record.id)
        .then((d) => {
          if (alive) setDetails(d);
        })
        .catch(() => {
          /* 静默降级 (MVP 必为 null) */
        });
    }
    return () => {
      alive = false;
    };
  }, [record]);

  if (!record) return null;

  const openSource = () => {
    if (record.sourceUrl && api && typeof api.openUrl === 'function') {
      try {
        api.openUrl(record.sourceUrl);
      } catch {
        /* ignore */
      }
    }
  };

  const lo = record.priceMin != null ? record.priceMin : 0;
  const hi =
    record.priceMax != null
      ? record.priceMax
      : record.priceMin != null
        ? record.priceMin
        : 0;
  const leftPct = Math.min(100, (lo / PRICE_SCALE) * 100);
  const widthPct = Math.max(2, Math.min(100, ((hi - lo) / PRICE_SCALE) * 100));

  const specs = [
    ['品牌', record.brand],
    ['车型', record.type],
    ['能源', record.energyType],
    ['状态', record.status],
    ['发布日期', record.releaseDate],
  ];

  return (
    <div class="newcar-detail">
      <button type="button" class="newcar-back" onClick={onBack}>
        <span aria-hidden="true">←</span> 返回列表
      </button>

      <div class="newcar-detail-head">
        <div class="newcar-detail-titles">
          <h2 class="newcar-detail-title">{record.name}</h2>
          <div class="newcar-row-meta">
            <span class="newcar-badge newcar-badge--type">{record.type}</span>
            <span class="newcar-badge newcar-badge--energy">{record.energyType}</span>
            <span
              class="newcar-badge newcar-badge--status"
              style={{ color: STATUS_TOKEN[record.status], background: STATUS_TOKEN_BG[record.status] }}
            >
              {record.status}
            </span>
          </div>
        </div>
        <div class="newcar-detail-date">{record.releaseDate}</div>
      </div>

      {/* 大图册占位网格 (MVP 无图, 用渐变占位) */}
      <div class="newcar-gallery" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div class="newcar-gallery-cell" key={i} />
        ))}
      </div>

      {/* 参数表 */}
      <div class="newcar-spec">
        {specs.map(([k, v]) => (
          <div class="newcar-spec-row" key={k}>
            <span class="newcar-spec-k">{k}</span>
            <span class="newcar-spec-v">{v}</span>
          </div>
        ))}
        {details && details.specs
          ? Object.entries(details.specs).map(([k, v]) => (
              <div class="newcar-spec-row" key={k}>
                <span class="newcar-spec-k">{k}</span>
                <span class="newcar-spec-v">{v}</span>
              </div>
            ))
          : null}
      </div>

      {/* 价格区间条 */}
      <div class="newcar-price">
        <div class="newcar-price-label">价格区间（万元）</div>
        <div class="newcar-price-bar">
          <div
            class="newcar-price-fill"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          />
        </div>
        <div class="newcar-price-range">{formatPriceRange(record.priceMin, record.priceMax)}</div>
      </div>

      {!details && (
        <p class="newcar-detail-hint">
          详细参数与图册（来源 API）暂未接入，将在 P1 增强中补全。
        </p>
      )}

      {record.sourceUrl && (
        <button type="button" class="newcar-source" onClick={openSource}>
          查看来源 ↗
        </button>
      )}
    </div>
  );
}

export default NewCarReleaseDetail;
