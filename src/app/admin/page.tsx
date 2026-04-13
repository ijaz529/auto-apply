import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import Link from "next/link"
import {
  Users,
  Briefcase,
  FileText,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

async function getAdminStats() {
  const [totalUsers, totalJobs, totalApplications, totalEvaluations, recentUsers] =
    await Promise.all([
      prisma.user.count(),
      prisma.job.count(),
      prisma.application.count(),
      prisma.evaluation.count(),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { jobs: true },
          },
        },
      }),
    ])

  return { totalUsers, totalJobs, totalApplications, totalEvaluations, recentUsers }
}

function HealthIndicator({
  label,
  healthy,
  detail,
}: {
  label: string
  healthy: boolean | null
  detail: string
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-2">
        {healthy === true && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        {healthy === false && <XCircle className="h-4 w-4 text-red-600" />}
        {healthy === null && <AlertCircle className="h-4 w-4 text-yellow-600" />}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  )
}

export default async function AdminPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/")
  }

  const { totalUsers, totalJobs, totalApplications, totalEvaluations, recentUsers } =
    await getAdminStats()

  // System health checks
  const apiKeyConfigured = !!process.env.ANTHROPIC_API_KEY
  let dbConnected = false
  try {
    await prisma.$queryRaw`SELECT 1`
    dbConnected = true
  } catch {
    dbConnected = false
  }

  let typstAvailable: boolean | null = null
  try {
    const { execFile } = await import("child_process")
    const { promisify } = await import("util")
    const execFileAsync = promisify(execFile)
    const candidates = ["/opt/homebrew/bin/typst", "/usr/local/bin/typst", "/usr/bin/typst", "typst"]
    for (const bin of candidates) {
      try {
        await execFileAsync(bin, ["--version"], { timeout: 5000 })
        typstAvailable = true
        break
      } catch {
        continue
      }
    }
    if (typstAvailable === null) typstAvailable = false
  } catch {
    typstAvailable = false
  }

  const statsCards = [
    { title: "Total Users", value: totalUsers, icon: Users },
    { title: "Total Jobs", value: totalJobs, icon: Briefcase },
    { title: "Total Applications", value: totalApplications, icon: FileText },
    { title: "Total Evaluations", value: totalEvaluations, icon: BarChart3 },
  ]

  return (
    <div className="container mx-auto max-w-6xl py-10 px-4">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            System administration, user management, and health monitoring.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statsCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <HealthIndicator
              label="API Key (Anthropic)"
              healthy={apiKeyConfigured}
              detail={apiKeyConfigured ? "Configured" : "ANTHROPIC_API_KEY not set"}
            />
            <HealthIndicator
              label="Database"
              healthy={dbConnected}
              detail={dbConnected ? "Connected" : "Connection failed"}
            />
            <HealthIndicator
              label="Typst Compiler"
              healthy={typstAvailable}
              detail={
                typstAvailable === true
                  ? "Available"
                  : typstAvailable === false
                    ? "Not found in PATH"
                    : "Unknown"
              }
            />
          </CardContent>
        </Card>

        {/* Recent Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Users</CardTitle>
            <Button variant="outline" size="sm" render={<Link href="/admin/users" />}>
              View All Users
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No users registered yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Jobs</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.name ?? "Unnamed"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === "ADMIN" ? "default" : "secondary"}
                        >
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{user._count.jobs}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" render={<Link href="/admin/users" />}>
                <Users className="mr-2 h-4 w-4" />
                View All Users
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
