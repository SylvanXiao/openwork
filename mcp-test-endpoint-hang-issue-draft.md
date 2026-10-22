# [引擎] "引擎 /mcp 挂死" 定位记录（含 2026-10-07 实测）

> 这是把"引擎 /mcp 挂死"落到代码层的定位记录。最初（纯读代码）我猜的是
> "server 侧 `POST /workspace/:id/mcp/:name/test` 的探活会泄漏 stdio 子进程"。
> **实测把这条假设否掉了**（服务端三条路径 + 远端 socket 均无泄漏，见"复现结论"）。
> 再起 `opencode serve` 压引擎 `/mcp` 路由，也确认**引擎不会无限挂死**（首调有
> ~5.4s 冷启动、之后缓存变快）。最终定位到一个**可稳定复现的 5s 阈值竞态**：
> 引擎首次 `/mcp`（~5.4–5.9s）刚好越过我们 server 端点 5s abort，导致引擎刚起来
> 或刚注册 MCP 后第一次"测试连接"被误报成 `not_registered`——这就是"挂死"观感的来源。

## 复现结论（2026-10-07 实测，Windows + MCP SDK 1.29.0）

用 `repro-tmp/`（临时、可删）搭"会挂住"的 MCP 服务，把 server 里
`probeMcpToolCount` / `probeMcpSettle` 原样拷出来驱动。三种"挂住的 MCP"场景
各探活 3 次：

| 场景 | 目标 | 请求返回耗时 | 结算窗后资源 |
| --- | --- | --- | --- |
| ① stdio，`initialize` 应答、`tools/list` 卡死 | 本地子进程 | ~10s（10s 超时命中） | **0/3 子进程存活，全被回收** |
| ② stdio，全程静默（`connect()` 本身卡死） | 本地子进程 | ~10s（10s 超时命中） | **0/3 子进程存活，全被回收** |
| ③ 远端 StreamableHTTP，接受连接但永不响应 | 本地 HTTP socket | ~10s（10s 超时命中） | **3 OPEN / 3 CLOSE，无残留 socket** |

**结论：服务端这条探活端点在三种"挂住的 MCP"下都不挂、不泄漏，是**自清理**的。**
1. **HTTP 响应有界**：探活最多 ~10s（`MCP_TOOL_PROBE_TIMEOUT_MS`）+ 引擎 `/mcp`
   状态抓取最多 5s（`AbortSignal.timeout(5_000)`）。端点本身**不会挂死请求**。
2. **stdio 子进程不泄漏**：即便吞掉 SIGTERM/SIGINT，MCP SDK 的
   `client.close()` → `transport.close()` 走 `stdin.end → SIGTERM → SIGKILL` 升级
   （SDK `stdio.js:137-172`）兜底杀掉；场景①②都回收了。
3. **远端 socket 不泄漏**：`transport.close()` 会 abort 底层 fetch 连接，场景③
   里每个 socket 在 10s 超时后被释放（`stillOpen=0`）。
4. **连接器 UI 没有自动探活循环**（`testMcp` 纯按需触发，`domains/connectors` 里
   没有 `setInterval`/`setTimeout` 轮询）。

所以"反复点测试连接会累积泄漏、最终把引擎拖挂"这条假设**被实测否定**，
原稿的"根因"已据此重写。

## 仍然成立、但严重度较低（是隐患，不是已证实的挂死）

- **端点无并发上限。** 云侧 agent-context 探针有 `MAX_ACTIVE_PROBES`
  （`apps/server/src/agent-context-cloud-probe.ts:17`），饱和即返回 `probe_busy`；
  而 `POST /workspace/:id/mcp/:name/test`（`apps/server/src/server.ts:4275`）**没有
  对应的在飞上限**。手动连点会并发起多个"有界但昂贵"的探活——浪费，但不是挂死。
- **`probeMcpSettle` 无自身超时、且 fire-and-forget。** `server.ts:253`
  `probeMcpSettle(...).catch(() => undefined)` 没有再套一层超时；`server.ts:257`
  里 `client.close()` 与 `transport.close()` 的两次 await 理论上可能被某个"永不完成"
  的 transport 卡住。本次 stdio 场景下没复现（SIGKILL 兜底了），但对**远端 transport**
  是未验证的残留风险。

## 引擎 /mcp 路由压测结论（2026-10-07 实测，opencode serve 1.18.30）

起一个独立 `opencode serve`，把"挂住的 MCP"写进 `opencode.json`（指向
`repro-tmp/hang-child.mjs`），压它的 `/mcp` 路由。结论：

- **引擎 `/mcp` 路由不会无限挂死。** 三种 MCP 形态下：
  - 干净首调（无 user MCP）：**~5.4s**（一次性冷启动懒初始化，与 MCP 无关）；
  - "connected 但 tools/list 卡住"的 MCP：首调 **~5.9s**，之后缓存、**~0.008s**；
  - 全程静默（连 initialize 都不答）的 MCP：首调 **~5.4s**（被配置里 `timeout:3000` 兜住），
    引擎如实报 `status:"failed"`，**不卡死**。
  - 连续 9 次 `/mcp`（含 20s 间隔窗）**全是 0.007–0.009s**，无周期性再探活尖峰。
- 所以引擎侧不是"挂死"，而是**一次性 ~5.4s 冷启动 /mcp 开销**。

## 真正可复现的缺陷：5s 阈值竞态（这才是"挂死"观感的来源）

我们 server 端点读引擎 `/mcp` 状态用的是
`loopbackFetch(url, { signal: AbortSignal.timeout(5_000) })`（`server.ts:4320`，
上限 5000ms）。而引擎**首次** `/mcp`（冷启动懒初始化 + 首次探测该目录）实测
**5.36–5.93s，全部 > 5000ms**。于是一竞态：

> 引擎 boot 之后、或新注册一个 MCP 之后，**第一次**点"测试连接"时，
> 引擎 `/mcp` 首调（~5.4s）刚好越过我们 5s abort，我们侧先超时 → 降级成
> `not_registered`。**即使这个 MCP 其实是注册好的。** 用户看到的就是
> "点了没反应 / 显示没注册 / 像挂了"——即"引擎 /mcp 挂死"的观感。
> 其实既不是泄漏、也不是引擎死挂，而是一个 **5s vs ~5.4s 的阈值竞态**。

复现（最小）：`opencode serve` 起一个新引擎 → 立即打 `/mcp` 首调（>5s）
= 我们 server 端点该次会 5s 超时降级。可稳定复现。

## 建议修复（按修正后的定位）

1. **提高我们 server 端点读引擎 `/mcp` 的 abort 上限**（`server.ts:4320` 的 5000ms）
   到 ≥12s，或首次调用单独放宽，避开引擎 ~5.4s 冷启动；并区分"引擎首调慢"
   与"引擎真不可达"两种失败，UI 上别把"首调慢"显示成 `not_registered`。
2. **（可选）预热引擎 `/mcp`**：引擎 boot / 工作区就绪后主动打一次 `/mcp` 吃掉
   冷启动开销，让后续"测试连接"都快。
3. **（可选）反馈失败类型**：响应里区分"引擎超时 / 引擎无此 MCP / 引擎可达"，
   UI 显示"引擎首次响应较慢，已重试"而非"未注册"。
4. 服务端探活端点的并发上限（参照 `MAX_ACTIVE_PROBES`）与 `probeMcpSettle`
   自身超时：健壮性加固，非本次根因，可另开小 PR。

## 下一步

- ✅ **已修并落地 `dev`**（commit `ce2106783` `fix(server): harden the MCP test
  endpoint against cold engines and probe floods`）：`server.ts` 把引擎 `/mcp`
  状态抓取 abort 从 5s 提到 `MCP_ENGINE_STATUS_PROBE_TIMEOUT_MS`(12s)，并把
  "引擎 /mcp 探活未完成（超时/报错）"单列成 `status: unavailable`，不再误报
  `not_registered`；**同时** 落地了建议修复 #4 的健壮性加固——
  `mcpToolProbeMaxInFlight` 并发上限（饱和返回 `429 mcp_probe_busy`）+ `probeMcpSettle`
  的有界 close 超时（防远端 transport 挂死）。
- ✅ **回归测试已覆盖**：`apps/server/src/mcp.test-endpoint.e2e.test.ts`（12 条用例，
  含 429 `mcp_probe_busy` / `unavailable` / `probeMcpSettle` 有界关闭）+ 
  `apps/server/src/mcp.engine-sync.e2e.test.ts`（25 条用例，引擎同步/重载/增删/降级全链路）。
  在**绕过沙箱全局 HTTP 代理**的前提下，两份 e2e 共 **37/37 通过，0 失败**。
- ⚠️ **重要环境踩坑（2026-10 复核）**：本机沙箱设了全局
  `HTTP_PROXY`/`HTTPS_PROXY=http://127.0.0.1:55415`，Bun 的 `fetch` 会据此把
  `http://127.0.0.1:<临时端口>/...` 的 localhost 测试请求劫持到代理，导致
  `engine/reload`、`/mcp/:name` 等路由的请求落到 mock 引擎、OpenWork 本地处理器根本
  收不到——最初被误读成"7 个 engine-sync 用例失败 / 路由被代理转发"。**这不是代码
  bug**：在 `NO_PROXY='*' HTTP_PROXY= HTTPS_PROXY=` 下重跑即全绿。CI 与普通开发机
  无此代理时本就不复现，无需改测试代码；若需在本机沙箱跑 e2e，记得先清掉代理变量。
- 引擎侧那条"首次 /mcp ~5.4s 冷启动"仍可作为 opencode 引擎的独立优化项
  （预热 /mcp，非挂死）。

## 附：复现脚本 / 数据（可删，在 `_worktrees/pr-assess/repro-tmp/`）

- `repro-tmp/hang-child.mjs` —— 挂住的 stdio MCP（可选 `HANG_CHILD_SILENT=1` 走全程静默）。
- `repro-tmp/probe-leak.mjs` / `probe-leak-silent.mjs` / `probe-http.mjs` ——
  服务端三条路径的驱动（结论：均无泄漏，socket/子进程都被 SDK 回收）。
- 引擎压测：`opencode serve --port 4178` + `opencode.json`（挂住 MCP），
  打 `/mcp` 实测首调 ~5.4–5.9s、后续 ~0.008s（数据见上"压测结论"）。
运行：`node repro-tmp/probe-leak.mjs` 等；依赖 `apps/server/node_modules` 里的 MCP SDK。
