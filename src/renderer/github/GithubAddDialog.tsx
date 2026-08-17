import { useEffect, useRef } from "preact/hooks";
import { GithubAddForm } from "./GithubAddForm.tsx";

export function GithubAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    queueMicrotask(() => dialogRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus());
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div class="github-add-dialog-overlay" onClick={(event) => event.currentTarget === event.target && onClose()}>
      <div
        class="github-add-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-add-dialog-title"
        ref={dialogRef}
      >
        <header class="github-add-dialog__header">
          <div>
            <p class="github-library__eyebrow">收录到我的开源库</p>
            <h3 id="github-add-dialog-title">添加项目</h3>
          </div>
          <button type="button" class="github-icon-btn" aria-label="关闭" onClick={onClose}>×</button>
        </header>
        <div class="github-add-dialog__body">
          <GithubAddForm onComplete={onClose} />
        </div>
      </div>
    </div>
  );
}

export default GithubAddDialog;
