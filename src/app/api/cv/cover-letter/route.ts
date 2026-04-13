import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { renderCoverLetter } from "@/lib/pdf/templates/cover-letter"
import { compileTypst } from "@/lib/pdf/typst-compile"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { jobId } = body as { jobId?: string }

    if (!jobId) {
      return NextResponse.json(
        { error: "Missing jobId in request body" },
        { status: 400 }
      )
    }

    // Load job with evaluation
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        userId: session.user.id,
      },
      include: {
        evaluation: true,
      },
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    if (!job.evaluation) {
      return NextResponse.json(
        { error: "Job has not been evaluated yet. Run an evaluation first." },
        { status: 400 }
      )
    }

    // Load user profile
    const profile = await prisma.profile.findUnique({
      where: { userId: session.user.id },
    })

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found. Complete your profile setup first." },
        { status: 400 }
      )
    }

    // Extract cover letter draft from evaluation blocks
    const blocks = job.evaluation.blocksJson as
      | { key: string; title: string; content: string }[]
      | null

    let coverLetterBody = ""

    if (blocks && Array.isArray(blocks)) {
      // Look for cover letter content in Block E (Personalization) or a dedicated cover letter block
      const coverBlock = blocks.find(
        (b) =>
          b.key.toLowerCase() === "cover_letter" ||
          b.title?.toLowerCase().includes("cover letter")
      )
      const personalizationBlock = blocks.find((b) => b.key === "E")
      const summaryBlock = blocks.find((b) => b.key === "A")

      if (coverBlock) {
        coverLetterBody = coverBlock.content
      } else {
        // Compose a cover letter from evaluation blocks
        const parts: string[] = []

        parts.push(
          `I am writing to express my strong interest in the ${job.role} position at ${job.company}. ` +
            `With my background in ${profile.targetRoles ? (profile.targetRoles as string[]).join(", ") : "this field"}, ` +
            `I believe I would be a valuable addition to your team.`
        )

        if (summaryBlock) {
          // Extract key strengths from summary, stripping markdown
          const summaryText = summaryBlock.content
            .replace(/[#*_`>]/g, "")
            .replace(/\[.*?\]\(.*?\)/g, "")
            .trim()
          const sentences = summaryText
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 20)
            .slice(0, 3)
          if (sentences.length > 0) {
            parts.push(sentences.map((s) => s.trim()).join(". ") + ".")
          }
        }

        if (personalizationBlock) {
          const personText = personalizationBlock.content
            .replace(/[#*_`>]/g, "")
            .replace(/\[.*?\]\(.*?\)/g, "")
            .trim()
          const sentences = personText
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 20)
            .slice(0, 3)
          if (sentences.length > 0) {
            parts.push(sentences.map((s) => s.trim()).join(". ") + ".")
          }
        }

        parts.push(
          `I would welcome the opportunity to discuss how my experience and skills align with your needs for this role. ` +
            `I look forward to hearing from you.`
        )

        coverLetterBody = parts.join("\n\n")
      }
    }

    if (!coverLetterBody) {
      coverLetterBody =
        `I am writing to express my strong interest in the ${job.role} position at ${job.company}.\n\n` +
        `I believe my skills and experience make me a strong candidate for this role. ` +
        `I would welcome the opportunity to discuss how I can contribute to your team.\n\n` +
        `I look forward to hearing from you.`
    }

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    // Render Typst content
    const typContent = renderCoverLetter({
      fullName: profile.fullName ?? profile.email ?? "Applicant",
      location: profile.location ?? "",
      email: profile.email ?? session.user.email ?? "",
      phone: profile.phone ?? "",
      date: today,
      company: job.company,
      role: job.role,
      body: coverLetterBody,
    })

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

    const companySlug = job.company
      .replace(/\s+/g, "-")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
    const fileName = `cover-letter-${companySlug}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error("Cover letter generate error:", error)
    return NextResponse.json(
      { error: "Internal server error while generating cover letter." },
      { status: 500 }
    )
  }
}
