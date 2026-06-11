/**
 * src/renderer/components/StatsModal.jsx
 *
 * v2.8.1 (F1 Stats 自我统计): 4 段指标 modal.
 *
 * 4 块:
 *   - S1 总计数 (5 标: total / updatable / weekUpgrades / pinned / ignored)
 *   - S2 源 detector 分布 (table, count desc)
 *   - S3 升级历史 (7d / 30d / 90d 三档, 复用 weekly-stats.js)
 *   - S4 Mute 活跃 (active / permanent / expired, 列表)
 *
 * 数据 0 联网, 走 src/renderer/stats.js 纯函数.
 * 跟现有 modal 同语言 (modal-backdrop / modal-card / btn-close / <h2>).
 * ESC 关 (跟 v2.8.0 wizard F2 一致).
 */

import { useEffect, useMemo } from 'preact/hooks';
import { cachedState, libraryConfig } from '../store.js';
import {
  computeCounters,
  computeSourceBreakdown,
  computeUpgradeHistory,
  computeMuteStats,
} from '../stats.js';

export function StatsModal({ onClose }) {
  const state = cachedState.value;
  const libCfg = libraryConfig.value;

  // 4 段全用 useMemo 缓存, state/libCfg 引用变才重算
  const counters = useMemo(() => computeCounters(state, libCfg), [state, libCfg]);
  const sources = useMemo(() => computeSourceBreakdown(state), [state]);
  const history = useMemo(() => computeUpgradeHistory(state), [state]);
  const mutes = useMemo(() => computeMuteStats(state), [state]);

  // ESC 关 (跟 v2.8.0 wizard F2 一致)
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal-card modal-stats" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>📊 Stats</h2>
          <button class="btn-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div class="stats-body">
          {/* S1: 总计数 */}
          <section class="stats-section">
            <h3 class="stats-section-title">总览</h3>
            <div class="stats-counter-grid">
              <Counter label="已监控" value={counters.total} />
              <Counter label="可升级" value={counters.updatable} highlight={counters.updatable > 0} />
              <Counter label="本周升级" value={counters.weekUpgrades} />
              <Counter label="⭐ Pinned" value={counters.pinned} />
              <Counter label="🚫 Ignored" value={counters.ignored} />
            </div>
          </section>

          {/* S2: 源 detector 分布 */}
          <section class="stats-section">
            <h3 class="stats-section-title">Detector 源分布</h3>
            {sources.length === 0 ? (
              <p class="stats-empty">无数据</p>
            ) : (
              <table class="stats-source-table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th class="stats-num">数量</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.source}>
                      <td><code class="stats-source-code">{s.source}</code></td>
                      <td class="stats-num">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* S3: 升级历史 */}
          <section class="stats-section">
            <h3 class="stats-section-title">升级历史</h3>
            <div class="stats-history-grid">
              {history.map((h) => (
                <div key={h.windowDays} class="stats-history-card">
                  <div class="stats-history-window">过去 {h.windowDays} 天</div>
                  <div class="stats-history-upgrades">
                    <strong>{h.upgrades}</strong> 次
                  </div>
                  {h.apps.length > 0 && (
                    <div class="stats-history-apps">
                      {h.apps.slice(0, 3).join('、')}
                      {h.apps.length > 3 && ` 等 ${h.apps.length} 个`}
                    </div>
                  )}
                  {h.totalChangelogChars > 0 && (
                    <div class="stats-history-chars">
                      {h.totalChangelogChars} 字 changelog
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* S4: Mute 活跃 */}
          <section class="stats-section">
            <h3 class="stats-section-title">Mute 活跃</h3>
            <div class="stats-counter-grid">
              <Counter label="活跃中" value={mutes.active} />
              <Counter label="永久" value={mutes.permanent} />
              <Counter label="过期未清" value={mutes.expired} />
            </div>
            {mutes.list.length > 0 && (
              <table class="stats-mute-table">
                <thead>
                  <tr>
                    <th>App</th>
                    <th>状态</th>
                    <th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  {mutes.list.slice(0, 10).map((m) => (
                    <tr key={m.name}>
                      <td>{m.name}</td>
                      <td>
                        <span class={`stats-mute-tag stats-mute-${m.state}`}>
                          {m.state === 'permanent' ? '永久' : m.state === 'expired' ? '过期' : '活跃'}
                        </span>
                      </td>
                      <td class="stats-mute-reason">{m.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div class="modal-footer">
          <span class="wizard-footer-hint">
            数据来自 state.json · 实时
          </span>
          <div class="modal-footer-buttons">
            <button class="btn btn-ghost" onClick={onClose}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Counter({ label, value, highlight }) {
  return (
    <div class={`stats-counter${highlight ? ' stats-counter-highlight' : ''}`}>
      <div class="stats-counter-value">{value}</div>
      <div class="stats-counter-label">{label}</div>
    </div>
  );
}
