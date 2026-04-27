import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { syncGmailForUser } from "@/lib/email/sync"

/**
 * POST /api/emails/sync
 *
 * Trigger a Gmail inbox sync for the current user. Requires the user to have
 * signed in with Google AFTER `gmail.readonly` was added to the scope (the
 * lib/auth.ts comment explains this). Returns a structured summary or a
 * tagged error so the UI can show "please sign in with Google again" precisely.
 */
export async function POST() {
  try {
    const userId = await getUserId()
    const result = await syncGmailForUser(userId)
    if (!result.ok) {
      const status =
        result.reason === "no_account" || result.reason === "no_refresh_token"
          ? 401
          : result.reason === "config_missing"
            ? 503
            : 502
      return NextResponse.json(result, { status })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error("Email sync error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
