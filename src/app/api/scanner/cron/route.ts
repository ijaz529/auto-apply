import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  scanPortals,
  type ScanEntry,
  type TitleFilterConfig,
} from "@/lib/scanner"

export async function POST(req: NextRequest) {
  try {
    // Authenticate via Bearer token
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      )
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find all scans that are enabled and due for a run
    const now = new Date()
    const scans = await prisma.scan.findMany({
      where: { enabled: true },
      include: { user: { select: { id: true } } },
    })

    // Filter to scans that are due (lastRun is older than frequencyDays, or never run)
    const dueScans = scans.filter((scan) => {
      if (!scan.lastRun) return true
      const daysSinceLastRun = Math.floor(
        (now.getTime() - scan.lastRun.getTime()) / (1000 * 60 * 60 * 24)
      )
      return daysSinceLastRun >= scan.frequencyDays
    })

    if (dueScans.length === 0) {
      return NextResponse.json({
        message: "No scans are due",
        totalScans: scans.length,
        dueScans: 0,
      })
    }

    const results: Array<{
      scanId: string
      userId: string
      newJobsFound: number
      errors: number
      status: "success" | "error"
      errorMessage?: string
    }> = []

    for (const scan of dueScans) {
      try {
        const companies = scan.portalsConfig as unknown as ScanEntry[]
        const titleFilter = (scan.titleFilter as unknown as TitleFilterConfig) || {
          positive: [],
          negative: [],
        }

        // Load existing URLs for dedup
        const existingJobs = await prisma.job.findMany({
          where: { userId: scan.userId },
          select: { url: true },
        })
        const existingScanResults = await prisma.scanResult.findMany({
          where: { scan: { userId: scan.userId } },
          select: { url: true },
        })

        const existingUrls = new Set<string>([
          ...existingJobs.map((j) => j.url),
          ...existingScanResults.map((r) => r.url),
        ])

        // Run scanner
        const summary = await scanPortals(companies, titleFilter, existingUrls)

        // Store results
        if (summary.newJobs.length > 0) {
          await prisma.scanResult.createMany({
            data: summary.newJobs.map((job) => ({
              scanId: scan.id,
              url: job.url,
              title: job.title,
              company: job.company,
              location: job.location || null,
              source: "cron-scan",
              status: "new",
            })),
          })
        }

        // Update scan metadata
        await prisma.scan.update({
          where: { id: scan.id },
          data: {
            lastRun: new Date(),
            resultsCount: { increment: summary.newJobs.length },
          },
        })

        results.push({
          scanId: scan.id,
          userId: scan.userId,
          newJobsFound: summary.newJobs.length,
          errors: summary.errors.length,
          status: "success",
        })
      } catch (err) {
        results.push({
          scanId: scan.id,
          userId: scan.userId,
          newJobsFound: 0,
          errors: 1,
          status: "error",
          errorMessage: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const totalNewJobs = results.reduce((sum, r) => sum + r.newJobsFound, 0)
    const totalErrors = results.filter((r) => r.status === "error").length

    return NextResponse.json({
      message: `Processed ${dueScans.length} scans`,
      totalScans: scans.length,
      dueScans: dueScans.length,
      totalNewJobs,
      totalErrors,
      results,
    })
  } catch (error) {
    console.error("Cron scanner error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
