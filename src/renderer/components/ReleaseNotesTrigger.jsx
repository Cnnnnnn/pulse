/**
 * src/renderer/components/ReleaseNotesTrigger.jsx
 *
 * ON: Header 📖 按钮. 与 ⏰🕒⭐⚙️ 并列.
 *
 * 红点逻辑: entryPath === 'auto' && payload !== null
 *   即"auto 路径记录当前版本未看". 入口是 manual (用户已点过头但没 mark-seen)
 *   或 payload 缺失 → 不显示.
 *
 * 点击 → 调 openReleaseNotes('manual', payload), 不调 mark-seen (manual 路径).
 * 红点状态不变, 因为 manual 路径不写"已看".
 *
 * 走 entryPath 而不是单独开一个 unread signal, 是因为这俩状态本质耦合:
 *   "未读" 就是 "auto 路径记录过" — 拆两个反而要担心不一致.
 */
import {
  releaseNotesEntryPath,
  releaseNotesPayload,
  openReleaseNotes,
} from '../release-notes-store.js';

export function ReleaseNotesTrigger() {
  const payload = releaseNotesPayload.value;
  const showBadge = releaseNotesEntryPath.value === 'auto'
    && payload !== null
    && payload.version != null;

  const handleClick = () => {
    if (!payload) return; // payload 缺失时不开 (正常不会发生, bootstrap 后会有)
    openReleaseNotes('manual', payload);
  };

  return (
    <button
      id="btn-release-notes"
      type="button"
      class="btn btn-ghost btn-icon"
      onClick={handleClick}
      title="本版本更新"
      aria-label="本版本更新"
    >
      <span aria-hidden="true">📖</span>
      {showBadge && <span class="release-notes-trigger-badge" aria-label="有未读更新" />}
    </button>
  );
}
