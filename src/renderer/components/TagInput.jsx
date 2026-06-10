/**
 * src/renderer/components/TagInput.jsx
 *
 * v2.7.0 (My Apps Library, B6): 给单个 app 加 / 删 tag 的 inline input.
 *
 * 形态: 一个 input 框, Enter 提交 (新 tag), 点 chip 删 (已有 tag).
 * 数据流: 调 api.librarySetTags({...currentTags, [appName]: [newList]}).
 *
 * 跟 PinnedSection / TagBar 一样, 走 library.tags object map.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { libraryConfig } from '../store.js';
import { api } from '../api.js';

export function TagInput({ appName }) {
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef(null);
  const tags = (libraryConfig.value && libraryConfig.value.tags) || {};
  const appTags = (tags[appName] || []).slice(); // 拷一份

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  function onSubmit() {
    const trimmed = input.trim();
    if (!trimmed) {
      setExpanded(false);
      return;
    }
    if (appTags.includes(trimmed)) {
      // 严格大小写: 'Dev' / 'dev' 是 2 个不同 tag, 不去重
      // 但 '  Dev  ' 跟 'Dev' 算同 (trim 后比)
      if (appTags.some((t) => t === trimmed)) {
        setInput('');
        return;
      }
    }
    const next = { ...tags, [appName]: [...appTags, trimmed] };
    api.librarySetTags(next);
    setInput('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    } else if (e.key === 'Escape') {
      setInput('');
      setExpanded(false);
      e.preventDefault();
    }
  }

  function onRemove(tag) {
    const next = { ...tags, [appName]: appTags.filter((t) => t !== tag) };
    // 删光 → 直接删 key (干净)
    if (next[appName].length === 0) delete next[appName];
    api.librarySetTags(next);
  }

  return (
    <div class="tag-input">
      {appTags.length > 0 && (
        <div class="tag-input-chips">
          {appTags.map((t) => (
            <span key={t} class="tag-input-chip">
              {t}
              <button
                class="tag-input-chip-remove"
                onClick={() => onRemove(t)}
                aria-label={`删 tag ${t}`}
                title="删"
              >×</button>
            </span>
          ))}
        </div>
      )}
      {expanded ? (
        <input
          ref={inputRef}
          type="text"
          class="tag-input-field"
          placeholder="加 tag…"
          value={input}
          onInput={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // 失焦时如有内容也提交, 跟 Enter 行为一致
            if (input.trim()) onSubmit();
            else setExpanded(false);
          }}
          maxLength={32}
        />
      ) : (
        <button
          class="tag-input-add"
          onClick={() => setExpanded(true)}
          title="加 tag"
        >
          + tag
        </button>
      )}
    </div>
  );
}
