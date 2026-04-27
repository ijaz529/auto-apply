import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"

interface StoryBody {
  category?: string
  title?: string
  situation?: string
  task?: string
  action?: string
  result?: string
  reflection?: string
}

async function ensureOwned(userId: string, id: string) {
  const story = await prisma.story.findFirst({ where: { id, userId } })
  return story
}

/**
 * PUT /api/interview-prep/stories/[id]
 * Updates an existing story. Only fields present in the body are written.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    const { id } = await params

    const existing = await ensureOwned(userId, id)
    if (!existing) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 })
    }

    const body = (await req.json().catch(() => ({}))) as StoryBody
    const data: Partial<StoryBody> = {}
    if (typeof body.category === "string") data.category = body.category
    if (typeof body.title === "string") data.title = body.title
    if (typeof body.situation === "string") data.situation = body.situation
    if (typeof body.task === "string") data.task = body.task
    if (typeof body.action === "string") data.action = body.action
    if (typeof body.result === "string") data.result = body.result
    if (typeof body.reflection === "string") data.reflection = body.reflection

    const story = await prisma.story.update({ where: { id }, data })
    return NextResponse.json({ story })
  } catch (error) {
    console.error("Stories PUT error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/interview-prep/stories/[id]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    const { id } = await params

    const existing = await ensureOwned(userId, id)
    if (!existing) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 })
    }

    await prisma.story.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Stories DELETE error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
