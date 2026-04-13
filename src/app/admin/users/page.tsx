export const dynamic = "force-dynamic"

import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import Link from "next/link"
import { ArrowLeft, Eye, ShieldCheck, ShieldOff } from "lucide-react"
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

async function toggleRole(formData: FormData) {
  "use server"

  const session = await auth()
  if (!session?.user || session.user.role !== "ADMIN") {
    return
  }

  const userId = formData.get("userId") as string
  const currentRole = formData.get("currentRole") as string

  if (!userId || userId === session.user.id) {
    return
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      role: currentRole === "ADMIN" ? "USER" : "ADMIN",
    },
  })
}

export default async function AdminUsersPage() {
  const session = await auth()

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/")
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          jobs: true,
          applications: true,
        },
      },
    },
  })

  return (
    <div className="container mx-auto max-w-6xl py-10 px-4">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" render={<Link href="/admin" />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground mt-1">
              View and manage all registered users.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Users ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
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
                    <TableHead>Applications</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
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
                      <TableCell>{user._count.applications}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<Link href={`/admin/users/${user.id}`} />}
                            title="View profile"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {user.id !== session.user.id && (
                            <form action={toggleRole}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="currentRole" value={user.role} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                title={
                                  user.role === "ADMIN"
                                    ? "Remove admin role"
                                    : "Grant admin role"
                                }
                              >
                                {user.role === "ADMIN" ? (
                                  <ShieldOff className="h-3.5 w-3.5" />
                                ) : (
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </form>
                          )}
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
    </div>
  )
}
