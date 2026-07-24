/**
 * src/renderer/components/ErrorBoundary.tsx
 *
 * Phase Q6: Preact ErrorBoundary. Renders a fallback when a descendant throws,
 * and reports the error to main via api.errorReport (best-effort).
 */
import { Component, type ComponentChildren } from 'preact';
import { api } from '../api.js';

type Props = {
  children?: ComponentChildren;
  onError?: (error: unknown, info: { componentStack?: string }) => void;
};

type State = {
  hasError: boolean;
  error: unknown;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    const errLike = (typeof error === 'object' && error) ? error as { message?: string; stack?: string } : null;
    try {
      if (typeof api.errorReport === 'function') {
        api.errorReport({
          level: 'unhandled',
          message: errLike?.message || String(error),
          stack: errLike?.stack || '',
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
      const msg =
        this.state.error instanceof Error ? this.state.error.message : String(this.state.error);
      return (
        <div class="error-boundary-fallback" role="alert">
          <div class="error-boundary-fallback__title">界面渲染出错了</div>
          <div class="error-boundary-fallback__msg">{msg}</div>
          <button class="btn btn-sm" onClick={() => this.setState({ hasError: false, error: null })}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
