"use client"

import { useState, useEffect, useRef } from "react"
import {
  Loader2,
  Upload,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface DiscoverJob {
  title: string
  url: string
  company: string
  location: string
  relevance?: number
}

export default function CVPage() {
  const [hasCV, setHasCV] = useState<boolean | null>(null)
  const [cvUploading, setCvUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preferences, setPreferences] = useState("")

  const [discoverJobs, setDiscoverJobs] = useState<DiscoverJob[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [discoverMeta, setDiscoverMeta] = useState<{
    companiesScanned: number
    totalJobsFound: number
    signalsUsed?: { domains: string[]; seniority: string[]; locations: string[] }
  } | null>(null)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [discoverVisible, setDiscoverVisible] = useState(10)
  const [addingJobUrl, setAddingJobUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) setHasCV(!!d.cvMarkdown)
      })
      .catch(() => setHasCV(false))
  }, [])

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

  async function handleDiscover() {
    setDiscovering(true)
    setDiscoverJobs([])
    setDiscoverMeta(null)
    setDiscoverError(null)
    setDiscoverVisible(10)
    try {
      const res = await fetch("/api/jobs/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: preferences || undefined }),
      })
      if (res.ok) {
        const data = await res.json()
        setDiscoverJobs(data.jobs ?? [])
        setDiscoverMeta(data.meta ?? null)
      } else {
        const data = await res.json().catch(() => ({}))
        setDiscoverError(data.error || "Search failed.")
      }
    } catch {
      setDiscoverError("Network error.")
    } finally {
      setDiscovering(false)
    }
  }

  async function handleAddDiscoverJob(jobUrl: string) {
    setAddingJobUrl(jobUrl)
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [jobUrl] }),
      })
      if (res.ok) {
        setDiscoverJobs((prev) => prev.filter((j) => j.url !== jobUrl))
      }
    } catch { /* ignore */ } finally {
      setAddingJobUrl(null)
    }
  }

  return (
    <div className="space-y-6">
      <Input
        placeholder="Remote jobs in Berlin, salary above EUR 75k, product ops..."
        value={preferences}
        onChange={(e) => setPreferences(e.target.value)}
        className="text-sm"
      />

      <div className="flex items-center gap-3 flex-wrap">
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
            <Button size="sm" onClick={handleDiscover} disabled={discovering}>
              {discovering
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Scanning 60+ portals...</>
                : <><Search className="mr-1.5 h-3.5 w-3.5" /> Find Jobs for My CV</>
              }
            </Button>
          </>
        ) : (
          <Button onClick={() => fileInputRef.current?.click()} disabled={cvUploading}>
            {cvUploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload CV
          </Button>
        )}
      </div>

      {discoverError && (
        <p className="text-sm text-destructive flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {discoverError}
        </p>
      )}

      {discoverMeta && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Scanned {discoverMeta.companiesScanned} companies, {discoverMeta.totalJobsFound} total jobs, {discoverJobs.length} matches for your CV.
          </p>
          {discoverMeta.signalsUsed && (
            <div className="flex flex-wrap gap-1">
              {discoverMeta.signalsUsed.domains.slice(0, 6).map((d) => (
                <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
              ))}
              {discoverMeta.signalsUsed.seniority.map((s) => (
                <Badge key={s} variant="outline" className="text-xs capitalize">{s}</Badge>
              ))}
              {discoverMeta.signalsUsed.locations.slice(0, 2).map((l) => (
                <Badge key={l} variant="outline" className="text-xs capitalize">{l}</Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {discoverJobs.length > 0 && (
        <div className="space-y-1">
          {discoverJobs.slice(0, discoverVisible).map((dj) => (
            <div
              key={dj.url}
              className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {dj.relevance != null && (
                    <span className={`inline-flex items-center justify-center h-5 min-w-[2rem] px-1 rounded text-xs font-bold ${
                      dj.relevance >= 70 ? "bg-green-100 text-green-800" :
                      dj.relevance >= 40 ? "bg-amber-100 text-amber-800" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {dj.relevance}%
                    </span>
                  )}
                  <span className="font-medium">{dj.company}</span>
                  <span className="text-muted-foreground">{dj.title}</span>
                </div>
                {dj.location && (
                  <p className="text-xs text-muted-foreground mt-0.5">{dj.location}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={dj.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={addingJobUrl === dj.url}
                  onClick={() => handleAddDiscoverJob(dj.url)}
                  title="Add to Jobs tab for evaluation"
                >
                  {addingJobUrl === dj.url
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Plus className="h-3.5 w-3.5" />
                  }
                </Button>
              </div>
            </div>
          ))}
          {discoverVisible < discoverJobs.length && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setDiscoverVisible((v) => v + 20)}
            >
              Show more ({discoverJobs.length - discoverVisible} remaining)
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
