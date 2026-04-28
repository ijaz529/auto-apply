/**
 * Round-trip the scanner UI's textarea config (one company per line) to/from
 * the structured ScanEntry[] the API + library expect.
 *
 * Format per line: `Name | URL`. The pipe is the delimiter; surrounding
 * whitespace is trimmed. Lines without a pipe are accepted as bare names
 * (no URL — the entry persists but won't be auto-detected as ATS, so the
 * scanner skips it at run time). Blank lines are dropped.
 *
 * LinkedIn-shaped entries (Phase 3, kind: "linkedin") aren't representable in
 * this textarea — `formatCompaniesText` skips them silently and notes their
 * count separately so the UI can warn the user before a save would clobber
 * them. Once a real LinkedIn UI lands (B10), this stays the ATS-only path.
 */
import type { CompanyConfig, ScanEntry } from "./index"

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
 * Render a ScanEntry[] back to the textarea format. Only ATS entries
 * (CompanyConfig) appear in the text; LinkedIn entries are reported via
 * `linkedinHidden` so the caller can warn before a destructive save.
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
