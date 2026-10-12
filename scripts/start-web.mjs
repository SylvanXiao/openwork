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
//   pnpm start:web                 # workspace = current directory
//   pnpm start:web -- --workspace /path/to/folder
//   OPENWORK_WEB_WORKSPACE=/path pnpm start:web
//   OPENWORK_WEB_PORT=9000 pnpm start:web

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDist = resolve(root, "apps/app/dist");
const serverDir = resolve(root, "apps/server");

const skipBuild = process.env.OPENWORK_WEB_SKIP_BUILD === "1";
const workspace =
  process.env.OPENWORK_WEB_WORKSPACE ||
  (process.argv.includes("--workspace")
    ? process.argv[process.argv.indexOf("--workspace") + 1]
    : process.cwd());
const port = process.env.OPENWORK_WEB_PORT || "8787";

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
    console.error("[start-web] Web UI build failed. Aborting.");
    process.exit(code ?? 1);
  }
} else if (skipBuild) {
  console.log("[start-web] Skipping build (OPENWORK_WEB_SKIP_BUILD=1).");
}

if (!existsSync(appDist)) {
  console.error(`[start-web] Web UI not found at ${appDist}. Build it first: pnpm build:web:local`);
  process.exit(1);
}

const env = {
  ...process.env,
  OPENWORK_WEB_ROOT: appDist,
  OPENWORK_WORKSPACES: resolve(workspace),
  OPENWORK_PORT: port,
  OPENWORK_DEV_MODE: "1",
};

console.log(`[start-web] Serving web UI from ${appDist}`);
console.log(`[start-web] Workspace: ${env.OPENWORK_WORKSPACES}`);
console.log(`[start-web] Open http://127.0.0.1:${port} in your browser. Ctrl+C to stop.`);

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
