import { PDFParse } from "pdf-parse"
import type { CVData, WorkEntry, EduEntry, SkillCategory } from "@/types"

/**
 * Extract raw text from a PDF buffer.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await parser.getText()
  return result.text
}

/**
 * Extract markdown from a DOCX buffer via mammoth.
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  // mammoth types don't expose convertToMarkdown, but it exists at runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth") as {
    convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>
  }
  const result = await mammoth.convertToMarkdown({ buffer })
  return result.value
}

// ── Heading detection ───────────────────────────────────────────────

const SECTION_PATTERNS: Record<string, RegExp> = {
  summary: /^(summary|profile|about me|objective|professional\s*summary)/i,
  experience:
    /^(experience|work\s*experience|professional\s*experience|employment|work\s*history)/i,
  education: /^(education|academic|qualifications)/i,
  skills: /^(skills|technical\s*skills|core\s*competencies|technologies)/i,
  projects: /^(projects|personal\s*projects|portfolio)/i,
  certifications:
    /^(certifications?|certificates?|licenses?|accreditations?)/i,
  achievements:
    /^(achievements?|awards?|accomplishments?|honors?|recognition)/i,
}

function detectSection(line: string): string | null {
  const cleaned = line.replace(/^#+\s*/, "").replace(/[:\-_|]/g, " ").trim()
  for (const [section, re] of Object.entries(SECTION_PATTERNS)) {
    if (re.test(cleaned)) return section
  }
  return null
}

// ── Date parsing helpers ────────────────────────────────────────────

const DATE_RANGE_RE =
  /(\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4})\s*[\u2013\u2014\-–—to]+\s*(\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4}|Present|Current|Now)/i

const YEAR_RE = /\b(19|20)\d{2}\b/

function extractDateRange(text: string): {
  startDate: string
  endDate: string
} {
  const m = text.match(DATE_RANGE_RE)
  if (m) {
    return { startDate: m[1].trim(), endDate: m[2].trim() }
  }
  const years = text.match(/\b((?:19|20)\d{2})\b/g)
  if (years && years.length >= 2) {
    return { startDate: years[0], endDate: years[years.length - 1] }
  }
  if (years && years.length === 1) {
    return { startDate: years[0], endDate: years[0] }
  }
  return { startDate: "", endDate: "" }
}

// ── Contact info extraction ─────────────────────────────────────────

function extractEmail(text: string): string {
  const m = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/i)
  return m ? m[0] : ""
}

function extractPhone(text: string): string {
  const m = text.match(/[\+]?[\d\s\-().]{7,20}/)
  return m ? m[0].trim() : ""
}

function extractLinkedin(text: string): string {
  const m = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+\/?/i
  )
  return m ? m[0] : ""
}

function extractGithub(text: string): string {
  const m = text.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-]+\/?/i
  )
  return m ? m[0] : ""
}

// ── Work entry parser ───────────────────────────────────────────────

function parseWorkEntries(lines: string[]): WorkEntry[] {
  const entries: WorkEntry[] = []
  let current: Partial<WorkEntry> | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const dateRange = trimmed.match(DATE_RANGE_RE)

    // A line with a date range that is NOT a bullet is likely a new entry header
    if (dateRange && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      if (current && current.title) {
        entries.push(finalizeWork(current))
      }
      const { startDate, endDate } = extractDateRange(trimmed)
      // Try to split "Title at Company" or "Title, Company" or "Title | Company"
      const withoutDate = trimmed
        .replace(DATE_RANGE_RE, "")
        .replace(/[|\u2013\u2014–—]/g, ",")
        .trim()
      const parts = withoutDate.split(/\s*[,@]\s*/).filter(Boolean)
      current = {
        title: parts[0] || trimmed,
        company: parts[1] || "",
        location: parts[2] || "",
        startDate,
        endDate,
        bullets: [],
      }
    } else if (
      current &&
      (trimmed.startsWith("-") || trimmed.startsWith("*") || trimmed.startsWith("\u2022"))
    ) {
      current.bullets = current.bullets || []
      current.bullets.push(trimmed.replace(/^[-*\u2022]\s*/, ""))
    } else if (!current && !trimmed.startsWith("-")) {
      // Could be the first line of a new entry without an explicit date
      current = {
        title: trimmed,
        company: "",
        location: "",
        startDate: "",
        endDate: "",
        bullets: [],
      }
    } else if (current && !current.company && !dateRange) {
      // Might be a company line following a title line
      current.company = trimmed
    }
  }

  if (current && current.title) {
    entries.push(finalizeWork(current))
  }

  return entries
}

function finalizeWork(w: Partial<WorkEntry>): WorkEntry {
  return {
    title: w.title || "",
    company: w.company || "",
    location: w.location || "",
    startDate: w.startDate || "",
    endDate: w.endDate || "",
    bullets: w.bullets || [],
  }
}

// ── Education parser ────────────────────────────────────────────────

function parseEducation(lines: string[]): EduEntry[] {
  const entries: EduEntry[] = []
  let current: Partial<EduEntry> | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const hasYear = YEAR_RE.test(trimmed)

    if (!trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      if (current && current.institution) {
        entries.push(finalizeEdu(current))
      }
      const yearMatch = trimmed.match(YEAR_RE)
      current = {
        institution: trimmed.replace(YEAR_RE, "").replace(/[,|]/g, " ").trim(),
        degree: "",
        location: "",
        endDate: yearMatch ? yearMatch[0] : "",
      }
    } else if (current && !current.degree) {
      current.degree = trimmed.replace(/^[-*\u2022]\s*/, "")
      if (!current.endDate && hasYear) {
        const ym = trimmed.match(YEAR_RE)
        if (ym) current.endDate = ym[0]
      }
    }
  }

  if (current && current.institution) {
    entries.push(finalizeEdu(current))
  }

  return entries
}

function finalizeEdu(e: Partial<EduEntry>): EduEntry {
  return {
    institution: e.institution || "",
    location: e.location || "",
    degree: e.degree || "",
    endDate: e.endDate || "",
  }
}

// ── Skills parser ───────────────────────────────────────────────────

function parseSkills(lines: string[]): SkillCategory[] {
  const categories: SkillCategory[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Pattern: "Category: item1, item2, item3" or "**Category**: ..."
    const catMatch = trimmed.match(
      /^(?:\*\*)?([^:*]+)(?:\*\*)?:\s*(.+)/
    )
    if (catMatch) {
      categories.push({
        category: catMatch[1].trim(),
        items: catMatch[2].split(/[,;]/).map((s) => s.trim()).filter(Boolean),
      })
    } else {
      // Flat list: treat as a single "General" category
      const items = trimmed
        .replace(/^[-*\u2022]\s*/, "")
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (items.length > 0) {
        const existing = categories.find((c) => c.category === "General")
        if (existing) {
          existing.items.push(...items)
        } else {
          categories.push({ category: "General", items })
        }
      }
    }
  }

  return categories
}

// ── Achievements parser ─────────────────────────────────────────────

function parseAchievements(lines: string[]): string[] {
  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^[-*\u2022]\s*/, ""))
}

// ── Main structurer ─────────────────────────────────────────────────

/**
 * Best-effort heuristic parser that splits raw text into CVData sections.
 * Claude API will refine later.
 */
export function structureCv(rawText: string): CVData {
  const lines = rawText.split("\n")

  // The first non-empty line is likely the name
  const nameCandidate =
    lines.find((l) => l.trim().length > 0 && !l.trim().includes("@"))?.trim() ||
    ""

  const email = extractEmail(rawText)
  const phone = extractPhone(rawText)
  const linkedin = extractLinkedin(rawText)
  const github = extractGithub(rawText)

  // Split into sections
  const sections: Record<string, string[]> = {}
  let currentSection = "header"
  sections[currentSection] = []

  for (const line of lines) {
    const detected = detectSection(line)
    if (detected) {
      currentSection = detected
      sections[currentSection] = sections[currentSection] || []
    } else {
      sections[currentSection] = sections[currentSection] || []
      sections[currentSection].push(line)
    }
  }

  return {
    fullName: nameCandidate,
    location: "",
    email,
    phone: phone || undefined,
    linkedin: linkedin || undefined,
    github: github || undefined,
    summary: (sections.summary || []).join(" ").trim(),
    experience: parseWorkEntries(sections.experience || []),
    education: parseEducation(sections.education || []),
    projects: [],
    certifications: [],
    skills: parseSkills(sections.skills || []),
    achievements:
      sections.achievements && sections.achievements.length > 0
        ? parseAchievements(sections.achievements)
        : undefined,
  }
}
