import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import {
  scanPortals,
  type TitleFilterConfig,
  type JobResult,
} from "@/lib/scanner"
import { ALL_PORTALS } from "@/lib/scanner/portals"

// ── Seniority detection ───────────────────────────────────────────

const SENIORITY_LEVELS = [
  { level: "senior", keywords: ["senior", "sr.", "sr "], weight: 3 },
  { level: "lead", keywords: ["lead", "principal", "staff"], weight: 3 },
  { level: "head", keywords: ["head of", "director", "vp"], weight: 2 },
  { level: "mid", keywords: ["mid-level", "mid level", "(m/f/d)"], weight: 1 },
] as const

const NEGATIVE_SENIORITY = [
  "junior",
  "intern",
  "working student",
  "werkstudent",
  "trainee",
  "apprentice",
  "entry level",
  "entry-level",
]

function detectSeniority(title: string): string | null {
  const lower = title.toLowerCase()
  for (const s of SENIORITY_LEVELS) {
    if (s.keywords.some((k) => lower.includes(k))) return s.level
  }
  return null
}

// ── Extract signals from user's evaluated jobs ────────────────────

interface JobSignals {
  archetypes: string[]       // e.g. ["Product Manager", "AI Transformation"]
  roleKeywords: string[]     // extracted from role titles
  atsKeywords: string[]      // from evaluation keywords
  locations: string[]        // from job locations
  seniority: string[]        // detected seniority levels
}

function extractSignals(
  jobs: Array<{
    role: string
    location: string | null
    evaluation: {
      archetype: string | null
      keywords: string[] | null
    } | null
  }>
): JobSignals {
  const archetypeSet = new Set<string>()
  const roleKeywordSet = new Set<string>()
  const atsKeywordSet = new Set<string>()
  const locationSet = new Set<string>()
  const senioritySet = new Set<string>()

  for (const job of jobs) {
    // Archetypes from evaluations
    if (job.evaluation?.archetype) {
      // Archetype might be "Product Manager / AI Transformation"
      for (const part of job.evaluation.archetype.split(/[/,&]+/)) {
        const trimmed = part.trim().toLowerCase()
        if (trimmed) archetypeSet.add(trimmed)
      }
    }

    // Keywords from evaluation
    if (job.evaluation?.keywords) {
      for (const kw of job.evaluation.keywords) {
        atsKeywordSet.add(kw.toLowerCase())
      }
    }

    // Role title words (strip seniority prefixes, split on common delimiters)
    const roleWords = job.role
      .toLowerCase()
      .replace(/\(.*?\)/g, "") // remove parenthetical like (m/f/d)
      .replace(/senior|lead|principal|staff|head of|junior|sr\.|sr /gi, "")
      .split(/[\s,/&-]+/)
      .filter((w) => w.length > 2)
    for (const w of roleWords) {
      roleKeywordSet.add(w)
    }

    // Seniority
    const seniority = detectSeniority(job.role)
    if (seniority) senioritySet.add(seniority)

    // Location
    if (job.location) {
      // Normalize: "Berlin, Germany" → "berlin"
      const parts = job.location.toLowerCase().split(",")
      for (const p of parts) {
        const trimmed = p.trim()
        if (trimmed && trimmed !== "remote" && trimmed.length > 2) {
          locationSet.add(trimmed)
        }
      }
      // Also check for "remote"
      if (job.location.toLowerCase().includes("remote")) {
        locationSet.add("remote")
      }
    }
  }

  return {
    archetypes: [...archetypeSet],
    roleKeywords: [...roleKeywordSet],
    atsKeywords: [...atsKeywordSet],
    locations: [...locationSet],
    seniority: [...senioritySet],
  }
}

// ── Build smart filter from signals ───────────────────────────────

// Map archetypes to title keywords that appear in job portal listings
const ARCHETYPE_TITLE_KEYWORDS: Record<string, string[]> = {
  "product manager": ["product", "program"],
  "backend": ["backend", "back-end", "server", "api"],
  "frontend": ["frontend", "front-end", "ui"],
  "full stack": ["fullstack", "full-stack", "full stack"],
  "data": ["data", "analytics", "bi"],
  "ml": ["machine learning", "ml", "data science"],
  "ai": ["ai", "machine learning", "ml", "llm"],
  "devops": ["devops", "sre", "platform", "infrastructure"],
  "mobile": ["mobile", "ios", "android"],
  "security": ["security", "infosec"],
  "solutions architect": ["solutions", "architect"],
  "design": ["designer", "ux", "ui"],
  "operations": ["operations", "ops"],
  "transformation": ["transformation", "enablement", "change"],
}

function buildSmartFilter(signals: JobSignals): TitleFilterConfig {
  const positive = new Set<string>()

  // 1. Map archetypes to title keywords
  for (const arch of signals.archetypes) {
    for (const [pattern, keywords] of Object.entries(ARCHETYPE_TITLE_KEYWORDS)) {
      if (arch.includes(pattern)) {
        for (const kw of keywords) positive.add(kw)
      }
    }
  }

  // 2. Add high-signal role keywords (skip generic words)
  const genericWords = new Set([
    "the", "and", "for", "with", "new", "all", "any", "our",
    "team", "role", "job", "work", "join", "company", "global",
  ])
  for (const kw of signals.roleKeywords) {
    if (!genericWords.has(kw) && kw.length > 2) {
      positive.add(kw)
    }
  }

  // 3. Seniority as positive filter if detected
  for (const s of signals.seniority) {
    for (const level of SENIORITY_LEVELS) {
      if (level.level === s) {
        positive.add(level.keywords[0]) // add the primary keyword
      }
    }
  }

  return {
    positive: [...positive],
    negative: [...NEGATIVE_SENIORITY],
  }
}

// ── Relevance scoring ─────────────────────────────────────────────

function scoreRelevance(job: JobResult, signals: JobSignals): number {
  const lower = job.title.toLowerCase()
  const locLower = job.location.toLowerCase()
  let score = 0
  let maxScore = 0

  // Archetype match (40 points)
  maxScore += 40
  for (const arch of signals.archetypes) {
    const keywords = ARCHETYPE_TITLE_KEYWORDS[arch] || arch.split(/\s+/)
    if (keywords.some((k) => lower.includes(k))) {
      score += 40
      break
    }
  }

  // Role keyword overlap (25 points)
  maxScore += 25
  const matchingRoleKw = signals.roleKeywords.filter((k) => lower.includes(k))
  if (signals.roleKeywords.length > 0) {
    const ratio = Math.min(matchingRoleKw.length / Math.min(signals.roleKeywords.length, 3), 1)
    score += Math.round(ratio * 25)
  }

  // Seniority match (15 points)
  maxScore += 15
  const jobSeniority = detectSeniority(job.title)
  if (signals.seniority.length === 0) {
    // No seniority preference; give partial credit if not junior
    if (!NEGATIVE_SENIORITY.some((n) => lower.includes(n))) score += 10
  } else if (jobSeniority && signals.seniority.includes(jobSeniority)) {
    score += 15
  } else if (!jobSeniority) {
    // No seniority in title — partial credit
    score += 5
  }

  // Location match (20 points)
  maxScore += 20
  if (signals.locations.length === 0) {
    score += 10 // no preference, partial credit
  } else {
    const locMatch = signals.locations.some((loc) => locLower.includes(loc))
    if (locMatch) score += 20
    else if (locLower.includes("remote")) score += 10
  }

  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 50
}

// ── POST handler ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()

    const body = await req.json().catch(() => ({}))
    const { jobId } = body as { jobId?: string }

    // Load the specific job (or all evaluated jobs as fallback)
    let targetJobs: Array<{
      role: string
      location: string | null
      evaluation: { archetype: string | null; keywords: string[] | null } | null
    }>

    if (jobId) {
      const job = await prisma.job.findFirst({
        where: { id: jobId, userId },
        select: {
          role: true,
          location: true,
          evaluation: { select: { archetype: true, keywords: true } },
        },
      })
      if (!job?.evaluation) {
        return NextResponse.json({ error: "Job not found or not evaluated" }, { status: 404 })
      }
      targetJobs = [{
        ...job,
        evaluation: {
          archetype: job.evaluation.archetype,
          keywords: job.evaluation.keywords as string[] | null,
        },
      }]
    } else {
      const userJobs = await prisma.job.findMany({
        where: { userId },
        select: {
          role: true,
          location: true,
          evaluation: { select: { archetype: true, keywords: true } },
        },
      })
      targetJobs = userJobs
        .filter((j) => j.evaluation)
        .map((j) => ({
          ...j,
          evaluation: {
            archetype: j.evaluation!.archetype,
            keywords: j.evaluation!.keywords as string[] | null,
          },
        }))
    }

    if (targetJobs.length === 0) {
      return NextResponse.json({ jobs: [], meta: { companiesScanned: 0, totalJobsFound: 0 } })
    }

    const signals = extractSignals(targetJobs)
    const titleFilter = buildSmartFilter(signals)

    // Get existing job URLs to skip duplicates
    const existingJobs = await prisma.job.findMany({
      where: { userId },
      select: { url: true },
    })
    const existingUrls = new Set(existingJobs.map((j) => j.url))

    const summary = await scanPortals(ALL_PORTALS, titleFilter, existingUrls)

    const scoredJobs = summary.newJobs
      .map((job) => ({ ...job, relevance: scoreRelevance(job, signals) }))
      .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
      .slice(0, 100)

    return NextResponse.json({
      jobs: scoredJobs,
      meta: {
        companiesScanned: summary.companiesScanned,
        totalJobsFound: summary.totalJobsFound,
        filteredByTitle: summary.filteredByTitle,
        duplicatesSkipped: summary.duplicatesSkipped,
        errors: summary.errors,
        signalsUsed: {
          archetypes: signals.archetypes,
          seniority: signals.seniority,
          locations: signals.locations,
        },
      },
    })
  } catch (error) {
    console.error("Similar jobs scan error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
