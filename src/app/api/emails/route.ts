import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const applicationId = searchParams.get("applicationId")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    )
    const skip = (page - 1) * limit

    const where: { userId: string; applicationId?: string } = {
      userId: session.user.id,
    }

    if (applicationId) {
      where.applicationId = applicationId
    }

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip,
        take: limit,
        include: {
          application: {
            include: {
              job: {
                select: { company: true, role: true },
              },
            },
          },
        },
      }),
      prisma.email.count({ where }),
    ])

    return NextResponse.json({
      emails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Emails list error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
