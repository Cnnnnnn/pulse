/**
 * src/renderer/components/NewCarReleaseSubscribeModal.jsx
 *
 * 订阅 / 提醒设置 (P1): 选择想订阅的品牌 / 能源, 写入 localStorage ("newcar:subscriptions").
 * 订阅数据由主进程 newcar-refresh-scheduler 读取 (经 IPC), 命中即将发布时推送 nav 角标.
 * 仅引用现有设计令牌, 无裸 hex.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import { newCarReleases } from '../store/newcar-store.js';
import { ENERGY_TYPES } from '../../newcar/types.js';

const LS_KEY = 'newcar:subscriptions';

/**
 * @typedef {Object} SubscriptionPrefs
 * @property {string[]} brands
 * @property {string[]} energyTypes
 */

function loadSubs() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { brands: [], energyTypes: [] };
    const p = JSON.parse(raw);
    return {
      brands: Array.isArray(p.brands) ? p.brands : [],
      energyTypes: Array.isArray(p.energyTypes) ? p.energyTypes : [],
    };
  } catch {
    return { brands: [], energyTypes: [] };
  }
}

function saveSubs(prefs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} props
 * @param {() => void} props.onClose
 */
export function NewCarReleaseSubscribeModal({ onClose }) {
  const releases = newCarReleases.value;
  const brands = useMemo(() => {
    const s = new Set(releases.map((r) => r.brand));
    return [...s].sort((a, b) => a.localeCompare(b, 'zh'));
  }, [releases]);

  const initial = useMemo(() => loadSubs(), []);
  const [selBrands, setSelBrands] = useState(() => new Set(initial.brands));
  const [selEnergy, setSelEnergy] = useState(() => new Set(initial.energyTypes));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleBrand = (b) => {
    setSelBrands((prev) => {
      const n = new Set(prev);
      if (n.has(b)) n.delete(b);
      else n.add(b);
      return n;
    });
  };
  const toggleEnergy = (e) => {
    setSelEnergy((prev) => {
      const n = new Set(prev);
      if (n.has(e)) n.delete(e);
      else n.add(e);
      return n;
    });
  };

  const persist = () => {
    saveSubs({ brands: [...selBrands], energyTypes: [...selEnergy] });
    onClose();
  };

  const total = selBrands.size + selEnergy.size;

  return (
    <div
      class="newcar-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        class="newcar-modal"
        role="dialog"
        aria-modal="true"
        aria-label="订阅新车提醒"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="newcar-modal-head">
          <h3 class="newcar-modal-title">订阅新车提醒</h3>
          <button type="button" class="newcar-modal-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <div class="newcar-modal-body">
          <div class="newcar-modal-section">
            <div class="newcar-modal-label">按品牌</div>
            <div class="newcar-modal-brands">
              {brands.map((b) => {
                const active = selBrands.has(b);
                return (
                  <button
                    type="button"
                    key={b}
                    class={`newcar-chip${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleBrand(b)}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>

          <div class="newcar-modal-section">
            <div class="newcar-modal-label">按能源</div>
            <div class="newcar-chips">
              {ENERGY_TYPES.map((e) => {
                const active = selEnergy.has(e);
                return (
                  <button
                    type="button"
                    key={e}
                    class={`newcar-chip${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleEnergy(e)}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </div>

          <p class="newcar-modal-hint">
            已选 {total} 项。订阅后，主进程会定时比对未来 30 天即将发布的车型并推送导航角标。
          </p>
        </div>

        <footer class="newcar-modal-foot">
          <button type="button" class="newcar-modal-cancel" onClick={onClose}>
            取消
          </button>
          <button type="button" class="newcar-modal-save" onClick={persist}>
            保存订阅
          </button>
        </footer>
      </div>
    </div>
  );
}

export default NewCarReleaseSubscribeModal;
