// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { TabList, Tab } from '../../src/renderer/components/TabList.jsx';
import { Badge, StatusBadge } from '../../src/renderer/components/Badge.jsx';
import { ModalShell } from '../../src/renderer/components/ModalShell.jsx';
import { CategoryTabIcon, NavIcon, WorldcupTabIcon } from '../../src/renderer/components/icons.jsx';

describe('TabList', () => {
  it('chip variant 渲染 filter-tab active 类', () => {
    const { container } = render(
      <TabList variant="chip">
        <Tab variant="chip" active count={3}>全部</Tab>
        <Tab variant="chip">有更新</Tab>
      </TabList>
    );
    expect(container.querySelector('.filter-tabs')).not.toBeNull();
    expect(container.querySelector('.filter-tab.active')).not.toBeNull();
    expect(container.querySelector('.count').textContent).toBe('3');
  });
});

describe('Badge', () => {
  it('reminder 类型使用 reminder-badge 类', () => {
    const { container } = render(<Badge type="reminder">2</Badge>);
    expect(container.querySelector('.reminder-badge').textContent).toBe('2');
  });

  it('StatusBadge 附加语义修饰类', () => {
    const { container } = render(<StatusBadge status="update">有更新</StatusBadge>);
    expect(container.querySelector('.status-badge.update')).not.toBeNull();
  });
});

describe('ModalShell', () => {
  it('onEscape 返回 false 时不关闭', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ModalShell open onClose={onClose} title="t" onEscape={() => false}>
        body
      </ModalShell>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('.modal-body')).not.toBeNull();
  });

  it('自定义 header 替换默认 modal-header', () => {
    const { container } = render(
      <ModalShell open onClose={() => {}} header={<header class="custom-h">x</header>}>
        body
      </ModalShell>
    );
    expect(container.querySelector('.custom-h')).not.toBeNull();
    expect(container.querySelector('.modal-header')).toBeNull();
  });

  it('useModalCardClass=false 时仅用 cardClass', () => {
    const { container } = render(
      <ModalShell
        open
        onClose={() => {}}
        layout="bare"
        cardClass="search-modal"
        useModalCardClass={false}
      >
        x
      </ModalShell>
    );
    expect(container.querySelector('.search-modal')).not.toBeNull();
    expect(container.querySelector('.modal-card')).toBeNull();
  });
});

describe('CategoryTabIcon', () => {
  it('app ai → svg; fund stock → svg', () => {
    const { container: app } = render(<CategoryTabIcon id="ai" />);
    expect(app.querySelector('svg')).not.toBeNull();

    const { container: fund } = render(<CategoryTabIcon id="stock" domain="fund" />);
    expect(fund.querySelector('svg')).not.toBeNull();
  });

  it('未知 id 回退 IconPackage', () => {
    const { container } = render(<CategoryTabIcon id="unknown-cat" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('WorldcupTabIcon', () => {
  it('fixtures / bracket 渲染 svg', () => {
    const { container: fixtures } = render(<WorldcupTabIcon tabKey="fixtures" />);
    expect(fixtures.querySelector('svg')).not.toBeNull();
    const { container: bracket } = render(<WorldcupTabIcon tabKey="bracket" />);
    expect(bracket.querySelector('svg')).not.toBeNull();
  });
});

describe('NavIcon', () => {
  it('ithome / versions 渲染 svg', () => {
    const { container: news } = render(<NavIcon navKey="ithome" />);
    expect(news.querySelector('svg')).not.toBeNull();
    const { container: ver } = render(<NavIcon navKey="versions" />);
    expect(ver.querySelector('svg')).not.toBeNull();
  });
});
