@AGENTS.md

# Fillip — project notes for Claude

## Project name vs. legacy identifiers

This codebase was renamed FuelSniffer → **Fillip** in SP-0. Two things were intentionally NOT renamed:

1. The folder `fuelsniffer/` — paths leak into worktrees, deploy scripts, and CI.
2. The postgres database name and role `fuelsniffer` — renaming requires a coordinated dump/restore.

Both renames are queued as separate cleanup tickets. **Do not unilaterally rename either** without the corresponding migration plan.

## Theme

- `src/styles/tokens.css` defines `[data-theme="light"]` and `[data-theme="dark"]` blocks.
- `src/app/globals.css` consumes only token variables (no raw hex).
- 21 components still hold inline-style hex literals (~204 hits) from the FuelSniffer dark-only era. Migrating them to tokens is **SP-3's** job, not yours, unless you're touching those components for another reason.

## Public URL & email

- `APP_PUBLIC_URL` (default `http://localhost:4000`) feeds `metadataBase`.
- `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS` configure the default sender identity. SP-2 will plug in Resend as the transport.

## Master spec & sub-projects

`docs/superpowers/specs/2026-04-22-fillip-master-design.md` is the north-star reference. Sub-projects: `2026-04-22-fillip-sp{0..8}-*-design.md`. Implementation plans live in `docs/superpowers/plans/`.
