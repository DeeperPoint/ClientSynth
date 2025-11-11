import { query } from "@/lib/postgres/client"

export interface Tenant {
  id: string
  name: string
  slug: string
  role: string
}

export async function getUserTenants(userId: string): Promise<Tenant[]> {
  try {
    const result = await query<{
      id: string
      name: string
      slug: string
      role: string
    }>(
      `
        SELECT t.id, t.name, t.slug, utr.role
        FROM tenants t
        INNER JOIN user_tenant_roles utr ON t.id = utr.tenant_id
        WHERE utr.user_id = $1
        ORDER BY t.name
      `,
      [userId]
    )

    return result.rows.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      role: tenant.role || "member",
    }))
  } catch (error) {
    console.error("Error fetching user tenants:", error)
    return []
  }
}

export async function createTenantForUser(userId: string, tenantName: string): Promise<string | null> {
  // Create slug from name
  const slug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  try {
    const tenantResult = await query<{ id: string }>(
      `
        INSERT INTO tenants (name, slug)
        VALUES ($1, $2)
        RETURNING id
      `,
      [tenantName, slug]
    )

    const tenantId = tenantResult.rows[0]?.id
    if (!tenantId) {
      throw new Error("Failed to create tenant")
    }

    await query(
      `
        INSERT INTO user_tenant_roles (user_id, tenant_id, role)
        VALUES ($1, $2, $3)
      `,
      [userId, tenantId, "owner"]
    )

    return tenantId
  } catch (error) {
    console.error("Error creating tenant:", error)
    return null
  }
}

export async function ensureUserHasTenant(userId: string, userEmail: string): Promise<string | null> {
  const tenants = await getUserTenants(userId)

  if (tenants.length > 0) {
    return tenants[0].id
  }

  // Create default tenant
  try {
    const result = await query<{ tenant_id: string | null }>(
      `SELECT create_default_tenant_for_user($1, $2) AS tenant_id`,
      [userId, userEmail]
    )

    const tenantId = result.rows[0]?.tenant_id
    if (tenantId) {
      return tenantId
    }

    // Fallback: create a tenant based on email if the function is unavailable
    const fallbackName = userEmail ? `${userEmail.split("@")[0]}'s Workspace` : "My Workspace"
    return await createTenantForUser(userId, fallbackName)
  } catch (error) {
    console.error("Error ensuring user tenant:", error)
    return null
  }
}
