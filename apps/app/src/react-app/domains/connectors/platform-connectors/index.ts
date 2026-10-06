/** 平台连接器注册表：连接器页按这里的顺序渲染平台卡片。 */
import type { PlatformConnector } from "../platform-connector";
import { feishuConnector } from "./feishu";
import { githubConnector } from "./github";

export const platformConnectors: PlatformConnector[] = [feishuConnector, githubConnector];
