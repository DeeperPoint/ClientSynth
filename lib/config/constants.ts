/**
 * Application-wide constants and configuration values
 * Centralized to avoid magic numbers and improve maintainability
 */

export const APP_CONFIG = {
  // Application metadata
  name: "ClientSynth",
  description: "Synthetic Data Generation Platform",

  // Mobile breakpoint (matches Tailwind's md breakpoint)
  mobileBreakpoint: 768,

  // Cookie settings
  cookies: {
    sidebarState: {
      name: "sidebar:state",
      maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
    },
  },
} as const

export const DATA_LIMITS = {
  // Record generation limits
  records: {
    min: 1,
    max: 10000,
    quickGenerateMax: 1000,
  },

  // Batch processing
  batch: {
    defaultSize: 1000,
    exportBatchSize: 1000,
    imageBatchSize: 5,
    googleDriveBatchSize: 5,
    jobProcessorMaxBatch: 10,
  },

  // Quality scores
  quality: {
    min: 0,
    max: 100,
    default: 50,
  },

  // Progress tracking
  progress: {
    min: 0,
    max: 100,
  },
} as const

export const FILE_CONFIG = {
  // File size units
  units: ["Bytes", "KB", "MB", "GB", "TB"] as const,
  bytesPerUnit: 1024,

  // Image dimensions
  image: {
    defaultWidth: 512,
    defaultHeight: 512,
    targetSize: 512,
  },
} as const

export const TOAST_CONFIG = {
  limit: 1,
  removeDelay: 1000000, // milliseconds
} as const

export const SIMILARITY_THRESHOLDS = {
  text: 0.8,
  numeric: 0.1,
  pattern: 0.7,
  high: 0.7,
  low: 0.3,

  weights: {
    structural: 0.4,
    content: 0.6,
  },
} as const

export const INTELLIGENCE_WEIGHTS = {
  historicalPerformance: 0.4,
  contentAnalysis: 0.3,
  usagePatterns: 0.2,
  contextRelevance: 0.1,
} as const

export const BUFFER_TIME = {
  fiveMinutes: 5 * 60 * 1000, // milliseconds
} as const
