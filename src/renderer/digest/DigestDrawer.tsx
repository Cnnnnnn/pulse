/**
 * src/renderer/digest/DigestDrawer.tsx
 *
 * Phase I1+I5 + v3.0 beta visual redesign.
 *
 * 视觉层级 (top → bottom):
 *   1. Hero — 大标题 + 日期 + section count chip + 离线 pill
 *   2. Body  — loading skeleton / section 列表 / 空态
 *   3. Footer — 导出 HTML + 关闭 (sticky)
 *
 * 设计原则 (ponytail):
 *   - 不依赖外部 CSS 框架 — 复用既有 design tokens (--bg-*, --accent-primary, --space-*)
 *   - 空态给 actionable hint (立即预览), 不只放一句"没有"
 *   - 离线模式做 pill 提示, 不阻断正文
 */
import { useEffect } from 'preact/hooks';
import { DIGEST_UI_TITLE } from '../../shared/digest-labels.ts';
import {
  digestDrawerOpen,
  digestSections,
  digestLines,
  digestDate,
  digestLoading,
  digestIsOfflineSnapshot,
} from './digest-store.ts';
import { api } from '../api.ts';
import { showToast } from '../store.ts';
import { DigestSection } from './DigestSection.tsx';
import { DrawerShell } from '../components/DrawerShell.tsx';
import { DrawerEmpty } from '../components/EmptyState.tsx';

export function DigestDrawer() {
  const open = digestDrawerOpen.value;
  const sections = digestSections.value;
  const loading = digestLoading.value;
  const date = digestDate.value;
  const isOffline = digestIsOfflineSnapshot.value;

  useEffect(() => {
    if (!open) return;
    digestLoading.value = true;
    const result = api.digestFetchSections();
    const p = (result && typeof result.then === 'function') ? result : Promise.resolve(null);
    p.then(async (resp) => {
      // v3.0 beta: 离线 / 无网络时, fetch sections 失败 → 退到盘上的 snapshot
      if (resp && resp.ok && (resp.sections?.length || 0) > 0) {
        digestSections.value = resp.sections || [];
        digestLines.value = resp.lines || [];
        digestDate.value = resp.date || null;
        digestIsOfflineSnapshot.value = false;
        return;
      }
      try {
        const snap = await api.briefingSnapshotFetch();
        if (snap && snap.ok && snap.snapshot && (snap.snapshot.sections?.length || 0) > 0) {
          digestSections.value = snap.snapshot.sections as any;
          digestLines.value = snap.snapshot.lines || [];
          digestDate.value = snap.snapshot.date || null;
          digestIsOfflineSnapshot.value = true;
          return;
        }
      } catch {
        /* fallthrough */
      }
      // 都没有: 保留空 (渲染空状态)
      if (resp && resp.ok) {
        digestSections.value = resp.sections || [];
        digestLines.value = resp.lines || [];
        digestDate.value = resp.date || null;
        digestIsOfflineSnapshot.value = false;
      } else {
        digestIsOfflineSnapshot.value = true;
      }
    }).finally(() => {
      digestLoading.value = false;
    });
  }, [open]);

  function close() {
    digestDrawerOpen.value = false;
  }

  async function exportHtml() {
    const resp = await api.briefingExport({ regenerate: false });
    if (resp && resp.ok && resp.path) {
      showToast('已导出早报卡片', 'success');
      await api.briefingShowInFolder({ path: resp.path });
    } else {
      showToast(
        resp && resp.reason === 'empty_snapshot'
          ? '今天还没有可导出的早报，请先预览'
          : '导出失败',
        'error',
      );
    }
  }

  const itemCount = sections.reduce((acc: number, s: any) => acc + (s.items?.length || 0), 0);

  return (
    <DrawerShell
      open={open}
      onClose={close}
      title={DIGEST_UI_TITLE}
      header={<></>}
      showOverlay={false}
      overlayClass="digest-overlay"
      drawerClass="digest-drawer"
      ariaLabel={DIGEST_UI_TITLE}
    >
      <div class="digest-drawer__inner">
        {/* ─── Hero ──────────────────────────────────────────────── */}
        <header class="digest-drawer__hero">
          <div class="digest-drawer__hero-title">
            <span class="digest-drawer__hero-eyebrow">{date || '今日'}</span>
            <h2 class="digest-drawer__hero-h">今日要点</h2>
          </div>
          <div class="digest-drawer__hero-meta">
            {!loading && sections.length > 0 ? (
              <>
                <span class="digest-drawer__chip">{sections.length} 个模块</span>
                <span class="digest-drawer__chip digest-drawer__chip--muted">
                  {itemCount} 条要点
                </span>
              </>
            ) : null}
            {isOffline && !loading ? (
              <span class="digest-drawer__pill" title="无网络，显示最近一次推送的快照">
                离线快照
              </span>
            ) : null}
          </div>
        </header>

        {/* ─── Body ───────────────────────────────────────────────── */}
        <div class="digest-drawer__body">
          {loading ? (
            <div class="digest-drawer__skeleton" aria-label="加载中">
              <div class="digest-drawer__skeleton-line" style={{ width: '38%' }} />
              <div class="digest-drawer__skeleton-block" />
              <div class="digest-drawer__skeleton-line" style={{ width: '28%' }} />
              <div class="digest-drawer__skeleton-block" />
              <div class="digest-drawer__skeleton-line" style={{ width: '32%' }} />
              <div class="digest-drawer__skeleton-block" />
            </div>
          ) : sections.length === 0 ? (
            <div class="digest-drawer__empty-rich">
              <div class="digest-drawer__empty-emoji" aria-hidden>📭</div>
              <div class="digest-drawer__empty-title">今天还没有要点</div>
              <p class="digest-drawer__empty-desc">
                早报默认在 {`08:30`} 推送。你可以现在生成一次预览，或者在
                「设置 → 通用 → 每日早报」调整模块订阅和推送时间。
              </p>
            </div>
          ) : (
            <div class="digest-drawer__sections">
              {sections.map((s, i) => (
                <DigestSection key={`${s.kind || i}-${i}`} section={s as any} />
              ))}
            </div>
          )}
        </div>

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <footer class="digest-drawer__footer">
          <button
            type="button"
            class="digest-drawer__btn digest-drawer__btn--ghost"
            onClick={close}
          >
            关闭
          </button>
          <button
            type="button"
            class="digest-drawer__btn digest-drawer__btn--primary"
            onClick={exportHtml}
            disabled={sections.length === 0}
            title={sections.length === 0 ? '需要先生成一次要点' : '导出当前早报为 HTML'}
          >
            <span aria-hidden>⤓</span> 导出 HTML
          </button>
        </footer>
      </div>
    </DrawerShell>
  );
}
