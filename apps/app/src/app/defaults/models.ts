/**
 * Default model recommendation constants.
 *
 * These are hardcoded client-side defaults. If a server-side API is added
 * later, these should be replaced by the server response.
 *
 * To add or remove recommended models, edit this file.
 */

/**
 * Models considered "recommended" and shown with a star icon at the top
 * of each provider's model list in the picker.
 *
 * These are model ID substrings (case-insensitive match).
 */
// 中国版默认编排：把国产旗舰模型置顶（按 token 费用「便宜够用优先」）。
// 这些子串在模型 ID 上做大小写不敏感匹配（见 isRecommendedModel）。
export const RECOMMENDED_MODEL_PATTERNS: string[] = [
  "deepseek-v4-flash", // DeepSeek V4 Flash — 最便宜的日常首选
  "qwen-turbo", // 通义千问 Turbo — 便宜够用
  "qwen-plus", // 通义千问 Plus — 便宜且强
  "glm-5.2", // 智谱 GLM-5.2 — 国产旗舰
  "kimi-k2.6", // 月之暗面 Kimi K2.6 — 长上下文推理
];

/**
 * Check if a model is in the recommended list.
 */
export function isRecommendedModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return RECOMMENDED_MODEL_PATTERNS.some((p) => lower.includes(p));
}
