/**
 * Company portal registry — career-ops style.
 *
 * 60+ companies across Greenhouse, Ashby, and Lever APIs.
 * Grouped by sector for maintainability.
 */

import type { CompanyConfig } from "."

// ── Helpers ───────────────────────────────────────────────────────

const gh = (slug: string) => `https://job-boards.greenhouse.io/${slug}`
const ghEu = (slug: string) => `https://job-boards.eu.greenhouse.io/${slug}`
const ashby = (slug: string) => `https://jobs.ashbyhq.com/${slug}`
const lever = (slug: string) => `https://jobs.lever.co/${slug}`

// ── Portal List ───────────────────────────────────────────────────

export const ALL_PORTALS: CompanyConfig[] = [
  // — AI Labs & LLM Providers —
  { name: "Anthropic", careers_url: gh("anthropic") },
  { name: "OpenAI", careers_url: ashby("openai") },
  { name: "Cohere", careers_url: lever("cohere") },
  { name: "Mistral AI", careers_url: lever("mistral") },
  { name: "Hugging Face", careers_url: gh("huggingface") },

  // — Voice & Conversational AI —
  { name: "ElevenLabs", careers_url: gh("elevenlabs") },
  { name: "PolyAI", careers_url: gh("polyai") },
  { name: "Deepgram", careers_url: gh("deepgram") },
  { name: "Hume AI", careers_url: ashby("humeai") },

  // — Enterprise AI & Platforms —
  { name: "Retool", careers_url: ashby("retool") },
  { name: "Vercel", careers_url: gh("vercel") },
  { name: "Temporal", careers_url: gh("temporaltechnologies") },
  { name: "Arize AI", careers_url: gh("arikiaco") },
  { name: "Glean", careers_url: gh("glaboratories") },
  { name: "Supabase", careers_url: ashby("supabase") },

  // — Developer Tools —
  { name: "Clerk", careers_url: gh("clerkdev") },
  { name: "Inngest", careers_url: ashby("inngest") },
  { name: "WorkOS", careers_url: ashby("workos") },
  { name: "Resend", careers_url: ashby("resend") },
  { name: "Runway", careers_url: gh("runwayml") },

  // — Fintech —
  { name: "Stripe", careers_url: gh("stripe") },
  { name: "N26", careers_url: gh("n26") },
  { name: "Trade Republic", careers_url: gh("traderepublicbank") },
  { name: "SumUp", careers_url: gh("sumup") },
  { name: "Adyen", careers_url: gh("adyen") },
  { name: "Pleo", careers_url: ashby("pleo") },
  { name: "Raisin", careers_url: ghEu("raisin") },

  // — Mobility & Logistics —
  { name: "Bolt", careers_url: gh("boltv2") },
  { name: "Forto", careers_url: ashby("forto") },
  { name: "Wolt", careers_url: gh("wolt") },

  // — Travel & Experiences —
  { name: "GetYourGuide", careers_url: gh("getyourguide") },
  { name: "Booking.com", careers_url: gh("bookingcom") },

  // — Food & Commerce —
  { name: "HelloFresh", careers_url: gh("hellofresh") },

  // — SaaS & Data —
  { name: "Contentful", careers_url: gh("contentful") },
  { name: "Celonis", careers_url: gh("celonis") },
  { name: "Databricks", careers_url: gh("databricks") },
  { name: "Datadog", careers_url: gh("datadog") },
  { name: "Hightouch", careers_url: gh("hightouch") },

  // — Health & Life Sciences —
  { name: "Doctolib", careers_url: gh("doctolib") },

  // — DACH Region —
  { name: "DeepL", careers_url: gh("deepl") },
  { name: "Helsing", careers_url: gh("helsing") },
  { name: "Personio", careers_url: gh("personio") },
  { name: "Agora", careers_url: gh("agorapulse") },

  // — European Tech —
  { name: "Spotify", careers_url: lever("spotify") },
  { name: "Synthesia", careers_url: gh("synthesia") },
  { name: "Factorial", careers_url: ashby("factorial") },
  { name: "Attio", careers_url: ashby("attio") },
  { name: "Tinybird", careers_url: ashby("tinybird") },

  // — Middle East —
  { name: "Careem", careers_url: "https://boards.greenhouse.io/careem" },

  // — Productivity & Comms —
  { name: "Notion", careers_url: gh("notion") },
  { name: "Linear", careers_url: ashby("linear") },
  { name: "Figma", careers_url: gh("figma") },
  { name: "Intercom", careers_url: gh("intercom") },

  // — Security & Infrastructure —
  { name: "Cloudflare", careers_url: gh("cloudflare") },
  { name: "1Password", careers_url: gh("1password") },
  { name: "Grafana Labs", careers_url: ashby("grafanalabs") },

  // — E-commerce —
  { name: "Shopify", careers_url: gh("shopify") },
]
