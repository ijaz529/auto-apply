import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"

export async function GET() {
  const userId = await getUserId()

  const profile = await prisma.profile.findUnique({
    where: { userId },
  })

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  return NextResponse.json(profile)
}

export async function PUT(req: Request) {
  const userId = await getUserId()

  const body = await req.json()

  const profile = await prisma.profile.upsert({
    where: { userId },
    update: {
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      phoneDubai: body.phoneDubai,
      location: body.location,
      linkedin: body.linkedin,
      github: body.github,
      portfolioUrl: body.portfolioUrl,
      visaStatus: body.visaStatus,
      targetRoles: body.targetRoles,
      salaryRange: body.salaryRange,
      currency: body.currency,
      preferences: body.preferences,
      preferredTemplate: body.preferredTemplate,
      preferredModel: body.preferredModel,
    },
    create: {
      userId,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      location: body.location,
    },
  })

  return NextResponse.json(profile)
}
