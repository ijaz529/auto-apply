export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
          AA
        </div>
        <span className="text-2xl font-bold">AutoApply</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-xs text-muted-foreground">
        AI-powered job search automation
      </p>
    </div>
  )
}
