import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import { fetchJd } from "@/lib/ai/parse-jd"
import { processEvaluation } from "@/lib/queue/run-evaluation"
import { tryEnqueueEvaluation } from "@/lib/queue/evaluation-queue"

// Try to queue the evaluation (Redis-backed worker handles it later); on
// queue unavailability or failure, fall back to fire-and-forget direct execution.
async function scheduleEvaluation(jobId: string, userId: string) {
  const queued = await tryEnqueueEvaluation({ jobId, userId })
  if (queued) return
  void processEvaluation(jobId, userId).catch((err) => {
    console.error(`[direct-eval] failed for job ${jobId}:`, err)
  })
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId()

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)))
    const skip = (page - 1) * limit

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: { userId },
        include: { evaluation: true, application: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.job.count({ where: { userId } }),
    ])

    return NextResponse.json({
      jobs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error("Jobs list error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()

    const body = await req.json()
    const { urls, texts, preferences } = body as {
      urls?: string[]
      texts?: string[]
      preferences?: string
    }

    // Accept either URLs or pasted JD texts (or both)
    const hasUrls = urls && Array.isArray(urls) && urls.length > 0
    const hasTexts = texts && Array.isArray(texts) && texts.length > 0

    if (!hasUrls && !hasTexts) {
      return NextResponse.json(
        { error: "Provide job URLs in 'urls' or pasted JD text in 'texts'." },
        { status: 400 }
      )
    }

    const totalItems = (urls?.length || 0) + (texts?.length || 0)
    if (totalItems > 5) {
      return NextResponse.json(
        { error: "Maximum 5 jobs per request." },
        { status: 400 }
      )
    }

    // Save preferences
    if (preferences) {
      await prisma.profile.upsert({
        where: { userId },
        update: { preferences },
        create: { userId, preferences },
      })
    }

    const results: Array<{
      jobId: string
      company: string
      role: string
      status: "created" | "error"
      error?: string
    }> = []

    // Process URLs
    if (hasUrls) {
      for (const url of urls!) {
        try {
          let company = "Unknown"
          let role = "Unknown"
          let jdText = ""

          try {
            const jd = await fetchJd(url)
            company = jd.company
            role = jd.role
            jdText = jd.jdText
          } catch (fetchError) {
            console.warn(`Failed to fetch JD for ${url}:`, fetchError)
          }

          const job = await prisma.job.create({
            data: {
              userId,
              url,
              company,
              role,
              jdText: jdText || null,
              jdFetchedAt: jdText ? new Date() : null,
              source: "url",
            },
          })

          await prisma.application.create({
            data: { jobId: job.id, userId, status: "pending" },
          })

          // Fire-and-forget evaluation if JD has enough content (min 200 chars)
          if (jdText && jdText.length >= 200) {
            scheduleEvaluation(job.id, userId)
          } else if (jdText && jdText.length < 200) {
            await prisma.application.updateMany({
              where: { jobId: job.id, userId },
              data: { status: "evaluated", notes: "JD too short — likely a search page, not a job posting. Try pasting the full JD text instead." },
            })
          }

          results.push({ jobId: job.id, company, role, status: "created" })
        } catch (err) {
          console.error(`Error processing URL ${url}:`, err)
          results.push({
            jobId: "",
            company: "",
            role: "",
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          })
        }
      }
    }

    // Process pasted JD texts
    if (hasTexts) {
      for (let i = 0; i < texts!.length; i++) {
        const text = texts![i]
        if (!text.trim()) continue

        try {
          // Extract company/role from text heuristically
          const lines = text.trim().split("\n").filter(Boolean)
          const role = lines[0]?.substring(0, 100) || `Job ${i + 1}`
          const company = "Pasted JD"

          const job = await prisma.job.create({
            data: {
              userId,
              url: `pasted-jd-${Date.now()}-${i}`,
              company,
              role,
              jdText: text,
              jdFetchedAt: new Date(),
              source: "pasted",
            },
          })

          await prisma.application.create({
            data: { jobId: job.id, userId, status: "pending" },
          })

          // Fire-and-forget evaluation
          scheduleEvaluation(job.id, userId)

          results.push({ jobId: job.id, company, role, status: "created" })
        } catch (err) {
          console.error(`Error processing pasted JD ${i}:`, err)
          results.push({
            jobId: "",
            company: "",
            role: "",
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          })
        }
      }
    }

    return NextResponse.json({ results }, { status: 201 })
  } catch (error) {
    console.error("Jobs create error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
