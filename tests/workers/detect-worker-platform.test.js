/**
 * tests/workers/detect-worker-platform.test.js
 *
 * worker IPC 层导出 PLATFORM (跟 ARCH 并列), task-handlers 传 platform 给 detector chain.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('worker IPC carries platform', () => {
  it('ipc.js 导出 PLATFORM (从 workerData)', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/ipc.js'),
      'utf-8',
    );
    expect(src).toContain('PLATFORM');
    expect(src).toContain('workerData');
  });

  it('task-handlers.js import PLATFORM 并传给 runDetectorChain', () => {
    const src = readFileSync(
      join(__dirname, '../../src/workers/task-handlers.js'),
      'utf-8',
    );
    expect(src).toContain('PLATFORM');
    expect(src).toContain('platform: PLATFORM');
  });

  it('main/index.ts workerOpts 带 platform', () => {
    const src = readFileSync(
      join(__dirname, '../../src/main/index.ts'),
      'utf-8',
    );
    expect(src).toMatch(/platform:\s*process\.platform/);
  });
});
