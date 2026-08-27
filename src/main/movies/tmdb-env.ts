"use strict";

/**
 * TMDB_API_KEY：设置页落盘 > 进程环境变量 > 项目根 .env。
 * Electron `npm start` 不会自动加载 .env。
 */

import * as fs from "fs";
import * as path from "path";

let loaded = false;
let cached = "";
let source: "settings" | "env" | "" = "";

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

function writePrefsKey(filePath: string | null, key: string): void {
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let prev: any = {};
    try {
      if (fs.existsSync(filePath)) prev = JSON.parse(fs.readFileSync(filePath, "utf8")) || {};
    } catch {
      prev = {};
    }
    prev.tmdbApiKey = key;
    fs.writeFileSync(filePath, JSON.stringify(prev));
  } catch {
    /* noop */
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

export function loadTmdbApiKey(prefsFile?: string | null): string {
  if (loaded && prefsFile == null) return cached;
  loaded = true;
  const fromPrefs = readPrefsKey(moviesPrefsPath(prefsFile));
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

export function getTmdbApiKeySource(): "settings" | "env" | "" {
  if (!loaded) loadTmdbApiKey();
  return source;
}

export function saveTmdbApiKey(key: string, prefsFile?: string | null): string {
  const next = String(key || "").trim();
  writePrefsKey(moviesPrefsPath(prefsFile), next);
  loaded = false;
  return loadTmdbApiKey(prefsFile);
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
