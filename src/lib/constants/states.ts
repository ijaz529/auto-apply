export const APPLICATION_STATES = [
  {
    value: "evaluated",
    label: "Evaluated",
    color: "bg-blue-100 text-blue-800",
    description: "Report completed, pending decision",
  },
  {
    value: "applied",
    label: "Applied",
    color: "bg-green-100 text-green-800",
    description: "Application sent",
  },
  {
    value: "responded",
    label: "Responded",
    color: "bg-purple-100 text-purple-800",
    description: "Company responded",
  },
  {
    value: "interview",
    label: "Interview",
    color: "bg-yellow-100 text-yellow-800",
    description: "In interview process",
  },
  {
    value: "offer",
    label: "Offer",
    color: "bg-emerald-100 text-emerald-800",
    description: "Offer received",
  },
  {
    value: "rejected",
    label: "Rejected",
    color: "bg-red-100 text-red-800",
    description: "Rejected by company",
  },
  {
    value: "discarded",
    label: "Discarded",
    color: "bg-gray-100 text-gray-800",
    description: "Discarded by candidate or offer closed",
  },
  {
    value: "skip",
    label: "SKIP",
    color: "bg-zinc-100 text-zinc-600",
    description: "Doesn't fit, don't apply",
  },
] as const

export type ApplicationStateValue = (typeof APPLICATION_STATES)[number]["value"]
