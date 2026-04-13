import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Redirect root to dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/jobs", req.nextUrl.origin))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|public).*)",
  ],
}
