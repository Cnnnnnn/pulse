/**
 * src/renderer/stocks/CriteriaPanel.jsx
 *
 * 精简条件区 — 默认露 PE/ROE/市值, 高级折叠 PB/股息/换手/动量.
 * 改任何条件 → setCriteria → 自动切 custom.
 */
import {
  criteria,
  setCriteria,
  advancedOpen,
  toggleAdvanced,
} from "./stockStore.js";
import { MARKET_CAP_TIERS } from "../../stocks/stock-constants";
import { IconSettings } from "../components/icons.jsx";

function RangeInput({ label, minKey, maxKey, suffix }) {
  const c = criteria.value;
  const numOrNull = (v) => (v === "" ? null : Number(v));
  return (
    <div class="stock-criteria-field">
      <span class="stock-criteria-name">{label}</span>
      <input
        class="stock-criteria-input"
        type="number"
        inputMode="numeric"
        value={c[minKey] == null ? "" : c[minKey]}
        onInput={(e) =>
          setCriteria({ [minKey]: numOrNull(e.currentTarget.value) })
        }
        placeholder="—"
      />
      <span class="stock-criteria-sep">~</span>
      <input
        class="stock-criteria-input"
        type="number"
        inputMode="numeric"
        value={c[maxKey] == null ? "" : c[maxKey]}
        onInput={(e) =>
          setCriteria({ [maxKey]: numOrNull(e.currentTarget.value) })
        }
        placeholder="—"
      />
      {suffix && <span class="stock-criteria-suffix">{suffix}</span>}
    </div>
  );
}

function MinInput({ label, minKey, suffix }) {
  const c = criteria.value;
  const numOrNull = (v) => (v === "" ? null : Number(v));
  return (
    <div class="stock-criteria-field">
      <span class="stock-criteria-name">{label}</span>
      <span class="stock-criteria-sep">≥</span>
      <input
        class="stock-criteria-input"
        type="number"
        inputMode="numeric"
        value={c[minKey] == null ? "" : c[minKey]}
        onInput={(e) =>
          setCriteria({ [minKey]: numOrNull(e.currentTarget.value) })
        }
        placeholder="—"
      />
      {suffix && <span class="stock-criteria-suffix">{suffix}</span>}
    </div>
  );
}

export function CriteriaPanel() {
  const c = criteria.value;
  const adv = advancedOpen.value;
  return (
    <div class="stock-criteria-panel">
      <div class="stock-criteria-row">
        <RangeInput label="PE" minKey="peMin" maxKey="peMax" />
        <MinInput label="ROE" minKey="roeMin" suffix="%" />
        <div class="stock-criteria-field">
          <span class="stock-criteria-name">市值</span>
          <select
            class="stock-criteria-select"
            value={c.marketCapTier}
            onChange={(e) =>
              setCriteria({ marketCapTier: e.currentTarget.value })
            }
          >
            {MARKET_CAP_TIERS.map((t) => (
              <option key={t} value={t}>
                {t === "all"
                  ? "全部"
                  : t === "large"
                    ? "大盘"
                    : t === "mid"
                      ? "中盘"
                      : "小盘"}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          class="stock-criteria-advanced-toggle"
          onClick={toggleAdvanced}
        >
          {adv ? (<><IconSettings size={14} /> 收起</>) : (<><IconSettings size={14} /> 高级</>)}
        </button>
      </div>
      {adv && (
        <div class="stock-criteria-row">
          <RangeInput label="PB" minKey="pbMin" maxKey="pbMax" />
          <MinInput label="股息率" minKey="dividendYieldMin" suffix="%" />
          <RangeInput
            label="换手率"
            minKey="turnoverMin"
            maxKey="turnoverMax"
            suffix="%"
          />
          <MinInput label="近5日" minKey="change5dMin" suffix="%" />
        </div>
      )}
    </div>
  );
}

export default CriteriaPanel;
