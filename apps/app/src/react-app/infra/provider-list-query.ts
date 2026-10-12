import { useQuery, type QueryClient } from "@tanstack/react-query";

import type { Client, ModelRef, ProviderListItem } from "../../app/types";
import { unwrap } from "../../app/lib/opencode";
import { dispatchNewProviders } from "../../app/lib/provider-events";
import type { ProviderListResponse } from "@opencode-ai/sdk/v2/client";

export const PROVIDER_LIST_CACHE_MS = 5 * 60 * 1000;
const PROVIDER_LIST_QUERY_ROOT = ["opencode-provider-list"] as const;

export type ConnectedProviderSnapshot = Array<{
  id: string;
  name: string;
  source: ProviderListItem["source"];
  models: Record<string, ProviderListItem["models"][string]>;
}>;

export type ConnectedProviderSnapshotChange = {
  changed: boolean;
  previous: ConnectedProviderSnapshot | null;
  next: ConnectedProviderSnapshot;
};

// Bounded module-scope cache: snapshots are keyed by (baseUrl, directory) and
// would otherwise accumulate for every workspace ever opened in this app run.
// Recording refreshes a key's recency; the oldest keys are evicted past the cap.
const CONNECTED_PROVIDER_SNAPSHOT_LIMIT = 16;
const connectedProviderSnapshots = new Map<string, ConnectedProviderSnapshot>();
const connectedProviderSnapshotChanges = new Map<string, ConnectedProviderSnapshotChange>();

export function providerListQueryKey(input: {
  baseUrl?: string | null;
  directory?: string | null;
}) {
  return [
    ...PROVIDER_LIST_QUERY_ROOT,
    input.baseUrl?.trim() ?? "",
    input.directory?.trim() ?? "",
  ] as const;
}

export async function refreshProviderListQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: PROVIDER_LIST_QUERY_ROOT });
  await queryClient.refetchQueries({ queryKey: PROVIDER_LIST_QUERY_ROOT, type: "active" });
}

/** Drop account-sensitive provider snapshots when the Den session ends. */
export function clearProviderListQueries(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: PROVIDER_LIST_QUERY_ROOT });
  connectedProviderSnapshots.clear();
  connectedProviderSnapshotChanges.clear();
}

export async function fetchProviderList(input: {
  client: Client;
  baseUrl?: string | null;
  directory?: string | null;
}): Promise<ProviderListResponse> {
  const value = unwrap(
    await input.client.provider.list({
      directory: input.directory?.trim() || undefined,
    }),
  );
  recordConnectedProviderSnapshot(input, value);
  return value;
}

export function getConnectedProviderItems(value: ProviderListResponse | null | undefined) {
  const connected = new Set(value?.connected ?? []);
  return (value?.all ?? []).filter(
    (provider) =>
      connected.has(provider.id) &&
      (provider.source !== "custom" || provider.id === "opencode" || Object.keys(provider.models ?? {}).length > 0),
  );
}

/**
 * TGWork: pick the cheapest model across connected providers to seed the
 * default selection before the user picks one themselves. Local runtimes
 * (cost 0/absent price with free flag) come first, then ascending token
 * price; models without catalog pricing rank last (alphabetical tiebreak)
 * so a paid-but-priced model beats an unknown one.
 */
export function cheapestConnectedModel(value: ProviderListResponse | null | undefined): ModelRef | null {
  let best: { ref: ModelRef; cost: number; title: string } | null = null;
  for (const provider of getConnectedProviderItems(value)) {
    for (const [modelId, model] of Object.entries(provider.models ?? {})) {
      const input = Math.max(Number(model.cost?.input) || 0, 0);
      const output = Math.max(Number(model.cost?.output) || 0, 0);
      const hasPricing = Boolean(model.cost);
      // Local runtimes report 0 cost via the catalog; custom providers may
      // omit cost entirely — treat "no cost data" as more expensive than any
      // known price so a priced model wins the default slot.
      const cost = hasPricing ? input + output : Number.POSITIVE_INFINITY;
      const title = model.name ?? modelId;
      if (
        !best ||
        cost < best.cost ||
        (cost === best.cost && title.localeCompare(best.title) < 0)
      ) {
        best = { ref: { providerID: provider.id, modelID: modelId }, cost, title };
      }
    }
  }
  return best?.ref ?? null;
}

export function getConnectedProviderSnapshot(value: ProviderListResponse | null | undefined): ConnectedProviderSnapshot {
  return getConnectedProviderItems(value)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      source: provider.source,
      models: Object.fromEntries(
        Object.entries(provider.models ?? {}).sort(([a], [b]) => a.localeCompare(b)),
      ),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function isModelAvailableInConnectedProviders(
  value: ProviderListResponse | null | undefined,
  model: ModelRef | null | undefined,
) {
  if (!model?.providerID || !model.modelID) return true;
  return getConnectedProviderItems(value).some(
    (provider) => provider.id === model.providerID && Boolean(provider.models?.[model.modelID]),
  );
}

export function getConnectedProviderSnapshotChange(input: {
  baseUrl?: string | null;
  directory?: string | null;
}) {
  return connectedProviderSnapshotChanges.get(connectedProviderSnapshotKey(input)) ?? null;
}

function recordConnectedProviderSnapshot(
  input: {
    baseUrl?: string | null;
    directory?: string | null;
  },
  value: ProviderListResponse,
) {
  const key = connectedProviderSnapshotKey(input);
  const previous = connectedProviderSnapshots.get(key) ?? null;
  const next = getConnectedProviderSnapshot(value);
  const changed = previous !== null && JSON.stringify(previous) !== JSON.stringify(next);
  // Delete before set so a refreshed key moves to the newest insertion slot.
  connectedProviderSnapshots.delete(key);
  connectedProviderSnapshotChanges.delete(key);
  connectedProviderSnapshots.set(key, next);
  connectedProviderSnapshotChanges.set(key, { changed, previous, next });
  while (connectedProviderSnapshots.size > CONNECTED_PROVIDER_SNAPSHOT_LIMIT) {
    const oldest = connectedProviderSnapshots.keys().next().value;
    if (oldest === undefined) break;
    connectedProviderSnapshots.delete(oldest);
    connectedProviderSnapshotChanges.delete(oldest);
  }
  if (changed) {
    dispatchConnectedProviderChanges(previous, next);
  }
}

function connectedProviderSnapshotKey(input: {
  baseUrl?: string | null;
  directory?: string | null;
}) {
  return JSON.stringify(providerListQueryKey(input));
}

function dispatchConnectedProviderChanges(
  previous: ConnectedProviderSnapshot | null,
  next: ConnectedProviderSnapshot,
) {
  if (!previous) return;
  const previousById = new Map(previous.map((provider) => [provider.id, provider]));
  const newProviders = next.filter((provider) => !previousById.has(provider.id));
  const changedProviders = new Map<string, ConnectedProviderSnapshot[number]>();
  let newModelCount = 0;

  for (const provider of next) {
    const before = previousById.get(provider.id);
    if (!before) {
      newModelCount += Object.keys(provider.models).length;
      changedProviders.set(provider.id, provider);
      continue;
    }
    for (const [id, model] of Object.entries(provider.models)) {
      if (JSON.stringify(before.models[id]) !== JSON.stringify(model)) {
        newModelCount += 1;
        changedProviders.set(provider.id, provider);
      }
    }
  }

  if (newProviders.length === 0 && newModelCount === 0) return;

  dispatchNewProviders({
    providers: [...changedProviders.values()].map((provider) => {
      const firstModelId = Object.keys(provider.models)[0];
      return {
        id: provider.id,
        name: provider.name,
        providerId: provider.id,
        firstModelId,
        firstModelName: firstModelId ? provider.models[firstModelId]?.name ?? firstModelId : undefined,
      };
    }),
    newProviderCount: newProviders.length,
    newModelCount,
    source: "models_refresh",
  });
}

export function ensureProviderListQuery(
  queryClient: QueryClient,
  input: {
    client: Client;
    baseUrl?: string | null;
    directory?: string | null;
    force?: boolean;
  },
) {
  const options = {
    queryKey: providerListQueryKey(input),
    queryFn: () => fetchProviderList(input),
    gcTime: PROVIDER_LIST_CACHE_MS,
  };
  if (input.force) {
    return queryClient.fetchQuery({
      ...options,
      staleTime: 0,
    });
  }
  return queryClient.ensureQueryData({
    ...options,
    staleTime: PROVIDER_LIST_CACHE_MS,
  });
}

export function useProviderListQuery(input: {
  client: Client | null;
  baseUrl?: string | null;
  directory?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: providerListQueryKey(input),
    enabled: Boolean(input.client) && (input.enabled ?? true),
    staleTime: PROVIDER_LIST_CACHE_MS,
    gcTime: PROVIDER_LIST_CACHE_MS,
    queryFn: () => {
      if (!input.client) {
        return {
          all: [] as ProviderListItem[],
          connected: [],
          default: {},
        } satisfies ProviderListResponse;
      }
      return fetchProviderList({
        client: input.client,
        baseUrl: input.baseUrl,
        directory: input.directory,
      });
    },
  });
}
