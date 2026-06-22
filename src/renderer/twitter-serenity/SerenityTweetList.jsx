/**
 * src/renderer/twitter-serenity/SerenityTweetList.jsx
 *
 * 推文列表 (spec §6.2). 本版本简单 map (无虚拟滚动),
 * 前 5 条自动触发翻译 (spec §6.1 批量翻译: 滚动到底再译下 5 条, v1 先做首批).
 */

import { useState, useEffect } from "preact/hooks";
import { SerenityTweetDetail } from "./SerenityTweetDetail.jsx";

const TRANSLATE_BATCH = 5;

export function SerenityTweetList({
  tweets,
  translations,
  onTranslate,
  visibleCount = 20,
}) {
  const [autoTranslatedIds, setAutoTranslatedIds] = useState(new Set());

  useEffect(() => {
    if (typeof onTranslate !== "function") return;
    const toTranslate = tweets
      .slice(0, TRANSLATE_BATCH)
      .filter((t) => !translations[t.id] && !autoTranslatedIds.has(t.id))
      .map((t) => t.id);
    if (toTranslate.length === 0) return;
    setAutoTranslatedIds((prev) => {
      const next = new Set(prev);
      toTranslate.forEach((id) => next.add(id));
      return next;
    });
    toTranslate.forEach((id) => {
      const tweet = tweets.find((t) => t.id === id);
      if (tweet) onTranslate(tweet);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweets, translations]);

  return (
    <div class="serenity-tweet-list">
      {tweets.slice(0, visibleCount).map((t) => (
        <SerenityTweetDetail
          key={t.id}
          tweet={t}
          translatedZh={translations[t.id]}
          onTranslated={onTranslate}
        />
      ))}
    </div>
  );
}
