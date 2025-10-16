import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/postgres/client"

export async function GET() {
  try {
    const user = await getCurrentUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error("Error getting user profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
