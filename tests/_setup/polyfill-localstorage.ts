/**
 * tests/_setup/polyfill-localstorage.ts
 *
 * happy-dom 20.x 的 localStorage 实现存在 "localStorage.clear is not a function"
 * 问题 (Storage 接口虽存在但 clear 等方法缺失/不是函数). renderer 测试大量用
 * localStorage.clear() 做 beforeEach 重置, 直接报 TypeError.
 *
 * 这里给 happy-dom 环境注入一个最小可用的 localStorage polyfill (基于 Map),
 * 仅在现有 localStorage 不可用时兜底, 不覆盖真实浏览器环境.
 */
const g: any = globalThis as any;

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    get length(): number {
      return store.size;
    },
  };
}

// 仅当当前 localStorage 不可用时兜底 (node 环境无 localStorage; happy-dom 有但可能坏).
try {
  const probe = g.localStorage;
  if (!probe || typeof probe.clear !== "function") {
    throw new Error("missing");
  }
} catch {
  g.localStorage = makeStorage();
}

// sessionStorage 同理兜底.
try {
  const probe = g.sessionStorage;
  if (!probe || typeof probe.clear !== "function") {
    throw new Error("missing");
  }
} catch {
  g.sessionStorage = makeStorage();
}
