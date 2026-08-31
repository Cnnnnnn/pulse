"use strict";

/**
 * TMDB_API_KEY：密钥库 vault > 旧 prefs 明文（只读，自动迁移清除）> 进程环境变量 > 项目根 .env。
 * Electron `npm start` 不会自动加载 .env。
 * v2.83：key 迁入密钥库（safeStorage 加密，名 "tmdb"），prefs 明文字段首次加载时自动迁走并删除。
 */

import * as fs from "fs";
import * as path from "path";
import {
  getSecretValue,
  hasEntryNamed,
  setEntry,
  deleteEntryByName,
} from "../vault/secret-vault";

const VAULT_TMDB_NAME = "tmdb";

let loaded = false;
let cached = "";
let source: "vault" | "settings" | "env" | "" = "";

export function moviesPrefsPath(filePath?: string | null): string | null {
  if (filePath) return filePath;
  try {
    const electron = require("electron");
    const app = electron && electron.app;
    const base = app && typeof app.getPath === "function" ? app.getPath("userData") : null;
    return base ? path.join(base, "movies-prefs.json") : null;
  } catch {
    return null;
  }
}

function readPrefsKey(filePath: string | null): string {
  if (!filePath) return "";
  try {
    if (!fs.existsSync(filePath)) return "";
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const v = raw && typeof raw.tmdbApiKey === "string" ? raw.tmdbApiKey.trim() : "";
    return v;
  } catch {
    return "";
  }
}

function readDotenvKey(): string {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return "";
    const txt = fs.readFileSync(envPath, "utf8");
    for (const line of txt.split("\n")) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/^\s*TMDB_API_KEY\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** 从 movies-prefs.json 删除 tmdbApiKey 字段（迁移成功后的明文清理）。 */
function stripPrefsKey(filePath: string | null): void {
  if (!filePath) return;
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!raw || typeof raw !== "object" || !("tmdbApiKey" in raw)) return;
    delete raw.tmdbApiKey;
    fs.writeFileSync(filePath, JSON.stringify(raw));
  } catch {
    /* noop */
  }
}

/**
 * 一次性迁移：prefs 里有明文 tmdbApiKey 且密钥库没有 "tmdb" 条目 →
 * 写入密钥库并删除明文字段；密钥库不可用则保留明文不动（下次再试）。
 */
function migratePrefsKeyToVault(prefsPath: string | null): void {
  if (!prefsPath) return;
  const legacy = readPrefsKey(prefsPath);
  if (!legacy) return;
  if (hasEntryNamed(VAULT_TMDB_NAME)) {
    // 密钥库已有条目，旧明文是冗余副本，直接清除
    stripPrefsKey(prefsPath);
    return;
  }
  const res = setEntry({
    name: VAULT_TMDB_NAME,
    value: legacy,
    category: "内置功能",
    note: "TMDB API Key（自动迁移）",
  });
  if (res && res.ok) stripPrefsKey(prefsPath);
}

export function loadTmdbApiKey(prefsFile?: string | null): string {
  if (loaded && prefsFile == null) return cached;
  loaded = true;
  const prefsPath = moviesPrefsPath(prefsFile);
  migratePrefsKeyToVault(prefsPath);
  const fromVault = getSecretValue(VAULT_TMDB_NAME);
  if (fromVault) {
    cached = fromVault;
    source = "vault";
    return cached;
  }
  const fromPrefs = readPrefsKey(prefsPath);
  if (fromPrefs) {
    cached = fromPrefs;
    source = "settings";
    return cached;
  }
  const fromProc = String(process.env.TMDB_API_KEY || "").trim();
  if (fromProc) {
    cached = fromProc;
    source = "env";
    return cached;
  }
  const fromDot = readDotenvKey();
  if (fromDot) {
    cached = fromDot;
    source = "env";
    process.env.TMDB_API_KEY = fromDot;
    return cached;
  }
  cached = "";
  source = "";
  return cached;
}

export function getTmdbApiKeySource(): "vault" | "settings" | "env" | "" {
  if (!loaded) loadTmdbApiKey();
  return source;
}

/**
 * 写密钥库（名 "tmdb"）。空串 = 清除条目。
 * 密钥库不可用时拒绝保存（不落明文），返回空串。
 */
export function saveTmdbApiKey(key: string, prefsFile?: string | null): string {
  const next = String(key || "").trim();
  if (!next) {
    deleteEntryByName(VAULT_TMDB_NAME);
    stripPrefsKey(moviesPrefsPath(prefsFile));
    loaded = false;
    return "";
  }
  const res = setEntry({
    name: VAULT_TMDB_NAME,
    value: next,
    category: "内置功能",
    note: "TMDB API Key",
    upsert: true,
  });
  if (!res || !res.ok) {
    // no_safe_storage 等：拒绝明文落盘
    return "";
  }
  loaded = false;
  return next;
}

export function resetTmdbApiKeyCache(): void {
  loaded = false;
  cached = "";
  source = "";
}

module.exports = {
  loadTmdbApiKey,
  saveTmdbApiKey,
  getTmdbApiKeySource,
  moviesPrefsPath,
  resetTmdbApiKeyCache,
};
