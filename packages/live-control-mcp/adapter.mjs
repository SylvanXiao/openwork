// live-control-mcp — platform adapter contract + offline Mock adapter.
//
// 设计约束（来自 P6 切片/场控 MCP 化）：
//   - 平台无关：所有工具只依赖 PlatformAdapter 的统一异步接口。
//   - 离线可跑：MockAdapter 用确定性合成数据，无需任何平台密钥即可跑通协议。
//   - 可替换：接入抖音/视频号/淘宝/快手时，只需新建一个实现相同方法的
//     RealAdapter 类，并把 index.mjs 里的 `new MockAdapter()` 换成它，其余零改动。
//
// 真实适配器要点（未来接平台 API 时对齐）：
//   - analyzeRecording: 调平台「录播分析/回放」接口，拉指标时间线。
//   - getRoomState / monitorRoom: 调「直播实时大屏」接口。
//   - detectAnomaly: 以历史基线为参照做阈值判定（基线可来自 summarizeSession）。
//   - generateClips / exportReplayClips: 调「云剪辑」或本地 ffmpeg 落片。

export class PlatformAdapter {
  constructor(opts = {}) {
    this.name = opts.name || "abstract";
  }
  // ── 录播切片面 ──
  async analyzeRecording(_input) { throw new Error("not implemented"); }
  async extractHighlights(_input) { throw new Error("not implemented"); }
  async generateClips(_input) { throw new Error("not implemented"); }
  // ── 实时场控面 ──
  async getRoomState(_input) { throw new Error("not implemented"); }
  async monitorRoom(_input) { throw new Error("not implemented"); }
  async detectAnomaly(_input) { throw new Error("not implemented"); }
  // ── 决策建议面 ──
  async suggestAction(_input) { throw new Error("not implemented"); }
  async autoReply(_input) { throw new Error("not implemented"); }
  // ── 素材/复盘面 ──
  async exportReplayClips(_input) { throw new Error("not implemented"); }
  async summarizeSession(_input) { throw new Error("not implemented"); }
}

// ── 确定性伪随机：同一 id 永远产出同一份数据，便于测试与复现 ──
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockAdapter extends PlatformAdapter {
  constructor(opts = {}) {
    super({ name: "mock" });
    this.durationSec = opts.durationSec ?? 3600;
    this.step = opts.step ?? 60;
  }

  _timeline(id) {
    const rnd = mulberry32(hashSeed(id || "recording"));
    const points = [];
    for (let t = 0; t <= this.durationSec; t += this.step) {
      const phase = t / this.durationSec;
      const spike = (Math.sin(phase * Math.PI * 3) + 1) * 0.5; // 0..1 多峰
      const viewers = 200 + phase * 800 + spike * 400 + (rnd() - 0.5) * 60;
      const engagement = 20 + spike * 80 + (rnd() - 0.5) * 15; // 评论/分钟
      const conversion = 1 + spike * 12 + (rnd() - 0.5) * 3; // 订单/分钟
      const gmvPerMin = conversion * (80 + rnd() * 120);
      points.push({
        t,
        viewers: Math.max(0, Math.round(viewers)),
        engagement: Math.max(0, +engagement.toFixed(1)),
        conversion: Math.max(0, +conversion.toFixed(1)),
        gmvPerMin: Math.max(0, Math.round(gmvPerMin)),
      });
    }
    return points;
  }

  _extractPeaks(points, metric, minGapSec, topN) {
    const vals = points.map((p) => p[metric]);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const norm = (v) => (max === min ? 0 : (v - min) / (max - min));
    const peaks = [];
    for (let i = 1; i < points.length - 1; i++) {
      const v = norm(points[i][metric]);
      if (v > norm(points[i - 1][metric]) && v > norm(points[i + 1][metric]) && v > 0.6) {
        peaks.push({ idx: i, v, t: points[i].t });
      }
    }
    peaks.sort((a, b) => b.v - a.v);
    const chosen = [];
    for (const p of peaks) {
      if (chosen.every((c) => Math.abs(c.t - p.t) >= minGapSec)) chosen.push(p);
      if (chosen.length >= topN) break;
    }
    return chosen.sort((a, b) => a.t - b.t);
  }

  _seg(points, peak, windowSec, reason) {
    const start = Math.max(0, peak.t - windowSec);
    const end = peak.t + windowSec;
    const slice = points.filter((p) => p.t >= start && p.t <= end);
    return {
      start,
      end,
      durationSec: end - start,
      reason,
      peakViewers: Math.max(...slice.map((p) => p.viewers)),
      peakEngagement: Math.max(...slice.map((p) => p.engagement)),
      peakConversion: Math.max(...slice.map((p) => p.conversion)),
      estGmv: slice.reduce((s, p) => s + p.gmvPerMin, 0),
    };
  }

  // ── 录播切片面 ──
  async analyzeRecording({ recordingId }) {
    const points = this._timeline(recordingId);
    const stat = (key) => {
      const arr = points.map((p) => p[key]);
      return {
        min: Math.min(...arr),
        max: Math.max(...arr),
        avg: +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1),
      };
    };
    return {
      recordingId,
      durationSec: this.durationSec,
      stepSec: this.step,
      samples: points.length,
      stats: {
        viewers: stat("viewers"),
        engagement: stat("engagement"),
        conversion: stat("conversion"),
        gmvPerMin: stat("gmvPerMin"),
      },
      totalGmv: points.reduce((s, p) => s + p.gmvPerMin, 0),
      timeline: points,
    };
  }

  async extractHighlights({ recordingId, topN = 5, minGapSec = 120, windowSec = 45 }) {
    const points = this._timeline(recordingId);
    const eng = this._extractPeaks(points, "engagement", minGapSec, topN);
    const conv = this._extractPeaks(points, "conversion", minGapSec, topN);
    const segments = [
      ...eng.map((p) => this._seg(points, p, windowSec, "互动峰值")),
      ...conv.map((p) => this._seg(points, p, windowSec, "转化峰值")),
    ].sort((a, b) => a.start - b.start);
    return { recordingId, count: segments.length, segments };
  }

  async generateClips({ recordingId, segments, outDir = "./clips", sourcePath }) {
    const segs = segments || (await this.extractHighlights({ recordingId })).segments;
    const clips = segs.map((s, i) => {
      const name = `clip_${i + 1}_${s.reason}.mp4`;
      return {
        index: i + 1,
        ffmpeg: `ffmpeg -ss ${s.start} -i "${sourcePath || recordingId}" -t ${s.durationSec} -c copy "${outDir}/${name}"`,
        output: `${outDir}/${name}`,
      };
    });
    return {
      recordingId,
      mock: true,
      executed: false,
      note: "Mock 模式不实际执行 ffmpeg，仅产出命令与计划路径；接入真实录制源后改为实际落片。",
      clips,
    };
  }

  // ── 实时场控面 ──
  _roomState(liveId) {
    const rnd = mulberry32(hashSeed(liveId || "live"));
    const viewers = 500 + Math.round(rnd() * 1500);
    const commentsPerMin = 30 + Math.round(rnd() * 200);
    const ordersPerMin = +(2 + rnd() * 20).toFixed(1);
    const gmv = Math.round(viewers * (5 + rnd() * 15));
    const onlineRatio = +(0.3 + rnd() * 0.5).toFixed(2);
    return {
      liveId,
      sampledAt: new Date().toISOString(),
      status: "live",
      viewers,
      commentsPerMin,
      ordersPerMin,
      gmv,
      onlineRatio,
    };
  }

  async getRoomState({ liveId }) {
    return this._roomState(liveId);
  }

  async monitorRoom({ liveId }) {
    const state = this._roomState(liveId);
    return { ...state, monitor: true };
  }

  async detectAnomaly({ liveId, baseline }) {
    const cur = this._roomState(liveId);
    const base = baseline || {
      viewers: cur.viewers * 1.4,
      commentsPerMin: cur.commentsPerMin * 1.3,
      ordersPerMin: cur.ordersPerMin * 1.3,
    };
    const flags = [];
    if (cur.viewers < base.viewers * 0.7) {
      flags.push({ metric: "viewers", severity: "high", detail: `在线 ${cur.viewers} 低于基线 ${Math.round(base.viewers)} 30%+` });
    }
    if (cur.commentsPerMin < base.commentsPerMin * 0.6) {
      flags.push({ metric: "engagement", severity: "medium", detail: `互动 ${cur.commentsPerMin}/min 明显走低` });
    }
    if (cur.ordersPerMin < base.ordersPerMin * 0.5) {
      flags.push({ metric: "conversion", severity: "high", detail: `转化 ${cur.ordersPerMin}/min 接近停滞` });
    }
    return { liveId, flags, healthy: flags.length === 0 };
  }

  // ── 决策建议面 ──
  async suggestAction({ liveId, roomState }) {
    const s = roomState || this._roomState(liveId);
    const recs = [];
    if (s.commentsPerMin < 60) {
      recs.push({ priority: "高", action: "发起点名/福袋互动", rationale: "互动密度偏低，先拉停留与评论" });
    }
    if (s.ordersPerMin < 8 && s.viewers > 800) {
      recs.push({ priority: "高", action: "强化产品FAB+限时逼单", rationale: "流量充足但转化弱，需临门一脚" });
    }
    if (s.viewers < 400) {
      recs.push({ priority: "紧急", action: "切引流款/福利款拉新", rationale: "在线下滑，先用低价款稳场" });
    }
    if (recs.length === 0) {
      recs.push({ priority: "低", action: "维持节奏，准备下一轮主推", rationale: "各项指标健康" });
    }
    return { liveId, recommendations: recs };
  }

  async autoReply({ liveId, comment, tone = "亲切" }) {
    const templates = {
      价格: "宝子这价格已经是直播间专属福利价啦，错过今天要恢复原价哦～",
      有没有货: "有的宝，库存有限先拍先发，拍下我马上帮您锁单～",
      质量: "咱们家老粉都懂，支持七天无理由，放心冲！",
      怎么买: "点下方小黄车 1 号链接直接拍，拍下自动发货～",
    };
    const hit = Object.keys(templates).find((k) => (comment || "").includes(k));
    const reply = hit
      ? templates[hit]
      : `谢谢宝子的关注～${tone}地回您，具体可以看下方小黄车哦`;
    return {
      liveId,
      comment,
      tone,
      module: hit ? "互动破冰/逼单" : "通用回应",
      reply,
    };
  }

  // ── 素材/复盘面 ──
  async exportReplayClips({ liveId, segments, outDir = "./replay" }) {
    const segs = segments || (await this.extractHighlights({ recordingId: liveId })).segments;
    const files = segs.map((s, i) => ({
      index: i + 1,
      file: `${outDir}/replay_${i + 1}_${s.reason}.mp4`,
      start: s.start,
      end: s.end,
    }));
    return { liveId, mock: true, exported: files.length, files };
  }

  async summarizeSession({ liveId }) {
    const points = this._timeline(liveId);
    const totalGmv = points.reduce((s, p) => s + p.gmvPerMin, 0);
    const peakViewers = Math.max(...points.map((p) => p.viewers));
    const avgEngagement = +(points.reduce((s, p) => s + p.engagement, 0) / points.length).toFixed(1);
    const avgConversion = +(points.reduce((s, p) => s + p.conversion, 0) / points.length).toFixed(1);
    const highlights = (await this.extractHighlights({ recordingId: liveId, topN: 3 })).segments;
    const state = this._roomState(liveId);
    const suggestions = (await this.suggestAction({ liveId, roomState: state })).recommendations;
    return {
      liveId,
      durationSec: points.length * this.step,
      totalGmv,
      peakViewers,
      avgEngagement,
      avgConversion,
      topHighlights: highlights.map((h) => ({ reason: h.reason, start: h.start, estGmv: h.estGmv })),
      suggestions,
    };
  }
}
