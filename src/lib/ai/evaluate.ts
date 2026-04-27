import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { SYSTEM_PROMPT_SHARED } from "./prompts/shared"
import { EVALUATION_PROMPT } from "./prompts/evaluation"
import {
  computeGlobalScore,
  mapPreferredModel,
  type ScoreBreakdown,
  type Gap,
} from "./scoring"

export interface EvaluationResult {
  score: number
  archetype: string
  legitimacy: string
  reportMarkdown: string
  blocksJson: Record<string, string>
  keywords: string[]
  scoreBreakdown: Record<string, number>
  gaps: Array<{ description: string; severity: string; mitigation: string }>
  manualApplySteps: string[]
  coverLetterDraft: string
}

// Schema mirrors the JSON spec at the bottom of EVALUATION_PROMPT.
// Structured outputs guarantees the LLM returns this shape — no salvage logic needed.
const ScoreBreakdownSchema = z.object({
  cvMatch: z.number(),
  northStar: z.number(),
  comp: z.number(),
  cultural: z.number(),
  redFlags: z.number(),
})

const GapSchema = z.object({
  description: z.string(),
  severity: z.enum(["hard_blocker", "medium", "nice_to_have"]),
  mitigation: z.string(),
})

const BlocksSchema = z.object({
  A: z.string(),
  B: z.string(),
  C: z.string(),
  D: z.string(),
  E: z.string(),
  F: z.string(),
  G: z.string(),
})

// `score` is included so the prompt's documented JSON shape stays valid; we ignore
// the LLM's score and compute it deterministically from `scoreBreakdown` + gaps.
const EvaluationSchema = z.object({
  score: z.number(),
  archetype: z.string(),
  legitimacy: z.string(),
  scoreBreakdown: ScoreBreakdownSchema,
  keywords: z.array(z.string()),
  gaps: z.array(GapSchema),
  blocks: BlocksSchema,
  manualApplySteps: z.array(z.string()),
  coverLetterDraft: z.string(),
})

type ParsedEvaluation = z.infer<typeof EvaluationSchema>

/**
 * Normalize a Profile.targetRoles value (which is a Json column — could arrive as
 * string[], string, object, or null) into a simple string[]. Returns [] when
 * nothing useful is present so callers can branch on length.
 */
export function normalizeTargetRoles(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * Assemble the user-message content sent to Claude. Pure / deterministic —
 * extracted so prompt assembly can be unit-tested without an SDK call.
 *
 * Section order is stable for cache friendliness; volatile content (JD, CV,
 * preferences, targetRoles) lives here in the user message rather than the
 * system prompt so the cached system prefix isn't invalidated per-request.
 */
export function buildUserContent(
  jdText: string,
  cvMarkdown: string,
  preferences?: string,
  targetRoles?: string[] | null
): string {
  const sections: string[] = []
  sections.push("## Job Description", jdText)
  sections.push("", "## Candidate CV", cvMarkdown)

  const roles = normalizeTargetRoles(targetRoles)
  if (roles.length > 0) {
    sections.push(
      "",
      "## Candidate Target Roles",
      "The candidate is actively pursuing these roles / archetypes — use them to calibrate North Star alignment per the system prompt:",
      ...roles.map((r) => `- ${r}`)
    )
  }

  if (preferences && preferences.trim()) {
    sections.push("", "## Candidate Preferences", preferences.trim())
  }

  return sections.join("\n")
}

function buildReportMarkdown(parsed: ParsedEvaluation, score: number): string {
  const lines: string[] = []
  lines.push(
    `**Score:** ${score}/5 | **Archetype:** ${parsed.archetype} | **Legitimacy:** ${parsed.legitimacy}`
  )
  lines.push("")

  lines.push("## Score Breakdown")
  lines.push("")
  for (const [dim, val] of Object.entries(parsed.scoreBreakdown)) {
    lines.push(`- **${dim}:** ${val}/5`)
  }
  lines.push("")

  const blockLabels: Record<string, string> = {
    A: "Role Summary",
    B: "CV Match",
    C: "Level Strategy",
    D: "Comp & Demand",
    E: "Personalization Plan",
    F: "Interview Prep",
    G: "Posting Legitimacy",
  }

  for (const [key, label] of Object.entries(blockLabels)) {
    const text = (parsed.blocks as Record<string, string>)[key]
    if (text) {
      lines.push(`## ${key}) ${label}`)
      lines.push("")
      lines.push(text)
      lines.push("")
    }
  }

  if (parsed.keywords.length > 0) {
    lines.push("## ATS Keywords")
    lines.push("")
    lines.push(parsed.keywords.join(", "))
    lines.push("")
  }

  if (parsed.gaps.length > 0) {
    lines.push("## Gaps")
    lines.push("")
    for (const gap of parsed.gaps) {
      lines.push(
        `- **[${gap.severity}]** ${gap.description} — _Mitigation:_ ${gap.mitigation}`
      )
    }
    lines.push("")
  }

  return lines.join("\n")
}

export async function evaluateJob(
  jdText: string,
  cvMarkdown: string,
  preferences?: string,
  model: "sonnet" | "opus" = "opus",
  targetRoles?: string[] | null
): Promise<EvaluationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Add it to your environment variables."
    )
  }

  const client = new Anthropic()
  const modelId = mapPreferredModel(model)

  const userContent = buildUserContent(jdText, cvMarkdown, preferences, targetRoles)

  // Both prompt sections are static across evaluations — combine into one
  // cacheable system block. The static prefix is large (~5K tokens), well
  // above the 4096-token minimum for Opus 4.7 caching.
  const response = await client.messages.parse({
    model: modelId,
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT_SHARED + "\n\n---\n\n" + EVALUATION_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
    output_config: {
      format: zodOutputFormat(EvaluationSchema),
    },
  })

  const parsed = response.parsed_output
  if (!parsed) {
    throw new Error(
      `Evaluation parse failed (stop_reason: ${response.stop_reason ?? "unknown"})`
    )
  }

  const breakdown: ScoreBreakdown = parsed.scoreBreakdown
  const gaps: Gap[] = parsed.gaps
  const score = computeGlobalScore(breakdown, gaps)

  const reportMarkdown = buildReportMarkdown(parsed, score)

  return {
    score,
    archetype: parsed.archetype || "Unknown",
    legitimacy: parsed.legitimacy || "Proceed with Caution",
    reportMarkdown,
    blocksJson: parsed.blocks,
    keywords: parsed.keywords,
    scoreBreakdown: breakdown as unknown as Record<string, number>,
    gaps: parsed.gaps,
    manualApplySteps:
      parsed.manualApplySteps.length > 0
        ? parsed.manualApplySteps
        : [
            "Download your tailored CV using the button above",
            "Visit the job posting URL",
            "Click Apply and upload your tailored CV",
            "Fill in the application form",
            "Come back and mark as Applied",
          ],
    coverLetterDraft: parsed.coverLetterDraft,
  }
}
