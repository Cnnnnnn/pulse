/**
 * src/renderer/components/LazyNavPanel.jsx
 *
 * Q4 v4: 非默认 nav 面板 dynamic import, 配合 esbuild splitting 降低首屏解析量.
 */
import { useState, useEffect } from 'preact/hooks';
import { VersionsLayout } from './VersionsLayout.jsx';

const LOADERS = {
  ithome: () =>
    import('../ithome/NewsLayout.jsx').then((m) => m.NewsLayout),
  'wechat-hot': () =>
    import('../wechat-hot/components/WechatHotLayout.jsx').then(
      (m) => m.WechatHotLayout,
    ),
  worldcup: () =>
    import('../worldcup/WorldcupLayout.jsx').then((m) => m.WorldcupLayout),
  funds: () => import('../funds/FundLayout.jsx').then((m) => m.FundLayout),
  metals: () => import('../metals/MetalLayout.jsx').then((m) => m.MetalLayout),
  stocks: () =>
    import('../stocks/StockLayout.jsx').then((m) => m.StockLayout),
  'stock-watchlist': () =>
    import('../stocks/WatchlistPanel.jsx').then((m) => m.WatchlistPanel),
  'stock-detail': () =>
    import('../stocks/StockDetailLayout.jsx').then((m) => m.StockDetailLayout),
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
