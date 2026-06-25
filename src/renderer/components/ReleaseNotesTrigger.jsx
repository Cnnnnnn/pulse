/**
 * src/renderer/components/ReleaseNotesTrigger.jsx
 */
import {
  releaseNotesEntryPath,
  releaseNotesPayload,
  openReleaseNotes,
} from '../release-notes-store.js';
import { IconBook } from './icons.jsx';
import { Badge } from './Badge.jsx';

export function ReleaseNotesTrigger() {
  const payload = releaseNotesPayload.value;
  const showBadge = releaseNotesEntryPath.value === 'auto'
    && payload !== null
    && payload.version != null;

  const handleClick = () => {
    if (!payload) return;
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
      <IconBook size={16} />
      {showBadge && <Badge type="dot" ariaLabel="有未读更新" />}
    </button>
  );
}
