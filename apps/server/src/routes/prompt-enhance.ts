// TGWork fork: one-shot prompt enhancement.
//
// Rewrites a rough user draft into a structured prompt using whatever model
// the workspace already has configured, via an ephemeral opencode session.
// The session is created, prompted, read, and deleted inside one request —
// nothing shows up in the session list, and no separate provider/key setup
// is needed beyond what the user already connected.

import { ApiError } from "../errors.js";
import type { ServerConfig, WorkspaceInfo } from "../types.js";
import { addRoute, type RequestContext, type Route } from "./registry.js";
// Type-only imports from server.ts: no runtime cycle (values are injected).
import type { createWorkspaceOpencodeClient, unwrapOpencodeResult } from "../server.js";

type JsonResponse = (data: unknown, status?: number) => Response;
type ReadJsonBody = (request: Request) => Promise<Record<string, unknown>>;

const ENHANCE_TIMEOUT_MS = 90_000;
const MAX_PROMPT_LENGTH = 16_000;

type EnhanceMode = "general" | "coding" | "writing";

const MODE_GUIDANCE: Record<EnhanceMode, string> = {
  general: `The draft is a general-purpose request. Improve it for an AI assistant:
state the goal first, add any implied context as clearly-marked assumptions,
list constraints and the expected output format, and keep every requirement
from the original draft.`,
  coding: `The draft is a coding task. Improve it for a coding agent:
state the objective and affected files/modules, list explicit acceptance
criteria and edge cases, name the expected deliverables, and keep every
technical detail (paths, identifiers, versions) exactly as written.`,
  writing: `The draft is a writing request. Improve it for a writing assistant:
state the piece's purpose, audience, tone, and length, add a suggested
structure, and preserve the author's voice and key arguments.`,
};

const ENHANCE_SYSTEM_INSTRUCTION = `You are a prompt rewriting assistant. You receive a rough draft
from the user and rewrite it into a single, high-quality prompt for an AI assistant.

Rules:
- Reply with the rewritten prompt ONLY. No preamble, no explanations, no quotes around it.
- Reply in the same language as the draft (Chinese draft -> Chinese prompt, English draft -> English prompt).
- Never invent requirements the draft does not imply. Mark assumptions as assumptions.
- Do not use any tools. Text output only.`;

interface RegisterPromptEnhanceRoutesOptions {
  routes: Route[];
  config: ServerConfig;
  jsonResponse: JsonResponse;
  readJsonBody: ReadJsonBody;
  resolveWorkspaceWithoutBootstrap: (config: ServerConfig, id: string) => Promise<WorkspaceInfo>;
  // Injected from server.ts (type-only import above; no runtime cycle).
  createWorkspaceOpencodeClient: typeof createWorkspaceOpencodeClient;
  unwrapOpencodeResult: typeof unwrapOpencodeResult;
}

export function registerPromptEnhanceRoutes(options: RegisterPromptEnhanceRoutesOptions): void {
  const {
    routes,
    config,
    jsonResponse,
    readJsonBody,
    resolveWorkspaceWithoutBootstrap,
    createWorkspaceOpencodeClient,
    unwrapOpencodeResult,
  } = options;

  addRoute(routes, "POST", "/workspace/:id/prompt-enhance", "client", async (ctx: RequestContext) => {
    const workspace = await resolveWorkspaceWithoutBootstrap(config, ctx.params.id);
    const body = await readJsonBody(ctx.request);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_LENGTH) : "";
    if (!prompt) {
      throw new ApiError(400, "invalid_payload", "prompt is required");
    }
    const mode: EnhanceMode =
      body.mode === "coding" || body.mode === "writing" || body.mode === "general" ? body.mode : "general";
    const requestedModel =
      body.model && typeof body.model === "object"
        ? (body.model as { providerID?: unknown; modelID?: unknown })
        : null;
    const model =
      requestedModel && typeof requestedModel.providerID === "string" && typeof requestedModel.modelID === "string"
        ? { providerID: requestedModel.providerID, modelID: requestedModel.modelID }
        : undefined;

    const client = createWorkspaceOpencodeClient(config, workspace);
    const signal = AbortSignal.timeout(ENHANCE_TIMEOUT_MS);
    let sessionId: string | null = null;
    try {
      const created = unwrapOpencodeResult(
        await client.session.create({ title: "Prompt enhance (ephemeral)" }, { signal }),
        "/session",
      );
      sessionId = created.id;

      const result = unwrapOpencodeResult(
        await client.session.prompt(
          {
            sessionID: sessionId,
            ...(model ? { model } : {}),
            // Belt and braces against the agent loop touching anything: the
            // wildcard disables every registered tool (some models ignore the
            // system instruction and call ask/question mid-rewrite, which
            // hangs the synchronous prompt), the named entries cover engines
            // that ignore the wildcard.
            tools: {
              "*": false,
              bash: false,
              edit: false,
              write: false,
              patch: false,
              ask: false,
              question: false,
            },
            system: ENHANCE_SYSTEM_INSTRUCTION,
            parts: [{ type: "text" as const, text: `${MODE_GUIDANCE[mode]}\n\n---\n\n${prompt}` }],
          },
          { signal },
        ),
        `/session/${sessionId}/message`,
      );

      const enhanced = (result.parts ?? [])
        .map((part) =>
          part.type === "text" && "text" in part && typeof part.text === "string" ? part.text : "",
        )
        .join("\n")
        .trim();
      if (!enhanced) {
        // The engine returns a completed assistant message with an `error`
        // payload (e.g. provider 402 Insufficient Balance) and no text parts.
        // Surface that instead of a misleading "empty response".
        const info = result.info as { error?: { name?: unknown; data?: { message?: unknown } } } | undefined;
        const errorName = typeof info?.error?.name === "string" ? info.error.name : "";
        const errorMessage =
          typeof info?.error?.data?.message === "string" ? info.error.data.message.trim() : "";
        const detail = errorMessage || errorName;
        throw new ApiError(
          502,
          "enhance_upstream_error",
          detail
            ? `The model failed to enhance the prompt: ${detail}`
            : "The model returned no text for the enhanced prompt",
        );
      }
      return jsonResponse({ enhanced, mode });
    } finally {
      if (sessionId) {
        try {
          await client.session.delete({ sessionID: sessionId }, { signal: AbortSignal.timeout(5_000) });
        } catch {
          // Ephemeral session cleanup is best-effort; opencode also expires
          // idle sessions on its own.
        }
      }
    }
  });
}
