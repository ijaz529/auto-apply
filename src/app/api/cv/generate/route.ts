import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { renderTemplate } from "@/lib/pdf/templates/registry"
import { compileTypst } from "@/lib/pdf/typst-compile"
import type { CVData } from "@/types"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { templateSlug, jobId } = body as {
      templateSlug?: string
      jobId?: string
    }

    // Load user profile
    const profile = await prisma.profile.findUnique({
      where: { userId: session.user.id },
    })

    if (!profile?.cvStructured) {
      return NextResponse.json(
        {
          error:
            "No structured CV found. Upload your CV first via /api/cv/upload.",
        },
        { status: 400 }
      )
    }

    const cvData = profile.cvStructured as unknown as CVData

    // If jobId provided, load evaluation keywords
    let keywords: string[] | undefined
    if (jobId) {
      const evaluation = await prisma.evaluation.findFirst({
        where: {
          jobId,
          userId: session.user.id,
        },
      })
      if (evaluation?.keywords) {
        keywords = evaluation.keywords as string[]
      }
    }

    // Pick template
    const slug = templateSlug || profile.preferredTemplate || "basic-resume"

    // Render Typst content
    let typContent: string
    try {
      typContent = renderTemplate(slug, cvData, keywords)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Template rendering failed"
      return NextResponse.json({ error: message }, { status: 400 })
    }

    // Compile to PDF
    let pdfBuffer: Buffer
    try {
      pdfBuffer = await compileTypst(typContent)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "PDF compilation failed"
      return NextResponse.json(
        { error: `Typst compilation error: ${message}` },
        { status: 500 }
      )
    }

    // Build a filename
    const name = cvData.fullName
      ? cvData.fullName.replace(/\s+/g, "-").toLowerCase()
      : "cv"
    const fileName = `${name}-${slug}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error("CV generate error:", error)
    return NextResponse.json(
      { error: "Internal server error while generating PDF." },
      { status: 500 }
    )
  }
}
