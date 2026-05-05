/**
 * happy-dom 20.9.0 ships a localStorage whose `.clear()` is undefined under
 * the `--localstorage-file` invocation vitest uses. This polyfill installs a
 * spec-correct in-memory Storage when the native one is missing or broken.
 *
 * Loaded globally via vitest.config.ts `setupFiles`, so it runs in every
 * test worker — including node-environment tests where `globalThis.localStorage`
 * is normally `undefined`. That is intentional and safe: the conditional guard
 * only installs when the native API is missing, and no test asserts that
 * `localStorage` is undefined in the node environment. `configurable: true`
 * on the property descriptor leaves a clean upgrade path for a future
 * happy-dom release that fixes this.
 */
if (typeof localStorage === 'undefined' || typeof localStorage.clear !== 'function') {
  const store: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() { return Object.keys(store).length },
      key(index: number) { return Object.keys(store)[index] ?? null },
      getItem(key: string) { return key in store ? store[key] : null },
      setItem(key: string, value: string) { store[key] = String(value) },
      removeItem(key: string) { delete store[key] },
      clear() { for (const k of Object.keys(store)) delete store[k] },
    },
  })
}
