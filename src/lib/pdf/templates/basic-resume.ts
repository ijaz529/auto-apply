import type { CVData } from "@/types"
import { prioritizeByKeywords } from "../keyword-scoring"

/**
 * Escape special Typst characters in user-provided text.
 */
/**
 * Escape special Typst characters in body text (outside strings).
 */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\//g, "\\/")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/@/g, "\\@")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
}

/**
 * Escape for inside Typst string parameters (quotes only).
 * Don't escape @, #, etc — they're literal inside strings.
 */
function escStr(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
}

/**
 * Render a complete .typ file using @preview/basic-resume:0.2.9.
 */
export function renderBasicResume(
  cvInput: CVData,
  keywords?: string[]
): string {
  // Normalize: arrays can be missing/null in stored JSON despite the type
  // saying they're required. Default them so `.length` and iteration are safe.
  const cv: CVData = {
    ...cvInput,
    experience: cvInput.experience ?? [],
    education: cvInput.education ?? [],
    projects: cvInput.projects ?? [],
    certifications: cvInput.certifications ?? [],
    skills: cvInput.skills ?? [],
    achievements: cvInput.achievements ?? [],
  }

  const lines: string[] = []

  // Package import
  lines.push(
    `#import "@preview/basic-resume:0.2.9": resume, work, project, edu, certificates`
  )
  lines.push("")

  // Build show rule arguments
  const showArgs: string[] = []
  if (cv.fullName) showArgs.push(`  author: "${escStr(cv.fullName)}",`)
  if (cv.location) showArgs.push(`  location: "${escStr(cv.location)}",`)
  if (cv.email) showArgs.push(`  email: "${escStr(cv.email)}",`)
  if (cv.github) showArgs.push(`  github: "${escStr(cv.github)}",`)
  if (cv.linkedin) showArgs.push(`  linkedin: "${escStr(cv.linkedin)}",`)
  if (cv.phone) showArgs.push(`  phone: "${escStr(cv.phone)}",`)

  lines.push(`#show: resume.with(`)
  lines.push(showArgs.join("\n"))
  lines.push(`)`)
  lines.push("")

  // Professional Summary
  if (cv.summary) {
    lines.push(`== Professional Summary`)
    lines.push("")
    lines.push(esc(cv.summary))
    if (keywords && keywords.length > 0) {
      // Append a keyword-rich line to boost ATS matching
      const topKw = keywords.slice(0, 8).map((k) => esc(k)).join(", ")
      lines.push("")
      lines.push(`Core expertise: ${topKw}.`)
    }
    lines.push("")
  }

  // Work Experience
  if (cv.experience.length > 0) {
    lines.push(`== Work Experience`)
    lines.push("")
    for (const w of cv.experience) {
      const workArgs: string[] = []
      if (w.title) workArgs.push(`  title: "${escStr(w.title)}",`)
      if (w.company) workArgs.push(`  company: "${escStr(w.company)}",`)
      if (w.location) workArgs.push(`  location: "${escStr(w.location)}",`)
      if (w.startDate || w.endDate) {
        const dates = [w.startDate, w.endDate].filter(Boolean).join(" - ")
        workArgs.push(`  dates: "${escStr(dates)}",`)
      }

      lines.push(`#work(`)
      lines.push(workArgs.join("\n"))
      lines.push(`)`)

      // Reorder bullets within this work block so the JD-relevant ones surface first.
      const orderedBullets = prioritizeByKeywords(
        w.bullets ?? [],
        (b) => b,
        keywords
      )
      for (const bullet of orderedBullets) {
        lines.push(`- ${esc(bullet)}`)
      }
      lines.push("")
    }
  }

  // Projects (entire projects reordered by JD relevance — heading + bullets together).
  const orderedProjects = prioritizeByKeywords(
    cv.projects,
    (p) => `${p.name ?? ""} ${p.role ?? ""} ${(p.bullets ?? []).join(" ")}`,
    keywords
  )

  if (orderedProjects.length > 0) {
    lines.push(`== Projects`)
    lines.push("")
    for (const p of orderedProjects) {
      const projArgs: string[] = []
      if (p.name) projArgs.push(`  name: "${escStr(p.name)}",`)
      if (p.role) projArgs.push(`  role: "${escStr(p.role)}",`)
      if (p.url) projArgs.push(`  url: "${escStr(p.url)}",`)
      if (p.startDate || p.endDate) {
        const dates = [p.startDate, p.endDate].filter(Boolean).join(" - ")
        projArgs.push(`  dates: "${escStr(dates)}",`)
      }

      lines.push(`#project(`)
      lines.push(projArgs.join("\n"))
      lines.push(`)`)

      const orderedBullets = prioritizeByKeywords(
        p.bullets ?? [],
        (b) => b,
        keywords
      )
      for (const bullet of orderedBullets) {
        lines.push(`- ${esc(bullet)}`)
      }
      lines.push("")
    }
  }

  // Education
  if (cv.education.length > 0) {
    lines.push(`== Education`)
    lines.push("")
    for (const e of cv.education) {
      const eduArgs: string[] = []
      if (e.institution)
        eduArgs.push(`  institution: "${escStr(e.institution)}",`)
      if (e.location) eduArgs.push(`  location: "${escStr(e.location)}",`)
      if (e.degree) eduArgs.push(`  degree: "${escStr(e.degree)}",`)
      if (e.endDate) eduArgs.push(`  dates: "${escStr(e.endDate)}",`)

      lines.push(`#edu(`)
      lines.push(eduArgs.join("\n"))
      lines.push(`)`)
      lines.push("")
    }
  }

  // Certifications
  if (cv.certifications.length > 0) {
    lines.push(`== Certifications`)
    lines.push("")
    for (const c of cv.certifications) {
      const certArgs: string[] = []
      if (c.name) certArgs.push(`  name: "${escStr(c.name)}",`)
      if (c.issuer) certArgs.push(`  issuer: "${escStr(c.issuer)}",`)

      lines.push(`#certificates(`)
      lines.push(certArgs.join("\n"))
      lines.push(`)`)
      lines.push("")
    }
  }

  // Skills
  if (cv.skills.length > 0 || (keywords && keywords.length > 0)) {
    lines.push(`== Skills`)
    lines.push("")
    for (const s of cv.skills) {
      lines.push(
        `*${esc(s.category)}:* ${(s.items ?? []).map((i) => esc(i)).join(", ")}`
      )
      lines.push("")
    }
    // Add job-specific keywords as a separate row, deduped against existing skills
    if (keywords && keywords.length > 0) {
      const existingLower = new Set(
        cv.skills.flatMap((s) => (s.items ?? []).map((i) => i.toLowerCase()))
      )
      const unique = keywords.filter((k) => !existingLower.has(k.toLowerCase()))
      if (unique.length > 0) {
        lines.push(
          `*Key Competencies:* ${unique.slice(0, 12).map((k) => esc(k)).join(", ")}`
        )
        lines.push("")
      }
    }
  }

  // Achievements
  if (cv.achievements && cv.achievements.length > 0) {
    lines.push(`== Achievements`)
    lines.push("")
    for (const a of cv.achievements) {
      lines.push(`- ${esc(a)}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}
