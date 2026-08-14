/**
 * Development-only renderer live reload.
 *
 * The renderer is a static esbuild bundle rather than a dev-server/HMR runtime.
 * Watch the output directory and refresh Electron only after a rebuild settles.
 */
import type * as fsType from "node:fs";

type Watcher = { close: () => void };
type Watch = (
  filename: string,
  options: { persistent: boolean },
  listener: () => void,
) => Watcher;

type AutoReloadOptions = {
  rendererDir: string;
  reload: () => void;
  watch?: Watch;
  debounceMs?: number;
  log?: (message: string) => void;
};

/** Installs a debounced output watcher and returns its cleanup function. */
export function installRendererAutoReload({
  rendererDir,
  reload,
  watch,
  debounceMs = 250,
  log = () => {},
}: AutoReloadOptions): () => void {
  const fs: typeof fsType = require("node:fs");
  const watchDir = watch || fs.watch;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const watcher = watchDir(rendererDir, { persistent: false }, () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (stopped) return;
      log("[dev] renderer rebuilt; reloading window");
      reload();
    }, debounceMs);
  });

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    watcher.close();
  };
}

module.exports = { installRendererAutoReload };
