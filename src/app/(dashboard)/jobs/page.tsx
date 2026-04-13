"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  Loader2,
  Upload,
  Search,
  FileText,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  Download,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScoreBadge } from "@/components/score-badge"

interface JobResult {
  id: string
  company: string
  role: string
  url: string
  createdAt: string
  jdText: string | null
  evaluation: {
    score: number
    archetype: string
    legitimacy: string
    reportMarkdown: string
    blocksJson: Record<string, string> | null
    keywords: string[] | null
    gaps: Array<{ description: string; severity: string; mitigation: string }> | null
  } | null
  application: {
    id: string
    status: string
    manualSteps: string[] | null
    cvPdfUrl: string | null
    notes: string | null
  } | null
}

export default function JobsPage() {
  // CV state
  const [hasCV, setHasCV] = useState<boolean | null>(null)
  const [cvUploading, setCvUploading] = useState(false)
  const [cvDone, setCvDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Job input state
  const [inputMode, setInputMode] = useState<"url" | "text">("url")
  const [urls, setUrls] = useState("")
  const [jdTexts, setJdTexts] = useState("")
  const [preferences, setPreferences] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

  // Results state
  const [jobs, setJobs] = useState<JobResult[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [applyingJob, setApplyingJob] = useState<string | null>(null)

  // API health
  const [apiError, setApiError] = useState<string | null>(null)

  // Polling for evaluations
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=50")
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs ?? [])
        return data.jobs ?? []
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
    return []
  }, [])

  const checkCV = useCallback(async () => {
    try {
      const res = await fetch("/api/profile")
      if (res.ok) {
        const data = await res.json()
        setHasCV(!!data.cvMarkdown)
        if (data.preferences) setPreferences(data.preferences)
      }
    } catch {
      setHasCV(false)
    }
  }, [])

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health")
      if (res.ok) {
        const data = await res.json()
        if (data.config?.geminiKey === "MISSING") {
          setApiError("GEMINI_API_KEY is not set. Evaluations will fail. Add it to your Railway environment variables.")
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchJobs()
    checkCV()
    checkHealth()
  }, [fetchJobs, checkCV, checkHealth])

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

  async function handleCvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCvUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData })
      if (res.ok) {
        setHasCV(true)
        setCvDone(true)
      }
    } catch {
      // ignore
    } finally {
      setCvUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setSubmitSuccess(null)

    if (!hasCV) {
      setSubmitError("Please upload your CV first.")
      return
    }

    const payload: { urls?: string[]; texts?: string[]; preferences?: string } = {}

    if (inputMode === "url") {
      const urlList = urls.split("\n").map((u) => u.trim()).filter(Boolean)
      if (urlList.length === 0) {
        setSubmitError("Enter at least one job URL.")
        return
      }
      payload.urls = urlList
    } else {
      const textList = jdTexts.split("\n---\n").map((t) => t.trim()).filter(Boolean)
      if (textList.length === 0) {
        setSubmitError("Paste at least one job description.")
        return
      }
      payload.texts = textList
    }

    if (preferences.trim()) payload.preferences = preferences.trim()

    setSubmitting(true)
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        const count = data.results?.length ?? 0
        setSubmitSuccess(`${count} job(s) submitted. Evaluating now...`)
        setUrls("")
        setJdTexts("")
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

  async function handleMarkApplied(jobId: string) {
    setApplyingJob(jobId)
    try {
      await fetch(`/api/jobs/${jobId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      })
      await fetchJobs()
    } catch {
      // ignore
    } finally {
      setApplyingJob(null)
    }
  }

  function getScoreColor(score: number) {
    if (score >= 4.0) return "text-green-700 bg-green-50 border-green-200"
    if (score >= 3.5) return "text-amber-700 bg-amber-50 border-amber-200"
    return "text-red-700 bg-red-50 border-red-200"
  }

  function getScoreLabel(score: number) {
    if (score >= 4.5) return "Strong match — apply now"
    if (score >= 4.0) return "Good match — worth applying"
    if (score >= 3.5) return "Decent — apply if interested"
    return "Weak match — not recommended"
  }

  const pendingCount = jobs.filter((j) => !j.evaluation && j.jdText).length

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* API Error Banner */}
      {apiError && (
        <Card className="border-red-500/50 bg-red-50">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-800">{apiError}</p>
          </CardContent>
        </Card>
      )}

      {/* Step 1: CV Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            Your CV
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasCV === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : hasCV ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                CV uploaded
              </div>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                Re-upload
              </Button>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {cvUploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground mb-2" />
              )}
              <p className="text-sm font-medium">{cvUploading ? "Uploading..." : "Drop your CV here or click to upload"}</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, or TXT</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" className="hidden" onChange={handleCvUpload} />
          {cvDone && (
            <p className="text-xs text-green-600 mt-2">CV saved successfully.</p>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Preferences + Jobs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            Add Jobs
          </CardTitle>
          <CardDescription>
            Paste job URLs or job description text. We'll evaluate each one against your CV.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>What are you looking for? <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="remote, in Berlin, salary above $100k, fintech, senior..."
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Job postings</Label>
                <div className="flex rounded-md border text-xs">
                  <button
                    type="button"
                    className={`px-2 py-1 rounded-l-md transition-colors ${inputMode === "url" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    onClick={() => setInputMode("url")}
                  >
                    URLs
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-1 rounded-r-md transition-colors ${inputMode === "text" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    onClick={() => setInputMode("text")}
                  >
                    Paste JD text
                  </button>
                </div>
              </div>

              {inputMode === "url" ? (
                <>
                  <Textarea
                    placeholder={"https://boards.greenhouse.io/company/jobs/123\nhttps://jobs.ashbyhq.com/company/456\nhttps://jobs.lever.co/company/789"}
                    value={urls}
                    onChange={(e) => { setUrls(e.target.value); setSubmitError(null) }}
                    rows={3}
                    className="font-mono text-xs break-all"
                  />
                  <p className="text-xs text-muted-foreground">
                    One URL per line (up to 5). Works best with Greenhouse, Ashby, Lever links.
                  </p>
                </>
              ) : (
                <>
                  <Textarea
                    placeholder={"Paste the full job description here.\n\nFor multiple jobs, separate them with a line of three dashes: ---"}
                    value={jdTexts}
                    onChange={(e) => { setJdTexts(e.target.value); setSubmitError(null) }}
                    rows={6}
                    className="text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the job description from the posting page. For multiple jobs, separate with --- on its own line.
                  </p>
                </>
              )}
            </div>

            {submitError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {submitSuccess}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting || hasCV === false}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
              ) : (
                <><Search className="mr-2 h-4 w-4" /> Evaluate Jobs</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {(jobs.length > 0 || loading) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Results</h2>
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Evaluating {pendingCount} job{pendingCount > 1 ? "s" : ""}...
              </div>
            )}
          </div>

          {loading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : (
            jobs.map((job) => (
              <Card key={job.id} className={job.evaluation ? getScoreColor(job.evaluation.score) : "border-muted"}>
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{job.company}</h3>
                        {job.evaluation && <ScoreBadge score={job.evaluation.score} />}
                        {!job.evaluation && job.jdText && !job.application?.notes?.startsWith("Evaluation failed") && !job.application?.notes?.startsWith("JD too short") && (
                          <Badge variant="outline" className="text-xs">
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Evaluating
                          </Badge>
                        )}
                        {!job.evaluation && job.application?.notes && (
                          <Badge variant="outline" className="text-xs text-red-600">
                            Error
                          </Badge>
                        )}
                        {!job.evaluation && !job.jdText && !job.application?.notes && (
                          <Badge variant="outline" className="text-xs text-red-600">
                            JD fetch failed
                          </Badge>
                        )}
                        {job.application?.status === "applied" && (
                          <Badge className="bg-green-600 text-xs">Applied</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{job.role}</p>
                      {job.evaluation && (
                        <p className="text-xs mt-1 opacity-80">{getScoreLabel(job.evaluation.score)}</p>
                      )}
                      {!job.evaluation && job.application?.notes && (
                        <p className="text-xs mt-1 text-red-600">{job.application.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {job.url && !job.url.startsWith("pasted-") && (
                        <a href={job.url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </a>
                      )}
                      {job.evaluation && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                        >
                          {expandedJob === job.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedJob === job.id && job.evaluation && (
                    <div className="mt-4 space-y-4">
                      <Separator />

                      {/* Quick info */}
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Archetype:</span>
                          <p className="font-medium">{job.evaluation.archetype || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Legitimacy:</span>
                          <p className="font-medium">{job.evaluation.legitimacy || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Score:</span>
                          <p className="font-medium">{job.evaluation.score}/5</p>
                        </div>
                      </div>

                      {/* Key gaps */}
                      {job.evaluation.gaps && job.evaluation.gaps.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Key gaps:</p>
                          <ul className="space-y-1">
                            {(job.evaluation.gaps as Array<{ description: string; severity: string; mitigation: string }>).slice(0, 3).map((gap, i) => (
                              <li key={i} className="text-xs flex items-start gap-2">
                                <span className={`shrink-0 mt-0.5 h-2 w-2 rounded-full ${gap.severity === "hard_blocker" ? "bg-red-500" : gap.severity === "medium" ? "bg-amber-500" : "bg-gray-400"}`} />
                                <span>{gap.description}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/jobs/${job.id}`}>
                          <Button size="sm" variant="outline">
                            <FileText className="mr-1.5 h-3.5 w-3.5" />
                            Full Report
                          </Button>
                        </Link>

                        {/* Apply Instructions */}
                        {job.application?.manualSteps && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const steps = job.application?.manualSteps as string[]
                              alert(steps.join("\n\n"))
                            }}
                          >
                            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                            Apply Instructions
                          </Button>
                        )}

                        {/* Download tailored CV */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const res = await fetch("/api/cv/generate", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ jobId: job.id }),
                            })
                            if (res.ok) {
                              const blob = await res.blob()
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement("a")
                              a.href = url
                              a.download = `cv-${job.company.toLowerCase().replace(/\s+/g, "-")}.pdf`
                              a.click()
                              URL.revokeObjectURL(url)
                            }
                          }}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Download CV
                        </Button>

                        {/* Mark as applied */}
                        {job.application?.status !== "applied" && (
                          <Button
                            size="sm"
                            onClick={() => handleMarkApplied(job.id)}
                            disabled={applyingJob === job.id}
                          >
                            {applyingJob === job.id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Mark as Applied
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
