import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"

export async function GET() {
  try {
    const userId = await getUserId()

    const scan = await prisma.scan.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    })

    if (!scan) {
      return NextResponse.json({
        scan: null,
        message: "No scan configuration found. Create one with POST.",
      })
    }

    return NextResponse.json({ scan })
  } catch (error) {
    console.error("Scanner config GET error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()

    const body = await req.json()
    const { portalsConfig, titleFilter, frequencyDays, enabled } = body as {
      portalsConfig?: unknown
      titleFilter?: unknown
      frequencyDays?: number
      enabled?: boolean
    }

    if (!portalsConfig) {
      return NextResponse.json(
        { error: "portalsConfig is required" },
        { status: 400 }
      )
    }

    // Validate portalsConfig is an array
    if (!Array.isArray(portalsConfig)) {
      return NextResponse.json(
        { error: "portalsConfig must be an array of company configurations" },
        { status: 400 }
      )
    }

    // Upsert: find existing scan for this user or create new one
    const existingScan = await prisma.scan.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    })

    const data = {
      portalsConfig: portalsConfig as object,
      titleFilter: (titleFilter as object) || { positive: [], negative: [] },
      frequencyDays: frequencyDays ?? 7,
      enabled: enabled ?? true,
    }

    let scan
    if (existingScan) {
      scan = await prisma.scan.update({
        where: { id: existingScan.id },
        data,
      })
    } else {
      scan = await prisma.scan.create({
        data: {
          userId,
          ...data,
        },
      })
    }

    return NextResponse.json({ scan }, { status: existingScan ? 200 : 201 })
  } catch (error) {
    console.error("Scanner config POST error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
