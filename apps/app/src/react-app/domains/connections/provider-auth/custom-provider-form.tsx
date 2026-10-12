/** @jsxImportSource react */
// TGWork fork: custom OpenAI-compatible provider form.
//
// Connects endpoints that are not in the models.dev catalog (OneAPI/NewAPI
// relays, vLLM, LM Studio, corporate gateways) through the standard config
// channel: the provider entry goes into the workspace runtime config via
// PATCH /workspace/:id/config, the API key goes into the server env store
// (which syncs it into the engine's auth storage), then the engine reloads
// and the provider shows up in the model picker like any catalog provider.

import { useMemo, useState, type ChangeEvent } from "react";

import type { ProviderConfig } from "@opencode-ai/sdk/v2/client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { useLocal } from "@/react-app/kernel/local-provider";
import { refreshProviderListQueries } from "@/react-app/infra/provider-list-query";
import { getReactQueryClient } from "@/react-app/infra/query-client";
import { describeRouteError } from "@/react-app/shell/route-workspaces";
import { reloadEngineWithDesktopFallback } from "@/react-app/shell/engine-reload-escalation";
import { useWorkspaceMaybe } from "@/react-app/shell/workspace-provider";
import { TextInput } from "../../../design-system/text-input";

type CustomProviderTemplate = {
  id: string;
  label: string;
  baseURL: string;
  suggestedModels: string;
  needsKey: boolean;
};

const CUSTOM_PROVIDER_TEMPLATES: CustomProviderTemplate[] = [
  {
    id: "custom",
    label: "OpenAI-compatible (custom)",
    baseURL: "",
    suggestedModels: "",
    needsKey: true,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseURL: "http://localhost:11434/v1",
    suggestedModels: "qwen2.5-coder:7b",
    needsKey: false,
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    baseURL: "http://localhost:1234/v1",
    suggestedModels: "",
    needsKey: false,
  },
  {
    id: "vllm",
    label: "vLLM (local)",
    baseURL: "http://localhost:8000/v1",
    suggestedModels: "",
    needsKey: false,
  },
  {
    id: "oneapi",
    label: "OneAPI / NewAPI relay",
    baseURL: "",
    suggestedModels: "",
    needsKey: true,
  },
];

function slugifyProviderId(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `custom-${slug}` : "";
}

function envNameForProviderId(providerId: string) {
  return `${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

export default function CustomProviderForm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Workspace context for callers rendered outside a WorkspaceProvider
   * (e.g. the settings route). Falls back to useWorkspaceMaybe() when
   * omitted; both absent disables the submit with an availability hint.
   */
  workspaceContext?: { openworkServerClient: OpenworkServerClient; workspaceId: string } | null;
}) {
  const { open, onOpenChange } = props;
  const workspaceFromContext = useWorkspaceMaybe();
  const openworkServerClient = props.workspaceContext?.openworkServerClient
    ?? workspaceFromContext?.openworkServerClient
    ?? null;
  const workspaceId = props.workspaceContext?.workspaceId
    ?? workspaceFromContext?.workspaceId
    ?? "";
  const local = useLocal();

  const [templateId, setTemplateId] = useState<string>("custom");
  const [name, setName] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState("");
  const [setDefault, setSetDefault] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = useMemo(
    () => CUSTOM_PROVIDER_TEMPLATES.find((item) => item.id === templateId) ?? CUSTOM_PROVIDER_TEMPLATES[0],
    [templateId],
  );

  const providerId = useMemo(() => slugifyProviderId(name || template.id), [name, template.id]);
  const envKey = useMemo(
    () => (providerId ? envNameForProviderId(providerId) : ""),
    [providerId],
  );
  const modelIds = useMemo(
    () => models.split(/[,\n]/).map((id) => id.trim()).filter(Boolean),
    [models],
  );

  const reset = () => {
    setTemplateId("custom");
    setName("");
    setBaseURL("");
    setApiKey("");
    setModels("");
    setSetDefault(true);
    setError(null);
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const applyTemplate = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
    const nextTemplate = CUSTOM_PROVIDER_TEMPLATES.find((item) => item.id === nextTemplateId);
    if (!nextTemplate) return;
    setBaseURL(nextTemplate.baseURL);
    setModels(nextTemplate.suggestedModels);
    if (!nextTemplate.needsKey) setApiKey("");
    setError(null);
  };

  const handleSubmit = async () => {
    if (busy) return;
    if (!openworkServerClient || !workspaceId) {
      setError("TGWork server is not connected for this workspace.");
      return;
    }
    if (!providerId) {
      setError("Provider name is required.");
      return;
    }
    if (!baseURL.trim()) {
      setError("Base URL is required.");
      return;
    }
    if (modelIds.length === 0) {
      setError("At least one model ID is required.");
      return;
    }
    if (template.needsKey && !apiKey.trim()) {
      setError("API key is required for this provider.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const providerConfig: ProviderConfig = {
        npm: "@ai-sdk/openai-compatible",
        name: name.trim() || template.label,
        ...(apiKey.trim() ? { env: [envKey] } : {}),
        options: { baseURL: baseURL.trim() },
        models: Object.fromEntries(modelIds.map((id) => [id, { name: id }])),
      };
      await openworkServerClient.patchConfig(workspaceId, {
        opencode: {
          provider: {
            [providerId]: providerConfig,
          },
        },
      });
      if (apiKey.trim()) {
        await openworkServerClient.upsertUserEnv([{ key: envKey, value: apiKey.trim() }]);
      }
      try {
        await reloadEngineWithDesktopFallback(openworkServerClient, workspaceId);
      } catch {
        // The reload toast still lets the user retry if the immediate reload fails.
      }
      await refreshProviderListQueries(getReactQueryClient());
      try {
        window.dispatchEvent(new CustomEvent("openwork-server-settings-changed"));
      } catch {
        // ignore browser event dispatch failures
      }
      if (setDefault) {
        local.setPrefs((previous) => ({
          ...previous,
          defaultModel: { providerID: providerId, modelID: modelIds[0] },
          modelVariant: null,
        }));
      }
      toast.success(`${providerConfig.name} connected`, {
        description: `${modelIds.length} model${modelIds.length === 1 ? "" : "s"} available in the picker.`,
      });
      close();
    } catch (submitError) {
      setError(describeRouteError(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogContent className="flex max-h-[calc(100vh-2rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add custom provider</DialogTitle>
          <DialogDescription>
            Connect any OpenAI-compatible endpoint — a relay (OneAPI/NewAPI), a local runtime (Ollama,
            LM Studio, vLLM), or a corporate gateway. Catalog providers (DeepSeek, Zhipu, Kimi, …) are
            already in the list; use this form only for endpoints the catalog does not cover.
          </DialogDescription>
        </DialogHeader>

        <div className="-mr-1 min-h-0 flex-1 space-y-3.5 overflow-y-auto pr-1">
          {error ? (
            <div className="rounded-xl border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs text-red-11">
              {error}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-gray-11">Template</div>
            <select
              value={templateId}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => applyTemplate(event.currentTarget.value)}
              disabled={busy}
              className="w-full rounded-xl bg-gray-2 px-3 py-2.5 text-[13px] text-gray-12 border border-gray-6/60 focus:border-gray-8 focus:bg-gray-1 focus:outline-none transition-colors shadow-sm"
            >
              {CUSTOM_PROVIDER_TEMPLATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <TextInput
            label="Display name"
            placeholder="My relay / My Ollama"
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
              if (error) setError(null);
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
          />
          {providerId ? (
            <div className="-mt-2 flex items-center gap-1.5 text-[11px] text-gray-9">
              Provider ID:
              <span className="rounded-md bg-gray-3/40 px-1.5 py-0.5 font-mono text-[10px] text-gray-11">
                {providerId}
              </span>
            </div>
          ) : null}

          <TextInput
            label="Base URL (OpenAI-compatible /v1)"
            placeholder="https://relay.example.com/v1"
            value={baseURL}
            onChange={(event) => {
              setBaseURL(event.currentTarget.value);
              if (error) setError(null);
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
          />

          <TextInput
            label={template.needsKey ? "API key" : "API key (optional)"}
            type="password"
            placeholder={template.needsKey ? "sk-..." : "not required for local runtimes"}
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.currentTarget.value);
              if (error) setError(null);
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busy}
          />
          {apiKey.trim() && envKey ? (
            <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-9">
              Stored as env var:
              <span className="rounded-md bg-gray-3/40 px-1.5 py-0.5 font-mono text-[10px] text-gray-11">
                {envKey}
              </span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-gray-11">Model IDs (comma-separated)</div>
            <textarea
              value={models}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setModels(event.currentTarget.value);
                if (error) setError(null);
              }}
              placeholder="gpt-4o-mini, deepseek-chat, qwen2.5:14b"
              rows={2}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={busy}
              className="w-full resize-none rounded-xl bg-gray-2 px-3 py-2.5 text-[13px] text-gray-12 placeholder:text-gray-9 border border-gray-6/60 focus:border-gray-8 focus:bg-gray-1 focus:outline-none transition-colors shadow-sm"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-12">
            <input
              type="checkbox"
              checked={setDefault}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSetDefault(event.currentTarget.checked)}
              disabled={busy}
              className="size-4 rounded border-gray-6 accent-gray-12"
            />
            Use the first model as the default
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy || !openworkServerClient || !workspaceId}>
            {busy ? "Connecting…" : "Add provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
