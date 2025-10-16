import { NextResponse } from "next/server"
import { getCurrentUser, getUserTenants } from "@/lib/postgres/client"

export async function GET() {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tenants = await getUserTenants(user.id)
    return NextResponse.json(tenants)
  } catch (error) {
    console.error("Error getting user tenants:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
