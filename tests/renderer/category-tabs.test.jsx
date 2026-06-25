/**
 * tests/renderer/category-tabs.test.jsx
 *
 * Phase A4a (App Categorization): <CategoryTabs /> 组件测试.
 * 跟 spec §8.1 + plan A4a 对齐 (~15 cases).
 */

// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/preact';
import { CategoryTabs } from '../../src/renderer/components/CategoryTabs.jsx';

const SAMPLE_TABS = [
  { id: 'all', name: '全部', icon: '📋', count: 5, title: '所有 app' },
  { id: 'ai', name: 'AI 工具', icon: '🤖', count: 2, title: 'AI 工具' },
  { id: 'dev', name: '开发者', icon: '🛠', count: 1, title: '开发者' },
  { id: 'other', name: '其他', icon: '📦', count: 0, title: '其他' },
];

describe('<CategoryTabs />', () => {
  it('渲染所有传入 tabs', () => {
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="all" onSelect={() => {}} />
    );
    const buttons = container.querySelectorAll('.category-tab');
    expect(buttons).toHaveLength(SAMPLE_TABS.length);
  });

  it('active tab 加 .active class', () => {
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="ai" onSelect={() => {}} />
    );
    const buttons = container.querySelectorAll('.category-tab');
    const ai = Array.from(buttons).find((b) => b.textContent.includes('AI 工具'));
    expect(ai.classList.contains('active')).toBe(true);
    const all = Array.from(buttons).find((b) => b.textContent.includes('全部'));
    expect(all.classList.contains('active')).toBe(false);
  });

  it('aria-selected 跟 active 一致', () => {
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="dev" onSelect={() => {}} />
    );
    const buttons = container.querySelectorAll('.category-tab');
    const dev = Array.from(buttons).find((b) => b.textContent.includes('开发者'));
    expect(dev.getAttribute('aria-selected')).toBe('true');
    const ai = Array.from(buttons).find((b) => b.textContent.includes('AI 工具'));
    expect(ai.getAttribute('aria-selected')).toBe('false');
  });

  it('点 tab 触发 onSelect 回调, 传对应 id', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="all" onSelect={onSelect} />
    );
    const buttons = container.querySelectorAll('.category-tab');
    const ai = Array.from(buttons).find((b) => b.textContent.includes('AI 工具'));
    ai.click();
    expect(onSelect).toHaveBeenCalledWith('ai');
  });

  it('切换 active prop → UI 重新渲染 (active class 转移)', () => {
    const { container, rerender } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="all" onSelect={() => {}} />
    );
    let all = Array.from(container.querySelectorAll('.category-tab'))
      .find((b) => b.textContent.includes('全部'));
    expect(all.classList.contains('active')).toBe(true);

    rerender(<CategoryTabs tabs={SAMPLE_TABS} active="dev" onSelect={() => {}} />);
    all = Array.from(container.querySelectorAll('.category-tab'))
      .find((b) => b.textContent.includes('全部'));
    const dev = Array.from(container.querySelectorAll('.category-tab'))
      .find((b) => b.textContent.includes('开发者'));
    expect(all.classList.contains('active')).toBe(false);
    expect(dev.classList.contains('active')).toBe(true);
  });

  it('空 tabs 数组 → 渲染空 (不抛)', () => {
    const { container } = render(
      <CategoryTabs tabs={[]} active="all" onSelect={() => {}} />
    );
    expect(container.querySelector('.category-tabs')).not.toBeNull();  // 容器还在
    expect(container.querySelectorAll('.category-tab')).toHaveLength(0);
  });

  it('null tabs → 渲染 null (不抛)', () => {
    const { container } = render(
      <CategoryTabs tabs={null} active="all" onSelect={() => {}} />
    );
    expect(container.querySelector('.category-tabs')).toBeNull();
  });

  it('count=0 也显示 ("📦 其他" 永远在末场景)', () => {
    const tabs = [
      { id: 'all', name: '全部', icon: '📋', count: 0, title: '所有 app' },
      { id: 'other', name: '其他', icon: '📦', count: 0, title: '其他' },
    ];
    const { container } = render(
      <CategoryTabs tabs={tabs} active="all" onSelect={() => {}} />
    );
    const buttons = container.querySelectorAll('.category-tab');
    expect(buttons).toHaveLength(2);
    // count 显示 "(0)"
    expect(buttons[1].textContent).toContain('(0)');
  });

  it('"全部" tab 总是在最前 (依赖父组件传进来的顺序)', () => {
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="all" onSelect={() => {}} />
    );
    const buttons = container.querySelectorAll('.category-tab');
    expect(buttons[0].textContent).toContain('全部');
  });

  it('role="tab" + role="tablist" 用于 a11y', () => {
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="all" onSelect={() => {}} />
    );
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(SAMPLE_TABS.length);
  });

  it('title 跟 fallback 到 name (hover tooltip)', () => {
    const tabs = [
      { id: 'all', name: '全部', icon: '📋', count: 1 },  // 无 title
      { id: 'ai', name: 'AI 工具', icon: '🤖', count: 1, title: 'AI 工具' },
    ];
    const { container } = render(
      <CategoryTabs tabs={tabs} active="all" onSelect={() => {}} />
    );
    const all = container.querySelectorAll('.category-tab')[0];
    const ai = container.querySelectorAll('.category-tab')[1];
    expect(all.getAttribute('title')).toBe('全部');  // fallback 到 name
    expect(ai.getAttribute('title')).toBe('AI 工具');
  });

  it('icon + name + count 三个 span 都渲染', () => {
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="all" onSelect={() => {}} />
    );
    const first = container.querySelector('.category-tab');
    const icon = first.querySelector('.category-tab-icon');
    expect(icon).not.toBeNull();
    expect(icon.querySelector('svg')).not.toBeNull();
    expect(first.querySelector('.category-tab-name')).not.toBeNull();
    expect(first.querySelector('.category-tab-count')).not.toBeNull();
  });

  it('onSelect undefined → 点击不抛 (受控组件 graceful degrade)', () => {
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="all" />
    );
    const button = container.querySelector('.category-tab');
    expect(() => button.click()).not.toThrow();
  });

  it('onSelect 是 null → 同样不抛', () => {
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="all" onSelect={null} />
    );
    const button = container.querySelector('.category-tab');
    expect(() => button.click()).not.toThrow();
  });

  it('数字 count 用 () 包裹 (spec §5.4)', () => {
    const { container } = render(
      <CategoryTabs tabs={SAMPLE_TABS} active="all" onSelect={() => {}} />
    );
    const all = Array.from(container.querySelectorAll('.category-tab'))
      .find((b) => b.textContent.includes('全部'));
    const countSpan = all.querySelector('.category-tab-count');
    expect(countSpan.textContent).toBe('(5)');
  });
});
