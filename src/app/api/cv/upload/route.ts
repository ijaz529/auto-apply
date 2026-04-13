import { NextRequest, NextResponse } from "next/server"
import { getUserId } from "@/lib/guest"
import { prisma } from "@/lib/db"
import { parsePdf, parseDocx, structureCv } from "@/lib/cv/parser"
import type { Prisma } from "@prisma/client"

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
])
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt", "md"])

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId()

    const formData = await req.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded. Send a 'file' field in multipart form data." },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 5 MB.` },
        { status: 400 }
      )
    }

    // Validate file type by extension
    const fileName = file.name || ""
    const ext = fileName.split(".").pop()?.toLowerCase() || ""

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: .${ext}. Accepted formats: PDF, DOCX, TXT, MD.`,
        },
        { status: 400 }
      )
    }

    // Also check MIME if available (some browsers set it)
    if (file.type && !ALLOWED_TYPES.has(file.type) && file.type !== "application/octet-stream") {
      return NextResponse.json(
        { error: `Unsupported MIME type: ${file.type}.` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Extract raw text based on file type
    let rawText: string

    switch (ext) {
      case "pdf":
        rawText = await parsePdf(buffer)
        break
      case "docx":
        rawText = await parseDocx(buffer)
        break
      case "txt":
      case "md":
        rawText = buffer.toString("utf-8")
        break
      default:
        return NextResponse.json(
          { error: "Unsupported file type." },
          { status: 400 }
        )
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "Could not extract any text from the file." },
        { status: 422 }
      )
    }

    // Structure the CV (best-effort heuristic)
    let cvStructured
    try {
      cvStructured = structureCv(rawText)
    } catch {
      // Structuring is best-effort; raw text is still stored
      cvStructured = null
    }

    // Upsert the user's profile
    // Cast CVData to Prisma's InputJsonValue for the Json field
    const cvJson = cvStructured
      ? (JSON.parse(JSON.stringify(cvStructured)) as Prisma.InputJsonValue)
      : undefined

    await prisma.profile.upsert({
      where: { userId },
      update: {
        cvMarkdown: rawText,
        cvStructured: cvJson,
      },
      create: {
        userId,
        cvMarkdown: rawText,
        cvStructured: cvJson,
      },
    })

    return NextResponse.json({
      markdown: rawText,
      structured: cvStructured,
      fileName,
    })
  } catch (error) {
    console.error("CV upload error:", error)
    return NextResponse.json(
      { error: "Internal server error while processing CV." },
      { status: 500 }
    )
  }
}
