/**
 * tests/config/schema-p2.test.js
 *
 * 新 detector types (winget_show / github_release) + win_bundle/winget_id 字段
 * 通过 schema 验证 + sanitize.
 */
import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  sanitizeConfig,
  VALID_DETECTOR_TYPES,
} from '../../src/config/schema.js';

describe('schema P2: new detector types + win fields', () => {
  it('VALID_DETECTOR_TYPES 含 winget_show / github_release', () => {
    expect(VALID_DETECTOR_TYPES.has('winget_show')).toBe(true);
    expect(VALID_DETECTOR_TYPES.has('github_release')).toBe(true);
  });

  it('validate 接受 winget_show detector', () => {
    const cfg = {
      apps: [
        {
          name: 'Cursor',
          bundle: 'Cursor.app',
          detectors: [
            {
              type: 'winget_show',
              id: 'Anysphere.Cursor',
              platform: 'win',
            },
          ],
        },
      ],
    };
    const v = validateConfig(cfg);
    expect(v.valid).toBe(true);
  });

  it('sanitize 保留 win_bundle / winget_id 字段', () => {
    const cfg = {
      apps: [
        {
          name: 'Cursor',
          bundle: 'Cursor.app',
          win_bundle: 'Cursor',
          winget_id: 'Anysphere.Cursor',
          detectors: [{ type: 'github_release', url: 'x' }],
        },
      ],
    };
    const s = sanitizeConfig(cfg);
    const app = s.apps[0];
    expect(app.win_bundle).toBe('Cursor');
    expect(app.winget_id).toBe('Anysphere.Cursor');
  });

  it('sanitize 保留 detector 的 platform + id 字段', () => {
    const cfg = {
      apps: [
        {
          name: 'X',
          bundle: 'X.app',
          detectors: [
            { type: 'winget_show', id: 'X.Id', platform: 'win' },
            { type: 'brew_formulae', cask: 'x', platform: 'mac' },
          ],
        },
      ],
    };
    const s = sanitizeConfig(cfg);
    expect(s.apps[0].detectors).toHaveLength(2);
    expect(s.apps[0].detectors[0].platform).toBe('win');
    expect(s.apps[0].detectors[0].id).toBe('X.Id');
  });
});
