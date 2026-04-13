import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { analyzePatterns } from "@/lib/analytics/patterns"

export async function GET() {
  try {
    const userId = await getUserId()

    const analysis = await analyzePatterns(userId)

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error("Pattern analysis error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
