/**
 * Scanner Service — Zero-token portal scanner
 *
 * Fetches Greenhouse, Ashby, and Lever APIs directly, applies title
 * filters, deduplicates against existing jobs, and returns structured results.
 * LinkedIn jobs-guest queries dispatch to a separate handler in `./linkedin`.
 *
 * Ported from scan.mjs in career-ops.
 */
import { fetchLinkedInJobs, type LinkedInQuery } from "./linkedin"

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
  /** Discriminator. Absent = ATS (back-compat). */
  kind?: "ats"
  name: string
  careers_url?: string
  api?: string
  enabled?: boolean
}

export interface LinkedInScanEntry extends LinkedInQuery {
  kind: "linkedin"
}

/**
 * A scan can target either company ATS APIs (Greenhouse / Ashby / Lever) or
 * LinkedIn search queries. The discriminated union lets one scan config mix both.
 */
export type ScanEntry = CompanyConfig | LinkedInScanEntry

function isLinkedInEntry(entry: ScanEntry): entry is LinkedInScanEntry {
  return entry.kind === "linkedin"
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
  entries: ScanEntry[],
  titleFilter: TitleFilterConfig,
  existingUrls?: Set<string>
): Promise<ScanSummary> {
  const filter = buildTitleFilter(titleFilter)
  const seenUrls = existingUrls || new Set<string>()
  const date = new Date().toISOString().slice(0, 10)

  const enabled = entries.filter((e) => e.enabled !== false)

  // Split: LinkedIn queries dispatch separately; ATS entries need an api detected.
  const linkedinTargets = enabled.filter(isLinkedInEntry)
  const atsTargets = enabled
    .filter((e): e is CompanyConfig => !isLinkedInEntry(e))
    .map((c) => ({ ...c, _api: detectApi(c.careers_url || "", c.api) }))
    .filter((c) => c._api !== null)

  const atsSkipped =
    enabled.filter((e) => !isLinkedInEntry(e)).length - atsTargets.length

  let totalFound = 0
  let totalFiltered = 0
  let totalDupes = 0
  const newJobs: JobResult[] = []
  const errors: Array<{ company: string; error: string }> = []

  const ingest = (jobs: JobResult[], sourceLabel: string) => {
    totalFound += jobs.length
    for (const job of jobs) {
      if (!filter(job.title)) {
        totalFiltered++
        continue
      }
      if (!job.url || seenUrls.has(job.url)) {
        totalDupes++
        continue
      }
      seenUrls.add(job.url)
      newJobs.push(job)
    }
    void sourceLabel
  }

  const atsTasks = atsTargets.map((company) => async () => {
    const { type, url } = company._api!
    try {
      const json = await fetchJson(url)
      const jobs = PARSERS[type](json, company.name)
      ingest(jobs, company.name)
    } catch (err) {
      errors.push({
        company: company.name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // LinkedIn fetches run sequentially across queries (santifer's scan.mjs does the
  // same — politeness more than throughput. The library throttles between pages
  // *within* a query already.)
  const linkedinTasks = linkedinTargets.map((q) => async () => {
    const label = q.label || q.keywords
    try {
      const jobs = await fetchLinkedInJobs(q)
      ingest(jobs, label)
    } catch (err) {
      errors.push({
        company: `linkedin:${label}`,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  await parallelFetch(atsTasks, CONCURRENCY)
  // Run LinkedIn queries serially (low concurrency) to respect their unauthenticated
  // endpoint and avoid coincidental rate-limit triggers.
  await parallelFetch(linkedinTasks, 1)

  return {
    companiesScanned: atsTargets.length + linkedinTargets.length,
    companiesSkipped: atsSkipped,
    totalJobsFound: totalFound,
    filteredByTitle: totalFiltered,
    duplicatesSkipped: totalDupes,
    newJobs,
    errors,
    scannedAt: date,
  }
}
