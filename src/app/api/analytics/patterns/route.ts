import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { analyzePatterns } from "@/lib/analytics/patterns"

/**
 * GET /api/analytics/patterns
 *
 * Returns the rich PatternResult union directly (no { analysis } wrapper) so
 * the page can pattern-match on .ok and surface the right empty/insufficient
 * state without an extra unwrap.
 */
export async function GET() {
  try {
    const userId = await getUserId()
    const result = await analyzePatterns(userId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Pattern analysis error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
