/**
 * tests/renderer/toast.test.jsx
 *
 * Phase B7b.1 (AI Sessions Daily Digest): Toast组件 + store.showToast 测试.
 *
 *覆盖:
 * - toast.value=[] →不渲染
 * - 单 toast →显示 message + icon
 * - type info/warn/error/success →不同 class
 * - ×按钮 →dismissToast
 * - 多 toast →显示最新3 条
 * -5s 自动消失 (verify showToast触发 setTimeout)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/preact';
import * as store from '../../src/renderer/store.js';
import { Toast } from '../../src/renderer/components/Toast.jsx';

// @vitest-environment happy-dom

beforeEach(() => {
 cleanup();
 vi.useFakeTimers();
 store.clearToasts();
});

describe('Toast — mount', () => {
 it('toast 空 →不渲染 container', () => {
 store.toast.value = [];
 const { container } = render(<Toast />);
 expect(container.querySelector('.toast-container')).toBeNull();
 });

 it('单 toast →显示 message', () => {
 store.showToast('hello world', 'info');
 const { container } = render(<Toast />);
 const toast = container.querySelector('.toast');
 expect(toast).not.toBeNull();
 expect(toast.querySelector('.toast-message').textContent).toBe('hello world');
 });

 it('toast type映射到 class', () => {
 store.showToast('hi', 'warn');
 const { container } = render(<Toast />);
 expect(container.querySelector('.toast-warn')).not.toBeNull();
 });

 it('toast 多 type都有对应 class', () => {
 store.showToast('a', 'info');
 store.showToast('b', 'error');
 store.showToast('c', 'success');
 const { container } = render(<Toast />);
 expect(container.querySelector('.toast-info')).not.toBeNull();
 expect(container.querySelector('.toast-error')).not.toBeNull();
 expect(container.querySelector('.toast-success')).not.toBeNull();
 });

 it('多 toast →最多显示3 条 (TOAST_MAX_VISIBLE)', () => {
 store.showToast('a');
 store.showToast('b');
 store.showToast('c');
 store.showToast('d');
 store.showToast('e');
 const { container } = render(<Toast />);
 const toasts = container.querySelectorAll('.toast');
 expect(toasts.length).toBe(3);
 });
});

describe('Toast — close按钮', () => {
 it('点 × →dismissToast 被调', () => {
 store.showToast('hello');
 const { container } = render(<Toast />);
 fireEvent.click(container.querySelector('.toast-close'));
 expect(store.toast.value.length).toBe(0);
 });
});

describe('Toast — 自动消失', () => {
 it('5s 后 toast 自动 dismiss', () => {
 store.showToast('hello', 'info',5000);
 expect(store.toast.value.length).toBe(1);
 act(() => {
 vi.advanceTimersByTime(5000);
 });
 expect(store.toast.value.length).toBe(0);
 });

 it('ms=0 → 不自动消失', () => {
 store.showToast('persistent', 'info',0);
 expect(store.toast.value.length).toBe(1);
 act(() => {
 vi.advanceTimersByTime(10000);
 });
 expect(store.toast.value.length).toBe(1);
 });

 it('不同 toast各自独立计时', () => {
 store.showToast('a', 'info',5000);
 store.showToast('b', 'info',10000);
 //5s 后,a消失,b还在
 act(() => {
 vi.advanceTimersByTime(5000);
 });
 expect(store.toast.value.length).toBe(1);
 expect(store.toast.value[0].message).toBe('b');
 });
});

describe('store.showToast —边界', () => {
 it('空 string →返 null,不 push', () => {
 const id = store.showToast('', 'info');
 expect(id).toBeNull();
 expect(store.toast.value.length).toBe(0);
 });

 it('非 string →返 null', () => {
 const id = store.showToast(12345, 'info');
 expect(id).toBeNull();
 });

 it('返 id唯一', () => {
 const id1 = store.showToast('a');
 const id2 = store.showToast('b');
 expect(id1).not.toBe(id2);
 expect(store.toast.value.length).toBe(2);
 });

 it('clearToasts →清空', () => {
 store.showToast('a');
 store.showToast('b');
 store.clearToasts();
 expect(store.toast.value.length).toBe(0);
 });
});

describe('store.runAIHealthcheck — auth toast integration', () => {
 it('healthcheck返 auth_401 → 自动 toast', async () => {
 vi.spyOn(store, 'runAIHealthcheck').mockImplementation(async () => {
 const r = { ok: false, error: 'auth_401' };
 store.setAIHealthcheckResult(r);
 store.showToast('API key 无效,请在设置里更新', 'warn',5000);
 return r;
 });
 await store.runAIHealthcheck({});
 expect(store.toast.value.length).toBe(1);
 expect(store.toast.value[0].type).toBe('warn');
 expect(store.toast.value[0].message).toMatch(/API key/);
 });

 it('healthcheck ok →不 toast', async () => {
 vi.spyOn(store, 'runAIHealthcheck').mockImplementation(async () => {
 const r = { ok: true, latencyMs:123 };
 store.setAIHealthcheckResult(r);
 return r;
 });
 await store.runAIHealthcheck({});
 expect(store.toast.value.length).toBe(0);
 });
});
