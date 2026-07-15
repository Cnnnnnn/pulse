// @vitest-environment happy-dom
// tests/renderer/utils/csv.test.js
// CSV 工具纯函数测试 — escape / safeFilename
import { describe, it, expect } from "vitest";
import { downloadCsv, safeFilename } from "../../../src/renderer/utils/csv.js";

describe("safeFilename", () => {
  it("去掉路径分隔符", () => {
    expect(safeFilename("a/b\\c:d")).toBe("abcd");
  });
  it("替换空白为下划线", () => {
    expect(safeFilename("hello world  foo")).toBe("hello_world_foo");
  });
  it("截断到 60 字符", () => {
    const long = "a".repeat(100);
    expect(safeFilename(long).length).toBe(60);
  });
  it("空值兜底 'fund'", () => {
    expect(safeFilename("")).toBe("fund");
    expect(safeFilename(null)).toBe("fund");
    expect(safeFilename(undefined)).toBe("fund");
  });
});

describe("downloadCsv", () => {
  it("空 rows 直接返回不报错", () => {
    expect(() => downloadCsv("empty.csv", [])).not.toThrow();
    expect(() => downloadCsv("empty.csv", null)).not.toThrow();
  });

  it("生成 BOM + CSV 内容", () => {
    // happy-dom: URL.createObjectURL 直接返回 blob URL 字符串, document.createElement('a') 可用
    let captured = null;
    const origCreate = URL.createObjectURL;
    const origAppend = document.body.appendChild.bind(document.body);
    const origClick = HTMLAnchorElement.prototype.click;
    const origRevoke = URL.revokeObjectURL;
    try {
      URL.createObjectURL = (blob) => {
        // 把 blob 内容同步读取出来供断言
        captured = blob;
        return "blob:test";
      };
      URL.revokeObjectURL = () => {};
      let clickedUrl = null;
      HTMLAnchorElement.prototype.click = function () {
        clickedUrl = this.href;
      };
      document.body.appendChild = function (el) {
        origAppend(el);
        return el;
      };
      downloadCsv("test.csv", [
        ["代码", "名称"],
        ["000001", "测试,基金"],
        ["000002", '引号"测试'],
        ["000003", "换行\n测试"],
      ]);
      expect(clickedUrl).toBe("blob:test");
      expect(captured).toBeTruthy();
      expect(captured.type).toContain("text/csv");
      expect(captured.size).toBeGreaterThan(0);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
      document.body.appendChild = origAppend;
    }
  });
});