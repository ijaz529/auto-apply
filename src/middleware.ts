import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow auth routes, API routes, static files
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next()
  }

  // Everything except /cv, /jobs, /applications, /settings redirects to /cv
  if (
    pathname !== "/cv" && !pathname.startsWith("/cv/") &&
    pathname !== "/jobs" && !pathname.startsWith("/jobs/") &&
    pathname !== "/applications" && !pathname.startsWith("/applications/") &&
    pathname !== "/settings" && !pathname.startsWith("/settings/")
  ) {
    return NextResponse.redirect(new URL("/cv", req.nextUrl.origin))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
