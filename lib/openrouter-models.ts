export interface OpenRouterModel {
  id: string
  name: string
  description: string
  pricing: {
    prompt: string
    completion: string
  }
  context_length: number
  architecture: {
    modality: string
    tokenizer: string
    instruct_type?: string
  }
  top_provider: {
    max_completion_tokens?: number
    is_moderated: boolean
  }
  per_request_limits?: {
    prompt_tokens: string
    completion_tokens: string
  }
}

export class OpenRouterModelService {
  private static readonly CACHE_KEY = "openrouter_models"
  private static readonly CACHE_DURATION = 1000 * 60 * 60 // 1 hour

  static async getAvailableModels(): Promise<OpenRouterModel[]> {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }

      const data = await response.json()

      // Filter for text generation models that work well for synthetic data
      const textModels = data.data.filter(
        (model: OpenRouterModel) =>
          model.architecture.modality === "text" &&
          !model.id.includes("vision") &&
          !model.id.includes("image") &&
          model.context_length >= 4000,
      )

      return textModels.sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error("Error fetching OpenRouter models:", error)
      // Return default models as fallback
      return [
        {
          id: "google/gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
          description: "Fast and efficient model for text generation",
          pricing: { prompt: "0.000001", completion: "0.000002" },
          context_length: 8192,
          architecture: { modality: "text", tokenizer: "gemini" },
          top_provider: { is_moderated: true },
        },
      ]
    }
  }

  static async getImageModels(): Promise<OpenRouterModel[]> {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }

      const data = await response.json()

      // Filter for image generation models
      const imageModels = data.data.filter(
        (model: OpenRouterModel) =>
          model.architecture.modality === "image" ||
          model.id.includes("dall-e") ||
          model.id.includes("midjourney") ||
          model.id.includes("stable-diffusion"),
      )

      return imageModels.sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error("Error fetching image models:", error)
      return []
    }
  }
}
