import { NextResponse } from "next/server"

export async function GET() {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error("Failed to fetch models from OpenRouter")
    }

    const data = await response.json()

    // Filter and format models for our use case
    const relevantModels = data.data
      .filter(
        (model: any) =>
          model.id.includes("gemini") ||
          model.id.includes("claude") ||
          model.id.includes("gpt-4") ||
          model.id.includes("llama"),
      )
      .map((model: any) => ({
        id: model.id,
        name: model.name,
        description: model.description || "AI language model",
        pricing: {
          prompt: model.pricing?.prompt || 0,
          completion: model.pricing?.completion || 0,
        },
        context_length: model.context_length,
      }))
      .slice(0, 10) // Limit to top 10 models

    return NextResponse.json(relevantModels)
  } catch (error) {
    console.error("Error fetching models:", error)

    // Return default models if API fails
    const defaultModels = [
      {
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "Fast, high-quality text generation",
        pricing: { prompt: 0.075, completion: 0.3 },
        context_length: 1000000,
      },
      {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet",
        description: "Advanced reasoning and analysis",
        pricing: { prompt: 3, completion: 15 },
        context_length: 200000,
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        description: "Latest OpenAI model",
        pricing: { prompt: 2.5, completion: 10 },
        context_length: 128000,
      },
    ]

    return NextResponse.json(defaultModels)
  }
}
