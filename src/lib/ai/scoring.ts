// Pure scoring + model-mapping functions. No external deps so they're easy to unit-test.

export type PreferredModel = "sonnet" | "opus"

const MODEL_MAP: Record<PreferredModel, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
}

/**
 * Map Profile.preferredModel ("sonnet" | "opus" | undefined) to a Claude model ID.
 * Defaults to sonnet to match run-evaluation's default and minimize per-request cost.
 * Opt into Opus per-user via Profile.preferredModel = "opus".
 */
export function mapPreferredModel(model?: string | null): string {
  if (model === "opus") return MODEL_MAP.opus
  return MODEL_MAP.sonnet
}

export interface ScoreBreakdown {
  cvMatch: number
  northStar: number
  comp: number
  cultural: number
  redFlags: number
}

export interface Gap {
  description: string
  severity: string
  mitigation: string
}

const WEIGHTS: Record<keyof ScoreBreakdown, number> = {
  cvMatch: 0.40,
  northStar: 0.25,
  comp: 0.15,
  cultural: 0.10,
  redFlags: 0.10,
}

const HARD_BLOCKER_CAP = 2.5

function clamp1to5(v: number): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 3
  return Math.max(1, Math.min(5, v))
}

/**
 * Weighted global score from the dimension breakdown.
 *   cvMatch*0.40 + northStar*0.25 + comp*0.15 + cultural*0.10 + redFlags*0.10
 * Mirrors santifer's spirit: CV match dominates; North Star alignment second.
 * If any gap has severity "hard_blocker", the result is capped at 2.5
 * (matching the system-prompt rule for unmitigatable blockers).
 * Result is clamped to [1, 5] and rounded to one decimal.
 */
export function computeGlobalScore(
  breakdown: ScoreBreakdown,
  gaps: Gap[] = []
): number {
  let raw = 0
  for (const key of Object.keys(WEIGHTS) as Array<keyof ScoreBreakdown>) {
    raw += clamp1to5(breakdown[key]) * WEIGHTS[key]
  }

  if (gaps.some((g) => g.severity === "hard_blocker")) {
    raw = Math.min(raw, HARD_BLOCKER_CAP)
  }

  const clamped = Math.max(1, Math.min(5, raw))
  return Math.round(clamped * 10) / 10
}
