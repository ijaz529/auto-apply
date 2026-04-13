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
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

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
