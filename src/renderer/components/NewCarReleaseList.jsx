/**
 * src/renderer/components/NewCarReleaseList.jsx
 *
 * 主列表: 缩略图占位 + 车型名 + 品牌/类型/能源/状态 Badge + 日期 + 价格区间.
 * 行高 ≥44px, 列表用 <ul>/<li>, 行可键盘激活 (Enter/Space). 复用 UsageDetailList 风格.
 * 视觉: 仅引用主站设计令牌, 跟随 data-theme; 无裸 hex.
 */

import {
  STATUS_TOKEN,
  STATUS_TOKEN_BG,
  THUMB_PALETTE,
  stableIndex,
  formatPriceRange,
} from '../../newcar/types.js';

/**
 * 品牌首字 + 渐变占位 (用令牌色, 无图).
 * @param {object} props
 * @param {import('../../newcar/types.js').ReleaseRecord} props.record
 */
function CarThumb({ record }) {
  const i = stableIndex(record.brand, THUMB_PALETTE.length);
  const j = stableIndex(record.id, THUMB_PALETTE.length);
  const a = THUMB_PALETTE[i];
  const b = THUMB_PALETTE[(j + 2) % THUMB_PALETTE.length];
  const ch = (record.brand || '?').charAt(0);
  return (
    <span
      class="newcar-thumb"
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden="true"
    >
      {ch}
    </span>
  );
}

/**
 * @param {object} props
 * @param {import('../../newcar/types.js').ReleaseRecord[]} props.releases
 * @param {(r: import('../../newcar/types.js').ReleaseRecord) => void} [props.onOpen]
 */
export function NewCarReleaseList({ releases, onOpen }) {
  if (!releases || releases.length === 0) {
    return (
      <div class="newcar-list newcar-list--empty">
        暂无匹配的发布（试试调整筛选条件或清除日期筛选）
      </div>
    );
  }

  const open = (r) => {
    if (onOpen) onOpen(r);
  };

  return (
    <ul class="newcar-list">
      {releases.map((r) => (
        <li
          key={r.id}
          class="newcar-row"
          role="button"
          tabIndex={0}
          onClick={() => open(r)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open(r);
            }
          }}
        >
          <CarThumb record={r} />
          <div class="newcar-row-main">
            <div class="newcar-row-name">{r.name}</div>
            <div class="newcar-row-meta">
              <span class="newcar-badge newcar-badge--type">{r.type}</span>
              <span class="newcar-badge newcar-badge--energy">{r.energyType}</span>
              <span
                class="newcar-badge newcar-badge--status"
                style={{ color: STATUS_TOKEN[r.status], background: STATUS_TOKEN_BG[r.status] }}
              >
                {r.status}
              </span>
            </div>
          </div>
          <div class="newcar-row-side">
            <div class="newcar-row-date">{r.releaseDate}</div>
            <div class="newcar-row-price">{formatPriceRange(r.priceMin, r.priceMax)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default NewCarReleaseList;
