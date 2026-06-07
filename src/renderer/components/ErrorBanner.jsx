/**
 * src/renderer/components/ErrorBanner.jsx
 *
 * 整轮 check 失败时 header 下的红 banner（带"重试"按钮）。
 * 单 app 失败走 AppAction 内的 status badge，不进这里。
 */

import { checkStatus, lastError } from '../store.js';

export function ErrorBanner({ onRetry }) {
  if (checkStatus.value !== 'error') return null;
  return (
    <div class="error-banner" role="alert">
      <div class="error-banner-text">
        <strong>检查失败</strong>
        {lastError.value ? <span> · {lastError.value}</span> : null}
      </div>
      <button class="btn btn-secondary btn-sm" onClick={onRetry}>重试</button>
    </div>
  );
}
