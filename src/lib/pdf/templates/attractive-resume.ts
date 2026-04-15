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
 * Render a standalone two-column .typ file that mimics the attractive-typst-resume
 * style using only built-in Typst (no external imports needed).
 *
 * Features: accent-colored sidebar, clean typography, two-column layout.
 */
export function renderAttractiveResume(
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

  const accent = "#4273B0"

  const lines: string[] = []

  // Page and font setup
  lines.push(`#set page(margin: (left: 0pt, right: 0.6in, top: 0.5in, bottom: 0.5in))`)
  lines.push(`#set text(font: "Source Sans Pro", size: 10pt, fill: luma(40))`)
  lines.push(`#set par(leading: 0.6em)`)
  lines.push("")

  // Helper functions
  lines.push(`// Accent color`)
  lines.push(`#let accent = rgb("${accent}")`)
  lines.push("")

  lines.push(`// Section heading`)
  lines.push(`#let section(title) = {`)
  lines.push(`  v(0.4em)`)
  lines.push(`  text(size: 12pt, weight: "bold", fill: accent)[#title]`)
  lines.push(`  v(-0.3em)`)
  lines.push(`  line(length: 100%, stroke: 0.5pt + accent)`)
  lines.push(`  v(0.2em)`)
  lines.push(`}`)
  lines.push("")

  lines.push(`#let entry(title, subtitle, dates, body) = {`)
  lines.push(`  grid(`)
  lines.push(`    columns: (1fr, auto),`)
  lines.push(`    text(weight: "bold", size: 10pt)[#title],`)
  lines.push(`    text(size: 9pt, fill: luma(100))[#dates],`)
  lines.push(`  )`)
  lines.push(`  if subtitle != "" {`)
  lines.push(`    text(size: 9pt, style: "italic", fill: luma(80))[#subtitle]`)
  lines.push(`  }`)
  lines.push(`  v(0.15em)`)
  lines.push(`  body`)
  lines.push(`  v(0.3em)`)
  lines.push(`}`)
  lines.push("")

  // Build sidebar content
  const sidebarParts: string[] = []

  // Contact info in sidebar
  sidebarParts.push(`    // Contact`)
  sidebarParts.push(`    text(size: 11pt, weight: "bold", fill: white)[Contact]`)
  sidebarParts.push(`    v(0.3em)`)

  if (cv.email) {
    sidebarParts.push(`    text(size: 8.5pt, fill: rgb("#dddddd"))[${esc(cv.email)}]`)
    sidebarParts.push(`    v(0.15em)`)
  }
  if (cv.phone) {
    sidebarParts.push(`    text(size: 8.5pt, fill: rgb("#dddddd"))[${esc(cv.phone)}]`)
    sidebarParts.push(`    v(0.15em)`)
  }
  if (cv.location) {
    sidebarParts.push(`    text(size: 8.5pt, fill: rgb("#dddddd"))[${esc(cv.location)}]`)
    sidebarParts.push(`    v(0.15em)`)
  }
  if (cv.linkedin) {
    sidebarParts.push(`    text(size: 8.5pt, fill: rgb("#dddddd"))[${esc(cv.linkedin)}]`)
    sidebarParts.push(`    v(0.15em)`)
  }
  if (cv.github) {
    sidebarParts.push(`    text(size: 8.5pt, fill: rgb("#dddddd"))[${esc(cv.github)}]`)
    sidebarParts.push(`    v(0.15em)`)
  }

  // Skills in sidebar
  if (cv.skills.length > 0) {
    sidebarParts.push(`    v(0.6em)`)
    sidebarParts.push(`    text(size: 11pt, weight: "bold", fill: white)[Skills]`)
    sidebarParts.push(`    v(0.3em)`)
    for (const s of cv.skills) {
      sidebarParts.push(
        `    text(size: 8.5pt, weight: "bold", fill: rgb("#dddddd"))[${esc(s.category)}]`
      )
      sidebarParts.push(`    v(0.1em)`)
      sidebarParts.push(
        `    text(size: 8pt, fill: rgb("#cccccc"))[${(s.items ?? []).map((i) => esc(i)).join(", ")}]`
      )
      sidebarParts.push(`    v(0.2em)`)
    }
  }

  // Job-specific keywords in sidebar
  if (keywords && keywords.length > 0) {
    const existingLower = new Set(
      cv.skills.flatMap((s) => (s.items ?? []).map((i) => i.toLowerCase()))
    )
    const unique = keywords.filter((k) => !existingLower.has(k.toLowerCase()))
    if (unique.length > 0) {
      sidebarParts.push(`    v(0.6em)`)
      sidebarParts.push(`    text(size: 11pt, weight: "bold", fill: white)[Key Competencies]`)
      sidebarParts.push(`    v(0.3em)`)
      sidebarParts.push(
        `    text(size: 8pt, fill: rgb("#cccccc"))[${unique.slice(0, 12).map((k) => esc(k)).join(", ")}]`
      )
    }
  }

  // Certifications in sidebar
  if (cv.certifications.length > 0) {
    sidebarParts.push(`    v(0.6em)`)
    sidebarParts.push(
      `    text(size: 11pt, weight: "bold", fill: white)[Certifications]`
    )
    sidebarParts.push(`    v(0.3em)`)
    for (const c of cv.certifications) {
      sidebarParts.push(
        `    text(size: 8.5pt, fill: rgb("#dddddd"))[${esc(c.name)}]`
      )
      sidebarParts.push(
        `    text(size: 8pt, fill: rgb("#aaaaaa"))[${esc(c.issuer)}]`
      )
      sidebarParts.push(`    v(0.15em)`)
    }
  }

  // Education in sidebar
  if (cv.education.length > 0) {
    sidebarParts.push(`    v(0.6em)`)
    sidebarParts.push(
      `    text(size: 11pt, weight: "bold", fill: white)[Education]`
    )
    sidebarParts.push(`    v(0.3em)`)
    for (const e of cv.education) {
      sidebarParts.push(
        `    text(size: 8.5pt, weight: "bold", fill: rgb("#dddddd"))[${esc(e.institution)}]`
      )
      if (e.degree) {
        sidebarParts.push(
          `    text(size: 8pt, fill: rgb("#cccccc"))[${esc(e.degree)}]`
        )
      }
      if (e.endDate) {
        sidebarParts.push(
          `    text(size: 8pt, fill: rgb("#aaaaaa"))[${esc(e.endDate)}]`
        )
      }
      sidebarParts.push(`    v(0.2em)`)
    }
  }

  // Layout: sidebar + main content
  lines.push(`#grid(`)
  lines.push(`  columns: (2in, 1fr),`)
  lines.push(`  // Sidebar`)
  lines.push(`  rect(`)
  lines.push(`    width: 100%,`)
  lines.push(`    height: 100%,`)
  lines.push(`    fill: rgb("2b2b3d"),`)
  lines.push(`    inset: (x: 0.35in, y: 0.5in),`)
  lines.push(`  )[`)
  lines.push(`    // Name`)
  lines.push(
    `    text(size: 16pt, weight: "bold", fill: white)[${esc(cv.fullName)}]`
  )
  lines.push(`    v(0.8em)`)
  lines.push(sidebarParts.join("\n"))
  lines.push(`  ],`)
  lines.push(`  // Main content`)
  lines.push(`  pad(left: 0.4in)[`)

  // Summary
  if (cv.summary) {
    lines.push(`    #section("Professional Summary")`)
    lines.push(`    #text(size: 9.5pt)[${esc(cv.summary)}]`)
    if (keywords && keywords.length > 0) {
      const topKw = keywords.slice(0, 8).map((k) => esc(k)).join(", ")
      lines.push(`    #v(0.2em)`)
      lines.push(`    #text(size: 9pt, fill: luma(60))[Core expertise: ${topKw}.]`)
    }
    lines.push("")
  }

  // Experience
  if (cv.experience.length > 0) {
    lines.push(`    #section("Work Experience")`)
    for (const w of cv.experience) {
      const dates = [w.startDate, w.endDate].filter(Boolean).join(" - ")
      const subtitle = [w.company, w.location].filter(Boolean).join(" | ")
      lines.push(`    #entry(`)
      lines.push(`      "${esc(w.title)}",`)
      lines.push(`      "${esc(subtitle)}",`)
      lines.push(`      "${esc(dates)}",`)
      lines.push(`    )[`)
      for (const bullet of w.bullets ?? []) {
        lines.push(`      - ${esc(bullet)}`)
      }
      lines.push(`    ]`)
    }
    lines.push("")
  }

  // Projects
  if (cv.projects.length > 0) {
    lines.push(`    #section("Projects")`)
    for (const p of cv.projects) {
      const dates = [p.startDate, p.endDate].filter(Boolean).join(" - ")
      const subtitle = p.role || ""
      lines.push(`    #entry(`)
      lines.push(`      "${esc(p.name)}",`)
      lines.push(`      "${esc(subtitle)}",`)
      lines.push(`      "${esc(dates)}",`)
      lines.push(`    )[`)
      for (const bullet of p.bullets ?? []) {
        lines.push(`      - ${esc(bullet)}`)
      }
      lines.push(`    ]`)
    }
    lines.push("")
  }

  // Achievements
  if (cv.achievements && cv.achievements.length > 0) {
    lines.push(`    #section("Achievements")`)
    for (const a of cv.achievements) {
      lines.push(`    - ${esc(a)}`)
    }
    lines.push("")
  }

  lines.push(`  ],`)
  lines.push(`)`)

  return lines.join("\n")
}
