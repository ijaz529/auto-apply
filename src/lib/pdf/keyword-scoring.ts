// Keyword-based prioritization for CV generation. Pure functions, easy to unit-test.
// Used by templates to surface the most JD-relevant bullets / projects first.

/**
 * Count how many *distinct* keywords appear in the given text.
 * Case-insensitive; multi-word keywords are matched as substrings.
 *
 * Example: text="Built Postgres pipelines with Kafka", keywords=["postgres", "kafka", "go"]
 *   → 2  (postgres + kafka, go absent)
 *
 * Note: this is intentionally a coarse signal. We don't try to be clever about word
 * boundaries because keywords like "C++" or ".NET" would break anchored regex, and
 * over-tuning the scorer trades clarity for marginal precision. Coarse-but-stable
 * is good enough for sort tie-breaking.
 */
export function keywordMatchCount(text: string, keywords: string[]): number {
  if (!text || keywords.length === 0) return 0
  const lower = text.toLowerCase()
  let hits = 0
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase()
    if (k && lower.includes(k)) hits++
  }
  return hits
}

/**
 * Stable sort of items by keyword match count, descending.
 * Ties preserve original order (so bullets stay in their CV-given sequence
 * unless a clear winner emerges). Returns a new array; does not mutate input.
 *
 * If keywords is empty/undefined, returns the input array unchanged — no
 * cost, and resumes generated without a JD context render in original order.
 */
export function prioritizeByKeywords<T>(
  items: T[],
  getText: (item: T) => string,
  keywords: string[] | undefined
): T[] {
  if (!keywords || keywords.length === 0) return items
  return items
    .map((item, originalIndex) => ({
      item,
      originalIndex,
      score: keywordMatchCount(getText(item), keywords),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      return a.originalIndex - b.originalIndex
    })
    .map((entry) => entry.item)
}
