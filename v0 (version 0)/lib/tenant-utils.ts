import { createClient } from "@/lib/supabase/server"

export interface Tenant {
  id: string
  name: string
  slug: string
  role: string
}

export interface TenantWithRole extends Tenant {
  user_tenant_roles: {
    role: string
  }[]
}

export async function getUserTenants(userId: string): Promise<Tenant[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tenants")
    .select(`
      id,
      name,
      slug,
      user_tenant_roles!inner(role)
    `)
    .eq("user_tenant_roles.user_id", userId)
    .order("name")

  if (error) {
    console.error("Error fetching user tenants:", error)
    return []
  }

  return (data as TenantWithRole[]).map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    role: tenant.user_tenant_roles[0]?.role || "member",
  }))
}

export async function createTenantForUser(userId: string, tenantName: string): Promise<string | null> {
  const supabase = await createClient()

  // Create slug from name
  const slug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  // Create tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({ name: tenantName, slug })
    .select("id")
    .single()

  if (tenantError) {
    console.error("Error creating tenant:", tenantError)
    return null
  }

  // Add user as owner
  const { error: roleError } = await supabase
    .from("user_tenant_roles")
    .insert({ user_id: userId, tenant_id: tenant.id, role: "owner" })

  if (roleError) {
    console.error("Error adding user role:", roleError)
    return null
  }

  return tenant.id
}

export async function ensureUserHasTenant(userId: string, userEmail: string): Promise<string | null> {
  const tenants = await getUserTenants(userId)

  if (tenants.length > 0) {
    return tenants[0].id
  }

  // Create default tenant
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_default_tenant_for_user", {
    user_id: userId,
    user_email: userEmail,
  })

  if (error) {
    console.error("Error creating default tenant:", error)
    return null
  }

  return data
}
