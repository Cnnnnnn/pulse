/**
 * tests/ai-sessions/storage.test.js
 *
 * Phase B6a (AI Sessions Daily Digest): safeStorage helper 测试.
 *跟 plan B6a 对齐 (~10 cases).
 *
 *思路:用 __setSafeStorageForTest + __setUserDataDirForTest注入 fake safeStorage,
 *避免依赖 Electron. _keyPath内部 fallback 到 inject 的 userData dir.
 *
 * fake safeStorage:用 XOR + base64模拟 encrypt/decrypt (一对函数互逆即可).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
 isAvailable,
 saveApiKey,
 loadApiKey,
 clearApiKey,
 __setSafeStorageForTest,
 __setUserDataDirForTest,
 __resetForTest,
} from '../../src/ai-sessions/storage.js';

let tmpDir = null;

//假 safeStorage: XOR cipher +4-byte magic prefix ("PSA1") for corrupted-file detect.
//存格式: magic(4) + xor-bytes. load时校验 magic, 不匹配 → throw (上层 catch返 null).
function makeFakeSafeStorage({ available = true } = {}) {
 const MAGIC = Buffer.from('PSA1', 'utf-8');
 return {
 isEncryptionAvailable: () => available,
 encryptString: (plain) => {
 const buf = Buffer.from(plain, 'utf-8');
 const out = Buffer.alloc(MAGIC.length + buf.length);
 MAGIC.copy(out,0);
 for (let i =0; i < buf.length; i++) out[MAGIC.length + i] = buf[i] ^0x5a;
 return out;
 },
 decryptString: (buf) => {
 if (!Buffer.isBuffer(buf) || buf.length < MAGIC.length) {
 throw new Error('invalid encrypted blob: too short');
 }
 for (let i =0; i < MAGIC.length; i++) {
 if (buf[i] !== MAGIC[i]) throw new Error('invalid encrypted blob: magic mismatch');
 }
 const out = Buffer.alloc(buf.length - MAGIC.length);
 for (let i =0; i < out.length; i++) out[i] = buf[MAGIC.length + i] ^0x5a;
 return out.toString('utf-8');
 },
 };
}

beforeEach(() => {
 tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-storage-test-'));
 __setUserDataDirForTest(tmpDir);
 __setSafeStorageForTest(makeFakeSafeStorage());
});

afterEach(() => {
 __resetForTest();
 if (tmpDir) {
 try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
 tmpDir = null;
 }
});

describe('isAvailable', () => {
 it('有 safeStorage 且 encryption 可用 → true', () => {
 __setSafeStorageForTest(makeFakeSafeStorage({ available: true }));
 expect(isAvailable()).toBe(true);
 });

 it('safeStorage 在但 encryption不可用 (Linux 无 keyring) → false', () => {
 __setSafeStorageForTest(makeFakeSafeStorage({ available: false }));
 expect(isAvailable()).toBe(false);
 });

 it('没 safeStorage (没 electron) → false', () => {
 __setSafeStorageForTest(null);
 expect(isAvailable()).toBe(false);
 });
});

describe('saveApiKey + loadApiKey round-trip', () => {
 it('存 openai key → load出来一致', () => {
 const r = saveApiKey('openai', 'sk-abc123');
 expect(r).toBe(true);
 expect(loadApiKey('openai')).toBe('sk-abc123');
 });

 it('存 anthropic key → load出来一致', () => {
 saveApiKey('anthropic', 'sk-ant-test-key');
 expect(loadApiKey('anthropic')).toBe('sk-ant-test-key');
 });

 it('不同 providerId互不干扰 (openai存 / anthropic读 null)', () => {
 saveApiKey('openai', 'sk-openai-only');
 expect(loadApiKey('anthropic')).toBeNull();
 });

 it('同 providerId二次写覆盖', () => {
 saveApiKey('openai', 'sk-old');
 saveApiKey('openai', 'sk-new');
 expect(loadApiKey('openai')).toBe('sk-new');
 });

 it('存中文 /特殊字符 / 长 key 都 OK', () => {
 const longKey = 'a'.repeat(500) + '🚀' + '\n';
 saveApiKey('deepseek', longKey);
 expect(loadApiKey('deepseek')).toBe(longKey);
 });

it('写入时 file存在且 mode =0o600', () => {
  // Windows 不强制 POSIX mode bit (fs.writeFileSync mode 参数被忽略, 走 NTFS
  // DACL), 0o666 也不意味着 world-writable — NTFS ACL 由 user 自己控制. mac/linux
  // 上 fs 真的给 0o600.
  if (process.platform === 'win32') return;
  saveApiKey('minimax', 'sk-test');
  const file = path.join(tmpDir, 'ai-keys', 'minimax.bin');
  expect(fs.existsSync(file)).toBe(true);
  const stat = fs.statSync(file);
  //0o600 =384
  expect(stat.mode &0o777).toBe(0o600);
});
});

describe('saveApiKey边界', () => {
 it('apiKey 空字符串 → throw TypeError', () => {
 expect(() => saveApiKey('openai', '')).toThrow(TypeError);
 });

 it('apiKey 非 string → throw TypeError', () => {
 expect(() => saveApiKey('openai',12345)).toThrow(TypeError);
 expect(() => saveApiKey('openai', null)).toThrow(TypeError);
 });

 it('providerId非法字符 → throw TypeError', () => {
 expect(() => saveApiKey('open ai', 'sk')).toThrow(TypeError); //空格
 expect(() => saveApiKey('../etc', 'sk')).toThrow(TypeError); // path traversal
 expect(() => saveApiKey('', 'sk')).toThrow(TypeError); // 空
 });

 it('providerId合法字符 (含 - _ 大写)', () => {
 expect(() => saveApiKey('open-ai', 'sk')).not.toThrow();
 expect(() => saveApiKey('My_Provider', 'sk')).not.toThrow();
 expect(() => saveApiKey('A1', 'sk')).not.toThrow();
 });

 it('encryption不可用 (Linux 无 keyring) → saveApiKey返 false + 不写文件', () => {
 __setSafeStorageForTest(makeFakeSafeStorage({ available: false }));
 const r = saveApiKey('openai', 'sk-test');
 expect(r).toBe(false);
 const file = path.join(tmpDir, 'ai-keys', 'openai.bin');
 expect(fs.existsSync(file)).toBe(false);
 });

 it('没 safeStorage (非 Electron) → saveApiKey返 false', () => {
 __setSafeStorageForTest(null);
 const r = saveApiKey('openai', 'sk-test');
 expect(r).toBe(false);
 });
});

describe('loadApiKey边界', () => {
 it('没存过的 provider → null', () => {
 expect(loadApiKey('openai')).toBeNull();
 });

 it('没 userData dir (有 safeStorage 但没 userData) → throw', () => {
 __setUserDataDirForTest(null); // 只清 userData,safeStorage还在
 // ss存在 → 不走 "if (!ss)" short-circuit → 进 _keyPath → userData null → throw
 expect(() => loadApiKey('openai')).toThrow(/userData dir unavailable/);
 });

 it('file损坏 (decrypt抛) → null + 不抛', () => {
 saveApiKey('openai', 'sk-test');
 const file = path.join(tmpDir, 'ai-keys', 'openai.bin');
 fs.writeFileSync(file, 'not a valid encrypted blob');
 expect(() => loadApiKey('openai')).not.toThrow();
 expect(loadApiKey('openai')).toBeNull();
 });

 it('safeStorage不可用 → loadApiKey返 null', () => {
 saveApiKey('openai', 'sk-test');
 __setSafeStorageForTest(makeFakeSafeStorage({ available: false }));
 expect(loadApiKey('openai')).toBeNull();
 });
});

describe('clearApiKey', () => {
 it('存过 → clear → load返 null', () => {
 saveApiKey('openai', 'sk-test');
 expect(clearApiKey('openai')).toBe(true);
 expect(loadApiKey('openai')).toBeNull();
 });

 it('没存过 (ENOENT) →返 false, 不抛', () => {
 expect(() => clearApiKey('openai')).not.toThrow();
 expect(clearApiKey('openai')).toBe(false);
 });

 it('clear 后再 save → 能 round-trip', () => {
 saveApiKey('openai', 'sk-1');
 clearApiKey('openai');
 saveApiKey('openai', 'sk-2');
 expect(loadApiKey('openai')).toBe('sk-2');
 });
});
