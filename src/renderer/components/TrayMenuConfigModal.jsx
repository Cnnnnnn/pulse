/**
 * src/renderer/components/TrayMenuConfigModal.jsx
 *
 * Phase v1: Tray 菜单配置选择展示 modal.
 *
 * 设计:
 *  - 6 个 checkbox (来自 tray-menu-prefs.js 的 TRAY_SEGMENTS 单源真相)
 *  - mount 时拉一次 prefs (IPC 'tray:get-prefs')
 *  - 切换 checkbox 修改本地 state,「保存」才发 IPC ('tray:save-prefs')
 *  - 「取消」发 IPC 'tray:close-config' (走 main 决定, 跟 Esc / 遮罩一致)
 *  - 错误: getPrefs 失败 → 显示「加载失败」+ 「关闭」按钮
 *  - 错误: savePrefs 失败 → toast「保存失败,重试」
 *
 * 锁死说明: 「打开面板」/「退出」不暴露在 modal 里 — 根本没渲染, buildMenu 硬编码.
 */
import { useState, useEffect } from "preact/hooks";
import { trayConfigOpen, closeTrayConfig, applyTrayPrefsFromMain } from "../trayConfigStore.js";
import { TRAY_SEGMENTS } from "@main/tray-menu-prefs.js";
import { showToast } from "../store.js";
import { ModalShell } from "./ModalShell.jsx";

const SEGMENT_LABELS = TRAY_SEGMENTS;

export function TrayMenuConfigModal() {
  const open = trayConfigOpen.value;
  const [phase, setPhase] = useState("loading"); // "loading" | "ready" | "error"
  const [original, setOriginal] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  // mount: 拉 prefs
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const trayApi = window.pulse && window.pulse.tray;
        if (!trayApi || typeof trayApi.getPrefs !== "function") {
          throw new Error("tray api unavailable");
        }
        const r = await trayApi.getPrefs();
        if (cancelled) return;
        if (r && r.ok && r.prefs && r.prefs.segments) {
          setOriginal(r.prefs.segments);
          setDraft({ ...r.prefs.segments });
          setPhase("ready");
        } else {
          setPhase("error");
        }
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggle(key) {
    setDraft((d) => ({ ...d, [key]: !d[key] }));
  }

  function isDirty() {
    if (!draft || !original) return false;
    for (const s of SEGMENT_LABELS) {
      if (draft[s.key] !== original[s.key]) return true;
    }
    return false;
  }

  async function handleSave() {
    if (!isDirty() || saving) return;
    setSaving(true);
    try {
      const trayApi = window.pulse && window.pulse.tray;
      const r = await trayApi.savePrefs({ version: 1, segments: draft });
      if (r && r.ok) {
        const savedPrefs = r.prefs && r.prefs.segments
          ? r.prefs
          : { version: 1, segments: draft };
        setOriginal(savedPrefs.segments);
        // 同步推到 renderer 端 trayMenuPrefs signal (SideNav 立即过滤)
        applyTrayPrefsFromMain(savedPrefs);
        // 关 modal 走 IPC, main 推 close 信号回流
        trayApi.closeConfigModal();
      } else {
        showToast("保存失败,重试", "error");
      }
    } catch (err) {
      showToast("保存失败,重试", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    const trayApi = window.pulse && window.pulse.tray;
    if (trayApi && typeof trayApi.closeConfigModal === "function") {
      trayApi.closeConfigModal();
    } else {
      // 兜底: preload 没加载时本地直接关
      closeTrayConfig();
    }
  }

  function handleBackdrop() {
    handleCancel();
  }

  if (!open) return null;

  return (
    <ModalShell
      open={open}
      onClose={handleCancel}
      onBackdropClick={handleBackdrop}
      title="菜单栏配置"
      cardClass="tray-config-modal"
      backdropClass="modal-backdrop tray-config-backdrop"
    >
          {phase === "loading" && (
            <div class="tray-config-modal-loading">加载中...</div>
          )}
          {phase === "error" && (
            <div class="tray-config-modal-error">
              加载失败,关闭重试。
              <div class="tray-config-actions">
                <button type="button" class="btn btn-ghost" onClick={handleCancel}>关闭</button>
              </div>
            </div>
          )}
          {phase === "ready" && draft && (
            <>
              <p class="tray-config-hint">
                选择要在菜单栏显示的项。「打开面板」和「退出」始终保留,无法关闭。
              </p>
              <div class="tray-config-segments">
                {SEGMENT_LABELS.map((s) => (
                  <label key={s.key} class="tray-config-segment-row">
                    <input
                      type="checkbox"
                      checked={!!draft[s.key]}
                      onChange={() => toggle(s.key)}
                    />
                    <span class="tray-config-segment-label">{s.label}</span>
                  </label>
                ))}
              </div>
              <div class="tray-config-actions">
                <button
                  type="button"
                  class="btn btn-ghost tray-config-cancel"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="button"
                  class="btn btn-primary tray-config-save"
                  onClick={handleSave}
                  disabled={!isDirty() || saving}
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </>
          )}
    </ModalShell>
  );
}
