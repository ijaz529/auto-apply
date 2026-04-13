"use client"

import { Button } from "@/components/ui/button"
import { Briefcase, FileText, Radar, Zap } from "lucide-react"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="max-w-2xl text-center space-y-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground text-lg font-bold">
            AA
          </div>
          <h1 className="text-4xl font-bold tracking-tight">AutoApply</h1>
        </div>

        {/* Tagline */}
        <p className="text-xl text-muted-foreground">
          AI-powered job search automation. Upload your CV, paste job URLs, get
          tailored applications.
        </p>

        {/* Features */}
        <div className="grid gap-4 sm:grid-cols-2 text-left">
          <div className="flex gap-3 rounded-lg border bg-card p-4">
            <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Tailored CVs</p>
              <p className="text-xs text-muted-foreground">
                Generate role-specific CVs matched to each job description.
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border bg-card p-4">
            <Briefcase className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Smart Evaluation</p>
              <p className="text-xs text-muted-foreground">
                AI scores and evaluates every job for fit, comp, and legitimacy.
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border bg-card p-4">
            <Radar className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Portal Scanner</p>
              <p className="text-xs text-muted-foreground">
                Scan 45+ company career pages automatically for new roles.
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border bg-card p-4">
            <Zap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Interview Prep</p>
              <p className="text-xs text-muted-foreground">
                STAR stories, outreach drafts, and company research on demand.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg" onClick={() => (window.location.href = "/register")}>
            Get Started
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => (window.location.href = "/login")}
          >
            Login
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Open source &middot; Built with Next.js, Prisma, and Claude
        </p>
      </div>
    </div>
  )
}
