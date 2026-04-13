import { randomUUID } from "crypto"

export interface Notification {
  id: string
  type:
    | "new_job"
    | "evaluation_complete"
    | "follow_up_due"
    | "scan_complete"
    | "email_received"
  title: string
  message: string
  link?: string
  createdAt: Date
  read: boolean
}

/**
 * Format a notification for when a portal scan completes.
 */
export function formatScanNotification(
  newJobs: number,
  company?: string
): Notification {
  const companyText = company ? ` from ${company}` : ""
  return {
    id: randomUUID(),
    type: "scan_complete",
    title: newJobs > 0 ? `${newJobs} new job${newJobs === 1 ? "" : "s"} found` : "Scan complete",
    message:
      newJobs > 0
        ? `Scanner found ${newJobs} new opportunity${newJobs === 1 ? "" : "ies"}${companyText}. Review them in your pipeline.`
        : `Scan completed${companyText}. No new jobs matching your criteria were found.`,
    link: "/scanner",
    createdAt: new Date(),
    read: false,
  }
}

/**
 * Format a notification for when a job evaluation completes.
 */
export function formatEvaluationNotification(
  company: string,
  role: string,
  score: number
): Notification {
  const scoreLabel =
    score >= 4.0
      ? "Strong match"
      : score >= 3.0
        ? "Moderate match"
        : "Low match"

  return {
    id: randomUUID(),
    type: "evaluation_complete",
    title: `${company} evaluation complete`,
    message: `${role} at ${company} scored ${score.toFixed(1)}/5 (${scoreLabel}). ${score >= 4.0 ? "Consider applying soon." : score >= 3.0 ? "Review the report for details." : "This may not be the best fit."}`,
    link: "/jobs",
    createdAt: new Date(),
    read: false,
  }
}

/**
 * Format a notification for an overdue follow-up.
 */
export function formatFollowUpNotification(
  company: string,
  role: string,
  daysOverdue: number
): Notification {
  const urgency =
    daysOverdue > 7
      ? "significantly overdue"
      : daysOverdue > 3
        ? "overdue"
        : "due soon"

  return {
    id: randomUUID(),
    type: "follow_up_due",
    title: `Follow-up ${urgency}: ${company}`,
    message:
      daysOverdue > 0
        ? `Your follow-up for ${role} at ${company} is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue. Reach out today.`
        : `Follow-up for ${role} at ${company} is due today. Time to send a check-in message.`,
    link: "/applications",
    createdAt: new Date(),
    read: false,
  }
}

/**
 * Format a notification for a new job added to the pipeline.
 */
export function formatNewJobNotification(
  company: string,
  role: string,
  jobId: string
): Notification {
  return {
    id: randomUUID(),
    type: "new_job",
    title: `New job added: ${company}`,
    message: `${role} at ${company} has been added to your pipeline and is pending evaluation.`,
    link: `/jobs/${jobId}`,
    createdAt: new Date(),
    read: false,
  }
}

/**
 * Format a notification for a received email classified by the email service.
 */
export function formatEmailNotification(
  company: string,
  classification: string
): Notification {
  const titles: Record<string, string> = {
    confirmation: `Application confirmed: ${company}`,
    interview: `Interview invite: ${company}`,
    rejection: `Update from ${company}`,
    offer: `Offer received: ${company}`,
    unknown: `New email from ${company}`,
  }

  const messages: Record<string, string> = {
    confirmation: `${company} confirmed receipt of your application.`,
    interview: `${company} wants to schedule an interview. Check your email for details.`,
    rejection: `${company} has sent an update about your application.`,
    offer: `Congratulations! ${company} has sent you an offer. Review it carefully.`,
    unknown: `You received a new email from ${company}. Review it to determine the next step.`,
  }

  return {
    id: randomUUID(),
    type: "email_received",
    title: titles[classification] ?? titles.unknown,
    message: messages[classification] ?? messages.unknown,
    link: "/applications",
    createdAt: new Date(),
    read: false,
  }
}
