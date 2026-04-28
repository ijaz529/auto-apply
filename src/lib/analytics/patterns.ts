/**
 * Pattern Analysis — Rejection-pattern detection + targeting recommendations.
 *
 * Mirrors santifer/career-ops `analyze-patterns.mjs`:
 *   - normalised statuses → outcome buckets (positive/negative/self_filtered/pending)
 *   - conversion funnel
 *   - score comparison per outcome (avg/min/max/count)
 *   - archetype breakdown with conversionRate
 *   - blocker analysis (geo / stack / seniority / onsite / other) with %
 *   - remote-policy breakdown
 *   - score-threshold inference from positive outcomes
 *   - tech-stack gaps (specific tech tokens from negative-outcome gap descriptions)
 *   - structured recommendations (action / reasoning / impact)
 *   - MIN_THRESHOLD gating so the page can show "not enough data yet" instead
 *     of misleading low-sample charts
 */

import { prisma } from "@/lib/db"

// ── Public types ───────────────────────────────────────────────────

export type Outcome = "positive" | "negative" | "self_filtered" | "pending"

export interface ScoreStats {
  avg: number
  min: number
  max: number
  count: number
}

export type ScoreComparison = Record<Outcome, ScoreStats>

export interface PatternMetadata {
  total: number
  dateRange: { from: string | null; to: string | null }
  analysisDate: string
  byOutcome: Record<Outcome, number>
}

export interface ArchetypeStat {
  archetype: string
  total: number
  positive: number
  negative: number
  self_filtered: number
  pending: number
  conversionRate: number
}

export type BlockerType =
  | "geo-restriction"
  | "stack-mismatch"
  | "seniority-mismatch"
  | "onsite-requirement"
  | "other"

export interface BlockerStat {
  blocker: BlockerType
  frequency: number
  percentage: number
}

export interface RemotePolicyStat {
  policy: string
  total: number
  positive: number
  negative: number
  self_filtered: number
  pending: number
  conversionRate: number
}

export interface ScoreThreshold {
  recommended: number
  reasoning: string
  positiveRange: string
}

export interface TechStackGap {
  skill: string
  frequency: number
}

export interface Recommendation {
  action: string
  reasoning: string
  impact: "high" | "medium" | "low"
}

export interface PatternAnalysis {
  ok: true
  metadata: PatternMetadata
  /** Average score across all applications that have a non-zero evaluation score. */
  avgScore: number
  funnel: Record<string, number>
  scoreComparison: ScoreComparison
  archetypeBreakdown: ArchetypeStat[]
  blockerAnalysis: BlockerStat[]
  remotePolicy: RemotePolicyStat[]
  scoreThreshold: ScoreThreshold
  techStackGaps: TechStackGap[]
  recommendations: Recommendation[]
}

export interface PatternFailure {
  ok: false
  reason: "no_data" | "insufficient_data"
  message: string
  metadata?: { total: number; beyondEvaluated: number; threshold: number }
}

export type PatternResult = PatternAnalysis | PatternFailure

// ── Pure helpers (exported for testability) ────────────────────────

const STATUS_ALIASES: Record<string, string> = {
  evaluada: "evaluated",
  condicional: "evaluated",
  hold: "evaluated",
  evaluar: "evaluated",
  verificar: "evaluated",
  aplicado: "applied",
  enviada: "applied",
  aplicada: "applied",
  applied: "applied",
  sent: "applied",
  respondido: "responded",
  entrevista: "interview",
  oferta: "offer",
  rechazado: "rejected",
  rechazada: "rejected",
  descartado: "discarded",
  descartada: "discarded",
  cerrada: "discarded",
  cancelada: "discarded",
  "no aplicar": "skip",
  no_aplicar: "skip",
  monitor: "skip",
  "geo blocker": "skip",
}

export function normalizeStatus(raw: string): string {
  const clean = raw
    .replace(/\*\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, "")
    .trim()
  return STATUS_ALIASES[clean] ?? clean
}

export function classifyOutcome(status: string): Outcome {
  const s = normalizeStatus(status)
  if (["interview", "offer", "responded", "applied"].includes(s)) return "positive"
  if (["rejected", "discarded"].includes(s)) return "negative"
  if (s === "skip") return "self_filtered"
  return "pending"
}

export function classifyRemote(raw: string | null | undefined): string {
  if (!raw) return "unknown"
  const lower = raw.toLowerCase()
  if (
    /\b(us[- ]?only|canada[- ]?only|residents only|usa only|us residents|canada residents)\b/.test(
      lower
    )
  )
    return "geo-restricted"
  if (/\bargentina\s+remote\s+only\b/.test(lower)) return "geo-restricted"
  // santifer's original regex used a bare `relocat` token that never actually
  // matched (the trailing \b fails on "relocate"/"relocation"); spelled out here.
  if (
    /\b(hybrid|on-?site|office|columbus|cape town|relocate|relocation|relocating)\b/.test(
      lower
    )
  )
    return "hybrid/onsite"
  if (/\b(global|anywhere|worldwide|no restrict|70\+|work from anywhere)\b/.test(lower))
    return "global remote"
  if (/\b(remote|latam|americas|brazil|fully remote)\b/.test(lower))
    return "regional remote"
  return "unknown"
}

export interface GapInput {
  description: string
  severity: string
}

export function extractBlockerType(gap: GapInput): BlockerType | null {
  const desc = gap.description.toLowerCase()
  const sev = gap.severity.toLowerCase()
  if (sev.includes("nice") || sev.includes("soft") || sev.includes("nice_to_have"))
    return null
  if (/\b(residency|us[- ]only|canada|location|visa|geo|country|region)\b/.test(desc))
    return "geo-restriction"
  if (
    /\b(javascript|typescript|python|ruby|java|go|rust|node|react|angular|vue|django|flask|rails)\b/.test(
      desc
    )
  )
    return "stack-mismatch"
  if (/\b(senior|staff|lead|principal|director|manager|head)\b/.test(desc))
    return "seniority-mismatch"
  if (/\b(hybrid|on-?site|office|relocat)\b/.test(desc)) return "onsite-requirement"
  return "other"
}

// Order matters — alternation is greedy by listed order. Multi-word /
// suffixed compounds (e.g. "React Native", "Node.js") must come BEFORE the
// shorter prefixes ("React", "Node") so they win the match.
const TECH_STACK_REGEX =
  /\b(React Native|Node\.?js|Vue\.?js|JavaScript|TypeScript|Python|Ruby|Java|Go|Rust|React|Angular|Django|Flask|Rails|PHP|Laravel|Symfony|Kotlin|Swift|C\+\+|C#|\.NET|MongoDB|MySQL|PostgreSQL|Redis|GraphQL|REST|AWS|GCP|Azure|Docker|Kubernetes|Terraform|Supabase|Inngest)\b/gi

export function extractTechSkills(description: string): string[] {
  const matches = description.match(TECH_STACK_REGEX)
  if (!matches) return []
  return matches.map((m) => m.charAt(0).toUpperCase() + m.slice(1))
}

export function scoreStats(scores: number[]): ScoreStats {
  if (scores.length === 0) return { avg: 0, min: 0, max: 0, count: 0 }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return {
    avg: Math.round(avg * 100) / 100,
    min: Math.min(...scores),
    max: Math.max(...scores),
    count: scores.length,
  }
}

// ── Default minimum applications-beyond-evaluated before patterns surface ──
const DEFAULT_MIN_THRESHOLD = 5

// ── Main analysis (DB-backed) ──────────────────────────────────────

export async function analyzePatterns(
  userId: string,
  options: { minThreshold?: number } = {}
): Promise<PatternResult> {
  const minThreshold = options.minThreshold ?? DEFAULT_MIN_THRESHOLD

  const applications = await prisma.application.findMany({
    where: { userId },
    include: { job: { include: { evaluation: true } } },
    orderBy: { createdAt: "asc" },
  })

  if (applications.length === 0) {
    return {
      ok: false,
      reason: "no_data",
      message:
        "No applications yet — add and evaluate a few jobs to start spotting patterns.",
    }
  }

  // Enrich every application with normalized status + outcome + score + report fields.
  const enriched = applications.map((app) => {
    const eval_ = app.job.evaluation
    const normalizedStatus = normalizeStatus(app.status)
    const outcome = classifyOutcome(app.status)
    const score = eval_?.score ?? 0
    const archetype = eval_?.archetype ?? "Unknown"
    const gaps =
      (eval_?.gaps as Array<{
        description: string
        severity: string
        mitigation?: string
      }> | null) ?? []
    const remoteSource = app.job.remote || app.job.location || null
    return {
      id: app.id,
      date: app.createdAt.toISOString().slice(0, 10),
      status: app.status,
      normalizedStatus,
      outcome,
      score,
      archetype,
      gaps,
      remoteBucket: classifyRemote(remoteSource),
    }
  })

  const beyondEvaluated = enriched.filter(
    (e) => e.normalizedStatus !== "evaluated"
  ).length
  if (beyondEvaluated < minThreshold) {
    return {
      ok: false,
      reason: "insufficient_data",
      message: `Not enough data: ${beyondEvaluated}/${minThreshold} applications beyond "Evaluated". Apply to a few more roles and come back.`,
      metadata: {
        total: enriched.length,
        beyondEvaluated,
        threshold: minThreshold,
      },
    }
  }

  // ── Funnel ──
  const funnel: Record<string, number> = {}
  for (const e of enriched) {
    funnel[e.normalizedStatus] = (funnel[e.normalizedStatus] ?? 0) + 1
  }

  // ── Score comparison (avg/min/max/count per outcome bucket) ──
  const scoresByOutcome: Record<Outcome, number[]> = {
    positive: [],
    negative: [],
    self_filtered: [],
    pending: [],
  }
  for (const e of enriched) {
    if (e.score > 0) scoresByOutcome[e.outcome].push(e.score)
  }
  const scoreComparison: ScoreComparison = {
    positive: scoreStats(scoresByOutcome.positive),
    negative: scoreStats(scoresByOutcome.negative),
    self_filtered: scoreStats(scoresByOutcome.self_filtered),
    pending: scoreStats(scoresByOutcome.pending),
  }

  // ── Archetype breakdown ──
  const archetypeMap = new Map<
    string,
    { total: number; positive: number; negative: number; self_filtered: number; pending: number }
  >()
  for (const e of enriched) {
    const slot = archetypeMap.get(e.archetype) ?? {
      total: 0,
      positive: 0,
      negative: 0,
      self_filtered: 0,
      pending: 0,
    }
    slot.total++
    slot[e.outcome]++
    archetypeMap.set(e.archetype, slot)
  }
  const archetypeBreakdown: ArchetypeStat[] = Array.from(archetypeMap.entries())
    .map(([archetype, s]) => ({
      archetype,
      total: s.total,
      positive: s.positive,
      negative: s.negative,
      self_filtered: s.self_filtered,
      pending: s.pending,
      conversionRate:
        s.total > 0 ? Math.round((s.positive / s.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // ── Blocker analysis ──
  const blockerCounts = new Map<BlockerType, number>()
  for (const e of enriched) {
    for (const gap of e.gaps) {
      const t = extractBlockerType(gap)
      if (!t) continue
      blockerCounts.set(t, (blockerCounts.get(t) ?? 0) + 1)
    }
  }
  const blockerAnalysis: BlockerStat[] = Array.from(blockerCounts.entries())
    .map(([blocker, frequency]) => ({
      blocker,
      frequency,
      percentage: Math.round((frequency / enriched.length) * 100),
    }))
    .sort((a, b) => b.frequency - a.frequency)

  // ── Remote-policy breakdown ──
  const remoteMap = new Map<
    string,
    { total: number; positive: number; negative: number; self_filtered: number; pending: number }
  >()
  for (const e of enriched) {
    const slot = remoteMap.get(e.remoteBucket) ?? {
      total: 0,
      positive: 0,
      negative: 0,
      self_filtered: 0,
      pending: 0,
    }
    slot.total++
    slot[e.outcome]++
    remoteMap.set(e.remoteBucket, slot)
  }
  const remotePolicy: RemotePolicyStat[] = Array.from(remoteMap.entries())
    .map(([policy, s]) => ({
      policy,
      total: s.total,
      positive: s.positive,
      negative: s.negative,
      self_filtered: s.self_filtered,
      pending: s.pending,
      conversionRate:
        s.total > 0 ? Math.round((s.positive / s.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // ── Score threshold inference ──
  const positiveScores = scoresByOutcome.positive
  const minPositive = positiveScores.length > 0 ? Math.min(...positiveScores) : 0
  const scoreThreshold: ScoreThreshold = {
    recommended: minPositive > 0 ? Math.floor(minPositive * 10) / 10 : 3.5,
    reasoning:
      positiveScores.length > 0
        ? `Lowest score among positive outcomes is ${minPositive}/5. No applications below this score have led to progress yet.`
        : "Not enough positive-outcome data to set a threshold yet.",
    positiveRange:
      positiveScores.length > 0
        ? `${Math.min(...positiveScores)} - ${Math.max(...positiveScores)}`
        : "N/A",
  }

  // ── Tech-stack gaps (negative + self_filtered) ──
  const stackGaps = new Map<string, number>()
  for (const e of enriched) {
    if (e.outcome !== "negative" && e.outcome !== "self_filtered") continue
    for (const gap of e.gaps) {
      for (const skill of extractTechSkills(gap.description)) {
        stackGaps.set(skill, (stackGaps.get(skill) ?? 0) + 1)
      }
    }
  }
  const techStackGaps: TechStackGap[] = Array.from(stackGaps.entries())
    .map(([skill, frequency]) => ({ skill, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 15)

  // ── Recommendations ──
  const recommendations: Recommendation[] = []

  const geoBlocker = blockerAnalysis.find((b) => b.blocker === "geo-restriction")
  if (geoBlocker && geoBlocker.percentage >= 20) {
    recommendations.push({
      action: `Tighten location filters in your scanner — ${geoBlocker.percentage}% of applications hit a geo-restriction blocker.`,
      reasoning: `${geoBlocker.frequency} of ${enriched.length} offers are location-restricted. These are wasted evaluation effort.`,
      impact: "high",
    })
  }

  const stackBlocker = blockerAnalysis.find((b) => b.blocker === "stack-mismatch")
  if (stackBlocker && stackBlocker.percentage >= 15) {
    const topGaps = techStackGaps
      .slice(0, 3)
      .map((g) => g.skill)
      .join(", ")
    recommendations.push({
      action: topGaps
        ? `Filter out roles requiring ${topGaps} as primary stack — ${stackBlocker.percentage}% hit stack mismatch.`
        : `Filter out roles with mismatched tech stacks — ${stackBlocker.percentage}% hit stack mismatch.`,
      reasoning: topGaps
        ? `Core stack gaps (${topGaps}) are the most common technical blockers in negative outcomes.`
        : "Stack mismatches are a recurring blocker on negative outcomes.",
      impact: "high",
    })
  }

  if (minPositive > 3.0) {
    recommendations.push({
      action: `Set minimum score threshold at ${scoreThreshold.recommended}/5 before generating PDFs.`,
      reasoning: `No positive outcomes below ${minPositive}/5. Scores below this haven't produced traction.`,
      impact: "medium",
    })
  }

  const bestArchetype = archetypeBreakdown
    .filter((a) => a.total >= 2)
    .sort((a, b) => b.conversionRate - a.conversionRate)[0]
  if (bestArchetype && bestArchetype.conversionRate > 0) {
    recommendations.push({
      action: `Double down on "${bestArchetype.archetype}" roles (${bestArchetype.conversionRate}% conversion).`,
      reasoning: `${bestArchetype.positive} of ${bestArchetype.total} applications in this archetype led to positive outcomes.`,
      impact: "medium",
    })
  }

  const worstRemote = remotePolicy.find(
    (r) => r.total >= 2 && r.conversionRate === 0
  )
  if (worstRemote) {
    recommendations.push({
      action: `Avoid "${worstRemote.policy}" roles (0% conversion across ${worstRemote.total} applications).`,
      reasoning: `None of the ${worstRemote.total} applications with this policy led to progress.`,
      impact: "medium",
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      action: "Keep applying — more data will reveal clearer patterns.",
      reasoning: "Focus on roles scoring 3.5+ for best results.",
      impact: "low",
    })
  }

  // ── Metadata ──
  const dates = enriched.map((e) => e.date).sort()
  const byOutcome: Record<Outcome, number> = {
    positive: 0,
    negative: 0,
    self_filtered: 0,
    pending: 0,
  }
  for (const e of enriched) byOutcome[e.outcome]++

  // Average score across everything with a non-zero score (eval'd apps only).
  const allScores = enriched.map((e) => e.score).filter((s) => s > 0)
  const avgScore =
    allScores.length > 0
      ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) /
        100
      : 0

  return {
    ok: true,
    metadata: {
      total: enriched.length,
      dateRange: {
        from: dates[0] ?? null,
        to: dates[dates.length - 1] ?? null,
      },
      analysisDate: new Date().toISOString().slice(0, 10),
      byOutcome,
    },
    avgScore,
    funnel,
    scoreComparison,
    archetypeBreakdown,
    blockerAnalysis,
    remotePolicy,
    scoreThreshold,
    techStackGaps,
    recommendations,
  }
}
