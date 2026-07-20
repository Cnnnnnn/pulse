/**
 * src/renderer/games/ShareImageModal.jsx — 分享图弹窗（P1b · F）。
 *
 * 复用 ModalShell；内含 <canvas> + 「生成分享图」与「导出 PNG」按钮。
 *  - 生成：组装 payload（entries/stats/badges/tiers/template）→ renderShareImage 绘入 canvas。
 *  - 导出：exportShareImage 零 IPC 锚点下载 PNG。
 *  - 模板偏好持久化 pulse.games.share.templates.v1（{ lastTemplate, prefs }），
 *    读写走 gamesStore 的 readStorage/writeStorage（复用既有封装）。
 *  - 纯本地：无网络、无 IPC、远程缩略图按安全模式仅色块呈现。
 */
import { useRef, useState } from "preact/hooks";
import { ModalShell } from "../components/ModalShell.jsx";
import {
  collectionStats,
  badgesEarned,
  achievementsProgress,
  rarityTiers,
  wishlist,
  readStorage,
  writeStorage,
} from "./gamesStore.js";
import {
  buildSharePayload,
  renderShareImage,
  exportShareImage,
  SHARE_TEMPLATES,
  DEFAULT_SHARE_TEMPLATE,
} from "./shareImage.js";

const SHARE_KEY = "pulse.games.share.templates.v1";

/** 读取分享模板偏好；缺失/损坏回退默认。 */
function loadSharePrefs() {
  try {
    const raw = readStorage(SHARE_KEY);
    if (!raw) return { lastTemplate: DEFAULT_SHARE_TEMPLATE, prefs: {} };
    const o = JSON.parse(raw);
    return {
      lastTemplate:
        typeof o.lastTemplate === "string" && o.lastTemplate
          ? o.lastTemplate
          : DEFAULT_SHARE_TEMPLATE,
      prefs: o && o.prefs && typeof o.prefs === "object" ? o.prefs : {},
    };
  } catch {
    return { lastTemplate: DEFAULT_SHARE_TEMPLATE, prefs: {} };
  }
}

/** 持久化分享模板偏好（try/catch 吞错，不影响导出）。 */
function saveSharePrefs(prefs) {
  try {
    writeStorage(SHARE_KEY, JSON.stringify(prefs));
  } catch {
    /* 忽略 */
  }
}

export function ShareImageModal({ open, onClose }) {
  const canvasRef = useRef(null);
  const [template, setTemplate] = useState(() => loadSharePrefs().lastTemplate);
  const [status, setStatus] = useState("");

  /** 组装 payload 并绘入 canvas。 */
  function handleGenerate() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stats = collectionStats();
    const payload = buildSharePayload(wishlist.value, stats, badgesEarned.value, {
      tiers: rarityTiers.value,
      title: "我的游戏收藏墙",
      template,
      achievementsProgress: achievementsProgress.value,
    });
    try {
      const ok = renderShareImage(canvas, payload);
      setStatus(ok ? "已生成预览" : "当前环境不支持 canvas 预览");
    } catch {
      setStatus("生成失败");
    }
  }

  /** 导出 PNG（先确保已生成）。 */
  async function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    handleGenerate();
    try {
      const res = await exportShareImage(canvas, { filename: "pulse-collection.png" });
      setStatus(res && res.ok ? "已导出 PNG（本地下载）" : "导出失败");
    } catch {
      setStatus("导出失败");
    }
  }

  /** 切换模板并持久化偏好。 */
  function handleTemplate(e) {
    const id = e.target.value;
    setTemplate(id);
    saveSharePrefs({ lastTemplate: id, prefs: {} });
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="生成分享图"
      footer={
        <>
          <button type="button" class="modal-btn modal-btn--ghost" onClick={onClose}>
            关闭
          </button>
          <button type="button" class="modal-btn" onClick={handleGenerate}>
            生成分享图
          </button>
          <button type="button" class="modal-btn modal-btn--primary" onClick={handleExport}>
            导出 PNG
          </button>
        </>
      }
    >
      <div class="share-image">
        <div class="share-image__toolbar">
          <label class="share-image__label" for="share-template">
            模板
          </label>
          <select
            id="share-template"
            class="share-image__select"
            value={template}
            onChange={handleTemplate}
          >
            {SHARE_TEMPLATES.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div class="share-image__canvas-wrap">
          <canvas
            ref={canvasRef}
            class="share-image__canvas"
            width="1200"
            height="630"
            role="img"
            aria-label="游戏收藏分享图预览"
          />
        </div>

        <p class="share-image__hint">
          本地生成，不联网、不上传；远程缩略图按安全模式仅以色块呈现。
        </p>
        {status && (
          <p class="share-image__status" role="status">
            {status}
          </p>
        )}
      </div>
    </ModalShell>
  );
}

export default ShareImageModal;
