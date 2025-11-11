import type React from "react"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/postgres/client"
import { DashboardShell } from "@/components/dashboard-shell"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/auth/login")
  }

  return <DashboardShell user={user}>{children}</DashboardShell>
}
