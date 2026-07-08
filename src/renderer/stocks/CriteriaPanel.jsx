/**
 * src/renderer/stocks/CriteriaPanel.jsx
 *
 * 精简条件区 — 默认露 PE/ROE/市值, 高级折叠 PB/股息/换手/动量.
 * 改任何条件 → setCriteria → 自动切 custom.
 *
 * ponytail 2026-07-08 D-2: 加行业 chip 多选器 (默认折叠). 跟"高级"并列展开.
 *   - 数据源: results.value 动态收集 industries (而非 hardcode, 永远跟当前结果同步)
 *   - 空数组 = 全行业 (跟 stock-filter.js matchCriteria 行为一致)
 *   - AI 推荐产出的 industries 数组自动进 store, 也能在这里看到 + 修改
 */
import { useMemo } from "preact/hooks";
import {
  criteria,
  setCriteria,
  advancedOpen,
  toggleAdvanced,
  results,
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

/**
 * 行业 chip 多选器. ponytail: chip 排成一行, 多了 wrap. 默认空数组 = 全行业.
 * 来源: 当前 results 动态收集, 永远跟数据同步; 也接受 AI 推荐产出的数组直接显示.
 */
function IndustryChips() {
  // ponytail: 收集所有出现过的 industry, 按字母/中文拼音排. 缺数据的票可能没 industry,
  // 跳过 (空字符串). 用 useMemo 缓存, results 引用变才重算.
  const allIndustries = useMemo(() => {
    const set = new Set();
    for (const r of results.value) {
      if (r && r.industry) set.add(r.industry);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [results.value]);
  const selected = criteria.value.industries || [];
  const isAll = selected.length === 0;

  function toggle(name) {
    if (isAll) {
      // ponytail: 从"全选"状态切到只选这一项 (而不是"全选 + 选这个" = 全部)
      setCriteria({ industries: [name] });
      return;
    }
    const has = selected.includes(name);
    const next = has ? selected.filter((x) => x !== name) : [...selected, name];
    // ponytail: 取消到 0 个时回到 "全部" (而不是空数组 = 0 命中, 跟用户直觉不符)
    setCriteria({ industries: next.length === 0 ? [] : next });
  }

  function clearAll() {
    setCriteria({ industries: [] });
  }

  function selectAll() {
    setCriteria({ industries: allIndustries });
  }

  if (allIndustries.length === 0) {
    return (
      <div class="stock-criteria-industries stock-criteria-industries-empty">
        筛选后可见
      </div>
    );
  }

  return (
    <div class="stock-criteria-industries">
      <span class="stock-criteria-industries-label">
        行业 {isAll ? `(全部 ${allIndustries.length})` : `(已选 ${selected.length}/${allIndustries.length})`}
      </span>
      <div class="stock-criteria-industries-chips">
        {allIndustries.map((name) => {
          const active = !isAll && selected.includes(name);
          return (
            <button
              key={name}
              type="button"
              class={`stock-criteria-industry-chip${active ? " stock-criteria-industry-chip-active" : ""}`}
              onClick={() => toggle(name)}
              title={active ? `取消 ${name}` : `只选 ${name}`}
            >
              {name}
            </button>
          );
        })}
      </div>
      {!isAll && (
        <button
          type="button"
          class="stock-criteria-industries-clear"
          onClick={clearAll}
        >
          清空
        </button>
      )}
      {isAll && allIndustries.length > 1 && (
        <button
          type="button"
          class="stock-criteria-industries-clear"
          onClick={selectAll}
          title="排除全行业 (一般用不到)"
        >
          全选
        </button>
      )}
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
        <>
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
          <IndustryChips />
        </>
      )}
    </div>
  );
}

export default CriteriaPanel;
