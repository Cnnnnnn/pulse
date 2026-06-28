/**
 * src/renderer/metals/MetalGrid.jsx
 *
 * 2-column grid of MetalCard components, filtered by watchedIds.
 * v2.50: improved empty state with ghost cards for unwatched metals.
 */

import { MetalCard } from './MetalCard.jsx';
import { METALS } from '../../metals/metal-config.js';
import { config } from './metalStore.js';
import { IconMedal } from '../components/icons.jsx';

export function MetalGrid({ onEdit }) {
  const cfg = config.value;
  const watchedIds = cfg.watchedIds || [];
  const deletedIds = cfg.deletedIds || [];
  const watchedMetals = METALS.filter((m) => watchedIds.includes(m.id));
  const unwatchedMetals = METALS.filter(
    (m) => !watchedIds.includes(m.id) && !deletedIds.includes(m.id),
  );

  if (watchedMetals.length === 0) {
    return (
      <div class="metal-empty-state">
        <div class="metal-empty-state-header">
          <div class="metal-empty-state-icon"><IconMedal size={28} /></div>
          <h3>还没关注任何品种</h3>
          <p>实时盯黄金白银价格，点下面任一卡片即可关注</p>
        </div>
        <div class="metal-empty-ghost-grid">
          {unwatchedMetals.map((m) => (
            <button
              key={m.id}
              type="button"
              class="metal-empty-ghost-card"
              onClick={() => onEdit(null)}
              aria-label={`添加关注 ${m.name}`}
            >
              <div class="metal-empty-ghost-name">{m.shortName}</div>
              <div class="metal-empty-ghost-meta">
                {m.currency === 'CNY' ? '国内' : '国际'}
                {m.proxyLabel && ` · ${m.proxyLabel}`}
              </div>
              <div class="metal-empty-ghost-action">+ 关注</div>
            </button>
          ))}
        </div>
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