/**
 * Gmail API integration service.
 *
 * This is a placeholder implementation. Full Gmail OAuth requires:
 * 1. Google Cloud Console project with Gmail API enabled
 * 2. OAuth 2.0 credentials (client ID + secret)
 * 3. Consent screen configuration
 *
 * The classifyEmail function works immediately using keyword matching.
 * connectGmail and fetchNewEmails are stubs that document the integration path.
 */

export interface EmailClassification {
  type: "confirmation" | "interview" | "rejection" | "offer" | "unknown"
  confidence: number
  matchedKeywords: string[]
}

export interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  bodyPreview: string
  receivedAt: Date
}

export interface GmailTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
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
 * Classify an email based on subject, sender, and body preview using keyword matching.
 *
 * Returns the most likely classification type, a confidence score (0-1),
 * and the keywords that matched.
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
      // Score increases with more keyword matches, weighted by rule importance
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

/**
 * Store Gmail OAuth tokens for a user.
 *
 * In production, this would:
 * 1. Exchange the auth code for access + refresh tokens via Google OAuth
 * 2. Store the tokens encrypted in the database (Account model)
 * 3. Set up a watch on the user's inbox for push notifications
 *
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.
 */
export async function connectGmail(
  userId: string,
  authCode: string
): Promise<{ success: boolean; message: string }> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return {
      success: false,
      message:
        "Gmail integration requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables. " +
        "Set up a Google Cloud project with Gmail API enabled, create OAuth 2.0 credentials, " +
        "and add the client ID and secret to your .env file.",
    }
  }

  // In production implementation:
  // 1. Exchange authCode for tokens using googleapis
  //    const { tokens } = await oauth2Client.getToken(authCode)
  // 2. Store in Account model:
  //    await prisma.account.upsert({
  //      where: { provider_providerAccountId: { provider: "gmail", providerAccountId: userId } },
  //      create: { userId, type: "oauth", provider: "gmail", providerAccountId: userId,
  //                access_token: tokens.access_token, refresh_token: tokens.refresh_token,
  //                expires_at: Math.floor(tokens.expiry_date / 1000) },
  //      update: { access_token: tokens.access_token, refresh_token: tokens.refresh_token,
  //                expires_at: Math.floor(tokens.expiry_date / 1000) }
  //    })
  // 3. Set up Gmail push notifications:
  //    await gmail.users.watch({ userId: "me", requestBody: { topicName: PUBSUB_TOPIC } })

  void userId
  void authCode

  return {
    success: false,
    message:
      "Gmail OAuth flow is not yet implemented. " +
      "To enable: install googleapis package, implement token exchange, and store tokens in the Account model.",
  }
}

/**
 * Fetch new emails from a user's Gmail inbox.
 *
 * In production, this would:
 * 1. Load stored tokens from the Account model
 * 2. Refresh the access token if expired
 * 3. Query Gmail API for new messages since last check
 * 4. Parse and classify each message
 * 5. Store results in the Email model
 *
 * Returns classified email messages.
 */
export async function fetchNewEmails(
  userId: string
): Promise<{ success: boolean; emails: GmailMessage[]; message?: string }> {
  void userId

  // In production implementation:
  // 1. Load tokens:
  //    const account = await prisma.account.findFirst({
  //      where: { userId, provider: "gmail" }
  //    })
  // 2. Initialize Gmail client with tokens
  // 3. List messages:
  //    const res = await gmail.users.messages.list({
  //      userId: "me", q: "is:unread after:YYYY/MM/DD"
  //    })
  // 4. Get full message details for each
  // 5. Classify and store

  return {
    success: false,
    emails: [],
    message:
      "Gmail polling is not yet implemented. " +
      "Connect your Gmail account first via the /api/emails/connect endpoint.",
  }
}
