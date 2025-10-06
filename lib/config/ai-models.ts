/**
 * AI model configuration and defaults
 * Centralized for easy model management and updates
 */

export const AI_MODELS = {
  // Text generation models
  text: {
    default: "google/gemini-2.5-flash",
    alternatives: ["anthropic/claude-3.5-sonnet", "openai/gpt-4o", "meta-llama/llama-3.1-70b-instruct"],
  },

  // Image generation models
  image: {
    default: "google/gemini-2.5-flash-image-preview",
    alternatives: ["openai/dall-e-3", "stability-ai/stable-diffusion-xl"],
  },
} as const

export const AI_GENERATION_CONFIG = {
  // Temperature settings
  temperature: {
    creative: 0.7,
    balanced: 0.6,
    precise: 0.4,
  },

  // Token limits
  tokens: {
    maxPerField: 100,
    baseEstimate: 50, // tokens per field
  },

  // Quality settings
  quality: {
    standard: "standard",
    hd: "hd",
  },

  // Image generation steps
  steps: {
    default: 30,
    fast: 20,
    quality: 50,
  },

  // Guidance scale
  guidanceScale: {
    default: 7.5,
    low: 5.0,
    high: 10.0,
  },
} as const

export const PROMPT_TEMPLATES = {
  systemPrompts: {
    name: "Generate realistic human names.",
    email: "Generate realistic email addresses.",
    company: "Generate realistic company names.",
    text: "Generate short, realistic text snippet.",
    description: "Generate concise descriptive text.",
  },
} as const
