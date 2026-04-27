import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"

/**
 * GET /api/emails/connect
 *
 * Reports whether the current user has a usable Google connection (account
 * present + refresh token + tokens not silently expired). The actual OAuth
 * flow is now handled by NextAuth — to (re-)connect Gmail, redirect the user
 * to `/api/auth/signin/google`. This endpoint just tells the UI whether to
 * show "Connect Gmail" or "Sync Now".
 */
export async function GET() {
  try {
    const userId = await getUserId()
    const account = await prisma.account.findFirst({
      where: { userId, provider: "google" },
      select: { refresh_token: true, scope: true, expires_at: true },
    })

    if (!account) {
      return NextResponse.json({
        connected: false,
        reason: "no_google_account",
        signInUrl: "/api/auth/signin/google",
      })
    }
    if (!account.refresh_token) {
      return NextResponse.json({
        connected: false,
        reason: "missing_refresh_token",
        signInUrl: "/api/auth/signin/google",
        message:
          "Sign out and sign in with Google again — your account is missing a refresh token.",
      })
    }
    const hasGmailScope =
      typeof account.scope === "string" &&
      account.scope.includes("gmail.readonly")
    if (!hasGmailScope) {
      return NextResponse.json({
        connected: false,
        reason: "missing_gmail_scope",
        signInUrl: "/api/auth/signin/google",
        message:
          "Your Google account is connected but Gmail permission was not granted. Re-sign-in to grant it.",
      })
    }
    return NextResponse.json({
      connected: true,
      expiresAt: account.expires_at,
    })
  } catch (err) {
    console.error("Gmail connect status error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
