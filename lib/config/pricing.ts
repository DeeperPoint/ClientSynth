/**
 * Pricing and cost estimation configuration
 * Centralized for easy updates and consistency
 */

export const PRICING = {
  // Image generation costs (per image)
  image: {
    standard: 0.04, // $0.04 per image
    hd: 0.065, // $0.065 per HD image
  },

  // Token pricing (per token)
  tokens: {
    input: 0.000001, // $0.000001 per input token
    output: 0.000002, // $0.000002 per output token
  },

  // Success rate defaults
  successRate: {
    default: 0.85, // 85%
    optimistic: 0.95, // 95%
    conservative: 0.75, // 75%
  },
} as const

export const COST_ESTIMATION = {
  // Base costs
  baseTokensPerField: 50,

  // Multipliers
  multipliers: {
    aiGeneration: 1.2,
    imageGeneration: 1.5,
    complexSchema: 1.3,
  },
} as const
