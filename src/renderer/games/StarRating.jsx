/**
 * src/renderer/games/StarRating.jsx
 *
 * 私有评分组件（P0-4）：1–5 星，0 = 未评。
 * - 受控：value / onChange(rating)。
 * - 键盘可达：radiogroup 语义，方向键移动并选择，Home/End 跳首尾；焦点环清晰。
 * - 对比度：实心星用语义强调色，与背景 ≥3:1；状态辅以 aria-checked 文本。
 */
import { useRef } from "preact/hooks";
import { RATING_MAX, RATING_MIN } from "./gamesStore.js";

export function StarRating({ value, onChange }) {
  const refs = useRef([]);
  const current = Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(value || 0)));

  function focusStar(n) {
    const idx = Math.max(1, Math.min(RATING_MAX, n)) - 1;
    const el = refs.current[idx];
    if (el) el.focus();
  }

  function onKeyDown(e, n) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        onChange(Math.min(RATING_MAX, n + 1));
        focusStar(n + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        onChange(Math.max(RATING_MIN + 1, n - 1));
        focusStar(n - 1);
        break;
      case "Home":
        e.preventDefault();
        onChange(1);
        focusStar(1);
        break;
      case "End":
        e.preventDefault();
        onChange(RATING_MAX);
        focusStar(RATING_MAX);
        break;
      default:
        break;
    }
  }

  return (
    <div class="star-rating">
      <div
        class="star-rating__stars"
        role="radiogroup"
        aria-label="私人评分（1 到 5 星，0 为未评）"
      >
        {Array.from({ length: RATING_MAX }, (_, i) => {
          const n = i + 1;
          const filled = n <= current;
          return (
            <button
              type="button"
              key={n}
              ref={(el) => (refs.current[i] = el)}
              class={`star-rating__star${filled ? " is-filled" : ""}`}
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} 星`}
              tabIndex={current === 0 ? (n === 1 ? 0 : -1) : value === n ? 0 : -1}
              onClick={() => onChange(n)}
              onKeyDown={(e) => onKeyDown(e, n)}
            >
              {filled ? "★" : "☆"}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        class="star-rating__clear"
        onClick={() => onChange(0)}
      >
        清除
      </button>
      <span class="star-rating__value" aria-live="polite">
        {current > 0 ? `${current} 星` : "未评分"}
      </span>
    </div>
  );
}

export default StarRating;
