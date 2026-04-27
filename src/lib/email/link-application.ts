/**
 * Pure logic: given an email's metadata and the user's applications, find the
 * single best application to attribute the email to (if any).
 *
 * Strategy: case-insensitive substring match of the application's company name
 * against the email subject + from address. Ties are broken by longer company
 * name (more specific match wins). Returns null when no application matches.
 *
 * This is intentionally conservative — false positives (linking unrelated mail
 * to an application) are worse than misses (un-linked mail still gets stored).
 */

export interface ApplicationCandidate {
  id: string
  jobId: string
  company: string
}

export function findBestApplicationMatch(
  subject: string,
  fromAddress: string,
  candidates: ApplicationCandidate[]
): ApplicationCandidate | null {
  if (candidates.length === 0) return null

  const haystack = `${subject} ${fromAddress}`.toLowerCase()
  let best: ApplicationCandidate | null = null

  for (const c of candidates) {
    const needle = c.company.trim().toLowerCase()
    // Skip company names too short to be meaningful (e.g. legacy "—", "PJ").
    if (needle.length < 3) continue
    if (!haystack.includes(needle)) continue
    if (!best || needle.length > best.company.length) {
      best = c
    }
  }

  return best
}

/**
 * Map an email classification type to the Application status we should set.
 * Returns null when the classification shouldn't change status (e.g. "confirmation"
 * — applied state is already known; "unknown" — don't overwrite anything).
 *
 * Status priority: offer > interview > rejected > applied. We never *downgrade*
 * — e.g. a "confirmation" email arriving after "interview" doesn't reset back.
 * Caller is responsible for the priority check; this function only returns the
 * candidate status implied by the classification.
 */
export function classificationToStatus(
  classification: "confirmation" | "interview" | "rejection" | "offer" | "unknown"
): "applied" | "interview" | "rejected" | "offer" | null {
  switch (classification) {
    case "offer":
      return "offer"
    case "interview":
      return "interview"
    case "rejection":
      return "rejected"
    case "confirmation":
      return "applied"
    case "unknown":
      return null
  }
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  evaluated: 1,
  applied: 2,
  responded: 2,
  interview: 3,
  rejected: 4,
  discarded: 4,
  offer: 5,
}

/**
 * Returns true when `next` is a higher-priority status than `current`. Used to
 * avoid downgrading from interview → applied when a stray confirmation lands.
 */
export function shouldUpgradeStatus(
  current: string,
  next: string
): boolean {
  const a = STATUS_RANK[current] ?? 0
  const b = STATUS_RANK[next] ?? 0
  return b > a
}
