import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { getFollowUpSchedule } from "@/lib/analytics/followup"

export async function GET() {
  try {
    const userId = await getUserId()

    const schedule = await getFollowUpSchedule(userId)

    return NextResponse.json({
      totalItems: schedule.length,
      overdueCount: schedule.filter((item) => item.isOverdue).length,
      schedule,
    })
  } catch (error) {
    console.error("Follow-up schedule error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
