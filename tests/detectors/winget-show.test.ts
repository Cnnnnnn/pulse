/**
 * tests/detectors/winget-show.test.js
 *
 * WingetShowDetector — winget show <id> --versions, 取第一个版本号.
 * 依赖 execFile (winget CLI), 测试用 mock exec 注入 (经 detCfg._exec).
 */
import { describe, it, expect, vi } from 'vitest';
import { WingetShowDetector } from '../../src/detectors/winget-show.js';
import { makeCtx } from '../helpers/mock-http.js';
import { REASONS } from '../../src/detectors/errors.js';

describe('WingetShowDetector', () => {
  it('解析 winget show 输出, 取第一个版本号', async () => {
    const mockExec = vi.fn().mockResolvedValue({
      stdout:
        '找到 [Anysphere.Cursor] 版本 1.0.0\n----------------------------------------\n1.0.0\n0.50.5\n0.49.0',
      stderr: '',
    });
    const r = await new WingetShowDetector({ id: 'Anysphere.Cursor' }).detect(
      makeCtx({ detCfg: { _exec: mockExec } }),
    );
    expect(r.version).toBe('1.0.0');
    expect(r.source).toBe('winget_show');
    expect(r.confidence).toBe('high');
    expect(mockExec).toHaveBeenCalled();
  });

  it('英文 locale 输出也能解析', async () => {
    const mockExec = vi.fn().mockResolvedValue({
      stdout: 'Anysphere.Cursor 1.2.3\n1.2.3\n1.2.2\n1.2.1',
      stderr: '',
    });
    const r = await new WingetShowDetector({ id: 'X' }).detect(
      makeCtx({ detCfg: { _exec: mockExec } }),
    );
    expect(r.version).toBe('1.2.3');
  });

  it('无 id → no_version', async () => {
    await expect(
      new WingetShowDetector({}).detect(makeCtx({})),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('winget 不存在 / 报错 → no_version', async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error('ENOENT'));
    await expect(
      new WingetShowDetector({ id: 'X' }).detect(
        makeCtx({ detCfg: { _exec: mockExec } }),
      ),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('空输出 → no_version', async () => {
    const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    await expect(
      new WingetShowDetector({ id: 'X' }).detect(
        makeCtx({ detCfg: { _exec: mockExec } }),
      ),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it('输出里没有版本号 → no_version', async () => {
    const mockExec = vi
      .fn()
      .mockResolvedValue({ stdout: 'No package found', stderr: '' });
    await expect(
      new WingetShowDetector({ id: 'X' }).detect(
        makeCtx({ detCfg: { _exec: mockExec } }),
      ),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });
});
