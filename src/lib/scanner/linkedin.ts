/**
 * LinkedIn jobs-guest scraper — ported from santifer career-ops `scan.mjs`.
 *
 * Hits the unauthenticated `seeMoreJobPostings/search` endpoint, which returns
 * an HTML fragment of `<li>` job cards. Card markup is loose — this parser is
 * coarse-but-stable on purpose; tightening regexes against tiny markup churn
 * is the recurring break source upstream.
 */
import type { JobResult } from "./index"

const LINKEDIN_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
const LINKEDIN_PAGE_SIZE = 25
const LINKEDIN_MAX_PAGES = 3
const LINKEDIN_REQUEST_DELAY_MS = 1500
const LINKEDIN_FETCH_TIMEOUT_MS = 12_000

export interface LinkedInQuery {
  /** Search keywords (e.g. "Senior Product Manager"). */
  keywords: string
  /** Location string (e.g. "Berlin, Germany" / "Dubai, United Arab Emirates"). */
  location: string
  /**
   * LinkedIn time-range filter token (e.g. `r604800` = past 7 days,
   * `r86400` = past 24 hours, `r2592000` = past 30 days). Defaults to 7 days.
   */
  time_range?: string
  /** Optional friendly label used in the synthesized "company" field on results. */
  label?: string
  enabled?: boolean
}

export function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

interface LinkedInCard {
  title: string
  url: string
  company: string
  location: string
}

/**
 * Parse the HTML fragment returned by `seeMoreJobPostings/search` into job cards.
 * Skips cards missing a usable URL or title.
 */
export function parseLinkedIn(html: string): LinkedInCard[] {
  const jobs: LinkedInCard[] = []
  const liMatches = html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)
  for (const m of liMatches) {
    const card = m[1]
    const urlMatch = card.match(/base-card__full-link[^"]*"\s+href="([^"]+)"/)
    const titleMatch = card.match(
      /<h3[^>]*class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/
    )
    const companyMatch = card.match(
      /base-search-card__subtitle[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/
    )
    const locMatch = card.match(
      /job-search-card__location[^>]*>([\s\S]*?)<\/span>/
    )
    if (!urlMatch || !titleMatch) continue

    // Strip query string (LinkedIn appends tracking params); keep the canonical job URL.
    const cleanUrl = urlMatch[1].replace(/&amp;/g, "&").split("?")[0]
    jobs.push({
      title: decodeHtml(titleMatch[1].replace(/<[^>]+>/g, "").trim()),
      url: cleanUrl,
      company: companyMatch
        ? decodeHtml(companyMatch[1].replace(/<[^>]+>/g, "").trim())
        : "",
      location: locMatch
        ? decodeHtml(locMatch[1].replace(/<[^>]+>/g, "").trim())
        : "",
    })
  }
  return jobs
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LINKEDIN_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": LINKEDIN_UA, Accept: "text/html" },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch all LinkedIn job cards for one query, paginating up to LINKEDIN_MAX_PAGES.
 * Throttles between pages with LINKEDIN_REQUEST_DELAY_MS to be a polite client.
 */
export async function fetchLinkedInJobs(
  query: LinkedInQuery
): Promise<JobResult[]> {
  const all: JobResult[] = []
  for (let page = 0; page < LINKEDIN_MAX_PAGES; page++) {
    const start = page * LINKEDIN_PAGE_SIZE
    const url =
      "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search" +
      `?keywords=${encodeURIComponent(query.keywords)}` +
      `&location=${encodeURIComponent(query.location)}` +
      `&f_TPR=${query.time_range || "r604800"}` +
      `&start=${start}`
    const html = await fetchHtml(url)
    const cards = parseLinkedIn(html)
    if (cards.length === 0) break
    for (const c of cards) {
      all.push({
        title: c.title,
        url: c.url,
        company: c.company || query.label || query.keywords,
        location: c.location || query.location,
      })
    }
    if (page < LINKEDIN_MAX_PAGES - 1) {
      await new Promise((r) => setTimeout(r, LINKEDIN_REQUEST_DELAY_MS))
    }
  }
  return all
}
