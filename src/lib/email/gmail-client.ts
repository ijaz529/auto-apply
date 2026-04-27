/**
 * Minimal Gmail REST client (raw fetch — avoids the `googleapis` 10MB+ dep).
 *
 * Only covers what `sync.ts` needs: list message IDs by Gmail query, then
 * fetch metadata (headers + snippet, no body) for each.
 */

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

export interface GmailMessageMetadata {
  id: string
  threadId: string
  snippet: string
  internalDate: string // unix ms as string
  payload: {
    headers: Array<{ name: string; value: string }>
  }
}

interface ListResponse {
  messages?: Array<{ id: string; threadId: string }>
  nextPageToken?: string
  resultSizeEstimate?: number
}

async function gmailFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Gmail API ${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

/**
 * List Gmail message IDs for a query (e.g. `newer_than:7d`). Returns up to
 * `maxResults` IDs in a single page; for sync we don't paginate further.
 */
export async function listMessageIds(
  accessToken: string,
  query: string,
  maxResults = 50
): Promise<Array<{ id: string; threadId: string }>> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  })
  const json = await gmailFetch<ListResponse>(
    `/messages?${params.toString()}`,
    accessToken
  )
  return json.messages ?? []
}

/**
 * Fetch metadata-only for a message (headers + snippet, no body). Cheaper than
 * `format=full` and sufficient for keyword classification on subject + sender +
 * snippet.
 */
export async function getMessageMetadata(
  accessToken: string,
  messageId: string
): Promise<GmailMessageMetadata> {
  return gmailFetch<GmailMessageMetadata>(
    `/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    accessToken
  )
}

/**
 * Pull a header value out of the Gmail headers array. Header names are
 * case-insensitive per RFC 5322; Gmail returns canonical casing but we normalise.
 */
export function getHeader(
  metadata: GmailMessageMetadata,
  name: string
): string {
  const target = name.toLowerCase()
  const found = metadata.payload.headers.find(
    (h) => h.name.toLowerCase() === target
  )
  return found?.value ?? ""
}
