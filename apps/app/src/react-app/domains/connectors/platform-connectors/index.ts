/** 平台连接器注册表：连接器页按这里的顺序渲染平台卡片。 */
import type { PlatformConnector } from "../platform-connector";
import { dingtalkConnector } from "./dingtalk";
import { feishuConnector } from "./feishu";
import { githubConnector } from "./github";
import { wecomConnector } from "./wecom";

export const platformConnectors: PlatformConnector[] = [
  feishuConnector,
  wecomConnector,
  dingtalkConnector,
  githubConnector,
];
