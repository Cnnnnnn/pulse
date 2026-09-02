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
