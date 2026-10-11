# Local Development (TGWork fork)

This guide explains how to run TGWork on your machine in **development mode**
(`pnpm dev`). Development mode launches Electron directly — it does **not**
build an installer, does **not** code-sign anything, and does **not** require a
cloud login. Everything runs locally.

> License note: the desktop client and the local `openwork-server` (everything
> outside `ee/`) are MIT. The cloud-login backend (`den`, under `ee/`) is **not**
> part of the open-source core. You do not need it to develop or use TGWork
> locally.

## 1. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Node.js** | 22 LTS or 24 (repo `.nvmrc` pins 24) | Dev flow verified on 22.22.2; 24 is the pinned target. |
| **pnpm** | 11.x | Package manager. Enable via `corepack enable`. |
| **bun** | ≥ 1.x | **Required.** `openwork-server`'s build uses `bun build`, not `tsc`. Install with `npm install -g bun`. |
| **Git** | any recent | Source + sidecar download. |
| **Git Bash** | — | Use this (not PowerShell/cmd) to run the root `pnpm dev` script, which sets env vars in bash syntax. |
| **VS Build Tools (C++)** + **Python 3.x** | — | **Windows only.** Needed to rebuild native modules (`better-sqlite3`, `@lydell/node-pty`) for Electron's Node ABI via `node-gyp`. |

### Install bun (critical)

The dev flow shells out to `openwork-server`'s build script, which contains
`bun build`. If `bun` is missing, `pnpm dev` fails at the server build step.

```bash
npm install -g bun
bun --version   # confirm it is on PATH
```

## 2. First-time setup

```bash
# from repo root, in Git Bash
pnpm install
```

Do **not** pass `--ignore-scripts` on your machine — native modules need their
build step. (The sandbox CI uses `--ignore-scripts` only because it cannot run
the native toolchain.)

## 3. Run

```bash
pnpm dev
```

This runs `apps/desktop/scripts/electron-dev.mjs`, which in order:

1. Downloads the **opencode sidecar** binary from GitHub releases
   (`prepare-sidecar.mjs`) and the computer-use helper
   (`prepare-computer-use-helper.mjs`).
2. Builds the workspace packages Electron imports from `dist`:
   `@openwork/headless-threads` and `openwork-server` (the latter uses `bun`).
3. Starts the Vite dev server for the UI (`pnpm -w dev:ui`).
4. Rebuilds native modules for the Electron ABI (`rebuild:electron-native`).
5. Launches Electron pointing at the Vite server.

When the Electron window opens and the UI renders, you are up.

### Alternative: worktree-friendly dev

```bash
pnpm dev:worktree
```

Sets `OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN=1` and `PORT=0` (auto free port),
which is convenient when running from a git worktree.

> **Windows / PowerShell users:** `pnpm dev` and `pnpm dev:worktree` (root
> scripts) embed bash-only env assignments (`OPENWORK_DEV_MODE=1 ...` and
> `${VAR:-default}`), which **fail under Windows cmd/PowerShell**. Use the
> desktop script directly instead, and set `PORT` the PowerShell way:
>
> ```powershell
> cd C:\Users\Administrator\WorkBuddy\Worktrees\openwork-cn\dev-c5a113ca
> $env:PORT=0
> pnpm --filter @openwork/desktop dev
> ```
>
> `$env:PORT=0` (not `PORT=0 pnpm ...`) avoids the 5173 cross-project clash
> described in the next section. The `apps/app` and root `dev:ui` scripts no
> longer use inline env (fixed), so the desktop flow works on Windows.

## 4. Known gotchas & fixes

### bun not installed → server build fails
Symptom: `pnpm dev` errors during `pnpm --filter openwork-server build`.
Fix: install bun (see §1). This is the most common first-run failure.

### Native module ABI mismatch
Symptom: Electron crashes on launch with a native-module load error, **or the
integrated terminal (PTY) fails to start**.

> **Important:** the dev script only auto-rebuilds `better-sqlite3`
> (`rebuild:electron-native` uses `--which-module better-sqlite3`). The desktop
> also depends on the native module `@lydell/node-pty` for its terminal, which
> is **not** covered by that step. Rebuild **all** native modules for the
> Electron ABI, up front (after `pnpm install`):

```bash
pnpm --filter @openwork/desktop exec electron-rebuild --force
```

If you prefer to rebuild only what broke, target the specific module:

```bash
pnpm --filter @openwork/desktop exec electron-rebuild --force --which-module @lydell/node-pty
```

Ensure **VS Build Tools (C++)** and **Python 3.x** are installed first.

### Sidecar (opencode) download is slow or fails (GitHub rate limit)
The desktop embeds the `opencode` binary from `apps/desktop/resources/sidecars`.
`prepare-sidecar.mjs` downloads it from GitHub releases on every `pnpm dev`; on
throttled networks this **hangs**. (The other "shared prepare" step,
`prepare-computer-use-helper.mjs`, is **macOS-only** and is a no-op on Windows —
so on Windows the only thing that matters is the opencode binary.)

### Fork regression: TGWork host-token header mismatch → boot 401 loop
**Symptom:** the Electron window opens but boot never finishes; the console
repeats `POST /tokens 401`, then
`[runtime] selected workspace failed during boot; trying fallback workspace ... error: 'HTTP 401'`.
The local `openwork-server` rejects the desktop's host-token request.

**Root cause:** this fork renamed the internal auth header from
`X-OpenWork-Host-Token` to `X-TGWork-Host-Token` in the desktop clients
(`apps/desktop/electron/runtime.mjs`, `apps/desktop/electron/workspace-store.mjs`,
`apps/app/src/app/lib/openwork-server.ts`) as part of the TGWork rebrand — but
the server still only reads `x-openwork-host-token`
(`apps/server/src/server.ts` `requireHostToken` / `requireHost`). The host-token
request therefore never matches `config.hostToken` and is rejected with 401,
which throws inside `issueOwnerToken` and aborts `engineStart`.

**Fix (applied):** `apps/server/src/server.ts` now also accepts
`x-tgwork-host-token` (kept `x-openwork-host-token` for backward-compat with the
cloud gateway and tests), and strips the TGWork header before forwarding to
upstreams. After this change, rebuild the server:

```bash
pnpm --filter openwork-server build
```

> If you later do a full two-sided rebrand, rename the header consistently on
> **both** the desktop clients and the server (and the CORS allow-list +
> upstream header-strip list in `server.ts`), otherwise the local boot will 401
> again.

**Note:** the `openwork-cloud` MCP entry still auto-points at the hosted Den
(`app.openworklabs.com`) and will log a non-fatal
`Engine MCP sync failed ... openwork-cloud` / `Cloud MCP startup reconciliation
left connected service tools unavailable` warning when you are offline / not
signed in. That warning does **not** block boot — it only means the cloud-only
connected-service tools are unavailable in local-only mode.

Fix: pre-stage the binary and skip the download.

```bash
# 1. download the pinned version once (browser, or a non-throttled proxy)
#    version: constants.json -> opencodeVersion (v1.18.30)
#    Windows asset: opencode-windows-x64-baseline.zip
#    URL: https://github.com/anomalyco/opencode/releases/download/v1.18.30/opencode-windows-x64-baseline.zip
#    (Linux/macOS asset names differ — see opencodeAssetByTarget in prepare-sidecar.mjs)

# 2. extract opencode.exe into the sidecar dir the runtime scans:
mkdir -p apps/desktop/resources/sidecars
#    place opencode.exe there   (also fine to add opencode-x86_64-pc-windows-msvc.exe)

# 3. skip the download step
OPENWORK_ELECTRON_SKIP_SHARED_PREPARE=1 pnpm dev
```

Tip: just run `pnpm dev` first. If it hangs at "Preparing sidecar…" /
"Downloading OpenCode", cancel and do the pre-stage above.

### Electron binary download fails (GitHub throttle)
`electron-dev.mjs` launches the Electron runtime, whose binary
(`electron-v43.2.0-win32-x64.zip`, ~140 MB) is fetched from GitHub releases by
the `electron` package's postinstall. On throttled networks this aborts
mid-download with `Electron failed to install correctly`.

Fix: point the download at the npmmirror CDN and re-run the installer
(adjust the version in the path if `electron` is upgraded):

```bash
# PowerShell
$env:ELECTRON_MIRROR="https://cdn.npmmirror.com/binaries/electron/"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron\Cache" -ErrorAction SilentlyContinue
node node_modules/.pnpm/electron@43.2.0/node_modules/electron/install.js
```

In China this mirror is far more reliable than GitHub. If even the mirror stalls,
download the zip manually in a browser from the same URL and let `install.js`
use the cache, or set `ELECTRON_OVERRIDE_DIST_PATH` to a pre-extracted Electron.

### Port conflict / cross-project "串台" (Electron loads the wrong UI)
`pnpm dev` defaults Vite to **port 5173** and `apps/desktop/scripts/electron-dev.mjs`
**probes that port first** (`startUrl` + `viteProbeUrls`, then `looksLikeVite`).
If *any other* Vite dev server is already answering on 5173, TGWork treats it as
ready, **skips starting its own UI**, and points Electron at the foreign server.

Consequence: if you have another frontend project running its Vite on 5173 (e.g.
the "智能招募" recruiting app), the TGWork window will silently render **that**
project's UI — not TGWork's. This was observed in practice: the window showed
"智能招募 Agent" while `POST /tokens` auth was perfectly fine.

How to confirm it is this (not a TGWork bug):
- TGWork's own repo contains **no** `智能招募` string and **no**
  `src/components/shell/AppShell.tsx`. The stray content lives in a *separate*
  project's Vite. (The Electron HTTP cache
  `AppData/Roaming/com.tgwork.app.dev/Cache/...` will hold that project's Vite
  HMR module as proof.)
- `pnpm dev` logs no error; server auth succeeds.

**Fix options (pick one):**
- **Recommended — collision-proof:** `pnpm dev:worktree` sets `PORT=0`, so Vite
  auto-selects a guaranteed-free port and Electron always loads TGWork's own UI.
  It also sets `OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN=1` (no real OS keychain
  needed) — ideal for local dev.
- **Explicit free port:** `PORT=5199 pnpm --filter @openwork/desktop dev` (any
  free port). `electron-dev.mjs` and Vite both honor `PORT` (Vite uses
  `strictPort`, so the chosen port is exclusive).
- **Free 5173 first:** stop the other project's Vite before running TGWork.

### "SmartScreen / unknown publisher" — not relevant here
That warning only appears for packaged/installer builds. `pnpm dev` is
unpackaged and unsigned by design; ignore code-signing concerns during dev.

## 5. Environment toggles

| Variable | Effect |
|----------|--------|
| `OPENWORK_ELECTRON_SKIP_SHARED_PREPARE=1` | Skip sidecar/helper download (use pre-staged binaries). |
| `OPENWORK_ELECTRON_SKIP_NATIVE_REBUILD=1` | Skip the automatic native-module rebuild. |
| `PORT=0` | Vite auto-selects a free port. |
| `OPENWORK_DEV_MODE=1` | Dev mode (set automatically by the dev scripts). |
| `OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN=1` | Use an in-memory keychain (set by `dev:worktree`). |
| `OPENWORK_DATA_DIR=...` | Override the local data directory. |
| `OPENWORK_ELECTRON_START_URL=...` | Point Electron at an already-running Vite server. |
| `OPENWORK_ELECTRON_REMOTE_DEBUG_PORT=0` | Disable the Electron CDP remote debug port. |

## 6. How to know it is working

- The Electron window opens and the TGWork UI renders.
- The embedded `openwork-server` is reachable (it serves the local workspace
  API used by the desktop client).
- The dev console shows no fatal red errors.

## 7. Verified status (CI/sandbox)

- `@openwork/headless-threads` and `openwork-server` builds pass (exit 0, `tsc`
  clean, `bun build` bundles 151 modules).
- The Vite UI serves (`HTTP 200`, `@vite/client` present).
- **Not verifiable outside a GUI machine:** Electron window launch, native
  module rebuild, and sidecar download. These require your local Windows
  machine.

## 8. What you do NOT need for local dev

- Code signing / installer packaging (that is `pnpm build`, deferred).
- Cloud login (`den`) — local-only usage is fully supported.
- Trademark / software copyright — post-investment concerns.

## 9. Adding local extensions (skills / agents / MCP)

TGWork supports adding skills, agents, commands, and MCP servers **locally**,
with no cloud marketplace required:

- Extensions materialize as workspace-local files under `.opencode/`
  (`skills/`, `agents/`, `commands/`, `mcps/`, `hooks/`, `tools/`, `context/`).
- Local MCP servers can also be added directly via the in-app **Settings**
  page (stdio or remote).

See `docs/extensions-manifest-foundation.md` for the extension source model.
