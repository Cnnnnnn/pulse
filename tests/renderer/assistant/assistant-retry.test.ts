// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../../src/renderer/api.ts";
import {
  activeThreadId,
  chatError,
  chatLoading,
  chatMessages,
  chatPendingImage,
  chatRetryText,
  chatThreads,
  retryLastMessage,
  sendChatMessage,
} from "../../../src/renderer/assistant/assistant-store.ts";

vi.mock("../../../src/renderer/api.ts", () => ({ api: { aiChat: vi.fn() } }));
vi.mock("../../../src/renderer/store/ai-store.ts", () => ({
  needsConfig: () => false,
  isAiReadyLocal: () => true,
}));

afterEach(() => {
  chatMessages.value = [];
  chatThreads.value = [];
  activeThreadId.value = null;
  chatPendingImage.value = null;
  chatError.value = null;
  chatRetryText.value = null;
  chatLoading.value = false;
  localStorage.clear();
  vi.clearAllMocks();
});

it("retries a failed send without duplicating the user message or losing its attachment", async () => {
  const attachments = [{ dataUrl: "data:image/png;base64,dGVzdA==" }];
  vi.mocked(api.aiChat)
    .mockResolvedValueOnce({ ok: false, reason: "network" })
    .mockResolvedValueOnce({ ok: true, text: "Retry succeeded" });
  chatPendingImage.value = attachments[0].dataUrl;

  await sendChatMessage("Describe this image");

  expect(chatError.value).toBeTruthy();
  expect(chatLoading.value).toBe(false);
  expect(chatMessages.value).toHaveLength(1);
  expect(chatMessages.value[0]).toMatchObject({
    role: "user", content: "Describe this image", attachments,
  });
  const originalUserMessage = chatMessages.value[0];
  expect(chatPendingImage.value).toBeNull();

  await retryLastMessage();

  expect(chatMessages.value.filter((m) => m.role === "user")).toEqual([originalUserMessage]);
  expect(api.aiChat).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.aiChat).mock.calls[1][0].messages).toEqual([
    { role: "user", content: "Describe this image", attachments },
  ]);
  expect(chatMessages.value).toHaveLength(2);
  expect(chatMessages.value[1]).toMatchObject({ role: "assistant", content: "Retry succeeded" });
  expect(chatError.value).toBeNull();
  expect(chatRetryText.value).toBeNull();
  expect(chatLoading.value).toBe(false);
});
