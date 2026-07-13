/**
 * src/renderer/components/LazyNavPanel.jsx
 *
 * Q4 v4: 非默认 nav 面板 dynamic import, 配合 esbuild splitting 降低首屏解析量.
 */
import { useState, useEffect } from 'preact/hooks';
import { VersionsLayout } from './VersionsLayout.jsx';

const LOADERS = {
  // P-N+: 'news' 单 nav 合并 IT 新闻 + 微博热搜, 容器做 sub-tab 切换.
  // 子 layout (ithome / wechat-hot) 仍走独立 chunk, 这里不再单独暴露.
  // 2026-07-13: 投资 nav 合并 funds/metals/stocks → 'invest', 三 layout 内嵌为 FundContent/MetalContent/StockContent.
  news: () => import('../news/NewsLayout.jsx').then((m) => m.NewsLayout),
  worldcup: () =>
    import('../worldcup/WorldcupLayout.jsx').then((m) => m.WorldcupLayout),
  invest: () =>
    import('../invest/InvestLayout.jsx').then((m) => m.InvestLayout),
  'ai-usage': () =>
    import('./AIUsageLayout.jsx').then((m) => m.AIUsageLayout),
};

export function LazyNavPanel({ nav, onCheck }) {
  const [Panel, setPanel] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (nav === 'versions') {
      setPanel(() => VersionsLayout);
      setLoading(false);
      return undefined;
    }
    const loader = LOADERS[nav];
    if (!loader) {
      setPanel(() => VersionsLayout);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setPanel(null);
    loader()
      .then((Comp) => {
        if (!cancelled) {
          setPanel(() => Comp);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPanel(() => VersionsLayout);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nav]);

  if (loading || !Panel) {
    return <div class="nav-panel-loading">加载中…</div>;
  }
  return <Panel onCheck={onCheck} />;
}
