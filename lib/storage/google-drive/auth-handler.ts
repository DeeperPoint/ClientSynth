import { createServerClient } from "@/lib/supabase/server"

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
  private supabase
  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor() {
    this.supabase = createServerClient()

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

      // Store tokens in database
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

      const { data, error } = await this.supabase
        .from("google_drive_tokens")
        .upsert(
          {
            user_id: userId,
            tenant_id: tenantId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_type: tokenData.token_type || "Bearer",
            expires_at: expiresAt,
            scope: tokenData.scope,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id,tenant_id",
          },
        )
        .select()
        .single()

      if (error) {
        console.error("[v0] Error storing tokens:", error)
        throw error
      }

      console.log("[v0] Tokens stored successfully")
      return data
    } catch (error) {
      console.error("[v0] Failed to exchange code for tokens:", error)
      throw error
    }
  }

  async getValidToken(tenantId: string, userId: string): Promise<string | null> {
    console.log("[v0] Getting valid access token for tenant:", tenantId)

    try {
      const { data: tokenData, error } = await this.supabase
        .from("google_drive_tokens")
        .select("*")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .single()

      if (error || !tokenData) {
        console.log("[v0] No tokens found for user")
        return null
      }

      // Check if token is still valid
      const expiresAt = new Date(tokenData.expires_at)
      const now = new Date()
      const bufferTime = 5 * 60 * 1000 // 5 minutes buffer

      if (expiresAt.getTime() - now.getTime() > bufferTime) {
        console.log("[v0] Access token is still valid")
        return tokenData.access_token
      }

      // Token is expired or about to expire, refresh it
      if (tokenData.refresh_token) {
        console.log("[v0] Access token expired, refreshing")
        return await this.refreshToken(tokenData)
      }

      console.log("[v0] No refresh token available, re-authorization required")
      return null
    } catch (error) {
      console.error("[v0] Error getting valid token:", error)
      return null
    }
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

      const { error: updateError } = await this.supabase
        .from("google_drive_tokens")
        .update({
          access_token: refreshData.access_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tokenData.id)

      if (updateError) {
        console.error("[v0] Error updating refreshed tokens:", updateError)
        return null
      }

      console.log("[v0] Refreshed tokens stored successfully")
      return refreshData.access_token
    } catch (error) {
      console.error("[v0] Failed to refresh token:", error)
      return null
    }
  }

  async revokeTokens(tenantId: string, userId: string): Promise<void> {
    console.log("[v0] Revoking Google Drive tokens for tenant:", tenantId)

    try {
      const { data: tokenData } = await this.supabase
        .from("google_drive_tokens")
        .select("access_token")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .single()

      if (tokenData?.access_token) {
        // Revoke token with Google
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, {
          method: "POST",
        })
      }

      // Delete from database
      const { error } = await this.supabase
        .from("google_drive_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)

      if (error) {
        console.error("[v0] Error deleting tokens:", error)
        throw error
      }

      console.log("[v0] Tokens revoked successfully")
    } catch (error) {
      console.error("[v0] Failed to revoke tokens:", error)
      throw error
    }
  }

  async isAuthorized(tenantId: string, userId: string): Promise<boolean> {
    console.log("[v0] Checking Google Drive authorization status")

    const token = await this.getValidToken(tenantId, userId)
    const authorized = token !== null

    console.log("[v0] Authorization status:", authorized)
    return authorized
  }
}
