"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { signOut, useSession } from "next-auth/react"
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Radar,
  GraduationCap,
  BarChart3,
  Settings,
  LogOut,
  UserPlus,
  AlertCircle,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"

const navItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Jobs", href: "/jobs", icon: Briefcase },
  { title: "Applications", href: "/applications", icon: FileText },
  { title: "Scanner", href: "/scanner", icon: Radar },
  { title: "Interview Prep", href: "/interview-prep", icon: GraduationCap },
  { title: "Analytics", href: "/analytics", icon: BarChart3 },
  { title: "Settings", href: "/settings", icon: Settings },
]

function DashboardSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isGuest = !session?.user

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/jobs" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
            AA
          </div>
          <span className="text-lg font-semibold">AutoApply</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
                    render={<Link href={item.href} />}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          {isGuest ? (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  G
                </div>
                <span>Guest</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => (window.location.href = "/register")}
              >
                <UserPlus className="mr-2 h-3.5 w-3.5" />
                Sign up to save data
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {session.user.name?.[0]?.toUpperCase() ?? "U"}
                </div>
                <span className="truncate">
                  {session.user.name ?? session.user.email}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign out
              </Button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function OnboardingBanner() {
  const [show, setShow] = useState(false)
  const { data: session } = useSession()

  useEffect(() => {
    // Only check for logged-in users
    if (!session?.user?.id) return

    async function check() {
      try {
        const res = await fetch("/api/onboarding/status")
        if (res.ok) {
          const data = await res.json()
          if (!data.onboardingComplete) setShow(true)
        }
      } catch {
        // ignore
      }
    }
    check()
  }, [session?.user?.id])

  if (!show) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50 px-4 py-3 text-sm">
      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="flex-1">
        Complete your onboarding to get the most out of AutoApply.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => (window.location.href = "/onboarding")}
      >
        Complete Setup
      </Button>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
        </header>
        <main className="flex-1 p-6 space-y-4">
          <OnboardingBanner />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
