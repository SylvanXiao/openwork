# MCP 探活端点与引擎同步 — 结构化测试报告

- **报告日期**：2026-10（本轮复核）
- **被测分支**：`dev`（tip `2d102178b`）
- **相关落地提交**：`ce2106783` `fix(server): harden the MCP test endpoint against cold engines and probe floods`
- **测试运行器**：Bun test（`bun --conditions=development test`）
- **测试文件**：`apps/server/src/mcp.test-endpoint.e2e.test.ts`、`apps/server/src/mcp.engine-sync.e2e.test.ts`

---

## 1. 测试范围

本轮聚焦 OpenWork server 的 MCP 能力两条链路：

1. **连接器页 MCP 探活端点** `POST /workspace/:id/mcp/:name/test`
   —— 读引擎 `/mcp` 状态判定注册情况、工具数探测、并发上限、优雅降级。
2. **运行时 MCP ↔ 引擎同步**（`runtime MCP engine sync`）
   —— 热增/热删/启停/重载 MCP 时与托管 OpenCode 引擎的注册、失效证据、降级与并发协调。

这对应此前识别的"未完成工作"：引擎 `/mcp` 5s 阈值竞态、探活并发上限、以及 `probeMcpSettle` 有界关闭。
这些已在 `ce2106783` 全部落地，本报告验证其回归与全链路正确性。

---

## 2. 测试环境（重要）

| 项 | 值 |
| --- | --- |
| 运行时 | Bun v1.4.3（monorepo `apps/server`） |
| 操作系统 | Windows（沙箱） |
| 代理环境变量 | `HTTP_PROXY` / `HTTPS_PROXY` = `http://127.0.0.1:55415`（**全局生效**） |

> ⚠️ **本环境有一个会干扰 e2e 的代理**：Bun 的 `fetch` 会尊重全局 `HTTP_PROXY`，把
> `http://127.0.0.1:<临时端口>/...` 的 localhost 测试请求劫持到该代理，导致请求落到
> mock 引擎、OpenWork 本地处理器根本收不到。这是**环境特性，不是代码缺陷**。
> 复跑时务必先清掉代理：`NO_PROXY='*' HTTP_PROXY= HTTPS_PROXY= http_proxy= https_proxy=`。

---

## 3. 测试用例清单

### 3.1 `mcp.test-endpoint.e2e.test.ts`（12 条）

| # | 用例 | 验证点 |
| --- | --- | --- |
| 1 | connected engine status returns real tool count | 引擎已连接时经 MCP SDK `listTools` 返回真实工具数 |
| 2 | disabled MCP short-circuits to `status=disabled` | 禁用态直接短路，不发起探活 |
| 3 | engine unknown status maps to `unknown` | 引擎返回未知状态映射为 `unknown` |
| 4 | engine without status for this MCP → `not_registered` | 引擎无该 MCP 状态时正确返回 `not_registered` |
| 5 | failed engine `/mcp` probe → `unavailable`（非 `not_registered`） | **核心修复**：引擎探活失败降级为 `unavailable`，不再误报未注册 |
| 6 | needs_auth engine status → `needs_auth` | 需鉴权状态正确映射 |
| 7 | cannot connect to MCP binary → `connected` + `toolCount=0` | **优雅降级**：连不上二进制时返回 `connected`、`toolCount=0`，不挂死 |
| 8 | saturated tool probe cap → `429 mcp_probe_busy` | **并发上限**：在飞探活饱和返回 `429 mcp_probe_busy` |
| 9 | unauthenticated request is rejected | 未鉴权请求被拒（401/403） |
| 10 | unknown MCP name → `404` | 未知 MCP 名返回 `404` |
| 11 | `probeMcpSettle` 及时完成（即使 client/transport close 挂死） | **有界关闭**：远端 transport 卡死时仍按时完成 |
| 12 | `probeMcpSettle` 吞掉 close 错误 | close 异常被安全吞掉，不泄漏 |

### 3.2 `mcp.engine-sync.e2e.test.ts`（25 条）

| # | 用例 | 验证点 |
| --- | --- | --- |
| 1 | reuses unchanged healthy clients but retries disconnected/changed | 复用健康客户端，对断连/变更配置重试 |
| 2 | keeps a bootstrapped client alive across deferred syncs | 延迟同步期间保持引导中的客户端存活 |
| 3 | hot-adds a runtime MCP into the running engine | 热增 MCP 即时同步进引擎 |
| 4 | logs a warning but still returns added row on engine reject | 引擎拒绝热增时记警告且仍返回新增行 |
| 5 | hot-syncs an external engine without trusting its response | 外部引擎热同步不把响应当作可信注册证据 |
| 6 | keeps accepted delivery separate from bounded registration evidence | 已接受投递与有界规范化注册证据分离 |
| 7 | records transport-failure provenance + one deferred re-sync | 记录传输失败来源并执行一次延迟重同步 |
| 8 | serializes workspace MCP sync + coalesces concurrent requests | 串行化同步并合并并发请求为一次最新态收尾 |
| 9 | does not overlap startup registration with explicit reconcile | 启动注册与显式云端对账不重叠 |
| 10 | scopes registration evidence to the concrete server instance | 注册证据限定到具体 OpenWork 实例 |
| 11 | invalidates evidence when engine endpoint changes | 引擎 endpoint 变更时失效证据 |
| 12 | invalidates evidence when a managed engine restarts | 托管引擎同端口重启时失效证据 |
| 13 | revokes evidence when managed engine is no longer alive | 托管引擎失活时撤销证据 |
| 14 | invalidates evidence on stop + requires new generation | 停止后失效证据并要求新服务代际 |
| 15 | expires evidence after bounded freshness window | 超出有界新鲜度窗口后过期 |
| 16 | invalidates evidence before an engine reload attempt | 引擎重载前先失效证据（期望 `502`） |
| 17 | cloud plugin install writes remote MCP + hot-syncs | 云端插件安装写入远程 MCP 并热同步 |
| 18 | cloud plugin install warns for dropped MCP payloads | 丢弃的 MCP 载荷给出警告但仍装技能 |
| 19 | re-registers runtime MCPs after a reload | 重载后重新注册运行时 MCP（期望 `200`） |
| 20 | pushes toggled enabled state to the engine | 启停状态切换推送至引擎（期望 `200`） |
| 21 | disconnects a removed MCP from the engine | 删除 MCP 时与引擎断开（期望 `200`） |
| 22 | reload keeps registering remaining MCPs when one fails | 单个条目失败时仍注册其余（期望 `200`） |
| 23 | startup sync pushes runtime MCPs for every workspace | 启动同步为每个工作区推送运行时 MCP |
| 24 | MCP add still succeeds when the engine is unreachable | 引擎不可达时新增仍成功 |
| 25 | engine reload reports engine-unreachable when down | 引擎宕机时重载报告 `503` + `opencode_engine_unreachable` |

---

## 4. 测试结果

| 维度 | 结果 |
| --- | --- |
| 用例总数 | **37** |
| 通过 | **37** |
| 失败 | **0** |
| `expect()` 断言总数 | 148 |
| 运行耗时 | ~8.7s（2 文件） |
| 运行环境 | 已绕过全局 HTTP 代理（`NO_PROXY='*'`，清空 `HTTP_PROXY`） |

**结论性判定**：在正确的（无代理劫持）环境下，MCP 探活端点与引擎同步相关代码全部正确，
既有的 5s 阈值竞态、并发洪水、挂死风险三类问题均已被 `ce2106783` 修复并通过回归。

---

## 5. 问题与根因分析

### 5.1 现象：最初观察到 7 个 engine-sync 用例"失败"

不带任何改动直接跑 `mcp.engine-sync.e2e.test.ts` 时，出现 7 个用例非预期返回：

| 用例 | 期望 | 实测 |
| --- | --- | --- |
| keeps accepted delivery separate… | `POST /mcp` → 200 | 404 |
| invalidates evidence before reload | `POST /engine/reload` → 502 | 404 |
| re-registers after reload | `POST /engine/reload` → 200 | 404 |
| pushes toggled enabled state | `POST /mcp/:name/enabled` → 200 | 404 |
| disconnects a removed MCP | `DELETE /mcp/:name` → 200 | 404 |
| reload keeps registering (one fails) | `POST /mcp` → 200 | 404 |
| engine reload reports unreachable | `POST /engine/reload` → 503 | 502 |

### 5.2 定位过程

1. 在 `server.ts` / `serve-node.ts` 注入诊断日志（`DIAG_*`），观察路由匹配与请求落点。
2. 关键证据：对 `engine/reload`、`/mcp/:name` 等路径，OpenWork 的 Node 入口
   （`DIAG_NODE`）与 fetch 处理器（`DIAG_TOP`）**完全未触发**，而 mock 引擎却收到了
   原始路径 `/workspace/ws_1/engine/reload` 并返回 404。
3. 这说明请求**从未到达 OpenWork 的本地处理器**，而是被转发到了 mock 引擎。

### 5.3 根因：**沙箱全局 HTTP 代理劫持 localhost 测试流量**（非代码 bug）

- 本机沙箱设置了 `HTTP_PROXY`/`HTTPS_PROXY=http://127.0.0.1:55415`。
- Bun 的 `fetch`（与 Node 一致）会尊重该变量，把 `http://127.0.0.1:<临时端口>/...`
  的请求发给代理；代理对 localhost 的转发行为不稳定，导致部分请求落到 mock 引擎、
  OpenWork 处理器收不到，表现为"路由被代理 / 404"。
- 同一时间 `POST /workspace/:id/mcp` 等能正常到达 OpenWork，是因为代理对它们的转发
  "恰好"正确，进一步掩盖了问题，造成"同一文件里有的用例过、有的不过"的假象。

### 5.4 验证修复（排除代码缺陷）

清空代理变量后重跑：`NO_PROXY='*' HTTP_PROXY= HTTPS_PROXY= … bun test` →
**37/37 全绿**。证明 server/路由/代理逻辑本身无缺陷，7 个"失败"纯属环境干扰。

### 5.5 已执行的清理动作

- 移除全部临时诊断日志（`server.ts` 的 `DIAG_TOP`/`DIAG_PRE`/`DIAG_MATCH`/`DIAG_ROUTES`、
  `serve-node.ts` 的 `DIAG_NODE`）及临时脚本 `zz-diag.ts`。
- 经校验，`server.ts` 路由表已正确注册全部相关路由（`engine/reload`、`/mcp/:name/enabled`、
  `DELETE /mcp/:name`、`POST /mcp` 等），`matchRoute` 在正常环境下均能命中本地处理器。

---

## 6. 结论

1. **功能正确性已验证**：MCP 探活端点与引擎同步两条链路共 **37 个 e2e 用例全部通过**，
   覆盖 5s 阈值竞态修复（`unavailable` 降级）、`429 mcp_probe_busy` 并发上限、
   `probeMcpSettle` 有界关闭、热增/热删/重载/失效证据/降级等全场景。
2. **未发现真实代码缺陷**：最初观察的 7 个"失败"已由代理环境变量解释清楚，无需改动
   server/路由代码。CI 与普通开发机无此代理，本就不复现。
3. **文档已同步**：
   - `mcp-test-endpoint-hang-issue-draft.md`：更新为 `dev` 提交 `ce2106783` 已落地、
     完整修复集与回归覆盖，并补充代理踩坑说明。
   - `mimosa-l3-high-triage.md`：追加结论脚注，确认本次 server 改动未引入新的
     SSRF/命令注入/硬编码凭据类高危。
4. **本环境复跑指引**：若需在此沙箱复跑 e2e，务必先 `unset`/清空全局代理变量
   （`HTTP_PROXY`/`HTTPS_PROXY`/`http_proxy`/`https_proxy`），或用 `NO_PROXY='*'`，
   否则 localhost 测试流量会被代理劫持而出现假性失败。

---

## 附：复跑命令

```bash
cd apps/server
NO_PROXY='*' no_proxy='*' HTTP_PROXY= HTTPS_PROXY= http_proxy= https_proxy= \
  bun --conditions=development test \
    src/mcp.test-endpoint.e2e.test.ts \
    src/mcp.engine-sync.e2e.test.ts
# 期望：37 pass / 0 fail
```
