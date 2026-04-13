import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"

const MODEL = "claude-sonnet-4-20250514"

// ── Types ──────────────────────────────────────────────────────────

export interface InterviewPrep {
  company: string
  role: string
  processOverview: string
  roundBreakdown: string
  likelyQuestions: string
  starStories: string
  redFlagQuestions: string
}

interface RawPrepJson {
  processOverview: string
  roundBreakdown: string
  likelyQuestions: string
  starStories: string
  redFlagQuestions: string
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

export async function generateInterviewPrep(
  jobId: string,
  userId: string
): Promise<InterviewPrep> {
  // Load job + evaluation
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: { evaluation: true },
  })

  if (!job) {
    throw new Error("Job not found")
  }

  // Load user profile + CV
  const profile = await prisma.profile.findUnique({
    where: { userId },
  })

  if (!profile?.cvMarkdown) {
    throw new Error("CV not found. Upload your CV first.")
  }

  // Load user's story bank
  const stories = await prisma.story.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  })

  const storyBankText = stories.length > 0
    ? stories.map((s) =>
        `### ${s.title} (${s.category})\n**Situation:** ${s.situation}\n**Task:** ${s.task}\n**Action:** ${s.action}\n**Result:** ${s.result}${s.reflection ? `\n**Reflection:** ${s.reflection}` : ""}`
      ).join("\n\n")
    : "No stories in bank yet."

  // Build the evaluation context
  const evalContext = job.evaluation
    ? `## Evaluation Report\nScore: ${job.evaluation.score}/5\nArchetype: ${job.evaluation.archetype}\n\n${job.evaluation.reportMarkdown}`
    : "No evaluation available."

  const client = new Anthropic()

  const systemPrompt = `You are an expert interview coach. Given a job description, candidate CV, evaluation report, and story bank, generate a comprehensive interview preparation document.

Return a JSON object with these exact keys:
- processOverview: markdown describing expected interview rounds, typical duration, and difficulty level for this type of role at this company
- roundBreakdown: markdown with round-by-round details (phone screen, technical, behavioral, system design, hiring manager, etc.) with specific advice for each
- likelyQuestions: markdown with both behavioral and technical questions the candidate is likely to face, organized by round
- starStories: markdown mapping the candidate's existing STAR stories to likely questions, and suggesting new stories to prepare
- redFlagQuestions: markdown covering tricky questions the candidate might face (gaps, weaknesses, salary expectations) with suggested responses

Be specific to the company and role. Reference actual details from the JD and evaluation.`

  const userContent = [
    `## Job Description`,
    `**Company:** ${job.company}`,
    `**Role:** ${job.role}`,
    `**Location:** ${job.location || "Not specified"}`,
    ``,
    job.jdText || "No JD text available.",
    ``,
    evalContext,
    ``,
    `## Candidate CV`,
    profile.cvMarkdown,
    ``,
    `## Story Bank`,
    storyBankText,
    ``,
    `## Candidate Preferences`,
    profile.preferences || "None specified.",
    ``,
    `---`,
    `Generate the interview prep JSON now.`,
  ].join("\n")

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response")
  }

  const rawJson = extractJson(textBlock.text)
  let parsed: RawPrepJson

  try {
    parsed = JSON.parse(rawJson) as RawPrepJson
  } catch (e) {
    throw new Error(
      `Failed to parse interview prep JSON: ${e instanceof Error ? e.message : "unknown error"}`
    )
  }

  return {
    company: job.company,
    role: job.role,
    processOverview: parsed.processOverview || "",
    roundBreakdown: parsed.roundBreakdown || "",
    likelyQuestions: parsed.likelyQuestions || "",
    starStories: parsed.starStories || "",
    redFlagQuestions: parsed.redFlagQuestions || "",
  }
}
