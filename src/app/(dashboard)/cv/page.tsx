"use client"

import { useState, useRef } from "react"
import {
  Loader2,
  Upload,
  Search,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  Info,
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

interface ScanCv {
  markdown: string
  structured: unknown
  fileName: string
}

export default function CVPage() {
  // CV is held in component state only — never written to the user's profile.
  // /profile owns the primary CV; this scanner exists for one-off scans of
  // anyone's CV (your own draft, a friend's, etc).
  const [scanCv, setScanCv] = useState<ScanCv | null>(null)
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
  const [addingJobUrl, setAddingJobUrl] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [groupBy, setGroupBy] = useState<"none" | "company" | "location">("none")
  const PAGE_SIZE = 15

  async function handleCvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCvUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/cv/upload?persist=false", {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setScanCv({
          markdown: data.markdown ?? "",
          structured: data.structured ?? null,
          fileName: data.fileName ?? file.name,
        })
      }
    } catch {
      /* ignore */
    } finally {
      setCvUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDiscover() {
    if (!scanCv) return
    setDiscovering(true)
    setDiscoverJobs([])
    setDiscoverMeta(null)
    setDiscoverError(null)
    setPage(1)
    try {
      const res = await fetch("/api/jobs/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: preferences || undefined,
          cvMarkdown: scanCv.markdown,
          cvStructured: scanCv.structured,
        }),
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
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border rounded-md p-3">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Upload any CV here to scan 60+ portals for matching jobs — yours,
          a friend&apos;s, or a draft. CVs uploaded on this page are{" "}
          <strong>not saved</strong> and don&apos;t affect your primary
          profile CV.
        </span>
      </div>

      <Input
        placeholder="Remote jobs in Berlin, salary above EUR 75k, product ops..."
        value={preferences}
        onChange={(e) => setPreferences(e.target.value)}
        className="text-sm"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" className="hidden" onChange={handleCvUpload} />
        {scanCv ? (
          <>
            <div className="flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              CV ready ({scanCv.fileName})
            </div>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              {cvUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              Replace
            </Button>
            <Button size="sm" onClick={handleDiscover} disabled={discovering}>
              {discovering
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Scanning 60+ portals...</>
                : <><Search className="mr-1.5 h-3.5 w-3.5" /> Find Jobs for This CV</>
              }
            </Button>
          </>
        ) : (
          <Button onClick={() => fileInputRef.current?.click()} disabled={cvUploading}>
            {cvUploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            Upload CV to scan
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

      {discoverJobs.length > 0 && renderResults()}
    </div>
  )

  // ── Render results (grouped or paginated) ──────────────────────
  function renderResults() {
    // Group-by controls
    const controls = (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Group by:</span>
        {(["none", "company", "location"] as const).map((g) => (
          <button
            key={g}
            onClick={() => { setGroupBy(g); setPage(1) }}
            className={`px-2 py-0.5 rounded capitalize ${
              groupBy === g
                ? "bg-primary text-primary-foreground font-medium"
                : "bg-muted hover:bg-muted/70"
            }`}
          >
            {g === "none" ? "None" : g}
          </button>
        ))}
      </div>
    )

    // Job row component
    const jobRow = (dj: DiscoverJob) => (
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
            {groupBy !== "company" && <span className="font-medium">{dj.company}</span>}
            <span className="text-muted-foreground">{dj.title}</span>
          </div>
          {dj.location && groupBy !== "location" && (
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
    )

    // GROUPED VIEW — all groups visible, each with its members (no pagination inside)
    if (groupBy !== "none") {
      const groups = new Map<string, DiscoverJob[]>()
      for (const j of discoverJobs) {
        const key = groupBy === "company" ? j.company : (j.location || "Unspecified")
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(j)
      }
      // Sort groups by size (largest first), alphabetically for ties
      const sortedGroups = [...groups.entries()].sort((a, b) => {
        if (b[1].length !== a[1].length) return b[1].length - a[1].length
        return a[0].localeCompare(b[0])
      })

      return (
        <div className="space-y-4">
          {controls}
          {sortedGroups.map(([key, items]) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">{key}</h3>
                <Badge variant="outline" className="text-xs">{items.length}</Badge>
              </div>
              {items.map(jobRow)}
            </div>
          ))}
        </div>
      )
    }

    // PAGINATED VIEW
    const totalPages = Math.max(1, Math.ceil(discoverJobs.length / PAGE_SIZE))
    const start = (page - 1) * PAGE_SIZE
    const visible = discoverJobs.slice(start, start + PAGE_SIZE)

    return (
      <div className="space-y-2">
        {controls}
        <div className="space-y-1">
          {visible.map(jobRow)}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {discoverJobs.length} jobs
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    )
  }
}
