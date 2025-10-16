import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

  // Lightweight edge-compatible session check: only validate presence of an
  // auth cookie. Full JWT verification and DB lookup must run on the server
  // (API routes / server components) because they depend on Node APIs.
  const token = request.cookies.get('auth-token')?.value

  // Do not interfere with API routes — they expect JSON and should not be
  // redirected to HTML login pages. Short-circuit here for any /api paths.
  if (request.nextUrl.pathname.startsWith('/api')) {
    return response
  }

  if (!token) {
    // No token, redirect to login if not on auth pages
    if (
      request.nextUrl.pathname !== "/" &&
      !request.nextUrl.pathname.startsWith("/auth") &&
      !request.nextUrl.pathname.startsWith("/login")
    ) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
