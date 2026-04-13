"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Loader2,
  ExternalLink,
  ChevronRight,
  Briefcase,
  Search,
  FileUp,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScoreBadge } from "@/components/score-badge"
import { StatusBadge } from "@/components/status-badge"

interface Job {
  id: string
  company: string
  role: string
  score: number | null
  status: string
  url: string
  createdAt: string
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [urls, setUrls] = useState("")
  const [preferences, setPreferences] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [hasCV, setHasCV] = useState<boolean | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs")
      if (res.ok) {
        const data = await res.json()
        const jobList = (data.jobs ?? []).map((j: {
          id: string
          company: string
          role: string
          url: string
          createdAt: string
          evaluation?: { score: number }
          application?: { status: string }
        }) => ({
          id: j.id,
          company: j.company,
          role: j.role,
          url: j.url,
          createdAt: j.createdAt,
          score: j.evaluation?.score ?? null,
          status: j.application?.status ?? "pending",
        }))
        setJobs(jobList)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  const checkCV = useCallback(async () => {
    try {
      const res = await fetch("/api/profile")
      if (res.ok) {
        const data = await res.json()
        setHasCV(!!data.cvMarkdown)
      }
    } catch {
      setHasCV(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    checkCV()
  }, [fetchJobs, checkCV])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const urlList = urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean)

    if (urlList.length === 0) {
      setError("Please enter at least one job URL.")
      return
    }

    if (urlList.length > 5) {
      setError("Maximum 5 URLs at a time.")
      return
    }

    setError(null)
    setSuccess(null)
    setSubmitting(true)

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlList, preferences }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Failed to submit jobs.")
        return
      }

      const data = await res.json()
      setSuccess(`${data.jobs?.length ?? urlList.length} job(s) added. Evaluation will begin shortly.`)
      setUrls("")
      setPreferences("")
      await fetchJobs()
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
        <p className="text-muted-foreground mt-1">
          Paste job URLs to evaluate and track opportunities.
        </p>
      </div>

      {/* CV reminder */}
      {hasCV === false && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex items-center gap-4 py-4">
            <FileUp className="h-8 w-8 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Upload your CV first</p>
              <p className="text-sm text-muted-foreground">
                For best results, upload your CV before evaluating jobs. The AI uses it to match your experience against job requirements.
              </p>
            </div>
            <Link href="/settings">
              <Button variant="outline" size="sm">
                Upload CV
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Add Jobs - inline form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Evaluate New Jobs
          </CardTitle>
          <CardDescription>
            Paste job posting URLs (one per line, up to 5). Each will be fetched, scored, and analyzed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="urls">Job URLs</Label>
              <Textarea
                id="urls"
                placeholder={"https://boards.greenhouse.io/company/jobs/123\nhttps://jobs.lever.co/company/456\nhttps://jobs.ashbyhq.com/company/789"}
                value={urls}
                onChange={(e) => {
                  setUrls(e.target.value)
                  setError(null)
                  setSuccess(null)
                }}
                rows={4}
                className="font-mono text-sm break-all"
              />
              <p className="text-xs text-muted-foreground">
                Supports Greenhouse, Ashby, Lever, and most job board URLs.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferences">
                What are you looking for? <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="preferences"
                placeholder="remote, in Berlin, salary above $100k, fintech, senior level..."
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
            )}
            {success && (
              <p className="text-sm text-green-700 bg-green-500/10 rounded-md px-3 py-2">{success}</p>
            )}
            <Button type="submit" disabled={submitting || !urls.trim()} size="lg">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching &amp; Evaluating...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Evaluate Jobs
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Evaluated Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No jobs yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Paste job URLs above to get AI-powered evaluations with match scoring, gap analysis, and tailored CVs.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.company}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{job.role}</TableCell>
                      <TableCell>
                        {job.score != null ? (
                          <ScoreBadge score={job.score} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={job.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <a href={job.url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                          <Link href={`/jobs/${job.id}`}>
                            <Button variant="ghost" size="sm">
                              View <ChevronRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
