// live-control-mcp — Douyin (抖音开放平台) adapter scaffold.
//
// ⚠️ SCAFFOLD / 凭证就绪但未实测：
//   本文件把 PlatformAdapter 的 10 个方法映射到抖音开放平台（open.douyin.com）
//   的对应能力，并读取环境变量里的凭证。endpoint 路径与返回结构是「基于公开文档
//   结构的占位」，未经真机验证——拿到 client_key/client_secret + 对应 scope 后，
//   需逐一核对接口路径、字段与权限，再正式替换 MockAdapter。
//
//   为什么不直接「接好」：真实抖音直播/回放接口需要企业资质 + 特定 scope
//   （如 `live.room`、`data.external`、`im` 等），且返回结构需按文档归一化。
//   没有凭证无法真机验收，故先交付「可一键切换 + 字段映射骨架」，避免伪造成功。
//
// 凭证（环境变量）：DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET / DOUYIN_OPEN_ID
//                  / DOUYIN_ACCESS_TOKEN（可选，若已有长效 token）
// 启用：把 index.mjs 里的 ADAPTER 选择改为 douyin，或设 LIVE_CONTROL_ADAPTER=douyin

import { PlatformAdapter } from "../adapter.mjs";

const BASE = process.env.DOUYIN_BASE_URL || "https://open.douyin.com";

export class DouyinAdapter extends PlatformAdapter {
  constructor(opts = {}) {
    super({ name: "douyin" });
    this.clientKey = opts.clientKey || process.env.DOUYIN_CLIENT_KEY;
    this.clientSecret = opts.clientSecret || process.env.DOUYIN_CLIENT_SECRET;
    this.openId = opts.openId || process.env.DOUYIN_OPEN_ID;
    this._token = opts.accessToken || process.env.DOUYIN_ACCESS_TOKEN || null;
  }

  async _ensureToken() {
    if (this._token) return this._token;
    if (!this.clientKey || !this.clientSecret) {
      throw new Error("DouyinAdapter 缺少 DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET 环境变量");
    }
    // 抖音 client_token 真实路径为 /oauth/client_token/（需核对）
    const resp = await fetch(`${BASE}/oauth/client_token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_key: this.clientKey,
        client_secret: this.clientSecret,
        grant_type: "client_credential",
      }),
    });
    const data = await resp.json();
    if (!data?.data?.access_token) {
      throw new Error(`抖音 token 获取失败: ${JSON.stringify(data).slice(0, 300)}`);
    }
    this._token = data.data.access_token;
    return this._token;
  }

  async _call(path, params = {}, method = "GET", body) {
    const token = await this._ensureToken();
    const url = new URL(`${BASE}${path}`);
    if (method === "GET") {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    }
    const resp = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "access-token": token },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return resp.json();
  }

  // ── 录播切片面 ──
  // 映射：抖音「直播回放/数据分析」接口（需 live/data 或 replay 相关 scope）
  async analyzeRecording({ recordingId }) {
    const raw = await this._call("/live/replay/analysis/", { record_id: recordingId });
    return { platform: "douyin", recordingId, raw, note: "需按抖音回放分析返回结构归一化字段（在线/互动/转化/GMV 时间线）" };
  }

  async extractHighlights({ recordingId, topN = 5, minGapSec = 120, windowSec = 45 }) {
    // 抖音侧更可能在云端做高光识别；此处依赖 analyzeRecording 的时间线再本地取峰，
    // 或调用平台「智能剪辑」类接口。返回结构待与平台对齐。
    const analysis = await this.analyzeRecording({ recordingId });
    return {
      platform: "douyin", recordingId, topN, minGapSec, windowSec,
      note: "高光识别需在拿到归一化时间线后复用 adapter.mjs 的峰值算法，或调用抖音云端剪辑接口；当前为占位。",
      rawAnalysis: analysis,
    };
  }

  async generateClips({ recordingId, segments, outDir = "./clips", sourcePath }) {
    // 真实落片：优先用抖音「云剪辑」/「即创」类接口；本地 ffmpeg 需先下载回放源文件。
    return {
      platform: "douyin", recordingId, mock: false, executed: false,
      note: "抖音落片建议走云端剪辑接口（避免本地下载大文件）；若走本地 ffmpeg，需先用平台接口拉取回放源到 sourcePath。",
      segments, outDir, sourcePath,
    };
  }

  // ── 实时场控面 ──
  // 映射：/live/get 或直播大屏「实时数据」接口（需 live.room scope）
  async getRoomState({ liveId }) {
    const raw = await this._call("/live/get/", { room_id: liveId });
    return { platform: "douyin", liveId, raw, note: "需归一化为 viewers/commentsPerMin/ordersPerMin/gmv/onlineRatio" };
  }

  async monitorRoom({ liveId }) {
    const state = await this.getRoomState({ liveId });
    return { ...state, monitor: true };
  }

  async detectAnomaly({ liveId, baseline }) {
    const cur = await this.getRoomState({ liveId });
    const base = baseline || {
      viewers: (cur.raw?.data?.viewer_count ?? 0) * 1.4,
      commentsPerMin: 0, ordersPerMin: 0,
    };
    const flags = [];
    const viewers = cur.raw?.data?.viewer_count ?? 0;
    if (viewers > 0 && viewers < base.viewers * 0.7) {
      flags.push({ metric: "viewers", severity: "high", detail: `在线 ${viewers} 低于基线 ${Math.round(base.viewers)} 30%+` });
    }
    return { platform: "douyin", liveId, baseline: base, flags, healthy: flags.length === 0 };
  }

  // ── 决策建议面 ──
  // 平台无关规则，可在真实状态上复用 MockAdapter 的同款决策逻辑
  async suggestAction({ liveId, roomState }) {
    const s = roomState || (await this.getRoomState({ liveId })).raw?.data || {};
    const viewers = s.viewer_count ?? 0;
    const comments = s.comment_count ?? 0;
    const orders = s.order_count ?? 0;
    const recs = [];
    if (comments < 60) recs.push({ priority: "高", action: "发起点名/福袋互动", rationale: "互动密度偏低" });
    if (orders < 8 && viewers > 800) recs.push({ priority: "高", action: "强化产品FAB+限时逼单", rationale: "流量足但转化弱" });
    if (viewers < 400) recs.push({ priority: "紧急", action: "切引流款/福利款拉新", rationale: "在线下滑" });
    if (recs.length === 0) recs.push({ priority: "低", action: "维持节奏，准备下一轮主推", rationale: "指标健康" });
    return { platform: "douyin", liveId, recommendations: recs };
  }

  async autoReply({ liveId, comment, tone = "亲切" }) {
    // 真实场景可接抖音「评论/私信」自动回复接口（im scope）；此处沿用话术方法论模板。
    const templates = {
      价格: "宝子这价格已经是直播间专属福利价啦，错过今天要恢复原价哦～",
      有没有货: "有的宝，库存有限先拍先发～",
      质量: "咱们老粉都懂，支持七天无理由，放心冲！",
    };
    const hit = Object.keys(templates).find((k) => (comment || "").includes(k));
    return {
      platform: "douyin", liveId, comment, tone,
      module: hit ? "互动破冰/逼单" : "通用回应",
      reply: hit ? templates[hit] : `谢谢宝子关注～${tone}回您，看下方小黄车哦`,
      note: "若需经抖音评论接口真实下发，请接 im 相关 scope。",
    };
  }

  // ── 素材/复盘面 ──
  async exportReplayClips({ liveId, segments, outDir = "./replay" }) {
    return {
      platform: "douyin", liveId, mock: false, exported: 0,
      note: "导出切片建议走抖音云端剪辑/下载接口；本地导出需先拉取回放源。",
      segments, outDir,
    };
  }

  async summarizeSession({ liveId }) {
    const room = await this.getRoomState({ liveId });
    const recs = (await this.suggestAction({ liveId, roomState: room.raw?.data })).recommendations;
    return {
      platform: "douyin", liveId,
      note: "复盘需聚合整场数据（抖音「直播数据」接口按时间维度拉取），当前仅含实时快照 + 建议。",
      roomSnapshot: room.raw, suggestions: recs,
    };
  }
}
