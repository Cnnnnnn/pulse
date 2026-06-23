/**
 * src/renderer/components/ReleaseNotesWizard.jsx
 *
 * ON: 多步 modal 向导.
 *   - 渲染 md (走现有 renderChangelog, marked + DOMPurify)
 *   - 渲染 slides (每页 title + subtitle + body, body 同样走 renderChangelog)
 *   - 进度点 + 翻页
 *   - 4 种关闭路径 (skip / 完成 / ESC / 遮罩) 都视为 "完成本版"
 *   - auto 路径关闭时调 mark-seen; manual 路径关闭时**不**调
 *   - 永远不阻断关闭: mark-seen 失败也正常关 + toast
 *
 * v1 不做 focus trap (跟 spec §3.8 out-of-scope 一致). ESC + ← → + Enter
 * 覆盖基本键盘可达性.
 */

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { renderChangelog } from '../changelog.js';
import { showToast } from '../store.js';
import { api } from '../api.js';
import {
  releaseNotesOpen,
  releaseNotesEntryPath,
  releaseNotesPayload,
  closeReleaseNotes,
  clearReleaseNotes,
} from '../release-notes-store.js';

const TOTAL_PAGE_OFFSET = 1; // page 0 = changelog, page 1..N = slides[0..N-1]

export function ReleaseNotesWizard() {
  const open = releaseNotesOpen.value;
  const payload = releaseNotesPayload.value;

  if (!open || !payload) return null;

  return <WizardInner payload={payload} />;
}

function WizardInner({ payload }) {
  const { version, changelogMd, slides } = payload;
  const slidesArr = slides && Array.isArray(slides.slides) ? slides.slides : [];
  const totalPages = 1 + slidesArr.length;
  const [page, setPage] = useState(0);
  const closeHandledRef = useRef(false);

  // entryPath is read from the store at close time (not captured), so
  // manual vs auto decision is always fresh.
  const handleClose = useCallback(async () => {
    if (closeHandledRef.current) return;
    closeHandledRef.current = true;
    const path = releaseNotesEntryPath.value;
    closeReleaseNotes();
    if (path === 'auto') {
      try {
        const r = await api.releaseNotes.markSeen(version);
        if (!r || !r.ok) {
          showToast('保存失败, 下次启动还会再弹', 'warn');
        }
      } catch (err) {
        showToast('保存失败, 下次启动还会再弹', 'warn');
      }
    }
    clearReleaseNotes(); // also drops entryPath → 'auto' + payload
  }, [version]);

  // ESC / ← / → / Enter
  useEffect(() => {
    const onKey = (e) => {
      if (!releaseNotesOpen.value) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'ArrowRight') {
        setPage((p) => Math.min(p + 1, totalPages - 1));
      } else if (e.key === 'ArrowLeft') {
        setPage((p) => Math.max(p - 1, 0));
      } else if (e.key === 'Enter' && page === totalPages - 1) {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose, totalPages, page]);

  // 每次重新打开 (version 变) → 重置 page 0 + 关闭 lock
  useEffect(() => {
    setPage(0);
    closeHandledRef.current = false;
  }, [version]);

  const isFirstPage = page === 0;
  const isLastPage = page === totalPages - 1;
  const currentSlide = !isFirstPage ? slidesArr[page - TOTAL_PAGE_OFFSET] : null;

  // bodyHtml: compute per render (no useMemo, easier to reason about).
  // (ponytail: renderChangelog 内部 marked + DOMPurify 已经 cache-friendly;
  // 简单 inline 算比 useMemo 更直接.)
  let bodyHtml = '';
  try {
    const raw = isFirstPage ? (changelogMd || '') : (currentSlide?.body || '');
    if (raw) {
      bodyHtml = renderChangelog(raw, 'md', '');
    }
  } catch (err) {
    const safe = (changelogMd || currentSlide?.body || '').replace(/</g, '&lt;');
    bodyHtml = `<pre>${safe}</pre>`;
  }

  return (
    <div
      class="release-notes-wizard-overlay"
      onClick={handleClose}
      role="presentation"
    >
      <div
        class="release-notes-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rnw-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="release-notes-wizard-header">
          <h2 id="rnw-title" class="release-notes-wizard-title">
            {isFirstPage
              ? `v${version} 更新日志`
              : (currentSlide && currentSlide.title) || ''}
          </h2>
          {!isFirstPage && currentSlide && currentSlide.subtitle && (
            <p class="release-notes-wizard-subtitle">{currentSlide.subtitle}</p>
          )}
        </header>

        <div
          class="release-notes-wizard-progress"
          aria-label={`第 ${page + 1} / ${totalPages} 页`}
        >
          {Array.from({ length: totalPages }).map((_, i) => (
            <span
              key={i}
              class={`release-notes-wizard-dot${i === page ? ' active' : ''}`}
            />
          ))}
        </div>

        <div
          class="release-notes-wizard-body"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        <footer class="release-notes-wizard-footer">
          <button
            type="button"
            class="btn btn-ghost"
            onClick={handleClose}
          >
            跳过
          </button>
          <div class="release-notes-wizard-footer-right">
            {!isFirstPage && (
              <button
                type="button"
                class="btn"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← 上一步
              </button>
            )}
            {!isLastPage ? (
              <button
                type="button"
                class="btn btn-primary"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                下一步 →
              </button>
            ) : (
              <button
                type="button"
                class="btn btn-primary"
                onClick={handleClose}
              >
                完成
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
