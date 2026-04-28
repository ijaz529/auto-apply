"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Download, Upload, Loader2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ScoreBadge } from "@/components/score-badge"
import { StatusBadge } from "@/components/status-badge"
import { cn } from "@/lib/utils"

interface JobRow {
  id: string
  company: string
  role: string
  url: string | null
  location: string | null
  evaluation: { score: number; archetype: string | null } | null
  application: { status: string } | null
}

type FilterKey = "all" | "evaluated" | "applied" | "interview" | "top" | "skip"

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "ALL" },
  { key: "evaluated", label: "EVALUATED" },
  { key: "applied", label: "APPLIED" },
  { key: "interview", label: "INTERVIEW" },
  { key: "top", label: "TOP ≥4" },
  { key: "skip", label: "SKIP" },
]

type Bucket = "applied" | "evaluated" | "interview" | "discarded"

const BUCKET_ORDER: Bucket[] = ["interview", "applied", "evaluated", "discarded"]
const BUCKET_LABEL: Record<Bucket, string> = {
  interview: "INTERVIEW",
  applied: "APPLIED",
  evaluated: "EVALUATED",
  discarded: "DISCARDED",
}

function statusOf(j: JobRow): string {
  return j.application?.status ?? (j.evaluation ? "evaluated" : "pending")
}

function bucketOf(status: string): Bucket {
  if (status === "applied" || status === "responded") return "applied"
  if (status === "interview" || status === "offer") return "interview"
  if (status === "rejected" || status === "discarded" || status === "skip")
    return "discarded"
  return "evaluated"
}

function matchesFilter(j: JobRow, filter: FilterKey): boolean {
  const status = statusOf(j)
  const score = j.evaluation?.score ?? 0
  if (filter === "all") return true
  if (filter === "top") return score >= 4
  return bucketOf(status) === filter
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [hasCv, setHasCv] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>("all")
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/jobs?limit=200").then((r) => (r.ok ? r.json() : { jobs: [] })),
      fetch("/api/cv").then((r) => (r.ok ? r.json() : { markdown: "" })),
    ])
      .then(([jobsRes, cvRes]) => {
        if (cancelled) return
        setJobs(jobsRes?.jobs ?? [])
        setHasCv(Boolean((cvRes?.markdown ?? "").trim()))
      })
      .catch(() => {
        if (!cancelled) setJobs([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const counts = { applied: 0, evaluated: 0, interview: 0, discarded: 0 }
    let scoreSum = 0
    let scored = 0
    for (const j of jobs) {
      counts[bucketOf(statusOf(j))]++
      if (j.evaluation?.score != null) {
        scoreSum += j.evaluation.score
        scored++
      }
    }
    return {
      total: jobs.length,
      avg: scored ? scoreSum / scored : null,
      ...counts,
    }
  }, [jobs])

  const filtered = useMemo(
    () => jobs.filter((j) => matchesFilter(j, filter)),
    [jobs, filter]
  )

  const grouped = useMemo(() => {
    const map: Record<Bucket, JobRow[]> = {
      interview: [],
      applied: [],
      evaluated: [],
      discarded: [],
    }
    for (const j of filtered) map[bucketOf(statusOf(j))].push(j)
    for (const b of BUCKET_ORDER) {
      map[b].sort(
        (a, z) => (z.evaluation?.score ?? 0) - (a.evaluation?.score ?? 0)
      )
    }
    return map
  }, [filtered])

  async function handleTailorCv(jobId: string) {
    setGeneratingId(jobId)
    try {
      const res = await fetch("/api/cv/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        const job = jobs.find((j) => j.id === jobId)
        a.download = `cv-${
          job?.company?.toLowerCase().replace(/\s+/g, "-") ?? "tailored"
        }.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setGeneratingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (hasCv === false) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Upload className="h-10 w-10 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Upload your CV to start</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Your primary CV powers every evaluation, tailored CV, and
            interview-prep on this dashboard. Upload it once on the Profile
            page to unlock the pipeline.
          </p>
          <Link
            href="/profile"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Profile
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 font-mono text-sm">
      {/* Header */}
      <div className="flex items-baseline justify-between border-b pb-2">
        <h1 className="text-base font-bold tracking-wider">CAREER PIPELINE</h1>
        <div className="text-xs text-muted-foreground">
          {stats.total} offers
          {stats.avg != null && (
            <span className="ml-2">| Avg {stats.avg.toFixed(1)}/5</span>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? stats.total
              : f.key === "top"
                ? jobs.filter((j) => (j.evaluation?.score ?? 0) >= 4).length
                : f.key === "evaluated"
                  ? stats.evaluated
                  : f.key === "applied"
                    ? stats.applied
                    : f.key === "interview"
                      ? stats.interview
                      : stats.discarded
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-2 py-1 text-xs font-bold tracking-wider transition-colors",
                active
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
              )}
            >
              {f.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Stats line */}
      <div className="text-xs text-muted-foreground">
        Applied:{stats.applied} &nbsp; Evaluated:{stats.evaluated} &nbsp;
        Interview:{stats.interview} &nbsp; Discarded:{stats.discarded}
        <span className="ml-3">
          [Sort: score] [View: {filter === "all" ? "grouped" : "flat"}]{" "}
          {filtered.length} shown
        </span>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              No jobs match this filter.
            </p>
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Add a job
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Rows: grouped when ALL, flat otherwise */}
      {filter === "all"
        ? BUCKET_ORDER.map((b) =>
            grouped[b].length === 0 ? null : (
              <section key={b}>
                <div className="text-xs text-muted-foreground border-b border-dashed pb-1 mb-1">
                  ── {BUCKET_LABEL[b]} ({grouped[b].length}) ──
                </div>
                <div>
                  {grouped[b].map((j) => (
                    <PipelineRow
                      key={j.id}
                      job={j}
                      onTailor={handleTailorCv}
                      generating={generatingId === j.id}
                    />
                  ))}
                </div>
              </section>
            )
          )
        : filtered
            .sort((a, z) => (z.evaluation?.score ?? 0) - (a.evaluation?.score ?? 0))
            .map((j) => (
              <PipelineRow
                key={j.id}
                job={j}
                onTailor={handleTailorCv}
                generating={generatingId === j.id}
              />
            ))}
    </div>
  )
}

function PipelineRow({
  job,
  onTailor,
  generating,
}: {
  job: JobRow
  onTailor: (id: string) => void
  generating: boolean
}) {
  const status = statusOf(job)
  return (
    <div className="group flex items-center gap-3 px-2 py-1.5 hover:bg-muted/40 border-b border-border/30 last:border-0">
      <div className="w-10 shrink-0">
        {job.evaluation?.score != null ? (
          <ScoreBadge score={job.evaluation.score} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <Link
        href={`/jobs/${job.id}`}
        className="flex-1 min-w-0 grid grid-cols-[1fr_2fr_1fr] gap-3 items-baseline hover:underline"
      >
        <span className="font-bold truncate">{job.company}</span>
        <span className="truncate text-muted-foreground">{job.role}</span>
        <span className="truncate text-xs text-muted-foreground">
          {job.location ?? "—"}
        </span>
      </Link>
      <div className="w-24 shrink-0">
        <StatusBadge status={status} className="text-[10px]" />
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => onTailor(job.id)}
          disabled={generating}
          title="Download tailored CV"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </Button>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            title="Open posting"
            className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}
