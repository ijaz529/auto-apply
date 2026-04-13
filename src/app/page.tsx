import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          AutoApply
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
          AI-powered job search automation. Upload your CV, paste job URLs, get
          tailored applications.
        </p>
        <div className="mt-10 flex gap-4">
          <Button size="lg" render={<Link href="/register" />}>
            Get Started
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/login" />}>
            Login
          </Button>
        </div>
      </main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        Powered by career-ops methodology by{" "}
        <a
          href="https://github.com/santifer/career-ops"
          className="underline underline-offset-4 hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          santifer
        </a>
        . Templates by Stephen Xu and{" "}
        <a
          href="https://github.com/Harkunwar/attractive-typst-resume"
          className="underline underline-offset-4 hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          Harkunwar Kochar
        </a>
        .
      </footer>
    </div>
  )
}
