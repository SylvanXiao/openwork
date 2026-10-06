/**
 * 平台连接器插件接口。
 *
 * 连接器页的平台区由注册表（platform-connectors/index.ts）驱动渲染：
 * 新增一个平台 = 新增一个实现文件并登记进注册表，页面核心零改动。
 * 每个连接器自带凭据字段定义、两步引导文案 key、注册命令与目录条目，
 * 卡片只负责表单渲染、状态与探活。
 */
import type { McpDirectoryInfo } from "@/app/constants";
import type { McpServerEntry } from "@/app/types";

/** 连接器凭据表单里的单个字段。 */
export type PlatformConnectorField = {
  /** 凭据键：creds 记录里的字段名。 */
  key: string;
  /** 输入框标签（i18n key）。 */
  labelKey: string;
  /** 输入框占位符（字面量）。 */
  placeholder?: string;
  /** 密码类字段：输入框打码，可切换明文。 */
  secret?: boolean;
};

/** 两步引导（浏览器授权 → 注册 MCP）的文案 key。 */
export type PlatformConnectorSteps = {
  loginTitleKey: string;
  loginDescKey: string;
  registerTitleKey: string;
  registerDescKey: string;
  registerHintKey?: string;
};

/** 平台连接器在卡片内自己的状态文案 key。 */
export type PlatformConnectorStatusKeys = {
  /** 注册成功后的提示。 */
  connected: string;
  /** 注册失败的兜底提示。 */
  connectFailed: string;
};

export type PlatformConnector = {
  /** 稳定 ID：同时用作 MCP 注册名。 */
  id: string;
  /** 卡片标题（i18n key）。 */
  titleKey: string;
  /** 标题旁的小徽标（字面量，如 "user-level"）。 */
  badge?: string;
  /** 用户需要填写的凭据字段；注册按钮在全部字段非空前保持禁用。 */
  fields: PlatformConnectorField[];
  /** 凭据在 localStorage 的存储键。 */
  credsStorageKey: string;
  /** 可选的一次性浏览器授权命令；存在时卡片渲染两步引导。 */
  loginCommand?: (creds: Record<string, string>) => string[];
  /** 注册用的 MCP stdio 命令。 */
  connectCommand: (creds: Record<string, string>) => string[];
  /** 注册时传给 connectMcp 的 MCP 目录条目。 */
  directoryEntry: (creds: Record<string, string>) => McpDirectoryInfo;
  /** 两步引导文案 key；无浏览器授权步骤的平台可不提供。 */
  steps?: PlatformConnectorSteps;
  /** 注册按钮文案（i18n key）。 */
  registerButtonKey: string;
  /** 卡片内状态提示 key。 */
  statusKeys: PlatformConnectorStatusKeys;
};

/** 从 localStorage 读取该连接器的凭据；只保留字符串字段。 */
export function readStoredCreds(connector: PlatformConnector): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(connector.credsStorageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const creds: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") creds[key] = value;
    }
    return creds;
  } catch {
    return {};
  }
}

/** 把凭据写回 localStorage；存储失败不影响连接流程。 */
export function writeStoredCreds(connector: PlatformConnector, creds: Record<string, string>): void {
  try {
    window.localStorage.setItem(connector.credsStorageKey, JSON.stringify(creds));
  } catch {
    // 存储失败不影响连接
  }
}

/** 该连接器是否已作为 MCP 注册进当前工作区。 */
export function connectorIsInstalled(connector: PlatformConnector, servers: McpServerEntry[]): boolean {
  return servers.some((entry) => entry.name === connector.id);
}
