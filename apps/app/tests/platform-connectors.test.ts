import { describe, expect, test } from "bun:test";

import type { PlatformConnector } from "../src/react-app/domains/connectors/platform-connector";
import { platformConnectors } from "../src/react-app/domains/connectors/platform-connectors";

function connector(id: string): PlatformConnector {
  const found = platformConnectors.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing platform connector: ${id}`);
  return found;
}

function credsFor(entry: PlatformConnector, value = "secret-value"): Record<string, string> {
  const creds: Record<string, string> = {};
  for (const field of entry.fields) creds[field.key] = value;
  return creds;
}

describe("platform connector registry", () => {
  test("lists the Chinese-first connector set in a stable order", () => {
    expect(platformConnectors.map((entry) => entry.id)).toEqual([
      "feishu",
      "wecom",
      "dingtalk",
      "github",
    ]);
  });

  test("env-injected connectors never leak secrets into the registered command", () => {
    for (const id of ["wecom", "dingtalk"]) {
      const entry = connector(id);
      expect(entry.connectCommand(credsFor(entry)).join(" ")).not.toContain("secret-value");
    }
  });
});

describe("WeCom connector", () => {
  test("injects the group-bot key via env and trims it", () => {
    const wecom = connector("wecom");
    expect(wecom.connectCommand({ botKey: "  key-123  " })).toEqual([
      "npx",
      "-y",
      "@futuretea/wecom-bot-mcp-server@latest",
    ]);
    const entry = wecom.directoryEntry({ botKey: "  key-123  " });
    expect(entry.name).toBe("wecom");
    expect(entry.type).toBe("local");
    expect(entry.oauth).toBe(false);
    expect(entry.environment).toEqual({ WECOM_MCP_WECOM_BOT_KEY: "key-123" });
    expect(wecom.loginCommand).toBeUndefined();
  });
});

describe("DingTalk connector", () => {
  test("injects client credentials via env and leaves profiles to the vendor default", () => {
    const dingtalk = connector("dingtalk");
    expect(dingtalk.connectCommand({ clientId: "ding-abc", clientSecret: "s3cret" })).toEqual([
      "npx",
      "-y",
      "dingtalk-mcp@latest",
    ]);
    expect(dingtalk.fields.map((field) => field.key)).toEqual(["clientId", "clientSecret"]);
    const entry = dingtalk.directoryEntry({ clientId: " ding-abc ", clientSecret: " s3cret " });
    expect(entry.name).toBe("dingtalk");
    expect(entry.environment).toEqual({
      DINGTALK_Client_ID: "ding-abc",
      DINGTALK_Client_Secret: "s3cret",
    });
    expect(entry.environment).not.toHaveProperty("ACTIVE_PROFILES");
  });
});

describe("Feishu connector", () => {
  test("keeps its browser-authorization step", () => {
    const feishu = connector("feishu");
    expect(typeof feishu.loginCommand).toBe("function");
    expect(feishu.steps?.loginTitleKey).toBe("connectors.feishu_step1");
    expect(feishu.registerButtonKey).toBe("connectors.feishu_register");
  });
});
