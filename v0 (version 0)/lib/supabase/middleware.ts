import { NextResponse, type NextRequest } from "next/server"

// Stubbed middleware: returns next() without Supabase SSR to avoid build-time dependency.
export async function updateSession(request: NextRequest) {
  return NextResponse.next({ request })
}
