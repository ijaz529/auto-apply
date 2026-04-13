import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import { fetchJd } from "@/lib/ai/parse-jd"
import { evaluateJob } from "@/lib/ai/evaluate"

// Fire-and-forget evaluation for a single job
async function evaluateInBackground(jobId: string, userId: string) {
  try {
    const job = await prisma.job.findFirst({ where: { id: jobId, userId } })
    if (!job?.jdText) return

    const profile = await prisma.profile.findUnique({ where: { userId } })
    if (!profile?.cvMarkdown) return

    const model = (profile.preferredModel === "opus" ? "opus" : "sonnet") as "sonnet" | "opus"

    const result = await evaluateJob(
      job.jdText,
      profile.cvMarkdown,
      profile.preferences || undefined,
      model
    )

    const enrichedReport = result.reportMarkdown.replace(
      "# Evaluation: Role at Company",
      `# Evaluation: ${job.role} at ${job.company}`
    )

    await prisma.evaluation.upsert({
      where: { jobId },
      update: {
        score: result.score,
        archetype: result.archetype,
        legitimacy: result.legitimacy,
        reportMarkdown: enrichedReport,
        blocksJson: result.blocksJson,
        keywords: result.keywords,
        scoreBreakdown: result.scoreBreakdown,
        gaps: result.gaps,
        model,
      },
      create: {
        jobId,
        userId,
        score: result.score,
        archetype: result.archetype,
        legitimacy: result.legitimacy,
        reportMarkdown: enrichedReport,
        blocksJson: result.blocksJson,
        keywords: result.keywords,
        scoreBreakdown: result.scoreBreakdown,
        gaps: result.gaps,
        model,
      },
    })

    await prisma.application.updateMany({
      where: { jobId, userId },
      data: { status: "evaluated", manualSteps: result.manualApplySteps },
    })

    console.log(`Evaluation complete for ${job.company} - ${job.role}: ${result.score}/5`)
  } catch (error) {
    console.error(`Background eval failed for job ${jobId}:`, error)
    // Mark as failed so UI shows error instead of "pending" forever
    try {
      await prisma.application.updateMany({
        where: { jobId, userId },
        data: { status: "evaluated", notes: `Evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}` },
      })
    } catch {
      // ignore DB error
    }
  }
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

          // Fire-and-forget evaluation if JD was fetched
          if (jdText) {
            evaluateInBackground(job.id, userId)
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
          evaluateInBackground(job.id, userId)

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
