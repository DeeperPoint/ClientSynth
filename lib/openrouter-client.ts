interface OpenRouterResponse {
  data?: Array<{
    url?: string
    b64_json?: string
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
    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "Client Synth",
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        n: 1,
        size: `${options.width || 512}x${options.height || 512}`,
        response_format: "url",
        ...(options.steps && { steps: options.steps }),
        ...(options.guidance_scale && { guidance_scale: options.guidance_scale }),
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

    if (!data.data?.[0]?.url) {
      throw new Error("No image URL returned from OpenRouter")
    }

    return data.data[0].url
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
          model.id.includes("flux") ||
          model.id.includes("dall-e") ||
          model.id.includes("midjourney") ||
          model.id.includes("stable-diffusion"),
      ) || []
    )
  }
}
