/**
 * src/renderer/components/Toast.jsx
 *
 * Phase B7b.1:一次性 toast提示 —顶部居中浮层,5s 自动消失。
 *
 *用法:
 * - store.toast写 { id, message, type, ts } → Toast 自动 mount
 * - store.showToast(msg, type='info', ms=5000) action
 * - 多 toast 同时支持 (queue), 显示最新 N 条
 *
 *types:
 * - info (蓝) — 普通信息
 * - warn (黄) —警告 (e.g. auth_401提示用户更新 key)
 * - error (红) —错误 (e.g. safeStorage不可用)
 */

import { toast, dismissToast } from '../store.js';
import { ToastTypeIcon } from './icons.jsx';

const TOAST_DEFAULT_MS = 5000;
const TOAST_MAX_VISIBLE = 3;

export function Toast() {
 const current = toast.value;
 if (!Array.isArray(current) || current.length ===0) return null;

 // 只显示最新 N 条 (按 ts倒序)
 const visible = current.slice(-TOAST_MAX_VISIBLE).reverse();

 return (
 <div class="toast-container" role="region" aria-label="提示">
 {visible.map((t) => (
 <div
 key={t.id}
 class={`toast toast-${t.type || 'info'}`}
 role={t.type === 'error' || t.type === 'warn' ? 'alert' : 'status'}
 aria-live={t.type === 'error' ? 'assertive' : 'polite'}
 >
 <span class="toast-icon"><ToastTypeIcon type={t.type || 'info'} size={14} /></span>
 <span class="toast-message">{t.message}</span>
 <button
 type="button"
 class="toast-close"
 onClick={() => dismissToast(t.id)}
 title="关闭"
 aria-label="关闭"
 >
 ×
 </button>
 </div>
 ))}
 </div>
 );
}

export { TOAST_DEFAULT_MS };
