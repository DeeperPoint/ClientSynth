import { NextResponse } from "next/server"
import { OpenRouterClient } from "@/lib/openrouter-client"

export async function GET() {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "OpenRouter API key not configured" }, { status: 500 })
    }

    const client = new OpenRouterClient(apiKey)
    const models = await client.getAvailableModels()

    return NextResponse.json({ models })
  } catch (error) {
    console.error("Failed to fetch models:", error)
    return NextResponse.json({ error: "Failed to fetch available models" }, { status: 500 })
  }
}
