import type { CVData } from "@/types"

/**
 * Escape special Typst characters in user-provided text.
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
 * Render a complete .typ file using @preview/basic-resume:0.2.9.
 */
export function renderBasicResume(
  cv: CVData,
  keywords?: string[]
): string {
  const lines: string[] = []

  // Package import
  lines.push(
    `#import "@preview/basic-resume:0.2.9": resume, work, project, edu, certificates`
  )
  lines.push("")

  // Build show rule arguments
  const showArgs: string[] = []
  if (cv.fullName) showArgs.push(`  author: "${esc(cv.fullName)}",`)
  if (cv.location) showArgs.push(`  location: "${esc(cv.location)}",`)
  if (cv.email) showArgs.push(`  email: "${esc(cv.email)}",`)
  if (cv.github) showArgs.push(`  github: "${esc(cv.github)}",`)
  if (cv.linkedin) showArgs.push(`  linkedin: "${esc(cv.linkedin)}",`)
  if (cv.phone) showArgs.push(`  phone: "${esc(cv.phone)}",`)

  lines.push(`#show: resume.with(`)
  lines.push(showArgs.join("\n"))
  lines.push(`)`)
  lines.push("")

  // Professional Summary
  if (cv.summary) {
    lines.push(`== Professional Summary`)
    lines.push("")
    // If we have keywords, weave them in as a parenthetical
    if (keywords && keywords.length > 0) {
      lines.push(esc(cv.summary))
    } else {
      lines.push(esc(cv.summary))
    }
    lines.push("")
  }

  // Work Experience
  if (cv.experience.length > 0) {
    lines.push(`== Work Experience`)
    lines.push("")
    for (const w of cv.experience) {
      const workArgs: string[] = []
      if (w.title) workArgs.push(`  title: "${esc(w.title)}",`)
      if (w.company) workArgs.push(`  company: "${esc(w.company)}",`)
      if (w.location) workArgs.push(`  location: "${esc(w.location)}",`)
      if (w.startDate || w.endDate) {
        const dates = [w.startDate, w.endDate].filter(Boolean).join(" - ")
        workArgs.push(`  dates: "${esc(dates)}",`)
      }

      lines.push(`#work(`)
      lines.push(workArgs.join("\n"))
      lines.push(`)`)

      for (const bullet of w.bullets) {
        lines.push(`- ${esc(bullet)}`)
      }
      lines.push("")
    }
  }

  // Projects
  if (cv.projects.length > 0) {
    lines.push(`== Projects`)
    lines.push("")
    for (const p of cv.projects) {
      const projArgs: string[] = []
      if (p.name) projArgs.push(`  name: "${esc(p.name)}",`)
      if (p.role) projArgs.push(`  role: "${esc(p.role)}",`)
      if (p.url) projArgs.push(`  url: "${esc(p.url)}",`)
      if (p.startDate || p.endDate) {
        const dates = [p.startDate, p.endDate].filter(Boolean).join(" - ")
        projArgs.push(`  dates: "${esc(dates)}",`)
      }

      lines.push(`#project(`)
      lines.push(projArgs.join("\n"))
      lines.push(`)`)

      for (const bullet of p.bullets) {
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
        eduArgs.push(`  institution: "${esc(e.institution)}",`)
      if (e.location) eduArgs.push(`  location: "${esc(e.location)}",`)
      if (e.degree) eduArgs.push(`  degree: "${esc(e.degree)}",`)
      if (e.endDate) eduArgs.push(`  dates: "${esc(e.endDate)}",`)

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
      if (c.name) certArgs.push(`  name: "${esc(c.name)}",`)
      if (c.issuer) certArgs.push(`  issuer: "${esc(c.issuer)}",`)

      lines.push(`#certificates(`)
      lines.push(certArgs.join("\n"))
      lines.push(`)`)
      lines.push("")
    }
  }

  // Skills
  if (cv.skills.length > 0) {
    lines.push(`== Skills`)
    lines.push("")
    for (const s of cv.skills) {
      lines.push(
        `*${esc(s.category)}:* ${s.items.map((i) => esc(i)).join(", ")}`
      )
      lines.push("")
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
