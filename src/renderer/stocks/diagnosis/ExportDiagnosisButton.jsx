/**
 * ExportDiagnosisButton — 诊断报告导出 PNG 按钮.
 *
 * ponytail: 2026-07-07 — 走主进程 webContents.capturePage + showSaveDialog.
 *          renderer 临时给 .stock-diagnosis-page 加 is-exporting class 隐藏
 *          装饰元素 (按钮 / skeleton / last-dx-badge 等待会出现在图里).
 *
 * 流程:
 *   1. 给 .stock-diagnosis-page 加 is-exporting class (CSS 隐藏装饰元素)
 *   2. requestAnimationFrame 等 1 帧让重排完成
 *   3. await api.stocksExportDiagnosisPng({ defaultName })
 *   4. 移除 class
 *   5. 弹反馈: 成功 → "已保存到 xxx", 取消 → 静默, 失败 → toast 错误
 *
 * 文件名建议: {code}-{name}-诊断-{YYYY-MM-DD}.png (主进程 sanitize 文件名).
 */
import { useState } from "preact/hooks";

function buildDefaultName(code, stockName) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const safeName = String(stockName || "").replace(/[\\/:*?"<>|]/g, "");
  return `${code}${safeName ? `-${safeName}` : ""}-诊断-${y}-${m}-${day}`;
}

export function ExportDiagnosisButton({ api, code, stockName }) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { type: "ok"|"err", text }
  // ponytail: 2026-07-07 — createApi() 漏声明 / preload 漏暴露时 pick() 会返 noop.
  //          noop()() 不报错, 但导出按钮变"点了没反应", 这比"is not a function"更难排查.
  //          显式检查 api.stocksExportDiagnosisPng 是不是个真 bridge; 不是 → 按钮置灰 + tooltip 说明.
  const bridgeReady = api && typeof api.stocksExportDiagnosisPng === "function";

  async function handleClick() {
    if (busy || !api || !bridgeReady) return;
    const root = document.querySelector(".stock-diagnosis-page");
    if (root) root.classList.add("is-exporting");
    setBusy(true);
    // 等 1 帧让 .is-exporting 的隐藏规则生效
    await new Promise((r) => requestAnimationFrame(() => r()));
    try {
      const r = await api.stocksExportDiagnosisPng({
        defaultName: buildDefaultName(code, stockName),
      });
      if (r && r.ok) {
        setToast({ type: "ok", text: `已保存到 ${r.path}` });
      } else if (r && r.reason === "canceled") {
        // 用户取消, 静默
      } else {
        const errText = r && r.error ? `: ${r.error}` : "";
        setToast({ type: "err", text: `导出失败${errText}` });
      }
    } catch (e) {
      setToast({ type: "err", text: `导出失败: ${e && e.message ? e.message : e}` });
    } finally {
      if (root) root.classList.remove("is-exporting");
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <>
      <button
        type="button"
        class="export-diagnosis-btn"
        onClick={handleClick}
        disabled={busy || !bridgeReady}
        title={bridgeReady ? "导出当前诊断报告为 PNG" : "导出 IPC 不可用, 请重启 Pulse (preload 未暴露 stocksExportDiagnosisPng)"}
        aria-label="导出诊断报告"
      >
        {busy ? "导出中…" : "导出 PNG"}
      </button>
      {toast && (
        <div class={`export-diagnosis-toast export-diagnosis-toast-${toast.type}`}>
          {toast.text}
        </div>
      )}
    </>
  );
}

export default ExportDiagnosisButton;