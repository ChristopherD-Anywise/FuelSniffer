// Polyfill localStorage for happy-dom environments where the built-in
// implementation may be file-backed (via --localstorage-file) and missing
// standard methods like .clear().
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
