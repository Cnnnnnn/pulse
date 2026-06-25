// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import {
  digestDrawerOpen,
  aiTasksDrawerOpen,
} from '../../../src/renderer/digest/digest-store.js';
import { openDigestDrawer } from '../../../src/renderer/store/ai-store.js';

describe('digest vs aiTasks drawer signals', () => {
  beforeEach(() => {
    cleanup();
    digestDrawerOpen.value = false;
    aiTasksDrawerOpen.value = false;
  });

  it('openDigestDrawer 只开 aiTasksDrawerOpen, 不影响 digestDrawerOpen', () => {
    openDigestDrawer(true);
    expect(aiTasksDrawerOpen.value).toBe(true);
    expect(digestDrawerOpen.value).toBe(false);
  });

  it('digestDrawerOpen 与 aiTasksDrawerOpen 可独立为 true', () => {
    digestDrawerOpen.value = true;
    aiTasksDrawerOpen.value = true;
    expect(digestDrawerOpen.value).toBe(true);
    expect(aiTasksDrawerOpen.value).toBe(true);
  });
});
