/**
 * tests/ai-usage/normalize-glm.test.js
 *
 * z.ai /api/monitor/usage/quota/limit 响应 normalize 测试.
 * 至少 4 case: 完整 / 老 schema 单 TOKENS_LIMIT / TIME_LIMIT 缺失 / 三块齐全.
 */

import { describe, test, expect } from "vitest";
const {
  normalizeGlm,
  _findLimit,
  _buildWindow,
} = require("../../src/ai-usage/normalize-glm");

describe("normalizeGlm — 完整响应 (5h + weekly + MCP)", () => {
  const fetchedAt = 1718400000000;
  const raw = {
    code: 200,
    msg: "操作成功",
    success: true,
    data: {
      level: "pro",
      limits: [
        {
          type: "TOKENS_LIMIT",
          unit: 3,
          number: 5,
          usage: 800000000,
          currentValue: 127694464,
          remaining: 672305536,
          percentage: 15,
          nextResetTime: 1770648402389,
        },
        {
          type: "TOKENS_LIMIT",
          unit: 6,
          number: 7,
          usage: 5600000000,
          currentValue: 890000000,
          remaining: 4710000000,
          percentage: 16,
          nextResetTime: 1771100000000,
        },
        {
          type: "TIME_LIMIT",
          usage: 4000,
          currentValue: 1828,
          remaining: 2172,
          percentage: 45,
          usageDetails: [],
        },
      ],
    },
  };

  test("返回 ok=true + provider=glm", () => {
    const r = normalizeGlm(raw, { fetchedAt });
    expect(r.ok).toBe(true);
    expect(r.snapshot.provider).toBe("glm");
  });

  test("level 字段保留 (pro/lite/max)", () => {
    const r = normalizeGlm(raw, { fetchedAt });
    expect(r.snapshot.level).toBe("pro");
  });

  test("5h 窗口: total/remaining/percentage/resetAt 都正确", () => {
    const r = normalizeGlm(raw, { fetchedAt });
    const w5h = r.snapshot.windows["5h"];
    expect(w5h).not.toBeNull();
    expect(w5h.total).toBe(800000000);
    expect(w5h.remaining).toBe(672305536);
    expect(w5h.used).toBe(127694464);
    expect(w5h.usedPercent).toBe(15);
    expect(w5h.resetAt).toBe(1770648402389);
    expect(w5h.label).toBe("5 小时滚动窗口");
  });

  test("weekly 窗口", () => {
    const r = normalizeGlm(raw, { fetchedAt });
    const w = r.snapshot.windows.weekly;
    expect(w).not.toBeNull();
    expect(w.total).toBe(5600000000);
    expect(w.remaining).toBe(4710000000);
    expect(w.usedPercent).toBe(16);
    expect(w.resetAt).toBe(1771100000000);
  });

  test("MCP 时长窗口", () => {
    const r = normalizeGlm(raw, { fetchedAt });
    const w = r.snapshot.windows.mcp;
    expect(w).not.toBeNull();
    expect(w.total).toBe(4000);
    expect(w.remaining).toBe(2172);
    expect(w.usedPercent).toBe(45);
    expect(w.label).toBe("MCP 时长");
  });

  test("REGRESSION: weekly 不卡 number (真实 API pro 套餐返回 number:1, 非 number:7)", () => {
    // 真实 z.ai API 响应: weekly 块的 number 会随套餐/版本变 (文档 number:7, 实际 pro=number:1).
    // 之前硬编码 number:7 导致 weekly 取不到 → UI 显示"本窗口数据暂不可用".
    const realResp = {
      code: 200, success: true,
      data: {
        level: "pro",
        limits: [
          { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 29, nextResetTime: 1781533121989 },
          { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 25, nextResetTime: 1782093627997 },
          { type: "TIME_LIMIT", unit: 5, number: 1, usage: 1000, remaining: 999, percentage: 1 },
        ],
      },
    };
    const r = normalizeGlm(realResp, { fetchedAt });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows.weekly).not.toBeNull();
    expect(r.snapshot.windows.weekly.usedPercent).toBe(25);
    expect(r.snapshot.windows.weekly.label).toBe("周窗口");
  });

  test("resetInSec 由 nextResetTime - fetchedAt 计算", () => {
    const r = normalizeGlm(raw, { fetchedAt });
    const w5h = r.snapshot.windows["5h"];
    const expectedSec = Math.round((1770648402389 - fetchedAt) / 1000);
    expect(w5h.resetInSec).toBe(expectedSec);
  });
});

describe("normalizeGlm — 老 schema / 字段缺失", () => {
  test("老 schema: 只有一个 TOKENS_LIMIT (无 unit/number 区分), 仍能取到 5h", () => {
    const raw = {
      code: 200,
      success: true,
      data: {
        level: "lite",
        limits: [
          {
            type: "TOKENS_LIMIT",
            unit: 3,
            number: 5,
            usage: 100000000,
            remaining: 50000000,
            percentage: 50,
          },
        ],
      },
    };
    const r = normalizeGlm(raw, { fetchedAt: 1000 });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows["5h"]).not.toBeNull();
    expect(r.snapshot.windows["5h"].total).toBe(100000000);
    expect(r.snapshot.windows.weekly).toBeNull();
    expect(r.snapshot.windows.mcp).toBeUndefined();
  });

  test("TIME_LIMIT 缺失 → 不挂 mcp 窗口 (而非 null)", () => {
    const raw = {
      code: 200,
      success: true,
      data: {
        level: "pro",
        limits: [
          {
            type: "TOKENS_LIMIT",
            unit: 3,
            number: 5,
            usage: 100,
            remaining: 50,
            percentage: 50,
          },
          {
            type: "TOKENS_LIMIT",
            unit: 6,
            number: 7,
            usage: 700,
            remaining: 350,
            percentage: 50,
          },
        ],
      },
    };
    const r = normalizeGlm(raw, { fetchedAt: 1000 });
    expect(r.ok).toBe(true);
    expect(r.snapshot.windows.mcp).toBeUndefined();
  });

  test("success=false → ok:false, error=msg", () => {
    const raw = { code: 401, msg: "unauthorized", success: false, data: null };
    const r = normalizeGlm(raw, { fetchedAt: 1000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("api_error");
    expect(r.error).toBe("unauthorized");
  });

  test("data 缺失 → ok:false", () => {
    const raw = { code: 200, success: true };
    const r = normalizeGlm(raw, { fetchedAt: 1000 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("data_missing");
  });

  test("response 不是 object → ok:false", () => {
    const r = normalizeGlm(null, { fetchedAt: 1000 });
    expect(r.ok).toBe(false);
  });
});

describe("_findLimit", () => {
  const limits = [
    { type: "TOKENS_LIMIT", unit: 3, number: 5 },
    { type: "TOKENS_LIMIT", unit: 6, number: 7 },
    { type: "TIME_LIMIT" },
  ];

  test("按 type + unit + number 精确匹配", () => {
    expect(
      _findLimit(limits, { type: "TOKENS_LIMIT", unit: 3, number: 5 }),
    ).toBe(limits[0]);
    expect(
      _findLimit(limits, { type: "TOKENS_LIMIT", unit: 6, number: 7 }),
    ).toBe(limits[1]);
  });

  test("仅按 type 匹配 (无 unit/number 要求)", () => {
    expect(_findLimit(limits, { type: "TIME_LIMIT" })).toBe(limits[2]);
  });

  test("找不到返 null", () => {
    expect(_findLimit(limits, { type: "UNKNOWN" })).toBeNull();
    expect(_findLimit([], { type: "TOKENS_LIMIT" })).toBeNull();
    expect(_findLimit(null, { type: "TOKENS_LIMIT" })).toBeNull();
  });
});

describe("_buildWindow — 边界", () => {
  test("所有字段为 null → 返 null", () => {
    const w = _buildWindow({
      total: null,
      remaining: null,
      usedPercent: null,
      resetAt: null,
      label: "",
      fetchedAt: 0,
    });
    expect(w).toBeNull();
  });

  test("percentage 超出 100 截断", () => {
    const w = _buildWindow({
      total: null,
      remaining: null,
      usedPercent: 150,
      resetAt: null,
      label: "",
      fetchedAt: 0,
    });
    expect(w.usedPercent).toBe(100);
  });
});
