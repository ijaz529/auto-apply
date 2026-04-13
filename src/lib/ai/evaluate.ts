import Anthropic from "@anthropic-ai/sdk"
import { SYSTEM_PROMPT_SHARED } from "./prompts/shared"
import { EVALUATION_PROMPT } from "./prompts/evaluation"

const MODEL_MAP = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
} as const

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

interface RawEvaluationJson {
  score: number
  archetype: string
  legitimacy: string
  scoreBreakdown: Record<string, number>
  keywords: string[]
  gaps: Array<{ description: string; severity: string; mitigation: string }>
  blocks: Record<string, string>
  manualApplySteps: string[]
  coverLetterDraft: string
}

/**
 * Extract JSON from a Claude response that may contain markdown fences or preamble.
 */
function extractJson(text: string): string {
  // Try to find JSON in a code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    return fenceMatch[1].trim()
  }

  // Try to find a raw JSON object
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    return objectMatch[0]
  }

  return text
}

/**
 * Build a full markdown report from the evaluation blocks.
 */
function buildReportMarkdown(
  parsed: RawEvaluationJson,
  company: string,
  role: string
): string {
  const lines: string[] = []

  lines.push(`# Evaluation: ${role} at ${company}`)
  lines.push("")
  lines.push(
    `**Score:** ${parsed.score}/5 | **Archetype:** ${parsed.archetype} | **Legitimacy:** ${parsed.legitimacy}`
  )
  lines.push("")

  // Score breakdown
  lines.push("## Score Breakdown")
  lines.push("")
  if (parsed.scoreBreakdown) {
    for (const [dim, val] of Object.entries(parsed.scoreBreakdown)) {
      lines.push(`- **${dim}:** ${val}/5`)
    }
  }
  lines.push("")

  // Blocks A-G
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
    if (parsed.blocks[key]) {
      lines.push(`## Block ${key} -- ${label}`)
      lines.push("")
      lines.push(parsed.blocks[key])
      lines.push("")
    }
  }

  // Keywords
  if (parsed.keywords && parsed.keywords.length > 0) {
    lines.push("## ATS Keywords")
    lines.push("")
    lines.push(parsed.keywords.join(", "))
    lines.push("")
  }

  // Gaps
  if (parsed.gaps && parsed.gaps.length > 0) {
    lines.push("## Gaps")
    lines.push("")
    for (const gap of parsed.gaps) {
      lines.push(
        `- **[${gap.severity}]** ${gap.description} -- _Mitigation:_ ${gap.mitigation}`
      )
    }
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Evaluate a job description against a candidate's CV using Claude.
 */
export async function evaluateJob(
  jdText: string,
  cvMarkdown: string,
  preferences?: string,
  model: "sonnet" | "opus" = "sonnet"
): Promise<EvaluationResult> {
  const client = new Anthropic()

  const userParts: string[] = []
  userParts.push("## Job Description\n")
  userParts.push(jdText)
  userParts.push("\n\n## Candidate CV\n")
  userParts.push(cvMarkdown)
  if (preferences) {
    userParts.push("\n\n## Candidate Preferences\n")
    userParts.push(preferences)
  }
  userParts.push("\n\n---\n\n")
  userParts.push(EVALUATION_PROMPT)

  const response = await client.messages.create({
    model: MODEL_MAP[model],
    max_tokens: 8192,
    system: SYSTEM_PROMPT_SHARED,
    messages: [
      {
        role: "user",
        content: userParts.join("\n"),
      },
    ],
  })

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response")
  }

  const rawJson = extractJson(textBlock.text)

  let parsed: RawEvaluationJson
  try {
    parsed = JSON.parse(rawJson) as RawEvaluationJson
  } catch (e) {
    throw new Error(
      `Failed to parse evaluation JSON from Claude response: ${e instanceof Error ? e.message : "unknown error"}`
    )
  }

  // Validate required fields
  if (typeof parsed.score !== "number" || parsed.score < 1 || parsed.score > 5) {
    throw new Error(
      `Invalid score: ${parsed.score}. Must be a number between 1 and 5.`
    )
  }

  // Build the full markdown report
  const reportMarkdown = buildReportMarkdown(
    parsed,
    "Company", // Will be enriched by the caller with actual company name
    "Role"
  )

  return {
    score: parsed.score,
    archetype: parsed.archetype || "Unknown",
    legitimacy: parsed.legitimacy || "Proceed with Caution",
    reportMarkdown,
    blocksJson: parsed.blocks || {},
    keywords: parsed.keywords || [],
    scoreBreakdown: parsed.scoreBreakdown || {},
    gaps: parsed.gaps || [],
    manualApplySteps: parsed.manualApplySteps || [],
    coverLetterDraft: parsed.coverLetterDraft || "",
  }
}
