/**
 * tests/main/finance/finance-files-ai.test.ts
 *
 * 财经 AI 解读 sidecar（finance_ai.json）隔离验证：
 *   - 路径与 state.json 同目录，且不进入 state.json（避开 PRESERVE_FIELDS 静默丢弃）
 *   - readAiState / writeAiState 往返一致
 *   - 每个用例用独立子目录，避免 os.tmpdir 根共享同一文件互相污染
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { mkdirSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

const _require = createRequire(import.meta.url);
const { requireMain } = _require("../../_setup/require-main.cjs");
const { aiFilePath, readAiState, writeAiState } = requireMain(
  "finance/finance-files",
);

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-fin-ai-fs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

describe("finance AI sidecar (finance_ai.json)", () => {
  it("aiFilePath 与 state.json 同目录，且独立于 state.json", () => {
    const sp = tmpStatePath();
    const ai = aiFilePath(sp);
    expect(dirname(ai)).toBe(dirname(sp));
    expect(ai).not.toBe(sp);
    expect(ai.endsWith("finance_ai.json")).toBe(true);
  });

  it("writeAiState / readAiState 往返一致", () => {
    const sp = tmpStatePath();
    const state = { "news-1": { id: "news-1", summary: "x", contentHash: "abc" } };
    writeAiState(state, sp);
    expect(readAiState(sp)).toEqual(state);
  });

  it("readAiState 无文件 → 返回空对象（不污染 state.json）", () => {
    const sp = tmpStatePath();
    expect(readAiState(sp)).toEqual({});
  });

  it("两个独立子目录互不污染（隔离）", () => {
    const a = tmpStatePath();
    const b = tmpStatePath();
    writeAiState({ "news-a": { id: "news-a" } }, a);
    writeAiState({ "news-b": { id: "news-b" } }, b);
    expect(readAiState(a)).toEqual({ "news-a": { id: "news-a" } });
    expect(readAiState(b)).toEqual({ "news-b": { id: "news-b" } });
  });

  it("写入 AI 状态不会在 state.json 留下 financial_news / finance_ai 键", () => {
    const sp = tmpStatePath();
    writeAiState({ "news-1": { id: "news-1" } }, sp);
    // sidecar 文件应已生成
    expect(existsSync(aiFilePath(sp))).toBe(true);
    // state.json 可能不存在（未被触碰）；如存在也不应含财经键
    if (existsSync(sp)) {
      const raw = JSON.parse(readFileSync(sp, "utf-8"));
      expect(raw.financial_news).toBeUndefined();
      expect(raw.finance_ai).toBeUndefined();
    }
  });
});
