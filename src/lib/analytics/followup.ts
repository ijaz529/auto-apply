/**
 * Follow-up Cadence — Compute follow-up schedules for active applications
 *
 * Ported from followup-cadence.mjs in career-ops.
 * Queries applications from the database and computes next follow-up dates,
 * urgency, and suggested actions.
 */

import { prisma } from "@/lib/db"

// ── Types ──────────────────────────────────────────────────────────

export interface FollowUpItem {
  applicationId: string
  company: string
  role: string
  status: string
  lastAction: Date
  nextFollowUp: Date
  isOverdue: boolean
  daysUntil: number
  channel: string
  suggestedAction: string
}

// ── Cadence Config ─────────────────────────────────────────────────

const CADENCE = {
  applied_first: 7,
  applied_subsequent: 7,
  applied_max_followups: 2,
  responded_initial: 1,
  responded_subsequent: 3,
  interview_thankyou: 1,
} as const

// ── Date Helpers ───────────────────────────────────────────────────

function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function today(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

// ── Urgency Classification ─────────────────────────────────────────

type Urgency = "urgent" | "overdue" | "waiting" | "cold"

function computeUrgency(
  status: string,
  daysSinceApp: number,
  daysSinceLastFollowup: number | null,
  followupCount: number
): Urgency {
  if (status === "applied") {
    if (followupCount >= CADENCE.applied_max_followups) return "cold"
    if (followupCount === 0 && daysSinceApp >= CADENCE.applied_first) return "overdue"
    if (followupCount > 0 && daysSinceLastFollowup !== null && daysSinceLastFollowup >= CADENCE.applied_subsequent) return "overdue"
    return "waiting"
  }
  if (status === "responded") {
    if (daysSinceApp < CADENCE.responded_initial) return "urgent"
    if (daysSinceApp >= CADENCE.responded_subsequent) return "overdue"
    return "waiting"
  }
  if (status === "interview") {
    if (daysSinceApp >= CADENCE.interview_thankyou) return "overdue"
    return "waiting"
  }
  return "waiting"
}

// ── Next Follow-up Date ────────────────────────────────────────────

function computeNextFollowupDate(
  status: string,
  appDate: Date,
  lastFollowupDate: Date | null,
  followupCount: number
): Date | null {
  if (status === "applied") {
    if (followupCount >= CADENCE.applied_max_followups) return null
    if (followupCount === 0) return addDays(appDate, CADENCE.applied_first)
    if (lastFollowupDate) return addDays(lastFollowupDate, CADENCE.applied_subsequent)
    return addDays(appDate, CADENCE.applied_first)
  }
  if (status === "responded") {
    if (lastFollowupDate) return addDays(lastFollowupDate, CADENCE.responded_subsequent)
    return addDays(appDate, CADENCE.responded_subsequent)
  }
  if (status === "interview") {
    return addDays(appDate, CADENCE.interview_thankyou)
  }
  return null
}

// ── Suggested Action Text ──────────────────────────────────────────

function suggestedActionForStatus(status: string, followupCount: number): string {
  if (status === "applied") {
    if (followupCount === 0) {
      return "Send first follow-up email checking on application status"
    }
    if (followupCount === 1) {
      return "Send second follow-up expressing continued interest"
    }
    return "Application is cold -- move on or try a different contact"
  }
  if (status === "responded") {
    return "Reply promptly to maintain momentum in the conversation"
  }
  if (status === "interview") {
    return "Send thank-you note referencing specific discussion points"
  }
  return "Review application status"
}

// ── Channel for Status ─────────────────────────────────────────────

function channelForStatus(status: string): string {
  if (status === "applied") return "email"
  if (status === "responded") return "email"
  if (status === "interview") return "email"
  return "email"
}

// ── Main Function ──────────────────────────────────────────────────

export async function getFollowUpSchedule(userId: string): Promise<FollowUpItem[]> {
  const actionableStatuses = ["applied", "responded", "interview"]

  // Fetch applications with actionable statuses, including follow-ups
  const applications = await prisma.application.findMany({
    where: {
      userId,
      status: { in: actionableStatuses },
    },
    include: {
      job: true,
      followUps: {
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  })

  const now = today()
  const items: FollowUpItem[] = []

  for (const app of applications) {
    const appDate = app.appliedAt || app.createdAt
    const daysSinceApp = daysBetween(appDate, now)
    const followupCount = app.followUps.length

    // Find the most recent follow-up
    let lastFollowupDate: Date | null = null
    let daysSinceLastFollowup: number | null = null
    if (app.followUps.length > 0) {
      lastFollowupDate = app.followUps[0].createdAt
      daysSinceLastFollowup = daysBetween(lastFollowupDate, now)
    }

    const urgency = computeUrgency(
      app.status,
      daysSinceApp,
      daysSinceLastFollowup,
      followupCount
    )

    // Skip cold entries (max follow-ups reached)
    if (urgency === "cold") continue

    const nextFollowupDate = computeNextFollowupDate(
      app.status,
      appDate,
      lastFollowupDate,
      followupCount
    )

    if (!nextFollowupDate) continue

    const daysUntil = daysBetween(now, nextFollowupDate)
    const isOverdue = daysUntil < 0

    items.push({
      applicationId: app.id,
      company: app.job.company,
      role: app.job.role,
      status: app.status,
      lastAction: lastFollowupDate || appDate,
      nextFollowUp: nextFollowupDate,
      isOverdue,
      daysUntil,
      channel: channelForStatus(app.status),
      suggestedAction: suggestedActionForStatus(app.status, followupCount),
    })
  }

  // Sort: overdue first (most negative daysUntil), then soonest
  items.sort((a, b) => a.daysUntil - b.daysUntil)

  return items
}
