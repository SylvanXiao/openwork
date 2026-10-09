#!/usr/bin/env node

/**
 * live-control-mcp
 *
 * MCP server for live-stream slicing & real-time control.
 *
 * 平台无关：只依赖 adapter.mjs 里的 PlatformAdapter 统一接口，当前默认挂载
 * MockAdapter（离线可跑，确定性合成数据）。接真实平台（抖音/视频号/淘宝/快手）
 * 时，在 adapters/ 下实现 PlatformAdapter 的 10 个方法，并用环境变量
 * LIVE_CONTROL_ADAPTER 切换（见文件底部 createAdapter），其余零改动。
 *
 * 与 P6 话术 skill 的关系：话术 skill（live-script-generator）产出「口播文本」，
 * 本 MCP 产出「平台数据/动作」（切片、场控、复盘）—— 一个轻、一个重，职责分离。
 *
 * Dev run:  node packages/live-control-mcp/index.mjs
 * MCP cfg:  { "mcpServers": { "live-control": { "command": "npx", "args": ["-y", "live-control-mcp"] } } }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MockAdapter } from "./adapter.mjs";
import { DouyinAdapter } from "./adapters/douyin.mjs";

// ── Adapter selection ──
// 通过环境变量 LIVE_CONTROL_ADAPTER 选择平台适配器：
//   mock    → 离线 Mock（默认，无需凭证，确定性合成数据）
//   douyin  → 抖音开放平台（需 DOUYIN_CLIENT_KEY/SECRET 等环境变量，脚手架未实测）
// 接入其他平台：在 adapters/ 下新建实现 PlatformAdapter 10 方法的文件，并在此注册。
function createAdapter() {
  const kind = (process.env.LIVE_CONTROL_ADAPTER || "mock").toLowerCase();
  if (kind === "douyin") return new DouyinAdapter();
  // 未来：if (kind === "wechat") return new WechatAdapter();
  return new MockAdapter();
}
const ADAPTER = createAdapter();

const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (text) => ({ content: [{ type: "text", text }], isError: true });
const json = (data) => ok(JSON.stringify(data, null, 2));

const server = new McpServer({ name: "live-control", version: "0.1.0" });

// ── 切片分析 ──
server.tool(
  "analyze_recording",
  "分析一场直播录播：返回采样后的指标时间线（在线/互动/转化/GMV 每分钟）与汇总统计。当前为 Mock 适配器，使用确定性合成数据。",
  { recordingId: z.string().describe("录播ID，如 rec_20241001_am") },
  async ({ recordingId }) => json(await ADAPTER.analyzeRecording({ recordingId })),
);

server.tool(
  "extract_highlights",
  "从录播中识别高光片段：基于互动峰值与转化峰值，产出带时间戳、原因与预估 GMV 的切片清单。",
  {
    recordingId: z.string().describe("录播ID"),
    topN: z.number().int().positive().optional().describe("每类峰值最多取几个（默认 5）"),
    minGapSec: z.number().int().positive().optional().describe("相邻高光最小间隔秒（默认 120）"),
    windowSec: z.number().int().positive().optional().describe("高光前后扩窗秒（默认 45）"),
  },
  async ({ recordingId, topN, minGapSec, windowSec }) =>
    json(await ADAPTER.extractHighlights({ recordingId, topN, minGapSec, windowSec })),
);

server.tool(
  "generate_clips",
  "根据高光清单生成切片命令与计划输出路径。Mock 模式只产出 ffmpeg 命令而不实际执行；接入真实录制源后改为实际落片。",
  {
    recordingId: z.string().describe("录播ID"),
    segments: z.array(z.object({
      start: z.number(), end: z.number(), reason: z.string().optional(),
    })).optional().describe("高光片段；不传则自动调 extract_highlights"),
    outDir: z.string().optional().describe("输出目录（默认 ./clips）"),
    sourcePath: z.string().optional().describe("录制源文件路径，用于 ffmpeg -i"),
  },
  async ({ recordingId, segments, outDir, sourcePath }) =>
    json(await ADAPTER.generateClips({ recordingId, segments, outDir, sourcePath })),
);

// ── 实时场控 ──
server.tool(
  "get_room_state",
  "获取直播间当前状态快照：在线人数、评论/分钟、订单/分钟、GMV、在线占比。",
  { liveId: z.string().describe("直播ID") },
  async ({ liveId }) => json(await ADAPTER.getRoomState({ liveId })),
);

server.tool(
  "monitor_room",
  "实时拉取直播间指标（与 get_room_state 同源，标注 monitor:true），用于周期性轮询。",
  { liveId: z.string().describe("直播ID") },
  async ({ liveId }) => json(await ADAPTER.monitorRoom({ liveId })),
);

server.tool(
  "detect_anomaly",
  "以基线为参照检测直播间异常：在线骤降、互动走低、转化停滞。返回 severity 分级的 flags。",
  {
    liveId: z.string().describe("直播ID"),
    baseline: z.object({
      viewers: z.number().optional(),
      commentsPerMin: z.number().optional(),
      ordersPerMin: z.number().optional(),
    }).optional().describe("基线；不传则用当前值的 1.3~1.4 倍估算"),
  },
  async ({ liveId, baseline }) => json(await ADAPTER.detectAnomaly({ liveId, baseline })),
);

// ── 决策建议 ──
server.tool(
  "suggest_action",
  "基于直播间状态给主播下一步行动建议（优先级+动作+理由）。可传入 get_room_state 的结果，否则内部取一次。",
  {
    liveId: z.string().describe("直播ID"),
    roomState: z.object({
      viewers: z.number().optional(), commentsPerMin: z.number().optional(), ordersPerMin: z.number().optional(),
    }).optional().describe("当前直播间状态；不传则内部拉取"),
  },
  async ({ liveId, roomState }) => json(await ADAPTER.suggestAction({ liveId, roomState })),
);

server.tool(
  "auto_reply",
  "为一条弹幕/评论生成回复草稿，复用话术方法论（互动破冰/逼单模块）。返回口播可用的 reply 文本。",
  {
    liveId: z.string().describe("直播ID"),
    comment: z.string().describe("观众评论/弹幕原文"),
    tone: z.string().optional().describe("语气，默认「亲切」"),
  },
  async ({ liveId, comment, tone }) => json(await ADAPTER.autoReply({ liveId, comment, tone })),
);

// ── 素材/复盘 ──
server.tool(
  "export_replay_clips",
  "导出复盘切片文件清单（Mock 返回计划路径）。可传入自定义 segments，否则自动取高光。",
  {
    liveId: z.string().describe("直播ID"),
    segments: z.array(z.object({ start: z.number(), end: z.number(), reason: z.string().optional() })).optional(),
    outDir: z.string().optional().describe("输出目录（默认 ./replay）"),
  },
  async ({ liveId, segments, outDir }) => json(await ADAPTER.exportReplayClips({ liveId, segments, outDir })),
);

server.tool(
  "summarize_session",
  "整场数据复盘报告：总 GMV、峰值在线、平均互动/转化、Top 高光、行动建议。",
  { liveId: z.string().describe("直播ID") },
  async ({ liveId }) => json(await ADAPTER.summarizeSession({ liveId })),
);

// ── Start ──
const transport = new StdioServerTransport();
await server.connect(transport);
