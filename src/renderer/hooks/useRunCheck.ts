/**
 * src/renderer/hooks/useRunCheck.ts
 *
 * 共享的"检查更新"逻辑: loading 态 + renderer runCheck() + 2s 视觉 hold.
 * 供 LibraryPage 空态 CTA 与 PageHeader 主按钮共用.
 *
 * 2s hold 避免按钮闪一下又可点 (check 通常 < 2s).
 *
 * renderer runCheck 统一管理 session、结果回填和 IPC 错误契约. 失败时弹 toast
 * 红色提示, 避免按钮「点了没反应」用户看不出原因.
 */
import { useState, useRef } from "preact/hooks";
import { runCheck } from "../run-check.ts";
import { checkJob, cancelCheck as cancelLocalCheck } from "../store.ts";
import { api } from "../api.ts";
import { showToast } from "../store/toast-store.ts";

export function useRunCheck() {
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRequestedRef = useRef(false);

  const run = async () => {
    cancelRequestedRef.current = false;
    setIsLoading(true);
    try {
      const r = await runCheck();
      if (r && r.started === false) {
        if (r.reason === "already_running") {
          // main 已在跑一次手动检查 (check-runner.runCheckQueued 拒绝并发手动).
          // 不弹 error, 给个中性提示 — 用户多半是连点了两次.
          showToast("检查进行中, 请稍候…", "info", 2500);
        } else {
          showToast(
            `检查失败: ${r.error || r.reason || "未知错误"}`,
            "error",
            3500,
          );
        }
      }
    } catch (err: any) {
      // IPC 没注册 / preload 漏暴露 / 主进程抛 — 2026-06-28 regression.
      showToast(
        `检查失败: ${(err instanceof Error ? err.message : null) || "IPC 调用异常"}`,
        "error",
        3500,
      );
    } finally {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (cancelRequestedRef.current) {
        cancelRequestedRef.current = false;
        setIsLoading(false);
      } else {
        timerRef.current = setTimeout(() => setIsLoading(false), 2000);
      }
    }
  };

  const cancel = async () => {
    cancelRequestedRef.current = true;
    try {
      const jobId = checkJob.value.mainJobId || undefined;
      const response = await api.cancelCheck(jobId);
      if (response && response.ok === false && response.reason !== "not_running") {
        showToast(`取消检查失败: ${response.reason || "未知错误"}`, "error", 3000);
      }
    } catch (err: any) {
      showToast(
        `取消检查失败: ${(err instanceof Error ? err.message : null) || "IPC 调用异常"}`,
        "error",
        3000,
      );
    } finally {
      cancelLocalCheck("user_cancelled");
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsLoading(false);
    }
  };

  return { isLoading, run, cancel };
}
