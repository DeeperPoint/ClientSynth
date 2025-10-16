import { NextResponse, type NextRequest } from "next/server"
import { verifyAuthToken } from './server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  })

  // Check for auth token in cookies
  const token = request.cookies.get('auth-token')?.value

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
    return response
  }

  // Verify token
  const decoded = verifyAuthToken(token)
  if (!decoded) {
    // Invalid token, redirect to login
    if (
      request.nextUrl.pathname !== "/" &&
      !request.nextUrl.pathname.startsWith("/auth") &&
      !request.nextUrl.pathname.startsWith("/login")
    ) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      return NextResponse.redirect(url)
    }
    return response
  }

  // Token is valid, continue
  return response
}
