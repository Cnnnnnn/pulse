/**
 * src/renderer/components/TagBar.jsx
 *
 * v2.7.0 (My Apps Library, B6): 顶部 tag 过滤 chip 横条.
 *
 * 数据源: libraryConfig.tags (object: {appName: [tag1, tag2]})
 * 派生出全部 tag 列表 (unique) + 每个 tag 的 count.
 * 点击 chip → 切 activeTagFilter signal, selectors 自动过滤.
 *
 * 附加: 3 个预定义 popular tag (dev / design / ai), 用户没自己 tag 时也能点.
 * 设计原则 (跟 v5 brainstorm 决定一致): tag 自由文本, popular 列表只是预填建议.
 */

import { useMemo } from 'preact/hooks';
import { libraryConfig, activeTagFilter } from '../store.js';

// 预定义 popular tag — 仅用于"新用户空状态"时的快速入口
// 用户已经在 library.tags 里加的 tag 也会显示 (按字母序, popular 在前)
const POPULAR_TAGS = ['dev', 'ai', 'design', 'work', 'personal', 'media'];

export function TagBar() {
  const tags = (libraryConfig.value && libraryConfig.value.tags) || {};

  // 派生: 全部 unique tag + count
  const tagCounts = useMemo(() => {
    const counts = new Map();
    for (const list of Object.values(tags)) {
      if (!Array.isArray(list)) continue;
      for (const t of list) {
        if (typeof t !== 'string' || t.length === 0) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return counts;
  }, [tags]);

  // 排序: popular 在前 (按 POPULAR_TAGS 顺序) + 其它按字母
  const sortedTags = useMemo(() => {
    const all = Array.from(tagCounts.keys());
    const popular = POPULAR_TAGS.filter((t) => tagCounts.has(t));
    const others = all
      .filter((t) => !POPULAR_TAGS.includes(t))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return [...popular, ...others];
  }, [tagCounts]);

  // 没 tag → 显示 3 个 popular 入口 (灰显, hover 提示 "点 app 行加 tag")
  if (sortedTags.length === 0) {
    return (
      <div class="tag-bar tag-bar-empty">
        <span class="tag-bar-label">tag:</span>
        {POPULAR_TAGS.slice(0, 3).map((t) => (
          <span
            key={t}
            class="tag-chip tag-chip-suggestion"
            title="点 app 行的 + tag 按钮, 给 app 加 tag 后这里会出现"
          >
            + {t}
          </span>
        ))}
      </div>
    );
  }

  function onClickTag(t) {
    activeTagFilter.value = activeTagFilter.value === t ? null : t;
  }

  return (
    <div class="tag-bar">
      <span class="tag-bar-label">tag:</span>
      {sortedTags.map((t) => {
        const active = activeTagFilter.value === t;
        const count = tagCounts.get(t) || 0;
        return (
          <button
            key={t}
            class={`tag-chip${active ? ' active' : ''}`}
            onClick={() => onClickTag(t)}
            title={active ? `取消 "${t}" 过滤` : `仅显示 tag 为 "${t}" 的 app`}
          >
            {t}
            <span class="count">{count}</span>
          </button>
        );
      })}
      {activeTagFilter.value && (
        <button
          class="tag-bar-clear"
          onClick={() => { activeTagFilter.value = null; }}
          title="清空 tag 过滤"
        >
          清空 ×
        </button>
      )}
    </div>
  );
}
