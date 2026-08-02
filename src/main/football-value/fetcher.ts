/**
 * src/main/football-value/fetcher.ts
 *
 * IO 层：调 parse.bot 的 get_top_market_values（Transfermarkt Top 身价榜，一次返 500 人）。
 * - API key 从 .env 读 PARSE_BOT_API_KEY（对齐 fetcher-aa.ts 的 .env loader 范式）
 * - 无 key / 请求失败 → throw reason，由上层（getBoard）决定兜底到 sample
 * - 不导入 electron；httpClient 由 register-football-value.ts 注入（唯一 electron 边界）
 */
"use strict";

import { parseTopPlayers } from "./parser";
import { BROWSER_UA } from "../../utils/http-constants";

export const API_URL =
  "https://api.parse.bot/scraper/2409cb57-5fc7-4e67-b750-07a9a68d7c70/get_top_market_values";
const DEFAULT_TIMEOUT_MS = 15000;

let _envLoaded = false;
let _key: string | undefined = undefined;

/**
 * 极简 .env 加载器（与 fetcher-aa loadAaKey 同款范式）：
 * 仅当进程尚未有 PARSE_BOT_API_KEY 时，从 process.cwd()/.env 读取。
 */
export function loadParseBotKey(): string | undefined {
  if (_envLoaded) return _key;
  _envLoaded = true;
  if (process.env.PARSE_BOT_API_KEY) {
    _key = process.env.PARSE_BOT_API_KEY;
    return _key;
  }
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return _key;
    const txt = fs.readFileSync(envPath, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*PARSE_BOT_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) {
        let v = m[1].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (v) {
          _key = v;
          break;
        }
      }
    }
  } catch {
    /* 忽略 */
  }
  return _key;
}

/**
 * 拉取 Top 身价榜。成功返回 { players, fetchedAt, source }；
 * 无 key / 失败 throw { reason, message }。
 * @param args { httpClient, timeoutMs, apiKey }
 * @returns {Promise<{players:object[], fetchedAt:number, source:string}>}
 */
export async function fetchTopPlayers({
  httpClient,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  apiKey,
}: any = {}): Promise<any> {
  const key = apiKey || loadParseBotKey();
  if (!key) {
    throw withReason("no_api_key", "PARSE_BOT_API_KEY missing in .env");
  }
  if (!httpClient || typeof httpClient.get !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }

  const res = await httpClient.get(API_URL, {
    timeout: timeoutMs,
    headers: {
      "User-Agent": BROWSER_UA,
      "X-API-Key": key,
      accept: "application/json",
    },
  });
  if (res && (res.error === "timeout" || res.error === "network")) {
    throw withReason("http_timeout", `parse.bot ${res.error}`);
  }
  if (
    !res ||
    typeof res.status !== "number" ||
    res.status < 200 ||
    res.status >= 300
  ) {
    throw withReason("fetch_failed", `parse.bot status=${res && res.status}`);
  }
  let raw: any;
  try {
    raw = JSON.parse(res.body);
  } catch {
    throw withReason("parse_failed", "parse.bot json parse threw");
  }
  const parsed = parseTopPlayers(raw);
  if (!parsed.ok) {
    throw withReason("parse_failed", "parse.bot players empty");
  }
  return {
    players: parsed.players,
    fetchedAt: Date.now(),
    source: "parse.bot",
  };
}

function withReason(reason: string, msg: string): Error {
  const err: any = new Error(`football-value: ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

module.exports = { fetchTopPlayers, loadParseBotKey, API_URL };
