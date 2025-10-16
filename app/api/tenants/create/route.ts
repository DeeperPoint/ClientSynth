import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/postgres/server"
import { createTenant, addUserToTenant } from "@/lib/postgres/client"

export async function POST(request: NextRequest) {
  try {
    const db = await createServerClient()
    const {
      data: { user },
    } = await db.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, slug } = await request.json()

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 })
    }

    // Create tenant
    const tenant = await createTenant({ name, slug })
    
    // Add user as owner
    await addUserToTenant(user.id, tenant.id, 'owner')

    return NextResponse.json(tenant)
  } catch (error) {
    console.error("Error creating tenant:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
