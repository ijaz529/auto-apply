import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import { renderTemplate } from "@/lib/pdf/templates/registry"
import { compileTypst } from "@/lib/pdf/typst-compile"
import type { CVData } from "@/types"

function generateApplySteps(url: string, company: string, role: string): string[] {
  const lower = url.toLowerCase()

  if (lower.includes("greenhouse.io")) {
    return [
      `Open the job posting: ${url}`,
      "Click the 'Apply for this Job' button",
      "Upload your tailored CV (download it below)",
      "Fill in your personal details (name, email, phone)",
      "Answer any custom screening questions",
      "Review and submit your application",
    ]
  }

  if (lower.includes("linkedin.com")) {
    return [
      `Open the job posting: ${url}`,
      "Click 'Easy Apply' (or 'Apply' if external)",
      "Upload your tailored CV when prompted",
      "Fill in any required fields",
      "Review and submit your application",
    ]
  }

  if (lower.includes("lever.co")) {
    return [
      `Open the job posting: ${url}`,
      "Click the 'Apply for this job' button",
      "Upload your tailored CV",
      "Fill in your name, email, phone, and LinkedIn URL",
      "Complete any additional questions",
      "Review and submit your application",
    ]
  }

  if (lower.includes("ashbyhq.com")) {
    return [
      `Open the job posting: ${url}`,
      "Click the 'Apply' button",
      "Upload your tailored CV",
      "Fill in your personal details",
      "Answer any screening questions",
      "Review and submit your application",
    ]
  }

  // Generic fallback
  return [
    `Open the job posting: ${url}`,
    "Look for an 'Apply' or 'Submit Application' button",
    "Upload your tailored CV (download it below)",
    "Fill in your personal details (name, email, phone)",
    "Complete any additional fields or questions",
    "Review and submit your application",
  ]
}

function generateTalkingPoints(
  evaluation: {
    keywords: unknown
    gaps: unknown
    archetype: string | null
    blocksJson: unknown
  },
  profile: {
    fullName: string | null
    preferences: string | null
    targetRoles: unknown
  },
  role: string,
  company: string
): string[] {
  const points: string[] = []

  // Use keywords from evaluation
  const keywords = evaluation.keywords as string[] | null
  if (keywords && keywords.length > 0) {
    const topKeywords = keywords.slice(0, 5).join(", ")
    points.push(`Highlight your experience with: ${topKeywords}`)
  }

  // Use archetype
  if (evaluation.archetype) {
    points.push(`Position yourself as a ${evaluation.archetype}`)
  }

  // Add role-specific point
  points.push(`Emphasize your fit for the ${role} role at ${company}`)

  // Add target role context
  const targetRoles = profile.targetRoles as string[] | null
  if (targetRoles && targetRoles.length > 0) {
    points.push(
      `Draw on your background in ${targetRoles.slice(0, 3).join(", ")}`
    )
  }

  return points
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    const { id } = await params

    // Load job with evaluation and application
    const job = await prisma.job.findFirst({
      where: { id, userId },
      include: {
        evaluation: true,
        application: true,
      },
    })

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    if (!job.evaluation) {
      return NextResponse.json(
        { error: "Job has not been evaluated yet." },
        { status: 400 }
      )
    }

    // Load user profile
    const profile = await prisma.profile.findUnique({
      where: { userId },
    })

    if (!profile?.cvStructured) {
      return NextResponse.json(
        { error: "No structured CV found. Upload your CV first." },
        { status: 400 }
      )
    }

    const cvData = profile.cvStructured as unknown as CVData

    // Generate tailored CV PDF
    const evalKeywords = job.evaluation.keywords as string[] | undefined
    const slug = profile.preferredTemplate || "basic-resume"

    let cvPdfBase64 = ""
    try {
      const typContent = renderTemplate(slug, cvData, evalKeywords ?? undefined)
      const pdfBuffer = await compileTypst(typContent)
      cvPdfBase64 = Buffer.from(pdfBuffer).toString("base64")
    } catch (error) {
      console.error("CV generation failed in auto-apply:", error)
      // Continue without PDF — still provide steps
    }

    // Generate apply steps
    const applySteps = generateApplySteps(
      job.url,
      job.company,
      job.role
    )

    // Generate talking points
    const talkingPoints = generateTalkingPoints(
      {
        keywords: job.evaluation.keywords,
        gaps: job.evaluation.gaps,
        archetype: job.evaluation.archetype,
        blocksJson: job.evaluation.blocksJson,
      },
      {
        fullName: profile.fullName,
        preferences: profile.preferences,
        targetRoles: profile.targetRoles,
      },
      job.role,
      job.company
    )

    // Build a simple cover letter text from evaluation data
    const blocks = job.evaluation.blocksJson as
      | { key: string; title: string; content: string }[]
      | null

    let coverLetterText = ""
    if (blocks && Array.isArray(blocks)) {
      const summaryBlock = blocks.find((b) => b.key === "A")
      const personBlock = blocks.find((b) => b.key === "E")

      const parts: string[] = []
      parts.push(
        `Dear ${job.company} Hiring Team,\n\n` +
          `I am writing to express my interest in the ${job.role} position.`
      )

      if (summaryBlock) {
        const text = summaryBlock.content
          .replace(/[#*_`>]/g, "")
          .replace(/\[.*?\]\(.*?\)/g, "")
          .trim()
        const sentences = text
          .split(/[.!?]+/)
          .filter((s) => s.trim().length > 20)
          .slice(0, 3)
        if (sentences.length > 0) {
          parts.push(sentences.map((s) => s.trim()).join(". ") + ".")
        }
      }

      if (personBlock) {
        const text = personBlock.content
          .replace(/[#*_`>]/g, "")
          .replace(/\[.*?\]\(.*?\)/g, "")
          .trim()
        const sentences = text
          .split(/[.!?]+/)
          .filter((s) => s.trim().length > 20)
          .slice(0, 2)
        if (sentences.length > 0) {
          parts.push(sentences.map((s) => s.trim()).join(". ") + ".")
        }
      }

      parts.push(
        `I would welcome the opportunity to discuss how I can contribute to your team.\n\n` +
          `Best regards,\n${profile.fullName || "Applicant"}`
      )

      coverLetterText = parts.join("\n\n")
    } else {
      coverLetterText =
        `Dear ${job.company} Hiring Team,\n\n` +
        `I am writing to express my interest in the ${job.role} position. ` +
        `I believe my skills and experience make me a strong candidate for this role.\n\n` +
        `I would welcome the opportunity to discuss how I can contribute to your team.\n\n` +
        `Best regards,\n${profile.fullName || "Applicant"}`
    }

    return NextResponse.json({
      cvPdfBase64,
      applySteps,
      talkingPoints,
      coverLetterText,
      score: job.evaluation.score,
      company: job.company,
      role: job.role,
      url: job.url,
    })
  } catch (error) {
    console.error("Auto-apply error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
