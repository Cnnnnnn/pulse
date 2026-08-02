/**
 * src/main/football-value/sample.ts
 *
 * 兜底：当 parse.bot 无 key / 请求失败时，用内置 sample 填充，保证 UI 不空白。
 * 每条 source:'sample'（renderer 显示"示例"徽标）。
 *
 * 数据是 2026-08 的贴近真实快照（Transfermarkt 口径，整数欧元），仅用于演示与布局，非实时。
 */
"use strict";

import * as fs from "fs";
import * as path from "path";
import { toPlayer } from "./types";

export const SAMPLE_PATH = path.join(__dirname, "sample.json");

let _cache: any[] | null = null;

/**
 * 读取内置 sample，返回 Player[]（统一标 isSample:true）。
 * @returns {object[]}
 */
export function getSamplePlayers(): any[] {
  if (_cache) return _cache;
  let raw: any[] = [];
  try {
    const txt = fs.readFileSync(SAMPLE_PATH, "utf8");
    const parsed = JSON.parse(txt);
    raw = Array.isArray(parsed) ? parsed : [];
  } catch {
    raw = [];
  }
  _cache = raw.map((p: any) => toPlayer({ ...p, isSample: true }));
  return _cache;
}

module.exports = { getSamplePlayers, SAMPLE_PATH };
