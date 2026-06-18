/**
 * src/renderer/ithome/NewsShareCardPage.jsx
 *
 * 离屏渲染入口 — 监听主进程 IPC 发送的 share-data,挂载 <NewsShareCard>。
 * 渲染完成后通过 IPC 主动通知主进程 (不依赖任何渲染端定时器 / rAF,
 * 因为 BrowserWindow({ show: false }) 会节流这些)。
 *
 * 注:share-card.html 与主 index.html 共用同一 preload.js,所有 IPC 都
 * 通过 contextBridge.exposeInMainWorld("api", ...) 暴露,见 preload.js。
 */
import { render } from "preact";
import { NewsShareCard } from "./NewsShareCard.jsx";

function mount(article, summary) {
  const root = document.getElementById("root");
  if (!root) return;
  render(<NewsShareCard article={article} summary={summary} />, root);
  // 立即通过 IPC 通知主进程,主进程 resolve ready promise 后 capture
  if (window.api && typeof window.api.shareCardReady === "function") {
    window.api.shareCardReady();
  } else {
    // fallback: 保留老标志,主进程轮询也会成功
    window.__renderReady = true;
  }
}

// 监听主进程注入 — 通过 contextBridge 的 api.onShareData
if (typeof window !== "undefined" && window.api && typeof window.api.onShareData === "function") {
  window.api.onShareData((payload) => {
    if (payload && payload.article) {
      mount(payload.article, payload.summary || {});
    }
  });
}
