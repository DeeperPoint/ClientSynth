"use client"

import React, { createContext, useContext } from "react"

export interface TenantContextTenant {
  id: string
  name: string
  slug: string
  role: string
}

interface TenantContextValue {
  tenant: TenantContextTenant | null
  setTenant: (t: TenantContextTenant | null) => void
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined)

export function TenantProvider({ value, children }: { value: TenantContextValue; children: React.ReactNode }) {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) {
    throw new Error("useTenant must be used within a TenantProvider")
  }
  return ctx
}
