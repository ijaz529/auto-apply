"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  Loader2,
  Upload,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Download,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

// ── Types ─────────────────────────────────────────────────────────

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
    keywords: string[] | null
    gaps: Array<{ description: string; severity: string; mitigation: string }> | null
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

// ── Page ──────────────────────────────────────────────────────────

export default function JobsPage() {
  const [hasCV, setHasCV] = useState<boolean | null>(null)
  const [cvUploading, setCvUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [urls, setUrls] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [jobs, setJobs] = useState<JobResult[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  const [cvDownloading, setCvDownloading] = useState<string | null>(null)

  const [similarJobs, setSimilarJobs] = useState<SimilarJob[]>([])
  const [similarScanning, setSimilarScanning] = useState(false)
  const [similarMeta, setSimilarMeta] = useState<{
    companiesScanned: number
    totalJobsFound: number
    source?: string
    signalsUsed?: { archetypes: string[]; seniority: string[]; locations: string[] } | null
  } | null>(null)
  const [addingJobUrl, setAddingJobUrl] = useState<string | null>(null)

  const pollingRef = useRef<NodeJS.Timeout | null>(null)

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

  async function handleCvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCvUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData })
      if (res.ok) setHasCV(true)
    } catch { /* ignore */ } finally {
      setCvUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleProcess(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!hasCV) { setSubmitError("Upload your CV first."); return }
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
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `cv-${company.toLowerCase().replace(/\s+/g, "-")}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch { /* ignore */ } finally {
      setCvDownloading(null)
    }
  }

  async function handleScanSimilar() {
    setSimilarScanning(true)
    setSimilarJobs([])
    setSimilarMeta(null)
    try {
      const res = await fetch("/api/jobs/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setSimilarJobs(data.jobs ?? [])
        setSimilarMeta(data.meta ?? null)
      }
    } catch { /* ignore */ } finally {
      setSimilarScanning(false)
    }
  }

  async function handleAddSimilarJob(jobUrl: string) {
    setAddingJobUrl(jobUrl)
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [jobUrl] }),
      })
      if (res.ok) {
        setSimilarJobs((prev) => prev.filter((j) => j.url !== jobUrl))
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
  const evaluatedJobs = jobs.filter((j) => j.evaluation)

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* CV Upload */}
      <div className="flex items-center gap-3">
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" className="hidden" onChange={handleCvUpload} />
        {hasCV ? (
          <>
            <div className="flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              CV uploaded
            </div>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              {cvUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              Re-upload
            </Button>
          </>
        ) : (
          <Button onClick={() => fileInputRef.current?.click()} disabled={cvUploading}>
            {cvUploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload CV
          </Button>
        )}
      </div>

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
              jobs.map((job) => (
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

                    {/* Expanded: score details + actions */}
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
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {/* Find Similar Jobs */}
      {evaluatedJobs.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="font-semibold">Find Similar Jobs</h2>
            <p className="text-xs text-muted-foreground">
              Scans 18 company portals using signals from your evaluated jobs.
            </p>
            <Button
              onClick={handleScanSimilar}
              disabled={similarScanning}
              variant="outline"
              className="w-full"
            >
              {similarScanning
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning...</>
                : <><Search className="mr-2 h-4 w-4" /> Scan Portals</>
              }
            </Button>

            {similarMeta && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {similarMeta.companiesScanned} companies scanned, {similarMeta.totalJobsFound} total jobs, {similarJobs.length} matches.
                </p>
                {similarMeta.signalsUsed && (
                  <div className="flex flex-wrap gap-1">
                    {similarMeta.signalsUsed.archetypes.slice(0, 3).map((a) => (
                      <Badge key={a} variant="secondary" className="text-xs capitalize">{a}</Badge>
                    ))}
                    {similarMeta.signalsUsed.seniority.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs capitalize">{s}</Badge>
                    ))}
                    {similarMeta.signalsUsed.locations.slice(0, 2).map((l) => (
                      <Badge key={l} variant="outline" className="text-xs capitalize">{l}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {similarJobs.length > 0 && (
              <div className="space-y-1">
                {similarJobs.map((sj) => (
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
                        onClick={() => handleAddSimilarJob(sj.url)}
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
        </>
      )}
    </div>
  )
}
