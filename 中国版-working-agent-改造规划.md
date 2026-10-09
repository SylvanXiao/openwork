# 中国版 Working Agent 改造规划（基于 OpenWork）

> 状态：规划锚点文档（v1，2026-10-08）  
> 基于 `dev` 分支 worktree `workbuddy/dev-c5a113ca` 的实际代码梳理。  
> 目标：以 OpenWork 为底座，做一款中国本地化的 working agent 产品。

---

## 0. 文档目的

本文是后续执行的锚点。所有阶段改动都先回到这里对齐，避免方向漂移。  
本文结论来自实际读码（README / AGENTS.md / HANDOFF.md / package.json / provider 配置 / 模型目录 / i18n），标注「已核实」的为读码确认，「推断」为基于架构的合理判断，需执行时再验证。

---

## 1. 产品目标

**中国版 working agent** = 本地优先的 AI agent 工作台，能在用户本机文件上干活，跑多模型，支持 skills / MCP / 自动化；在此之上做四件事：

1. 全中文界面（开箱中文，不依赖用户切语言）
2. 默认模型指向国产（DeepSeek / 通义 / 智谱 / 月之暗面）
3. 中国生态连接器（飞书 / 企业微信 / 微信 / 钉钉 / 阿里云）
4. 中国鉴权（本地账号 → 微信 / 手机号 / 钉钉 SSO）

与上游关系：**fork 改造，不做上游贡献**。产品形态和上游不同（本地化 + 中国生态），不谋求合回主干。

---

## 2. 底座评估（已核实，比预期友好）

| 维度      | 结论     | 证据                                                                                                                                                                                          |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型目录    | 已深度中国化 | `ee/apps/gateway/src/models/openwork-models.json`、`base.json` 已含 DeepSeek / Qwen(通义) / GLM(智谱) / Kimi(月之暗面) / MiniMax；provider 走 `@ai-sdk/openai-compatible`（带 `api` 基址），国内 OpenAI 兼容端点直接能接 |
| 连接器架构   | 可插拔插件  | 当前分支主线即「平台连接器变插件实例 + 连接器页」；GitHub 已是第二个插件实例。飞书/企微可作为同类插件实例接入                                                                                                                                |
| 云控面 Den | 可选     | AGENTS/README 明确「桌面模式文件留本地，云可选」；`ee/` 为 EE 授权（≤5 人免费，30 天评估免费，dev/test 免费，发布 2 年后转 MIT）。可做纯本地版 MVP，避开 Google/Microsoft OAuth 与 EE 企业限制                                                      |
| i18n    | 骨架已搭   | `apps/app/src/i18n/locales/zh.ts` 已存在，仅覆盖约 57%（1202 行 vs `en.ts` 2111 行）                                                                                                                    |

**结论**：不需要重写 agent 引擎。工作量集中在「本地化 + 默认编排 + 中国连接器 + 鉴权」四块。

---

## 3. 真实缺口（决定工作量）

1. **中文 UI 不全** — `zh.ts` 约 57% 覆盖，需补全并以中文为默认。
2. **默认 provider 指向 OpenWork Gateway / 西方模型** — 需改默认编排，把国产模型设为开箱默认；并解除对 OpenWork 托管 Gateway 的强依赖。
3. **缺中国生态连接器** — 飞书 / 企业微信 / 微信 / 钉钉 / 阿里云；当前 connectors 仅有平台 MCP + 自定义 MCP + GitHub 插件实例。
4. **Den 鉴权为 Google / Microsoft OAuth** — 团队版需换微信 / 手机号 / 钉钉 / 飞书 SSO。
5. **环境未就位** — `.nvmrc` 钉 Node 24，本机 managed node 为 22.22.2；pnpm 11.4.0 已就位。
6. **（上游历史缺口，见 HANDOFF）** — Agents/commands 标签仍为本地清单；MCP 三个来源未统一；本地 MCP `needs_auth` 在 `+` 面板缺登录入口；缺 `+` 菜单 UI 的 testkit。第 6 条在 P3 顺手填。

---

## 4. 关键决策（执行前需拍板）

- **D1 fork 结构**：建议「fork 仓库 + 本地优先桌面，先不做 Den」。最低风险、最快出可演示中文版。
- **D2 Den 去留**：MVP 砍 Den（纯本地账号）。团队/企业版再考虑自托管 Den 或自研轻量控制面。
- **D3 默认模型编排**：默认把国产模型置顶；catalog 已含，主要改默认 provider 列表与呈现顺序，不碰模型定义。**按 token 费用（输入/输出，单位 USD/1M，取自模型目录，需双源核验）的推荐默认置顶顺序**：
  1. DeepSeek V4 Flash（0.098 / 0.196，最便宜日常首选）
  2. Qwen3 235B-A22B（0.069 / 0.455，便宜且强）
  3. GLM-5.3-Flash（0.201 / 0.5，便宜多模态）
  4. DeepSeek V3.2（0.217 / 0.326）
  5. Qwen3.5 122B / 397B-A17B（0.4–0.5 / 2.65–3.46）
  6. Kimi K2.5（0.495 / 2.768，长上下文推理）
  7. MiniMax-M2.5（0.3 / 1.2）
  8. GLM-5 / 5.3（1.4 / 4.4，旗舰）
  9. DeepSeek V4 Pro（1.73 / 3.46，百万上下文）
  10. Qwen3.8 2.4T-A95B（2.5 / 6，最强最贵）
  > 注：价格为 OpenWork 目录快照，官方直连可能更低；置顶顺序以「便宜够用优先」，旗舰放后。
- **D4 许可证**：核心 `apps/` `packages/` 为 MIT，可自由 fork；`ee/` 为 EE 授权。砍 Den 后基本不触及 EE 限制；若未来用 Den 企业功能需订阅（≤5 人免费）。

---

## 5. 分阶段规划

### P0 — 决策锁定 + 环境跑通（前置，必做）

- **目标**：可运行 dev 环境 + 确认本地优先模式无需 Den。
- **动作**：
  - 装 Node 24（隔离运行时，不污染本机），对齐 `.nvmrc`。
  - `corepack enable` → `pnpm install`。
  - 跑通 `pnpm dev`（桌面 Electron）与 `pnpm dev:web-local`（headless web，验证无 Den 也能起）。
  - 用 `pnpm evals:pr` / `pnpm evals:e2e` 验证测试链路。
- **涉及**：`.nvmrc`、`package.json` scripts、`pnpm-workspace.yaml`。
- **产出**：可复现启动步骤文档 + 跑通的开发环境。
- **风险**：Node 版本 / pnpm 链接在沙箱可能有坑（参考历史：pnpm isolated 链接器、Git Bash 软链等问题），预留排错时间。

### P1 — 本地化（bounded，最确定）✅ 已完成（2026-10-08）

- **目标**：全中文 UI，中文为默认语言。
- **动作**：
  - 补全 `apps/app/src/i18n/locales/zh.ts` 到与 `en.ts` 同覆盖。
  - 默认 locale 设为 `zh`；中文术语表（provider 名、功能名、报头）。
  - 中文默认值：空状态文案、引导、错误提示。
- **涉及**：`apps/app/src/i18n/**`。
- **产出**：100% 中文界面。
- **风险**：低。需保证新增英文文案同步有中文 key（在 CI 里加 i18n 缺失检查最佳）。
- **实测结论（已核实）**：
  - `zh.ts` 由 1192 条补齐到 **2104 条 = en.ts 全量覆盖**，删除 4 条 en 已废弃的残留 key（den.status_loaded_orgs / extensions.plugin_count / model_picker.model_count / status.providers_connected），无空值、无遗漏。
  - 默认语言：`apps/app/src/i18n/index.ts` 中 `localeValue` 初值与 `initLocale` 回退均由 `en` 改为 `zh`，回退链（zh→en→key）与 `as const` 类型均保持正确。
  - 术语约定：OpenWork/OpenCode/Den/MCP/Cloud/Library/Marketplace/Connect/OAuth/API/URL/SKILL.md 等产品/协议名保留英文；功能名词按既有 `zh.ts` 风格译为 工作区/会话/命令/插件/技能/智能体/连接/通知 等。
  - 类型校验：`tsc -p`（针对 i18n 子模块，`strict` 模式）**exit 0，无报错**。
  - 维护工具留档：仓库根 `apply-zh.cjs`（按 en 顺序重建 zh.ts）+ `zh-overrides.cjs`（中文覆盖字典）；下次 en 新增 key 时重跑 `diff-locales.cjs` 即可定位待译、增量补译后重跑 `apply-zh.cjs`。

**P1 补审计（2026-10-08，收口可演示中文版时做）**：
- **发现**：`diff-locales.cjs` 被文档引用但**实际不存在**（只有 `apply-zh.cjs` + `zh-overrides.cjs`）——已补齐该校验工具（报 missing / extra / 空值 / 与英文同值，退出码 2 = 未对齐）。
- **发现更关键的问题**：P1 达成的是 **key 覆盖率 100%，不等于文案都译了**。有 64 条 key 存在但值仍是英文——其中 `settings.runtime_config_*`（14 条）、`settings.server_endpoints_*`（12 条）等普通 UI 文案**从未进过覆盖字典**，属真漏翻。
- **已补翻 32 条**：runtime_config 14 + server_endpoints 12 + `settings.tab_cloud_account` / `tab_cloud_providers` / `tab_description_cloud_account` / `group_cloud` 4 + `composer.skill_source`（→"技能"）/ `session.permission_detail_agent`（→"智能体"）2。全部登记进 `zh-overrides.cjs` 后跑 `apply-zh.cjs` 重建，重建前后 diff = **64 行（32 键 × 新旧），无附带重排**，顺带证明该工具幂等。
- **剩余 32 条刻意保留英文**（已逐条核过）：品牌产品名（GitHub / OpenWork / OpenWork Cloud / OpenCode / Context7 / Linear / Notion / Sentry / Stripe）、协议技术名（MCP / OAuth / URL / Beta）、占位符与示例值（`App ID`、`npx -y @modelcontextprotocol/...`、`https://api.githubcopilot.com/mcp/`、分隔符 `, ` / ` · `）。
- **✅ 已决策并落地（2026-10-08，产品拍板）**：`context_panel.always_available` 的 key 语义为「始终可用」，中文取 **`始终可用（工作区根目录不可移除）`**——以 key 语义打底，同时把英文原文那层「根目录不可移除」带进来。英文原文 `"Workspace root folder can't be removed"` 保留不改（英文 UI 语义成立）。代码背景：该 tooltip 在 `authorized-folders-panel.tsx:98-111`，工作区根目录行**不渲染删除按钮**（普通文件夹才给 X 按钮），只渲染一个 Info 图标 + tooltip，两层意思正好对得上。改动仅 1 行，对齐保持 2114/2114。
- **现状**：en 2114 / zh 2114，missing 0 / extra 0 / empty 0，`node diff-locales.cjs` 退出码 0。

### P2 — 模型中国化（核心体验）✅ 已完成（2026-10-08）

- **目标**：开箱即用国产模型，不依赖 OpenWork Gateway。
- **动作**：
  - 默认 provider 列表置顶 DeepSeek / 通义 / 智谱 / 月之暗面（catalog 已含，改编排与顺序）。
  - 新增国内聚合网关接入示例（如硅基流动 / 阿里云百炼 / 智谱开放平台，走 OpenAI 兼容）。
  - 解除默认对 `openwork` 托管 provider 的强依赖（保留为可选项）。
- **涉及**：`ee/apps/gateway/src/models/*.json`、`apps/app/src/react-app/domains/connections/provider-auth/cloud-provider-config.ts`、`apps/app/src/react-app/domains/settings/**`。
- **产出**：中文开箱即用的国产模型选择。
- **风险**：中。模型能力/价格随版本变，需接双源核验；默认模型策略要可配置。
- **实测结论（已核实）**：
  1. **推荐模型改国产优先**：`apps/app/src/app/defaults/models.ts` 的 `RECOMMENDED_MODEL_PATTERNS` 由 `["claude-opus-4","gpt-5.5","kimi-k2.6","glm-5.2"]` 换成国产 4 家旗舰：`deepseek-v4-flash` / `qwen-turbo` / `qwen-plus` / `glm-5.2` / `kimi-k2.6`（子串匹配模型 ID，已在 `isRecommendedModel` 中验证可命中 `deepseek/deepseek-v4-flash`、`alibaba/qwen-turbo`、`alibaba/qwen-plus`、`z-ai/glm-5.2`、`moonshotai/kimi-k2.6`）。这是「国产置顶」的真正生效杠杆（选择器按 provider 字母序 + 组内模型名排序，推荐星标在组内置顶）。
  2. **国内聚合网关接入示例**：在 `apps/app/src/app/extensions.ts` 的 `BUILT_IN_OPENWORK_EXTENSION_MANIFESTS` 末尾新增 3 个 builtin provider 扩展——`siliconflow-cn`（硅基流动）、`alibaba-cn`（阿里云百炼）、`zhipuai`（智谱开放平台），均走 `@ai-sdk/openai-compatible`，带中文 setup 指引与 composer-prompt；`platform: ["darwin","linux","windows"]`（桌面端，不进 web）。
  3. **精选目录补 Qwen/通义**：`ee/apps/gateway/src/models/openwork-models.json` 顶端补 3 条 `alibaba/qwen-turbo`、`alibaba/qwen-plus`、`alibaba/qwen3-235b-a22b`（字段取自 `base.json` 真实模型对象，JSON 校验通过，12 条）。
  4. **解除对 openwork 托管 provider 强依赖**：架构上已满足——`DEFAULT_MODEL` 仍是本地回退 `{providerID:"opencode",modelID:"big-pickle"}`；`openwork-models-promo.ts` 的 `areOpenWorkModelsPromosDisabled()` 在 self-hosted/local 控制面（即本 MVP，D1/D2 砍 Den）直接返回 true，OpenWork Models 订阅 upsell 不会向本地用户强推。用户用任意国产 provider 即可开箱，无需 OpenWork Cloud。
  5. **关键纠错（已核实，重要）**：`openwork-models.json` 在仓库内**无任何 import**（网关 `provider-catalog.ts` 只读 `base.json`，`app.ts` 只 Serv `models-site/models/api.json`）。故「真实在跑的模型目录」是 `base.json`——而它**已经高度中国化**：含 `alibaba`/`alibaba-cn`、`zhipuai`、`moonshotai`/`moonshotai-cn`、`deepseek`、`siliconflow`/`siliconflow-cn`、`volcengine`、`stepfun`、`tencent-*`、`minimax-cn` 等，且 `-cn` 变体指向国内 endpoint（如 `dashscope.aliyuncs.com`、`api.siliconflow.cn`、`open.bigmodel.cn`、`api.moonshot.cn`）。所以「国产模型置顶」的真正抓手是 `RECOMMENDED_MODEL_PATTERNS`（第 1 点）与选择器排序，而非改 `openwork-models.json`。
  6. **测试同步**：`apps/app/src/app/constants.test.ts` 的 platform 过滤断言已更新（darwin 含 6 个、linux 含 5 个，web 仍为 `["ollama"]`）。`extension-taxonomy.test.ts` 不受影响（只遍历固定 3 个 id）。
  7. **类型校验**：`tsc --strict --noEmit` 对 `apps/app/src/app/extensions.ts` 单独验证 **exit 0**；`openwork-models.json` Node `JSON.parse` 通过。
  8. **未做的边界**：未改 `cloud-provider-config.ts`（默认 provider 编排的「可选化」已由 D1/D2 本地化实现，强行改易碰 EE/Cloud 路径）；`RECOMMENDED_MODEL_PATTERNS` 顺序按 D3 费用快照，真机上线前需双源核验当前价。

**P2延伸（2026-10-09）✅ 已完成**：
- **范围纠正（重要）**：`base.json` 顶层 provider 里，国产 provider 实际只就绪 **5 家**（火山方舟 `volcengine`、MiniMax `minimax-cn`、阶跃 `stepfun`、月之暗面 `moonshotai-cn`、腾讯 `tencent-tokenhub`）。`baichuan` / `qianfan` / `baidu` **均不在目录**（此前 grep 把模型 id 里的 `baichuan` 子串误判为顶层 provider，已纠正）。
- **5 家 catalog 就绪 → 纯加 builtin 卡片**：在 `extensions.ts` 的 `BUILT_IN_OPENWORK_EXTENSION_MANIFESTS` 末尾镜像既有 3 张卡，新增 5 张（硬编中文、不碰 i18n、声明 `@ai-sdk/openai-compatible`、platform 桌面三端）。
- **2 家需补 catalog 条目**：`baichuan`、`qianfan` 在 `base.json` 新增顶层 provider（api + npm + env + models 目录）；`models` 价格按 ~7.1 RMB/USD 折算 USD/1M，**属估算值，上线前需双源核验**。同步补 builtin 卡片。
- **注意点**：`minimax-cn` 在 `base.json` 的 `api` 是 **Anthropic 兼容端点**（`/anthropic/v1`），与卡片声明的 openai-compatible 可能不符，真机验收需留意；百度的 ERNIE 模型也可经既有硅基流动卡片间接选用。
- **验证**：apps/app 全量 `tsc --noEmit` exit 0；`diff-locales` 对齐；`provider-catalog.ts` 仅读 provider 顶层 npm/api/env，新增条目不影响网关解析。

### P3 — 连接器中国化（护城河之一）🚧 进行中（2026-10-08）

- **目标**：中国生态连接器，且填上游历史缺口。
- **动作**：
  - 仿 `platform-connector.ts` + GitHub 插件实例模式，新增飞书 / 企业微信 / 微信 / 钉钉 connector 插件实例。
  - 填 HANDOFF 缺口：本地 MCP `needs_auth` 在 `+` 面板加登录入口；统一 MCP 三个来源（本地 / Den 插件 / 组织连接）。
  - 为连接器页 enable/remove 流程补 e2e testkit（当前分支已做失败兜底 UI，缺测试证据）。
- **涉及**：`apps/app/src/react-app/domains/connectors/**`（connectors-page.tsx / platform-connector.ts / use-connectors-mcp.ts / platform-connectors/）。
- **产出**：中国生态连接器 + 更完整的连接器测试。
- **风险**：中。各平台 OAuth/开放 API 需按官方文档接，且涉及对外动作需谨慎（参考用户内容安全红线习惯：对外通信与凭证处理先确认）。

**已落地（2026-10-08，连接器插件实例部分）**：
1. **飞书其实已存在（纠错）**：`platform-connectors/feishu.ts` 早已实现并登记（`@larksuiteoapi/lark-mcp`，两步引导 + `user_access_token`），`connectors.feishu_*` 10 条 i18n 已齐。故 P3 真正待补的是**企业微信 / 钉钉 / 微信**。
2. **企业微信（新增）**：`platform-connectors/wecom.ts`，包 `@futuretea/wecom-bot-mcp-server@latest`（`npx -y …`，默认 stdio），凭据字段 `botKey`（群机器人 Webhook Key），经环境变量 `WECOM_MCP_WECOM_BOT_KEY` 注入——密钥不出现在界面展示的注册命令里（模式同 GitHub）。可向企微群发文本 / Markdown / 图片 / 文件 / 图文卡片。
3. **钉钉（新增）**：`platform-connectors/dingtalk.ts`，包 `dingtalk-mcp@latest`（官方 `@open-dingtalk`），字段 `clientId` / `clientSecret`，经 `DINGTALK_Client_ID` / `DINGTALK_Client_Secret` 注入；**未硬编码 `ACTIVE_PROFILES`**，沿用服务端默认启用档（通讯录 / 机器人消息），更多服务（日程 / 待办）由用户注册后自行追加——避免过度索取权限导致启动失败。
4. **注册与文案**：二者登记进 `platform-connectors/index.ts`（顺序 飞书 → 企微 → 钉钉 → GitHub）；`i18n/locales/en.ts`、`zh.ts` 各补 9 条键（wecom 4 + dingtalk 5），其余语言回退英文。**连接器页零改动**（注册表驱动，验证可插拔性）。
5. **微信（个人号）未纳入**：个人微信无官方 MCP，社区包多违反 ToS 且不稳定；企业微信即官方企业级等价物，已覆盖。待用户确认是否需要社区版。

**HANDOFF 上游缺口 —— 填法（2026-10-08 第二批）**：
6. **本地 MCP `needs_auth` 登录入口 ✅ 已补**：`composer.tsx` 的 `renderConnectionRows`（`+` 菜单 `connections` 分区，`toolMenuSection === "connections"` 时渲染）在既有「组织连接登录」分支之后新增本地分支——本地 MCP 处于 `needs_auth` / `reconnect_required` 时渲染可点击「登录」按钮，点击调用 `onOpenSettingsSection("connections")` 进入 MCP 设置页（`authorizeMcp` 在此触发浏览器 OAuth）。新增 i18n `composer.local_mcp_sign_in`（en/zh）。做成「入口」而非把 OAuth 内嵌 composer：composer 未持有 connections store，`onOpenSettingsSection` 是既有且已验证的扩展点（原「Configure」按钮同款路径）。
7. **MCP 三来源统一 —— 已核实为已统一（无需改）**：`session-surface.tsx` 已把本地 workspace MCP（`opencodeClient.mcp.status`）与 Connect/Den 插件 MCP（`connectCapabilityInventory.mcpServers`）合并为 `toolMcpServers`；`composer.tsx` 的 `mergeComposerConnectionInventory` 再叠加「组织直连」（`orgConnections`）并按 `orgMcpConnectionId` 去重插件副本。三来源在 `+` 面板已归一，HANDOFF 该条属旧描述。
8. **测试 ⚠️ 部分**：新增 `apps/app/tests/platform-connectors.test.ts`（bun:test，断言 4 个平台连接器 id / 顺序、env 注入与 trim、命令不泄露密钥、飞书保留浏览器授权步）。**沙箱无 bun**，未能在本机跑 bun；已用「`tsc` 编译为 CJS + `node` 断言」等价执行，全部通过。连接器页 enable/remove 的 e2e testkit 仍未做（本仓 tape 依赖 `spec.world` testkit，沙箱不可用）。
9. **验证方式（受限环境）**：①隔离 tsconfig 校验改动文件 0 报错；②`tsc --noResolve` 解析 `composer.tsx`，改动区（约 795–845 行）无任何语法 / 类型诊断；③`tsc → CJS → node` 真跑连接器断言全过；④全量 `pnpm --filter @openwork/app typecheck` 因缺 `@types/node` / `vite/client` type lib 跑不通（**环境既有问题，非本次改动**）。

### P4 — 鉴权中国化（团队版才需要）

- **目标**：中国登录方式。
- **动作**：
  - 纯本地版：本地账号即可（MVP 不做 P4）。
  - 团队版：替换 Den 的 Google/Microsoft OAuth 为微信 / 手机号 / 钉钉 / 飞书 SSO；或自研轻量控制面。
- **涉及**：`ee/apps/den-api`、`ee/apps/den-web` 鉴权模块（若保留 Den）；否则自建。
- **产出**：中国登录。
- **风险**：高（若做团队版）。SSO 对接 + 合规成本高，建议 MVP 后。

### P5 — 部署与合规

- **目标**：可上线、数据合规。
- **动作**：国内云托管；数据驻留（用户文件默认留本机）；内容安全策略；备案/等保视规模。
- **涉及**：`packaging/`、`docs/deploy/**`、`docs/aws-eks-helm.md` 等可借鉴做国内云版本。
- **产出**：可上线版本 + 合规说明。
- **风险**：中高。合规需专业确认。

### P6 — 差异化护城河（AI×直播）

- **目标**：你的独特价值，区别于通用 agent 工作台。

**P6 起步（2026-10-09）**：
- **话术生成 skill 已完成（第一个 wedge）**：`.opencode/skills/live-script-generator/SKILL.md`，把直播行业 6 类岗位（企宣/星探/摘星/前台/讲师/直播招募）经验固化为中文话术方法论，覆盖开场留人/互动破冰/产品FAB/逼单转化/结尾复购五大模块，内置《广告法》合规红线。话术属纯提示词 skill，无需外部直播 API。
- **剩余三场景（待做）**：自动切片、智能场控、数字人。切片/场控需接具体直播平台实时/录制 API，适合做成 **MCP**（而非 skill）；数字人偏离纯 agent 工作台定位、风险最高，建议最后或仅做"数字人脚本/分镜生成"而非驱动渲染。
- **打包方式待定**：当前话术 skill 放在本地 `.opencode/skills/`（agent 立即可用）；要作为产品差异点随产品分发，需提升为 builtin 扩展（extension manifest 的 `skill` 资源类型），待用户拍板。
- **动作**：接直播平台 API；做自动切片 / 话术生成 / 智能场控 / 数据看板 等 MCP 与 skill；沉淀直播行业 6 类岗位链路经验为模板。
- **涉及**：`packages/mcp-apps`、`packages/sdk`、skills 体系。
- **产出**：直播行业专属 agent 能力。
- **风险**：依赖 P3 连接器与 skill 体系成熟。

---

## 6. 环境要求与已知坑

- **Node**：`.nvmrc` = 24；本机 managed node = 22.22.2 → 需装/切 Node 24 再 `pnpm dev`。
- **pnpm**：11.4.0 已就位（按 `packageManager` 用 `corepack enable`）。
- **DCO**：上游要求 `git commit -s`；fork 后可自行决定，但保留签名习惯无害。
- **测试契约**：运行可见行为改动须带 `evals/specs/**` 测试证据（AGENTS/README 明确）。
- **历史坑（本机沙箱）**：pnpm isolated 链接器只落地 `@scope` 包、Git Bash `ln -s` 软链 node 跟随不了、原生 postinstall 常失败 → 用 `--ignore-scripts` + hoisted 链接器。

---

## 7. 里程碑与执行顺序

```
P0 环境跑通 ──► P1 全中文 UI ──► P2 国产模型默认 ──► [可演示中文版 MVP]
                                                         │
                                              P3 中国连接器（护城河）
                                                         │
                                              P4 鉴权(团队版) ─► P5 部署合规
                                                         │
                                              P6 AI×直播差异化
```

**推荐节奏**：先 P0+P1+P2 出可演示中文版（工作量最确定、风险最低），验证产品形态后再投入 P3/P6（护城河）与 P4/P5（团队/合规）。

---

## 8. 风险与合规提示

- **EE 许可证**：砍 Den 基本不触及；用 Den 企业功能需订阅（≤5 人免费）。fork 核心 MIT 部分自由。
- **数据驻留**：默认本地优先天然合规友好，对外同步需明示。
- **上游追踪成本**：fork 后需定期 rebase `dev` 拿安全/引擎更新；连接器插件架构可降低冲突面。
- **对外动作**：接各平台 OAuth / 处理用户凭证 / 发布内容，先确认再动手（凭证与对外通信属敏感操作）。

---

## 9. 决策确认记录（2026-10-08）

1. **D1 确认**：fork + 本地优先，先砍 Den。✅
2. **目标用户**：个人 / 小团队（≤5）/ 企业 三档都覆盖。→ P4/P5 保留但降优先级（本地优先已覆盖个人/小团队；企业版后续做 P4 鉴权 + P5 合规）。
3. **默认国产模型顺序**：国产优先，按 token 费用排（见 D3 推荐置顶顺序）。✅
4. **P6 直播差异化**：确认最后做（先出通用中文版）。✅

---

## 10. P0 环境实测结论（2026-10-08，本沙箱）

**已验证可用的工具链**

- Node：系统版 **24.16.0**（`C:\Program Files\nodejs`），满足 `.nvmrc`，无需另装。
- pnpm：**11.4.0**；代理 `HTTP(S)_PROXY=http://127.0.0.1:58367` 可达 npm registry（200 OK）。
- 依赖安装：`pnpm install` 成功，1751 个包全部 resolved/added，零报错、零下载（命中全局 store `C:\Users\Administrator\AppData\Local\pnpm\store\v11`）。

**坑1 — pnpm 脚本走 cmd，不认 POSIX 写法**：Windows 下 pnpm 默认用 `cmd.exe` 跑脚本，`OPENWORK_DEV_MODE=1 node ...` 这种 `VAR=val cmd` 写法会报「不是内部或外部命令」。绕过：直接在 Git Bash 里用 env 前缀跑底层 `node` 命令（Git Bash 认 `VAR=val cmd`），或设 `npm_config_script_shell=/bin/sh`（本环境未生效）。


**坑2 — pnpm workspace 软链静默失败（已修复）**：本沙箱 pnpm 装完只建了 workspace 包的空目录，没生成 junction 软链，`@openwork/*` 全部解析不到。重装（`--force` / `mv node_modules` 后重装）均无效。最终用 **PowerShell 原生 junction** 修复：脚本 `C:/Users/Administrator/fix-workspace-links.ps1` 解析 42 个 workspace 包的交叉依赖，逐个建 junction，node 即可解析 `@openwork/paths` 等。该脚本可复现，列入真机/新沙箱的兜底步骤。

**坑3 — 沙箱禁止 spawn `pnpm`/`.cmd`（硬限制，无法绕过）**：`child_process.spawn('pnpm', ...)` 报 `EBUSY`（不是 ENOENT），即沙箱拦截 cmd.exe 进程。`dev:headless-web` 正是用 `spawn('pnpm', ...)` 起 Vite + openwork-server，故**本沙箱无法真正拉起 dev server**。

- 结论：代码层 prerequisites 已全部验证——`openwork-server` 不依赖任何数据库（无 mysql/postgres/prisma/redis），本地优先模式**无需 Den**；在普通 Windows/Linux 开发机 `pnpm install && pnpm dev` / `pnpm dev:web-local` 可正常起。本沙箱仅因禁止 spawn cmd 而受限。
- 替代验证手段：用 `node node_modules/typescript/bin/tsc -p <pkg>/tsconfig.json` 直接跑类型检查（不经 pnpm，不 spawn cmd），所以 **P1/P2 的代码改动可在本沙箱用 tsc 验证**。

**P0 收尾判断**：环境/工具链/依赖/链接均已就绪；完整 server 启动受沙箱 cmd 限制，需在真机验证。下一步转 P1（i18n 本地化）——这是能在本沙箱落地并 tsc 验证的代码工作。

---

*下一步：P1 全中文 UI（补全 `zh.ts` 至 100% 覆盖 + 默认中文）——可用直接 tsc 验证，不依赖起 server。*
