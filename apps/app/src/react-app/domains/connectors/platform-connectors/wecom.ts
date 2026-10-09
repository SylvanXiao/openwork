/** 企业微信（WeCom）平台连接器：群机器人 Webhook Key 走环境变量，注册 stdio MCP。 */
import type { PlatformConnector } from "../platform-connector";

const WECOM_MCP_NAME = "wecom";
const WECOM_NPM_PKG = "@futuretea/wecom-bot-mcp-server@latest";

function buildWecomCommand(): string[] {
  return ["npx", "-y", WECOM_NPM_PKG];
}

export const wecomConnector: PlatformConnector = {
  id: WECOM_MCP_NAME,
  titleKey: "connectors.wecom_title",
  descriptionKey: "connectors.wecom_description",
  credsStorageKey: "openwork.wecom-mcp.creds",
  fields: [
    {
      key: "botKey",
      labelKey: "connectors.wecom_bot_key",
      placeholder: "693axxx6-7aoc-4bc4-97a0-0ec2sifa5aaa",
      secret: true,
    },
  ],
  connectCommand: buildWecomCommand,
  directoryEntry: (creds) => ({
    name: WECOM_MCP_NAME,
    type: "local",
    command: buildWecomCommand(),
    environment: { WECOM_MCP_WECOM_BOT_KEY: (creds.botKey ?? "").trim() },
    oauth: false,
    description: "WeCom (企业微信) group bot MCP (stdio)",
  }),
  registerButtonKey: "connectors.wecom_register",
  statusKeys: {
    connected: "connectors.connected",
    connectFailed: "connectors.connect_failed",
  },
};
