import { afterEach, describe, expect, it, vi } from "vitest";

const { requireMain } = require("../_setup/require-main.cjs");
const { installRendererAutoReload } = requireMain("renderer-auto-reload");

describe("installRendererAutoReload", () => {
  afterEach(() => vi.useRealTimers());

  it("debounces build-output bursts into one cache-bypassing reload", () => {
    vi.useFakeTimers();
    let onChange: (() => void) | undefined;
    const close = vi.fn();
    const reload = vi.fn();

    const stop = installRendererAutoReload({
      rendererDir: "/tmp/renderer-dist",
      watch: (_dir, _options, listener) => {
        onChange = listener;
        return { close };
      },
      reload,
      debounceMs: 100,
    });

    onChange?.();
    onChange?.();
    vi.advanceTimersByTime(99);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);

    stop();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
