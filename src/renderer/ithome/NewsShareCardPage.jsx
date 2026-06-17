/**
 * src/renderer/ithome/NewsShareCardPage.jsx
 *
 * 离屏渲染入口 — 监听主进程 IPC 发送的 share-data,挂载 <NewsShareCard>。
 * 渲染完成后设置 window.__renderReady = true 供主进程轮询。
 *
 * 注:share-card.html 与主 index.html 共用同一 preload.js,所有 IPC 都
 * 通过 contextBridge.exposeInMainWorld("api", ...) 暴露,见 preload.js。
 * Task 5 会在 preload 的 `api` 命名空间下加 `onShareData` 监听方法。
 */
import { render } from "preact";
import { NewsShareCard } from "./NewsShareCard.jsx";

function mount(article, summary) {
  const root = document.getElementById("root");
  if (!root) return;
  render(<NewsShareCard article={article} summary={summary} />, root);
  // 两帧后标记 ready,确保 layout/paint 完成
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__renderReady = true;
    });
  });
}

// 监听主进程注入 — 通过 contextBridge 的 api.onShareData
if (typeof window !== "undefined" && window.api && typeof window.api.onShareData === "function") {
  window.api.onShareData((payload) => {
    if (payload && payload.article) {
      mount(payload.article, payload.summary || {});
    }
  });
}

// 兜底:若 30s 内未收到数据,标记失败
setTimeout(() => {
  if (!window.__renderReady) {
    window.__renderReady = false;
  }
}, 30000);
