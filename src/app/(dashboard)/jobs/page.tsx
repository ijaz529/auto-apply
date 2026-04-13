"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Plus,
  Loader2,
  ExternalLink,
  ChevronRight,
  Briefcase,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [urls, setUrls] = useState("")
  const [preferences, setPreferences] = useState("")
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs")
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs ?? [])
      }
    } catch {
      // silently fail on fetch
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  async function handleSubmit() {
    const urlList = urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean)

    if (urlList.length === 0) {
      setError("Please enter at least one job URL.")
      return
    }

    if (urlList.length > 3) {
      setError("Maximum 3 URLs at a time.")
      return
    }

    setError(null)
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

      setUrls("")
      setPreferences("")
      setDialogOpen(false)
      await fetchJobs()
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground mt-1">
            Track and evaluate job opportunities.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Job URLs
              </Button>
            }
          />
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Job URLs</DialogTitle>
              <DialogDescription>
                Paste up to 3 job posting URLs (one per line). Each will be
                evaluated automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="urls">Job URLs</Label>
                <Textarea
                  id="urls"
                  placeholder={"https://boards.greenhouse.io/company/jobs/123\nhttps://jobs.lever.co/company/456"}
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  One URL per line, maximum 3.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferences">Preferences (optional)</Label>
                <Input
                  id="preferences"
                  placeholder="remote, in Berlin, salary above $100k, etc."
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  "Evaluate Jobs"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Jobs</CardTitle>
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
                Add job URLs to get started. Each job will be automatically
                evaluated and scored.
              </p>
            </div>
          ) : (
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
                    <TableCell className="font-medium">
                      {job.company}
                    </TableCell>
                    <TableCell>{job.role}</TableCell>
                    <TableCell>
                      {job.score != null ? (
                        <ScoreBadge score={job.score} />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="icon-sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                        <Link href={`/jobs/${job.id}`}>
                          <Button variant="ghost" size="icon-sm">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
