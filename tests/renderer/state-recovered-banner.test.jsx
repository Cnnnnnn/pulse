// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/preact';
import { StateRecoveredBanner, stateRecoveredSignal } from '../../src/renderer/components/StateRecoveredBanner.jsx';

describe('StateRecoveredBanner', () => {
  beforeEach(() => {
    cleanup();
    stateRecoveredSignal.value = null;
    localStorage.clear();
  });

  it('renders nothing when signal is null', () => {
    const { container } = render(<StateRecoveredBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner with title text when event is set', () => {
    stateRecoveredSignal.value = {
      path: '/x/state.json',
      backup: '/x/state.corrupt-ts.json',
      backupFailed: false,
      reason: 'parse_failed',
      errors: ['unexpected token'],
      ts: Date.now(),
    };
    const { container } = render(<StateRecoveredBanner />);
    const text = container.textContent;
    expect(text).toMatch(/设置已恢复默认/);
  });

  it('dismiss hides the banner and persists the dismissal in localStorage', () => {
    stateRecoveredSignal.value = {
      path: '/x', backup: '/x.corrupt.json', backupFailed: false,
      reason: 'schema_failed', errors: ['missing apps'], ts: Date.now(),
    };
    const { container, getByText } = render(<StateRecoveredBanner />);
    const dismissBtn = getByText(/知道了/);
    fireEvent.click(dismissBtn);
    expect(container.firstChild).toBeNull();
    expect(localStorage.getItem('state-banner:dismissed')).toBeTruthy();
  });

  it('does not show if a dismissal is recorded for the same event', () => {
    const ts = Date.now();
    localStorage.setItem('state-banner:dismissed', String(ts));
    stateRecoveredSignal.value = {
      path: '/x', backup: '/x.corrupt.json', backupFailed: false,
      reason: 'parse_failed', errors: [], ts,
    };
    const { container } = render(<StateRecoveredBanner />);
    expect(container.firstChild).toBeNull();
  });
});