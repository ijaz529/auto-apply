/**
 * Liveness Checker — Determine if a job posting is still active
 *
 * Ported from liveness-core.mjs in career-ops.
 * Checks HTTP status, URL patterns, body text patterns, and apply controls.
 */

const FETCH_TIMEOUT_MS = 15_000

// ── Pattern Definitions (ported exactly from liveness-core.mjs) ────

const HARD_EXPIRED_PATTERNS: RegExp[] = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i,
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
]

const LISTING_PAGE_PATTERNS: RegExp[] = [
  /\d+\s+jobs?\s+found/i,
  /search for jobs page is loaded/i,
]

const EXPIRED_URL_PATTERNS: RegExp[] = [
  /[?&]error=true/i,
]

const APPLY_PATTERNS: RegExp[] = [
  /\bapply\b/i,
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,
  /ich bewerbe mich/i,
]

const MIN_CONTENT_CHARS = 300

// ── Helpers ────────────────────────────────────────────────────────

function firstMatch(patterns: RegExp[], text: string): RegExp | undefined {
  return patterns.find((pattern) => pattern.test(text))
}

// ── Core Classification (pure, testable) ───────────────────────────

export interface LivenessInput {
  status: number
  finalUrl: string
  bodyText: string
  applyControls: string[]
}

export interface LivenessResult {
  status: "active" | "expired" | "uncertain"
  reason: string
}

export function classifyLivenessFromData(input: LivenessInput): LivenessResult {
  const { status, finalUrl, bodyText, applyControls } = input

  // HTTP 404/410 = expired
  if (status === 404 || status === 410) {
    return { status: "expired", reason: `HTTP ${status}` }
  }

  // Redirect to error URL
  const expiredUrl = firstMatch(EXPIRED_URL_PATTERNS, finalUrl)
  if (expiredUrl) {
    return { status: "expired", reason: `redirect to ${finalUrl}` }
  }

  // Hard expired body patterns (these win over everything)
  const expiredBody = firstMatch(HARD_EXPIRED_PATTERNS, bodyText)
  if (expiredBody) {
    return { status: "expired", reason: `pattern matched: ${expiredBody.source}` }
  }

  // Apply button present = active
  const hasApply = applyControls.some((control) =>
    APPLY_PATTERNS.some((pattern) => pattern.test(control))
  )
  if (hasApply) {
    return { status: "active", reason: "visible apply control detected" }
  }

  // Listing/search page (redirected away from job)
  const listingPage = firstMatch(LISTING_PAGE_PATTERNS, bodyText)
  if (listingPage) {
    return { status: "expired", reason: `pattern matched: ${listingPage.source}` }
  }

  // Too little content = likely expired/empty
  if (bodyText.trim().length < MIN_CONTENT_CHARS) {
    return { status: "expired", reason: "insufficient content -- likely nav/footer only" }
  }

  return { status: "uncertain", reason: "content present but no visible apply control found" }
}

// ── HTTP-based Classifier ──────────────────────────────────────────

export async function classifyLiveness(url: string): Promise<LivenessResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    })

    const bodyText = await res.text()
    const finalUrl = res.url

    // Extract text that looks like apply buttons/links from the HTML
    const applyControls: string[] = []
    const buttonMatches = bodyText.matchAll(
      /<(?:button|a|input)[^>]*>([^<]*)<\/(?:button|a|input)>/gi
    )
    for (const match of buttonMatches) {
      if (match[1]?.trim()) {
        applyControls.push(match[1].trim())
      }
    }
    // Also check value attributes on inputs
    const valueMatches = bodyText.matchAll(/value=["']([^"']+)["']/gi)
    for (const match of valueMatches) {
      if (match[1]?.trim()) {
        applyControls.push(match[1].trim())
      }
    }

    return classifyLivenessFromData({
      status: res.status,
      finalUrl,
      bodyText,
      applyControls,
    })
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "uncertain", reason: "request timed out" }
    }
    return {
      status: "uncertain",
      reason: `fetch error: ${err instanceof Error ? err.message : String(err)}`,
    }
  } finally {
    clearTimeout(timer)
  }
}
