import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import type { Prisma } from "@prisma/client"

const VALID_STATUSES = new Set([
  "evaluated",
  "applied",
  "responded",
  "interview",
  "offer",
  "rejected",
  "discarded",
  "skip",
])

const VALID_SORT_FIELDS = new Set(["score", "createdAt", "appliedAt", "status"])

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId()

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const sort = searchParams.get("sort") || "createdAt"
    const order = searchParams.get("order") === "asc" ? "asc" : "desc"
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    )
    const skip = (page - 1) * limit

    // Build where clause
    const where: Prisma.ApplicationWhereInput = {
      userId,
    }

    if (status && VALID_STATUSES.has(status)) {
      where.status = status
    }

    // Build orderBy
    let orderBy: Prisma.ApplicationOrderByWithRelationInput

    if (sort === "score") {
      // Sort by evaluation score requires including the evaluation
      orderBy = {
        job: {
          evaluation: {
            score: order,
          },
        },
      }
    } else if (VALID_SORT_FIELDS.has(sort)) {
      orderBy = { [sort]: order }
    } else {
      orderBy = { createdAt: "desc" }
    }

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          job: {
            include: {
              evaluation: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.application.count({ where }),
    ])

    return NextResponse.json({
      applications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Applications list error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
