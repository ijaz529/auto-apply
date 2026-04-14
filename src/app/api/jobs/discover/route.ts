import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import {
  scanPortals,
  type TitleFilterConfig,
  type JobResult,
} from "@/lib/scanner"
import { ALL_PORTALS } from "@/lib/scanner/portals"
import type { CVData } from "@/types"

// ── CV Signal Extraction ──────────────────────────────────────────

interface CVSignals {
  roleTitles: string[]     // from work experience titles
  skills: string[]         // from skills section
  domains: string[]        // inferred from experience + skills
  seniority: string[]      // inferred from titles + years
  locations: string[]      // from CV location + work locations
}

const SENIORITY_KEYWORDS: Record<string, string[]> = {
  senior: ["senior", "sr.", "sr "],
  lead: ["lead", "principal", "staff", "head of"],
  director: ["director", "vp", "vice president"],
  manager: ["manager"],
}

const NEGATIVE_TITLES = [
  "junior", "intern", "working student", "werkstudent",
  "trainee", "apprentice", "entry level", "entry-level",
]

// Map skill/domain keywords to job title search terms
const DOMAIN_TO_TITLE: Record<string, string[]> = {
  // Engineering
  "python": ["engineer", "developer", "data"],
  "javascript": ["engineer", "developer", "frontend"],
  "typescript": ["engineer", "developer", "frontend", "fullstack"],
  "react": ["frontend", "fullstack", "developer"],
  "node": ["backend", "fullstack", "developer"],
  "go": ["backend", "engineer", "platform"],
  "rust": ["engineer", "systems", "platform"],
  "java": ["engineer", "backend", "developer"],
  "kubernetes": ["devops", "sre", "platform", "infrastructure"],
  "aws": ["cloud", "devops", "engineer", "platform"],
  "docker": ["devops", "platform", "engineer"],
  "terraform": ["devops", "infrastructure", "platform"],

  // Data & AI
  "machine learning": ["ml", "ai", "data", "engineer"],
  "ml": ["ml", "ai", "data", "engineer"],
  "ai": ["ai", "ml", "engineer", "product"],
  "llm": ["ai", "ml", "llm", "engineer"],
  "data pipeline": ["data", "engineer", "analytics"],
  "sql": ["data", "analyst", "engineer", "analytics"],
  "analytics": ["analyst", "data", "analytics", "bi"],

  // Product & Design
  "product management": ["product", "manager", "program"],
  "roadmap": ["product", "manager", "program"],
  "stakeholder": ["product", "manager", "program", "operations"],
  "user research": ["ux", "research", "designer"],
  "figma": ["designer", "ux", "ui", "product"],

  // Operations
  "operations": ["operations", "ops", "manager"],
  "project management": ["project", "program", "manager"],
  "agile": ["product", "project", "scrum", "manager"],
  "scrum": ["scrum", "agile", "product", "project"],

  // Sales & Marketing
  "gtm": ["growth", "marketing", "sales", "gtm"],
  "marketing": ["marketing", "growth", "content"],
  "sales": ["sales", "account", "business development"],

  // Support & Solutions
  "technical support": ["support", "solutions", "technical"],
  "customer success": ["customer success", "support", "solutions"],
  "solutions": ["solutions", "architect", "engineer"],
}

function extractCVSignals(cv: CVData, profileLocation?: string | null): CVSignals {
  const roleTitleSet = new Set<string>()
  const skillSet = new Set<string>()
  const domainSet = new Set<string>()
  const senioritySet = new Set<string>()
  const locationSet = new Set<string>()

  const experience = cv.experience || []
  const skills = cv.skills || []

  // 1. Extract role titles from work experience
  for (const w of experience) {
    if (!w.title) continue
    const lower = w.title.toLowerCase()

    // Detect seniority from each title
    for (const [level, keywords] of Object.entries(SENIORITY_KEYWORDS)) {
      if (keywords.some((k) => lower.includes(k))) {
        senioritySet.add(level)
      }
    }

    // Extract clean role words (strip seniority + parentheticals)
    const cleaned = lower
      .replace(/\(.*?\)/g, "")
      .replace(/senior|lead|principal|staff|head of|junior|sr\.|sr |director|vp|manager/gi, "")
      .trim()
    const words = cleaned.split(/[\s,/&-]+/).filter((w) => w.length > 2)
    for (const word of words) {
      roleTitleSet.add(word)
    }

    // Full title for matching (e.g. "product operations specialist")
    const titleWords = lower.replace(/\(.*?\)/g, "").trim().split(/[\s,/&-]+/).filter((w) => w.length > 2)
    for (const tw of titleWords) {
      roleTitleSet.add(tw)
    }
  }

  // 2. Extract skills
  for (const cat of skills) {
    if (!cat.items) continue
    for (const item of cat.items) {
      skillSet.add(item.toLowerCase())
    }
  }

  // 3. Map skills + role titles to domain search terms
  const allText = [
    ...experience.map((w) => w.title || ""),
    ...experience.flatMap((w) => w.bullets || []),
    ...skills.flatMap((s) => s.items || []),
    cv.summary || "",
  ].join(" ").toLowerCase()

  for (const [keyword, titleTerms] of Object.entries(DOMAIN_TO_TITLE)) {
    if (allText.includes(keyword)) {
      for (const term of titleTerms) {
        domainSet.add(term)
      }
    }
  }

  // 4. If no seniority detected and experience > 5 years, assume senior
  if (senioritySet.size === 0 && experience.length >= 3) {
    senioritySet.add("senior")
  }

  // 5. Location from CV + profile
  if (cv.location) {
    const parts = cv.location.toLowerCase().split(",")
    for (const p of parts) {
      const trimmed = p.trim()
      if (trimmed && trimmed.length > 2) locationSet.add(trimmed)
    }
  }
  if (profileLocation) {
    const parts = profileLocation.toLowerCase().split(",")
    for (const p of parts) {
      const trimmed = p.trim()
      if (trimmed && trimmed.length > 2) locationSet.add(trimmed)
    }
  }

  return {
    roleTitles: [...roleTitleSet],
    skills: [...skillSet],
    domains: [...domainSet],
    seniority: [...senioritySet],
    locations: [...locationSet],
  }
}

// ── Build title filter from CV signals ────────────────────────────

function buildCVFilter(signals: CVSignals): TitleFilterConfig {
  const positive = new Set<string>()

  // Domain-derived title keywords (highest signal)
  for (const d of signals.domains) {
    positive.add(d)
  }

  // Role title words from experience
  const genericWords = new Set([
    "the", "and", "for", "with", "new", "all", "any", "our",
    "team", "role", "job", "work", "join", "company", "global",
    "specialist", "associate", "coordinator", "executive",
  ])
  for (const rt of signals.roleTitles) {
    if (!genericWords.has(rt)) positive.add(rt)
  }

  // Seniority
  for (const s of signals.seniority) {
    if (s === "senior") positive.add("senior")
    else if (s === "lead") positive.add("lead")
    else if (s === "director") positive.add("director")
    else if (s === "manager") positive.add("manager")
  }

  return {
    positive: [...positive],
    negative: [...NEGATIVE_TITLES],
  }
}

// ── Relevance scoring ─────────────────────────────────────────────

function scoreRelevance(job: JobResult, signals: CVSignals): number {
  const lower = job.title.toLowerCase()
  const locLower = job.location.toLowerCase()
  let score = 0
  let maxPossible = 0

  // Domain match (40 pts) — does the title contain domain terms from CV?
  if (signals.domains.length > 0) {
    maxPossible += 40
    const domainMatches = signals.domains.filter((d) => lower.includes(d))
    if (domainMatches.length >= 2) score += 40
    else if (domainMatches.length === 1) score += 25
  }

  // Role keyword overlap (25 pts)
  if (signals.roleTitles.length > 0) {
    maxPossible += 25
    const roleMatches = signals.roleTitles.filter((r) => lower.includes(r))
    const roleRatio = Math.min(roleMatches.length / Math.min(signals.roleTitles.length, 4), 1)
    score += Math.round(roleRatio * 25)
  }

  // Seniority match (15 pts)
  maxPossible += 15
  if (signals.seniority.length > 0) {
    for (const s of signals.seniority) {
      const keywords = SENIORITY_KEYWORDS[s]
      if (keywords?.some((k) => lower.includes(k))) {
        score += 15
        break
      }
    }
  } else {
    if (!NEGATIVE_TITLES.some((n) => lower.includes(n))) score += 8
  }

  // Location match (20 pts)
  maxPossible += 20
  if (signals.locations.length === 0) {
    score += 10
  } else {
    if (signals.locations.some((loc) => locLower.includes(loc))) score += 20
    else if (locLower.includes("remote")) score += 12
  }

  // Normalize to 0-100 based on what dimensions we actually have
  if (maxPossible === 0) return 50
  return Math.round((score / maxPossible) * 100)
}

// ── Parse preferences string ──────────────────────────────────────

interface ParsedPreferences {
  locations: string[]
  workType: string[]     // remote, hybrid, onsite
  keywords: string[]     // extra role/domain keywords
}

function parsePreferences(text: string): ParsedPreferences {
  const lower = text.toLowerCase()
  const locations: string[] = []
  const workType: string[] = []
  const keywords: string[] = []

  // Detect work type
  if (lower.includes("remote")) workType.push("remote")
  if (lower.includes("hybrid")) workType.push("hybrid")
  if (lower.includes("onsite") || lower.includes("on-site") || lower.includes("on site")) workType.push("onsite")

  // Extract known cities/regions
  const knownLocations = [
    "berlin", "munich", "hamburg", "frankfurt", "cologne", "düsseldorf",
    "dubai", "abu dhabi", "riyadh", "doha",
    "london", "paris", "amsterdam", "barcelona", "madrid", "lisbon",
    "stockholm", "copenhagen", "oslo", "helsinki", "vienna", "zurich",
    "new york", "san francisco", "austin", "seattle", "chicago", "boston",
    "singapore", "tokyo", "sydney", "toronto", "montreal",
    "germany", "uae", "uk", "spain", "france", "netherlands", "sweden",
    "europe", "mena", "apac",
  ]
  for (const loc of knownLocations) {
    if (lower.includes(loc)) locations.push(loc)
  }

  // Extract extra keywords (split on common delimiters, skip filler)
  const filler = new Set([
    "jobs", "job", "in", "with", "salary", "above", "below", "over", "under",
    "remote", "hybrid", "onsite", "on-site", "the", "and", "for", "or", "a",
    "an", "aed", "eur", "usd", "gbp", "per", "month", "year", "annual",
    ...knownLocations,
  ])
  const tokens = lower
    .replace(/[€$£]/g, "")
    .split(/[,;/|]+/)
    .flatMap((s) => s.trim().split(/\s+/))
    .filter((t) => t.length > 2 && !filler.has(t) && !/^\d+k?$/.test(t))

  for (const t of tokens) {
    if (!keywords.includes(t)) keywords.push(t)
  }

  return { locations, workType, keywords }
}

// ── POST handler ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()

    const body = await req.json().catch(() => ({}))
    const { preferences } = body as { preferences?: string }

    // Load profile with structured CV
    const profile = await prisma.profile.findUnique({
      where: { userId },
    })

    if (!profile?.cvStructured) {
      return NextResponse.json(
        { error: "No CV found. Upload your CV first." },
        { status: 400 }
      )
    }

    const cv = profile.cvStructured as unknown as CVData
    if (!cv || typeof cv !== "object") {
      return NextResponse.json(
        { error: "CV data is malformed. Try re-uploading your CV." },
        { status: 400 }
      )
    }

    const signals = extractCVSignals(cv, profile.location)

    // If CV structured data yielded no domains, scan raw CV markdown for keywords
    if (signals.domains.length === 0 && profile.cvMarkdown) {
      const rawLower = profile.cvMarkdown.toLowerCase()
      for (const [keyword, titleTerms] of Object.entries(DOMAIN_TO_TITLE)) {
        if (rawLower.includes(keyword)) {
          for (const term of titleTerms) {
            if (!signals.domains.includes(term)) signals.domains.push(term)
          }
        }
      }
    }

    // Merge user preferences into signals
    let parsedPrefs: ParsedPreferences | null = null
    if (preferences?.trim()) {
      parsedPrefs = parsePreferences(preferences)
      // Override locations if user specified them
      if (parsedPrefs.locations.length > 0) {
        signals.locations = parsedPrefs.locations
      }
      // Add work type to locations for matching
      for (const wt of parsedPrefs.workType) {
        if (!signals.locations.includes(wt)) signals.locations.push(wt)
      }
      // Add extra keywords to domains
      for (const kw of parsedPrefs.keywords) {
        if (!signals.domains.includes(kw)) signals.domains.push(kw)
      }
    }

    const titleFilter = buildCVFilter(signals)

    // If no positive filter from CV, run a broad scan (all jobs pass, ranked by relevance)
    // This is fine — the relevance scoring will still rank results

    // Get existing job URLs to skip duplicates
    const existingJobs = await prisma.job.findMany({
      where: { userId },
      select: { url: true },
    })
    const existingUrls = new Set(existingJobs.map((j) => j.url))

    // Scan ALL portals (60+)
    const summary = await scanPortals(ALL_PORTALS, titleFilter, existingUrls)

    // Score and rank
    const scoredJobs = summary.newJobs
      .map((job) => ({ ...job, relevance: scoreRelevance(job, signals) }))
      .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
      .slice(0, 300)

    return NextResponse.json({
      jobs: scoredJobs,
      meta: {
        companiesScanned: summary.companiesScanned,
        totalJobsFound: summary.totalJobsFound,
        filteredByTitle: summary.filteredByTitle,
        duplicatesSkipped: summary.duplicatesSkipped,
        errors: summary.errors,
        signalsUsed: {
          domains: signals.domains.slice(0, 10),
          seniority: signals.seniority,
          locations: signals.locations,
          roleTitleCount: signals.roleTitles.length,
          skillCount: signals.skills.length,
        },
        preferencesApplied: parsedPrefs ? {
          locations: parsedPrefs.locations,
          workType: parsedPrefs.workType,
          extraKeywords: parsedPrefs.keywords,
        } : null,
      },
    })
  } catch (error) {
    console.error("Discover jobs error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
