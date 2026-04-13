import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"

const MODEL = "claude-sonnet-4-20250514"

// ── Types ──────────────────────────────────────────────────────────

export interface OutreachResult {
  connectionRequest: string
  inmailMessage: string
  suggestedContacts: Array<{ title: string; searchQuery: string }>
}

interface RawOutreachJson {
  connectionRequest: string
  inmailMessage: string
  suggestedContacts: Array<{ title: string; searchQuery: string }>
}

// ── Helpers ────────────────────────────────────────────────────────

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) return objectMatch[0]
  return text
}

// ── Main Function ──────────────────────────────────────────────────

export async function generateOutreach(
  jobId: string,
  userId: string
): Promise<OutreachResult> {
  // Load job + evaluation
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: { evaluation: true },
  })

  if (!job) {
    throw new Error("Job not found")
  }

  // Load user profile
  const profile = await prisma.profile.findUnique({
    where: { userId },
  })

  if (!profile) {
    throw new Error("Profile not found. Complete your profile first.")
  }

  // Build evaluation context
  const evalContext = job.evaluation
    ? `Score: ${job.evaluation.score}/5 | Archetype: ${job.evaluation.archetype}\nKey strengths from evaluation: ${job.evaluation.reportMarkdown.slice(0, 500)}`
    : "No evaluation available."

  const client = new Anthropic()

  const systemPrompt = `You are an expert LinkedIn outreach strategist for job seekers. Generate personalized outreach messages that are warm, specific, and non-generic.

Rules:
- connectionRequest must be under 300 characters (LinkedIn limit)
- inmailMessage should be concise (under 1000 characters), reference specific company context or recent news
- suggestedContacts should include 3-5 relevant people to reach out to (hiring manager, team lead, recruiter, etc.)
- Never be generic. Reference the specific role, company, or candidate's relevant experience
- Be professional but human. No buzzwords, no "I'm excited to..." templates

Return a JSON object with these exact keys:
- connectionRequest: string (under 300 chars)
- inmailMessage: string (under 1000 chars)
- suggestedContacts: array of { title: string, searchQuery: string }`

  const userContent = [
    `## Target Job`,
    `**Company:** ${job.company}`,
    `**Role:** ${job.role}`,
    `**Location:** ${job.location || "Not specified"}`,
    ``,
    `## Job Description`,
    job.jdText || "No JD text available.",
    ``,
    `## Evaluation`,
    evalContext,
    ``,
    `## Candidate Profile`,
    `**Name:** ${profile.fullName || "Not specified"}`,
    `**Location:** ${profile.location || "Not specified"}`,
    `**LinkedIn:** ${profile.linkedin || "Not specified"}`,
    `**Target Roles:** ${JSON.stringify(profile.targetRoles || [])}`,
    ``,
    `## Candidate CV (summary)`,
    (profile.cvMarkdown || "No CV available.").slice(0, 2000),
    ``,
    `---`,
    `Generate the outreach JSON now.`,
  ].join("\n")

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response")
  }

  const rawJson = extractJson(textBlock.text)
  let parsed: RawOutreachJson

  try {
    parsed = JSON.parse(rawJson) as RawOutreachJson
  } catch (e) {
    throw new Error(
      `Failed to parse outreach JSON: ${e instanceof Error ? e.message : "unknown error"}`
    )
  }

  // Validate connection request length
  if (parsed.connectionRequest && parsed.connectionRequest.length > 300) {
    parsed.connectionRequest = parsed.connectionRequest.slice(0, 297) + "..."
  }

  return {
    connectionRequest: parsed.connectionRequest || "",
    inmailMessage: parsed.inmailMessage || "",
    suggestedContacts: parsed.suggestedContacts || [],
  }
}
