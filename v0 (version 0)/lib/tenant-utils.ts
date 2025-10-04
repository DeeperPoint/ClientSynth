import { apiFetch } from "@/lib/backend-client"

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
  const res = await apiFetch("/api/v1/tenants/")
  if (!res.ok) return []
  const data = await res.json()
  return (Array.isArray(data) ? data : []).map((t: any) => ({
    id: String(t.id),
    name: t.name ?? t.slug ?? "Tenant",
    slug: t.slug ?? String(t.id),
    role: "owner",
  }))
}

export async function createTenantForUser(userId: string, tenantName: string): Promise<string | null> {
  // Create slug from name
  const slug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  const res = await apiFetch("/api/v1/tenants/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: tenantName, slug }),
  })
  if (!res.ok) return null
  const tenant = await res.json()
  return String(tenant.id)
}

export async function ensureUserHasTenant(userId: string, userEmail: string): Promise<string | null> {
  const tenants = await getUserTenants(userId)

  if (tenants.length > 0) {
    return tenants[0].id
  }

  // Create default tenant via backend
  const res = await apiFetch("/api/v1/tenants/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Default Tenant" }),
  })
  if (!res.ok) return null
  const t = await res.json()
  return String(t.id)
}
