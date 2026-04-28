"use client"

import { useEffect, useMemo, useState } from "react"
import { GitCompare, Loader2, Check, Trophy } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScoreBadge } from "@/components/score-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  buildComparison,
  type ComparisonJob,
  type ComparisonResult,
} from "@/lib/analytics/comparison"

interface ApiJob {
  id: string
  company: string
  role: string
  url: string | null
  location: string | null
  evaluation: {
    score: number
    archetype: string | null
    legitimacy: string | null
    scoreBreakdown: Record<string, number> | null
    gaps: Array<{ description: string; severity: string }> | null
  } | null
}

const MAX_SELECTION = 5

export default function ComparePage() {
  const [allJobs, setAllJobs] = useState<ApiJob[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/jobs?limit=100")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const jobs = (data?.jobs ?? []).filter((j: ApiJob) => j.evaluation)
        setAllJobs(jobs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      if (next.size >= MAX_SELECTION) return prev // hard cap
      next.add(id)
      return next
    })
  }

  const selectedJobs: ComparisonJob[] = useMemo(
    () =>
      allJobs
        .filter((j) => selected.has(j.id))
        .map((j) => ({
          id: j.id,
          company: j.company,
          role: j.role,
          url: j.url,
          location: j.location,
          evaluation: j.evaluation,
        })),
    [allJobs, selected]
  )

  const comparison: ComparisonResult | null = useMemo(
    () => (selectedJobs.length >= 2 ? buildComparison(selectedJobs) : null),
    [selectedJobs]
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compare Offers</h1>
          <p className="text-muted-foreground mt-1">
            Pick 2–5 evaluated jobs to see them side-by-side.
          </p>
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (allJobs.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compare Offers</h1>
          <p className="text-muted-foreground mt-1">
            Pick 2–5 evaluated jobs to see them side-by-side.
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <GitCompare className="mx-auto h-10 w-10 text-muted-foreground/50 mb-4" />
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              No evaluated jobs yet. Add jobs and let them evaluate, then come
              back here to compare.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compare Offers</h1>
        <p className="text-muted-foreground mt-1">
          Pick 2–{MAX_SELECTION} evaluated jobs to see them side-by-side.
          Selected: {selected.size}/{MAX_SELECTION}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick jobs</CardTitle>
          <CardDescription>
            Click any evaluated job to add it to the comparison.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {allJobs.map((j) => {
              const isSelected = selected.has(j.id)
              const disabled =
                !isSelected && selected.size >= MAX_SELECTION
              return (
                <button
                  key={j.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(j.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                    disabled && "opacity-50 cursor-not-allowed"
                  )}
                  aria-pressed={isSelected}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                  <span className="font-medium">{j.company}</span>
                  <span>·</span>
                  <span className="truncate max-w-[200px]">{j.role}</span>
                  {j.evaluation && (
                    <span className="text-muted-foreground">
                      ({j.evaluation.score}/5)
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {comparison && (
        <>
          {/* Ranking summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-amber-500" />
                Ranking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {comparison.ranking.map((r) => {
                  const j = comparison.jobs.find((j) => j.id === r.jobId)!
                  return (
                    <li
                      key={r.jobId}
                      className="flex items-center justify-between rounded-md border p-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={r.rank === 1 ? "default" : "secondary"}>
                          #{r.rank}
                        </Badge>
                        <div>
                          <p className="font-medium">{j.company}</p>
                          <p className="text-xs text-muted-foreground">
                            {j.role}
                          </p>
                        </div>
                      </div>
                      <ScoreBadge score={r.score} />
                    </li>
                  )
                })}
              </ol>
            </CardContent>
          </Card>

          {/* Side-by-side matrix */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Side-by-side</CardTitle>
              <CardDescription>
                Each row highlights the job(s) holding the row&apos;s max — ties
                across all columns aren&apos;t highlighted (no comparative
                signal).
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Dimension</TableHead>
                    {comparison.jobs.map((j) => (
                      <TableHead key={j.id} className="min-w-[160px]">
                        <div className="font-medium">{j.company}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {j.role}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ...comparison.headline,
                    ...comparison.dimensions,
                    comparison.blockerSummary,
                  ].map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium text-sm">
                        {row.label}
                      </TableCell>
                      {row.values.map((v, i) => {
                        const isMax = row.maxIndices.includes(i)
                        return (
                          <TableCell
                            key={i}
                            className={cn(
                              "text-sm align-top",
                              isMax &&
                                "bg-green-50 dark:bg-green-950/30 font-medium"
                            )}
                          >
                            {v === null || v === undefined || v === "" ? "—" : v}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {!comparison && selected.size === 1 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Add at least one more job to see the comparison.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
