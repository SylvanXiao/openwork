import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Seed } from "@openwork/env";

export const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * App served over the web surface (Vite + managed openwork-server + headless
 * Chrome) with a local workspace. No Den: the Connectors page only talks to
 * the workspace's managed openwork-server (list / add / enable / test MCP).
 */
export async function connectorsPage(seed: Seed) {
  // Windows tmpdir can surface as an 8.3 short path (ADMINI~1). The app
  // records the workspace's real path, so arrange the workspace in its real
  // form or the create-and-select flow re-creates an already-open workspace.
  const root = join(tmpdir(), `connectors-page-${randomUUID().slice(0, 8)}`);
  await mkdir(root, { recursive: true });
  const workspacePath = await realpath(root);
  const app = await seed.appWeb({ name: "connectors-page", workspacePath });
  const workspace = await seed.workspace(app, workspacePath);
  return {
    app,
    workspaceId: workspace.workspaceId,
    // Zero-dependency stdio MCP with exactly three tools (shared with the
    // server-side endpoint test), spawned by `node`.
    mockMcpCommand: `node ${join(repoRoot, "apps", "server", "src", "mcp-test-endpoint.mock-mcp.mjs")}`,
  };
}
