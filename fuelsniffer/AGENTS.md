<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:fillip-project-rules -->
# This is the Fillip codebase

Formerly **FuelSniffer**. Rebrand happened in SP-0 (see `docs/superpowers/specs/2026-04-22-fillip-sp0-rebrand-design.md`).

- The folder is still named `fuelsniffer/` — folder rename is deferred (spec §10 Q4).
- The postgres database and role are still named `fuelsniffer` — DB rename is deferred (spec §10 Q3, master §10 Q3).
- Everything else (UI, metadata, README, package name, container_names, log prefixes) is **Fillip**.
- The branding regression test (`src/__tests__/branding.test.ts`) enforces zero `fuelsniffer` outside an explicit allowlist. If you add a new doc that legitimately needs to reference the postgres role, extend the allowlist with a comment.
- Theme tokens live in `src/styles/tokens.css`. New colour values should be tokens, not literals.
- Public URL config flows from `APP_PUBLIC_URL` via `src/lib/config/publicUrl.ts`.
<!-- END:fillip-project-rules -->
