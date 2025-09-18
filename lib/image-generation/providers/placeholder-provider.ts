import { BaseImageProvider, type ImageGenerationOptions, type ImageGenerationResult } from "./base-provider"

export class PlaceholderImageProvider extends BaseImageProvider {
  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const { prompt, width = 512, height = 512 } = options

    console.log("[PlaceholderProvider] Generating placeholder for prompt:", prompt)

    // Generate colors based on prompt content
    const hash = this.hashString(prompt)
    const hue = hash % 360
    const saturation = 60 + (hash % 40) // 60-100%
    const lightness = 40 + (hash % 30) // 40-70%

    // Convert HSL to RGB
    const rgb = this.hslToRgb(hue / 360, saturation / 100, lightness / 100)

    // Create gradient effect
    const canvas = Buffer.alloc(width * height * 4) // RGBA

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4

        // Create a subtle gradient effect
        const gradientFactor = (x + y) / (width + height)
        const r = Math.floor(rgb[0] * (0.7 + gradientFactor * 0.3))
        const g = Math.floor(rgb[1] * (0.7 + gradientFactor * 0.3))
        const b = Math.floor(rgb[2] * (0.7 + gradientFactor * 0.3))

        canvas[i] = r // Red
        canvas[i + 1] = g // Green
        canvas[i + 2] = b // Blue
        canvas[i + 3] = 255 // Alpha
      }
    }

    return {
      buffer: canvas,
      contentType: "image/png",
      metadata: {
        model: "placeholder",
        prompt,
        dimensions: { width, height },
        provider: "placeholder",
      },
    }
  }

  getSupportedModels(): string[] {
    return ["placeholder"]
  }

  validateConfig(): boolean {
    return true // Always available
  }

  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r, g, b

    if (s === 0) {
      r = g = b = l // achromatic
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
      }

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hue2rgb(p, q, h + 1 / 3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1 / 3)
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
  }

  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }
}
