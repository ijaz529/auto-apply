"use client"

import Link from "next/link"
import { signOut, useSession } from "next-auth/react"
import { LogOut, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session } = useSession()
  const isGuest = !session?.user

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-2xl mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/jobs" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
              AA
            </div>
            <span className="font-semibold">AutoApply</span>
          </Link>
          {isGuest ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => (window.location.href = "/register")}
            >
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Sign up
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground truncate max-w-[150px]">
                {session.user.name ?? session.user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4 pt-6">
        {children}
      </main>
    </div>
  )
}
