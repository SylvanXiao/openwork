/** 飞书 / Lark 平台连接器（user-level）：浏览器授权 → 注册 stdio MCP。 */
import type { PlatformConnector } from "../platform-connector";

const FEISHU_MCP_NAME = "feishu";
const FEISHU_NPM_PKG = "@larksuiteoapi/lark-mcp";

function buildFeishuLoginCommand(creds: Record<string, string>): string[] {
  const appId = (creds.appId ?? "").trim();
  const appSecret = (creds.appSecret ?? "").trim();
  return ["npx", "-y", FEISHU_NPM_PKG, "login", "-a", appId, "-s", appSecret];
}

function buildFeishuCommand(creds: Record<string, string>): string[] {
  const appId = (creds.appId ?? "").trim();
  const appSecret = (creds.appSecret ?? "").trim();
  return [
    "npx",
    "-y",
    FEISHU_NPM_PKG,
    "mcp",
    "-a",
    appId,
    "-s",
    appSecret,
    "-l",
    "zh",
    "-m",
    "stdio",
    "--oauth",
    "--token-mode",
    "user_access_token",
  ];
}

export const feishuConnector: PlatformConnector = {
  id: FEISHU_MCP_NAME,
  titleKey: "connectors.feishu_title",
  badge: "user-level",
  credsStorageKey: "openwork.feishu-mcp.creds",
  fields: [
    { key: "appId", labelKey: "connectors.feishu_app_id", placeholder: "cli_xxx" },
    { key: "appSecret", labelKey: "connectors.feishu_app_secret", secret: true },
  ],
  loginCommand: buildFeishuLoginCommand,
  connectCommand: buildFeishuCommand,
  directoryEntry: (creds) => ({
    name: FEISHU_MCP_NAME,
    type: "local",
    command: buildFeishuCommand(creds),
    oauth: false,
    description: "Feishu/Lark MCP (user-level)",
  }),
  steps: {
    loginTitleKey: "connectors.feishu_step1",
    loginDescKey: "connectors.feishu_step1_desc",
    registerTitleKey: "connectors.feishu_step2",
    registerDescKey: "connectors.feishu_step2_desc",
    registerHintKey: "connectors.feishu_step2_hint",
  },
  registerButtonKey: "connectors.feishu_register",
  statusKeys: {
    connected: "connectors.feishu_connected",
    connectFailed: "connectors.feishu_connect_failed",
  },
};
