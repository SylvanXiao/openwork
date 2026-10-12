// One-command local web launcher for TGWork (no Electron, no Den cloud).
//
// What it does:
//   1. Ensures the web UI is built (apps/app/dist) — builds it if missing
//      unless OPENWORK_WEB_SKIP_BUILD=1.
//   2. Starts the MIT @openwork/server with OPENWORK_WEB_ROOT pointing at the
//      built UI, serving it from the same origin and acting as the OpenCode
//      gateway. The web app auto-detects same-origin and connects locally,
//      so no Den sign-in and no install package are required.
//
// Usage:
//   pnpm start:web                          # workspace = current directory
//   pnpm start:web -- --workspace /path     # or --workspace=/path
//   OPENWORK_WEB_WORKSPACE=/path pnpm start:web
//   OPENWORK_WEB_PORT=9000 pnpm start:web
//
// Security: the server binds to 127.0.0.1 by default and the page embeds a
// local access token — anyone who can open the page controls the agent. Do
// NOT rebind to 0.0.0.0 without adding your own authentication layer.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDist = resolve(root, "apps/app/dist");
const serverDir = resolve(root, "apps/server");

function fail(message) {
  console.error(`[start-web] ${message}`);
  process.exit(1);
}

/** Resolves the workspace from --workspace / --workspace= / OPENWORK_WEB_WORKSPACE / cwd. */
function resolveWorkspace() {
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    let value;
    if (arg === "--workspace") {
      value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        fail("--workspace requires a path, e.g. --workspace C:/path/to/folder");
      }
    } else if (arg.startsWith("--workspace=")) {
      value = arg.slice("--workspace=".length);
      if (!value) {
        fail("--workspace= requires a path, e.g. --workspace=C:/path/to/folder");
      }
    }
    if (value !== undefined) return value;
  }
  return process.env.OPENWORK_WEB_WORKSPACE || process.cwd();
}

const skipBuild = process.env.OPENWORK_WEB_SKIP_BUILD === "1";
const workspaceArg = resolveWorkspace();
const port = process.env.OPENWORK_WEB_PORT || "8787";

if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  fail(`Invalid port "${port}". Set OPENWORK_WEB_PORT to a number between 1 and 65535.`);
}

const workspace = isAbsolute(workspaceArg) ? workspaceArg : resolve(process.cwd(), workspaceArg);
if (!existsSync(workspace)) {
  // Warn instead of failing: the server may create the workspace on boot.
  console.warn(`[start-web] Warning: workspace does not exist yet: ${workspace}`);
}

if (!skipBuild && !existsSync(appDist)) {
  console.log("[start-web] Building web UI (VITE_OPENWORK_DEPLOYMENT=web, no Den sign-in)...");
  const build = spawn("pnpm", ["--filter", "@openwork/app", "build:web:local"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  const code = await new Promise((resolveExit) => build.on("exit", resolveExit));
  if (code !== 0) {
    fail("Web UI build failed. Aborting.");
  }
} else if (skipBuild) {
  console.log("[start-web] Skipping build (OPENWORK_WEB_SKIP_BUILD=1).");
}

if (!existsSync(appDist)) {
  fail(`Web UI not found at ${appDist}. Build it first: pnpm build:web:local`);
}

const env = {
  ...process.env,
  OPENWORK_WEB_ROOT: appDist,
  OPENWORK_WORKSPACES: workspace,
  OPENWORK_PORT: port,
  // Dev mode is opt-in: it relaxes loopback-only guards (e.g. trusting local
  // Den app-host endpoints). The no-install web path does not need it.
  ...(process.env.OPENWORK_WEB_DEV_MODE === "1" ? { OPENWORK_DEV_MODE: "1" } : {}),
};

console.log(`[start-web] Serving web UI from ${appDist}`);
console.log(`[start-web] Workspace: ${workspace}`);
console.log(`[start-web] Open http://127.0.0.1:${port} in your browser. Ctrl+C to stop.`);
console.log("[start-web] If the port was busy the server picks a free one — trust its \"listening on\" line for the real URL.");
console.log("[start-web] Security: loopback-only by default; the page carries a local token. Do not rebind to 0.0.0.0.");

const child = spawn("bun", ["--conditions=development", "src/cli.ts"], {
  cwd: serverDir,
  env,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[start-web] Failed to start server. Is bun installed? Error:", err.message);
  process.exit(1);
});
