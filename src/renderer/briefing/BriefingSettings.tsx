/**
 * src/renderer/briefing/BriefingSettings.tsx
 *
 * v3.0 alpha: 早报设置页 — 嵌入 SettingsPage 通用容器.
 *
 * ponytail: 组件是受控的 — 加载态由父组件触发 fetch, 内部只渲染表单 + 调 save.
 *           不引入 signal 跨组件同步 — 单组件足够, 多组件同步走父级 (SettingsPage).
 */
import { useEffect, useState } from "preact/hooks";
import { showToast } from "../store.ts";
import { api } from "../api.ts";
import { digestDrawerOpen } from "../digest/digest-store.ts";
import {
  DIGEST_KIND_LABEL,
  DIGEST_KIND_ORDER,
  type DailyDigestConfig,
  type DigestKind,
} from "../../shared/digest-types.ts";
import { defaultDigestConfig } from "../../shared/digest-types.ts";

function isValidHHMM(s: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);
}

export function BriefingSettings() {
  const [loaded, setLoaded] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [config, setConfig] = useState<DailyDigestConfig>(defaultDigestConfig());
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  // v3.0 beta: 最近一次推送的 snapshot + 导出后的 HTML 路径
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportPath, setExportPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cfg, snap] = await Promise.all([
        api.briefingFetchConfig(),
        api.briefingSnapshotFetch(),
      ]);
      if (cancelled) return;
      if (cfg && cfg.ok && cfg.config) setConfig(cfg.config);
      if (snap && snap.ok && snap.snapshot) {
        setSnapshotDate(snap.snapshot.date);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshPreview() {
    const resp = await api.briefingPreview();
    if (resp && resp.ok) {
      setPreviewDate(resp.date || null);
      setPreviewLines(resp.lines || []);
    } else {
      showToast("早报预览失败", "error");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const resp = await api.briefingSaveConfig({
        enabled: config.enabled,
        time: config.time,
        quiet_hours_start: config.quiet_hours_start || null,
        quiet_hours_end: config.quiet_hours_end || null,
        subscribed_sections: config.subscribed_sections,
        llm_rewrite_enabled: config.llm_rewrite_enabled,
      });
      if (resp && resp.ok) {
        showToast("已保存", "success");
        await refreshPreview();
      } else {
        showToast("保存失败", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  async function exportHtml() {
    setExporting(true);
    try {
      const resp = await api.briefingExport({ regenerate: false });
      if (resp && resp.ok && resp.path) {
        setExportPath(resp.path);
        showToast("已导出早报卡片", "success");
        await api.briefingShowInFolder({ path: resp.path });
      } else {
        showToast(
          resp && resp.reason === "empty_snapshot"
            ? "今天还没有可导出的早报，请先触发一次推送或预览"
            : "导出失败",
          "error",
        );
      }
    } finally {
      setExporting(false);
    }
  }

  function toggleSection(kind: DigestKind) {
    const set = new Set(config.subscribed_sections);
    if (set.has(kind)) set.delete(kind);
    else set.add(kind);
    // 保持原顺序 — 重新过滤 DIGEST_KIND_ORDER
    const next = DIGEST_KIND_ORDER.filter((k) => set.has(k));
    setConfig({ ...config, subscribed_sections: next });
  }

  if (!loaded) {
    return (
      <div class="briefing-settings" data-testid="briefing-settings">
        加载中…
      </div>
    );
  }

  const enabledCount = config.subscribed_sections.length;

  return (
    <div class="briefing-settings settings-card" data-testid="briefing-settings">
      {/* ── 头部 ─────────────────────────────────────────── */}
      <div class="briefing-settings__head">
        <div class="briefing-settings__head-text">
          <div class="settings-card__title">每日早报</div>
          <div class="settings-card__intro">
            每天到点推送一组关键摘要 — 可升级应用 / 微博热搜 / IT 新闻 / 基金变动 / AI 用量。
          </div>
        </div>
        <label class="briefing-settings__switch">
          <input
            type="checkbox"
            data-testid="briefing-enabled"
            checked={config.enabled}
            onChange={(e) =>
              setConfig({ ...config, enabled: (e.target as HTMLInputElement).checked })
            }
          />
          <span class="briefing-settings__switch-slider" />
          <span class="briefing-settings__switch-label">
            {config.enabled ? "已启用" : "未启用"}
          </span>
        </label>
      </div>

      {/* ── 时间 + 免打扰 ───────────────────────────────── */}
      <fieldset class="briefing-settings__fieldset">
        <legend>推送计划</legend>
        <div class="briefing-settings__grid">
          <label class="briefing-settings__field">
            <span class="briefing-settings__label">推送时间</span>
            <input
              type="time"
              class="briefing-settings__input"
              data-testid="briefing-time"
              value={config.time}
              onInput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                if (isValidHHMM(v)) setConfig({ ...config, time: v });
              }}
            />
          </label>
          <label class="briefing-settings__field">
            <span class="briefing-settings__label">免打扰起 (可选)</span>
            <input
              type="time"
              class="briefing-settings__input"
              data-testid="briefing-quiet-start"
              value={config.quiet_hours_start || ""}
              onInput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                setConfig({ ...config, quiet_hours_start: v || null });
              }}
            />
          </label>
          <label class="briefing-settings__field">
            <span class="briefing-settings__label">免打扰止 (可选)</span>
            <input
              type="time"
              class="briefing-settings__input"
              data-testid="briefing-quiet-end"
              value={config.quiet_hours_end || ""}
              onInput={(e) => {
                const v = (e.target as HTMLInputElement).value;
                setConfig({ ...config, quiet_hours_end: v || null });
              }}
            />
          </label>
        </div>
      </fieldset>

      {/* ── 模块订阅 ────────────────────────────────────── */}
      <fieldset class="briefing-settings__fieldset">
        <legend>
          模块订阅 <span class="briefing-settings__legend-hint">已选 {enabledCount} / {DIGEST_KIND_ORDER.length}</span>
        </legend>
        <div class="briefing-settings__chips">
          {DIGEST_KIND_ORDER.map((kind) => {
            const checked = config.subscribed_sections.includes(kind);
            return (
              <label
                key={kind}
                class={`briefing-settings__chip${checked ? " is-on" : ""}`}
                data-kind={kind}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSection(kind)}
                  data-testid={`briefing-section-${kind}`}
                />
                <span class="briefing-settings__chip-dot" aria-hidden />
                <span>{DIGEST_KIND_LABEL[kind]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* ── LLM 改写 ─────────────────────────────────────── */}
      <label class="briefing-settings__toggle">
        <input
          type="checkbox"
          checked={config.llm_rewrite_enabled}
          onChange={(e) =>
            setConfig({
              ...config,
              llm_rewrite_enabled: (e.target as HTMLInputElement).checked,
            })
          }
          data-testid="briefing-llm"
        />
        <span class="briefing-settings__toggle-text">
          <strong>启用 LLM 改写</strong>
          <span class="briefing-settings__toggle-hint">
            用大模型把要点改写成可读段落；失败时自动回退原要点。
          </span>
        </span>
      </label>

      {/* ── 操作栏 ──────────────────────────────────────── */}
      <div class="briefing-settings__actions">
        <div class="briefing-settings__actions-left">
          <button
            type="button"
            class="briefing-settings__btn briefing-settings__btn--ghost"
            onClick={refreshPreview}
            data-testid="briefing-preview"
          >
            <span aria-hidden>👁</span> 预览
          </button>
          <button
            type="button"
            class="briefing-settings__btn briefing-settings__btn--ghost"
            onClick={exportHtml}
            disabled={exporting}
            data-testid="briefing-export"
          >
            <span aria-hidden>⤓</span> {exporting ? "导出中..." : "导出 HTML"}
          </button>
          <button
            type="button"
            class="briefing-settings__btn briefing-settings__btn--ghost"
            onClick={() => {
              digestDrawerOpen.value = true;
            }}
            data-testid="briefing-open-drawer"
          >
            <span aria-hidden>📐</span> 打开 Drawer
          </button>
        </div>
        <button
          type="button"
          class="briefing-settings__btn briefing-settings__btn--primary"
          onClick={save}
          disabled={saving}
          data-testid="briefing-save"
        >
          {saving ? "保存中..." : "保存设置"}
        </button>
      </div>

      {/* ── 状态栏 ──────────────────────────────────────── */}
      <div
        class={`briefing-settings__status ${snapshotDate ? "is-pushed" : "is-pending"}`}
        data-testid="briefing-meta"
      >
        <span class="briefing-settings__status-dot" aria-hidden />
        <span class="briefing-settings__status-text">
          {snapshotDate
            ? `最近推送：${snapshotDate}`
            : "今天还没推送过 — 开启后到点会自动推送"}
        </span>
      </div>

      {/* ── 预览结果 ────────────────────────────────────── */}
      {previewDate ? (
        <div class="briefing-settings__preview-box" data-testid="briefing-preview-box">
          <div class="briefing-settings__preview-date">预览 · {previewDate}</div>
          {previewLines.length === 0 ? (
            <div class="briefing-settings__preview-empty">没有匹配的要点</div>
          ) : (
            <ul class="briefing-settings__preview-list">
              {previewLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
