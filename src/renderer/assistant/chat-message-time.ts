/**
 * 消息时间格式化.
 */
export function formatMessageTime(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "";
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
