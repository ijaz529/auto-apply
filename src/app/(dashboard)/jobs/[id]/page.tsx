"use client"

import { useState, useEffect, useCallback } from "react"
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
  Clock,
  Calendar,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScoreBadge } from "@/components/score-badge"
import { StatusBadge } from "@/components/status-badge"
import { MarkdownRenderer } from "@/components/markdown-renderer"

interface EvaluationBlock {
  key: string
  title: string
  content: string
}

interface FollowUp {
  id: string
  dueDate: string
  channel: string
  contact: string | null
  completed: boolean
  notes: string | null
}

interface JobDetail {
  id: string
  company: string
  role: string
  score: number | null
  status: string
  url: string
  legitimacy: string | null
  createdAt: string
  applyInstructions: string | null
  blocks: EvaluationBlock[]
  followUps: FollowUp[]
}

const BLOCK_LABELS: Record<string, string> = {
  A: "Summary",
  B: "CV Match",
  C: "Level",
  D: "Comp",
  E: "Personalization",
  F: "Interview",
  G: "Legitimacy",
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [generatingCv, setGeneratingCv] = useState(false)
  const [generatingCl, setGeneratingCl] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${id}`)
      if (res.ok) {
        const data = await res.json()
        const j = data.job ?? data
        setJob({
          id: j.id,
          company: j.company,
          role: j.role,
          score: j.evaluation?.score ?? null,
          status: j.application?.status ?? "evaluated",
          url: j.url,
          legitimacy: j.evaluation?.legitimacy ?? null,
          createdAt: j.createdAt,
          applyInstructions: null,
          blocks: j.evaluation?.blocksJson ?? [],
          followUps: j.application?.followUps ?? [],
        })
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchJob()
  }, [fetchJob])

  async function handleMarkApplied() {
    setApplying(true)
    try {
      const res = await fetch(`/api/jobs/${id}/apply`, { method: "POST" })
      if (res.ok) {
        await fetchJob()
      }
    } catch {
      // handle error silently
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
      // handle error
    } finally {
      setGeneratingCv(false)
    }
  }

  async function handleDownloadCoverLetter() {
    setGeneratingCl(true)
    try {
      const res = await fetch("/api/cv/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `cover-letter-${job?.company?.toLowerCase().replace(/\s+/g, "-") ?? "letter"}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      // handle error
    } finally {
      setGeneratingCl(false)
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Not Found</h1>
          <p className="text-muted-foreground mt-1">
            This job does not exist or has been removed.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.location.href = "/jobs"}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Jobs
        </Button>
      </div>
    )
  }

  const hasBlocks = job.blocks && job.blocks.length > 0
  const isEvaluating =
    job.status === "evaluating" || (!hasBlocks && job.score == null)

  const upcomingFollowUps = job.followUps.filter((f) => !f.completed)
  const hasFollowUps = upcomingFollowUps.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => window.location.href = "/jobs"}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">
              {job.company}
            </h1>
            {job.score != null && <ScoreBadge score={job.score} />}
            {job.legitimacy && (
              <Badge variant="outline" className="text-xs">
                {job.legitimacy}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{job.role}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleDownloadCv}
          disabled={generatingCv || isEvaluating}
          variant="outline"
        >
          {generatingCv ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download Tailored CV
        </Button>
        <Button
          onClick={handleDownloadCoverLetter}
          disabled={generatingCl || isEvaluating}
          variant="outline"
        >
          {generatingCl ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          Cover Letter
        </Button>
        <Button
          variant="outline"
          disabled={isEvaluating}
          onClick={() => window.location.href = `/interview-prep?jobId=${id}`}
        >
          <GraduationCap className="mr-2 h-4 w-4" />
          Interview Prep
        </Button>
        <Button
          variant="outline"
          disabled={isEvaluating}
          onClick={() => window.location.href = `/interview-prep?jobId=${id}&tab=outreach`}
        >
          <Users className="mr-2 h-4 w-4" />
          LinkedIn Outreach
        </Button>
        <Button
          onClick={handleMarkApplied}
          disabled={applying || job.status === "applied"}
          variant={job.status === "applied" ? "secondary" : "default"}
        >
          {applying ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {job.status === "applied" ? "Applied" : "Mark as Applied"}
        </Button>
        <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
          <DialogTrigger
            render={
              <Button variant="outline" disabled={isEvaluating}>
                <ListChecks className="mr-2 h-4 w-4" />
                Apply Instructions
              </Button>
            }
          />
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>How to Apply</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              {job.applyInstructions ? (
                <MarkdownRenderer content={job.applyInstructions} />
              ) : (
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>1. Download your tailored CV using the button above.</p>
                  <p>
                    2. Visit the job posting:{" "}
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {job.url}
                    </a>
                  </p>
                  <p>3. Click the Apply button on the posting.</p>
                  <p>4. Upload your tailored CV and fill in the form.</p>
                  <p>5. Come back here and mark as Applied.</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Follow-up Status */}
      {hasFollowUps && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Follow-up Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingFollowUps.map((fu) => {
                const due = new Date(fu.dueDate)
                const now = new Date()
                const isOverdue = due < now
                const diffDays = Math.abs(
                  Math.floor(
                    (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                  )
                )
                return (
                  <div
                    key={fu.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">
                          {fu.channel} follow-up
                          {fu.contact ? ` with ${fu.contact}` : ""}
                        </p>
                        {fu.notes && (
                          <p className="text-xs text-muted-foreground">
                            {fu.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {due.toLocaleDateString()}
                      </span>
                      {isOverdue ? (
                        <Badge variant="destructive" className="text-xs">
                          {diffDays}d overdue
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          in {diffDays}d
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evaluation Content */}
      {isEvaluating ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Evaluating...</h3>
            <p className="text-sm text-muted-foreground mt-1">
              This job is being evaluated. Results will appear here shortly.
            </p>
          </CardContent>
        </Card>
      ) : hasBlocks ? (
        <Tabs defaultValue={job.blocks[0]?.key ?? "A"}>
          <TabsList className="flex-wrap">
            {job.blocks.map((block) => (
              <TabsTrigger key={block.key} value={block.key}>
                {block.key}: {BLOCK_LABELS[block.key] ?? block.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {job.blocks.map((block) => (
            <TabsContent key={block.key} value={block.key} className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>
                    Block {block.key} &mdash;{" "}
                    {BLOCK_LABELS[block.key] ?? block.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MarkdownRenderer content={block.content} />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Evaluation Report</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              No evaluation blocks available for this job.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Job Info Footer */}
      <Card>
        <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm pt-4">
          <div>
            <span className="text-muted-foreground">Status: </span>
            <StatusBadge status={job.status} />
          </div>
          <div>
            <span className="text-muted-foreground">Added: </span>
            {new Date(job.createdAt).toLocaleDateString()}
          </div>
          <div className="min-w-0 max-w-full">
            <span className="text-muted-foreground">URL: </span>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 break-all"
            >
              {job.url.length > 80 ? job.url.slice(0, 80) + "..." : job.url}
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
