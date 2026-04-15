"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Briefcase, FileText, Plus, Trash2, Check, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
import { APPLICATION_STATES } from "@/lib/constants/states"
import { ScoreBadge } from "@/components/score-badge"
import { StatusBadge } from "@/components/status-badge"

interface Application {
  id: string
  number: number
  date: string
  company: string
  role: string
  score: number | null
  status: string
  hasPdf: boolean
  reportId: string | null
  notes: string
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [addOpen, setAddOpen] = useState(false)

  const fetchApplications = useCallback(async () => {
    try {
      const res = await fetch("/api/applications")
      if (res.ok) {
        const data = await res.json()
        setApplications(data.applications ?? [])
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? `Failed to load (HTTP ${res.status})`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  async function handleStatusChange(appId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? `Update failed (HTTP ${res.status})`)
        return
      }
      setApplications((prev) =>
        prev.map((app) =>
          app.id === appId ? { ...app, status: newStatus } : app
        )
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error")
    }
  }

  async function handleNotesSave(appId: string, notes: string) {
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? `Update failed (HTTP ${res.status})`)
        return false
      }
      setApplications((prev) =>
        prev.map((app) => (app.id === appId ? { ...app, notes } : app))
      )
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error")
      return false
    }
  }

  async function handleDelete(appId: string) {
    if (!confirm("Delete this application? This cannot be undone.")) return
    try {
      const res = await fetch(`/api/applications/${appId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? `Delete failed (HTTP ${res.status})`)
        return
      }
      setApplications((prev) => prev.filter((a) => a.id !== appId))
      toast.success("Application deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error")
    }
  }

  const filtered = applications.filter((app) => {
    const matchesSearch =
      searchQuery === "" ||
      app.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.notes.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus =
      statusFilter === "all" || app.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const stats = {
    total: applications.length,
    applied: applications.filter((a) => a.status === "applied").length,
    interviews: applications.filter((a) => a.status === "interview").length,
    offers: applications.filter((a) => a.status === "offer").length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Applied</h1>
          <p className="text-muted-foreground mt-1">
            Track your application statuses and follow-ups.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add application
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card size="sm">
          <CardContent className="flex flex-col">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-2xl font-bold">{stats.total}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col">
            <span className="text-xs text-muted-foreground">Applied</span>
            <span className="text-2xl font-bold text-green-600">
              {stats.applied}
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col">
            <span className="text-xs text-muted-foreground">Interviews</span>
            <span className="text-2xl font-bold text-yellow-600">
              {stats.interviews}
            </span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col">
            <span className="text-xs text-muted-foreground">Offers</span>
            <span className="text-2xl font-bold text-emerald-600">
              {stats.offers}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Input
            placeholder="Search by company, role, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val ?? "all")}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {APPLICATION_STATES.map((state) => (
              <SelectItem key={state.value} value={state.value}>
                {state.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Applications Table */}
      <Card>
        <CardHeader>
          <CardTitle>Application Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">
                {applications.length === 0
                  ? "No applications yet"
                  : "No matching applications"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {applications.length === 0
                  ? "Click ‘Add application’ to record a job you applied to outside the tool, or mark a discovered job as applied from the Jobs tab."
                  : "Try adjusting your search or filter."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12">PDF</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="text-muted-foreground">
                      {app.number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {app.date}
                    </TableCell>
                    <TableCell className="font-medium">
                      {app.company}
                    </TableCell>
                    <TableCell>{app.role}</TableCell>
                    <TableCell>
                      {app.score != null ? (
                        <ScoreBadge score={app.score} />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          --
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={app.status}
                        onValueChange={(val) =>
                          val && handleStatusChange(app.id, val)
                        }
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs">
                          <StatusBadge status={app.status} />
                        </SelectTrigger>
                        <SelectContent>
                          {APPLICATION_STATES.map((state) => (
                            <SelectItem
                              key={state.value}
                              value={state.value}
                            >
                              {state.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {app.hasPdf ? (
                        <span className="text-green-600">PDF</span>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {app.reportId ? (
                        <Link href={`/jobs/${app.reportId}`}>
                          <Button variant="ghost" size="xs">
                            <FileText className="mr-1 h-3 w-3" />
                            View
                          </Button>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          --
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <NotesCell
                        initial={app.notes}
                        onSave={(next) => handleNotesSave(app.id, next)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => handleDelete(app.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <AddApplicationDialog
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false)
            fetchApplications()
          }}
        />
      )}
    </div>
  )
}

// ── Inline notes editor ───────────────────────────────────────────

function NotesCell({
  initial,
  onSave,
}: {
  initial: string
  onSave: (next: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setValue(initial)
  }, [initial, editing])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-xs text-muted-foreground hover:text-foreground w-full truncate"
        title="Click to edit"
      >
        {initial || <span className="italic">add notes…</span>}
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        autoFocus
        className="text-xs"
      />
      <div className="flex gap-1 justify-end">
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setValue(initial)
            setEditing(false)
          }}
          disabled={saving}
        >
          <X className="h-3 w-3" />
        </Button>
        <Button
          size="xs"
          onClick={async () => {
            setSaving(true)
            const ok = await onSave(value)
            setSaving(false)
            if (ok) setEditing(false)
          }}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  )
}

// ── Manual add dialog ─────────────────────────────────────────────

function AddApplicationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    company: "",
    role: "",
    url: "",
    status: "applied",
    notes: "",
    appliedAt: new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: form.company,
          role: form.role,
          url: form.url || undefined,
          status: form.status,
          notes: form.notes || undefined,
          appliedAt: form.appliedAt ? new Date(form.appliedAt).toISOString() : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? `Create failed (HTTP ${res.status})`)
        return
      }
      toast.success("Application added")
      onCreated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={submit}
        className="bg-background border rounded-lg p-6 w-full max-w-lg space-y-4"
      >
        <div>
          <h3 className="font-semibold text-lg">Add application</h3>
          <p className="text-sm text-muted-foreground">
            For jobs you applied to outside the tool.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Company</label>
            <Input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <Input
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Job URL <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            type="url"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <Select
              value={form.status}
              onValueChange={(val) => val && setForm({ ...form, status: val })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLICATION_STATES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Applied on</label>
            <Input
              type="date"
              value={form.appliedAt}
              onChange={(e) => setForm({ ...form, appliedAt: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Notes <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !form.company || !form.role}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Add
          </Button>
        </div>
      </form>
    </div>
  )
}
