"use client"

import { useState, useEffect, useCallback } from "react"
import {
  BarChart3,
  Loader2,
  TrendingUp,
  Target,
  Percent,
  Clock,
  Lightbulb,
  Calendar,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScoreBadge } from "@/components/score-badge"

interface AnalyticsData {
  totalEvaluated: number
  totalApplied: number
  responseRate: number
  avgScore: number
  funnel: {
    stage: string
    count: number
  }[]
  scoreDistribution: {
    range: string
    count: number
    applied: number
    responded: number
  }[]
  topArchetypes: {
    name: string
    count: number
    avgScore: number
  }[]
  recommendations?: string[]
}

interface FollowUpData {
  upcoming: {
    id: string
    dueDate: string
    channel: string
    contact: string | null
    completed: boolean
    application: {
      id: string
      status: string
      job: {
        company: string
        role: string
      }
    }
  }[]
  overdue: number
  dueThisWeek: number
}

const emptyAnalytics: AnalyticsData = {
  totalEvaluated: 0,
  totalApplied: 0,
  responseRate: 0,
  avgScore: 0,
  funnel: [],
  scoreDistribution: [],
  topArchetypes: [],
  recommendations: [],
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="pt-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-8 w-12" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-6 w-full" />
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData>(emptyAnalytics)
  const [followUps, setFollowUps] = useState<FollowUpData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAnalytics = useCallback(async () => {
    try {
      const [patternsRes, followUpRes] = await Promise.all([
        fetch("/api/analytics/patterns"),
        fetch("/api/analytics/followup"),
      ])

      if (patternsRes.ok) {
        const json = await patternsRes.json()
        setData({
          totalEvaluated: json.totalEvaluated ?? json.total ?? 0,
          totalApplied: json.totalApplied ?? 0,
          responseRate: json.responseRate ?? 0,
          avgScore: json.avgScore ?? 0,
          funnel: json.funnel ?? [],
          scoreDistribution: json.scoreDistribution ?? [],
          topArchetypes: json.topArchetypes ?? [],
          recommendations: json.recommendations ?? [],
        })
      }

      if (followUpRes.ok) {
        const json = await followUpRes.json()
        setFollowUps(json)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const hasData = data.totalEvaluated > 0

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Insights into your job search performance and patterns.
          </p>
        </div>
        <StatsSkeleton />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <ChartSkeleton />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <ChartSkeleton />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Insights into your job search performance and patterns.
          </p>
        </div>
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No data yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Analytics will appear once you have evaluated and applied to
                several jobs. Track rejection patterns, score distributions, and
                response rates.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const maxFunnelCount = Math.max(...data.funnel.map((f) => f.count), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Insights into your job search performance and patterns.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 flex flex-col">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Total Evaluated
              </span>
            </div>
            <span className="text-2xl font-bold mt-1">
              {data.totalEvaluated}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex flex-col">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Applied</span>
            </div>
            <span className="text-2xl font-bold mt-1 text-green-600">
              {data.totalApplied}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex flex-col">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Response Rate
              </span>
            </div>
            <span className="text-2xl font-bold mt-1">
              {data.responseRate.toFixed(0)}%
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex flex-col">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Score</span>
            </div>
            <span className="text-2xl font-bold mt-1">
              {data.avgScore.toFixed(1)}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.funnel.length > 0 ? (
                data.funnel.map((stage) => (
                  <div key={stage.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{stage.stage}</span>
                      <span className="font-medium">{stage.count}</span>
                    </div>
                    <div className="h-6 w-full rounded bg-muted overflow-hidden">
                      <div
                        className="h-full rounded bg-primary transition-all"
                        style={{
                          width: `${(stage.count / maxFunnelCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No funnel data yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.scoreDistribution.length > 0 ? (
                data.scoreDistribution.map((bucket) => {
                  const maxCount = Math.max(
                    ...data.scoreDistribution.map((b) => b.count),
                    1
                  )
                  return (
                    <div key={bucket.range} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{bucket.range}</span>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span>{bucket.count} total</span>
                          <span>{bucket.applied} applied</span>
                          <span>{bucket.responded} responded</span>
                        </div>
                      </div>
                      <div className="h-4 w-full rounded bg-muted overflow-hidden">
                        <div
                          className="h-full rounded bg-primary/70 transition-all"
                          style={{
                            width: `${(bucket.count / maxCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No score data yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Archetype Matches */}
      <Card>
        <CardHeader>
          <CardTitle>Top Archetype Matches</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topArchetypes.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.topArchetypes.map((archetype) => (
                <div
                  key={archetype.name}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{archetype.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {archetype.count} matches
                    </p>
                  </div>
                  <ScoreBadge score={archetype.avgScore} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Archetype data will appear after evaluating multiple jobs.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Follow-up Schedule */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Follow-up Schedule
            </CardTitle>
            {followUps && (
              <div className="flex gap-2">
                {followUps.overdue > 0 && (
                  <Badge variant="destructive">
                    {followUps.overdue} overdue
                  </Badge>
                )}
                {followUps.dueThisWeek > 0 && (
                  <Badge variant="secondary">
                    {followUps.dueThisWeek} this week
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {followUps && followUps.upcoming.length > 0 ? (
            <div className="space-y-2">
              {followUps.upcoming.map((fu) => {
                const due = new Date(fu.dueDate)
                const now = new Date()
                const isOverdue = due < now && !fu.completed
                return (
                  <div
                    key={fu.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {fu.application.job.company}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fu.application.job.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {fu.channel}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span
                          className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}
                        >
                          {due.toLocaleDateString()}
                        </span>
                      </div>
                      {fu.completed && (
                        <Badge variant="secondary" className="text-xs">
                          Done
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No follow-ups scheduled. Follow-ups are created when you apply to
              jobs.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recommendations.map((rec, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
