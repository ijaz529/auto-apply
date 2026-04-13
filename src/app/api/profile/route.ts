import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const profile = await prisma.profile.findUnique({
    where: { userId: session.user.id },
  })

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  return NextResponse.json(profile)
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()

  const profile = await prisma.profile.upsert({
    where: { userId: session.user.id },
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
      userId: session.user.id,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      location: body.location,
    },
  })

  return NextResponse.json(profile)
}
