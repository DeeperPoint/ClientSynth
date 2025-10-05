// Simple local persistence for selected tenant in frontend-only mode

const CURRENT_TENANT_KEY = "current_tenant_id"

export function getCurrentTenantId(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(CURRENT_TENANT_KEY)
  } catch {
    return null
  }
}

export function setCurrentTenantId(id: string | null) {
  if (typeof window === "undefined") return
  try {
    if (id) {
      window.localStorage.setItem(CURRENT_TENANT_KEY, id)
    } else {
      window.localStorage.removeItem(CURRENT_TENANT_KEY)
    }
  } catch {
    // noop
  }
}

export function pickCurrentTenant<T extends { id: string }>(tenants: T[]): T | null {
  const id = getCurrentTenantId()
  if (!id) return tenants[0] || null
  const found = tenants.find((t) => String(t.id) === String(id)) || null
  return found || (tenants[0] || null)
}
