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
 * 有图像 → 返回 provider 兼容的 content array (支持单图与多图).
 */
export function buildUserContentWithImage(
  text: string,
  imageDataUrl: string | string[] | null | undefined,
  protocol: string,
): string | ContentPart[] {
  const list = Array.isArray(imageDataUrl)
    ? imageDataUrl.filter((u) => typeof u === "string" && u.length > 0)
    : typeof imageDataUrl === "string" && imageDataUrl
      ? [imageDataUrl]
      : [];
  if (list.length === 0) return text;

  const parts: ContentPart[] = [{ type: "text", text: text || "" }];
  for (const url of list) {
    if (protocol === "anthropic") {
      const parsed = parseDataUrl(url);
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
        image_url: { url },
      });
    }
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
 * 默认保留的带图历史轮数（含最新一轮）。
 * v1 为 1 轮；改为 2 轮以覆盖「这两张图对比一下」这类常见追问，
 * 同时避免图片 token 无限累积（图片 token 单价远高于文本）。
 */
export const DEFAULT_MAX_IMAGE_ROUNDS = 2;

/** 默认单轮最多送出的图片数 —— 修复「一次贴多张截图只发第一张」 */
export const DEFAULT_MAX_IMAGES_PER_ROUND = 3;

export type NormalizeMultimodalOpts = {
  maxImageRounds?: number;
  maxImagesPerRound?: number;
};

/**
 * 会话历史多模态归一化 — 在 agent 入口调用:
 *   - 最近 `maxImageRounds` 条带图 user 消息 → 按 provider 协议转 content 数组,
 *     每条最多 `maxImagesPerRound` 张图
 *   - 更早的带图轮次 → 降为纯文本占位（控制上下文体积 —— 图片 token 昂贵）
 *   - 其余消息 → content 归一为纯文本字符串
 *   - `protocol` 为 null（provider 不支持图像）→ 全部图片降为文本
 */
export function normalizeMultimodalHistory<T extends MultimodalMessage>(
  messages: T[],
  protocol: "openai" | "anthropic" | null,
  opts: NormalizeMultimodalOpts = {},
): T[] {
  const maxRounds = Math.max(
    1,
    Math.floor(opts.maxImageRounds ?? DEFAULT_MAX_IMAGE_ROUNDS),
  );
  const maxPerRound = Math.max(
    1,
    Math.floor(opts.maxImagesPerRound ?? DEFAULT_MAX_IMAGES_PER_ROUND),
  );

  const imageIdxs: number[] = [];
  messages.forEach((m, i) => {
    if (m?.role === "user" && attachmentsOf(m).length > 0) imageIdxs.push(i);
  });
  // 只保留最近 maxRounds 条带图消息
  const kept = new Set(imageIdxs.slice(-maxRounds));

  return messages.map((m, i) => {
    const text = textContentOf(m?.content);
    const imgs = m?.role === "user" ? attachmentsOf(m) : [];
    if (imgs.length === 0) {
      return { ...m, content: text } as T;
    }
    if (protocol && kept.has(i)) {
      return {
        ...m,
        content: buildUserContentWithImage(
          text,
          imgs.slice(0, maxPerRound),
          protocol,
        ),
      } as T;
    }
    return {
      ...m,
      content: text
        ? `${text}\n(该轮附加过 ${imgs.length} 张截图, 已省略)`
        : `(附加过 ${imgs.length} 张截图, 已省略)`,
    } as T;
  });
}

function attachmentsOf(m: MultimodalMessage): string[] {
  const list = Array.isArray(m?.attachments) ? m.attachments : [];
  return list
    .map((a) => (a && typeof a.dataUrl === "string" ? a.dataUrl : ""))
    .filter(Boolean);
}
