/** 钉钉（DingTalk）平台连接器：企业内部应用凭证走环境变量，注册官方 stdio MCP。 */
import type { PlatformConnector } from "../platform-connector";

const DINGTALK_MCP_NAME = "dingtalk";
const DINGTALK_NPM_PKG = "dingtalk-mcp@latest";

function buildDingtalkCommand(): string[] {
  return ["npx", "-y", DINGTALK_NPM_PKG];
}

export const dingtalkConnector: PlatformConnector = {
  id: DINGTALK_MCP_NAME,
  titleKey: "connectors.dingtalk_title",
  descriptionKey: "connectors.dingtalk_description",
  credsStorageKey: "openwork.dingtalk-mcp.creds",
  fields: [
    {
      key: "clientId",
      labelKey: "connectors.dingtalk_client_id",
      placeholder: "dingxxxxxxxxxxxxxxxx",
    },
    {
      key: "clientSecret",
      labelKey: "connectors.dingtalk_client_secret",
      secret: true,
    },
  ],
  connectCommand: buildDingtalkCommand,
  directoryEntry: (creds) => ({
    name: DINGTALK_MCP_NAME,
    type: "local",
    command: buildDingtalkCommand(),
    environment: {
      DINGTALK_Client_ID: (creds.clientId ?? "").trim(),
      DINGTALK_Client_Secret: (creds.clientSecret ?? "").trim(),
    },
    oauth: false,
    description: "DingTalk MCP (official @open-dingtalk, stdio)",
  }),
  registerButtonKey: "connectors.dingtalk_register",
  statusKeys: {
    connected: "connectors.connected",
    connectFailed: "connectors.connect_failed",
  },
};
