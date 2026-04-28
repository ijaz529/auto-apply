/**
 * Round-trip the scanner UI's textareas to/from the structured ScanEntry[]
 * the API + library expect. Two textareas are supported:
 *
 *   1. Companies (ATS) — `Name | URL` per line, parsed/formatted by
 *      `parseCompaniesText` / `formatCompaniesText`.
 *   2. LinkedIn searches — `keywords | location | time_range` per line,
 *      parsed/formatted by `parseLinkedInText` / `formatLinkedInText`.
 *
 * The pipe is the delimiter; whitespace around tokens is trimmed; blank
 * lines are dropped.
 */
import type { CompanyConfig, LinkedInScanEntry, ScanEntry } from "./index"

export interface FormatResult {
  text: string
  /** Count of LinkedIn entries that exist in storage but are NOT in the text. */
  linkedinHidden: number
}

/**
 * Parse the textarea content into ATS company entries. Each non-blank line is
 * `Name | URL` or just `Name`. Whitespace around the pipe and tokens is trimmed.
 */
export function parseCompaniesText(text: string): CompanyConfig[] {
  const out: CompanyConfig[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const pipe = line.indexOf("|")
    if (pipe < 0) {
      out.push({ name: line })
      continue
    }
    const name = line.slice(0, pipe).trim()
    const url = line.slice(pipe + 1).trim()
    if (!name) continue
    if (!url) {
      out.push({ name })
      continue
    }
    out.push({ name, careers_url: url })
  }
  return out
}

/**
 * Render a ScanEntry[] back to the ATS textarea format. Only CompanyConfig
 * entries appear in the text; LinkedIn entries are reported via
 * `linkedinHidden` so the caller can route them to the LinkedIn textarea.
 */
export function formatCompaniesText(entries: ScanEntry[]): FormatResult {
  const lines: string[] = []
  let linkedinHidden = 0
  for (const e of entries) {
    if (e.kind === "linkedin") {
      linkedinHidden++
      continue
    }
    if (!e.name) continue
    lines.push(e.careers_url ? `${e.name} | ${e.careers_url}` : e.name)
  }
  return { text: lines.join("\n"), linkedinHidden }
}

/**
 * Parse the LinkedIn searches textarea: each line is
 * `keywords | location | time_range`. `time_range` is optional (LinkedIn
 * `f_TPR` value, default `r604800` = past 7 days). Lines missing keywords or
 * location are dropped — both are required for a usable query. An optional
 * label can be supplied as a 4th column for human-readable identification in
 * results.
 */
export function parseLinkedInText(text: string): LinkedInScanEntry[] {
  const out: LinkedInScanEntry[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split("|").map((p) => p.trim())
    const keywords = parts[0] ?? ""
    const location = parts[1] ?? ""
    const time_range = parts[2] || undefined
    const label = parts[3] || undefined
    if (!keywords || !location) continue
    const entry: LinkedInScanEntry = { kind: "linkedin", keywords, location }
    if (time_range) entry.time_range = time_range
    if (label) entry.label = label
    out.push(entry)
  }
  return out
}

/**
 * Render LinkedIn entries from a ScanEntry[] back to the textarea format.
 * Non-LinkedIn entries are skipped silently.
 */
export function formatLinkedInText(entries: ScanEntry[]): string {
  const lines: string[] = []
  for (const e of entries) {
    if (e.kind !== "linkedin") continue
    const cols = [e.keywords, e.location]
    if (e.time_range) cols.push(e.time_range)
    if (e.label) {
      // Pad to position 4 with a placeholder time_range when label set but
      // time_range absent, so columns stay aligned.
      if (!e.time_range) cols.push("")
      cols.push(e.label)
    }
    lines.push(cols.join(" | "))
  }
  return lines.join("\n")
}
