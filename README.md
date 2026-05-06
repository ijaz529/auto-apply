# AutoApply

AI-powered job application automation. Personal SaaS scratching my own itch: scrape postings from multiple ATS portals, score fit against my CV, generate tailored applications with Claude or Gemini, and track everything in one place.

## Why this exists

Job hunting with 9 years of experience means filtering 100+ postings per week to find the 5 worth applying to with a tailored CV. Manual filtering = burnout. Existing tools are either spammy auto-submitters or single-feature point solutions. AutoApply is the system I want: high-fit filter → AI-tailored CV → human approves before submit.

## Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Multi-LLM:** Anthropic Claude SDK + Google Gemini (model choice per task type)
- **Auth:** NextAuth v5 with Prisma adapter
- **Database:** Prisma + Postgres
- **Background jobs:** BullMQ + Redis (separate `worker.ts` process for scraping and LLM calls)
- **Document parsing:** pdf-parse + mammoth (PDF + DOCX CV uploads)
- **UI:** shadcn/ui + Base UI + Tailwind + Lucide
- **Validation:** Zod
- **Tests:** Vitest
- **Deploy:** Docker + Railway

## Repo layout

- `src/app/` — Next.js app routes (UI + API)
- `src/lib`, `src/hooks`, `src/components`, `src/types/` — shared logic, UI, types
- `prisma/` — schema and migrations
- `templates/` — document and CV templates
- `worker.ts` — BullMQ worker for background scraping and LLM jobs

## Status

Active development; personal product, not yet open for signups. Building in public — expect rough edges.
