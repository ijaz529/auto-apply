import { GoogleGenerativeAI } from "@google/generative-ai"
import { SYSTEM_PROMPT_SHARED } from "./prompts/shared"
import { EVALUATION_PROMPT } from "./prompts/evaluation"

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

function extractJson(text: string): string {
  // Try code fence first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) return fenceMatch[1].trim()

  // Find the outermost { ... } pair by counting braces
  let start = text.indexOf("{")
  if (start === -1) return text

  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++
    else if (text[i] === "}") {
      depth--
      if (depth === 0) { end = i; break }
    }
  }

  if (end > start) return text.substring(start, end + 1)
  return text
}

function buildReportMarkdown(parsed: RawEvaluationJson): string {
  const lines: string[] = []
  lines.push(`**Score:** ${parsed.score}/5 | **Archetype:** ${parsed.archetype} | **Legitimacy:** ${parsed.legitimacy}`)
  lines.push("")

  if (parsed.scoreBreakdown) {
    lines.push("## Score Breakdown")
    lines.push("")
    for (const [dim, val] of Object.entries(parsed.scoreBreakdown)) {
      lines.push(`- **${dim}:** ${val}/5`)
    }
    lines.push("")
  }

  const blockLabels: Record<string, string> = {
    A: "Role Summary", B: "CV Match", C: "Level Strategy",
    D: "Comp & Demand", E: "Personalization Plan", F: "Interview Prep",
    G: "Posting Legitimacy",
  }

  for (const [key, label] of Object.entries(blockLabels)) {
    if (parsed.blocks?.[key]) {
      lines.push(`## ${key}) ${label}`)
      lines.push("")
      lines.push(parsed.blocks[key])
      lines.push("")
    }
  }

  if (parsed.keywords?.length > 0) {
    lines.push("## ATS Keywords")
    lines.push("")
    lines.push(parsed.keywords.join(", "))
    lines.push("")
  }

  if (parsed.gaps?.length > 0) {
    lines.push("## Gaps")
    lines.push("")
    for (const gap of parsed.gaps) {
      lines.push(`- **[${gap.severity}]** ${gap.description} — _Mitigation:_ ${gap.mitigation}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

export async function evaluateJob(
  jdText: string,
  cvMarkdown: string,
  preferences?: string,
  _model?: "sonnet" | "opus"
): Promise<EvaluationResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set. Add it to your environment variables.")
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  })

  const prompt = [
    SYSTEM_PROMPT_SHARED,
    "\n\n---\n\n",
    "## Job Description\n",
    jdText,
    "\n\n## Candidate CV\n",
    cvMarkdown,
    preferences ? `\n\n## Candidate Preferences\n${preferences}` : "",
    "\n\n---\n\n",
    EVALUATION_PROMPT,
    "\n\nIMPORTANT: Respond with ONLY a valid JSON object. No text before or after the JSON.",
  ].join("\n")

  const result = await model.generateContent(prompt)
  const response = result.response
  const text = response.text()

  if (!text) {
    throw new Error("Empty response from Gemini API")
  }

  const rawJson = extractJson(text)

  let parsed: RawEvaluationJson
  try {
    parsed = JSON.parse(rawJson) as RawEvaluationJson
  } catch {
    // Try sanitizing: fix common issues like unescaped newlines in strings
    try {
      // Walk char-by-char to escape newlines/tabs inside JSON strings
      let sanitized = ""
      let inStr = false
      let esc = false
      for (let i = 0; i < rawJson.length; i++) {
        const ch = rawJson[i]
        if (esc) { sanitized += ch; esc = false; continue }
        if (ch === "\\") { sanitized += ch; esc = true; continue }
        if (ch === '"') { inStr = !inStr; sanitized += ch; continue }
        if (inStr && ch === "\n") { sanitized += "\\n"; continue }
        if (inStr && ch === "\r") { sanitized += "\\r"; continue }
        if (inStr && ch === "\t") { sanitized += "\\t"; continue }
        sanitized += ch
      }
      parsed = JSON.parse(sanitized) as RawEvaluationJson
    } catch (e2) {
      // Last resort: try to extract just the score and basic info
      console.error("JSON parse failed even after sanitize. First 500 chars:", rawJson.substring(0, 500))
      const scoreMatch = rawJson.match(/"score"\s*:\s*([\d.]+)/)
      const archetypeMatch = rawJson.match(/"archetype"\s*:\s*"([^"]*)"/)
      if (scoreMatch) {
        parsed = {
          score: parseFloat(scoreMatch[1]),
          archetype: archetypeMatch?.[1] || "Unknown",
          legitimacy: "Proceed with Caution",
          scoreBreakdown: {},
          keywords: [],
          gaps: [],
          blocks: {},
          manualApplySteps: [],
          coverLetterDraft: "",
        }
      } else {
        throw new Error(`Failed to parse evaluation JSON: ${e2 instanceof Error ? e2.message : "unknown"}`)
      }
    }
  }

  // Salvage score
  if (typeof parsed.score !== "number") {
    parsed.score = typeof parsed.score === "string" ? parseFloat(parsed.score as unknown as string) : 3.0
  }
  if (isNaN(parsed.score) || parsed.score < 1 || parsed.score > 5) {
    parsed.score = 3.0
  }

  const reportMarkdown = buildReportMarkdown(parsed)

  return {
    score: Math.round(parsed.score * 10) / 10,
    archetype: parsed.archetype || "Unknown",
    legitimacy: parsed.legitimacy || "Proceed with Caution",
    reportMarkdown,
    blocksJson: parsed.blocks || {},
    keywords: parsed.keywords || [],
    scoreBreakdown: parsed.scoreBreakdown || {},
    gaps: parsed.gaps || [],
    manualApplySteps: parsed.manualApplySteps || [
      "Download your tailored CV using the button above",
      "Visit the job posting URL",
      "Click Apply and upload your tailored CV",
      "Fill in the application form",
      "Come back and mark as Applied",
    ],
    coverLetterDraft: parsed.coverLetterDraft || "",
  }
}
