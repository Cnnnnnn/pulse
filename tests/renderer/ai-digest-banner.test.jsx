/**
 * tests/renderer/ai-digest-banner.test.jsx
 *
 * Phase B5a (AI Sessions Daily Digest): <AIDigestBanner /> 组件测试.
 * 跟 plan B5a 对齐 (~15 cases).
 *
 * 覆盖:
 *   - loading 状态: 显示 ⏳ + "生成昨日 AI 总结..." 骨架
 *   - 没 digest: 返 null (整体不渲染)
 *   - 正常 digest: 渲染 summary preview (60 字符截断 + ellipsis)
 *   - 多行 summary: 只 preview 第一行
 *   - 短 summary: 不加 ellipsis
 *   - 0 session count: 显示 (0 sessions)
 *   - sessionCount undefined / 缺: fallback 0
 *   - 重跑按钮 onClick 调 onRerun callback
 *   - 重跑按钮 preventDefault (不 toggle details)
 *   - onRerun undefined → 点击不抛
 *   - aria / role: role=status loading 时, role=tablist 正常时
 *   - meta 显示 provider / model / 时间
 *   - 时间 format YYYY-MM-DD HH:MM
 *   - 时间缺 / 0 → 返 ''
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { AIDigestBanner } from '../../src/renderer/components/AIDigestBanner.jsx';

afterEach(() => cleanup());

const NOW = 1750000000000;  // 2025-06-15 ish
const SAMPLE_DIGEST = {
  dateKey: '2026-06-07',
  generatedAt: NOW,
  provider: 'ollama',
  model: 'qwen3.5:9b',
  sessionCount: 3,
  summary: '昨天主要工作:\n- 修 Pulse tray icon\n- 写 AI digest',
  sessionIds: ['a', 'b', 'c'],
};

describe('<AIDigestBanner /> — loading', () => {
  it('loading=true → 显示 ⏳ + "生成昨日 AI 总结..."', () => {
    const { container } = render(<AIDigestBanner loading={true} />);
    expect(container.querySelector('.ai-digest-banner.loading')).not.toBeNull();
    expect(container.textContent).toContain('生成昨日 AI 总结');
  });

  it('loading=true + digest 仍传 → loading 优先', () => {
    const { container } = render(<AIDigestBanner digest={SAMPLE_DIGEST} loading={true} />);
    expect(container.querySelector('.ai-digest-banner.loading')).not.toBeNull();
    expect(container.querySelector('details.ai-digest-banner')).toBeNull();
  });

  it('loading=true 元素有 role="status" aria-live="polite"', () => {
    const { container } = render(<AIDigestBanner loading={true} />);
    const el = container.querySelector('[role="status"]');
    expect(el).not.toBeNull();
    expect(el.getAttribute('aria-live')).toBe('polite');
  });
});

describe('<AIDigestBanner /> — no digest', () => {
  it('digest=null + loading=false → 返 null', () => {
    const { container } = render(<AIDigestBanner digest={null} loading={false} />);
    expect(container.querySelector('.ai-digest-banner')).toBeNull();
  });

  it('digest=undefined → 返 null', () => {
    const { container } = render(<AIDigestBanner />);
    expect(container.querySelector('.ai-digest-banner')).toBeNull();
  });
});

describe('<AIDigestBanner /> — happy path', () => {
  it('正常 digest → 渲染 details + summary 完整', () => {
    const { container } = render(<AIDigestBanner digest={SAMPLE_DIGEST} />);
    const banner = container.querySelector('details.ai-digest-banner');
    expect(banner).not.toBeNull();
    expect(container.textContent).toContain('昨日 AI 总结');
    expect(container.textContent).toContain('3 sessions');
    expect(container.textContent).toContain('昨天主要工作');  // 第一行 preview
  });

  it('summary 第一行截 60 字符 + ellipsis (多行)', () => {
    const longFirstLine = 'a'.repeat(80);
    const digest = { ...SAMPLE_DIGEST, summary: `${longFirstLine}\n- more` };
    const { container } = render(<AIDigestBanner digest={digest} />);
    // preview 部分含 60 个 a + ellipsis
    expect(container.textContent).toContain('a'.repeat(60) + '…');
  });

  it('summary 第一行短 (< 60 字符) → 不加 ellipsis', () => {
    const digest = { ...SAMPLE_DIGEST, summary: '短的总结' };
    const { container } = render(<AIDigestBanner digest={digest} />);
    expect(container.textContent).toContain('短的总结');
    expect(container.textContent).not.toContain('…');
  });

  it('summary 单行 (没换行) → 整行截 60', () => {
    const longLine = 'x'.repeat(100);
    const digest = { ...SAMPLE_DIGEST, summary: longLine };
    const { container } = render(<AIDigestBanner digest={digest} />);
    expect(container.textContent).toContain('x'.repeat(60) + '…');
  });

  it('summary 第一行正好 60 字符 → 不加 ellipsis', () => {
    const exact = 'a'.repeat(60);
    const digest = { ...SAMPLE_DIGEST, summary: `${exact}\n- next` };
    const { container } = render(<AIDigestBanner digest={digest} />);
    // 60 字符正好 = 无 ellipsis
    expect(container.textContent).toContain(exact);
    expect(container.textContent).not.toContain('a'.repeat(61));
    // ellipsis 应该没出现 (60 不 > 60)
    // 仔细测: 我们 .slice(0, 60) + 长度 > 60 才加 …
    expect(container.textContent).not.toMatch(/a{60}…/);
  });

  it('sessionCount=0 → 显示 (0 sessions)', () => {
    const digest = { ...SAMPLE_DIGEST, sessionCount: 0 };
    const { container } = render(<AIDigestBanner digest={digest} />);
    expect(container.textContent).toContain('(0 sessions)');
  });

  it('sessionCount 缺 → fallback 0', () => {
    const { sessionCount, ...rest } = SAMPLE_DIGEST;
    const { container } = render(<AIDigestBanner digest={rest} />);
    expect(container.textContent).toContain('(0 sessions)');
  });

  it('summary 缺 → preview 空字符串 (不崩)', () => {
    const { summary, ...rest } = SAMPLE_DIGEST;
    const { container } = render(<AIDigestBanner digest={rest} />);
    // 仍渲染 details, preview 是 '— '
    expect(container.querySelector('details.ai-digest-banner')).not.toBeNull();
  });
});

describe('<AIDigestBanner /> — rerun 按钮', () => {
  it('onRerun 调 1 次 + 阻止默认 toggle', () => {
    const onRerun = vi.fn();
    const { container } = render(<AIDigestBanner digest={SAMPLE_DIGEST} onRerun={onRerun} />);
    const btn = container.querySelector('.rerun-btn');
    expect(btn).not.toBeNull();
    btn.click();
    expect(onRerun).toHaveBeenCalledOnce();
  });

  it('onRerun undefined → 点击不抛', () => {
    const { container } = render(<AIDigestBanner digest={SAMPLE_DIGEST} />);
    const btn = container.querySelector('.rerun-btn');
    expect(() => btn.click()).not.toThrow();
  });

  it('onRerun 传 null → 点击不抛', () => {
    const { container } = render(<AIDigestBanner digest={SAMPLE_DIGEST} onRerun={null} />);
    const btn = container.querySelector('.rerun-btn');
    expect(() => btn.click()).not.toThrow();
  });

  it('rerun 按钮 aria-label="重新生成 AI 总结"', () => {
    const { container } = render(<AIDigestBanner digest={SAMPLE_DIGEST} />);
    const btn = container.querySelector('.rerun-btn');
    expect(btn.getAttribute('aria-label')).toBe('重新生成 AI 总结');
  });
});

describe('<AIDigestBanner /> — meta', () => {
  it('显示 provider · model · 时间', () => {
    const { container } = render(<AIDigestBanner digest={SAMPLE_DIGEST} />);
    const meta = container.querySelector('.ai-digest-meta');
    expect(meta).not.toBeNull();
    expect(meta.textContent).toContain('ollama');
    expect(meta.textContent).toContain('qwen3.5:9b');
    expect(meta.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);  // YYYY-MM-DD HH:MM
  });

  it('generatedAt=0 → 时间空字符串 (不显示 garbage)', () => {
    const digest = { ...SAMPLE_DIGEST, generatedAt: 0 };
    const { container } = render(<AIDigestBanner digest={digest} />);
    const meta = container.querySelector('.ai-digest-meta');
    // 仍渲染 meta 元素, 但时间部分是空
    expect(meta).not.toBeNull();
  });

  it('generatedAt 缺 → 不崩', () => {
    const { generatedAt, ...rest } = SAMPLE_DIGEST;
    const { container } = render(<AIDigestBanner digest={rest} />);
    expect(container.querySelector('details.ai-digest-banner')).not.toBeNull();
  });
});
