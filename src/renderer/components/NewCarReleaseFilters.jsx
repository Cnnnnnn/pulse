/**
 * src/renderer/components/NewCarReleaseFilters.jsx
 *
 * 筛选栏 (P0): 品牌下拉 + 价格区间滑块 + 能源 chips + 状态 chips.
 * 驱动 newcar-store 的 filters 信号 (onChange 合并回写).
 * 仅引用现有设计令牌, 无裸 hex.
 */

import { ENERGY_TYPES, RELEASE_STATUSES } from '../../newcar/types.js';

/** 价格滑块上限 (万元). */
const PRICE_MAX = 120;

/**
 * 在数组中切换某值 (不可变).
 * @template T
 * @param {T[]|undefined} arr
 * @param {T} val
 * @returns {T[]}
 */
function toggleInArray(arr, val) {
  const set = new Set(arr || []);
  if (set.has(val)) set.delete(val);
  else set.add(val);
  return [...set];
}

/**
 * @param {object} props
 * @param {import('../../newcar/types.js').FilterState} props.filters
 * @param {string[]} props.brands
 * @param {(next: import('../../newcar/types.js').FilterState) => void} props.onChange
 */
export function NewCarReleaseFilters({ filters, brands, onChange }) {
  const f = filters || {};
  const pMin = f.priceMin != null ? f.priceMin : 0;
  const pMax = f.priceMax != null ? f.priceMax : PRICE_MAX;

  const patch = (next) => onChange({ ...f, ...next });

  return (
    <div class="newcar-filters">
      <div class="newcar-filter-group">
        <label class="newcar-filter-label" for="newcar-brand">
          品牌
        </label>
        <select
          id="newcar-brand"
          class="newcar-select"
          value={f.brands && f.brands.length === 1 ? f.brands[0] : ''}
          onChange={(e) => {
            const v = e.currentTarget.value;
            patch({ brands: v ? [v] : [] });
          }}
        >
          <option value="">全部品牌</option>
          {brands.map((b) => (
            <option value={b} key={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div class="newcar-filter-group newcar-filter-group--range">
        <span class="newcar-filter-label">价格（万元）</span>
        <div class="newcar-range">
          <input
            type="range"
            class="newcar-range-input"
            min={0}
            max={PRICE_MAX}
            step={1}
            value={pMin}
            aria-label="价格下限"
            onInput={(e) => patch({ priceMin: Math.min(Number(e.currentTarget.value), pMax) })}
          />
          <input
            type="range"
            class="newcar-range-input"
            min={0}
            max={PRICE_MAX}
            step={1}
            value={pMax}
            aria-label="价格上限"
            onInput={(e) => patch({ priceMax: Math.max(Number(e.currentTarget.value), pMin) })}
          />
          <span class="newcar-range-val">
            {pMin} – {pMax}
            {pMax >= PRICE_MAX ? '+' : ''} 万
          </span>
        </div>
        {(f.priceMin != null || f.priceMax != null) && (
          <button
            type="button"
            class="newcar-clear"
            onClick={() => patch({ priceMin: null, priceMax: null })}
          >
            清除价格
          </button>
        )}
      </div>

      <div class="newcar-filter-group">
        <span class="newcar-filter-label">能源</span>
        <div class="newcar-chips">
          {ENERGY_TYPES.map((e) => {
            const active = (f.energyTypes || []).includes(e);
            return (
              <button
                type="button"
                key={e}
                class={`newcar-chip${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => patch({ energyTypes: toggleInArray(f.energyTypes, e) })}
              >
                {e}
              </button>
            );
          })}
        </div>
      </div>

      <div class="newcar-filter-group">
        <span class="newcar-filter-label">状态</span>
        <div class="newcar-chips">
          {RELEASE_STATUSES.map((s) => {
            const active = (f.status || []).includes(s);
            return (
              <button
                type="button"
                key={s}
                class={`newcar-chip${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => patch({ status: toggleInArray(f.status, s) })}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {f.date && (
        <button
          type="button"
          class="newcar-chip newcar-chip--date"
          onClick={() => patch({ date: null })}
          title="清除日期筛选"
        >
          {f.date} ✕
        </button>
      )}
    </div>
  );
}

export default NewCarReleaseFilters;
