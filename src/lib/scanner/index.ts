/**
 * Scanner Service — Zero-token portal scanner
 *
 * Fetches Greenhouse, Ashby, and Lever APIs directly, applies title
 * filters, deduplicates against existing jobs, and returns structured results.
 *
 * Ported from scan.mjs in career-ops.
 */

const CONCURRENCY = 15
const FETCH_TIMEOUT_MS = 8_000

// ── Types ──────────────────────────────────────────────────────────

export interface JobResult {
  title: string
  url: string
  company: string
  location: string
  relevance?: number // 0-100 quick relevance score
}

export interface CompanyConfig {
  name: string
  careers_url?: string
  api?: string
  enabled?: boolean
}

export interface TitleFilterConfig {
  positive: string[]
  negative: string[]
}

export interface ScanSummary {
  companiesScanned: number
  companiesSkipped: number
  totalJobsFound: number
  filteredByTitle: number
  duplicatesSkipped: number
  newJobs: JobResult[]
  errors: Array<{ company: string; error: string }>
  scannedAt: string
}

interface DetectedApi {
  type: "greenhouse" | "ashby" | "lever"
  url: string
}

// ── API Detection ──────────────────────────────────────────────────

export function detectApi(careersUrl: string, apiOverride?: string): DetectedApi | null {
  // Greenhouse: explicit api field
  if (apiOverride && apiOverride.includes("greenhouse")) {
    return { type: "greenhouse", url: apiOverride }
  }

  const url = careersUrl || ""

  // Ashby
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)
  if (ashbyMatch) {
    return {
      type: "ashby",
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    }
  }

  // Lever
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/)
  if (leverMatch) {
    return {
      type: "lever",
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    }
  }

  // Greenhouse (including EU boards)
  const ghMatch = url.match(/(?:job-boards(?:\.eu)?\.greenhouse\.io|boards\.greenhouse\.io)\/([^/?#]+)/)
  if (ghMatch) {
    return {
      type: "greenhouse",
      url: `https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs`,
    }
  }

  return null
}

// ── API Parsers ────────────────────────────────────────────────────

export function parseGreenhouse(json: Record<string, unknown>, companyName: string): JobResult[] {
  const jobs = (json.jobs as Array<Record<string, unknown>>) || []
  return jobs.map((j) => ({
    title: (j.title as string) || "",
    url: (j.absolute_url as string) || "",
    company: companyName,
    location: ((j.location as Record<string, unknown>)?.name as string) || "",
  }))
}

export function parseAshby(json: Record<string, unknown>, companyName: string): JobResult[] {
  const jobs = (json.jobs as Array<Record<string, unknown>>) || []
  return jobs.map((j) => ({
    title: (j.title as string) || "",
    url: (j.jobUrl as string) || "",
    company: companyName,
    location: (j.location as string) || "",
  }))
}

export function parseLever(json: unknown, companyName: string): JobResult[] {
  if (!Array.isArray(json)) return []
  return json.map((j: Record<string, unknown>) => ({
    title: (j.text as string) || "",
    url: (j.hostedUrl as string) || "",
    company: companyName,
    location: ((j.categories as Record<string, unknown>)?.location as string) || "",
  }))
}

const PARSERS: Record<string, (json: unknown, company: string) => JobResult[]> = {
  greenhouse: parseGreenhouse as (json: unknown, company: string) => JobResult[],
  ashby: parseAshby as (json: unknown, company: string) => JobResult[],
  lever: parseLever,
}

// ── Fetch with Timeout ─────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ── Title Filter ───────────────────────────────────────────────────

export function buildTitleFilter(config: TitleFilterConfig): (title: string) => boolean {
  const positive = (config.positive || []).map((k) => k.toLowerCase())
  const negative = (config.negative || []).map((k) => k.toLowerCase())

  return (title: string) => {
    const lower = title.toLowerCase()
    const hasPositive = positive.length === 0 || positive.some((k) => lower.includes(k))
    const hasNegative = negative.some((k) => lower.includes(k))
    return hasPositive && !hasNegative
  }
}

// ── Parallel Fetch with Concurrency Limit ──────────────────────────

async function parallelFetch<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = []
  let i = 0

  async function next(): Promise<void> {
    while (i < tasks.length) {
      const task = tasks[i++]
      results.push(await task())
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => next()
  )
  await Promise.all(workers)
  return results
}

// ── Main Scanner ───────────────────────────────────────────────────

export async function scanPortals(
  companies: CompanyConfig[],
  titleFilter: TitleFilterConfig,
  existingUrls?: Set<string>
): Promise<ScanSummary> {
  const filter = buildTitleFilter(titleFilter)
  const seenUrls = existingUrls || new Set<string>()
  const date = new Date().toISOString().slice(0, 10)

  // Filter to enabled companies with detectable APIs
  const targets = companies
    .filter((c) => c.enabled !== false)
    .map((c) => ({
      ...c,
      _api: detectApi(c.careers_url || "", c.api),
    }))
    .filter((c) => c._api !== null)

  const skippedCount = companies.filter((c) => c.enabled !== false).length - targets.length

  let totalFound = 0
  let totalFiltered = 0
  let totalDupes = 0
  const newJobs: JobResult[] = []
  const errors: Array<{ company: string; error: string }> = []

  const tasks = targets.map((company) => async () => {
    const { type, url } = company._api!
    try {
      const json = await fetchJson(url)
      const jobs = PARSERS[type](json, company.name)
      totalFound += jobs.length

      for (const job of jobs) {
        if (!filter(job.title)) {
          totalFiltered++
          continue
        }
        if (seenUrls.has(job.url)) {
          totalDupes++
          continue
        }
        // Mark as seen to avoid intra-scan dupes
        seenUrls.add(job.url)
        newJobs.push(job)
      }
    } catch (err) {
      errors.push({
        company: company.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  await parallelFetch(tasks, CONCURRENCY)

  return {
    companiesScanned: targets.length,
    companiesSkipped: skippedCount,
    totalJobsFound: totalFound,
    filteredByTitle: totalFiltered,
    duplicatesSkipped: totalDupes,
    newJobs,
    errors,
    scannedAt: date,
  }
}
