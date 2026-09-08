/**
 * src/ai/multimodal.ts
 *
 * P3-13: 多模态消息构造 — 把「文本 + 图像」组装成 provider 兼容的 content.
 *
 * - OpenAI 兼容 (openai/deepseek/minimax/glm): content array 含 {type:"image_url"}
 * - Anthropic: content array 含 {type:"image", source:{type:"base64",...}}
 *
 * 纯函数 + 无 Node 依赖, 供 renderer/主进程共用.
 */

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/** 从 data URL 提取 media_type + base64 */
export function parseDataUrl(
  dataUrl: string,
): { mediaType: string; base64: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1], base64: m[2] };
}

/**
 * 构造带图像的 user 消息 content.
 * 无图像 → 返回纯文本 (兼容现有 string content).
 * 有图像 → 返回 provider 兼容的 content array.
 */
export function buildUserContentWithImage(
  text: string,
  imageDataUrl: string | null | undefined,
  protocol: string,
): string | ContentPart[] {
  if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl) {
    return text;
  }
  const parts: ContentPart[] = [{ type: "text", text: text || "" }];
  if (protocol === "anthropic") {
    const parsed = parseDataUrl(imageDataUrl);
    if (parsed) {
      parts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: parsed.mediaType,
          data: parsed.base64,
        },
      });
    }
  } else {
    // openai 兼容
    parts.push({
      type: "image_url",
      image_url: { url: imageDataUrl },
    });
  }
  return parts;
}

/** 判断 provider 是否支持图像输入 (多模态) */
export function providerSupportsImage(providerId: string): boolean {
  return providerId === "openai" || providerId === "anthropic";
}

/** 从 string | ContentPart[] 形态的 content 里提取纯文本 (数组形态只取 text part) */
export function textContentOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) =>
        p && p.type === "text" && typeof p.text === "string" ? p.text : "",
      )
      .join("")
      .trim();
  }
  return "";
}

type MultimodalMessage = {
  role: string;
  content: unknown;
  attachments?: Array<{ dataUrl?: unknown }>;
};

/**
 * 会话历史多模态归一化 — 在 agent 入口调用:
 *   - 最后一条带图 user 消息 → 按 provider 协议转 content 数组 (送 LLM)
 *   - 更早的带图轮次 → 降为纯文本 (v1 只保留最近一张图, 控制上下文体积)
 *   - 其余消息 → content 归一为纯文本字符串
 */
export function normalizeMultimodalHistory<T extends MultimodalMessage>(
  messages: T[],
  protocol: "openai" | "anthropic" | null,
): T[] {
  let lastImageIdx = -1;
  messages.forEach((m, i) => {
    if (m?.role === "user" && attachmentsOf(m).length > 0) lastImageIdx = i;
  });
  return messages.map((m, i) => {
    const text = textContentOf(m?.content);
    const imgs = m?.role === "user" ? attachmentsOf(m) : [];
    if (imgs.length === 0) {
      return { ...m, content: text } as T;
    }
    if (protocol && i === lastImageIdx) {
      return {
        ...m,
        content: buildUserContentWithImage(text, imgs[0], protocol),
      } as T;
    }
    return {
      ...m,
      content: text ? `${text}\n(该轮附加过截图, 已省略)` : "(附加过截图, 已省略)",
    } as T;
  });
}

function attachmentsOf(m: MultimodalMessage): string[] {
  const list = Array.isArray(m?.attachments) ? m.attachments : [];
  return list
    .map((a) => (a && typeof a.dataUrl === "string" ? a.dataUrl : ""))
    .filter(Boolean);
}
