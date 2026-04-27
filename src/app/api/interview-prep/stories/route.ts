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

/**
 * GET /api/interview-prep/stories
 * Returns the current user's STAR+R story bank, newest first.
 */
export async function GET() {
  try {
    const userId = await getUserId()
    const stories = await prisma.story.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    })
    return NextResponse.json({ stories })
  } catch (error) {
    console.error("Stories GET error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/interview-prep/stories
 * Creates a new story. `title` and `category` are required; the STAR fields are
 * optional at create time so users can stub a story and fill it in later.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()
    const body = (await req.json().catch(() => ({}))) as StoryBody

    if (!body.title || !body.category) {
      return NextResponse.json(
        { error: "title and category are required" },
        { status: 400 }
      )
    }

    const story = await prisma.story.create({
      data: {
        userId,
        category: body.category,
        title: body.title,
        situation: body.situation ?? "",
        task: body.task ?? "",
        action: body.action ?? "",
        result: body.result ?? "",
        reflection: body.reflection ?? "",
      },
    })
    return NextResponse.json({ story }, { status: 201 })
  } catch (error) {
    console.error("Stories POST error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
