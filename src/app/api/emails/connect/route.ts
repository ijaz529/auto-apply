import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectGmail } from "@/lib/email/gmail"

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { authCode } = body as { authCode?: string }

    if (!authCode) {
      return NextResponse.json(
        {
          error: "Missing authCode",
          setupInstructions: {
            step1: "Create a Google Cloud project at https://console.cloud.google.com",
            step2: "Enable the Gmail API",
            step3: "Create OAuth 2.0 credentials (Web application type)",
            step4: "Add authorized redirect URI: {your-domain}/api/emails/connect/callback",
            step5: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env",
            step6: "Direct the user to the Google consent screen to get an auth code",
            step7: "POST that auth code to this endpoint",
          },
        },
        { status: 400 }
      )
    }

    const result = await connectGmail(session.user.id, authCode)

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 503 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Gmail connected successfully. Emails will be monitored automatically.",
    })
  } catch (error) {
    console.error("Gmail connect error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
