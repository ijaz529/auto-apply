import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"

export async function GET() {
  try {
    const userId = await getUserId()
    const profile = await prisma.profile.findUnique({ where: { userId } })
    return NextResponse.json({ markdown: profile?.cvMarkdown ?? "" })
  } catch (error) {
    console.error("CV GET error:", error)
    return NextResponse.json({ markdown: "" })
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await getUserId()
    const { markdown } = await req.json()

    await prisma.profile.update({
      where: { userId },
      data: { cvMarkdown: markdown },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("CV PUT error:", error)
    return NextResponse.json(
      { error: "Failed to save CV" },
      { status: 500 }
    )
  }
}
