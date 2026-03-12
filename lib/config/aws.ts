/**
 * AWS and S3 configuration
 * Centralized for cloud service settings
 */

export const AWS_CONFIG = {
  // Default region (us-east-2 for synthetic-client-assets bucket)
  defaultRegion: "us-east-2",

  // S3 bucket defaults
  s3: {
    defaultBucket: "client-synth-media",

    // Path structure
    paths: {
      syntheticData: "synthetic-data",
      temp: "temp",
      exports: "exports",
    },

    // Content types
    contentTypes: {
      png: "image/png",
      jpeg: "image/jpeg",
      json: "application/json",
      csv: "text/csv",
    },
  },
} as const
