/**
 * tests/renderer/app-row.test.jsx
 *
 * 验证 spec §7 的核心不变量：
 *   "<AppRow> 内部组件只读 result 这一个 signal，
 *    11 个 progress 触发 11 次 applyProgress 时，
 *    只重渲染那 1 个 row，其他 row 不动。"
 *
 * 用 happy-dom 跑组件，DOM 对比来验证。
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

import { applyProgress, resetCheck, getResultSignal } from '../../src/renderer/store.js';
import { AppRow } from '../../src/renderer/components/AppRow.jsx';
import { primeConfigCache } from '../../src/renderer/components/AppRow.jsx';

function makeResult(over) {
  return {
    name: 'X',
    bundle: 'x.app',
    brew_cask: '',
    installed_version: '1.0',
    latest_version: '1.0',
    has_update: false,
    status: 'up_to_date',
    source: 'brew_formulae',
    note: '',
    ...over,
  };
}

/** 一个简单的壳: 渲染 3 个 AppRow (不订阅任何 store-level signal) */
function List3({ names }) {
  return (
    <div>
      {names.map((n) => <AppRow key={n} name={n} />)}
    </div>
  );
}

describe('AppRow 局部更新', () => {
  beforeEach(() => {
    resetCheck();
    primeConfigCache({
      apps: [
        { name: 'A', bundle: 'a.app', download_url: 'https://a' },
        { name: 'B', bundle: 'b.app', download_url: '' },
        { name: 'C', bundle: 'c.app', download_url: 'https://c' },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('applyProgress 1 条 → 只有该 row 的 DOM 改变', async () => {
    // 准备 3 个 app 的 result
    applyProgress(makeResult({ name: 'A', bundle: 'a.app', status: 'up_to_date', has_update: false }));
    applyProgress(makeResult({ name: 'B', bundle: 'b.app', status: 'up_to_date', has_update: false }));
    applyProgress(makeResult({ name: 'C', bundle: 'c.app', status: 'up_to_date', has_update: false }));

    // 渲染 3 个 row
    const { container } = render(<List3 names={['A', 'B', 'C']} />);
    let rows = container.querySelectorAll('.app-row');
    expect(rows.length).toBe(3);

    // 快照初始 DOM
    const beforeHTML = Array.from(rows).map((r) => r.outerHTML);
    const beforeName = Array.from(rows).map((r) => r.getAttribute('data-name'));
    expect(beforeName).toEqual(['A', 'B', 'C']);

    // 触发 1 条 progress: 把 B 从 "已是最新" 改成 "有更新"
    applyProgress(makeResult({
      name: 'B',
      bundle: 'b.app',
      status: 'update_available',
      has_update: true,
      installed_version: '1.0',
      latest_version: '2.0.0',
    }));

    // 等待 preact 把 effect 队列 flush
    await new Promise((r) => setTimeout(r, 0));

    // 重新取 DOM 对比
    rows = container.querySelectorAll('.app-row');
    const afterHTML = Array.from(rows).map((r) => r.outerHTML);

    // 关键断言：A / C 的 DOM 完全未变，B 的 DOM 变化
    expect(afterHTML[0]).toBe(beforeHTML[0]);
    expect(afterHTML[1]).not.toBe(beforeHTML[1]);
    expect(afterHTML[2]).toBe(beforeHTML[2]);

    // B 的内容确实反映了新数据 (中文映射: update_available → "有更新")
    expect(afterHTML[1]).toContain('有更新');
    expect(afterHTML[1]).toContain('2.0.0');
    expect(afterHTML[1]).toContain('status-badge update');
    // 最新版本号高亮 (.highlight 类)
    expect(afterHTML[1]).toContain('version-value highlight');
  });

  it('subscribe 边界: 同一引用重复写入不触发二次重渲染', async () => {
    let renderCount = 0;
    function SpiedRow({ name }) {
      const sig = getResultSignal(name);
      // eslint-disable-next-line no-unused-vars
      const r = sig.value;
      renderCount++;
      return <div class="app-row" data-name={name}>{(r && r.status) || 'empty'}</div>;
    }

    applyProgress(makeResult({ name: 'X', bundle: 'x.app' }));
    applyProgress(makeResult({ name: 'Y', bundle: 'y.app' }));

    render(
      <div>
        <SpiedRow name="X" />
        <SpiedRow name="Y" />
      </div>
    );
    const initial = renderCount;

    // 用同一个对象引用 (preact signals 对 === 比较敏感)
    const sameResult = makeResult({ name: 'X', bundle: 'x.app' });
    applyProgress(sameResult);   // undefined → sameResult: 触发 1 次重渲染
    applyProgress(sameResult);   // sameResult === sameResult: 不再触发

    await new Promise((r) => setTimeout(r, 0));
    // 第一次 applyProgress 触发 1 次 (undefined→sameResult)
    expect(renderCount).toBe(initial + 1);

    // 改 Y 的 latest_version — 只有 Y 应该重渲染
    applyProgress(makeResult({ name: 'Y', bundle: 'y.app', latest_version: '99.0' }));
    await new Promise((r) => setTimeout(r, 0));
    // 这次只有 Y 重渲染 (+1)
    expect(renderCount).toBe(initial + 2);
  });
});

describe('AppRow 渲染细节', () => {
  beforeEach(() => {
    resetCheck();
    primeConfigCache({ apps: [{ name: 'Cursor', bundle: 'Cursor.app', download_url: 'https://cursor' }] });
  });

  afterEach(() => cleanup());

  it('update_available + 有 brew_cask → 渲染升级按钮', () => {
    applyProgress(makeResult({
      name: 'Cursor',
      bundle: 'Cursor.app',
      status: 'update_available',
      has_update: true,
      installed_version: '3.0',
      latest_version: '3.6',
      brew_cask: 'cursor',
    }));
    const { container } = render(<List3 names={['Cursor']} />);
    const btn = container.querySelector('.btn-upgrade-row');
    expect(btn).toBeTruthy();
    expect(btn.textContent.trim()).toBe('升级');
    // 版本显示
    expect(container.querySelector('.version-value.highlight').textContent).toBe('3.6');
  });

  it('note=installed_newer → 蓝色"预发布"badge', () => {
    applyProgress(makeResult({
      name: 'Cursor',
      bundle: 'Cursor.app',
      status: 'up_to_date',
      note: 'installed_newer',
    }));
    const { container } = render(<List3 names={['Cursor']} />);
    const badge = container.querySelector('.status-badge.info');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('预发布');
  });

  it('note=incompatible → 灰色"需确认"badge', () => {
    applyProgress(makeResult({
      name: 'Cursor',
      bundle: 'Cursor.app',
      status: 'no_auto_check',
      note: 'incompatible',
    }));
    const { container } = render(<List3 names={['Cursor']} />);
    const badge = container.querySelector('.status-badge.warning');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('需确认');
  });
});
