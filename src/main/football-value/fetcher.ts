/**
 * src/main/football-value/fetcher.ts
 *
 * IO 层：从 dcaribou/transfermarkt-datasets 的 Cloudflare R2 CDN 拉两份 CSV.gz：
 *   - player_valuations.csv.gz（全球员身价历史）
 *   - players.csv.gz（全球员档案）
 * 由 parser.ts 做 gunzip + join + 取每人最新身价 + 排序。
 *
 * 无 key、无配额、无 WAF（R2 公开 CDN）。数据集 GitHub Actions 自动更新
 * （dcaribou/transfermarkt-datasets，168★），几乎实时新鲜度。
 *
 * 不导入 electron；httpClient 由 register-football-value.ts 注入（唯一 electron 边界）。
 */
"use strict";

import { BROWSER_UA } from "../../utils/http-constants";

/** R2 CDN base（dcaribou/transfermarkt-datasets 公开托管）。 */
export const CDN_BASE =
  "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data";
export const VALUATIONS_URL = `${CDN_BASE}/player_valuations.csv.gz`;
export const PLAYERS_URL = `${CDN_BASE}/players.csv.gz`;
const DEFAULT_TIMEOUT_MS = 30000; // gz 文件较大（5.7MB + 4.1MB），放宽超时

/**
 * 拉取 dcaribou R2 两份 CSV.gz。
 * 成功返回 { valuationsCsvGz, playersCsvGz, fetchedAt, source }；
 * 失败 throw { reason, message }。
 * @param args { httpClient, timeoutMs }
 * @returns {Promise<{valuationsCsvGz:Buffer, playersCsvGz:Buffer, fetchedAt:number, source:string}>}
 */
export async function fetchTopPlayers({
  httpClient,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: any = {}): Promise<any> {
  if (!httpClient || typeof httpClient.get !== "function") {
    throw withReason("fetch_failed", "httpClient missing");
  }

  // 并行拉两份 gz（binary:true 返回 Buffer，不损坏二进制；maxBodyBytes 调高容纳 gz）
  const [valRes, plaRes] = await Promise.all([
    httpClient.get(VALUATIONS_URL, {
      timeout: timeoutMs,
      headers: { "User-Agent": BROWSER_UA, accept: "*/*" },
      binary: true,
      maxBodyBytes: 10 * 1024 * 1024, // valuations.gz ~5.7MB
    }),
    httpClient.get(PLAYERS_URL, {
      timeout: timeoutMs,
      headers: { "User-Agent": BROWSER_UA, accept: "*/*" },
      binary: true,
      maxBodyBytes: 10 * 1024 * 1024, // players.gz ~4.1MB
    }),
  ]);

  for (const [name, res] of [["valuations", valRes], ["players", plaRes]]) {
    if (res && (res.error === "timeout" || res.error === "network")) {
      throw withReason("http_timeout", `R2 ${name} ${res.error}`);
    }
    if (
      !res ||
      typeof res.status !== "number" ||
      res.status < 200 ||
      res.status >= 300
    ) {
      throw withReason("fetch_failed", `R2 ${name} status=${res && res.status}`);
    }
  }

  return {
    valuationsCsvGz: valRes.body, // Buffer（binary:true）
    playersCsvGz: plaRes.body,
    fetchedAt: Date.now(),
    source: "dcaribou-r2",
  };
}

function withReason(reason: string, msg: string): Error {
  const err: any = new Error(`football-value: ${reason}: ${msg}`);
  err.reason = reason;
  return err;
}

module.exports = { fetchTopPlayers, CDN_BASE, VALUATIONS_URL, PLAYERS_URL };
