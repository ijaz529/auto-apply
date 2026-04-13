import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()

    const { id } = await params

    const body = await req.json()
    const { status, notes } = body as {
      status?: string
      notes?: string
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        {
          error: `Invalid status: "${status}". Valid statuses: ${[...VALID_STATUSES].join(", ")}`,
        },
        { status: 400 }
      )
    }

    // Verify ownership
    const application = await prisma.application.findFirst({
      where: {
        id,
        userId,
      },
    })

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      )
    }

    // Build update data
    const updateData: { status?: string; notes?: string; appliedAt?: Date } =
      {}

    if (status) {
      updateData.status = status
      // Auto-set appliedAt when status moves to "applied"
      if (status === "applied" && !application.appliedAt) {
        updateData.appliedAt = new Date()
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update. Provide 'status' and/or 'notes'." },
        { status: 400 }
      )
    }

    const updated = await prisma.application.update({
      where: { id },
      data: updateData,
      include: {
        job: {
          include: {
            evaluation: true,
          },
        },
      },
    })

    return NextResponse.json({ application: updated })
  } catch (error) {
    console.error("Application update error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
