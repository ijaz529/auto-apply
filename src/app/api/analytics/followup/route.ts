import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getFollowUpSchedule } from "@/lib/analytics/followup"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schedule = await getFollowUpSchedule(session.user.id)

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
