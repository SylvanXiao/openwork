# Handoff — RESOLVED (2026-10-06)

The work described below landed on `dev` via **PR #3866** (`ecf5549af` —
`feat(app): unify Library with composer Connections`). Every file the branch
added exists on `dev` (`composer-connections.ts`, `library-add-control.tsx`,
`add-library-item-modal.tsx`, plus the `composer-connections` /
`library-destination` / `connect-capability-inventory` tests); later dev
commits have evolved them further.

The branch `feat/library-composer-connections` is therefore obsolete and safe
to delete — do not rebase or open a PR from it. Follow-up items listed in the
original "Next" section (long-list scroll proof, sign-in from `+`, Library
filter merge decision, e2e tape) are tracked with the feature itself, not
here.

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
