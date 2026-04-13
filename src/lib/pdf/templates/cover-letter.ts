/**
 * Standalone Typst cover letter template.
 * Produces a clean, professional one-page cover letter PDF.
 */
export function renderCoverLetter(params: {
  fullName: string
  location: string
  email: string
  phone: string
  date: string
  company: string
  role: string
  body: string
}): string {
  const { fullName, location, email, phone, date, company, role, body } = params

  // Escape special Typst characters in user content
  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/#/g, "\\#")
      .replace(/\$/g, "\\$")
      .replace(/@/g, "\\@")
      .replace(/</g, "\\<")
      .replace(/>/g, "\\>")

  // Split body into paragraphs, preserving intentional paragraph breaks
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const bodyTypst = paragraphs.map((p) => esc(p)).join("\n\n")

  return `
#set page(
  paper: "a4",
  margin: (top: 2cm, bottom: 2cm, left: 2.5cm, right: 2.5cm),
)

#set text(
  font: "New Computer Modern",
  size: 11pt,
  lang: "en",
)

#set par(
  justify: true,
  leading: 0.65em,
)

// Header: Name and contact info
#align(center)[
  #text(size: 18pt, weight: "bold")[${esc(fullName)}]
  #v(4pt)
  #text(size: 9.5pt, fill: rgb("#555555"))[
    ${esc(location)}${phone ? ` #sym.dot.c ${esc(phone)}` : ""} #sym.dot.c ${esc(email)}
  ]
]

#v(16pt)
#line(length: 100%, stroke: 0.5pt + rgb("#cccccc"))
#v(12pt)

// Date
#align(right)[
  #text(size: 10pt, fill: rgb("#555555"))[${esc(date)}]
]

#v(8pt)

// Company address
#text(size: 10.5pt)[${esc(company)}]

#v(16pt)

// Subject line
#text(weight: "bold", size: 10.5pt)[Re: ${esc(role)}]

#v(12pt)

// Body
${bodyTypst}

#v(20pt)

// Closing
Best regards,

#v(8pt)
#text(weight: "bold")[${esc(fullName)}]
`.trim()
}
