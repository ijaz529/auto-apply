/**
 * Email classification: keyword-based parser that labels a Gmail message as
 * "confirmation", "interview", "rejection", "offer", or "unknown".
 *
 * The actual Gmail OAuth + REST polling lives in:
 *   - lib/email/google-tokens.ts   (token refresh, persisted on Account)
 *   - lib/email/gmail-client.ts    (raw fetch wrapper for messages.list/get)
 *   - lib/email/sync.ts            (orchestration: list → classify → link → persist)
 */

export interface EmailClassification {
  type: "confirmation" | "interview" | "rejection" | "offer" | "unknown"
  confidence: number
  matchedKeywords: string[]
}

const KEYWORD_RULES: {
  type: EmailClassification["type"]
  keywords: string[]
  weight: number
}[] = [
  {
    type: "offer",
    keywords: [
      "offer letter",
      "congratulations",
      "pleased to offer",
      "compensation package",
      "we are excited to extend",
      "formal offer",
      "start date",
      "sign the offer",
    ],
    weight: 0.9,
  },
  {
    type: "interview",
    keywords: [
      "interview",
      "schedule a call",
      "next steps",
      "meet the team",
      "technical assessment",
      "phone screen",
      "video call",
      "onsite",
      "panel interview",
      "hiring manager",
      "calendly",
      "book a time",
    ],
    weight: 0.85,
  },
  {
    type: "rejection",
    keywords: [
      "unfortunately",
      "not moving forward",
      "other candidates",
      "decided not to",
      "we regret",
      "not a fit",
      "position has been filled",
      "we will not be proceeding",
      "after careful consideration",
      "we have decided to move forward with",
    ],
    weight: 0.85,
  },
  {
    type: "confirmation",
    keywords: [
      "application received",
      "thank you for applying",
      "we have received",
      "your application has been submitted",
      "application confirmation",
      "successfully submitted",
      "we appreciate your interest",
      "application for the position",
    ],
    weight: 0.8,
  },
]

/**
 * Classify an email based on subject, sender, and body preview using keyword
 * matching. Returns the most likely classification type, a confidence score
 * (0–1), and the keywords that matched.
 */
export function classifyEmail(
  subject: string,
  from: string,
  bodyPreview: string
): EmailClassification {
  const text = `${subject} ${from} ${bodyPreview}`.toLowerCase()

  let bestType: EmailClassification["type"] = "unknown"
  let bestScore = 0
  let bestKeywords: string[] = []

  for (const rule of KEYWORD_RULES) {
    const matched: string[] = []
    for (const keyword of rule.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matched.push(keyword)
      }
    }

    if (matched.length > 0) {
      // Score increases with more keyword matches, weighted by rule importance.
      const matchRatio = matched.length / rule.keywords.length
      const score = rule.weight * (0.5 + 0.5 * matchRatio)

      if (score > bestScore) {
        bestScore = score
        bestType = rule.type
        bestKeywords = matched
      }
    }
  }

  return {
    type: bestType,
    confidence: Math.round(bestScore * 100) / 100,
    matchedKeywords: bestKeywords,
  }
}
