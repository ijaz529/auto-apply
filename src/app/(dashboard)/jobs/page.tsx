"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  Loader2,
  Search,
  ExternalLink,
  AlertCircle,
  Download,
  ChevronDown,
  ChevronUp,
  Plus,
  CheckCircle2,
  GitCompare,
  Trophy,
  X,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScoreBadge } from "@/components/score-badge"
import {
  buildComparison,
  type ComparisonJob,
  type ComparisonResult,
} from "@/lib/analytics/comparison"
import { cn } from "@/lib/utils"

const MAX_COMPARE = 5

// ── Types ─────────────────────────────────────────────────────────

interface JobResult {
  id: string
  company: string
  role: string
  url: string
  location: string | null
  createdAt: string
  jdText: string | null
  evaluation: {
    score: number
    archetype: string
    legitimacy: string
    reportMarkdown: string
    keywords: string[] | null
    gaps: Array<{ description: string; severity: string; mitigation: string }> | null
    scoreBreakdown: Record<string, number> | null
  } | null
  application: {
    id: string
    status: string
    notes: string | null
  } | null
}

interface SimilarJob {
  title: string
  url: string
  company: string
  location: string
  relevance?: number
}

interface SimilarState {
  jobs: SimilarJob[]
  scanning: boolean
  loaded: boolean
}

// ── Page ──────────────────────────────────────────────────────────

export default function JobsPage() {
  const [hasCV, setHasCV] = useState<boolean | null>(null)

  const [urls, setUrls] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [jobs, setJobs] = useState<JobResult[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  const [cvDownloading, setCvDownloading] = useState<string | null>(null)
  const [markingApplied, setMarkingApplied] = useState<string | null>(null)

  // Similar jobs state per job ID
  const [similarByJob, setSimilarByJob] = useState<Record<string, SimilarState>>({})
  const [addingJobUrl, setAddingJobUrl] = useState<string | null>(null)

  // Multi-select for inline comparison
  const [compareSelected, setCompareSelected] = useState<Set<string>>(new Set())

  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  function toggleCompare(jobId: string) {
    setCompareSelected((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) {
        next.delete(jobId)
        return next
      }
      if (next.size >= MAX_COMPARE) return prev
      next.add(jobId)
      return next
    })
  }

  const compareJobs: ComparisonJob[] = useMemo(
    () =>
      jobs
        .filter((j) => compareSelected.has(j.id) && j.evaluation)
        .map((j) => ({
          id: j.id,
          company: j.company,
          role: j.role,
          url: j.url,
          location: j.location,
          evaluation: j.evaluation
            ? {
                score: j.evaluation.score,
                archetype: j.evaluation.archetype,
                legitimacy: j.evaluation.legitimacy,
                scoreBreakdown: j.evaluation.scoreBreakdown,
                gaps: j.evaluation.gaps,
              }
            : null,
        })),
    [jobs, compareSelected]
  )

  const comparison: ComparisonResult | null = useMemo(
    () => (compareJobs.length >= 2 ? buildComparison(compareJobs) : null),
    [compareJobs]
  )

  // ── Data fetching ─────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=50")
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs ?? [])
        return data.jobs ?? []
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
    return []
  }, [])

  useEffect(() => {
    fetchJobs()
    fetch("/api/profile").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setHasCV(!!d.cvMarkdown)
    }).catch(() => setHasCV(false))
  }, [fetchJobs])

  // Poll for pending evaluations
  useEffect(() => {
    const hasPending = jobs.some((j) => !j.evaluation && j.jdText)
    if (hasPending) {
      pollingRef.current = setInterval(async () => {
        const updated = await fetchJobs()
        const stillPending = updated.some((j: JobResult) => !j.evaluation && j.jdText)
        if (!stillPending && pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }, 4000)
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [jobs, fetchJobs])

  // ── Handlers ──────────────────────────────────────────────────

  async function handleProcess(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!hasCV) {
      setSubmitError("Upload your CV first on the CV tab.")
      return
    }
    const urlList = urls.split("\n").map((u) => u.trim()).filter(Boolean)
    if (urlList.length === 0) { setSubmitError("Paste at least one job URL."); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlList }),
      })
      if (res.ok) {
        setUrls("")
        await fetchJobs()
      } else {
        const data = await res.json().catch(() => ({}))
        setSubmitError(data.error || "Failed to submit.")
      }
    } catch {
      setSubmitError("Network error.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDownloadCV(jobId: string, company: string) {
    setCvDownloading(jobId)
    try {
      const res = await fetch("/api/cv/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
      if (!res.ok) {
        let message = `CV generation failed (HTTP ${res.status})`
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch { /* response wasn't JSON */ }
        toast.error(message)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `cv-${company.toLowerCase().replace(/\s+/g, "-")}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "CV generation request failed"
      )
    } finally {
      setCvDownloading(null)
    }
  }

  async function handleMarkApplied(jobId: string) {
    setMarkingApplied(jobId)
    try {
      const res = await fetch(`/api/jobs/${jobId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      })
      if (!res.ok) {
        let message = `Failed to mark applied (HTTP ${res.status})`
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch { /* not JSON */ }
        toast.error(message)
        return
      }
      const data = await res.json().catch(() => ({}))
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                application: j.application
                  ? { ...j.application, status: "applied" }
                  : data.application
                    ? {
                        id: data.application.id,
                        status: data.application.status,
                        notes: data.application.notes ?? null,
                      }
                    : null,
              }
            : j
        )
      )
      toast.success("Marked as applied")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error")
    } finally {
      setMarkingApplied(null)
    }
  }

  async function handleFindSimilar(jobId: string) {
    setSimilarByJob((prev) => ({
      ...prev,
      [jobId]: { jobs: [], scanning: true, loaded: false },
    }))
    try {
      const res = await fetch("/api/jobs/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      })
      if (res.ok) {
        const data = await res.json()
        setSimilarByJob((prev) => ({
          ...prev,
          [jobId]: { jobs: data.jobs ?? [], scanning: false, loaded: true },
        }))
      } else {
        setSimilarByJob((prev) => ({
          ...prev,
          [jobId]: { jobs: [], scanning: false, loaded: true },
        }))
      }
    } catch {
      setSimilarByJob((prev) => ({
        ...prev,
        [jobId]: { jobs: [], scanning: false, loaded: true },
      }))
    }
  }

  async function handleAddSimilarJob(jobUrl: string, parentJobId: string) {
    setAddingJobUrl(jobUrl)
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [jobUrl] }),
      })
      if (res.ok) {
        setSimilarByJob((prev) => ({
          ...prev,
          [parentJobId]: {
            ...prev[parentJobId],
            jobs: prev[parentJobId].jobs.filter((j) => j.url !== jobUrl),
          },
        }))
        await fetchJobs()
      }
    } catch { /* ignore */ } finally {
      setAddingJobUrl(null)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  function scoreBadge(score: number) {
    const color =
      score >= 4.0 ? "bg-green-100 text-green-800 border-green-200" :
      score >= 3.5 ? "bg-amber-100 text-amber-800 border-amber-200" :
      "bg-red-100 text-red-800 border-red-200"
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
        {score.toFixed(1)}
      </span>
    )
  }

  const pendingCount = jobs.filter((j) => !j.evaluation && j.jdText).length

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* CV reminder if missing */}
      {hasCV === false && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Upload your CV first on the CV tab to evaluate jobs.</span>
          <Link href="/cv">
            <Button size="sm" variant="outline">Go to CV</Button>
          </Link>
        </div>
      )}

      {/* Job URL Input */}
      <form onSubmit={handleProcess} className="space-y-3">
        <Textarea
          placeholder="Paste job URL(s) — one per line"
          value={urls}
          onChange={(e) => { setUrls(e.target.value); setSubmitError(null) }}
          rows={2}
          className="font-mono text-sm"
        />
        {submitError && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {submitError}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submitting || hasCV === false}>
          {submitting
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
            : <><Search className="mr-2 h-4 w-4" /> Process</>
          }
        </Button>
      </form>

      {/* Results */}
      {(loading || jobs.length > 0) && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Results</h2>
              {pendingCount > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Evaluating {pendingCount}...
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              jobs.map((job) => {
                const similar = similarByJob[job.id]

                return (
                  <Card key={job.id}>
                    <CardContent className="p-3">
                      {/* Job header */}
                      <div
                        className="flex items-center justify-between gap-3 cursor-pointer"
                        onClick={() => job.evaluation && setExpandedJob(expandedJob === job.id ? null : job.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {job.evaluation && scoreBadge(job.evaluation.score)}
                            <span className="font-medium text-sm">{job.company}</span>
                            <span className="text-sm text-muted-foreground">{job.role}</span>
                          </div>
                          {!job.evaluation && job.jdText && !job.application?.notes && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> Evaluating...
                            </span>
                          )}
                          {!job.evaluation && job.application?.notes && (
                            <span className="text-xs text-red-600 mt-1">{job.application.notes}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {job.evaluation && (
                            <label
                              className="inline-flex items-center gap-1 px-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                              title={
                                compareSelected.has(job.id)
                                  ? "Remove from comparison"
                                  : compareSelected.size >= MAX_COMPARE
                                    ? `Max ${MAX_COMPARE} for comparison`
                                    : "Add to comparison"
                              }
                            >
                              <input
                                type="checkbox"
                                checked={compareSelected.has(job.id)}
                                disabled={
                                  !compareSelected.has(job.id) &&
                                  compareSelected.size >= MAX_COMPARE
                                }
                                onChange={() => toggleCompare(job.id)}
                                className="h-3.5 w-3.5"
                              />
                              <GitCompare className="h-3.5 w-3.5" />
                            </label>
                          )}
                          {job.url && !job.url.startsWith("pasted-") && (
                            <a href={job.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
                            </a>
                          )}
                          {job.evaluation && (
                            expandedJob === job.id
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Expanded: evaluation + actions + similar jobs */}
                      {expandedJob === job.id && job.evaluation && (
                        <div className="mt-3 pt-3 border-t space-y-3">
                          <div className="flex flex-wrap gap-2 text-xs">
                            <Badge variant="secondary">{job.evaluation.archetype}</Badge>
                            <Badge variant="outline">{job.evaluation.legitimacy}</Badge>
                          </div>

                          {/* Gaps */}
                          {job.evaluation.gaps && job.evaluation.gaps.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">Gaps:</p>
                              {job.evaluation.gaps.slice(0, 3).map((gap, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-xs">
                                  <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                                    gap.severity === "hard_blocker" ? "bg-red-500" :
                                    gap.severity === "medium" ? "bg-amber-500" : "bg-gray-400"
                                  }`} />
                                  <span>{gap.description}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={cvDownloading === job.id}
                                onClick={() => handleDownloadCV(job.id, job.company)}
                              >
                                {cvDownloading === job.id
                                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  : <Download className="mr-1.5 h-3.5 w-3.5" />}
                                Tailored CV
                              </Button>
                              {job.url && !job.url.startsWith("pasted-") && (
                                <a href={job.url} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm">
                                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                    Apply
                                  </Button>
                                </a>
                              )}
                              {job.application?.status === "applied" ||
                              job.application?.status === "responded" ||
                              job.application?.status === "interview" ||
                              job.application?.status === "offer" ||
                              job.application?.status === "rejected" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled
                                  className="text-emerald-600"
                                >
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  {job.application.status === "applied"
                                    ? "Applied"
                                    : `Applied · ${job.application.status}`}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={markingApplied === job.id}
                                  onClick={() => handleMarkApplied(job.id)}
                                >
                                  {markingApplied === job.id ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                  )}
                                  Mark applied
                                </Button>
                              )}
                            </div>
                            {job.evaluation.keywords && job.evaluation.keywords.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                CV optimized for <span className="font-medium">{job.evaluation.archetype}</span> role with ATS keywords: {(job.evaluation.keywords as string[]).slice(0, 8).join(", ")}{(job.evaluation.keywords as string[]).length > 8 ? "..." : ""}
                              </p>
                            )}
                          </div>

                          {/* Similar Jobs — inside this job's evaluation */}
                          <Separator />
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">Similar jobs from 60+ portals</p>
                              {similar?.loaded && (
                                <span className="text-xs text-muted-foreground">{similar.jobs.length} found</span>
                              )}
                            </div>

                            {!similar?.loaded && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                disabled={similar?.scanning}
                                onClick={() => handleFindSimilar(job.id)}
                              >
                                {similar?.scanning
                                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Scanning...</>
                                  : <><Search className="mr-1.5 h-3.5 w-3.5" /> Find Similar Jobs</>
                                }
                              </Button>
                            )}

                            {similar?.loaded && similar.jobs.length === 0 && (
                              <p className="text-xs text-muted-foreground">No similar jobs found.</p>
                            )}

                            {similar?.jobs && similar.jobs.length > 0 && (
                              <div className="space-y-1">
                                {similar.jobs.map((sj) => (
                                  <div
                                    key={sj.url}
                                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {sj.relevance != null && (
                                          <span className={`inline-flex items-center justify-center h-5 min-w-[2rem] px-1 rounded text-xs font-bold ${
                                            sj.relevance >= 70 ? "bg-green-100 text-green-800" :
                                            sj.relevance >= 40 ? "bg-amber-100 text-amber-800" :
                                            "bg-gray-100 text-gray-600"
                                          }`}>
                                            {sj.relevance}%
                                          </span>
                                        )}
                                        <span className="font-medium">{sj.company}</span>
                                        <span className="text-muted-foreground">{sj.title}</span>
                                      </div>
                                      {sj.location && (
                                        <p className="text-xs text-muted-foreground mt-0.5">{sj.location}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <a href={sj.url} target="_blank" rel="noopener noreferrer">
                                        <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
                                      </a>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={addingJobUrl === sj.url}
                                        onClick={() => handleAddSimilarJob(sj.url, job.id)}
                                        title="Evaluate this job"
                                      >
                                        {addingJobUrl === sj.url
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <Plus className="h-3.5 w-3.5" />
                                        }
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </>
      )}

      {/* Inline comparison — appears once 2+ evaluated jobs are selected */}
      {compareSelected.size > 0 && (
        <>
          <Separator />
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitCompare className="h-4 w-4" />
                  Compare ({compareSelected.size}/{MAX_COMPARE})
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCompareSelected(new Set())}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
              {!comparison && (
                <CardDescription>
                  Pick at least one more evaluated job to see them
                  side-by-side.
                </CardDescription>
              )}
            </CardHeader>
            {comparison && (
              <CardContent className="space-y-4">
                {/* Ranking */}
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Trophy className="h-3.5 w-3.5 text-amber-500" />
                    Ranking
                  </h3>
                  <ol className="space-y-1.5">
                    {comparison.ranking.map((r) => {
                      const j = comparison.jobs.find((j) => j.id === r.jobId)!
                      return (
                        <li
                          key={r.jobId}
                          className="flex items-center justify-between rounded-md border p-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={r.rank === 1 ? "default" : "secondary"}
                            >
                              #{r.rank}
                            </Badge>
                            <div>
                              <p className="font-medium leading-tight">
                                {j.company}
                              </p>
                              <p className="text-xs text-muted-foreground leading-tight">
                                {j.role}
                              </p>
                            </div>
                          </div>
                          <ScoreBadge score={r.score} />
                        </li>
                      )
                    })}
                  </ol>
                </div>

                {/* Side-by-side matrix */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Side-by-side</h3>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[160px]">Dimension</TableHead>
                          {comparison.jobs.map((j) => (
                            <TableHead key={j.id} className="min-w-[140px]">
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
                                  {v === null || v === undefined || v === ""
                                    ? "—"
                                    : v}
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
