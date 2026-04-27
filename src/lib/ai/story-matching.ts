/**
 * Story-bank matching: rank a user's STAR+R stories by relevance to a job's
 * extracted keywords. Pure functions, no LLM calls — used to pre-filter the
 * story bank before sending to Claude so the prompt stays small even for
 * users with 50+ stories.
 *
 * Matching is a coarse keyword-density signal across the story's text, with
 * a small bonus when the story's category aligns with the JD archetype. The
 * goal is "good enough" pre-filter, not perfect ranking — the LLM still does
 * the deep reasoning over the chosen stories.
 */

export interface StoryLike {
  id: string
  category: string
  title: string
  situation: string
  task: string
  action: string
  result: string
  reflection: string | null
}

export interface RankedStory<T extends StoryLike = StoryLike> {
  story: T
  score: number
  matchedKeywords: string[]
}

const CATEGORY_BOOSTS_BY_ARCHETYPE: Record<string, string[]> = {
  // Loose mapping — when a story's category is in the list for the detected
  // archetype, give it a small bump. Anything not listed is unaffected.
  "Backend / Infrastructure": ["Technical", "Problem Solving"],
  "Frontend / UI": ["Technical", "Customer Focus"],
  "Full Stack": ["Technical", "Problem Solving"],
  "Data / ML Engineer": ["Technical", "Problem Solving"],
  "AI Platform / LLMOps": ["Technical", "Innovation"],
  "Agentic / Automation": ["Technical", "Innovation"],
  "DevOps / SRE / Platform": ["Technical", "Problem Solving"],
  "Product Manager": [
    "Leadership",
    "Communication",
    "Customer Focus",
    "Conflict Resolution",
  ],
  "Solutions Architect": ["Communication", "Problem Solving", "Leadership"],
  "Forward Deployed / Field Engineer": [
    "Customer Focus",
    "Communication",
    "Adaptability",
  ],
  "AI Transformation": ["Leadership", "Communication", "Innovation"],
  "Mobile Engineer": ["Technical", "Customer Focus"],
  "Security Engineer": ["Technical", "Problem Solving"],
  "Data Analyst / BI": ["Technical", "Communication"],
}

/**
 * Concatenate the searchable parts of a story into one lowercased blob for
 * keyword scanning.
 */
function storyText(s: StoryLike): string {
  return `${s.title} ${s.category} ${s.situation} ${s.task} ${s.action} ${s.result} ${s.reflection ?? ""}`.toLowerCase()
}

/**
 * Count distinct keyword hits in the story text. Multi-word keywords match as
 * substrings (case-insensitive). Returns the matched keyword list as well so
 * callers can show "matched: kafka, payments" hints in the UI.
 */
export function scoreStory(
  story: StoryLike,
  keywords: string[]
): { score: number; matchedKeywords: string[] } {
  const text = storyText(story)
  const matched: string[] = []
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase()
    if (k && text.includes(k)) matched.push(kw)
  }
  return { score: matched.length, matchedKeywords: matched }
}

/**
 * Rank stories by JD keyword density, with an optional category bonus driven
 * by the detected archetype. Stable on ties (preserves input order). Does not
 * mutate input.
 */
export function rankStoriesByRelevance<T extends StoryLike>(
  stories: T[],
  keywords: string[],
  archetype?: string | null
): RankedStory<T>[] {
  if (stories.length === 0) return []

  const archetypeBoosts =
    (archetype && CATEGORY_BOOSTS_BY_ARCHETYPE[archetype]) || []

  return stories
    .map((story, originalIndex) => {
      const { score, matchedKeywords } = scoreStory(story, keywords)
      const archetypeBonus = archetypeBoosts.includes(story.category) ? 0.5 : 0
      return {
        story,
        score: score + archetypeBonus,
        matchedKeywords,
        originalIndex,
      }
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      return a.originalIndex - b.originalIndex
    })
    .map(({ story, score, matchedKeywords }) => ({ story, score, matchedKeywords }))
}

/**
 * Convenience: take the top N most relevant stories. Returns the original
 * StoryLike values (without the score / matchedKeywords envelope) so callers
 * that just need the trimmed list can drop straight in.
 */
export function pickTopStories<T extends StoryLike>(
  stories: T[],
  keywords: string[],
  n: number,
  archetype?: string | null
): T[] {
  return rankStoriesByRelevance(stories, keywords, archetype)
    .slice(0, n)
    .map((r) => r.story)
}
