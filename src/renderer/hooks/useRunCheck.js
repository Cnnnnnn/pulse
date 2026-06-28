/**
 * src/renderer/hooks/useRunCheck.js
 *
 * 共享的"检查更新"逻辑: loading 态 + api.versionsRunCheck() + 2s 视觉 hold.
 * 供 LibraryPage 空态 CTA 与 PageHeader 主按钮共用.
 *
 * 2s hold 避免按钮闪一下又可点 (check 通常 < 2s).
 *
 * main 侧 safeHandle 返 { started: true } 或 { started: false, error }. 失败时弹
 * toast 红色提示, 抛异常 (e.g. IPC 没注册 / preload 漏暴露) 兜底也弹, 避免按钮
 * 「点了没反应」用户看不出原因.
 */
import { useState, useRef } from "preact/hooks";
import { api } from "../api.js";
import { showToast } from "../store/toast-store.js";

export function useRunCheck() {
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef(null);

  const run = async () => {
    setIsLoading(true);
    try {
      const r = await api.versionsRunCheck();
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
    } catch (err) {
      // IPC 没注册 / preload 漏暴露 / 主进程抛 — 2026-06-28 regression.
      showToast(
        `检查失败: ${(err && err.message) || "IPC 调用异常"}`,
        "error",
        3500,
      );
    } finally {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsLoading(false), 2000);
    }
  };

  return { isLoading, run };
}
