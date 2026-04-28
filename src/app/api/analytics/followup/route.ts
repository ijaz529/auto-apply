import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { getFollowUpSchedule } from "@/lib/analytics/followup"

/**
 * GET /api/analytics/followup
 *
 * Returns the rich FollowUpResult directly (metadata + entries + flat counts
 * + cadenceConfig). Includes the legacy `upcoming` / `overdue` / `dueThisWeek`
 * fields the dashboard + analytics pages already read.
 */
export async function GET() {
  try {
    const userId = await getUserId()
    const result = await getFollowUpSchedule(userId)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Follow-up schedule error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
