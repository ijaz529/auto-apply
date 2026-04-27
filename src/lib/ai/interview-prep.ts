import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { prisma } from "@/lib/db"
import { mapPreferredModel } from "./scoring"
import { pickTopStories, type StoryLike } from "./story-matching"

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

const PrepSchema = z.object({
  processOverview: z.string(),
  roundBreakdown: z.string(),
  likelyQuestions: z.string(),
  starStories: z.string(),
  redFlagQuestions: z.string(),
})

// Cap how many of the user's bank stories we send to the LLM. With 50+ stories
// the prompt explodes; the matching engine pre-filters to the most JD-relevant.
const STORY_BANK_LIMIT = 8

const SYSTEM_PROMPT = `You are an expert interview coach. Given a job description, candidate CV, evaluation report, and a pre-filtered story bank (the most JD-relevant stories the candidate has on hand), produce a comprehensive interview-prep document.

Output keys:
- **processOverview**: markdown describing expected interview rounds, typical duration, and difficulty level for this type of role at this company.
- **roundBreakdown**: markdown with round-by-round details (phone screen, technical, behavioral, system design, hiring manager, etc.) and specific advice for each.
- **likelyQuestions**: markdown with both behavioral and technical questions the candidate is likely to face, organised by round.
- **starStories**: markdown mapping the candidate's existing pre-filtered stories to likely questions, and suggesting 2-3 NEW stories to prepare. Reference the existing stories by their **title**, not by re-narrating the full STAR — the candidate already has those.
- **redFlagQuestions**: markdown covering tricky questions (gaps, weaknesses, salary expectations) with suggested responses.

Be specific to the company and role. Reference details from the JD and the evaluation report. Do not invent experience that isn't in the CV or story bank.`

export async function generateInterviewPrep(
  jobId: string,
  userId: string
): Promise<InterviewPrep> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Add it to your environment variables."
    )
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: { evaluation: true },
  })
  if (!job) throw new Error("Job not found")

  const profile = await prisma.profile.findUnique({ where: { userId } })
  if (!profile?.cvMarkdown) {
    throw new Error("CV not found. Upload your CV first.")
  }

  // Pre-filter the story bank by JD relevance so the prompt stays small.
  const allStories = await prisma.story.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  })
  const keywords = (job.evaluation?.keywords as string[] | null) ?? []
  const archetype = job.evaluation?.archetype ?? null
  const relevantStories = pickTopStories<StoryLike>(
    allStories.map((s) => ({
      id: s.id,
      category: s.category,
      title: s.title,
      situation: s.situation,
      task: s.task,
      action: s.action,
      result: s.result,
      reflection: s.reflection,
    })),
    keywords,
    STORY_BANK_LIMIT,
    archetype
  )

  const storyBankText =
    relevantStories.length > 0
      ? relevantStories
          .map(
            (s) =>
              `### ${s.title} (${s.category})\n**Situation:** ${s.situation}\n**Task:** ${s.task}\n**Action:** ${s.action}\n**Result:** ${s.result}${
                s.reflection ? `\n**Reflection:** ${s.reflection}` : ""
              }`
          )
          .join("\n\n")
      : "No stories in bank yet. Suggest STAR stories the candidate should write based on their CV."

  const evalContext = job.evaluation
    ? `## Evaluation Report\nScore: ${job.evaluation.score}/5\nArchetype: ${job.evaluation.archetype ?? "Unknown"}\n\n${job.evaluation.reportMarkdown}`
    : "No evaluation available."

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
    `## Story Bank (top ${STORY_BANK_LIMIT} by JD relevance)`,
    storyBankText,
    ``,
    `## Candidate Preferences`,
    profile.preferences || "None specified.",
  ].join("\n")

  const client = new Anthropic()
  const modelId = mapPreferredModel(profile.preferredModel)

  // System prompt is static across all evaluations → cache it. The user
  // message holds the volatile per-job context.
  const response = await client.messages.parse({
    model: modelId,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(PrepSchema) },
  })

  const parsed = response.parsed_output
  if (!parsed) {
    throw new Error(
      `Interview prep parse failed (stop_reason: ${response.stop_reason ?? "unknown"})`
    )
  }

  return {
    company: job.company,
    role: job.role,
    processOverview: parsed.processOverview,
    roundBreakdown: parsed.roundBreakdown,
    likelyQuestions: parsed.likelyQuestions,
    starStories: parsed.starStories,
    redFlagQuestions: parsed.redFlagQuestions,
  }
}
