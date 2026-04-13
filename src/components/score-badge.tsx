"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface ScoreBadgeProps {
  score: number
  className?: string
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  const colorClass =
    score >= 4.0
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
      : score >= 3.5
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"

  return (
    <Badge variant="outline" className={cn(colorClass, "border-transparent font-semibold", className)}>
      {score.toFixed(1)}/5
    </Badge>
  )
}
