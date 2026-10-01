import type { HackatimeHeartbeat } from "./client";

/**
 * Hackatime reports AI use itself: each heartbeat can carry how many lines the AI changed and how
 * many a human did, which model was involved, and how much it was asked. That is first-hand data,
 * so it is used before any guessing from file names or categories.
 *
 * No browser or database imports here: the review page uses this on the client as well.
 */

export const AI_PATH_INDICATORS = [
  "antigravity ide",
  ".gemini",
  "/brain/",
  "\\brain\\",
  ".cursor",
  ".windsurf",
  ".continue",
  "task.md",
  "walkthrough.md",
  "implementation_plan.md",
  ".claude",
  ".cursorrules",
  ".windsurfrules",
  ".specstory",
  "copilot-instructions.md",
  "copilot-chat",
  "chat.json",
  ".aider",
];

/** Below this many changed lines there is too little to say what share was AI. */
export const MIN_LINES_FOR_SHARE = 20;

const positive = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** True when anything on the heartbeat says the AI was involved. */
export function isAiHeartbeat(hb: HackatimeHeartbeat): boolean {
  const category = (hb.category ?? "").toLowerCase();
  if (
    category.includes("ai") ||
    category.includes("copilot") ||
    category.includes("chat") ||
    category.includes("completion")
  ) {
    return true;
  }
  if (hb.ai_model || hb.ai_session || positive(hb.ai_line_changes) > 0) return true;

  const entity = (hb.entity ?? "").toLowerCase();
  return AI_PATH_INDICATORS.some((indicator) => entity.includes(indicator));
}

export type AiAttribution = {
  /** True when Hackatime gave enough line counts to measure the AI share directly. */
  hasLineData: boolean;
  aiLines: number;
  humanLines: number;
  /** AI lines as a percentage of all changed lines, one decimal. Null without line data. */
  aiLineShare: number | null;
  aiHeartbeats: number;
  sessions: number;
  models: { name: string; heartbeats: number }[];
  inputTokens: number;
  outputTokens: number;
  longestPrompt: number;
  plans: string[];
};

export function attributeAi(heartbeats: HackatimeHeartbeat[]): AiAttribution {
  let aiLines = 0;
  let humanLines = 0;
  let aiHeartbeats = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let longestPrompt = 0;
  const sessions = new Set<string>();
  const models = new Map<string, number>();
  const plans = new Set<string>();

  for (const hb of heartbeats) {
    aiLines += positive(hb.ai_line_changes);
    humanLines += positive(hb.human_line_changes);
    inputTokens += positive(hb.ai_input_tokens);
    outputTokens += positive(hb.ai_output_tokens);
    longestPrompt = Math.max(longestPrompt, positive(hb.ai_prompt_length));

    if (hb.ai_session) sessions.add(hb.ai_session);
    if (hb.ai_model) models.set(hb.ai_model, (models.get(hb.ai_model) ?? 0) + 1);
    if (hb.ai_subscription_plan) plans.add(hb.ai_subscription_plan);
    if (isAiHeartbeat(hb)) aiHeartbeats++;
  }

  const total = aiLines + humanLines;
  const hasLineData = total >= MIN_LINES_FOR_SHARE;

  return {
    hasLineData,
    aiLines,
    humanLines,
    aiLineShare: hasLineData ? Math.round((aiLines / total) * 1000) / 10 : null,
    aiHeartbeats,
    sessions: sessions.size,
    models: [...models.entries()]
      .map(([name, count]) => ({ name, heartbeats: count }))
      .sort((a, b) => b.heartbeats - a.heartbeats),
    inputTokens,
    outputTokens,
    longestPrompt,
    plans: [...plans],
  };
}
