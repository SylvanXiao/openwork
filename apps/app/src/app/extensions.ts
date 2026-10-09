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
  {
    schemaVersion: 1,
    id: "volcengine",
    name: "火山方舟 (Volcengine Ark)",
    description: "火山引擎方舟大模型平台，兼容 OpenAI 接口。支持豆包 Doubao 全系列模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用火山方舟（Volcengine Ark）的模型来 " },
    setup: {
      instructions: "在火山引擎方舟控制台开通模型并获取 API Key，配置为火山方舟提供方的密钥后即可选用 Doubao 系列模型。",
      primaryCta: "配置火山方舟",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "volcengine", providerId: "volcengine", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用火山方舟（Volcengine Ark）的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "volcengine", label: "火山方舟 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:volcengine"] },
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "minimax-cn",
    name: "MiniMax (MiniMax)",
    description: "MiniMax 开放平台，兼容 OpenAI 接口。支持 MiniMax 全系列模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用 MiniMax 的模型来 " },
    setup: {
      instructions: "在 MiniMax 开放平台获取 API Key，配置为 MiniMax 提供方的密钥后即可选用 MiniMax 系列模型。",
      primaryCta: "配置 MiniMax",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "minimax-cn", providerId: "minimax-cn", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用 MiniMax 的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "minimax-cn", label: "MiniMax 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:minimax-cn"] },
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "stepfun",
    name: "阶跃星辰 (StepFun)",
    description: "阶跃星辰开放平台，兼容 OpenAI 接口。支持 Step 系列模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用阶跃星辰（StepFun）的模型来 " },
    setup: {
      instructions: "在阶跃星辰开放平台获取 API Key，配置为阶跃星辰提供方的密钥后即可选用 Step 系列模型。",
      primaryCta: "配置阶跃星辰",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "stepfun", providerId: "stepfun", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用阶跃星辰（StepFun）的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "stepfun", label: "阶跃星辰 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:stepfun"] },
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "moonshotai-cn",
    name: "月之暗面 (Moonshot AI)",
    description: "月之暗面开放平台，兼容 OpenAI 接口。支持 Kimi 系列模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用月之暗面（Moonshot AI）的模型来 " },
    setup: {
      instructions: "在月之暗面开放平台获取 API Key，配置为月之暗面提供方的密钥后即可选用 Kimi 系列模型。",
      primaryCta: "配置月之暗面",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "moonshotai-cn", providerId: "moonshotai-cn", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用月之暗面（Moonshot AI）的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "moonshotai-cn", label: "月之暗面 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:moonshotai-cn"] },
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "tencent-tokenhub",
    name: "腾讯混元 (Tencent TokenHub)",
    description: "腾讯混元大模型，通过 TokenHub 接入，兼容 OpenAI 接口。支持 Hunyuan 系列模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用腾讯混元（Tencent TokenHub）的模型来 " },
    setup: {
      instructions: "在腾讯云混元或 TokenHub 获取 API Key，配置为腾讯混元提供方的密钥后即可选用 Hunyuan 系列模型。",
      primaryCta: "配置腾讯混元",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "tencent-tokenhub", providerId: "tencent-tokenhub", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用腾讯混元（Tencent TokenHub）的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "tencent-tokenhub", label: "腾讯混元 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:tencent-tokenhub"] },
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "baichuan",
    name: "百川智能 (Baichuan)",
    description: "百川智能开放平台，兼容 OpenAI 接口。支持 Baichuan4 全系列模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用百川智能（Baichuan）的模型来 " },
    setup: {
      instructions: "在百川智能开放平台获取 API Key，配置为百川智能提供方的密钥后即可选用 Baichuan 系列模型。",
      primaryCta: "配置百川智能",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "baichuan", providerId: "baichuan", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用百川智能（Baichuan）的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "baichuan", label: "百川智能 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:baichuan"] },
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "qianfan",
    name: "百度千帆 (Baidu Qianfan)",
    description: "百度智能云千帆大模型平台，兼容 OpenAI 接口。支持 ERNIE 文心全系列模型。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用百度千帆（Baidu Qianfan）的模型来 " },
    setup: {
      instructions: "在百度智能云千帆控制台开通模型并获取 API Key，配置为百度千帆提供方的密钥后即可选用 ERNIE 系列模型。",
      primaryCta: "配置百度千帆",
      secondaryCta: "获取 API Key",
    },
    resources: [
      { type: "provider", id: "qianfan", providerId: "qianfan", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用百度千帆（Baidu Qianfan）的模型来 ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "qianfan", label: "百度千帆 提供方" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:qianfan"] },
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "live-script-generator",
    name: "直播话术生成 (Live Script Generator)",
    description: "直播带货话术生成器：把企宣/星探/摘星/前台/讲师/直播招募六类岗位经验固化为话术方法论，覆盖开场留人/互动破冰/产品FAB/逼单转化/结尾复购。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用直播话术生成器来 " },
    setup: {
      instructions: "直播话术生成器为内置技能，无需额外配置。在对话中描述直播间定位、货品与人群，即可生成可直接口播的话术。",
      primaryCta: "开始生成话术",
    },
    resources: [
      { type: "skill", id: "live-script-generator", label: "直播话术生成", path: ".opencode/skills/live-script-generator/SKILL.md" },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用直播话术生成器来 ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "live-script-generator", label: "已启用" },
    ],
    lifecycle: { reload: ["skills"] },
    defaultEnabled: true,
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "digital-human-storyboard",
    name: "数字人分镜脚本 (Digital Human Storyboard)",
    description: "数字人直播分镜脚本生成器：把口播稿拆解成可直接交给数字人驱动/剪辑的分镜表（镜头运动/画面/口播/字幕/时长/音效），覆盖六类岗位视角与开场留人/互动/产品FAB/逼单/复购五段结构。不负责驱动渲染。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    composer: { prompt: "使用数字人分镜脚本来 " },
    setup: {
      instructions: "数字人分镜脚本为内置技能，无需额外配置。在对话中描述数字人人设、品类与货品，即可生成分镜表。建议先用直播话术生成器出稿，再分镜。",
      primaryCta: "开始生成分镜",
    },
    resources: [
      { type: "skill", id: "digital-human-storyboard", label: "数字人分镜脚本", path: ".opencode/skills/digital-human-storyboard/SKILL.md" },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用数字人分镜脚本来 ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "digital-human-storyboard", label: "已启用" },
    ],
    lifecycle: { reload: ["skills"] },
    defaultEnabled: true,
    platform: ["darwin", "linux", "windows"],
  },
  {
    schemaVersion: 1,
    id: "live-control",
    name: "直播切片/场控 (Live Control)",
    description: "直播切片与实时场控 MCP：录播高光识别、直播流实时监控与异常预警、基于数据的行动建议与弹幕回复、整场复盘。平台无关，当前内置离线 Mock 适配器，无需任何平台密钥即可跑通。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { src: "/openwork-mark.svg" },
    composer: { prompt: "使用直播切片/场控来 " },
    setup: {
      instructions: "直播切片/场控为内置 MCP。启用后在对话中描述录播ID或直播ID，即可调用切片分析、场控监控、决策建议与复盘工具。当前为 Mock 适配器（合成数据），接入抖音/视频号/淘宝/快手真实平台时替换 adapter 即可。",
      primaryCta: "启用直播切片/场控",
    },
    resources: [
      {
        type: "mcp",
        id: "live-control-mcp",
        label: "直播切片/场控 MCP",
        mcpServerName: "live-control",
        command: ["npx", "-y", "live-control-mcp"],
        required: true,
      },
    ],
    contributions: [
      { type: "composer-prompt", prompt: "使用直播切片/场控来 ", location: "composer" },
    ],
    enablement: [
      { type: "mcp-connected", ref: "live-control", label: "MCP server connected" },
    ],
    lifecycle: { reload: ["mcp"], detection: ["mcp:live-control"] },
    defaultEnabled: false,
    platform: ["darwin", "linux", "windows"],
  },
];
