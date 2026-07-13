/**
 * src/renderer/components/NewCarReleaseLayout.jsx
 *
 * 懒加载容器: 挂载即 subscribe + loadCached (仿 AIUsageLayout).
 * 由 LazyNavPanel 动态 import, 切到"新车发布" nav 时才加载本 chunk.
 */

import { useEffect } from 'preact/hooks';
import {
  subscribeNewCarUpdates,
  loadCached,
  clearNavBadge,
  initNewCarStore,
} from '../store/newcar-store.js';
import { NewCarReleasePage } from './NewCarReleasePage.jsx';

export function NewCarReleaseLayout() {
  useEffect(() => {
    initNewCarStore();
    subscribeNewCarUpdates();
    loadCached();
    clearNavBadge();
  }, []);

  return <NewCarReleasePage />;
}

export default NewCarReleaseLayout;
