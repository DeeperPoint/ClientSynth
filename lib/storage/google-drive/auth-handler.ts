import { query } from "@/lib/postgres/client"

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
  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor() {
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

      const upsertResult = await query(`
        INSERT INTO google_drive_tokens (
          user_id,
          tenant_id,
          access_token,
          refresh_token,
          token_type,
          expires_at,
          scope,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
        )
        ON CONFLICT (user_id, tenant_id)
        DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = COALESCE(EXCLUDED.refresh_token, google_drive_tokens.refresh_token),
          token_type = EXCLUDED.token_type,
          expires_at = EXCLUDED.expires_at,
          scope = EXCLUDED.scope,
          updated_at = NOW()
        RETURNING *
      `, [
        userId,
        tenantId,
        tokenData.access_token,
        tokenData.refresh_token || null,
        tokenData.token_type || "Bearer",
        expiresAt,
        tokenData.scope
      ])

      const storedToken = upsertResult.rows[0]
      if (!storedToken) {
        throw new Error("Failed to store Google Drive tokens")
      }

      console.log("[v0] Tokens stored successfully")
      return storedToken as GoogleDriveToken
    } catch (error) {
      console.error("[v0] Failed to exchange code for tokens:", error)
      throw error
    }
  }

  async getValidToken(tenantId: string, userId: string): Promise<string | null> {
    console.log("[v0] Getting valid access token for tenant:", tenantId)

    try {
      const tokenResult = await query(
        `
          SELECT *
          FROM google_drive_tokens
          WHERE user_id = $1
            AND tenant_id = $2
        `,
        [userId, tenantId]
      )

      const tokenData = tokenResult.rows[0] as GoogleDriveToken | undefined

      if (!tokenData) {
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

      await query(
        `
          UPDATE google_drive_tokens
          SET access_token = $1,
              expires_at = $2,
              updated_at = NOW()
          WHERE id = $3
        `,
        [refreshData.access_token, expiresAt, tokenData.id]
      )

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
      const tokenResult = await query(
        `
          SELECT access_token
          FROM google_drive_tokens
          WHERE user_id = $1
            AND tenant_id = $2
        `,
        [userId, tenantId]
      )

      const tokenRow = tokenResult.rows[0] as { access_token: string } | undefined

      if (tokenRow?.access_token) {
        // Revoke token with Google
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenRow.access_token}`, {
          method: "POST",
        })
      }

      // Delete from database
      await query(
        `
          DELETE FROM google_drive_tokens
          WHERE user_id = $1
            AND tenant_id = $2
        `,
        [userId, tenantId]
      )

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
