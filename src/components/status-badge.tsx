"use client"

import { Badge } from "@/components/ui/badge"
import { APPLICATION_STATES } from "@/lib/constants/states"
import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const state = APPLICATION_STATES.find(
    (s) => s.value === status.toLowerCase()
  )

  const colorClass = state?.color ?? "bg-gray-100 text-gray-800"
  const label = state?.label ?? status

  return (
    <Badge
      variant="outline"
      className={cn(colorClass, "border-transparent", className)}
    >
      {label}
    </Badge>
  )
}
