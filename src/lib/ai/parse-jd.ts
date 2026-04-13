/**
 * JD Fetcher — detect ATS platform from URL and extract job details.
 *
 * Supports Greenhouse, Ashby, and Lever APIs with HTML fallback.
 * URL detection patterns ported from career-ops scan.mjs.
 */

interface JdResult {
  company: string
  role: string
  jdText: string
}

// ── ATS URL detection (ported from scan.mjs detectApi) ──────────────

interface AtsInfo {
  type: "greenhouse" | "ashby" | "lever"
  apiUrl: string
  slug: string
}

function detectAts(url: string): AtsInfo | null {
  // Greenhouse: boards-api or job-boards
  const ghBoardMatch = url.match(
    /boards-api\.greenhouse\.io\/v1\/boards\/([^/?#]+)/
  )
  if (ghBoardMatch) {
    return {
      type: "greenhouse",
      apiUrl: url,
      slug: ghBoardMatch[1],
    }
  }

  const ghJobMatch = url.match(
    /job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/
  )
  if (ghJobMatch) {
    return {
      type: "greenhouse",
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${ghJobMatch[1]}/jobs`,
      slug: ghJobMatch[1],
    }
  }

  // Greenhouse individual job URL: boards.greenhouse.io/company/jobs/12345
  const ghSingleMatch = url.match(
    /boards\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/
  )
  if (ghSingleMatch) {
    return {
      type: "greenhouse",
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${ghSingleMatch[1]}/jobs/${ghSingleMatch[2]}`,
      slug: ghSingleMatch[1],
    }
  }

  // Ashby
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)
  if (ashbyMatch) {
    // Check if it's a specific job posting
    const jobIdMatch = url.match(
      /jobs\.ashbyhq\.com\/[^/?#]+\/([a-f0-9-]+)/
    )
    return {
      type: "ashby",
      apiUrl: jobIdMatch
        ? `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}`
        : `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
      slug: ashbyMatch[1],
    }
  }

  // Lever
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/)
  if (leverMatch) {
    const leverJobMatch = url.match(
      /jobs\.lever\.co\/[^/?#]+\/([a-f0-9-]+)/
    )
    return {
      type: "lever",
      apiUrl: leverJobMatch
        ? `https://api.lever.co/v0/postings/${leverMatch[1]}/${leverJobMatch[1]}`
        : `https://api.lever.co/v0/postings/${leverMatch[1]}`,
      slug: leverMatch[1],
    }
  }

  return null
}

// ── Fetch helpers ───────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  return res.json()
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (compatible; AutoApply/1.0; +https://github.com/auto-apply)",
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  return res.text()
}

// ── HTML to plain text ──────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// ── Company name from URL ───────────────────────────────────────────

function companyFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname
    // Remove www, jobs, careers prefixes
    const parts = hostname
      .replace(/^(www|jobs|careers|boards|job-boards)\./, "")
      .split(".")
    return parts[0]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  } catch {
    return "Unknown"
  }
}

// ── ATS-specific parsers ────────────────────────────────────────────

async function fetchGreenhouse(
  apiUrl: string,
  slug: string
): Promise<JdResult> {
  const data = (await fetchJson(apiUrl)) as {
    title?: string
    content?: string
    jobs?: Array<{
      title: string
      content: string
      absolute_url: string
    }>
  }

  // Single job endpoint
  if (data.title && data.content) {
    return {
      company: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role: data.title,
      jdText: stripHtml(data.content),
    }
  }

  // Board listing — take the first job as a summary
  if (data.jobs && data.jobs.length > 0) {
    const first = data.jobs[0]
    return {
      company: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role: first.title,
      jdText: stripHtml(first.content || ""),
    }
  }

  throw new Error("No job data found in Greenhouse response")
}

async function fetchAshby(
  apiUrl: string,
  slug: string,
  originalUrl: string
): Promise<JdResult> {
  const data = (await fetchJson(apiUrl)) as {
    jobs?: Array<{
      id: string
      title: string
      descriptionHtml?: string
      descriptionPlain?: string
    }>
  }

  if (!data.jobs || data.jobs.length === 0) {
    throw new Error("No jobs found in Ashby response")
  }

  // Try to match specific job ID from URL
  const jobIdMatch = originalUrl.match(
    /jobs\.ashbyhq\.com\/[^/?#]+\/([a-f0-9-]+)/
  )
  const job = jobIdMatch
    ? data.jobs.find((j) => j.id === jobIdMatch[1]) || data.jobs[0]
    : data.jobs[0]

  return {
    company: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    role: job.title,
    jdText: job.descriptionPlain || stripHtml(job.descriptionHtml || ""),
  }
}

async function fetchLever(apiUrl: string, slug: string): Promise<JdResult> {
  const data = (await fetchJson(apiUrl)) as
    | {
        text: string
        descriptionPlain?: string
        categories?: { team?: string; location?: string }
        lists?: Array<{ text: string; content: string }>
      }
    | Array<{
        text: string
        descriptionPlain?: string
        categories?: { team?: string; location?: string }
        lists?: Array<{ text: string; content: string }>
      }>

  // Single posting
  if (!Array.isArray(data)) {
    const sections =
      data.lists?.map((l) => `${l.text}\n${stripHtml(l.content)}`).join("\n\n") || ""
    const desc = data.descriptionPlain || ""
    return {
      company: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role: data.text,
      jdText: [desc, sections].filter(Boolean).join("\n\n"),
    }
  }

  // Array of postings — take first
  if (data.length > 0) {
    const first = data[0]
    const sections =
      first.lists
        ?.map((l) => `${l.text}\n${stripHtml(l.content)}`)
        .join("\n\n") || ""
    const desc = first.descriptionPlain || ""
    return {
      company: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role: first.text,
      jdText: [desc, sections].filter(Boolean).join("\n\n"),
    }
  }

  throw new Error("No postings found in Lever response")
}

// ── HTML fallback ───────────────────────────────────────────────────

async function fetchFallback(url: string): Promise<JdResult> {
  const html = await fetchHtml(url)

  // Try to extract title from <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const rawTitle = titleMatch ? titleMatch[1].trim() : ""

  // Try to extract from og:title
  const ogMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
  )
  const title = ogMatch ? ogMatch[1].trim() : rawTitle

  // Try to find the main content area
  // Look for common JD containers
  let jdText = ""
  const mainMatch = html.match(
    /<(?:main|article|div[^>]*class=["'][^"']*(?:job|posting|description|content)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:main|article|div)>/i
  )
  if (mainMatch) {
    jdText = stripHtml(mainMatch[1])
  } else {
    // Fall back to stripping the entire body
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    jdText = stripHtml(bodyMatch ? bodyMatch[1] : html)
  }

  // Parse company and role from title
  // Common patterns: "Role - Company", "Role at Company", "Company | Role"
  let company = companyFromUrl(url)
  let role = title

  const atMatch = title.match(/^(.+?)\s+at\s+(.+)/i)
  const dashMatch = title.match(/^(.+?)\s*[-|]\s*(.+)/i)

  if (atMatch) {
    role = atMatch[1].trim()
    company = atMatch[2].trim()
  } else if (dashMatch) {
    role = dashMatch[1].trim()
    company = dashMatch[2].trim()
  }

  return { company, role, jdText }
}

// ── Main export ─────────────────────────────────────────────────────

/**
 * Fetch a job description from a URL. Auto-detects Greenhouse, Ashby,
 * and Lever APIs for structured extraction; falls back to HTML scraping.
 */
export async function fetchJd(url: string): Promise<JdResult> {
  const ats = detectAts(url)

  if (ats) {
    switch (ats.type) {
      case "greenhouse":
        return fetchGreenhouse(ats.apiUrl, ats.slug)
      case "ashby":
        return fetchAshby(ats.apiUrl, ats.slug, url)
      case "lever":
        return fetchLever(ats.apiUrl, ats.slug)
    }
  }

  return fetchFallback(url)
}
