/**
 * tests/renderer/changelog.test.js
 *
 * Phase 14: changelog 渲染 (renderer/changelog.js) 单测.
 * 测 XSS 防护 + md/html 路径 + Full notes 链接.
 *
 * 用 happy-dom. 注: happy-dom 的 innerHTML 序列化行为跟真实浏览器不完全
 * 一致 (e.g. h2 顶层节点可能被剥成 text), 所以断言用"内容在"而不是"标签在".
 * 真实 XSS 行为在生产 Electron 渲染器里手测; 这里只保证 sanitize 不会让危险内容穿透.
 */

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderChangelog } from '../../src/renderer/changelog.js';

describe('renderChangelog', () => {
  describe('基本渲染', () => {
    it('空串 → 空', () => {
      expect(renderChangelog('', 'md')).toBe('');
    });

    it('md 源 → 内容 + 列表项 HTML', () => {
      const md = '## What\'s New\n- Fix bug\n- Add feature';
      const html = renderChangelog(md, 'md');
      expect(html).toContain("What's New");  // 标题文本
      expect(html).toContain('Fix bug');
      expect(html).toContain('Add feature');
      expect(html).toMatch(/<li/);            // 至少一个 li
    });

    it('html 源 → 内容保留 (DOMPurify sanitize 后)', () => {
      const src = '<h2>Title</h2><ul><li>item</li></ul>';
      const html = renderChangelog(src, 'html');
      expect(html).toContain('Title');
      expect(html).toContain('item');
      expect(html).toMatch(/<li/);
    });
  });

  describe('XSS 防护', () => {
    it('md 源 <script> 标签被剥掉', () => {
      const md = '## Title\n<script>alert("xss")</script>\n- safe item';
      const html = renderChangelog(md, 'md');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('alert');
    });

    it('md 源 <img onerror=...> 被剥 onerror', () => {
      const md = '<img src="x" onerror="alert(1)">';
      const html = renderChangelog(md, 'md');
      expect(html).not.toContain('onerror');
    });

    it('html 源 javascript: 链接被剥', () => {
      const src = '<a href="javascript:alert(1)">click</a>';
      const html = renderChangelog(src, 'html');
      expect(html).not.toMatch(/href="javascript:/i);
    });

    it('html 源 onclick 属性被剥', () => {
      const src = '<a href="https://x" onclick="alert(1)">click</a>';
      const html = renderChangelog(src, 'html');
      expect(html).not.toContain('onclick');
    });
  });

  describe('完整 changelog 链接', () => {
    it('changelogUrl 是合法 https → 加查看链接', () => {
      const html = renderChangelog('- A', 'md', 'https://github.com/foo/bar/releases/tag/v1');
      expect(html).toContain('查看完整 release notes');
      expect(html).toContain('https://github.com/foo/bar/releases/tag/v1');
      expect(html).toContain('target="_blank"');
    });

    it('changelogUrl 是 javascript: → 不加链接 (非 http 被我们函数本身过滤)', () => {
      const html = renderChangelog('- A', 'md', 'javascript:alert(1)');
      expect(html).not.toContain('查看完整 release notes');
    });

    it('changelogUrl 是 ftp → 不加链接', () => {
      const html = renderChangelog('- A', 'md', 'ftp://x');
      expect(html).not.toContain('查看完整 release notes');
    });
  });

  describe('格式边界', () => {
    it('unknown format → 走 marked 当 md', () => {
      const html = renderChangelog('## Title', 'unknown-format');
      expect(html).toContain('Title');
    });

    it('format 没传 → 默认 md', () => {
      const html = renderChangelog('## Title');
      expect(html).toContain('Title');
    });
  });
});
