import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/postgres/client"

/**
 * GET /api/participant-types
 * 
 * Returns list of available participant types
 */
export async function GET(request: NextRequest) {
  try {
    const result = await query(`
      SELECT id, name, display_name, description, icon_name
      FROM participant_types
      ORDER BY name
    `)

    return NextResponse.json({
      success: true,
      participantTypes: result.rows
    })
  } catch (error) {
    console.error("[ParticipantTypes] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch participant types"
      },
      { status: 500 }
    )
  }
}

