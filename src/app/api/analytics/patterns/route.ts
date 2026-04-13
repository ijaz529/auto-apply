import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { analyzePatterns } from "@/lib/analytics/patterns"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const analysis = await analyzePatterns(session.user.id)

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error("Pattern analysis error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
