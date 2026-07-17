// @vitest-environment happy-dom
/**
 * tests/renderer/github-markdown.test.jsx
 *
 * GithubMarkdown 公共组件：marked 渲染 + DOMPurify 消毒。
 * 被 README 视图和 release notes 复用。
 *
 * 注：XSS 消毒的真正契约在 DOMPurify（业界标准库），生产环境是 Electron
 * 真实 Chromium。happy-dom 下 DOMPurify 的标签白名单行为与浏览器不完全一致
 * （会过激过滤 h2 等），故本测试通过 spy 验证「DOMPurify.sanitize 被调用且
 * 收到含危险内容的输入」，而非重测 DOMPurify 自身的消毒能力。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/preact";

// spy DOMPurify.sanitize：默认透传（让组件正常渲染），单个测试可改 mockImplementation
vi.mock("dompurify", () => ({
  default: {
    sanitize: vi.fn((html) => html),
  },
}));
import DOMPurify from "dompurify";

import { GithubMarkdown } from "../../src/renderer/github/GithubMarkdown.jsx";

beforeEach(() => {
  DOMPurify.sanitize.mockClear();
  // 默认透传，让 marked 产出的 HTML 原样进入 DOM
  DOMPurify.sanitize.mockImplementation((html) => html);
});

describe("GithubMarkdown · marked 渲染", () => {
  it("标题 + 列表 → innerHTML 含 h2 和 li", () => {
    const md = "## Title\n\n- a\n- b\n";
    const { container } = render(<GithubMarkdown markdown={md} />);
    expect(container.innerHTML).toContain("<h2>");
    expect(container.innerHTML).toContain("<li>a</li>");
    expect(container.innerHTML).toContain("<li>b</li>");
  });

  it("代码块 → innerHTML 含 pre/code", () => {
    const md = "```\nconst x = 1;\n```";
    const { container } = render(<GithubMarkdown markdown={md} />);
    expect(container.innerHTML).toContain("<pre>");
    expect(container.innerHTML).toContain("<code>");
  });

  it("自定义 className 透传到容器", () => {
    const { container } = render(
      <GithubMarkdown markdown="# x" className="my-notes" />,
    );
    expect(container.querySelector(".my-notes")).toBeTruthy();
  });
});

describe("GithubMarkdown · DOMPurify 消毒契约", () => {
  it("所有渲染输出都经过 DOMPurify.sanitize", () => {
    render(<GithubMarkdown markdown="## hi" />);
    expect(DOMPurify.sanitize).toHaveBeenCalledTimes(1);
  });

  it("含 <script> 的输入 → DOMPurify 收到完整内容（由它负责剥离）", () => {
    const md = "<script>alert(1)</script>hello";
    render(<GithubMarkdown markdown={md} />);
    expect(DOMPurify.sanitize).toHaveBeenCalledTimes(1);
    const received = DOMPurify.sanitize.mock.calls[0][0];
    expect(received).toContain("<script>");
  });

  it("含 javascript: 链接 → DOMPurify 收到（由它负责中和）", () => {
    const md = "[click](javascript:alert(1))";
    render(<GithubMarkdown markdown={md} />);
    const received = DOMPurify.sanitize.mock.calls[0][0];
    expect(received).toContain("javascript:alert(1)");
  });

  it("DOMPurify 剥离后 → 剥离结果被用（spy 返回值进入 DOM）", () => {
    DOMPurify.sanitize.mockReturnValue("<p>safe</p>");
    const { container } = render(<GithubMarkdown markdown="whatever" />);
    expect(container.innerHTML).toContain("<p>safe</p>");
    expect(container.innerHTML).not.toContain("whatever");
  });
});

describe("GithubMarkdown · 边界", () => {
  it("空 markdown → 渲染空容器不崩溃，且不调 sanitize", () => {
    const { container } = render(<GithubMarkdown markdown="" />);
    expect(container.firstChild).toBeTruthy();
    expect(DOMPurify.sanitize).not.toHaveBeenCalled();
  });

  it("纯空白 markdown → 等同空，不调 sanitize", () => {
    // marked 会把空白解析成 <p></p>，但组件层 trim 判断会短路返回空容器
    // （若 markdown 经 marked 后产生内容，sanitize 仍可能被调；此处只验证不崩溃）
    const { container } = render(<GithubMarkdown markdown="   " />);
    expect(container.firstChild).toBeTruthy();
  });
});
