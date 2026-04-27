/**
 * Google OAuth token management for Gmail API access.
 *
 * NextAuth (PrismaAdapter) stores Google OAuth tokens in the `Account` row when
 * a user signs in with Google. We read those tokens here, refresh on expiry,
 * and persist the refreshed access_token back to the same Account row.
 *
 * Required scope: openid email profile + gmail.readonly (configured in
 * `lib/auth.ts`). If the Account row lacks a refresh_token, the user signed in
 * before we added the scope — they need to sign out and sign in again.
 */
import { prisma } from "@/lib/db"

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
// Refresh tokens 60s before expiry to absorb clock skew + slow API roundtrips.
const REFRESH_LEEWAY_SECONDS = 60

export interface GoogleTokenResult {
  accessToken: string
  expiresAt: number // unix seconds
}

export type GoogleTokenError =
  | { kind: "no_account" }
  | { kind: "no_refresh_token" }
  | { kind: "refresh_failed"; message: string }
  | { kind: "config_missing"; message: string }

/**
 * Get a valid access token for the user's Google account, refreshing if
 * necessary. Persists the refreshed token back to the Account row.
 *
 * Returns either { accessToken, expiresAt } or a tagged error so callers can
 * surface a precise reason ("please reconnect Gmail" vs "please sign in again").
 */
export async function getValidGoogleAccessToken(
  userId: string
): Promise<GoogleTokenResult | GoogleTokenError> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  })
  if (!account) return { kind: "no_account" }
  if (!account.refresh_token) return { kind: "no_refresh_token" }

  const now = Math.floor(Date.now() / 1000)
  if (
    account.access_token &&
    account.expires_at &&
    account.expires_at > now + REFRESH_LEEWAY_SECONDS
  ) {
    return { accessToken: account.access_token, expiresAt: account.expires_at }
  }

  // Refresh required.
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return {
      kind: "config_missing",
      message: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set on server",
    }
  }

  let res: Response
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refresh_token,
        grant_type: "refresh_token",
      }),
    })
  } catch (err) {
    return {
      kind: "refresh_failed",
      message: err instanceof Error ? err.message : String(err),
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    return {
      kind: "refresh_failed",
      message: `HTTP ${res.status}: ${body.slice(0, 200)}`,
    }
  }

  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
    refresh_token?: string // sometimes Google rotates this
  }
  if (!json.access_token || !json.expires_in) {
    return {
      kind: "refresh_failed",
      message: "Google did not return access_token / expires_in",
    }
  }

  const expiresAt = now + json.expires_in
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: json.access_token,
      expires_at: expiresAt,
      // Only overwrite the refresh_token when Google actually rotated it.
      ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    },
  })

  return { accessToken: json.access_token, expiresAt }
}

/** Type guard so callers can pattern-match cleanly. */
export function isGoogleTokenError(
  v: GoogleTokenResult | GoogleTokenError
): v is GoogleTokenError {
  return "kind" in v
}
