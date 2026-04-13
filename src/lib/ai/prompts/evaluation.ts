export const EVALUATION_PROMPT = `Evaluate this job description against the candidate's CV. Produce ALL 7 blocks (A-G) as described below, then output structured JSON.

## Step 0 — Archetype Detection

Classify the offer into one or two archetypes from the archetype table in the system prompt. This determines:
- Which proof points to prioritize in Block B
- How to frame the candidate's experience in Block C
- Which STAR stories to prepare in Block F

---

## Block A — Role Summary

Create a summary table with:
- **Archetype detected:** The closest archetype(s) from the detection table
- **Domain:** Industry/vertical (e.g., "FinTech", "HealthTech", "Developer Tools", "Enterprise SaaS")
- **Function:** build / consult / manage / deploy / research
- **Seniority:** Junior, Mid, Senior, Staff, Principal, Lead, Manager, Director, VP, C-level
- **Remote:** Remote / Hybrid / On-site / Not specified
- **Team size:** If mentioned in the JD
- **TL;DR:** One-sentence summary of the opportunity — what makes it interesting or risky

---

## Block B — CV Match

For each major requirement in the JD:
1. Quote the requirement from the JD
2. Map to specific CV evidence (quote exact lines from the candidate's CV)
3. Rate alignment: **Strong Match** / **Partial Match** / **Gap**

**Adapt to archetype:**
- If Backend/Infra: prioritize systems design, scalability proof points
- If Frontend/UI: prioritize UX, design system, accessibility evidence
- If Data/ML: prioritize pipeline, model, and analytics proof points
- If AI/LLMOps: prioritize evals, observability, production ML evidence
- If Agentic: prioritize orchestration, tool use, HITL evidence
- If PM: prioritize product discovery, metrics, stakeholder management

**Gaps section:** For each gap found:
1. Severity: hard_blocker / medium / nice_to_have
2. Can the candidate demonstrate adjacent experience?
3. Is there a portfolio project or side work that covers this?
4. Concrete mitigation plan (phrase for cover letter, quick project, reframing of existing experience)

End with: match summary percentage, top 3 strengths, top 3 gaps.

---

## Block C — Level Strategy

1. **Level detected in JD** vs **candidate's natural level** based on their CV
2. **"Sell senior without lying" plan:** Specific phrases adapted to the archetype, concrete achievements to highlight, how to position breadth of experience as an advantage
3. **"If downleveled" plan:** Accept if comp is fair, negotiate review at 6 months, ask for clear promotion criteria. Frame it as "I want to earn your trust first."

---

## Block D — Comp & Demand

Estimate salary range for this role based on:
- Location and cost-of-living
- Seniority level
- Domain/industry premiums
- Any comp info in the posting itself

Include:
- Estimated salary range (low / mid / high)
- Reasoning for the estimate
- Demand signal: is this role type in high demand or oversaturated?
- Negotiation leverage points (competing offers, niche skills, market conditions)

If data is limited, say so explicitly. Do NOT fabricate salary numbers.

---

## Block E — Personalization Plan

**Top 5 CV changes** for this specific application:

| # | Section | Current state | Proposed change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| 2 | ... | ... | ... | ... |

**Top 5 talking points** for cover letter or interview — key narratives to emphasize, mapped to specific JD requirements.

---

## Block F — Interview Prep

Generate 6-10 likely interview questions mapped to JD requirements, each with a STAR+R story outline:

| # | JD Requirement | Likely Question | S (Situation) | T (Task) | A (Action) | R (Result) | Reflection |
|---|---------------|-----------------|---------------|----------|------------|------------|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Select and frame stories based on archetype:**
- Backend/Infra: emphasize architecture decisions and scale
- Frontend/UI: emphasize user impact and design trade-offs
- Data/ML: emphasize metrics, experimentation, data quality
- AI/LLMOps: emphasize evals, production hardening, reliability
- Agentic: emphasize orchestration, error handling, human-in-the-loop
- PM: emphasize discovery, prioritization trade-offs, stakeholder alignment

Also include:
- 1 recommended case study: which project from the CV to present and how to frame it
- Red-flag questions to expect (e.g., career gaps, job changes) with recommended framing (honest, specific, forward-looking, never defensive)

---

## Block G — Posting Legitimacy

Analyze the job posting for signals indicating whether this is a real, active opening.

**Signals to analyze:**

1. **Posting freshness:** Date posted, apply button state, any redirects to generic careers page
2. **Description quality:** Tech specificity, team/org context, realistic requirements, clear scope for first 6-12 months, salary mentioned, ratio of role-specific vs boilerplate, any internal contradictions
3. **Role market context:** Is this a common role that fills in 4-6 weeks? Does it make sense for this company? Does seniority level justify a longer search?

**Assessment:** One of three tiers:
- **High Confidence** — Multiple signals suggest a real, active opening
- **Proceed with Caution** — Mixed signals worth noting
- **Suspicious** — Multiple ghost job indicators, investigate before investing time

**Signals table:** Each signal observed, its finding, and weight (Positive / Neutral / Concerning).

**Context notes:** Caveats (niche role, government job, evergreen position, early-stage startup) that explain potentially concerning signals.

---

After generating all blocks, output a single JSON object with this exact structure:

\`\`\`json
{
  "score": <number 1-5, one decimal>,
  "archetype": "<detected archetype string>",
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
  "coverLetterDraft": "<A tailored cover letter draft, 3-4 paragraphs, professional tone, maps JD requirements to CV proof points, avoids cliches>"
}
\`\`\`

IMPORTANT:
- Output ONLY the JSON object, no additional text before or after
- Ensure all markdown in block values is properly escaped for JSON strings
- The score must reflect the actual analysis — do not inflate
- If there are hard blockers, cap the score at 2.5
- The cover letter must be specific to THIS role and THIS candidate — map JD quotes to proof points, use concrete evidence, avoid generic language
- For Block F STAR+R stories, use actual evidence from the CV — do not invent experiences
`
