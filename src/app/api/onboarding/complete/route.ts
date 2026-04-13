import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"

export async function POST() {
  try {
    const userId = await getUserId()

    await prisma.user.update({
      where: { id: userId },
      data: { onboardingComplete: true },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Onboarding complete error:", error)
    return NextResponse.json(
      { error: "Failed to complete onboarding" },
      { status: 500 }
    )
  }
}
