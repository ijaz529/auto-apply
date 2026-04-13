"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Search, Briefcase, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

  const fetchApplications = useCallback(async () => {
    try {
      const res = await fetch("/api/applications")
      if (res.ok) {
        const data = await res.json()
        setApplications(data.applications ?? [])
      }
    } catch {
      // silently fail
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
      if (res.ok) {
        setApplications((prev) =>
          prev.map((app) =>
            app.id === appId ? { ...app, status: newStatus } : app
          )
        )
      }
    } catch {
      // silently fail
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
        <p className="text-muted-foreground mt-1">
          Track your application statuses and follow-ups.
        </p>
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
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by company, role, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
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
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
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
                  ? "Evaluate a job to create your first application."
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
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs">
                      {app.notes || "--"}
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
