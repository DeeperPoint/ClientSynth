/**
 * API configuration and endpoints
 * Centralized for consistent API behavior
 */

export const API_CONFIG = {
  // OpenRouter
  openRouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    endpoints: {
      chat: "/chat/completions",
      images: "/images/generations",
      models: "/models",
    },
    defaultSiteUrl: "http://localhost:3000",
    defaultAppTitle: "ClientSynth",
  },

  // HTTP status codes
  statusCodes: {
    ok: 200,
    created: 201,
    badRequest: 400,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    internalError: 500,
  },
} as const
