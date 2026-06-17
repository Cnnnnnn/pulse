/**
 * src/renderer/metals/MetalGrid.jsx
 *
 * 2-column grid of MetalCard components, filtered by watchedIds.
 * Shows empty state when no metals are watched.
 */

import { MetalCard } from './MetalCard.jsx';
import { METALS } from '../../metals/metal-config.js';
import { config } from './metalStore.js';

export function MetalGrid({ onEdit }) {
  const watchedIds = config.value.watchedIds;
  const watchedMetals = METALS.filter((m) => watchedIds.includes(m.id));

  if (watchedMetals.length === 0) {
    return (
      <div class="metal-empty-state">
        <div class="empty-icon">🥇</div>
        <h3>还没关注任何品种</h3>
        <p>实时盯黄金白银价格</p>
        <button class="btn btn-primary" onClick={() => onEdit(null)}>
          + 添加第一个品种
        </button>
      </div>
    );
  }

  return (
    <div class="metal-grid">
      {watchedMetals.map((metal) => (
        <MetalCard key={metal.id} metal={metal} onEdit={onEdit} />
      ))}
    </div>
  );
}
