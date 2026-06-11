/**
 * src/renderer/components/DetectorWizardModal.jsx
 *
 * v2.7.0 (My Apps Library, B4): detector 选择 modal.
 * v2.7.1: 3 步 stepper (选 detector → 填字段 → 确认) + 2 列 grid card
 *
 * 用户点 LibrarySection 的"监控"按钮 → 弹这个 modal:
 *   step 1: 顶部 stepper 显示 ① 选 detector (active) ─ ② 填字段 ─ ③ 确认
 *          主体: 11 个 detector type 2 列 grid + 选中的 hint
 *   step 2: ① ✓ ─ ② 填字段 (active) ─ ③ 确认
 *          主体: 选中 detector 的 fields 表单
 *   step 3: ① ✓ ─ ② ✓ ─ ③ 确认 (active)
 *          主体: 预览 "将添加 {appName} 到监控, detector: {type}, fields: {key=value}"
 *   footer: [← 上一步] (step 2-3) [取消] [下一步 →] / [保存并监控] (step 3)
 *
 * 提交后调 IPC libraryAdd, 关 modal + 重置 LibrarySection.
 */

import { useState, useMemo } from 'preact/hooks';
import { unmonitoredApps } from '../store.js';
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
    label: 'JSON API (key→version)',
    hint: '配一个返 JSON 的 URL, 用 .path 模板挖出 version 字段 (e.g. "data.version")',
    fields: [
      { key: 'url', label: 'API URL', placeholder: 'https://api.example.com/version', required: true },
      { key: 'path', label: 'JSON path (e.g. data.version)', placeholder: 'version', required: false },
    ],
  },
  {
    type: 'app_store_lookup',
    label: 'App Store (iTunes lookup)',
    hint: '走 itunes.apple.com/lookup?id=...&country=cn',
    fields: [
      { key: 'url', label: 'Lookup URL', placeholder: 'https://itunes.apple.com/lookup?id=...', required: true },
    ],
  },
  {
    type: 'redirect_filename',
    label: 'Redirect → filename',
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
      { key: 'product', label: 'Product 名 (e.g. "MiniMax Code")', placeholder: 'My App', required: true },
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
    label: 'app-update.yml (老 electron-builder)',
    hint: 'Squirrel.windows 风格的 app-update.yml, 多数 Windows app 用',
    fields: [
      { key: 'url', label: 'YAML URL', placeholder: 'https://.../app-update.yml', required: true },
    ],
  },
  {
    type: 'sparkle_appcast',
    label: 'Sparkle appcast (macOS)',
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

  function pickInitialType(i) {
    // 启发式: 默认 brew_formulae (最简单)
    return 'brew_formulae';
  }

  function onFieldChange(key, value) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  function validateFields() {
    if (!detector) return '请选一个 detector';
    for (const f of detector.fields) {
      if (f.required) {
        const v = (fieldValues[f.key] || '').trim();
        if (!v) return `${detector.label}: 必填字段 "${f.label}" 缺失`;
      }
    }
    return null;
  }

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
        {/* 顶部 stepper */}
        <div class="wizard-stepper">
          {STEPS.map((s, i) => {
            const cls = step === s.num ? 'wizard-step active' : (step > s.num ? 'wizard-step done' : 'wizard-step');
            return (
              <span key={s.num} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <span class={cls}>
                  <span class="wizard-step-num">{step > s.num ? '✓' : s.num}</span>
                  <span>{s.label}</span>
                </span>
                {i < STEPS.length - 1 && <span class="wizard-step-sep" />}
              </span>
            );
          })}
        </div>

        <div class="modal-header">
          <h2>监控新 app</h2>
          <button class="btn-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div class="modal-body">
          <div class="wizard-item-info">
            <div class="wizard-item-name">{item.appName || item.bundleName}</div>
            <div class="wizard-item-meta">
              {item.bundleName && <span>{item.bundleName}</span>}
              {item.version && <span>v{item.version}</span>}
              {item.bundleId && <span>{item.bundleId}</span>}
            </div>
          </div>

          {step === 1 && (
            <div class="wizard-section">
              <label class="wizard-section-label">Detector 类型</label>
              <div class="wizard-detector-grid">
                {DETECTORS.map((d) => (
                  <button
                    key={d.type}
                    class={`wizard-detector-card${selectedType === d.type ? ' active' : ''}`}
                    onClick={() => { setSelectedType(d.type); setError(null); }}
                  >
                    <div class="wizard-detector-label">{d.label}</div>
                    <div class="wizard-detector-type">{d.type}</div>
                  </button>
                ))}
              </div>
              {detector && <p class="wizard-detector-hint">{detector.hint}</p>}
            </div>
          )}

          {step === 2 && detector && (
            <div class="wizard-section">
              <label class="wizard-section-label">{detector.label} · 配置字段</label>
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
          )}

          {step === 3 && detector && (
            <div class="wizard-section">
              <label class="wizard-section-label">确认</label>
              <div class="wizard-confirm-row">
                <span class="wizard-confirm-row-label">App</span>
                <span class="wizard-confirm-row-value">{item.appName || item.bundleName}</span>
              </div>
              <div class="wizard-confirm-row">
                <span class="wizard-confirm-row-label">Bundle</span>
                <span class="wizard-confirm-row-value">{item.bundleName}</span>
              </div>
              <div class="wizard-confirm-row">
                <span class="wizard-confirm-row-label">Detector</span>
                <span class="wizard-confirm-row-value">{detector.label} ({detector.type})</span>
              </div>
              {detector.fields.map((f) => (
                <div key={f.key} class="wizard-confirm-row">
                  <span class="wizard-confirm-row-label">{f.label}</span>
                  <span class="wizard-confirm-row-value">
                    {(fieldValues[f.key] || '').trim() || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && <div class="wizard-error">{error}</div>}
        </div>
        <div class="modal-footer">
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
