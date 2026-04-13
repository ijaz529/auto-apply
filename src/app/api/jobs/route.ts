import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { fetchJd } from "@/lib/ai/parse-jd"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    )
    const skip = (page - 1) * limit

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: { userId: session.user.id },
        include: {
          evaluation: true,
          application: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.job.count({ where: { userId: session.user.id } }),
    ])

    return NextResponse.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Jobs list error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { urls, preferences } = body as {
      urls?: string[]
      preferences?: string
    }

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "Provide an array of URLs in the 'urls' field." },
        { status: 400 }
      )
    }

    if (urls.length > 20) {
      return NextResponse.json(
        { error: "Maximum 20 URLs per request." },
        { status: 400 }
      )
    }

    // Validate URLs
    for (const url of urls) {
      try {
        new URL(url)
      } catch {
        return NextResponse.json(
          { error: `Invalid URL: ${url}` },
          { status: 400 }
        )
      }
    }

    // Store preferences if provided
    if (preferences) {
      await prisma.profile.upsert({
        where: { userId: session.user.id },
        update: { preferences },
        create: { userId: session.user.id, preferences },
      })
    }

    const results: Array<{
      jobId: string
      url: string
      company: string
      role: string
      status: "created" | "error"
      error?: string
    }> = []

    for (const url of urls) {
      try {
        // Fetch JD
        let company = "Unknown"
        let role = "Unknown"
        let jdText = ""

        try {
          const jd = await fetchJd(url)
          company = jd.company
          role = jd.role
          jdText = jd.jdText
        } catch (fetchError) {
          // Store the job even if JD fetch fails; user can retry
          console.warn(`Failed to fetch JD for ${url}:`, fetchError)
        }

        // Create Job record
        const job = await prisma.job.create({
          data: {
            userId: session.user.id,
            url,
            company,
            role,
            jdText: jdText || null,
            jdFetchedAt: jdText ? new Date() : null,
          },
        })

        // Create Application record
        await prisma.application.create({
          data: {
            jobId: job.id,
            userId: session.user.id,
            status: "evaluated",
          },
        })

        results.push({
          jobId: job.id,
          url,
          company,
          role,
          status: "created",
        })
      } catch (err) {
        console.error(`Error processing URL ${url}:`, err)
        results.push({
          jobId: "",
          url,
          company: "",
          role: "",
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({ results }, { status: 201 })
  } catch (error) {
    console.error("Jobs create error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
