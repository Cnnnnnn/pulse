/**
 * src/renderer/components/AutoDetectModal.jsx
 *
 * v2.7.2 (My Apps Library, B-2a): 自动探查 modal.
 *
 * 取代 v2.7.0 wizard 3 步手选. 用户点 LibrarySection [监控] 按钮 →
 * 1) 调 api.libraryAutoDetect(item) (4 层优先级 1️⃣→3️⃣ 并行, 8s timeout)
 * 2) 弹这个 modal, 4 状态:
 *    - 'probing'  探查中
 *    - 'one'      命中 1 个 → "用 {type} 监控 {appName}?" [取消] [手动选] [监控它]
 *    - 'many'     命中 N 个 → 同上, 用户可跳手动选
 *    - 'none'     都没命中 → "自动探查没有匹配" [取消] [手动选]
 *
 * 探查成功后, best detector 自动套上. 用户点 [监控它] → api.libraryAdd.
 * 用户点 [手动选] → 退到 DetectorWizardModal 3 步手选 fallback.
 */

import { useState, useEffect } from 'preact/hooks';
import { unmonitoredApps } from '../store.js';
import { api } from '../api.js';

const LABELS = {
  'brew_formulae':      'Homebrew Cask',
  'brew_local_cask':     'Brew local cask',
  'electron_yml':        'Electron latest-mac.yml',
  'electron_zip_probe':  'Electron zip probe',
  'app_store_lookup':    'App Store (iTunes)',
  'api_json':            'JSON API',
  'redirect_filename':   'Redirect 文件名',
  'cursor_redirect':     'Cursor 专用 redirect',
  'qclaw_api':           'QClaw API',
  'app_update_yml':      'app-update.yml',
  'sparkle_appcast':     'Sparkle appcast',
};

const SOURCE_LABEL = {
  'known-apps':   '📚 静态表反查',
  'heuristic':    '🔍 启发式',
  'brew':         '🍺 Brew Cask',
};

export function AutoDetectModal({ item, onClose, onOpenWizard }) {
  const [phase, setPhase] = useState('probing');  // 'probing' | 'one' | 'many' | 'none'
  const [results, setResults] = useState([]);
  const [best, setBest] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!item) return;
    if (typeof api.libraryAutoDetect !== 'function') {
      setError('libraryAutoDetect API 不可用');
      setPhase('none');
      return;
    }
    api.libraryAutoDetect(item).then((r) => {
      if (!r || !r.ok) {
        setError((r && r.reason) || '探测失败');
        setPhase('none');
        return;
      }
      setResults(r.results || []);
      setBest(r.best);
      const okCount = (r.results || []).filter((x) => x && x.ok).length;
      if (okCount === 1) setPhase('one');
      else if (okCount > 1) setPhase('many');
      else setPhase('none');
    });
  }, [item && item.bundlePath]);

  if (!item) return null;

  function onConfirm() {
    if (!best) return;
    setSubmitting(true);
    setError(null);
    const detectors = [{ type: best.type, ...(best.fields || {}) }];
    api.libraryAdd({
      appName: item.appName,
      bundleName: item.bundleName,
      detectors,
    }).then((r) => {
      setSubmitting(false);
      if (r && r.ok) {
        // 成功: 从 unmonitored 移除, 关 modal
        unmonitoredApps.value = unmonitoredApps.value.filter(
          (a) => a.bundlePath !== item.bundlePath,
        );
        onClose();
      } else {
        setError((r && r.reason) || '保存失败');
      }
    }).catch((err) => {
      setSubmitting(false);
      setError(err && err.message ? err.message : '网络错误');
    });
  }

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal-card modal-auto-detect" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>监控新 app</h2>
          <button class="btn-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div class="modal-body">
          <div class="autodetect-item">
            <div class="autodetect-item-name">{item.appName || item.bundleName}</div>
            <div class="autodetect-item-meta">
              {item.bundleName}
              {item.version && <span> · v{item.version}</span>}
            </div>
          </div>

          {phase === 'probing' && (
            <div class="autodetect-probing">
              <div class="autodetect-spinner" />
              <div class="autodetect-probing-text">自动探查中…</div>
              <div class="autodetect-probing-hint">查静态表 + 试 brew, 一般 2-5 秒</div>
            </div>
          )}

          {(phase === 'one' || phase === 'many' || phase === 'none') && (
            <div class="autodetect-results">
              <div class="autodetect-results-label">
                {phase === 'none' ? '自动探查 — 没有匹配' : `自动探查 — ${results.filter((r) => r.ok).length} 个命中`}
              </div>
              <div class="autodetect-results-list">
                {results.map((r, i) => (
                  <div
                    key={i}
                    class={`autodetect-result${r.ok ? ' ok' : ' fail'}${best && r.priority === best.priority ? ' best' : ''}`}
                  >
                    <div class="autodetect-result-status">
                      {r.ok ? '✓' : '✗'}
                    </div>
                    <div class="autodetect-result-info">
                      <div class="autodetect-result-source">
                        {SOURCE_LABEL[r.source] || r.source || `优先级 ${r.priority}`}
                      </div>
                      {r.ok && (
                        <div class="autodetect-result-detail">
                          <strong>{LABELS[r.type] || r.type}</strong>
                          {r.version && <span class="autodetect-result-version"> · v{r.version}</span>}
                          {r.fields && r.fields.cask && (
                            <span class="autodetect-result-cask"> · cask: {r.fields.cask}</span>
                          )}
                        </div>
                      )}
                      {!r.ok && (
                        <div class="autodetect-result-detail">
                          {r.reason || '失败'}
                          {r.probeMs > 0 && <span class="autodetect-result-probe"> · {r.probeMs}ms</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {best && best.version && (
                <div class="autodetect-summary">
                  brew 探测到最新版本 <strong>v{best.version}</strong> · {best.probeMs}ms
                </div>
              )}
            </div>
          )}

          {error && <div class="autodetect-error">{error}</div>}
        </div>

        <div class="modal-footer">
          {phase === 'probing' ? (
            <>
              <span class="autodetect-footer-hint">探查中…</span>
              <div class="modal-footer-buttons">
                <button class="btn btn-ghost" onClick={onClose}>取消</button>
              </div>
            </>
          ) : (
            <div class="modal-footer-buttons">
              <button class="btn btn-ghost" onClick={onClose} disabled={submitting}>取消</button>
              <button
                class="btn btn-ghost"
                onClick={() => { onClose(); onOpenWizard && onOpenWizard(item); }}
                disabled={submitting}
                title="手动选 detector (auto-detect 没匹配时)"
              >
                手动选 →
              </button>
              {best && (
                <button
                  class="btn btn-primary"
                  onClick={onConfirm}
                  disabled={submitting}
                >
                  {submitting ? '保存中…' : '监控它 →'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
