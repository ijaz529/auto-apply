import { NextResponse } from "next/server"

export async function GET() {
  const hasGemini = !!process.env.GEMINI_API_KEY
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
  const hasDb = !!process.env.DATABASE_URL

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.2.0",
    config: {
      geminiKey: hasGemini ? "set" : "MISSING",
      anthropicKey: hasAnthropic ? "set" : "not set",
      database: hasDb ? "set" : "MISSING",
    },
  })
}
