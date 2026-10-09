// Owned here: reload vocabulary is part of the extension manifest contract.
// types.ts re-exports it for the rest of the app.
export type ReloadReason = "plugins" | "skills" | "mcp" | "config" | "agents" | "commands";

export type OpenWorkExtensionSourceFormat =
  | "agent-plugin"
  | "openwork-builtin"
  | "openwork-extension-manifest"
  | "claude-plugin"
  | "opencode-plugin"
  | "mcp-directory"
  | "manual";

export type OpenWorkExtensionSource = {
  format: OpenWorkExtensionSourceFormat;
  trusted: boolean;
  origin?: "builtin" | "den" | "workspace" | "local";
  reference?: string;
};

export type OpenWorkExtensionResourceType =
  | "skill"
  | "agent"
  | "command"
  | "tool"
  | "mcp"
  | "opencode-plugin"
  | "provider"
  | "hook"
  | "context"
  | "secret"
  | "file"
  | "local-service"
  | "native-binary";

export type OpenWorkExtensionResource = {
  type: OpenWorkExtensionResourceType;
  id: string;
  label?: string;
  description?: string;
  path?: string;
  command?: string[];
  envKey?: string;
  packageName?: string;
  providerId?: string;
  mcpServerName?: string;
  localCommandRef?: "openwork.computerUseMcp" | "openwork.uiMcp";
  required?: boolean;
};

export type OpenWorkExtensionContributionType =
  | "settings-panel"
  | "setup-instructions"
  | "composer-prompt"
  | "session-side-panel"
  | "session-rail-item"
  | "control-actions"
  | "server-route"
  | "native-capability"
  | "test-action";

export type OpenWorkExtensionContribution = {
  type: OpenWorkExtensionContributionType;
  ref?: string;
  label?: string;
  description?: string;
  prompt?: string;
  location?: "settings-detail" | "composer" | "session-right-pane" | "session-rail" | "server" | "native";
};

export type OpenWorkExtensionSetup = {
  instructions?: string;
  primaryCta?: string;
  secondaryCta?: string;
  requiredEnv?: string[];
  testActionRef?: string;
};

export type OpenWorkExtensionLifecycle = {
  reload?: ReloadReason[];
  detection?: string[];
};

// ---------------------------------------------------------------------------
// Enablement — declarative conditions for extension "active" state
// ---------------------------------------------------------------------------

export type EnablementConditionType =
  | "mcp-connected"
  | "plugin-loaded"
  | "provider-connected"
  | "env-set"
  | "permission-granted"
  | "toggle-enabled";

export type EnablementCondition = {
  type: EnablementConditionType;
  /** What to check — MCP server name, plugin id, env key, etc. */
  ref: string;
  /** Human-readable label shown in the UI. */
  label: string;
};

/** Result of evaluating a single enablement condition at runtime. */
export type EnablementResult = {
  condition: EnablementCondition;
  met: boolean;
};

export type OpenWorkExtensionManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  preview?: boolean;
  source: OpenWorkExtensionSource;
  icon?: {
    src?: string;
    simpleIconSlug?: string;
  };
  composer?: {
    prompt: string;
  };
  setup?: OpenWorkExtensionSetup;
  resources: OpenWorkExtensionResource[];
  contributions?: OpenWorkExtensionContribution[];
  lifecycle?: OpenWorkExtensionLifecycle;
  /** Declarative conditions that must ALL be true for the extension to be "active". */
  enablement?: EnablementCondition[];
  defaultEnabled?: boolean;
  defaultHidden?: boolean;
  platform?: Array<"darwin" | "linux" | "windows" | "web">;
};

export type OpenWorkExtensionPlatform = NonNullable<OpenWorkExtensionManifest["platform"]>[number];

export function extensionContribution(
  manifest: OpenWorkExtensionManifest | undefined,
  type: OpenWorkExtensionContributionType,
): OpenWorkExtensionContribution | undefined {
  return manifest?.contributions?.find((contribution) => contribution.type === type);
}

export function extensionResource(
  manifest: OpenWorkExtensionManifest | undefined,
  type: OpenWorkExtensionResourceType,
): OpenWorkExtensionResource | undefined {
  return manifest?.resources.find((resource) => resource.type === type);
}

export function isTrustedBuiltInExtension(manifest: OpenWorkExtensionManifest | undefined): boolean {
  return manifest?.source.origin === "builtin" && manifest.source.trusted;
}

export const BUILT_IN_OPENWORK_EXTENSION_MANIFESTS: OpenWorkExtensionManifest[] = [
  {
    schemaVersion: 1,
    id: "openwork-browser",
    name: "OpenWork Browser",
    description: "Automate the built-in browser panel that stays visible inside OpenWork.",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { src: "/openwork-mark.svg" },
    composer: { prompt: "Use the OpenWork Browser extension to " },
    setup: {
      instructions: "OpenWork Browser is ready by default in desktop workspaces.",
    },
    resources: [
      {
        type: "opencode-plugin",
        id: "opencode-chrome-devtools",
        packageName: "opencode-chrome-devtools",
        required: true,
      },
    ],
    contributions: [
      { type: "settings-panel", ref: "openwork.browser.settings", location: "settings-detail" },
      { type: "session-side-panel", ref: "openwork.browser.panel", location: "session-right-pane" },
      { type: "composer-prompt", prompt: "Use the OpenWork Browser extension to ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "openwork-browser", label: "Enabled" },
    ],
    lifecycle: { reload: ["plugins", "agents"], detection: ["plugin:opencode-chrome-devtools"] },
    defaultEnabled: true,
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "computer-use",
    name: "Computer Use",
    description: "Work in the Mac app and window you approve. Read, use accessible controls, or allow mouse and keyboard control with a small window preview.",
    preview: true,
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { src: "/openwork-mark.svg" },
    composer: { prompt: "Use Computer Use to " },
    setup: {
      instructions: "Enable Computer Use on macOS 14 or later and grant Accessibility and Screen Recording in the helper. For each session, choose an app window and allow reading, app controls, or mouse and keyboard. Choose Allow and start in OpenWork. Your input interrupts control; Stop in the preview ends access.",
      primaryCta: "Enable Computer Use",
      secondaryCta: "Check macOS permissions",
      testActionRef: "openwork.computerUse.healthCheck",
    },
    resources: [
      {
        type: "mcp",
        id: "computer-use-mcp",
        label: "Computer Use MCP",
        mcpServerName: "computer-use",
        command: [],
        localCommandRef: "openwork.computerUseMcp",
        required: true,
      },
      {
        type: "native-binary",
        id: "computer-use-native",
        label: "Computer Use session runtime",
        packageName: "@openwork/computer-use",
        required: true,
      },
    ],
    contributions: [
      { type: "setup-instructions", ref: "openwork.computerUse.setup", location: "settings-detail" },
      { type: "native-capability", ref: "openwork.computerUse.axPermissions", label: "Accessibility and Screen Recording" },
      { type: "test-action", ref: "openwork.computerUse.healthCheck", label: "Verify Computer Use MCP" },
      { type: "composer-prompt", prompt: "Use Computer Use to ", location: "composer" },
    ],
    enablement: [
      { type: "mcp-connected", ref: "computer-use", label: "MCP server connected" },
      { type: "permission-granted", ref: "accessibility", label: "Accessibility permission" },
      { type: "permission-granted", ref: "screenRecording", label: "Screen Recording permission" },
    ],
    lifecycle: { reload: ["mcp"], detection: ["mcp:computer-use"] },
    platform: ["darwin"],
  },
  {
    schemaVersion: 1,
    id: "ollama",
    name: "Ollama",
    description: "Local model provider at http://localhost:11434.",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-ollama.svg" },
    composer: { prompt: "Use the Ollama extension to " },
    setup: {
      instructions: "Run Ollama locally, choose or pull a model, then add it as an OpenCode provider.",
      primaryCta: "Add Ollama model",
      secondaryCta: "Pull model",
    },
    resources: [
      { type: "local-service", id: "ollama-api", label: "Ollama API", description: "http://localhost:11434", required: true },
      { type: "provider", id: "ollama", providerId: "ollama", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "openwork.ollama.settings", location: "settings-detail" },
      { type: "test-action", ref: "openwork.ollama.listModels", label: "Check local models" },
      { type: "composer-prompt", prompt: "Use the Ollama extension to ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "ollama", label: "Ollama provider" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:ollama"] },
  },
  {
    schemaVersion: 1,
    id: "siliconflow-cn",
    name: "硅基流动 (SiliconFlow)",
    description: "国产大模型聚合网关，兼容 OpenAI 接口。配置 API Key 后即可选用 DeepSeek、Qwen 等模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用硅基流动（SiliconFlow）的模型来 " },
    setup: {
      instructions: "在硅基流动控制台获取 API Key，并将其配置为 SiliconFlow 提供方的密钥，即可在模型列表中选用 DeepSeek、Qwen 等模型。",
      primaryCta: "配置硅基流动",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "siliconflow-cn", providerId: "siliconflow-cn", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用硅基流动（SiliconFlow）的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "siliconflow-cn", label: "SiliconFlow 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:siliconflow-cn"] },
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "alibaba-cn",
    name: "阿里云百炼 (DashScope)",
    description: "阿里云百炼大模型平台，兼容 OpenAI 接口。支持通义千问 Qwen 全系列模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用阿里云百炼（DashScope）的模型来 " },
    setup: {
      instructions: "在阿里云百炼控制台开通模型服务并获取 API Key，配置为阿里云百炼提供方的密钥后即可选用 Qwen 系列模型。",
      primaryCta: "配置阿里云百炼",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "alibaba-cn", providerId: "alibaba-cn", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用阿里云百炼（DashScope）的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "alibaba-cn", label: "阿里云百炼 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:alibaba-cn"] },
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "zhipuai",
    name: "智谱开放平台 (Zhipu AI)",
    description: "智谱 AI 开放平台，兼容 OpenAI 接口。支持 GLM 全系列模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用智谱开放平台（Zhipu AI）的模型来 " },
    setup: {
      instructions: "在智谱开放平台获取 API Key，配置为智谱 AI 提供方的密钥后即可选用 GLM 系列模型。",
      primaryCta: "配置智谱开放平台",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "zhipuai", providerId: "zhipuai", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用智谱开放平台（Zhipu AI）的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "zhipuai", label: "智谱 AI 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:zhipuai"] },
    platform: ["darwin", "linux", "windows"],
  },
];
