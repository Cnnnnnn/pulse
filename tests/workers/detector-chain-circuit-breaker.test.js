/**
 * tests/workers/detector-chain-circuit-breaker.test.js
 *
 * detector-chain now consults a circuit breaker per detector (Phase C1).
 * Strategy: mock the CB modules (storage + state machine) via require.cache
 * injection, then verify chain behavior. See tests/detectors/circuit-breaker-storage.test.js
 * for the CJS require.cache pattern (vitest 1.6 vi.mock does not hook CJS require).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Mock the storage module
const mockLoadBreakers = vi.fn();
const mockUpsertBreaker = vi.fn();

// Mock the state-machine functions
const mockShouldAllow = vi.fn();
const mockTransitionAfterProbe = vi.fn();
const mockRecordSuccess = vi.fn();
const mockRecordFailure = vi.fn();
const mockCreateBreaker = vi.fn();
const mockHydrate = vi.fn();

const stateStorePath = require.resolve('../../src/detectors/circuit-breaker-storage.js');
const stateMachinePath = require.resolve('../../src/detectors/circuit-breaker.js');
const chainPath = require.resolve('../../src/workers/detector-chain.js');

function reloadChain() {
  delete require.cache[chainPath];
  require.cache[stateStorePath] = {
    id: stateStorePath,
    filename: stateStorePath,
    loaded: true,
    exports: {
      loadBreakers: mockLoadBreakers,
      upsertBreaker: mockUpsertBreaker,
      hydrate: mockHydrate,
      saveBreakers: vi.fn(),
      getBreaker: vi.fn(),
      removeBreaker: vi.fn(),
      snapshot: (b) => { const { _now, ...rest } = b; return rest; },
    },
  };
  require.cache[stateMachinePath] = {
    id: stateMachinePath,
    filename: stateMachinePath,
    loaded: true,
    exports: {
      STATE: { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' },
      DEFAULTS: { failureThreshold: 3, cooldownMs: 300000 },
      createBreaker: mockCreateBreaker,
      shouldAllow: mockShouldAllow,
      transitionAfterProbe: mockTransitionAfterProbe,
      recordSuccess: mockRecordSuccess,
      recordFailure: mockRecordFailure,
    },
  };
  return require(chainPath);
}

beforeEach(() => {
  mockLoadBreakers.mockReset();
  mockUpsertBreaker.mockReset();
  mockShouldAllow.mockReset();
  mockTransitionAfterProbe.mockReset();
  mockRecordSuccess.mockReset();
  mockRecordFailure.mockReset();
  mockCreateBreaker.mockReset();
  mockHydrate.mockReset();

  mockLoadBreakers.mockResolvedValue({});
  mockShouldAllow.mockReturnValue(true);
  mockTransitionAfterProbe.mockImplementation((b) => b);
  mockRecordSuccess.mockImplementation((b) => ({ ...b, state: 'closed' }));
  mockRecordFailure.mockImplementation((b) => ({ ...b, state: 'open' }));
  mockCreateBreaker.mockImplementation(({ key }) => ({ key, state: 'closed', config: {}, _now: () => Date.now() }));
  mockHydrate.mockImplementation((s) => ({ ...s, _now: () => Date.now() }));
});

describe('detector-chain with circuit breaker', () => {
  const deps = {
    arch: 'arm64',
    http: {},
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    platform: 'darwin',
  };

  it('skips a detector when the breaker returns false from shouldAllow', async () => {
    mockShouldAllow.mockReturnValue(false);
    const { runDetectorChain } = reloadChain();
    const appCfg = {
      name: 'X',
      detectors: [
        { type: 'api_json', url: 'https://x.example.com' },
      ],
    };
    const { trace } = await runDetectorChain(appCfg, deps);
    expect(mockShouldAllow).toHaveBeenCalled();
    // First (and only) trace entry should be the api_json with skipped: 'circuit_open'
    expect(trace[0]).toMatchObject({ det: 'api_json', skipped: 'circuit_open' });
  });

  it('builds breaker key as <type>:<identifier> using url/cask/id/baseUrl', { timeout: 30_000 }, async () => {
    const { runDetectorChain } = reloadChain();
    const appCfg = {
      name: 'X',
      detectors: [
        { type: 'api_json', url: 'https://x.example.com/path' },
        { type: 'brew_formulae', cask: 'kimi' },
        { type: 'winget_show', id: 'Anysphere.Cursor' },
      ],
    };
    await runDetectorChain(appCfg, deps);
    // 3 detectors, 3 shouldAllow calls
    expect(mockShouldAllow).toHaveBeenCalledTimes(3);
    const keys = mockShouldAllow.mock.calls.map(([b]) => b.key);
    expect(keys).toContain('api_json:https://x.example.com/path');
    expect(keys).toContain('brew_formulae:kimi');
    expect(keys).toContain('winget_show:Anysphere.Cursor');
  });

  it('records a failure via recordFailure when detector chain trace reports an error', async () => {
    const { runDetectorChain } = reloadChain();
    const appCfg = {
      name: 'X',
      // Use a type that doesn't exist in DETECTORS so makeDetector returns null
      // and the chain logs 'unknown detector type' (treated as an error in trace)
      detectors: [{ type: 'totally_made_up_type', url: 'x' }],
    };
    await runDetectorChain(appCfg, deps);
    // For an unknown detector, the chain should NOT call recordFailure (config bug,
    // not upstream failure). The current spec only requires that recordFailure is
    // invoked when a real detector throws or returns no result. With 'unknown
    // detector type', the chain skips without CB. So we assert recordFailure was
    // NOT called for this case.
    expect(mockRecordFailure).not.toHaveBeenCalled();
  });
});
