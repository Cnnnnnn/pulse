/**
 * src/renderer/components/ErrorBoundary.jsx
 *
 * Phase Q6: Preact ErrorBoundary. Renders a fallback when a descendant throws,
 * and reports the error to main via api.errorReport (best-effort).
 */
import { Component } from 'preact';
import { api } from '../api.js';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      if (typeof api.errorReport === 'function') {
        api.errorReport({
          level: 'unhandled',
          message: (error && error.message) || String(error),
          stack: (error && error.stack) || '',
          context: { componentStack: info && info.componentStack, kind: 'preact-boundary' },
        });
      }
    } catch { /* swallow */ }
    if (typeof this.props.onError === 'function') {
      try { this.props.onError(error, info); } catch { /* swallow */ }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div class="error-boundary-fallback" role="alert">
          <div class="error-boundary-fallback__title">界面渲染出错了</div>
          <div class="error-boundary-fallback__msg">{this.state.error && this.state.error.message}</div>
          <button class="btn btn-sm" onClick={() => this.setState({ hasError: false, error: null })}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
