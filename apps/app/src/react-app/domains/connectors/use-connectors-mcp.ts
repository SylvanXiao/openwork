/**
 * Lightweight MCP state hook for the ConnectorsPage surface.
 *
 * Mirrors the subset of connections-store behavior the page needs
 * (list / add / remove / enable / test) by calling the TGWork
 * server directly, without requiring the full ~15-dependency
 * createConnectionsStore wiring.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { McpServerEntry, McpStatusMap } from "@/app/types";
import type { McpDirectoryInfo } from "@/app/constants";
import type { OpenworkMcpItem, OpenworkMcpTestResult, OpenworkServerClient } from "@/app/lib/openwork-server";
import type { McpConnectResult } from "@/react-app/domains/connections/store";
import { clearStoredCreds } from "./platform-connector";
import { platformConnectors } from "./platform-connectors";
import type { McpTestResult } from "./connectors-page";

type UseConnectorsMcpInput = {
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  isRemoteWorkspace?: boolean;
};

type UseConnectorsMcpReturn = {
  mcpServers: McpServerEntry[];
  mcpStatuses: McpStatusMap;
  connectMcp: (entry: McpDirectoryInfo) => Promise<McpConnectResult>;
  setMcpEnabled: (name: string, enabled: boolean) => Promise<void>;
  removeMcp: (name: string) => void;
  testMcp: (name: string) => Promise<McpTestResult>;
  actionError: { name: string; message: string } | null;
  busy: boolean;
};

function toMcpServerEntry(item: OpenworkMcpItem): McpServerEntry {
  const config = item.config as Record<string, unknown>;
  return {
    name: item.name,
    config: {
      type: config.type === "remote" ? "remote" : "local",
      url: typeof config.url === "string" ? config.url : undefined,
      command: Array.isArray(config.command) ? (config.command as string[]) : undefined,
      enabled: config.enabled !== false,
      headers: (config.headers ?? undefined) as Record<string, string> | undefined,
      environment: (config.environment ?? undefined) as Record<string, string> | undefined,
      timeout: typeof config.timeout === "number" ? config.timeout : undefined,
    },
    source: item.source,
    managedOAuth: (item.managedOAuth ?? null) as McpServerEntry["managedOAuth"],
  };
}

function entryToConfig(entry: McpDirectoryInfo): Record<string, unknown> {
  const base: Record<string, unknown> = { type: entry.type ?? "remote", enabled: true };
  if (entry.url) base.url = entry.url;
  if (entry.command) base.command = entry.command;
  if (entry.environment) base.environment = entry.environment;
  if (entry.oauthConfig) {
    base.oauth = entry.oauthConfig;
  }
  if (entry.oauth && entry.managedOAuth) {
    base.managedOAuth = true;
  }
  return base;
}

function mapTestResult(result: OpenworkMcpTestResult): McpTestResult {
  if (result.ok) {
    // Server-side probe reports a real tool count when the engine is
    // connected and the MCP server answered tools/list; 0 when the probe
    // degraded (timeout / transport error) — the UI tolerates both.
    return { ok: true, toolCount: result.toolCount };
  }
  // OpenworkMcpTestResult status values are a subset of McpTestResult status values.
  const status = result.status;
  return { ok: false, error: result.reason, status };
}

export function useConnectorsMcp(input: UseConnectorsMcpInput): UseConnectorsMcpReturn {
  const { client, workspaceId } = input;

  const [mcpServers, setMcpServers] = useState<McpServerEntry[]>([]);
  const [mcpStatuses, setMcpStatuses] = useState<McpStatusMap>({});
  const [actionError, setActionError] = useState<{ name: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const requestIdRef = useRef(0);

  const fetchServers = useCallback(async () => {
    if (!client || !workspaceId) return;
    const id = ++requestIdRef.current;
    try {
      const result = await client.listMcp(workspaceId);
      if (id !== requestIdRef.current) return;
      setMcpServers(result.items.map(toMcpServerEntry));
    } catch {
      if (id === requestIdRef.current) setMcpServers([]);
    }
  }, [client, workspaceId]);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  const refreshStatuses = useCallback(async () => {
    if (!client || !workspaceId) return;
    try {
      const map = await client.getMcpStatus(workspaceId);
      setMcpStatuses(map);
    } catch {
      // Status unavailable — page tolerates missing entries as "disconnected".
    }
  }, [client, workspaceId]);

  const connectMcp = useCallback(async (entry: McpDirectoryInfo): Promise<McpConnectResult> => {
    if (!client || !workspaceId) return { ok: false, error: "Workspace not available" };
    setBusy(true);
    try {
      await client.addMcp(workspaceId, { name: entry.name, config: entryToConfig(entry) });
      await Promise.allSettled([fetchServers(), refreshStatuses()]);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      setBusy(false);
    }
  }, [client, workspaceId, fetchServers, refreshStatuses]);

  const setMcpEnabled = useCallback(async (name: string, enabled: boolean): Promise<void> => {
    if (!client || !workspaceId) return;
    try {
      await client.setMcpEnabled(workspaceId, name, enabled);
      setActionError(null);
      await Promise.allSettled([fetchServers(), refreshStatuses()]);
    } catch (error) {
      // The server rejected the toggle: re-sync the list so the switch shows
      // the real state, and surface the failure instead of swallowing it.
      setActionError({ name, message: error instanceof Error ? error.message : String(error) });
      void fetchServers();
    }
  }, [client, workspaceId, fetchServers, refreshStatuses]);

  const removeMcp = useCallback((name: string): void => {
    if (!client || !workspaceId) return;
    void client
      .removeMcp(workspaceId, name)
      .then(() => {
        setActionError(null);
        // Removing a platform connector's MCP also drops its stored
        // credentials, so a later re-register starts from a clean state.
        const platform = platformConnectors.find((connector) => connector.id === name);
        if (platform) clearStoredCreds(platform);
        void Promise.allSettled([fetchServers(), refreshStatuses()]);
      })
      .catch((error: unknown) => {
        // The MCP still exists on the server: keep the row and say why the
        // removal failed instead of just logging it.
        setActionError({ name, message: error instanceof Error ? error.message : String(error) });
      });
  }, [client, workspaceId, fetchServers, refreshStatuses]);

  const testMcp = useCallback(async (name: string): Promise<McpTestResult> => {
    if (!client || !workspaceId) {
      return { ok: false, error: "Workspace not available", status: "unavailable" };
    }
    try {
      const result = await client.testMcp(workspaceId, name);
      void refreshStatuses();
      return mapTestResult(result);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        status: "unavailable",
      };
    }
  }, [client, workspaceId, refreshStatuses]);

  return {
    mcpServers,
    mcpStatuses,
    connectMcp,
    setMcpEnabled,
    removeMcp,
    testMcp,
    actionError,
    busy,
  };
}
