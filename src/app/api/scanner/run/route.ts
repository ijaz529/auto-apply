import { NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import {
  scanPortals,
  type ScanEntry,
  type TitleFilterConfig,
} from "@/lib/scanner"

export async function POST() {
  try {
    const userId = await getUserId()

    // Load scan config
    const scan = await prisma.scan.findFirst({
      where: { userId, enabled: true },
      orderBy: { updatedAt: "desc" },
    })

    if (!scan) {
      return NextResponse.json(
        { error: "No active scan configuration found. Create one first via POST /api/scanner." },
        { status: 404 }
      )
    }

    const companies = scan.portalsConfig as unknown as ScanEntry[]
    const titleFilter = (scan.titleFilter as unknown as TitleFilterConfig) || {
      positive: [],
      negative: [],
    }

    // Load existing job URLs for deduplication
    const existingJobs = await prisma.job.findMany({
      where: { userId },
      select: { url: true },
    })
    const existingScanResults = await prisma.scanResult.findMany({
      where: { scan: { userId } },
      select: { url: true },
    })

    const existingUrls = new Set<string>([
      ...existingJobs.map((j) => j.url),
      ...existingScanResults.map((r) => r.url),
    ])

    // Run the scanner
    const summary = await scanPortals(companies, titleFilter, existingUrls)

    // Store new results in the ScanResult table
    if (summary.newJobs.length > 0) {
      await prisma.scanResult.createMany({
        data: summary.newJobs.map((job) => ({
          scanId: scan.id,
          url: job.url,
          title: job.title,
          company: job.company,
          location: job.location || null,
          source: "api-scan",
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

    return NextResponse.json({
      summary: {
        companiesScanned: summary.companiesScanned,
        companiesSkipped: summary.companiesSkipped,
        totalJobsFound: summary.totalJobsFound,
        filteredByTitle: summary.filteredByTitle,
        duplicatesSkipped: summary.duplicatesSkipped,
        newJobsFound: summary.newJobs.length,
        errors: summary.errors,
        scannedAt: summary.scannedAt,
      },
      newJobs: summary.newJobs,
    })
  } catch (error) {
    console.error("Scanner run error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
