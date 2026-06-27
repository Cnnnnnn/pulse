/**
 * src/renderer/hooks/useRunCheck.js
 *
 * 共享的"检查更新"逻辑: loading 态 + api.versionsRunCheck() + 2s 视觉 hold.
 * 供 LibraryPage 空态 CTA 与 PageHeader 主按钮共用.
 *
 * 2s hold 避免按钮闪一下又可点 (check 通常 < 2s).
 * main 侧 safeHandle 已返 { started, error }, 异常在内部吞掉.
 */
import { useState, useRef } from "preact/hooks";
import { api } from "../api.js";

export function useRunCheck() {
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef(null);

  const run = async () => {
    setIsLoading(true);
    try {
      await api.versionsRunCheck();
    } catch {
      /* swallowed — main 侧 safeHandle 已返 { started: false, error } */
    } finally {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsLoading(false), 2000);
    }
  };

  return { isLoading, run };
}
