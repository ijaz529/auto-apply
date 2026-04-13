/**
 * Pattern Analysis — Rejection pattern detection and targeting recommendations
 *
 * Ported from analyze-patterns.mjs in career-ops.
 * Queries user's applications + evaluations from the database and computes
 * funnel metrics, archetype breakdown, blocker analysis, and recommendations.
 */

import { prisma } from "@/lib/db"

// ── Types ──────────────────────────────────────────────────────────

export interface PatternAnalysis {
  totalApplications: number
  outcomeDistribution: Record<string, number>
  conversionFunnel: Array<{ stage: string; count: number; rate: number }>
  scoreByOutcome: Array<{ outcome: string; avgScore: number; count: number }>
  archetypeBreakdown: Array<{
    archetype: string
    count: number
    positiveRate: number
  }>
  topGaps: Array<{ description: string; frequency: number }>
  remotePolicy: Array<{
    policy: string
    total: number
    positive: number
    conversionRate: number
  }>
  recommendations: string[]
}

// ── Outcome Classification ─────────────────────────────────────────

function classifyOutcome(status: string): "positive" | "negative" | "self_filtered" | "pending" {
  const s = status.toLowerCase()
  if (["interview", "offer", "responded", "applied"].includes(s)) return "positive"
  if (["rejected", "discarded"].includes(s)) return "negative"
  if (["skip"].includes(s)) return "self_filtered"
  return "pending"
}

// ── Remote Policy Classification ───────────────────────────────────

function classifyRemote(raw: string | null): string {
  if (!raw) return "unknown"
  const lower = raw.toLowerCase()
  if (/\b(us[- ]?only|canada[- ]?only|residents only|usa only|us residents|canada residents)\b/.test(lower)) return "geo-restricted"
  if (/\bargentina\s+remote\s+only\b/.test(lower)) return "geo-restricted"
  if (/\b(hybrid|on-?site|office|columbus|cape town|relocat)\b/.test(lower)) return "hybrid/onsite"
  if (/\b(global|anywhere|worldwide|no restrict|70\+|work from anywhere)\b/.test(lower)) return "global remote"
  if (/\b(remote|latam|americas|brazil|fully remote)\b/.test(lower)) return "regional remote"
  return "unknown"
}

// ── Gap Blocker Extraction ─────────────────────────────────────────

function extractBlockerType(description: string, severity: string): string | null {
  const desc = description.toLowerCase()
  const sev = severity.toLowerCase()
  if (sev.includes("nice") || sev.includes("soft")) return null
  if (/\b(residency|us[- ]only|canada|location|visa|geo|country|region)\b/.test(desc)) return "geo-restriction"
  if (/\b(javascript|typescript|python|ruby|java|go|rust|node|react|angular|vue|django|flask|rails)\b/.test(desc)) return "stack-mismatch"
  if (/\b(senior|staff|lead|principal|director|manager|head)\b/.test(desc)) return "seniority-mismatch"
  if (/\b(hybrid|on-?site|office|relocat)\b/.test(desc)) return "onsite-requirement"
  return "other"
}

// ── Score Stats ────────────────────────────────────────────────────

function scoreStats(scores: number[]): { avg: number; min: number; max: number; count: number } {
  if (scores.length === 0) return { avg: 0, min: 0, max: 0, count: 0 }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return {
    avg: Math.round(avg * 100) / 100,
    min: Math.min(...scores),
    max: Math.max(...scores),
    count: scores.length,
  }
}

// ── Main Analysis ──────────────────────────────────────────────────

export async function analyzePatterns(userId: string): Promise<PatternAnalysis> {
  // Fetch all applications with their jobs and evaluations
  const applications = await prisma.application.findMany({
    where: { userId },
    include: {
      job: {
        include: {
          evaluation: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  const totalApplications = applications.length

  if (totalApplications === 0) {
    return {
      totalApplications: 0,
      outcomeDistribution: {},
      conversionFunnel: [],
      scoreByOutcome: [],
      archetypeBreakdown: [],
      topGaps: [],
      remotePolicy: [],
      recommendations: ["Start by adding job URLs to evaluate. You need data before patterns emerge."],
    }
  }

  // Enrich each application
  const enriched = applications.map((app) => {
    const eval_ = app.job.evaluation
    const outcome = classifyOutcome(app.status)
    const score = eval_?.score || 0
    const archetype = eval_?.archetype || "Unknown"
    const gaps = (eval_?.gaps as Array<{ description: string; severity: string; mitigation: string }>) || []
    const remote = app.job.remote || app.job.location || null

    return {
      id: app.id,
      status: app.status,
      outcome,
      score,
      archetype,
      gaps,
      remoteBucket: classifyRemote(remote),
      createdAt: app.createdAt,
    }
  })

  // Outcome distribution
  const outcomeDistribution: Record<string, number> = {}
  for (const e of enriched) {
    const s = e.status.toLowerCase()
    outcomeDistribution[s] = (outcomeDistribution[s] || 0) + 1
  }

  // Conversion funnel
  const funnelStages = ["evaluated", "applied", "responded", "interview", "offer"]
  const funnelCounts: Record<string, number> = {}
  for (const e of enriched) {
    const s = e.status.toLowerCase()
    funnelCounts[s] = (funnelCounts[s] || 0) + 1
  }

  const conversionFunnel = funnelStages.map((stage, idx) => {
    const count = funnelCounts[stage] || 0
    const prevCount = idx === 0
      ? totalApplications
      : funnelCounts[funnelStages[idx - 1]] || 0
    const rate = prevCount > 0 ? Math.round((count / prevCount) * 100) : 0
    return { stage, count, rate }
  })

  // Score by outcome
  const scoresByOutcome: Record<string, number[]> = {
    positive: [],
    negative: [],
    self_filtered: [],
    pending: [],
  }
  for (const e of enriched) {
    if (e.score > 0) {
      scoresByOutcome[e.outcome].push(e.score)
    }
  }

  const scoreByOutcome = Object.entries(scoresByOutcome)
    .filter(([, scores]) => scores.length > 0)
    .map(([outcome, scores]) => {
      const stats = scoreStats(scores)
      return { outcome, avgScore: stats.avg, count: stats.count }
    })

  // Archetype breakdown
  const archetypeMap = new Map<string, { total: number; positive: number }>()
  for (const e of enriched) {
    const existing = archetypeMap.get(e.archetype) || { total: 0, positive: 0 }
    existing.total++
    if (e.outcome === "positive") existing.positive++
    archetypeMap.set(e.archetype, existing)
  }

  const archetypeBreakdown = Array.from(archetypeMap.entries())
    .map(([archetype, data]) => ({
      archetype,
      count: data.total,
      positiveRate: data.total > 0
        ? Math.round((data.positive / data.total) * 100)
        : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // Top gaps (aggregate from evaluations)
  const gapCounts = new Map<string, number>()
  for (const e of enriched) {
    for (const gap of e.gaps) {
      const blockerType = extractBlockerType(gap.description, gap.severity)
      if (blockerType) {
        gapCounts.set(blockerType, (gapCounts.get(blockerType) || 0) + 1)
      }
    }
  }

  const topGaps = Array.from(gapCounts.entries())
    .map(([description, frequency]) => ({ description, frequency }))
    .sort((a, b) => b.frequency - a.frequency)

  // Remote policy breakdown
  const remoteMap = new Map<string, { total: number; positive: number }>()
  for (const e of enriched) {
    const existing = remoteMap.get(e.remoteBucket) || { total: 0, positive: 0 }
    existing.total++
    if (e.outcome === "positive") existing.positive++
    remoteMap.set(e.remoteBucket, existing)
  }

  const remotePolicyBreakdown = Array.from(remoteMap.entries())
    .map(([policy, data]) => ({
      policy,
      total: data.total,
      positive: data.positive,
      conversionRate: data.total > 0
        ? Math.round((data.positive / data.total) * 100)
        : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // Recommendations
  const recommendations: string[] = []

  // Geo-restriction recommendation
  const geoBlocker = topGaps.find((g) => g.description === "geo-restriction")
  if (geoBlocker && geoBlocker.frequency / totalApplications >= 0.2) {
    const pct = Math.round((geoBlocker.frequency / totalApplications) * 100)
    recommendations.push(
      `Tighten location filters -- ${pct}% of applications hit a geo-restriction blocker. These are wasted evaluation effort.`
    )
  }

  // Stack mismatch recommendation
  const stackBlocker = topGaps.find((g) => g.description === "stack-mismatch")
  if (stackBlocker && stackBlocker.frequency / totalApplications >= 0.15) {
    const pct = Math.round((stackBlocker.frequency / totalApplications) * 100)
    recommendations.push(
      `Filter out roles with mismatched tech stacks -- ${pct}% of applications hit a stack mismatch gap.`
    )
  }

  // Score threshold recommendation
  const positiveScores = scoresByOutcome.positive
  if (positiveScores.length > 0) {
    const minPositive = Math.min(...positiveScores)
    if (minPositive > 3.0) {
      recommendations.push(
        `Set minimum score threshold at ${Math.floor(minPositive * 10) / 10}/5 before generating PDFs. No positive outcomes below ${minPositive}/5.`
      )
    }
  }

  // Best archetype recommendation
  const bestArchetype = archetypeBreakdown
    .filter((a) => a.count >= 2)
    .sort((a, b) => b.positiveRate - a.positiveRate)[0]
  if (bestArchetype && bestArchetype.positiveRate > 0) {
    recommendations.push(
      `Double down on "${bestArchetype.archetype}" roles (${bestArchetype.positiveRate}% conversion rate).`
    )
  }

  // Worst remote policy recommendation
  const worstRemote = remotePolicyBreakdown.find(
    (r) => r.total >= 2 && r.conversionRate === 0
  )
  if (worstRemote) {
    recommendations.push(
      `Avoid "${worstRemote.policy}" roles (0% conversion across ${worstRemote.total} applications).`
    )
  }

  // Fallback if no recommendations generated
  if (recommendations.length === 0) {
    recommendations.push(
      "Keep applying -- more data will reveal clearer patterns. Focus on roles scoring 3.5+ for best results."
    )
  }

  return {
    totalApplications,
    outcomeDistribution,
    conversionFunnel,
    scoreByOutcome,
    archetypeBreakdown,
    topGaps,
    remotePolicy: remotePolicyBreakdown,
    recommendations,
  }
}
