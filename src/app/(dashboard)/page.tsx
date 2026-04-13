"use client"

import { useSession } from "next-auth/react"
import { useState, useEffect, useCallback } from "react"
import {
  Briefcase,
  FileText,
  MessageSquare,
  TrendingUp,
  Plus,
  Upload,
  Radar,
  Clock,
  ArrowRight,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

interface DashboardStats {
  totalJobs: number
  applied: number
  interviews: number
  avgScore: number | null
}

interface RecentActivity {
  id: string
  company: string
  role: string
  status: string
  score: number | null
  createdAt: string
}

interface FollowUpReminder {
  id: string
  company: string
  role: string
  dueDate: string
  channel: string
  daysOverdue: number
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const firstName = session?.user?.name?.split(" ")[0] ?? "there"

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activity, setActivity] = useState<RecentActivity[]>([])
  const [followUps, setFollowUps] = useState<FollowUpReminder[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    try {
      const [appsRes, jobsRes, followUpRes] = await Promise.all([
        fetch("/api/applications?limit=100"),
        fetch("/api/jobs?limit=5"),
        fetch("/api/analytics/followup").catch(() => null),
      ])

      // Parse stats from applications
      if (appsRes.ok) {
        const appsData = await appsRes.json()
        const apps = appsData.applications ?? []
        const applied = apps.filter(
          (a: { status: string }) => a.status !== "evaluated" && a.status !== "skip"
        ).length
        const interviews = apps.filter(
          (a: { status: string }) => a.status === "interview"
        ).length
        const scores = apps
          .map((a: { job?: { evaluation?: { score?: number } } }) => a.job?.evaluation?.score)
          .filter((s: unknown): s is number => typeof s === "number")
        const avgScore =
          scores.length > 0
            ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
            : null

        setStats({
          totalJobs: appsData.pagination?.total ?? apps.length,
          applied,
          interviews,
          avgScore,
        })
      }

      // Parse recent activity from jobs
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json()
        const jobs = jobsData.jobs ?? []
        setActivity(
          jobs.map((j: {
            id: string
            company: string
            role: string
            application?: { status: string }
            evaluation?: { score: number }
            createdAt: string
          }) => ({
            id: j.id,
            company: j.company,
            role: j.role,
            status: j.application?.status ?? "evaluated",
            score: j.evaluation?.score ?? null,
            createdAt: j.createdAt,
          }))
        )
      }

      // Parse follow-ups
      if (followUpRes && followUpRes.ok) {
        const followUpData = await followUpRes.json()
        const reminders = (followUpData.upcoming ?? []).slice(0, 3)
        setFollowUps(
          reminders.map((f: {
            id: string
            application: { job: { company: string; role: string } }
            dueDate: string
            channel: string
          }) => {
            const due = new Date(f.dueDate)
            const now = new Date()
            const diffMs = now.getTime() - due.getTime()
            const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24))
            return {
              id: f.id,
              company: f.application?.job?.company ?? "Unknown",
              role: f.application?.job?.role ?? "Unknown",
              dueDate: f.dueDate,
              channel: f.channel,
              daysOverdue: Math.max(0, daysOverdue),
            }
          })
        )
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const statCards = [
    {
      title: "Total Jobs",
      value: stats?.totalJobs ?? 0,
      icon: Briefcase,
      description: "Jobs tracked",
    },
    {
      title: "Applied",
      value: stats?.applied ?? 0,
      icon: FileText,
      description: "Applications sent",
    },
    {
      title: "Interviews",
      value: stats?.interviews ?? 0,
      icon: MessageSquare,
      description: "In progress",
    },
    {
      title: "Avg Score",
      value: stats?.avgScore != null ? stats.avgScore.toFixed(1) : "--",
      icon: TrendingUp,
      description: "Fit score",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here is an overview of your job search pipeline.
        </p>
      </div>

      {/* Stats */}
      {loading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" render={<Link href="/jobs" />}>
              View all
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ActivitySkeleton />
            ) : activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Briefcase className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No jobs tracked yet. Add a job URL to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map((item) => (
                  <Link
                    key={item.id}
                    href={`/jobs/${item.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.company}</p>
                      <p className="text-xs text-muted-foreground">{item.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.score != null && (
                        <span className="text-xs font-medium">
                          {item.score.toFixed(1)}/5
                        </span>
                      )}
                      <Badge
                        variant={
                          item.status === "applied"
                            ? "default"
                            : item.status === "interview"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Follow-up Reminders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Follow-up Reminders</CardTitle>
            <Button variant="ghost" size="sm" render={<Link href="/applications" />}>
              View all
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <ActivitySkeleton />
            ) : followUps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No follow-ups due. Apply to jobs to start tracking.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {followUps.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.company}</p>
                      <p className="text-xs text-muted-foreground">{item.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {item.channel}
                      </Badge>
                      {item.daysOverdue > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          {item.daysOverdue}d overdue
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button render={<Link href="/jobs" />}>
            <Plus className="mr-2 h-4 w-4" />
            Add Job URLs
          </Button>
          <Button variant="outline" render={<Link href="/settings" />}>
            <Upload className="mr-2 h-4 w-4" />
            Upload CV
          </Button>
          <Button variant="outline" render={<Link href="/scanner" />}>
            <Radar className="mr-2 h-4 w-4" />
            Run Scanner
          </Button>
        </div>
      </div>
    </div>
  )
}
