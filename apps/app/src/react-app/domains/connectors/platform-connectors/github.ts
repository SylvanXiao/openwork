/** GitHub 平台连接器：PAT 走环境变量，注册官方 GitHub MCP server（stdio）。 */
import type { PlatformConnector } from "../platform-connector";

const GITHUB_MCP_NAME = "github";
const GITHUB_NPM_PKG = "@modelcontextprotocol/server-github";

function buildGithubCommand(): string[] {
  return ["npx", "-y", GITHUB_NPM_PKG];
}

export const githubConnector: PlatformConnector = {
  id: GITHUB_MCP_NAME,
  titleKey: "connectors.github_title",
  descriptionKey: "connectors.github_description",
  credsStorageKey: "openwork.github-mcp.creds",
  fields: [
    { key: "token", labelKey: "connectors.github_token", secret: true },
  ],
  connectCommand: buildGithubCommand,
  directoryEntry: (creds) => ({
    name: GITHUB_MCP_NAME,
    type: "local",
    command: buildGithubCommand(),
    environment: { GITHUB_PERSONAL_ACCESS_TOKEN: (creds.token ?? "").trim() },
    oauth: false,
    description: "GitHub MCP (official reference server, stdio)",
  }),
  registerButtonKey: "connectors.github_register",
  statusKeys: {
    connected: "connectors.connected",
    connectFailed: "connectors.connect_failed",
  },
};
