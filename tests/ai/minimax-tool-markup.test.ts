/**
 * tests/ai/minimax-tool-markup.test.ts
 *
 * MiniMax M2/M3 原生内联工具标记 (<minimax:tool_call>[...]</minimax:tool_call>)
 * 的提取 / 清洗 / 流式过滤. 背景: FC 续轮请求不带 tools 参数时, 模型把
 * 原生标记写进 content — 上游不处理会导致调用意图丢失 + 气泡乱码.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const { requireAi } = _require("../_setup/require-main.cjs");
const {
  extractMiniMaxToolCalls,
  stripMiniMaxToolMarkup,
  createMiniMaxDeltaFilter,
} = requireAi("minimax-tool-markup");

const BLOCK_ONE =
  '<minimax:tool_call>[{"name":"query_apps","arguments":{"filter":"pending"}}]</minimax:tool_call>';
const BLOCK_TWO =
  '<minimax:tool_call>[{"name":"global_search","arguments":{"q":"深圳电影"}}]</minimax:tool_call>';

describe("extractMiniMaxToolCalls", () => {
  it("提取单块 (数组形式)", () => {
    const actions = extractMiniMaxToolCalls(`我再试一次:${BLOCK_ONE}`);
    expect(actions).toEqual([
      { tool: "query_apps", params: { filter: "pending" } },
    ]);
  });

  it("提取多块 + 保留前后正文不动", () => {
    const text = `明细:${BLOCK_ONE}${BLOCK_TWO}完`;
    const actions = extractMiniMaxToolCalls(text);
    expect(actions.map((a: any) => a.tool)).toEqual([
      "query_apps",
      "global_search",
    ]);
  });

  it("单对象形式 (非数组) 也兼容", () => {
    const text =
      '<minimax:tool_call>{"name":"a","arguments":{"x":1}}</minimax:tool_call>';
    expect(extractMiniMaxToolCalls(text)).toEqual([
      { tool: "a", params: { x: 1 } },
    ]);
  });

  it("坏 JSON 跳过, 好的照常收", () => {
    const text = `<minimax:tool_call>[{broken}]</minimax:tool_call>${BLOCK_ONE}`;
    const actions = extractMiniMaxToolCalls(text);
    expect(actions).toEqual([
      { tool: "query_apps", params: { filter: "pending" } },
    ]);
  });

  it("无标记 → 空数组", () => {
    expect(extractMiniMaxToolCalls("普通回复 <action>{}</action>")).toEqual([]);
    expect(extractMiniMaxToolCalls("")).toEqual([]);
    expect(extractMiniMaxToolCalls(null)).toEqual([]);
  });
});

describe("stripMiniMaxToolMarkup", () => {
  it("移除完整块 (含 JSON payload)", () => {
    expect(stripMiniMaxToolMarkup(`明细:${BLOCK_ONE}`)).toBe("明细:");
  });

  it("移除杂散残片标记 (截图乱码形态)", () => {
    const text = ":]<minimax>[[]<minimax>[[]<minimax>[";
    expect(stripMiniMaxToolMarkup(text)).toBe(":][[][[][");
  });

  it("正常内容 (含 CJK / 合法 HTML 标签) 不动", () => {
    const text = "对比: 1 < 2 且 <b>加粗</b> 生效";
    expect(stripMiniMaxToolMarkup(text)).toBe(text);
  });

  it("空输入返回空串", () => {
    expect(stripMiniMaxToolMarkup("")).toBe("");
    expect(stripMiniMaxToolMarkup(null)).toBe("");
  });
});

describe("createMiniMaxDeltaFilter (流式)", () => {
  const feed = (chunks: string[]) => {
    const f = createMiniMaxDeltaFilter();
    let out = chunks.map((c) => f.push(c)).join("");
    out += f.flush();
    return out;
  };

  it("完整块跨 chunk 到达 → payload 与标记都不外泄", () => {
    const out = feed([
      "明细:",
      '<minimax:tool_',
      'call>[{"name":"query_apps"}]',
      "</minimax:tool_call>",
      "好的",
    ]);
    expect(out).toBe("明细:好的");
  });

  it("截图乱码形态 (杂散标记) 逐字流出也被滤掉", () => {
    const out = feed([":]<min", "imax>[[]<minimax>[[]<min", "imax>["]);
    expect(out).toBe(":][[][[][");
  });

  it("普通增量文本原样通过 (含 < 开头的比较符)", () => {
    const out = feed(["共 ", "13 ", "个应用", ", 1 < 2 吧"]);
    expect(out).toBe("共 13 个应用, 1 < 2 吧");
  });

  it("合法 HTML 标签不受影响", () => {
    const out = feed(["<b>加粗</b> 与 <i>斜体</i>"]);
    expect(out).toBe("<b>加粗</b> 与 <i>斜体</i>");
  });

  it("块后可继续正常流出 (状态机回归 normal)", () => {
    const out = feed([BLOCK_ONE, "后续", "正文"]);
    expect(out).toBe("后续正文");
  });

  it("flush 放行未决文本; in_block 残留 payload 不放行", () => {
    const f = createMiniMaxDeltaFilter();
    const emitted = f.push("abc < 9");
    expect(emitted + f.flush()).toBe("abc < 9");
    const g = createMiniMaxDeltaFilter();
    g.push('<minimax:tool_call>[{"payload":1}');
    expect(g.push("") + g.flush()).toBe("");
  });
});
