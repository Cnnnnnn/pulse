/**
 * 个股诊断历史快照 — 纯函数模块, localStorage 持久化.
 *
 * ponytail: 2026-07-07 — 同一只股票最近一次诊断的快照 (overall + 5 维分 + 价格),
 * 用于诊断页 hero 区 "上次诊断" 徽标跨次对比.
 * 不存 perAngle 全量 (几十 KB / 只), 只存评分摘要 (<200 字节 / 只).
 *
 * 安全:
 *   - localStorage 不可用 / 抛错 → 内存 fallback, 至少本次会话能用.
 *   - 损坏 / schema 不匹配 → 视作空 history, 不抛.
 *   - 同一只股票 5 分钟内重复保存 → 跳过 (避免连点 10 次把 history 写脏).
 */
const STORAGE_KEY = "pulse.stock.diagnosis-history.v1";
const SCHEMA_VERSION = 1;
const DEDUPE_MS = 5 * 60 * 1000;

const _memoryFallback = new Map();

function safeRead() {
  try {
    if (typeof globalThis.localStorage === "undefined")
      return _memoryFallback.get(STORAGE_KEY) ?? null;
    return globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    return _memoryFallback.get(STORAGE_KEY) ?? null;
  }
}

function safeWrite(raw) {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      _memoryFallback.set(STORAGE_KEY, raw);
      return;
    }
    globalThis.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    _memoryFallback.set(STORAGE_KEY, raw);
  }
}

function emptyStore() {
  return { version: SCHEMA_VERSION, entries: {} };
}

function loadStore() {
  const raw = safeRead();
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== SCHEMA_VERSION
    ) {
      return emptyStore();
    }
    if (!parsed.entries || typeof parsed.entries !== "object") {
      return emptyStore();
    }
    return parsed;
  } catch {
    return emptyStore();
  }
}

export function loadLastSnapshot(code) {
  if (!code) return null;
  const store = loadStore();
  return store.entries[code] || null;
}

export function saveSnapshot(code, snapshot) {
  if (!code || !snapshot || typeof snapshot.overall !== "number") return false;
  // 同一只股票 5 分钟内不重复写 — 避免用户连点 / 自动重拉时刷掉 history.
  const prev = loadLastSnapshot(code);
  if (prev && Date.now() - (prev.savedAt || 0) < DEDUPE_MS) return false;
  const store = loadStore();
  store.entries[code] = {
    savedAt: Date.now(),
    overall: snapshot.overall,
    dimensions: snapshot.dimensions || {},
    price: snapshot.price ?? null,
    signal: snapshot.signal ?? null,
  };
  safeWrite(JSON.stringify(store));
  return true;
}
