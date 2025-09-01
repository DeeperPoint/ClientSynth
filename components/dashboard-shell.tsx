"use client"

import type React from "react"

import { useState, useEffect } from "react"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { TenantSwitcher } from "@/components/tenant-switcher"
import { Button } from "@/components/ui/button"
import { LogOut, Settings, UserIcon, FileText, Play, Download } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface Tenant {
  id: string
  name: string
  slug: string
  role: string
}

interface DashboardShellProps {
  user: User
  children: React.ReactNode
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    loadUserData()
  }, [])

  const loadUserData = async () => {
    try {
      // Load profile
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single()

      setProfile(profileData)

      // Load tenants
      const { data: tenantsData } = await supabase
        .from("tenants")
        .select(`
          id,
          name,
          slug,
          user_tenant_roles!inner(role)
        `)
        .eq("user_tenant_roles.user_id", user.id)
        .order("name")

      if (tenantsData) {
        const formattedTenants = tenantsData.map((tenant: any) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          role: tenant.user_tenant_roles[0]?.role || "member",
        }))
        setTenants(formattedTenants)

        // Set first tenant as current if none selected
        if (formattedTenants.length > 0 && !currentTenant) {
          setCurrentTenant(formattedTenants[0])
        }
      }

      // If no tenants, create a default one
      if (!tenantsData || tenantsData.length === 0) {
        await createDefaultTenant()
      }
    } catch (error) {
      console.error("Error loading user data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const createDefaultTenant = async () => {
    try {
      const { data, error } = await supabase.rpc("create_default_tenant_for_user", {
        user_id: user.id,
        user_email: user.email,
      })

      if (!error && data) {
        // Reload tenants
        loadUserData()
      }
    } catch (error) {
      console.error("Error creating default tenant:", error)
    }
  }

  const handleCreateTenant = async (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({ name, slug })
      .select("id, name, slug")
      .single()

    if (tenantError) throw tenantError

    const { error: roleError } = await supabase
      .from("user_tenant_roles")
      .insert({ user_id: user.id, tenant_id: tenant.id, role: "owner" })

    if (roleError) throw roleError

    const newTenant = { ...tenant, role: "owner" }
    setTenants((prev) => [...prev, newTenant])
    setCurrentTenant(newTenant)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: Settings, current: pathname === "/dashboard" },
    {
      name: "Schema Studio",
      href: "/dashboard/schemas", // Updated to use plural schemas for listing
      icon: FileText,
      current: pathname.startsWith("/dashboard/schema"), // Keep schema check for both /schema/new and /schemas routes
    },
    { name: "Job Console", href: "/dashboard/jobs", icon: Play, current: pathname.startsWith("/dashboard/jobs") },
    { name: "Exports", href: "/dashboard/exports", icon: Download, current: pathname.startsWith("/dashboard/exports") },
  ]

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900">Client Synth</h1>
        </div>

        <div className="px-6 mb-6">
          <TenantSwitcher
            tenants={tenants}
            currentTenant={currentTenant}
            onTenantChange={setCurrentTenant}
            onCreateTenant={handleCreateTenant}
          />
        </div>

        <nav className="px-6 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  item.current ? "text-gray-900 bg-gray-100" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
                )}
              >
                <Icon className="mr-3 h-4 w-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              {currentTenant && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{currentTenant.name}</h2>
                  <p className="text-sm text-gray-600">Your role: {currentTenant.role}</p>
                </div>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {profile?.full_name
                        ? profile.full_name.charAt(0).toUpperCase()
                        : user.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profile?.full_name || "User"}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
