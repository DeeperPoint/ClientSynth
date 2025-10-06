// This file is now deprecated - use OpenRouterImageProvider directly

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string
      images?: Array<{
        image_url?: { url: string }
        url?: string
      }>
    }
  }>
  error?: {
    message: string
    type: string
  }
}

interface ImageGenerationOptions {
  model: string
  prompt: string
  width?: number
  height?: number
  steps?: number
  guidance_scale?: number
}

export class OpenRouterClient {
  private apiKey: string
  private baseUrl = "https://openrouter.ai/api/v1"

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateImage(options: ImageGenerationOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "Client Synth",
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          {
            role: "user",
            content: options.prompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
    }

    const data: OpenRouterResponse = await response.json()

    if (data.error) {
      throw new Error(`OpenRouter error: ${data.error.message}`)
    }

    // Extract image from response
    const images = data.choices?.[0]?.message?.images
    if (!images || images.length === 0) {
      throw new Error("No image returned from OpenRouter")
    }

    const imageUrl = images[0].image_url?.url || images[0].url
    if (!imageUrl) {
      throw new Error("No image URL in OpenRouter response")
    }

    return imageUrl
  }

  async getAvailableModels(): Promise<Array<{ id: string; name: string; pricing?: any }>> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`)
    }

    const data = await response.json()

    return (
      data.data?.filter(
        (model: any) =>
          model.architecture?.output_modalities?.includes("image") ||
          model.id.includes("flux") ||
          model.id.includes("dall-e") ||
          (model.id.includes("gemini") && model.id.includes("image")),
      ) || []
    )
  }
}
