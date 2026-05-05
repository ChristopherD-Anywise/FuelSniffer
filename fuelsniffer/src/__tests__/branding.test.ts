import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * The Fillip rebrand (SP-0) requires that no user-visible code path
 * contains the string "fuelsniffer" (any case). The only deliberate
 * exceptions are listed in ALLOWLIST below — these reference the
 * postgres database/role name which is intentionally preserved
 * (master spec §10 Q3, SP-0 spec §2 non-goals).
 */

const ROOTS = ['src/app', 'src/components', 'src/lib']
const PATTERN = /fuelsniffer/i

const ALLOWLIST: ReadonlyArray<string> = [
  // psql -U fuelsniffer examples — db role name is preserved per spec §2
  'src/lib/db/README.md',
]

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '__tests__'])
const SKIP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2'])

function walk(dir: string, base: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) {
      walk(full, base, out)
    } else {
      const ext = name.slice(name.lastIndexOf('.'))
      if (SKIP_EXTENSIONS.has(ext)) continue
      out.push(relative(base, full))
    }
  }
}

describe('branding: zero "fuelsniffer" outside allowlist', () => {
  const cwd = process.cwd()
  const offenders: string[] = []
  for (const root of ROOTS) {
    const files: string[] = []
    walk(join(cwd, root), cwd, files)
    for (const rel of files) {
      if (ALLOWLIST.includes(rel)) continue
      const content = readFileSync(join(cwd, rel), 'utf8')
      if (PATTERN.test(content)) offenders.push(rel)
    }
  }

  it('finds zero matches under src/app, src/components, src/lib', () => {
    expect(offenders, `unexpected "fuelsniffer" in:\n${offenders.join('\n')}`).toEqual([])
  })
})
