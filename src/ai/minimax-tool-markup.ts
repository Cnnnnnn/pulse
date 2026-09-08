/**
 * src/ai/minimax-tool-markup.ts
 *
 * MiniMax M2/M3 原生内联工具调用标记的清洗 + 解析.
 *
 * 背景: 带 tools 参数的 FC 请求, MiniMax API 会把工具调用放进协议层
 * tool_calls 字段; 但续轮请求不带 tools 参数时, 模型会退回原生格式,
 * 把 <minimax:tool_call>[{...}]</minimax:tool_call> 直接写进 content.
 * 上游不解析这个标记 → 调用意图丢失 + 原始标记漏进聊天气泡.
 */

import type { AssistantAction } from "./assistant-prompt";

export const MINIMAX_TOOL_BLOCK_RE = /<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi;
// 杂散标记: <minimax:tool_call> / </minimax:tool_call> / <minimax> 等残片
export const MINIMAX_TAG_RE = /<\/?minimax(?::[a-z_]+)?>/gi;

/**
 * 从 content 里提取原生格式的工具调用 (每块 JSON 数组, 兼容单对象).
 * 坏 JSON 静默跳过 — 跟 parseAssistantActions 对 <action> 的容错一致.
 */
export function extractMiniMaxToolCalls(text: any): AssistantAction[] {
  const out: AssistantAction[] = [];
  if (!text || typeof text !== "string") return out;
  const re = /<minimax:tool_call>([\s\S]*?)<\/minimax:tool_call>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      for (const row of rows) {
        if (row && typeof row.name === "string" && row.name) {
          out.push({
            tool: row.name,
            params:
              row.arguments && typeof row.arguments === "object"
                ? row.arguments
                : {},
          });
        }
      }
    } catch {
      /* ponytail: 模型偶发坏 JSON, 跳过 */
    }
  }
  return out;
}

/** 移除完整标记块 + 杂散标记残片, 返回可展示文本. */
export function stripMiniMaxToolMarkup(text: any): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(MINIMAX_TOOL_BLOCK_RE, "").replace(MINIMAX_TAG_RE, "");
}

// 流式过滤: 半截 tag 最长 28 字符 (</minimax:tool_call> = 20) 内缓冲判定
const MAX_TAG_LEN = "</minimax:tool_call>".length + 8;
const OPEN_TAG_RE = /^<minimax:tool_call>$/i;
const ANY_MINIMAX_TAG_RE = /^<\/?minimax(?::[a-z_]+)?>$/i;
const CLOSE_TAG_SRC = "</minimax:tool_call>";

export type MiniMaxDeltaFilter = {
  push: (delta: string) => string;
  /** 流结束兜底: 放行 normal 态缓冲的未决文本; in_block 残留 payload 丢弃 */
  flush: () => string;
};

/**
 * 流式 delta 过滤器 — 边流边滤掉标记块 (含 JSON payload) 和杂散标记,
 * 聊天气泡不出现中间态乱码. 块边界跨 chunk 时缓冲半截 tag 判定.
 *
 * 用法: const f = createMiniMaxDeltaFilter();
 *       onDelta(d) → const clean = f.push(d); clean && send(clean);
 *       流结束后 const tail = f.flush(); tail && send(tail);
 */
export function createMiniMaxDeltaFilter(): MiniMaxDeltaFilter {
  let inBlock = false;
  let buf = "";

  const push = (delta: string): string => {
    let out = "";
    buf += delta;
    for (;;) {
      if (inBlock) {
        const lower = buf.toLowerCase();
        const closeIdx = lower.indexOf(CLOSE_TAG_SRC);
        if (closeIdx !== -1) {
          buf = buf.slice(closeIdx + CLOSE_TAG_SRC.length);
          inBlock = false;
          continue;
        }
        const lt = buf.lastIndexOf("<");
        if (lt === -1) {
          buf = ""; // 纯 payload, 全部抑制
          break;
        }
        const tail = buf.slice(lt);
        // 短且无 > → 可能是跨 chunk 的半截 close tag, 留到下个 delta;
        // 否则该 < 不可能长成 close tag → 连同 payload 一起丢弃
        if (tail.indexOf(">") === -1 && tail.length <= MAX_TAG_LEN) {
          buf = tail;
        } else {
          buf = "";
        }
        break;
      }
      const lt = buf.indexOf("<");
      if (lt === -1) {
        out += buf;
        buf = "";
        break;
      }
      out += buf.slice(0, lt);
      buf = buf.slice(lt);
      const gt = buf.indexOf(">");
      if (gt === -1) {
        if (buf.length > MAX_TAG_LEN) {
          // 不可能再长成 minimax 标记 → 当普通文本放行 (e.g. "1 < 2")
          out += buf;
          buf = "";
        }
        break; // 半截 tag 候选, 缓冲到下个 delta
      }
      const tag = buf.slice(0, gt + 1);
      buf = buf.slice(gt + 1);
      if (OPEN_TAG_RE.test(tag)) {
        inBlock = true;
        continue;
      }
      if (ANY_MINIMAX_TAG_RE.test(tag)) {
        continue; // 杂散残片 → 丢弃
      }
      out += tag; // 非 minimax 的标签/文本 (e.g. <b>, "a < b") 原样放行
    }
    return out;
  };

  const flush = (): string => {
    const out = !inBlock && buf ? buf : "";
    buf = "";
    inBlock = false;
    return out;
  };

  return { push, flush };
}
