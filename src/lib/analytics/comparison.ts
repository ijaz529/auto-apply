/**
 * Pure helpers for the multi-job comparison view (santifer's `ofertas` mode).
 *
 * Takes evaluated-job records and produces the side-by-side comparison
 * matrix the UI renders: per-dimension cell values, the max-per-row index
 * for highlighting, and a final ranking by score.
 *
 * No LLM calls — every value is read off the existing Evaluation record.
 */

export interface ComparisonJob {
  id: string
  company: string
  role: string
  url: string | null
  location: string | null
  evaluation: {
    score: number
    archetype: string | null
    legitimacy: string | null
    scoreBreakdown: Record<string, number> | null
    gaps: Array<{ description: string; severity: string }> | null
  } | null
}

/**
 * The five dimensions every Phase 1 evaluation produces. Used to build the
 * comparison matrix's numeric rows. Each dimension has a "higher is better"
 * polarity — santifer scores redFlags as 5=no flags, 1=many, so this is
 * already monotonic.
 */
export const SCORE_DIMENSIONS: Array<{
  key: keyof DimensionRow
  label: string
}> = [
  { key: "cvMatch", label: "CV Match" },
  { key: "northStar", label: "North Star" },
  { key: "comp", label: "Comp" },
  { key: "cultural", label: "Cultural" },
  { key: "redFlags", label: "Red Flags (high = none)" },
]

interface DimensionRow {
  cvMatch: number | null
  northStar: number | null
  comp: number | null
  cultural: number | null
  redFlags: number | null
}

export interface ComparisonRow {
  /** Identifier (e.g. "score", "archetype", "cvMatch"). */
  key: string
  label: string
  /** Cell value per job, in input order. Strings are rendered as-is; numbers get a winner-highlight. */
  values: Array<string | number | null>
  /** When values are numeric, indices of the cell(s) holding the row's max. Empty for tied/no-data rows. */
  maxIndices: number[]
}

export interface ComparisonResult {
  /** Jobs in input order (UI uses this to render columns). */
  jobs: ComparisonJob[]
  /** Top-line headline rows (score, archetype, legitimacy, location). */
  headline: ComparisonRow[]
  /** Per-dimension numeric rows (cvMatch, northStar, comp, cultural, redFlags). */
  dimensions: ComparisonRow[]
  /** Hard-blocker gap row — string per job summarizing blockers. */
  blockerSummary: ComparisonRow
  /** Ranking by global score (highest first). Ties broken by listing order. */
  ranking: Array<{ jobId: string; rank: number; score: number }>
}

function maxIndices(values: Array<number | null>): number[] {
  const real = values.filter((v): v is number => typeof v === "number")
  if (real.length < 2) return [] // a single value isn't a "winner"
  const max = Math.max(...real)
  const indices: number[] = []
  values.forEach((v, i) => {
    if (typeof v === "number" && v === max) indices.push(i)
  })
  // Don't highlight when EVERY job ties — there's no comparative signal.
  return indices.length === values.length ? [] : indices
}

function readDimension(
  job: ComparisonJob,
  key: keyof DimensionRow
): number | null {
  const breakdown = job.evaluation?.scoreBreakdown
  if (!breakdown) return null
  const v = breakdown[key as string]
  return typeof v === "number" ? v : null
}

function summarizeBlockers(job: ComparisonJob): string {
  const gaps = job.evaluation?.gaps ?? []
  const hard = gaps.filter((g) => g.severity === "hard_blocker")
  if (hard.length === 0) return "None"
  return hard
    .slice(0, 2)
    .map((g) => g.description.replace(/\s+/g, " ").trim().slice(0, 60))
    .join("; ") + (hard.length > 2 ? ` (+${hard.length - 2} more)` : "")
}

export function buildComparison(jobs: ComparisonJob[]): ComparisonResult {
  // ── Headline rows (mostly strings; score is numeric so it gets highlighted)
  const scoreValues = jobs.map((j) => j.evaluation?.score ?? null)

  const headline: ComparisonRow[] = [
    {
      key: "score",
      label: "Score",
      values: scoreValues,
      maxIndices: maxIndices(scoreValues),
    },
    {
      key: "archetype",
      label: "Archetype",
      values: jobs.map((j) => j.evaluation?.archetype ?? "Unknown"),
      maxIndices: [],
    },
    {
      key: "legitimacy",
      label: "Legitimacy",
      values: jobs.map((j) => j.evaluation?.legitimacy ?? "Unknown"),
      maxIndices: [],
    },
    {
      key: "location",
      label: "Location",
      values: jobs.map((j) => j.location ?? "Unknown"),
      maxIndices: [],
    },
  ]

  // ── Per-dimension numeric rows
  const dimensions: ComparisonRow[] = SCORE_DIMENSIONS.map(({ key, label }) => {
    const values = jobs.map((j) => readDimension(j, key))
    return { key: key as string, label, values, maxIndices: maxIndices(values) }
  })

  // ── Blockers row
  const blockerSummary: ComparisonRow = {
    key: "blockers",
    label: "Hard Blockers",
    values: jobs.map((j) => summarizeBlockers(j)),
    maxIndices: [],
  }

  // ── Ranking by score (desc; stable on ties)
  const ranked = jobs
    .map((j, originalIndex) => ({
      jobId: j.id,
      score: j.evaluation?.score ?? -Infinity,
      originalIndex,
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      return a.originalIndex - b.originalIndex
    })
    .map((j, i) => ({
      jobId: j.jobId,
      rank: i + 1,
      score: j.score === -Infinity ? 0 : j.score,
    }))

  return { jobs, headline, dimensions, blockerSummary, ranking: ranked }
}
