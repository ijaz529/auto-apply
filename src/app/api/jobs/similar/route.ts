import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import {
  scanPortals,
  type CompanyConfig,
  type TitleFilterConfig,
} from "@/lib/scanner"

const PRESET_COMPANIES: CompanyConfig[] = [
  { name: "Raisin", careers_url: "https://job-boards.eu.greenhouse.io/raisin" },
  { name: "N26", careers_url: "https://job-boards.greenhouse.io/n26" },
  {
    name: "Trade Republic",
    careers_url: "https://job-boards.greenhouse.io/traderepublicbank",
  },
  { name: "SumUp", careers_url: "https://job-boards.greenhouse.io/sumup" },
  { name: "Adyen", careers_url: "https://job-boards.greenhouse.io/adyen" },
  { name: "Stripe", careers_url: "https://job-boards.greenhouse.io/stripe" },
  { name: "Bolt", careers_url: "https://job-boards.greenhouse.io/boltv2" },
  {
    name: "GetYourGuide",
    careers_url: "https://job-boards.greenhouse.io/getyourguide",
  },
  {
    name: "HelloFresh",
    careers_url: "https://job-boards.greenhouse.io/hellofresh",
  },
  { name: "Wolt", careers_url: "https://job-boards.greenhouse.io/wolt" },
  {
    name: "Contentful",
    careers_url: "https://job-boards.greenhouse.io/contentful",
  },
  { name: "Celonis", careers_url: "https://job-boards.greenhouse.io/celonis" },
  {
    name: "Databricks",
    careers_url: "https://job-boards.greenhouse.io/databricks",
  },
  {
    name: "Doctolib",
    careers_url: "https://job-boards.greenhouse.io/doctolib",
  },
  { name: "Careem", careers_url: "https://boards.greenhouse.io/careem" },
  { name: "Pleo", careers_url: "https://jobs.ashbyhq.com/pleo" },
  { name: "Forto", careers_url: "https://jobs.ashbyhq.com/forto" },
  { name: "Spotify", careers_url: "https://jobs.lever.co/spotify" },
]

function buildFilterFromPreferences(preferences: string): TitleFilterConfig {
  // Split on commas, spaces, and common delimiters
  const tokens = preferences
    .toLowerCase()
    .split(/[,;|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2)

  // Common role keywords to use as positive filters
  const roleKeywords = [
    "product",
    "operations",
    "manager",
    "engineer",
    "developer",
    "designer",
    "analyst",
    "lead",
    "senior",
    "director",
    "head",
    "principal",
    "staff",
    "support",
    "data",
    "marketing",
    "sales",
    "finance",
    "hr",
    "recruiting",
    "devops",
    "sre",
    "backend",
    "frontend",
    "fullstack",
    "full-stack",
    "mobile",
    "ios",
    "android",
    "cloud",
    "security",
    "qa",
    "quality",
    "project",
    "program",
    "strategy",
    "growth",
    "content",
    "ux",
    "ui",
    "research",
    "science",
    "machine learning",
    "ml",
    "ai",
    "payments",
    "compliance",
    "risk",
    "fintech",
  ]

  const positive: string[] = []
  for (const token of tokens) {
    // Check if the token itself or any word in it is a known role keyword
    const words = token.split(/\s+/)
    for (const word of words) {
      if (roleKeywords.includes(word) && !positive.includes(word)) {
        positive.push(word)
      }
    }
    // Also add multi-word tokens that look like role titles
    if (token.split(/\s+/).length >= 2 && !positive.includes(token)) {
      positive.push(token)
    }
  }

  // Always exclude junior/intern roles
  const negative = [
    "junior",
    "intern",
    "working student",
    "werkstudent",
    "trainee",
    "apprentice",
  ]

  return { positive, negative }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()

    const body = await req.json().catch(() => ({}))
    const { preferences } = body as { preferences?: string }

    // Load user profile for fallback preferences
    const profile = await prisma.profile.findUnique({
      where: { userId },
    })

    const effectivePreferences =
      preferences ||
      profile?.preferences ||
      ((profile?.targetRoles as string[] | null) ?? []).join(", ") ||
      ""

    // Build title filter from preferences
    const titleFilter = buildFilterFromPreferences(effectivePreferences)

    // Get existing job URLs to skip duplicates
    const existingJobs = await prisma.job.findMany({
      where: { userId },
      select: { url: true },
    })
    const existingUrls = new Set(existingJobs.map((j) => j.url))

    // Scan preset companies
    const summary = await scanPortals(
      PRESET_COMPANIES,
      titleFilter,
      existingUrls
    )

    // Return top 20 results
    const topJobs = summary.newJobs.slice(0, 20)

    return NextResponse.json({
      jobs: topJobs,
      meta: {
        companiesScanned: summary.companiesScanned,
        totalJobsFound: summary.totalJobsFound,
        filteredByTitle: summary.filteredByTitle,
        duplicatesSkipped: summary.duplicatesSkipped,
        errors: summary.errors,
        titleFilter,
        preferencesUsed: effectivePreferences,
      },
    })
  } catch (error) {
    console.error("Similar jobs scan error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
