/**
 * src/renderer/components/CommandPalette.jsx
 *
 * Cmd+K 全局命令面板. 3 类结果: app (跳转 Library) / action (执行) / view (navigateTo).
 * 键盘导航: ↑↓ 切换, Enter 执行, Esc 关闭.
 */
import { useEffect, useRef } from "preact/hooks";
import {
  paletteOpen, paletteQuery, paletteResults, paletteSelectedIndex,
  closePalette, setPaletteQuery, setPaletteResults, setPaletteSelectedIndex,
} from "../command-palette-store.js";
import { navigateTo } from "../route-store.js";
import { api } from "../api.js";
import { IconSearch } from "./icons.jsx";

const KIND_LABEL = { app: "应用", action: "操作", view: "页面" };

export function CommandPalette() {
  const open = paletteOpen.value;
  const query = paletteQuery.value;
  const results = paletteResults.value;
  const selected = paletteSelectedIndex.value;
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current && inputRef.current.focus();

    function onKey(e) {
      if (e.key === "Escape") {
        closePalette();
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        setPaletteSelectedIndex(Math.min(results.length - 1, selected + 1));
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowUp") {
        setPaletteSelectedIndex(Math.max(0, selected - 1));
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        const item = results[selected];
        if (item) execute(item);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, selected]);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        paletteOpen.value = !paletteOpen.value;
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    if (!query || query.length < 1) {
      setPaletteResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      if (!api.versionsCommandSearch) return;
      const r = await api.versionsCommandSearch(query);
      if (r && r.ok) {
        setPaletteResults(r.results || []);
        setPaletteSelectedIndex(0);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  function execute(item) {
    if (item.kind === "view") navigateTo(item.id);
    else if (item.kind === "action" && item.id === "action-check") api.runCheck();
    else if (item.kind === "app") navigateTo("library");
    closePalette();
  }

  if (!open) return null;

  return (
    <div class="command-palette-overlay" role="dialog" aria-modal="true" aria-label="命令面板">
      <div class="command-palette">
        <div class="command-palette-input-wrap">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            class="command-palette-input"
            type="text"
            value={query}
            onInput={(e) => setPaletteQuery(e.currentTarget.value)}
            placeholder="搜索 app 或输入操作..."
            role="combobox"
            aria-controls="command-palette-listbox"
            aria-expanded="true"
            aria-autocomplete="list"
          />
        </div>
        <ul id="command-palette-listbox" class="command-palette-list" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.id}
              class={`command-palette-item${i === selected ? " selected" : ""}`}
              role="option"
              aria-selected={i === selected}
              onMouseEnter={() => setPaletteSelectedIndex(i)}
              onClick={() => execute(r)}
            >
              <span class={`command-palette-kind kind-${r.kind}`}>{KIND_LABEL[r.kind]}</span>
              <span class="command-palette-label">{r.label}</span>
            </li>
          ))}
          {results.length === 0 && query.length >= 1 && (
            <li class="command-palette-empty">无匹配结果</li>
          )}
        </ul>
      </div>
    </div>
  );
}

export default CommandPalette;
