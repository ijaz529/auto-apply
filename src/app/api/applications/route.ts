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

/**
 * Create a manual application — for jobs applied to outside the tool.
 * Body: { company, role, url?, status?, notes?, appliedAt? }
 * Creates a Job row with source="manual" + an Application row.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()

    const body = await req.json().catch(() => ({}))
    const {
      company,
      role,
      url,
      status,
      notes,
      appliedAt,
    } = body as {
      company?: string
      role?: string
      url?: string
      status?: string
      notes?: string
      appliedAt?: string
    }

    if (!company || !role) {
      return NextResponse.json(
        { error: "company and role are required" },
        { status: 400 }
      )
    }

    const finalStatus = status ?? "applied"
    if (!VALID_STATUSES.has(finalStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status: "${finalStatus}". Valid: ${[...VALID_STATUSES].join(", ")}`,
        },
        { status: 400 }
      )
    }

    const jobUrl = url?.trim() || `manual-${Date.now()}`
    const appliedAtDate =
      finalStatus === "applied" || finalStatus === "responded" || finalStatus === "interview" || finalStatus === "offer" || finalStatus === "rejected"
        ? (appliedAt ? new Date(appliedAt) : new Date())
        : null

    const job = await prisma.job.create({
      data: {
        userId,
        url: jobUrl,
        company: company.trim(),
        role: role.trim(),
        source: "manual",
      },
    })

    const application = await prisma.application.create({
      data: {
        jobId: job.id,
        userId,
        status: finalStatus,
        notes: notes?.trim() || null,
        appliedAt: appliedAtDate,
      },
      include: { job: { include: { evaluation: true } } },
    })

    return NextResponse.json({ application }, { status: 201 })
  } catch (error) {
    console.error("Application create error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
