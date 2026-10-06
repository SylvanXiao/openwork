# Handoff — RESOLVED (2026-10-06)

The work described below landed on `dev` via **PR #3866** (`ecf5549af` —
`feat(app): unify Library with composer Connections`). Commit-by-commit
verification of the branch's six commits against `dev`:

- `80f494408` (feature) — landed; every file it added exists on `dev`.
- `449e4619b` (handoff docs) — superseded by this file.
- `05e1ff8a4` (drop OpenWork Models promo) — landed in evolved form; the
  promo module survives only as provider constants.
- `b1a6b906a` + `78ac56d65` (tests) — landed: `composer-connections-menu.e2e.test.ts`
  exists and the subtitle/description expectations match `dev` verbatim.
- `d1a377025` (two specs) — `composer-model-picker-no-subscribe-promo.e2e.test.ts`
  landed; **`library-authoring-routes` did not**. It is written against the
  retired pre-`spec.world` testkit API and cannot merge as-is; the 475-line
  spec is preserved in the archive tag below if anyone wants to port it.

The branch was deleted on 2026-10-06. Its full history stays reachable as the
tag **`archive/library-composer-connections`** (`78ac56d65`). Do not rebase or
open a PR from it.

<details>
<summary>Original handoff (kept for reference, stale)</summary>

**Branch:** `feat/library-composer-connections`
**Remote:** `origin/feat/library-composer-connections`
**Feature commit:** `80f494408` — `feat(app): unify Library with composer Connections (MCPs)`
**Base:** `dev` (`9f4425725`)
**PR:** none (superseded by #3866)

## Goal

Library is the inventory for composer capabilities (aligned with Den My Library).
Composer **+** should show what you have on Den, with easy sign-in. Connections and
MCPs are one thing: **Connections (MCPs)**.

## Honest gaps (as of the original handoff)

1. Agents/commands tabs still listed local OpenCode inventories while Add was Den-only.
2. MCPs had three surfaces (local workspace MCP, Den plugin remote MCP, org connections).
3. Skills list was mixed local + Connect, Add Den-only.
4. Local MCP `needs_auth` had no Sign in from the `+` pane.
5. No testkit tape for the `+` menu UI (unit tests only).

</details>
