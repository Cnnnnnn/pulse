/**
 * src/renderer/games/RarityPicker.jsx — 稀有度单选组件（P1a · A）。
 *
 * 用于 GameCard「更多」菜单与 NoteRatingModal 内嵌。覆盖式单选：
 *  - 每个档位一个 chip，按 weight 降序排列；
 *  - 「未分级」chip 清除选择（rarity = null）；
 *  - 可选 onAddTier 暴露「＋ 自定义」入口，新增档位（持久化由父层处理）。
 *
 * 样式约束：颜色仅用 var(--rarity-color)（由档位 color 提供）经 color-mix 主题感知；
 * 数值非必需；可交互元素 ≥44px 触控热区、焦点环（见 games.css）。
 */
import { useState } from "preact/hooks";
import { sortByWeight } from "./rarityTiers.js";

/**
 * @param {object} props
 * @param {string|null} props.value 当前选中的档位 id（null = 未分级）
 * @param {Array<{id:string,name:string,weight:number,color:string}>} props.tiers 档位列表
 * @param {(tierId:string|null)=>void} props.onSelect 选择回调（含 null 清除）
 * @param {(name:string)=>void} [props.onAddTier] 新增自定义档位回调（提供则显示入口）
 */
export function RarityPicker({ value, tiers, onSelect, onAddTier }) {
  const list = sortByWeight(tiers || []);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commitAdd() {
    const v = draft.trim();
    if (v && onAddTier) onAddTier(v);
    setDraft("");
    setAdding(false);
  }

  return (
    <div class="rarity-picker" role="group" aria-label="设置稀有度">
      <button
        type="button"
        class={`rarity-picker__chip${value == null ? " is-on" : ""}`}
        aria-pressed={value == null}
        onClick={() => onSelect(null)}
      >
        未分级
      </button>

      {list.map((t) => (
        <button
          type="button"
          key={t.id}
          class={`rarity-picker__chip${value === t.id ? " is-on" : ""}`}
          aria-pressed={value === t.id}
          style={{ "--rarity-color": t.color }}
          onClick={() => onSelect(t.id)}
        >
          <span class="rarity-picker__dot" aria-hidden="true" />
          {t.name}
        </button>
      ))}

      {onAddTier &&
        (adding ? (
          <span class="rarity-picker__add">
            <input
              class="rarity-picker__input"
              type="text"
              value={draft}
              placeholder="新档位名称"
              aria-label="新增稀有度档位"
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd();
                if (e.key === "Escape") setAdding(false);
              }}
              ref={(el) => el && el.focus()}
            />
            <button type="button" class="rarity-picker__add-btn" onClick={commitAdd}>
              添加
            </button>
          </span>
        ) : (
          <button
            type="button"
            class="rarity-picker__chip rarity-picker__chip--new"
            onClick={() => setAdding(true)}
          >
            ＋ 自定义
          </button>
        ))}
    </div>
  );
}

export default RarityPicker;
