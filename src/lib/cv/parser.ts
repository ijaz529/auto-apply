import type { CVData } from "@/types"

/**
 * Extract raw text from a PDF buffer.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await parser.getText()
  return result.text
}

/**
 * Extract markdown from a DOCX buffer via mammoth.
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

/**
 * Structure a CV from raw text into CVData using Gemini AI.
 * Falls back to basic heuristic parsing if Gemini is unavailable.
 */
export async function structureCv(rawText: string): Promise<CVData> {
  // Try AI-powered parsing first
  const apiKey = process.env.GEMINI_API_KEY
  if (apiKey) {
    try {
      return await structureCvWithAI(rawText, apiKey)
    } catch (error) {
      console.warn("AI CV parsing failed, falling back to heuristic:", error)
    }
  }

  // Fallback: basic heuristic
  return structureCvHeuristic(rawText)
}

async function structureCvWithAI(rawText: string, apiKey: string): Promise<CVData> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai")
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  })

  const prompt = `Parse this CV/resume text into structured JSON. Extract ALL information accurately.

CV TEXT:
${rawText}

Return a JSON object with this exact structure:
{
  "fullName": "string",
  "location": "string",
  "email": "string",
  "phone": "string or null",
  "linkedin": "string or null",
  "github": "string or null",
  "portfolioUrl": "string or null",
  "summary": "the professional summary paragraph",
  "experience": [
    {
      "title": "job title",
      "company": "company name",
      "location": "city, country",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or Present",
      "bullets": ["achievement 1", "achievement 2"]
    }
  ],
  "education": [
    {
      "institution": "school name",
      "location": "city, country",
      "degree": "degree name",
      "endDate": "YYYY"
    }
  ],
  "projects": [
    {
      "name": "project name",
      "role": "role if any",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or Present",
      "url": "url or null",
      "bullets": ["description 1"]
    }
  ],
  "certifications": [
    {
      "name": "cert name",
      "issuer": "issuing org",
      "code": "cert code or null"
    }
  ],
  "skills": [
    {
      "category": "category name",
      "items": ["skill1", "skill2"]
    }
  ],
  "achievements": ["achievement 1", "achievement 2"]
}

Rules:
- Extract EVERY work experience entry with ALL bullet points
- Keep bullet points as-is from the CV, don't summarize
- If a section doesn't exist, use empty array
- For summary, use the professional summary/about/profile section text
- Parse dates as written (e.g., "Sep 2023", "2018", "Present")
- Respond with ONLY valid JSON`

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  // Parse JSON with sanitization for Gemini's newlines-in-strings issue
  let json: string = text
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) json = fenceMatch[1].trim()

  // Sanitize: escape literal newlines inside JSON strings
  let sanitized = ""
  let inStr = false
  let esc = false
  for (let i = 0; i < json.length; i++) {
    const ch = json[i]
    if (esc) { sanitized += ch; esc = false; continue }
    if (ch === "\\") { sanitized += ch; esc = true; continue }
    if (ch === '"') { inStr = !inStr; sanitized += ch; continue }
    if (inStr && ch === "\n") { sanitized += "\\n"; continue }
    if (inStr && ch === "\r") { sanitized += "\\r"; continue }
    if (inStr && ch === "\t") { sanitized += "\\t"; continue }
    sanitized += ch
  }

  const parsed = JSON.parse(sanitized) as CVData
  return parsed
}

function structureCvHeuristic(rawText: string): CVData {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean)

  // Basic extraction
  const emailMatch = rawText.match(/[\w.-]+@[\w.-]+\.\w+/)
  const phoneMatch = rawText.match(/\+?\d[\d\s()-]{7,}/)
  const linkedinMatch = rawText.match(/linkedin\.com\/in\/[\w-]+/)
  const githubMatch = rawText.match(/github\.com\/[\w-]+/)

  return {
    fullName: lines[0] || "Unknown",
    location: "",
    email: emailMatch?.[0] || "",
    phone: phoneMatch?.[0]?.trim() || undefined,
    linkedin: linkedinMatch?.[0] || undefined,
    github: githubMatch?.[0] || undefined,
    summary: "",
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    skills: [],
    achievements: [],
  }
}
