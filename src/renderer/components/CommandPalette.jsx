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
import { setThemePreference } from "../theme/theme-manager.js";
import { showToast } from "../store.js";
import { IconSearch } from "./icons.jsx";

const KIND_LABEL = { app: "应用", action: "操作", view: "页面" };

// P12: 主题切换静态命令 (renderer-local, 不走 IPC).
// 匹配关键词: "主题" / "theme" / "浅色" / "深色" / "跟随系统" / "切换".
const THEME_COMMANDS = [
  { id: "theme-light",  label: "切换为浅色",  kind: "action", theme: "light",  match: ["浅色", "light", "亮色"] },
  { id: "theme-dark",   label: "切换为深色",  kind: "action", theme: "dark",   match: ["深色", "dark"] },
  { id: "theme-system", label: "跟随系统主题", kind: "action", theme: "system", match: ["跟随系统", "系统", "自动", "system", "auto"] },
];
const THEME_TOAST = { light: "浅色", dark: "深色", system: "跟随系统" };
function matchThemeCommands(q) {
  const lower = q.toLowerCase();
  return THEME_COMMANDS.filter((c) => c.match.some((m) => lower.includes(m.toLowerCase())));
}

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
    // P12: 主题切换命令放在最前 (renderer-local, 无延迟).
    const themeHits = matchThemeCommands(query);
    const timer = setTimeout(async () => {
      let ipcHits = [];
      if (api.versionsCommandSearch) {
        const r = await api.versionsCommandSearch(query);
        if (r && r.ok) ipcHits = r.results || [];
      }
      setPaletteResults([...themeHits, ...ipcHits].slice(0, 10));
      setPaletteSelectedIndex(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  function execute(item) {
    if (item.kind === "view") navigateTo(item.id);
    else if (item.kind === "action" && item.id === "action-check") {
      api.versionsRunCheck && api.versionsRunCheck();
    }
    else if (item.kind === "action" && typeof item.theme === "string") {
      // P12: Cmd+K 主题切换 + toast 反馈
      setThemePreference(item.theme);
      showToast(`主题已切换为「${THEME_TOAST[item.theme] || item.theme}」`, "success", 1800);
    }
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
