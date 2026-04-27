import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import {
  generateJobStrategy,
  type JobStrategy,
} from "@/lib/ai/strategy"

const STRATEGY_BLOCK_KEY = "strategy"

/**
 * Pull the cached strategy out of evaluation.blocksJson if present.
 */
function readCached(blocks: unknown): JobStrategy | null {
  if (!blocks || typeof blocks !== "object") return null
  const v = (blocks as Record<string, unknown>)[STRATEGY_BLOCK_KEY]
  if (
    !v ||
    typeof v !== "object" ||
    typeof (v as { research?: unknown }).research !== "string" ||
    typeof (v as { negotiation?: unknown }).negotiation !== "string"
  ) {
    return null
  }
  return v as JobStrategy
}

/**
 * GET /api/jobs/[id]/strategy
 * Returns the cached strategy if it exists; { strategy: null } otherwise.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    const { id } = await params

    const job = await prisma.job.findFirst({
      where: { id, userId },
      include: { evaluation: true },
    })
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const cached = readCached(job.evaluation?.blocksJson)
    return NextResponse.json({ strategy: cached, cached: !!cached })
  } catch (error) {
    console.error("Strategy GET error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/jobs/[id]/strategy
 * Generates (or regenerates) the strategy and caches it in
 * evaluation.blocksJson.strategy. Requires an existing evaluation — strategy
 * leans on the eval report and there's no point generating it from scratch.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    const { id } = await params

    const job = await prisma.job.findFirst({
      where: { id, userId },
      include: { evaluation: true },
    })
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }
    if (!job.evaluation) {
      return NextResponse.json(
        {
          error:
            "No evaluation found for this job. Run the evaluation first — strategy uses the eval report as context.",
        },
        { status: 400 }
      )
    }

    const strategy = await generateJobStrategy(id, userId)

    // Merge into the existing blocksJson; deep-clone via JSON to satisfy Prisma's Json type.
    const existingBlocks =
      (job.evaluation.blocksJson as Record<string, unknown> | null) ?? {}
    await prisma.evaluation.update({
      where: { id: job.evaluation.id },
      data: {
        blocksJson: JSON.parse(
          JSON.stringify({
            ...existingBlocks,
            [STRATEGY_BLOCK_KEY]: strategy,
          })
        ),
      },
    })

    return NextResponse.json({ strategy, cached: false })
  } catch (error) {
    console.error("Strategy POST error:", error)
    if (error instanceof Error && error.message === "Job not found") {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
