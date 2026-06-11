/**
 * src/renderer/components/DetectorWizardModal.jsx
 *
 * v2.7.0 (My Apps Library, B4): detector 选择 modal.
 * v2.7.1: 3 步 stepper (选 detector → 填字段 → 确认) + 2 列 grid card.
 * v2.7.1.2: 推翻重做 — 真正设计 wizard
 *   - master-detail 布局 (左 220px 步骤导航, 右主体内容)
 *   - 不再"顶部 stepper + 主体堆 11 个 detector" (像 form 不像 wizard)
 *   - 左侧步骤是真导航 (可点跳, active 蓝 / done 绿 ✓ / future 灰)
 *   - 右侧只显示当前步骤 1 个东西 (单 detector 大标题 / 字段表 / 预览)
 *   - 步骤间视觉联系强 (左列高亮 + 主体大标题跟左列同步)
 *   - modal 720×560, 居中 + backdrop
 *
 * 提交后调 IPC libraryAdd, 关 modal + 重置 LibrarySection.
 */

import { useState, useMemo, useEffect } from 'preact/hooks';
import { unmonitoredApps, showToast } from '../store.js';
import { api } from '../api.js';

// 11 个 detector types + 每个需要的 fields 定义
// (跟 src/main/library/ops.js VALID_TYPES 同步, 这里只是 UI 层的元数据)
const DETECTORS = [
  {
    type: 'brew_formulae',
    label: 'Homebrew Cask',
    hint: '最简单 — 选 cask name, 工具调 brew info --cask 拿最新版本',
    fields: [
      { key: 'cask', label: 'Cask 名称', placeholder: 'cursor', required: true },
    ],
  },
  {
    type: 'electron_yml',
    label: 'Elect latest-mac.yml',
    hint: '配一个能拿到 latest-mac.yml 的 URL (GitHub releases / S3 / CDN)',
    fields: [
      { key: 'url', label: 'YAML URL', placeholder: 'https://.../latest-mac.yml', required: true },
    ],
  },
  {
    type: 'api_json',
    label: 'JSON API',
    hint: '配一个返 JSON 的 URL, 用 .path 模板挖出 version 字段 (e.g. "data.version")',
    fields: [
      { key: 'url', label: 'API URL', placeholder: 'https://api.example.com/version', required: true },
      { key: 'path', label: 'JSON path', placeholder: 'version', required: false },
    ],
  },
  {
    type: 'app_store_lookup',
    label: 'App Store',
    hint: '走 itunes.apple.com/lookup?id=...&country=cn',
    fields: [
      { key: 'url', label: 'Lookup URL', placeholder: 'https://itunes.apple.com/lookup?id=...', required: true },
    ],
  },
  {
    type: 'redirect_filename',
    label: 'Redirect 文件名',
    hint: 'HTTP 302 重定向到带 version 的 dmg/zip 文件名',
    fields: [
      { key: 'url', label: 'Redirect URL', placeholder: 'https://.../download', required: true },
    ],
  },
  {
    type: 'cursor_redirect',
    label: 'Cursor 专用 redirect',
    hint: 'Cursor 特有的 golden 路径 (api2.cursor.sh/updates/download/...)',
    fields: [
      { key: 'url', label: 'Cursor download URL', placeholder: 'https://api2.cursor.sh/...', required: true },
    ],
  },
  {
    type: 'electron_zip_probe',
    label: 'Electron zip probe',
    hint: '配 baseUrl + product name, 工具扫同目录 zip 拿最新',
    fields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://.../release', required: true },
      { key: 'product', label: 'Product 名', placeholder: 'My App', required: true },
    ],
  },
  {
    type: 'qclaw_api',
    label: 'QClaw API',
    hint: 'QClaw 专用 API (jprx.m.qq.com)',
    fields: [
      { key: 'url', label: 'QClaw API URL', placeholder: 'https://jprx.m.qq.com/...', required: true },
    ],
  },
  {
    type: 'app_update_yml',
    label: 'app-update.yml',
    hint: 'Squirrel.windows 风格的 app-update.yml, 多数 Windows app 用',
    fields: [
      { key: 'url', label: 'YAML URL', placeholder: 'https://.../app-update.yml', required: true },
    ],
  },
  {
    type: 'sparkle_appcast',
    label: 'Sparkle appcast',
    hint: 'Sparkle 框架的 RSS appcast, indie macOS app 常见',
    fields: [
      { key: 'url', label: 'Appcast URL', placeholder: 'https://.../appcast.xml', required: true },
    ],
  },
  {
    type: 'brew_local_cask',
    label: 'Brew local cask',
    hint: '从本地 /usr/local/Caskroom 扫已装 cask, 不联网',
    fields: [
      { key: 'cask', label: 'Cask 名称', placeholder: 'cursor', required: true },
    ],
  },
];

const STEPS = [
  { num: 1, label: '选 detector' },
  { num: 2, label: '填字段' },
  { num: 3, label: '确认' },
];

export function DetectorWizardModal({ item, onClose }) {
  // 初始选 brew_formulae (最简单)
  const [selectedType, setSelectedType] = useState(pickInitialType(item));
  const [fieldValues, setFieldValues] = useState({});
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const detector = useMemo(
    () => DETECTORS.find((d) => d.type === selectedType),
    [selectedType],
  );

  if (!item) return null;

  /**
   * F1: 初始 detector 启发 (v2.8.0).
   *
   * 顺序按 1️⃣ 命中短路: 任一关键词命中就返, 不再走下一条.
   * 不联网, 纯字符串大小写不敏感匹配. 兜底 brew_formulae.
   *
   * @param {object} i { appName, bundleName, bundleId, ... }
   * @returns {string} detector.type
   */
  function pickInitialType(i) {
    if (!i) return 'brew_formulae';
    const hay = `${i.appName || ''} ${i.bundleName || ''} ${i.bundleId || ''}`.toLowerCase();
    // 1) Cursor 专属
    if (/cursor/.test(hay)) return 'cursor_redirect';
    // 2) QClaw 专属 (jprx.m.qq.com 那个)
    if (/qclaw/.test(hay)) return 'qclaw_api';
    // 3) Electron 风格 (Codex / VSCode / Kimi / minimax / WorkBuddy / QoderWork / Marvis)
    if (/(codex|code\.|vscode|kimi|minimax|workbuddy|qoder|lark|electron)/.test(hay)) {
      return 'electron_yml';
    }
    // 4) App Store 上架的 (macOS / iOS 通用)
    if (/(store|wechat|whatsapp|zoom|tencent|feishu|bytedance)/.test(hay)) {
      return 'app_store_lookup';
    }
    // 5) 兜底: brew (最常见 / 最简单)
    return 'brew_formulae';
  }

  function onFieldChange(key, value) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  function validateFields() {
    if (!detector) return '请选一个 detector';
    for (const f of detector.fields) {
      const v = (fieldValues[f.key] || '').trim();
      if (f.required && !v) {
        return `${detector.label}: 必填字段 "${f.label}" 缺失`;
      }
      // F3: url 字段实时校验 (非空时必须 http(s):// 开头)
      if (f.key === 'url' && v && !/^https?:\/\//.test(v)) {
        return `${detector.label}: 字段 "${f.label}" 必须以 http:// 或 https:// 开头`;
      }
    }
    return null;
  }

  // F2: ESC 关 modal / Enter 提交 (或下一步)
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!submitting) onClose();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // 跳过 textarea / 按钮 (避免双触发)
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
        e.preventDefault();
        if (!submitting) goNext();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, submitting, fieldValues]);

  function goNext() {
    if (step === 1) {
      // 选 detector 即可
      setStep(2);
      setError(null);
    } else if (step === 2) {
      // 校验字段
      const v = validateFields();
      if (v) {
        setError(v);
        return;
      }
      setStep(3);
      setError(null);
    } else if (step === 3) {
      // 提交
      onSubmit();
    }
  }

  function goBack() {
    if (step > 1) {
      setStep(step - 1);
      setError(null);
    }
  }

  function jumpToStep(n) {
    // 只允许: 跳回已完成步骤, 或当前步骤往后 1 步
    // 不允许: 跳到未填字段的"确认"步骤
    if (n === step) return;
    if (n < step) {
      // 跳回已完成步骤
      setStep(n);
      setError(null);
      return;
    }
    // n > step: 校验当前 step 之后才能跳
    if (n === step + 1) {
      if (step === 1) {
        setStep(2);
        setError(null);
      } else if (step === 2) {
        const v = validateFields();
        if (v) {
          setError(v);
          return;
        }
        setStep(3);
        setError(null);
      }
    }
  }

  function onSubmit() {
    setSubmitting(true);
    setError(null);
    const detectors = [{ type: selectedType, ...filterCleanFields(detector, fieldValues) }];
    api.libraryAdd({
      appName: item.appName,
      bundleName: item.bundleName,
      detectors,
    }).then((r) => {
      setSubmitting(false);
      if (r && r.ok) {
        // F6: 成功弹 toast (v2.8.0)
        const label = item.appName || item.bundleName;
        showToast(`已监控 ${label}`, 'success', 3000);
        // 成功: 从 unmonitored 移除, 关 modal
        unmonitoredApps.value = unmonitoredApps.value.filter(
          (a) => a.bundlePath !== item.bundlePath,
        );
        onClose();
      } else {
        setError((r && r.reason) || '保存失败');
      }
    }).catch((err) => {
      setSubmitting(false);
      setError(err && err.message ? err.message : '网络错误');
    });
  }

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal-card modal-detector-wizard" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>监控新 app</h2>
          <button class="btn-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div class="wizard-body">
          {/* 左侧: 步骤导航 */}
          <nav class="wizard-nav">
            <div class="wizard-nav-app">
              <div class="wizard-nav-app-name">{item.appName || item.bundleName}</div>
              <div class="wizard-nav-app-meta">
                {item.bundleName}
                {item.version && <span> · v{item.version}</span>}
              </div>
            </div>
            <div class="wizard-nav-steps">
              {STEPS.map((s) => {
                const cls = step === s.num ? 'wizard-nav-step active' : (step > s.num ? 'wizard-nav-step done' : 'wizard-nav-step future');
                const clickable = step > s.num || s.num === step + 1;
                return (
                  <button
                    key={s.num}
                    class={cls}
                    onClick={() => clickable && jumpToStep(s.num)}
                    disabled={!clickable}
                    title={clickable ? `跳到步骤 ${s.num}: ${s.label}` : `先完成步骤 ${step}`}
                  >
                    <span class="wizard-nav-step-num">
                      {step > s.num ? '✓' : s.num}
                    </span>
                    <span class="wizard-nav-step-label">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* 右侧: 步骤内容 */}
          <div class="wizard-content">
            {step === 1 && (
              <StepSelectDetector
                detectors={DETECTORS}
                selected={selectedType}
                onSelect={(t) => { setSelectedType(t); setError(null); }}
              />
            )}

            {step === 2 && detector && (
              <StepFillFields
                detector={detector}
                fieldValues={fieldValues}
                onFieldChange={onFieldChange}
              />
            )}

            {step === 3 && detector && (
              <StepConfirm
                item={item}
                detector={detector}
                fieldValues={fieldValues}
              />
            )}

            {error && <div class="wizard-error">{error}</div>}
          </div>
        </div>

        <div class="modal-footer">
          <span class="wizard-footer-hint">
            步骤 {step} / {STEPS.length}
          </span>
          <div class="modal-footer-buttons">
            {step > 1 && (
              <button class="btn btn-ghost" onClick={goBack} disabled={submitting}>
                ← 上一步
              </button>
            )}
            <button class="btn btn-ghost" onClick={onClose} disabled={submitting}>取消</button>
            <button
              class="btn btn-primary"
              onClick={goNext}
              disabled={submitting}
            >
              {submitting ? '保存中…' : (step === 3 ? '保存并监控' : '下一步 →')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: 选 detector (单选 + 大字, 不用 grid) ────────
function StepSelectDetector({ detectors, selected, onSelect }) {
  return (
    <div class="wizard-step-content">
      <h3 class="wizard-step-title">选 detector 类型</h3>
      <p class="wizard-step-hint">选一个最适合这个 app 的更新源</p>
      <div class="wizard-detector-list">
        {detectors.map((d) => (
          <label
            key={d.type}
            class={`wizard-detector-option${selected === d.type ? ' active' : ''}`}
          >
            <input
              type="radio"
              name="detector-type"
              value={d.type}
              checked={selected === d.type}
              onChange={() => onSelect(d.type)}
              class="wizard-detector-radio"
            />
            <div class="wizard-detector-info">
              <div class="wizard-detector-label">{d.label}</div>
              <div class="wizard-detector-hint">{d.hint}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: 填字段 ─────────────────────────────────────
function StepFillFields({ detector, fieldValues, onFieldChange }) {
  return (
    <div class="wizard-step-content">
      <h3 class="wizard-step-title">
        <span class="wizard-step-title-prefix">填字段</span>
        <span class="wizard-step-title-suffix">{detector.label}</span>
      </h3>
      <p class="wizard-step-hint">
        <code class="wizard-step-code">{detector.type}</code> · {detector.hint}
      </p>
      <div class="wizard-fields">
        {detector.fields.map((f) => (
          <div key={f.key} class="wizard-field">
            <label class="wizard-field-label">
              {f.label}
              {f.required && <span class="wizard-required">*</span>}
            </label>
            <input
              type="text"
              class="wizard-field-input"
              placeholder={f.placeholder}
              value={fieldValues[f.key] || ''}
              onInput={(e) => onFieldChange(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 3: 确认 ───────────────────────────────────────
function StepConfirm({ item, detector, fieldValues }) {
  return (
    <div class="wizard-step-content">
      <h3 class="wizard-step-title">确认</h3>
      <p class="wizard-step-hint">检查无误后点"保存并监控"</p>
      <div class="wizard-confirm">
        <div class="wizard-confirm-row">
          <span class="wizard-confirm-label">App</span>
          <span class="wizard-confirm-value">{item.appName || item.bundleName}</span>
        </div>
        <div class="wizard-confirm-row">
          <span class="wizard-confirm-label">Bundle</span>
          <span class="wizard-confirm-value">{item.bundleName}</span>
        </div>
        <div class="wizard-confirm-row">
          <span class="wizard-confirm-label">Detector</span>
          <span class="wizard-confirm-value">
            <strong>{detector.label}</strong> · <code>{detector.type}</code>
          </span>
        </div>
        {detector.fields.map((f) => (
          <div key={f.key} class="wizard-confirm-row">
            <span class="wizard-confirm-label">{f.label}</span>
            <span class="wizard-confirm-value">
              {/* F5: 既然 validate 已拦截空字段, 这里直接显示 trim 后的值, 不再出 "—" 占位 */}
              {(fieldValues[f.key] || '').trim()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function filterCleanFields(detector, fieldValues) {
  // 只返 detector 定义的 fields, 避免传垃圾
  const out = {};
  for (const f of detector.fields) {
    const v = (fieldValues[f.key] || '').trim();
    if (v) out[f.key] = v;
  }
  return out;
}
