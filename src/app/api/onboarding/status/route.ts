import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"

export async function GET() {
  try {
    const userId = await getUserId()
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingComplete: true },
    })

    return NextResponse.json({
      onboardingComplete: user?.onboardingComplete ?? false,
    })
  } catch (error) {
    console.error("Onboarding status error:", error)
    return NextResponse.json({ onboardingComplete: false })
  }
}
