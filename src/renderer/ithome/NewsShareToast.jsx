/**
 * src/renderer/ithome/NewsShareToast.jsx
 *
 * 轻量 toast — 显示 3s 自动消失。Mount 在 NewsArticleRow 内。
 */
import { useEffect, useState } from "preact/hooks";

export function NewsShareToast({ message, kind = "success", onDone }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      if (onDone) onDone();
    }, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!visible) return null;
  return (
    <div
      class={`news-share-toast news-share-toast--${kind}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

export default NewsShareToast;