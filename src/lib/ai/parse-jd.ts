/**
 * JD Fetcher — detect ATS platform from URL and extract job details.
 *
 * Supports: Greenhouse, Ashby, Lever, LinkedIn, and HTML fallback.
 */

interface JdResult {
  company: string
  role: string
  jdText: string
}

// ── ATS URL detection ──────────────────────────────────────────────

interface AtsInfo {
  type: "greenhouse" | "ashby" | "lever" | "linkedin"
  apiUrl: string
  slug: string
}

function detectAts(url: string): AtsInfo | null {
  // Greenhouse
  const ghBoardMatch = url.match(/boards-api\.greenhouse\.io\/v1\/boards\/([^/?#]+)/)
  if (ghBoardMatch) {
    return { type: "greenhouse", apiUrl: url, slug: ghBoardMatch[1] }
  }

  const ghJobMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/)
  if (ghJobMatch) {
    // Check for specific job ID
    const jobIdMatch = url.match(/jobs\/(\d+)/)
    const apiUrl = jobIdMatch
      ? `https://boards-api.greenhouse.io/v1/boards/${ghJobMatch[1]}/jobs/${jobIdMatch[1]}`
      : `https://boards-api.greenhouse.io/v1/boards/${ghJobMatch[1]}/jobs`
    return { type: "greenhouse", apiUrl, slug: ghJobMatch[1] }
  }

  const ghSingleMatch = url.match(/boards\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/)
  if (ghSingleMatch) {
    return {
      type: "greenhouse",
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${ghSingleMatch[1]}/jobs/${ghSingleMatch[2]}`,
      slug: ghSingleMatch[1],
    }
  }

  // Also match gh_jid parameter URLs (e.g., company.com/careers?gh_jid=12345)
  const ghJidMatch = url.match(/gh_jid=(\d+)/)
  if (ghJidMatch) {
    // Try to extract company from the hostname
    const hostname = new URL(url).hostname.replace(/^www\./, "")
    const companySlug = hostname.split(".")[0]
    return {
      type: "greenhouse",
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs/${ghJidMatch[1]}`,
      slug: companySlug,
    }
  }

  // Ashby
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)
  if (ashbyMatch) {
    const jobIdMatch = url.match(/jobs\.ashbyhq\.com\/[^/?#]+\/([a-f0-9-]+)/)
    return {
      type: "ashby",
      apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
      slug: ashbyMatch[1],
    }
  }

  // Lever
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/)
  if (leverMatch) {
    const leverJobMatch = url.match(/jobs\.lever\.co\/[^/?#]+\/([a-f0-9-]+)/)
    return {
      type: "lever",
      apiUrl: leverJobMatch
        ? `https://api.lever.co/v0/postings/${leverMatch[1]}/${leverJobMatch[1]}`
        : `https://api.lever.co/v0/postings/${leverMatch[1]}`,
      slug: leverMatch[1],
    }
  }

  // LinkedIn — direct job view URLs
  const linkedinViewMatch = url.match(/linkedin\.com\/jobs\/view\/(\d+)/)
  if (linkedinViewMatch) {
    return {
      type: "linkedin",
      apiUrl: `https://www.linkedin.com/jobs/view/${linkedinViewMatch[1]}`,
      slug: linkedinViewMatch[1],
    }
  }

  // LinkedIn — extract currentJobId from search URLs
  const linkedinCurrentJobMatch = url.match(/currentJobId=(\d+)/)
  if (linkedinCurrentJobMatch && url.includes("linkedin.com")) {
    return {
      type: "linkedin",
      apiUrl: `https://www.linkedin.com/jobs/view/${linkedinCurrentJobMatch[1]}`,
      slug: linkedinCurrentJobMatch[1],
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
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.json()
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.text()
}

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

function companyFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname
    const parts = hostname.replace(/^(www|jobs|careers|boards|job-boards)\./, "").split(".")
    return parts[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  } catch {
    return "Unknown"
  }
}

// ── ATS parsers ────────────────────────────────────────────────────

async function fetchGreenhouse(apiUrl: string, slug: string): Promise<JdResult> {
  const data = (await fetchJson(apiUrl)) as {
    title?: string
    content?: string
    jobs?: Array<{ title: string; content: string }>
  }

  if (data.title && data.content) {
    return {
      company: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role: data.title,
      jdText: stripHtml(data.content),
    }
  }

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

async function fetchAshby(apiUrl: string, slug: string, originalUrl: string): Promise<JdResult> {
  const data = (await fetchJson(apiUrl)) as {
    jobs?: Array<{ id: string; title: string; descriptionHtml?: string; descriptionPlain?: string }>
  }

  if (!data.jobs || data.jobs.length === 0) throw new Error("No jobs found in Ashby response")

  const jobIdMatch = originalUrl.match(/jobs\.ashbyhq\.com\/[^/?#]+\/([a-f0-9-]+)/)
  const job = jobIdMatch ? data.jobs.find((j) => j.id === jobIdMatch[1]) || data.jobs[0] : data.jobs[0]

  return {
    company: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    role: job.title,
    jdText: job.descriptionPlain || stripHtml(job.descriptionHtml || ""),
  }
}

async function fetchLever(apiUrl: string, slug: string): Promise<JdResult> {
  const data = (await fetchJson(apiUrl)) as
    | { text: string; descriptionPlain?: string; lists?: Array<{ text: string; content: string }> }
    | Array<{ text: string; descriptionPlain?: string; lists?: Array<{ text: string; content: string }> }>

  if (!Array.isArray(data)) {
    const sections = data.lists?.map((l) => `${l.text}\n${stripHtml(l.content)}`).join("\n\n") || ""
    return {
      company: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role: data.text,
      jdText: [data.descriptionPlain, sections].filter(Boolean).join("\n\n"),
    }
  }

  if (data.length > 0) {
    const first = data[0]
    const sections = first.lists?.map((l) => `${l.text}\n${stripHtml(l.content)}`).join("\n\n") || ""
    return {
      company: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role: first.text,
      jdText: [first.descriptionPlain, sections].filter(Boolean).join("\n\n"),
    }
  }

  throw new Error("No postings found in Lever response")
}

// ── LinkedIn fetcher ───────────────────────────────────────────────

async function fetchLinkedIn(jobId: string): Promise<JdResult> {
  // LinkedIn has a public guest-accessible job page that returns
  // job details in server-rendered HTML (no auth required for the
  // initial page load if we use the right URL format)
  const url = `https://www.linkedin.com/jobs/view/${jobId}`

  const html = await fetchHtml(url)

  // Extract title from page
  const titleMatch = html.match(/<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([^<]+)<\/h1>/i)
    || html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    || html.match(/<title>([^<|]+)/i)
  const role = titleMatch ? titleMatch[1].trim() : "Unknown Role"

  // Extract company
  const companyMatch = html.match(/<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([^<]+)<\/a>/i)
    || html.match(/<a[^>]*class="[^"]*company-name[^"]*"[^>]*>([^<]+)<\/a>/i)
    || html.match(/companyName['"]\s*:\s*['"](.*?)['"]/i)
  const company = companyMatch ? companyMatch[1].trim() : "LinkedIn"

  // Extract job description from the description section
  const descMatch = html.match(/<div[^>]*class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/section>/i)

  let jdText = ""
  if (descMatch) {
    jdText = stripHtml(descMatch[1])
  } else {
    // Fallback: try to get content from JSON-LD
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1])
        if (jsonLd.description) {
          jdText = stripHtml(jsonLd.description)
        }
        if (jsonLd.title) {
          return { company: jsonLd.hiringOrganization?.name || company, role: jsonLd.title, jdText }
        }
      } catch {
        // ignore JSON parse error
      }
    }
  }

  // If we still don't have a decent JD, try the body
  if (jdText.length < 100) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch) {
      const fullText = stripHtml(bodyMatch[1])
      // Take a relevant chunk — skip navigation/header junk
      const lines = fullText.split("\n").filter((l) => l.trim().length > 20)
      jdText = lines.slice(0, 100).join("\n")
    }
  }

  return { company, role, jdText }
}

// ── HTML fallback ──────────────────────────────────────────────────

async function fetchFallback(url: string): Promise<JdResult> {
  const html = await fetchHtml(url)

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
  const title = ogMatch ? ogMatch[1].trim() : (titleMatch ? titleMatch[1].trim() : "")

  let jdText = ""
  const mainMatch = html.match(
    /<(?:main|article|div[^>]*class=["'][^"']*(?:job|posting|description|content)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:main|article|div)>/i
  )
  if (mainMatch) {
    jdText = stripHtml(mainMatch[1])
  } else {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    jdText = stripHtml(bodyMatch ? bodyMatch[1] : html)
  }

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

// ── Main export ────────────────────────────────────────────────────

export async function fetchJd(url: string): Promise<JdResult> {
  const ats = detectAts(url)

  if (ats) {
    try {
      switch (ats.type) {
        case "greenhouse":
          return await fetchGreenhouse(ats.apiUrl, ats.slug)
        case "ashby":
          return await fetchAshby(ats.apiUrl, ats.slug, url)
        case "lever":
          return await fetchLever(ats.apiUrl, ats.slug)
        case "linkedin":
          return await fetchLinkedIn(ats.slug)
      }
    } catch (error) {
      console.warn(`ATS fetch failed for ${ats.type}, falling back to HTML:`, error)
      // Fall through to HTML fallback
    }
  }

  return fetchFallback(url)
}
