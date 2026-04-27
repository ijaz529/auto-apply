"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import {
  Loader2,
  Download,
  FileText,
  CheckCircle2,
  ListChecks,
  ArrowLeft,
  GraduationCap,
  Users,
  RefreshCw,
  Compass,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { ScoreBadge } from "@/components/score-badge"
import { MarkdownRenderer } from "@/components/markdown-renderer"

const BLOCK_LABELS: Record<string, string> = {
  A: "Summary",
  B: "CV Match",
  C: "Level",
  D: "Comp",
  E: "Personalization",
  F: "Interview",
  G: "Legitimacy",
}

interface JobData {
  id: string
  company: string
  role: string
  url: string
  jdText: string | null
  createdAt: string
  evaluation: {
    score: number
    archetype: string | null
    legitimacy: string | null
    reportMarkdown: string
    blocksJson: Record<string, string> | null
    keywords: string[] | null
    gaps: Array<{ description: string; severity: string; mitigation: string }> | null
  } | null
  application: {
    id: string
    status: string
    manualSteps: string[] | null
  } | null
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [job, setJob] = useState<JobData | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [generatingCv, setGeneratingCv] = useState(false)
  const [reEvaluating, setReEvaluating] = useState(false)
  const [strategy, setStrategy] = useState<{ research: string; negotiation: string } | null>(null)
  const [strategyLoading, setStrategyLoading] = useState(false)
  const [strategyError, setStrategyError] = useState<string | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const reEvalPollingRef = useRef<NodeJS.Timeout | null>(null)
  const reEvalSnapshotRef = useRef<{ score: number | null } | null>(null)

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${id}`)
      if (res.ok) {
        const data = await res.json()
        setJob(data.job ?? null)
        return data.job
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
    return null
  }, [id])

  useEffect(() => {
    fetchJob()
  }, [fetchJob])

  // Poll if evaluation is pending
  useEffect(() => {
    if (job && !job.evaluation && job.jdText) {
      pollingRef.current = setInterval(async () => {
        const updated = await fetchJob()
        if (updated?.evaluation && pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }, 4000)
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [job, fetchJob])

  // Pull cached strategy when the eval first loads, so the panel shows
  // immediately without requiring a click for jobs that already have one.
  useEffect(() => {
    if (!job?.evaluation || strategy || strategyLoading) return
    let cancelled = false
    fetch(`/api/jobs/${id}/strategy`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.strategy) setStrategy(data.strategy)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, job?.evaluation, strategy, strategyLoading])

  async function handleGenerateStrategy() {
    if (strategyLoading) return
    setStrategyLoading(true)
    setStrategyError(null)
    try {
      const res = await fetch(`/api/jobs/${id}/strategy`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        setStrategy(data.strategy ?? null)
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to generate strategy" }))
        setStrategyError(err.error ?? "Failed to generate strategy.")
      }
    } catch {
      setStrategyError("Network error. Check your connection.")
    } finally {
      setStrategyLoading(false)
    }
  }

  async function handleReEvaluate() {
    if (reEvaluating) return
    // Snapshot the current eval signal so we know when a fresh result lands.
    reEvalSnapshotRef.current = { score: job?.evaluation?.score ?? null }
    setReEvaluating(true)
    try {
      await fetch(`/api/jobs/${id}/evaluate`, { method: "POST" })
    } catch {
      // server-side fire-and-forget; failures will surface via the next fetch
    }
    // Poll until the score (or model) changes, or 2 min cap.
    const startedAt = Date.now()
    const tick = async () => {
      const updated = await fetchJob()
      const before = reEvalSnapshotRef.current
      const after = updated?.evaluation
      // Done if there's now an eval and either it didn't exist before, or the score moved.
      const changed =
        !!after &&
        (before?.score == null || (after.score ?? null) !== before.score)
      if (changed || Date.now() - startedAt > 120_000) {
        if (reEvalPollingRef.current) {
          clearInterval(reEvalPollingRef.current)
          reEvalPollingRef.current = null
        }
        setReEvaluating(false)
      }
    }
    reEvalPollingRef.current = setInterval(tick, 4000)
  }

  // Cleanup the re-eval poller on unmount.
  useEffect(() => {
    return () => {
      if (reEvalPollingRef.current) clearInterval(reEvalPollingRef.current)
    }
  }, [])

  async function handleMarkApplied() {
    setApplying(true)
    try {
      await fetch(`/api/jobs/${id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      })
      await fetchJob()
    } catch {
      // ignore
    } finally {
      setApplying(false)
    }
  }

  async function handleDownloadCv() {
    setGeneratingCv(true)
    try {
      const res = await fetch("/api/cv/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `cv-${job?.company?.toLowerCase().replace(/\s+/g, "-") ?? "tailored"}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      // ignore
    } finally {
      setGeneratingCv(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Job Not Found</h1>
        <Button variant="outline" onClick={() => window.location.href = "/jobs"}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
        </Button>
      </div>
    )
  }

  const eval_ = job.evaluation
  const blocks = eval_?.blocksJson as Record<string, string> | null
  const hasBlocks = blocks && Object.keys(blocks).length > 0
  const isEvaluating = !eval_ && !!job.jdText

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => window.location.href = "/jobs"}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{job.company}</h1>
            {eval_ && <ScoreBadge score={eval_.score} />}
            {eval_?.legitimacy && <Badge variant="outline" className="text-xs">{eval_.legitimacy}</Badge>}
          </div>
          <p className="text-muted-foreground mt-0.5">{job.role}</p>
        </div>
      </div>

      {/* Evaluating state */}
      {isEvaluating && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
            <p className="font-medium">Evaluating...</p>
            <p className="text-sm text-muted-foreground mt-1">
              AI is analyzing this job against your CV. This takes 30-60 seconds.
            </p>
          </CardContent>
        </Card>
      )}

      {/* No JD */}
      {!eval_ && !job.jdText && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Could not fetch the job description from this URL. Try pasting the JD text directly on the Jobs page.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Evaluation results */}
      {eval_ && (
        <>
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleDownloadCv} disabled={generatingCv} variant="outline" size="sm">
              {generatingCv ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              Tailored CV
            </Button>
            <Button onClick={handleReEvaluate} disabled={reEvaluating} variant="outline" size="sm" title="Re-run the evaluation against your current CV and target roles">
              {reEvaluating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Re-evaluate
            </Button>
            <Button onClick={handleGenerateStrategy} disabled={strategyLoading} variant="outline" size="sm" title="Generate company research + negotiation kit for this role">
              {strategyLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Compass className="mr-1.5 h-3.5 w-3.5" />}
              {strategy ? "Re-generate strategy" : "Strategy"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.href = `/interview-prep?jobId=${id}`}>
              <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
              Interview Prep
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.href = `/interview-prep?jobId=${id}&tab=outreach`}>
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Outreach
            </Button>
            <Button
              size="sm"
              onClick={handleMarkApplied}
              disabled={applying || job.application?.status === "applied"}
              variant={job.application?.status === "applied" ? "secondary" : "default"}
            >
              {applying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              {job.application?.status === "applied" ? "Applied" : "Mark Applied"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const steps = job.application?.manualSteps as string[] | null
              if (steps && steps.length > 0) {
                alert(steps.join("\n\n"))
              } else {
                alert(`1. Download your tailored CV above\n\n2. Visit: ${job.url}\n\n3. Click Apply and upload your CV\n\n4. Come back and mark as Applied`)
              }
            }}>
              <ListChecks className="mr-1.5 h-3.5 w-3.5" />
              How to Apply
            </Button>
          </div>

          {/* Report blocks */}
          {hasBlocks ? (
            <Tabs defaultValue="A">
              <TabsList className="flex-wrap h-auto">
                {Object.entries(BLOCK_LABELS).map(([key, label]) => (
                  blocks[key] ? (
                    <TabsTrigger key={key} value={key} className="text-xs">
                      {key}: {label}
                    </TabsTrigger>
                  ) : null
                ))}
              </TabsList>
              {Object.entries(BLOCK_LABELS).map(([key, label]) => (
                blocks[key] ? (
                  <TabsContent key={key} value={key}>
                    <Card>
                      <CardContent className="p-4">
                        <MarkdownRenderer content={blocks[key]} />
                      </CardContent>
                    </Card>
                  </TabsContent>
                ) : null
              ))}
            </Tabs>
          ) : eval_.reportMarkdown ? (
            <Card>
              <CardContent className="p-4">
                <MarkdownRenderer content={eval_.reportMarkdown} />
              </CardContent>
            </Card>
          ) : null}

          {/* Strategy: company research + negotiation kit */}
          {(strategy || strategyLoading || strategyError) && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">Strategy</p>
                </div>
                {strategyError && (
                  <p className="text-sm text-red-600">{strategyError}</p>
                )}
                {strategyLoading && !strategy && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating company research and negotiation kit...
                  </p>
                )}
                {strategy && (
                  <Tabs defaultValue="research">
                    <TabsList>
                      <TabsTrigger value="research" className="text-xs">Company Research</TabsTrigger>
                      <TabsTrigger value="negotiation" className="text-xs">Negotiation Kit</TabsTrigger>
                    </TabsList>
                    <TabsContent value="research">
                      <MarkdownRenderer content={strategy.research} />
                    </TabsContent>
                    <TabsContent value="negotiation">
                      <MarkdownRenderer content={strategy.negotiation} />
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          )}

          {/* Keywords */}
          {eval_.keywords && (eval_.keywords as string[]).length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">ATS Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {(eval_.keywords as string[]).map((kw, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer info */}
      <div className="text-xs text-muted-foreground flex flex-wrap gap-4">
        <span>Status: <Badge variant="outline" className="text-xs">{job.application?.status ?? "pending"}</Badge></span>
        <span>Added: {new Date(job.createdAt).toLocaleDateString()}</span>
        {job.url && !job.url.startsWith("pasted-") && (
          <span>URL: <a href={job.url} target="_blank" rel="noopener noreferrer" className="underline break-all">{job.url.length > 60 ? job.url.slice(0, 60) + "..." : job.url}</a></span>
        )}
      </div>
    </div>
  )
}
