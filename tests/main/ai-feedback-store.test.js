import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  recordFeedback,
  dedupeKey,
  pruneToCap,
} = require("../../src/main/ai-feedback-store");

describe("ai-feedback-store", () => {
  describe("dedupeKey", () => {
    it("同 feature+appName+version+ts 生成相同 key", () => {
      const base = { feature: "advice", appName: "VSCode", version: "2.1.0", ts: 1000 };
      expect(dedupeKey(base)).toBe("advice::VSCode::2.1.0::1000");
      expect(dedupeKey({ ...base, vote: "up" })).toBe(dedupeKey({ ...base, vote: "down" }));
    });
  });

  describe("recordFeedback", () => {
    it("空列表 + 新反馈 → 单条", () => {
      const out = recordFeedback([], { feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", ts: 100 });
      expect(out).toHaveLength(1);
      expect(out[0].id).toBe("advice::X::1::100");
      expect(out[0].vote).toBe("up");
    });

    it("unshift 到头部(最新在前)", () => {
      const list = [{ id: "old", ts: 50 }];
      const out = recordFeedback(list, { feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", ts: 100 });
      expect(out[0].ts).toBe(100);
      expect(out[1].ts).toBe(50);
    });

    it("同 dedupeKey 覆盖(用户改了 vote)", () => {
      const list = [{ id: "advice::X::1::100", feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "up", ts: 100 }];
      const out = recordFeedback(list, { feature: "advice", appName: "X", version: "1", rec: "upgrade", confidence: "high", vote: "down", ts: 100 });
      expect(out).toHaveLength(1);
      expect(out[0].vote).toBe("down");
    });

    it("缺失必填字段返回原列表(防御)", () => {
      const list = [{ id: "old", ts: 50 }];
      expect(recordFeedback(list, { feature: "advice", vote: "up", ts: 100 })).toBe(list);
      expect(recordFeedback(list, { appName: "X", vote: "up", ts: 100 })).toBe(list);
    });

    it("仅 implicit 信号(vote 缺)也能记录", () => {
      const out = recordFeedback([], { feature: "advice", appName: "X", version: "1", implicit: "refreshed", ts: 100 });
      expect(out).toHaveLength(1);
      expect(out[0].implicit).toBe("refreshed");
      expect(out[0].vote).toBeNull();
    });

    it("既无 vote 也无 implicit 拒绝", () => {
      const list = [{ id: "old", ts: 50 }];
      expect(recordFeedback(list, { feature: "advice", appName: "X", version: "1", ts: 100 })).toBe(list);
    });
  });

  describe("pruneToCap", () => {
    it("超过 cap 截断尾部", () => {
      // 模拟 recordFeedback 的真实输出: 最新(ts 大)在头部
      const list = Array.from({ length: 10 }, (_, i) => ({ id: `k${i}`, ts: 9 - i }));
      const out = pruneToCap(list, 5);
      expect(out).toHaveLength(5);
      expect(out[0].ts).toBe(9); // 头部仍是最新 ts 9
      expect(out[4].ts).toBe(5); // 截到 ts 5
    });

    it("未超 cap 不变", () => {
      const list = [{ id: "a" }, { id: "b" }];
      expect(pruneToCap(list, 5)).toBe(list);
    });
  });
});
