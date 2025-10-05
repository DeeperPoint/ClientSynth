// import { createServerClient } from "@supabase/ssr" // disabled in local backend mode

export interface GoogleDriveToken {
  id: string
  user_id: string
  tenant_id: string
  access_token: string
  refresh_token?: string
  token_type: string
  expires_at: string
  scope: string
  created_at: string
  updated_at: string
}

export class GoogleDriveAuthHandler {
  // Supabase disabled in local backend mode
  // private supabase
  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor() {
    // Supabase disabled in local backend mode

    this.clientId = process.env.GOOGLE_DRIVE_CLIENT_ID!
    this.clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET!
    this.redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI!
  }

  generateAuthUrl(tenantId: string, userId: string): string {
    console.log("[v0] Generating Google Drive auth URL for tenant:", tenantId)

    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.readonly",
    ].join(" ")

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: scopes,
      access_type: "offline",
      prompt: "consent",
      state: JSON.stringify({ tenantId, userId }),
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    console.log("[v0] Generated auth URL")
    return authUrl
  }

  async exchangeCodeForTokens(code: string, tenantId: string, userId: string): Promise<GoogleDriveToken> {
    console.log("[v0] Exchanging authorization code for tokens")

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: this.redirectUri,
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        console.error("[v0] Token exchange failed:", error)
        throw new Error(`Token exchange failed: ${error}`)
      }

      const tokenData = await tokenResponse.json()
      console.log("[v0] Token exchange successful")

      // In local backend mode we don't persist tokens in Supabase; return a minimal shape
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      console.log("[v0] Tokens acquired (not persisted in local mode)")
      return {
        id: "",
        user_id: userId,
        tenant_id: tenantId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type || "Bearer",
        expires_at: expiresAt,
        scope: tokenData.scope,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    } catch (error) {
      console.error("[v0] Failed to exchange code for tokens:", error)
      throw error
    }
  }

  async getValidToken(tenantId: string, userId: string): Promise<string | null> {
    console.log("[v0] Getting valid access token for tenant:", tenantId)

    // Supabase disabled: cannot retrieve persisted tokens, return null to signal re-auth needed
    return null
  }

  private async refreshToken(tokenData: GoogleDriveToken): Promise<string | null> {
    console.log("[v0] Refreshing access token")

    try {
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: tokenData.refresh_token!,
          grant_type: "refresh_token",
        }),
      })

      if (!refreshResponse.ok) {
        const error = await refreshResponse.text()
        console.error("[v0] Token refresh failed:", error)
        return null
      }

      const refreshData = await refreshResponse.json()
      console.log("[v0] Token refresh successful")

      // Update stored tokens
      const expiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

      // Supabase disabled: skip persistence
      console.log("[v0] Refreshed tokens (not persisted in local mode)")
      return refreshData.access_token
    } catch (error) {
      console.error("[v0] Failed to refresh token:", error)
      return null
    }
  }

  async revokeTokens(tenantId: string, userId: string): Promise<void> {
    console.log("[v0] Revoking Google Drive tokens for tenant:", tenantId)

    // Supabase disabled: nothing to revoke/persist; no-op in local mode
    console.log("[v0] Revoke tokens (no-op in local mode)")
  }

  async isAuthorized(tenantId: string, userId: string): Promise<boolean> {
    console.log("[v0] Checking Google Drive authorization status")

    const token = await this.getValidToken(tenantId, userId)
    const authorized = token !== null

    console.log("[v0] Authorization status:", authorized)
    return authorized
  }
}
