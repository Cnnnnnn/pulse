/**
 * src/renderer/food/FoodHeader.jsx
 *
 * 顶部控制栏 — 位置输入 / 📍 定位 / 半径 / 刷新.
 *
 * 防抖 600ms: 输入文字后 600ms 自动触发搜索.
 * Geolocation: 10s 超时, 失败 toast 提示走手动输入.
 */

import { useEffect, useRef, useState } from "preact/hooks";

const GEO_TIMEOUT_MS = 10000;
const DEBOUNCE_MS = 600;

export function FoodHeader({ onSearch, onLocationError, hasGeo }) {
  const [text, setText] = useState("");
  const [radius, setRadius] = useState(1000);
  const debounceRef = useRef(null);

  function trigger(opts = {}) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onSearch && onSearch({
      location: text.trim() || null,
      radius,
      ...opts,
    });
  }

  function onTextInput(e) {
    const v = e.target.value;
    setText(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (v.trim()) trigger();
    }, DEBOUNCE_MS);
  }

  function onRadiusChange(e) {
    const r = parseInt(e.target.value, 10);
    setRadius(r);
    if (text.trim()) trigger();
  }

  function onGeoClick() {
    if (!hasGeo) return;
    if (!navigator.geolocation) {
      onLocationError && onLocationError("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // 用 lat,lng 直接触发, 不写回 text (避免覆盖用户输入)
        onSearch && onSearch({
          location: { lat: latitude, lng: longitude },
          radius,
        });
      },
      (err) => {
        const reason =
          err.code === 1 ? "denied" :
          err.code === 2 ? "unavailable" :
          err.code === 3 ? "timeout" : "unknown";
        onLocationError && onLocationError(reason);
      },
      { timeout: GEO_TIMEOUT_MS },
    );
  }

  function onRefresh() {
    trigger({ forceRefresh: true });
  }

  // 组件卸载时清掉防抖
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div class="food-header">
      <input
        type="text"
        class="food-header-input"
        placeholder="输入位置 (如: 北京·国贸)"
        value={text}
        onInput={onTextInput}
        aria-label="位置"
      />
      {hasGeo && (
        <button
          type="button"
          class="food-header-geo-btn"
          onClick={onGeoClick}
          title="使用当前位置"
          aria-label="使用当前位置"
        >
          📍
        </button>
      )}
      <select
        class="food-header-radius"
        value={radius}
        onChange={onRadiusChange}
        aria-label="搜索半径"
      >
        <option value={500}>500m</option>
        <option value={1000}>1000m</option>
        <option value={2000}>2000m</option>
      </select>
      <button
        type="button"
        class="food-header-refresh-btn"
        onClick={onRefresh}
        title="强制刷新"
        aria-label="强制刷新"
      >
        ↻
      </button>
    </div>
  );
}

export default FoodHeader;