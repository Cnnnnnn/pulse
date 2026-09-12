/**
 * src/renderer/components/AIDrawerShell.jsx
 *
 * AI 抽屉共享外壳: 右侧 drawer + 半透明 mask + focus trap + esc + click-outside.
 * 替换 AiAdviseDrawer / StockDetailDrawer 的内联 BareModalShell 调用.
 *
 * ponytail: mask 半透明黑 (0.35 alpha) 覆盖整个视口, 让用户视觉聚焦抽屉,
 *   不挤压底层布局 (drawer 是 fixed 浮层). 点击 mask 关闭.
 *   用原生 focus trap 实现 (简单循环), 不引依赖.
 */
import { useEffect, useRef } from "preact/hooks";
import { createPortal } from "preact/compat";

type AIDrawerShellProps = {
  open: boolean;
  onClose: () => void;
  title?: any;
  subtitle?: any;
  children?: any;
};

export function AIDrawerShell({ open, onClose, title, subtitle, children }: AIDrawerShellProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // 简易 focus trap
      if (e.key === "Tab" && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }

    function onDocDown(e: MouseEvent) {
      if (cardRef.current && cardRef.current.contains(e.target as Node)) return;
      onClose();
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocDown);
    };
  }, [open]);

  if (!open) return null;

  // ponytail: portal 到 body — 祖先的 transform/filter/backdrop-filter 会创建
  //   stacking context, 把 fixed drawer 的 z-index 困在局部 (跟 DrawerShell
  //   usePortal 同一个坑, 见 DrawerShell 头注释). 不 portal 时 #titlebar /
  //   .topbar (z=100) 会盖在 drawer (z=8000) 上面形成"顶部遮挡条".
  return createPortal(
    <div class="ai-drawer-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div class="ai-drawer-shell" ref={cardRef}>
        <div class="ai-drawer-header">
          <div class="ai-drawer-title-block">
            <span class="ai-drawer-title">{title}</span>
            {subtitle && <span class="ai-drawer-subtitle">{subtitle}</span>}
          </div>
          <button type="button" class="ai-drawer-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        <div class="ai-drawer-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default AIDrawerShell;
