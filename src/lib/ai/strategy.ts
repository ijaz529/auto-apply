/**
 * Job-specific strategy: company research brief + negotiation kit.
 *
 * One Claude call produces both as markdown blocks. Reuses the saved
 * Evaluation report so we don't re-pay for context the eval already paid for.
 * Cached in Evaluation.blocksJson.strategy by the route handler.
 */
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { prisma } from "@/lib/db"
import { mapPreferredModel } from "./scoring"

export interface JobStrategy {
  research: string
  negotiation: string
}

const StrategySchema = z.object({
  research: z.string(),
  negotiation: z.string(),
})

const SYSTEM_PROMPT = `You are an expert job-search strategist. For a single job a candidate is considering, produce TWO markdown briefs from your existing knowledge of the company and the candidate's evaluation report:

**research**: A concise company brief covering:
- Culture signals (working style, values, public reputation)
- Red flags worth investigating (recent layoffs, leadership churn, regulatory issues, public controversies)
- Recent news / direction (funding, product launches, exec moves) — only what you're confident about; if unsure, say so explicitly rather than fabricate
- Why this role could be a strong fit for THIS candidate, grounded in the evaluation

**negotiation**: A practical negotiation kit covering:
- Realistic salary range for this role / location / seniority (lean on the eval's Block D and your knowledge; show low / mid / high with reasoning)
- Specific leverage points the candidate has (proof points from CV, archetype match, market scarcity)
- Geographic considerations (remote vs onsite trade-offs, COL adjustments)
- Ready-to-use phrasing for: opening anchor, asking about base + equity + signing, pushing back politely, negotiating the start date / review cadence
- Tough questions and suggested responses (gaps, current comp, competing offers)

Hard rules:
- Be specific to the company and role. Reference the JD and evaluation explicitly.
- Cite uncertainty rather than fabricating facts (e.g. "I don't have current info on their funding status — confirm before relying on this").
- Don't repeat what's already in the evaluation report; build on it.
- No hype, no clichés. Concrete, useful prose.`

export async function generateJobStrategy(
  jobId: string,
  userId: string
): Promise<JobStrategy> {
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

  const userContent = buildStrategyUserContent({
    company: job.company,
    role: job.role,
    location: job.location ?? null,
    jdText: job.jdText ?? null,
    evaluationMarkdown: job.evaluation?.reportMarkdown ?? null,
    archetype: job.evaluation?.archetype ?? null,
    score: job.evaluation?.score ?? null,
    candidatePreferences: profile?.preferences ?? null,
    targetRoles: (profile?.targetRoles as string[] | null) ?? null,
  })

  const client = new Anthropic()
  const modelId = mapPreferredModel(profile?.preferredModel)

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
    output_config: { format: zodOutputFormat(StrategySchema) },
  })

  const parsed = response.parsed_output
  if (!parsed) {
    throw new Error(
      `Strategy parse failed (stop_reason: ${response.stop_reason ?? "unknown"})`
    )
  }
  return { research: parsed.research, negotiation: parsed.negotiation }
}

interface StrategyContextInput {
  company: string
  role: string
  location: string | null
  jdText: string | null
  evaluationMarkdown: string | null
  archetype: string | null
  score: number | null
  candidatePreferences: string | null
  targetRoles: string[] | null
}

/**
 * Pure / deterministic prompt assembly for the strategy LLM call. Exported so
 * the test suite can pin section ordering without spinning up the SDK.
 */
export function buildStrategyUserContent(ctx: StrategyContextInput): string {
  const sections: string[] = []
  sections.push(
    "## Job",
    `**Company:** ${ctx.company}`,
    `**Role:** ${ctx.role}`,
    `**Location:** ${ctx.location || "Not specified"}`
  )

  if (ctx.score != null || ctx.archetype) {
    sections.push("")
    sections.push(
      `**Score:** ${ctx.score != null ? `${ctx.score}/5` : "n/a"}` +
        ` | **Archetype:** ${ctx.archetype ?? "Unknown"}`
    )
  }

  if (ctx.evaluationMarkdown) {
    sections.push("", "## Evaluation Report (existing)", ctx.evaluationMarkdown)
  }

  if (ctx.jdText) {
    sections.push("", "## Job Description", ctx.jdText)
  }

  if (ctx.targetRoles && ctx.targetRoles.length > 0) {
    sections.push(
      "",
      "## Candidate Target Roles",
      ...ctx.targetRoles.map((r) => `- ${r}`)
    )
  }

  if (ctx.candidatePreferences && ctx.candidatePreferences.trim()) {
    sections.push("", "## Candidate Preferences", ctx.candidatePreferences.trim())
  }

  return sections.join("\n")
}
