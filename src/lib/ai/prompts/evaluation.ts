export const EVALUATION_PROMPT = `Evaluate this job description against the candidate's CV. Produce ALL 7 blocks as described below, then output structured JSON.

## Block A -- Role Summary
Create a summary table with:
- **Archetype:** The closest role archetype (e.g., "Backend Engineer", "Product Manager", "Data Scientist")
- **Domain:** Industry/vertical (e.g., "FinTech", "HealthTech", "Developer Tools")
- **Function:** Department/function (e.g., "Engineering", "Product", "Data")
- **Seniority:** Level (Junior, Mid, Senior, Staff, Principal, Lead, Manager, Director, VP, C-level)
- **Remote:** Remote policy if stated (Remote, Hybrid, On-site, Not specified)
- **Team size:** If mentioned
- **TL;DR:** One-sentence summary of the opportunity

## Block B -- CV Match
For each major requirement in the JD:
1. Quote the requirement
2. Map to specific CV evidence (quote exact lines from the CV)
3. Rate alignment: Strong Match, Partial Match, Gap
4. For gaps: severity (hard_blocker, medium, nice_to_have) and mitigation strategy

End with a match summary percentage and the top 3 strengths and top 3 gaps.

## Block C -- Level Strategy
- What seniority does the JD target?
- What seniority is the candidate based on their CV?
- If there's a mismatch, outline a positioning strategy
- Recommend how to frame experience in the application

## Block D -- Comp & Demand
- Estimate salary range for this role (based on location, seniority, domain)
- Note if data is limited or if the posting includes comp info
- Demand signal: is this a hot market for this role type?
- Negotiation leverage points

## Block E -- Personalization Plan
- **Top 5 CV changes:** Specific modifications to make for this application (reorder sections, emphasize specific projects, add keywords)
- **Top 5 talking points:** Key narratives to emphasize in cover letter or interview

## Block F -- Interview Prep
Generate 6-10 likely interview questions mapped to JD requirements, each with:
- The question
- Which JD requirement it tests
- A STAR+R story outline (Situation, Task, Action, Result, Reflection) using CV evidence

## Block G -- Posting Legitimacy
Assess the posting:
- Is the JD specific enough to be real?
- Are requirements realistic for the level?
- Any ghost posting indicators?
- Final verdict: High Confidence / Proceed with Caution / Suspicious

---

After generating all blocks, output a single JSON object with this exact structure:

\`\`\`json
{
  "score": <number 1-5, one decimal>,
  "archetype": "<role archetype string>",
  "legitimacy": "<High Confidence | Proceed with Caution | Suspicious>",
  "scoreBreakdown": {
    "cvMatch": <number 1-5>,
    "northStar": <number 1-5>,
    "comp": <number 1-5>,
    "cultural": <number 1-5>,
    "redFlags": <number 1-5>
  },
  "keywords": ["<15-20 ATS keywords from the JD>"],
  "gaps": [
    {
      "description": "<what is missing>",
      "severity": "<hard_blocker | medium | nice_to_have>",
      "mitigation": "<how to address it>"
    }
  ],
  "blocks": {
    "A": "<Block A markdown content>",
    "B": "<Block B markdown content>",
    "C": "<Block C markdown content>",
    "D": "<Block D markdown content>",
    "E": "<Block E markdown content>",
    "F": "<Block F markdown content>",
    "G": "<Block G markdown content>"
  },
  "manualApplySteps": [
    "<step 1: Go to URL>",
    "<step 2: Click Apply>",
    "<step 3: Fill in fields...>"
  ],
  "coverLetterDraft": "<A tailored cover letter draft, 3-4 paragraphs, professional tone>"
}
\`\`\`

IMPORTANT:
- Output ONLY the JSON object, no additional text before or after
- Ensure all markdown in block values is properly escaped for JSON strings
- The score must reflect the actual analysis -- do not inflate
- If there are hard blockers, cap the score at 2.5
- The cover letter must be specific to THIS role and THIS candidate, not generic
`
