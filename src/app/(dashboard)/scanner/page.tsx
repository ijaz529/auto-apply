"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Radar,
  Loader2,
  Settings2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/status-badge"
import {
  formatCompaniesText,
  formatLinkedInText,
  parseCompaniesText,
  parseLinkedInText,
} from "@/lib/scanner/text-config"
import type { ScanEntry } from "@/lib/scanner"

interface ScanResult {
  id: string
  url: string
  title: string
  company: string
  location: string | null
  source: string
  status: string
  firstSeen: string
}

interface ScanConfig {
  id?: string
  companies: string
  linkedinSearches: string
  positiveKeywords: string
  negativeKeywords: string
  frequency: string
  lastRun: string | null
  enabled: boolean
  resultsCount: number
}

interface ScanResponse {
  scan?: {
    id: string
    lastRun: string | null
    resultsCount: number
    scanResults: ScanResult[]
  }
  scans?: {
    id: string
    lastRun: string | null
    resultsCount: number
    scanResults: ScanResult[]
    portalsConfig: { companies?: string }
    titleFilter: { positive?: string; negative?: string }
    frequencyDays: number
    enabled: boolean
  }[]
}

const PORTAL_PRESETS: Record<string, string> = {
  "Berlin Tech": [
    "Delivery Hero | https://boards.greenhouse.io/deliveryhero",
    "N26 | https://boards.greenhouse.io/n26",
    "Trade Republic | https://boards.greenhouse.io/traderepublic",
    "Zalando | https://jobs.zalando.com",
    "SoundCloud | https://boards.greenhouse.io/soundcloud",
    "Auto1 Group | https://boards.greenhouse.io/auto1group",
    "Contentful | https://boards.greenhouse.io/contentful",
    "GetYourGuide | https://boards.greenhouse.io/getyourguide",
    "Personio | https://boards.greenhouse.io/personio",
    "Taxfix | https://jobs.ashbyhq.com/taxfix",
    "Omio | https://boards.greenhouse.io/omio",
    "Babbel | https://boards.greenhouse.io/babbel",
  ].join("\n"),
  "Dubai Fintech": [
    "Careem | https://boards.greenhouse.io/careem",
    "Tabby | https://jobs.ashbyhq.com/tabby",
    "Tamara | https://boards.greenhouse.io/tamara",
    "Sarwa | https://boards.greenhouse.io/sarwa",
    "Wahed | https://boards.greenhouse.io/wahed",
    "Baraka | https://boards.greenhouse.io/baraka",
    "NymCard | https://boards.greenhouse.io/nymcard",
    "Ziina | https://boards.greenhouse.io/ziina",
  ].join("\n"),
  "Global Remote": [
    "GitLab | https://boards.greenhouse.io/gitlab",
    "Automattic | https://boards.greenhouse.io/automattic",
    "Zapier | https://boards.greenhouse.io/zapier",
    "Deel | https://jobs.ashbyhq.com/Deel",
    "Remote | https://boards.greenhouse.io/remotecom",
    "Doist | https://boards.greenhouse.io/doist",
    "Buffer | https://boards.greenhouse.io/buffer",
    "Hotjar | https://boards.greenhouse.io/hotjar",
  ].join("\n"),
}

export default function ScannerPage() {
  const [results, setResults] = useState<ScanResult[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [config, setConfig] = useState<ScanConfig>({
    companies: "",
    linkedinSearches: "",
    positiveKeywords: "",
    negativeKeywords: "",
    frequency: "7",
    lastRun: null,
    enabled: true,
    resultsCount: 0,
  })
  const [configSaving, setConfigSaving] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/scanner")
      if (res.ok) {
        const data: ScanResponse = await res.json()

        // Handle both single scan and array of scans
        const scan = data.scan ?? data.scans?.[0]
        if (scan) {
          setResults(scan.scanResults ?? [])
          setConfig((prev) => ({
            ...prev,
            id: scan.id,
            lastRun: scan.lastRun,
            resultsCount: scan.resultsCount,
          }))

          // Load config from scan if available
          const fullScan = data.scans?.[0]
          if (fullScan) {
            // portalsConfig is now an array of ScanEntry (mixed ATS +
            // LinkedIn); old broken saves stored { companies: string } —
            // fall back gracefully.
            let companiesText = ""
            let linkedinText = ""
            const pc = fullScan.portalsConfig
            if (Array.isArray(pc)) {
              const entries = pc as ScanEntry[]
              companiesText = formatCompaniesText(entries).text
              linkedinText = formatLinkedInText(entries)
            } else if (
              pc &&
              typeof pc === "object" &&
              typeof (pc as { companies?: unknown }).companies === "string"
            ) {
              companiesText = (pc as { companies: string }).companies
            }
            // titleFilter.positive/negative are string[] post-fix; old saves
            // stored them as a single comma-separated string. Render both as
            // a comma-joined string for the single-line Input.
            const tf = fullScan.titleFilter as
              | { positive?: string | string[]; negative?: string | string[] }
              | undefined
            const toCsv = (v: string | string[] | undefined) =>
              Array.isArray(v) ? v.join(", ") : v ?? ""
            setConfig((prev) => ({
              ...prev,
              companies: companiesText,
              linkedinSearches: linkedinText,
              positiveKeywords: toCsv(tf?.positive),
              negativeKeywords: toCsv(tf?.negative),
              frequency: String(fullScan.frequencyDays ?? 7),
              enabled: fullScan.enabled,
            }))
          }
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleScan() {
    setScanning(true)
    setScanMessage(null)
    try {
      const res = await fetch("/api/scanner/run", { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        const count = data.newResults ?? data.resultsCount ?? 0
        setScanMessage(
          count > 0
            ? `Found ${count} new job${count === 1 ? "" : "s"}!`
            : "Scan complete. No new jobs found matching your criteria."
        )
        await fetchData()
      } else {
        const err = await res.json().catch(() => ({ error: "Scan failed" }))
        setScanMessage(err.error ?? "Scan failed. Check your configuration.")
      }
    } catch {
      setScanMessage("Scan failed. Check your network connection.")
    } finally {
      setScanning(false)
    }
  }

  async function handleConfigSave() {
    setConfigSaving(true)
    try {
      // Both textareas merge into a single ScanEntry[] for portalsConfig.
      // Companies live in the ATS textarea (Name | URL per line); LinkedIn
      // searches live in their own textarea (keywords | location | time_range).
      const portalsConfig: ScanEntry[] = [
        ...parseCompaniesText(config.companies),
        ...parseLinkedInText(config.linkedinSearches),
      ]
      // Keyword inputs are single-line, comma-separated. Earlier I split on
      // \n by mistake — fixed here to split on `,`.
      const positive = config.positiveKeywords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const negative = config.negativeKeywords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const payload = {
        portalsConfig,
        titleFilter: { positive, negative },
        frequencyDays: parseInt(config.frequency, 10) || 7,
        enabled: config.enabled,
      }

      await fetch("/api/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    } catch {
      // handle error
    } finally {
      setConfigSaving(false)
    }
  }

  function applyPreset(presetName: string) {
    const preset = PORTAL_PRESETS[presetName]
    if (preset) {
      setConfig((prev) => ({
        ...prev,
        companies: prev.companies
          ? prev.companies + "\n" + preset
          : preset,
      }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scanner</h1>
          <p className="text-muted-foreground mt-1">
            Scan job portals for new opportunities matching your profile.
          </p>
          {config.lastRun && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last scan: {new Date(config.lastRun).toLocaleString()}
            </p>
          )}
        </div>
        <Button onClick={handleScan} disabled={scanning}>
          {scanning ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Radar className="mr-2 h-4 w-4" />
          )}
          {scanning ? "Scanning..." : "Run Scan"}
        </Button>
      </div>

      {/* Scan result message */}
      {scanMessage && (
        <Card>
          <CardContent className="py-3">
            <p className="text-sm">{scanMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Configuration Section */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setConfigOpen(!configOpen)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Scanner Configuration</CardTitle>
            </div>
            {configOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          {!configOpen && (
            <CardDescription>
              Click to configure tracked companies, keywords, and scan frequency.
            </CardDescription>
          )}
        </CardHeader>
        {configOpen && (
          <CardContent className="space-y-4">
            {/* Portal Presets */}
            <div className="space-y-2">
              <Label>Quick Add Portal Presets</Label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(PORTAL_PRESETS).map((name) => (
                  <Button
                    key={name}
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(name)}
                  >
                    <Zap className="mr-1 h-3 w-3" />
                    {name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companies">
                Tracked Companies (one per line: name | URL)
              </Label>
              <Textarea
                id="companies"
                value={config.companies}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, companies: e.target.value }))
                }
                placeholder={
                  "Stripe | https://boards.greenhouse.io/stripe\n" +
                  "Vercel | https://boards.greenhouse.io/vercel\n" +
                  "Linear | https://jobs.ashbyhq.com/linear"
                }
                rows={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedinSearches">
                LinkedIn Searches (one per line: keywords | location | time_range)
              </Label>
              <Textarea
                id="linkedinSearches"
                value={config.linkedinSearches}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    linkedinSearches: e.target.value,
                  }))
                }
                placeholder={
                  "Senior Product Manager | Berlin, Germany | r604800\n" +
                  "Product Operations | Dubai, United Arab Emirates"
                }
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Hits LinkedIn&apos;s unauthenticated jobs-guest endpoint. <code>time_range</code> is optional —{" "}
                <code>r604800</code> = past 7 days, <code>r86400</code> = past 24 h, <code>r2592000</code> = past 30 days. Defaults to 7 days when omitted.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="positiveKeywords">
                  Positive Keywords (comma-separated)
                </Label>
                <Input
                  id="positiveKeywords"
                  value={config.positiveKeywords}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      positiveKeywords: e.target.value,
                    }))
                  }
                  placeholder="product, operations, strategy, AI"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="negativeKeywords">
                  Negative Keywords (comma-separated)
                </Label>
                <Input
                  id="negativeKeywords"
                  value={config.negativeKeywords}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      negativeKeywords: e.target.value,
                    }))
                  }
                  placeholder="intern, junior, sales, recruiter"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Scan Frequency</Label>
              <Select
                value={config.frequency}
                onValueChange={(val) =>
                  setConfig((prev) => ({ ...prev, frequency: val ?? "7" }))
                }
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Daily</SelectItem>
                  <SelectItem value="3">Every 3 days</SelectItem>
                  <SelectItem value="7">Weekly</SelectItem>
                  <SelectItem value="14">Every 2 weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleConfigSave}
              disabled={configSaving}
              variant="outline"
            >
              {configSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Configuration
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Scan Results</CardTitle>
            {results.length > 0 && (
              <Badge variant="secondary">{results.length} results</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-48 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Radar className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No scan results</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Configure your portals and run your first scan to discover new
                job opportunities.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>First Seen</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => (
                  <TableRow key={result.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(result.firstSeen).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">
                      {result.company}
                    </TableCell>
                    <TableCell>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
                      >
                        {result.title}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {result.location ?? "--"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {result.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={result.status} />
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
