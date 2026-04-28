import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import type { CVData } from "@/types"

/**
 * Extract raw text from a PDF buffer.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await parser.getText()
  return result.text
}

/**
 * Extract markdown from a DOCX buffer via mammoth.
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

/**
 * Zod schema for structured CV parsing. Mirrors the CVData type so that
 * Anthropic's structured-output mode validates the response shape and we don't
 * need defensive runtime checks downstream.
 */
const CvSchema = z.object({
  fullName: z.string(),
  location: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  linkedin: z.string().nullable(),
  github: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  summary: z.string(),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      bullets: z.array(z.string()),
    })
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      location: z.string(),
      degree: z.string(),
      endDate: z.string(),
    })
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      role: z.string().nullable(),
      startDate: z.string(),
      endDate: z.string(),
      url: z.string().nullable(),
      bullets: z.array(z.string()),
    })
  ),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string(),
      code: z.string().nullable(),
    })
  ),
  skills: z.array(
    z.object({
      category: z.string(),
      items: z.array(z.string()),
    })
  ),
  achievements: z.array(z.string()),
})

const SYSTEM_PROMPT = `You parse CV / resume text into a fixed JSON schema. Hard rules:

- Extract EVERY work experience entry with ALL its bullet points.
- Keep bullet points verbatim — do not summarize, paraphrase, or merge.
- If a section is absent in the source, return an empty array (not omit).
- summary: use the professional summary / about / profile section verbatim. If none, use "".
- Parse dates as written (e.g. "Sep 2023", "2018", "Present"). Don't normalize.
- Use null for missing optional fields (phone, linkedin, github, portfolioUrl, project.role, project.url, certification.code).`

/**
 * Structure a CV from raw text into CVData using Claude.
 * Falls back to a basic heuristic if no API key is set or the call fails.
 */
export async function structureCv(rawText: string): Promise<CVData> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      return await structureCvWithAI(rawText)
    } catch (error) {
      console.warn("AI CV parsing failed, falling back to heuristic:", error)
    }
  }
  return structureCvHeuristic(rawText)
}

async function structureCvWithAI(rawText: string): Promise<CVData> {
  const client = new Anthropic()
  const response = await client.messages.parse({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `## CV TEXT\n\n${rawText}`,
      },
    ],
    output_config: { format: zodOutputFormat(CvSchema) },
  })

  const parsed = response.parsed_output
  if (!parsed) {
    throw new Error(
      `CV parse failed (stop_reason: ${response.stop_reason ?? "unknown"})`
    )
  }

  // Coerce nullable fields back to the optional shape the rest of the app expects.
  return {
    fullName: parsed.fullName,
    location: parsed.location,
    email: parsed.email,
    phone: parsed.phone ?? undefined,
    linkedin: parsed.linkedin ?? undefined,
    github: parsed.github ?? undefined,
    portfolioUrl: parsed.portfolioUrl ?? undefined,
    summary: parsed.summary,
    experience: parsed.experience,
    education: parsed.education,
    projects: parsed.projects.map((p) => ({
      name: p.name,
      role: p.role ?? undefined,
      startDate: p.startDate,
      endDate: p.endDate,
      url: p.url ?? undefined,
      bullets: p.bullets,
    })),
    certifications: parsed.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      code: c.code ?? undefined,
    })),
    skills: parsed.skills,
    achievements: parsed.achievements,
  }
}

function structureCvHeuristic(rawText: string): CVData {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean)

  // Basic extraction
  const emailMatch = rawText.match(/[\w.-]+@[\w.-]+\.\w+/)
  const phoneMatch = rawText.match(/\+?\d[\d\s()-]{7,}/)
  const linkedinMatch = rawText.match(/linkedin\.com\/in\/[\w-]+/)
  const githubMatch = rawText.match(/github\.com\/[\w-]+/)

  return {
    fullName: lines[0] || "Unknown",
    location: "",
    email: emailMatch?.[0] || "",
    phone: phoneMatch?.[0]?.trim() || undefined,
    linkedin: linkedinMatch?.[0] || undefined,
    github: githubMatch?.[0] || undefined,
    summary: "",
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    skills: [],
    achievements: [],
  }
}
