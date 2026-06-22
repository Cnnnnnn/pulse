/**
 * src/main/food/food-config.js
 *
 * 高德 API key 持久化 — 走 Electron safeStorage (macOS Keychain / Windows DPAPI).
 * 文件位置: ~/Library/Application Support/pulse/food_keys/amap.bin (mode 0o600).
 *
 * 设计原则:
 *   - 复用 safeStorage 机制, 跟 AI keys 一致 (不重新发明)
 *   - 独立子目录 food_keys/, 跟 ai-keys/ 隔离, 避免互相覆盖
 *   - 失败必须 ok=false + error code, 不抛
 */

const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const FILE_NAME = "amap.bin";

function _configDir() {
  const base = (app && app.getPath) ? app.getPath("userData") : require("os").tmpdir();
  return path.join(base, "food_keys");
}

function _filePath() {
  return path.join(_configDir(), FILE_NAME);
}

async function _readEncrypted() {
  try {
    const buf = await fs.promises.readFile(_filePath());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(buf);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    return null;
  }
}

async function _writeEncrypted(key) {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: "safeStorage_unavailable" };
  }
  const enc = safeStorage.encryptString(key);
  await fs.promises.mkdir(_configDir(), { recursive: true });
  await fs.promises.writeFile(_filePath(), enc, { mode: 0o600 });
  return { ok: true };
}

async function getAmapKey() {
  return _readEncrypted();
}

async function hasAmapKey() {
  const k = await _readEncrypted();
  return typeof k === "string" && k.length > 0;
}

async function setAmapKey(key) {
  if (typeof key !== "string" || key.trim().length === 0) {
    return { ok: false, error: "empty_key" };
  }
  return _writeEncrypted(key.trim());
}

module.exports = { getAmapKey, hasAmapKey, setAmapKey, FILE_NAME };
