// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { ErrorBoundary } from '../../src/renderer/components/ErrorBoundary.jsx';

beforeEach(() => { cleanup(); });

function Bomb({ shouldThrow }) {
  if (shouldThrow) throw new Error('boom');
  return <div>ok</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { container } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(container.textContent).toBe('ok');
  });

  it('renders fallback when child throws', () => {
    const { container } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(container.textContent).toMatch(/出错了|error/i);
  });

  it('calls onError callback with error info', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalled();
    const call = onError.mock.calls[0][0];
    expect(call.message).toBe('boom');
  });

  it('isolates errors to subtree (sibling unaffected)', () => {
    const { container } = render(
      <div>
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
        <Bomb shouldThrow={false} />
      </div>,
    );
    expect(container.textContent).toContain('ok');
  });
});
