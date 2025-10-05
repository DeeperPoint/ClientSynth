import type React from "react"
import { redirect } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { cookies } from "next/headers"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Simple guard: check for backend token presence; fall back to login if missing.
  const cookieStore = await cookies()
  const token = cookieStore.get("backend_access_token")?.value
  // We store token in localStorage on the client; SSR can't see it.
  // To keep it simple, allow render and let client routes guard. If you prefer SSR guard, set a mirrored cookie.
  if (!token) {
    // Not strictly accurate due to localStorage usage; but helps when token is also mirrored into a cookie.
    // For now, we won’t hard redirect here to avoid blocking dev; uncomment if you mirror the token.
    // redirect("/auth/login")
  }

  // DashboardShell expects a user object (was Supabase). Provide a minimal stub for now.
  const user = { id: "local-user", email: "user@example.com" } as any
  return <DashboardShell user={user}>{children}</DashboardShell>
}
