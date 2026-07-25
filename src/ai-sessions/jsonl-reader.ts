/**
 * src/ai-sessions/jsonl-reader.ts
 *
 * cursor / codex JSONL 流式解析共用骨架.
 */

import fs from "fs";
import readline from "readline";

/**
 * @param {string} file
 * @param {(row: object) => void | false | Promise<void | false>} onRow
 *   返 false 可提前结束
 */
export async function parseJsonlFile(file: any, onRow: any) {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const stop = await onRow(row);
    if (stop === false) break;
  }
}

