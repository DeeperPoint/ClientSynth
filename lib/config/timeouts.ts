/**
 * Timeout and retry configuration
 * Centralized for consistent behavior across the application
 */

export const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMultiplier: 2,
  initialDelay: 1000, // milliseconds
} as const

export const TIMEOUT_CONFIG = {
  // HTTP timeouts
  http: {
    short: 30000, // 30 seconds
    medium: 60000, // 60 seconds
    long: 120000, // 2 minutes
  },

  // Test timeouts
  test: {
    short: 120000, // 2 minutes
    medium: 180000, // 3 minutes
    long: 300000, // 5 minutes
  },

  // S3 signed URL expiry
  s3SignedUrl: 3600, // 1 hour in seconds

  // Cache control
  cacheControl: {
    immutable: "public, max-age=31536000, immutable", // 1 year
    standard: "public, max-age=3600", // 1 hour
  },
} as const

export const POLLING_INTERVALS = {
  jobStatus: 2000, // 2 seconds
  realtime: 1000, // 1 second
  background: 5000, // 5 seconds
} as const
