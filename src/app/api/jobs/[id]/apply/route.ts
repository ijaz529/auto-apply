import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()

    const { id } = await params

    const body = await req.json()
    const { confirmed, notes } = body as {
      confirmed?: boolean
      notes?: string
    }

    if (typeof confirmed !== "boolean") {
      return NextResponse.json(
        { error: "The 'confirmed' field (boolean) is required." },
        { status: 400 }
      )
    }

    // Verify the job belongs to this user
    const job = await prisma.job.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        application: true,
      },
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    if (!job.application) {
      return NextResponse.json(
        { error: "No application record exists for this job." },
        { status: 400 }
      )
    }

    if (!confirmed) {
      return NextResponse.json({
        message: "Application not confirmed. No changes made.",
        application: job.application,
      })
    }

    // Update application status to applied
    const updated = await prisma.application.update({
      where: { id: job.application.id },
      data: {
        status: "applied",
        appliedAt: new Date(),
        notes: notes || job.application.notes,
      },
    })

    return NextResponse.json({
      message: "Application marked as applied.",
      application: updated,
    })
  } catch (error) {
    console.error("Apply error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
