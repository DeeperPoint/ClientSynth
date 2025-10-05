import { GoogleDriveAuthHandler } from "./auth-handler"
// import { createServerClient } from "@supabase/ssr" // disabled in local backend mode

// Supabase disabled in local backend mode

export interface DriveFolder {
  id: string
  tenant_id: string
  drive_folder_id: string
  folder_name: string
  parent_folder_id?: string
  folder_type: "root" | "project" | "images" | "datasets" | "reports"
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export class GoogleDriveFolderManager {
  private authHandler: GoogleDriveAuthHandler
  // Supabase disabled in local backend mode
  // private supabase: any = null

  constructor() {
    this.authHandler = new GoogleDriveAuthHandler()
  }

  async createProjectStructure(
    tenantId: string,
    userId: string,
    projectName: string,
  ): Promise<{
    rootFolder: DriveFolder
    imagesFolder: DriveFolder
    datasetsFolder: DriveFolder
    reportsFolder: DriveFolder
  }> {
    console.log("[v0] Creating Google Drive project structure for:", projectName)

    const accessToken = await this.authHandler.getValidToken(tenantId, userId)
    if (!accessToken) {
      throw new Error("Google Drive not authorized")
    }

    try {
      // Create root project folder
      const rootFolder = await this.createFolder(
        accessToken,
        `Synthetic Client Data - ${projectName}`,
        undefined,
        tenantId,
        "project",
      )

      // Create subfolders
      const imagesFolder = await this.createFolder(
        accessToken,
        "Images",
        rootFolder.drive_folder_id,
        tenantId,
        "images",
      )

      const datasetsFolder = await this.createFolder(
        accessToken,
        "Datasets",
        rootFolder.drive_folder_id,
        tenantId,
        "datasets",
      )

      const reportsFolder = await this.createFolder(
        accessToken,
        "Reports",
        rootFolder.drive_folder_id,
        tenantId,
        "reports",
      )

      console.log("[v0] Project structure created successfully")

      return {
        rootFolder,
        imagesFolder,
        datasetsFolder,
        reportsFolder,
      }
    } catch (error) {
      console.error("[v0] Failed to create project structure:", error)
      throw error
    }
  }

  private async createFolder(
    accessToken: string,
    folderName: string,
    parentFolderId?: string,
    tenantId?: string,
    folderType: DriveFolder["folder_type"] = "project",
  ): Promise<DriveFolder> {
    console.log("[v0] Creating Google Drive folder:", folderName)

    const folderMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentFolderId && { parents: [parentFolderId] }),
    }

    const response = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(folderMetadata),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("[v0] Failed to create folder:", error)
      throw new Error(`Failed to create folder: ${error}`)
    }

    const driveFolder = await response.json()
    console.log("[v0] Google Drive folder created:", driveFolder.id)

    // In local backend mode return minimal folder info (no Supabase persistence)
    return {
      id: "",
      tenant_id: tenantId || "",
      drive_folder_id: driveFolder.id,
      folder_name: folderName,
      parent_folder_id: parentFolderId,
      folder_type: folderType,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  async getFoldersByType(tenantId: string, folderType: DriveFolder["folder_type"]): Promise<DriveFolder[]> {
    console.log("[v0] Getting folders by type:", folderType, "for tenant:", tenantId)

    // Supabase disabled: return empty list in local backend mode
    console.log("[v0] Supabase disabled, returning empty folders list")
    return []
  }

  async getProjectFolders(tenantId: string): Promise<{
    projects: DriveFolder[]
    images: DriveFolder[]
    datasets: DriveFolder[]
    reports: DriveFolder[]
  }> {
    console.log("[v0] Getting all project folders for tenant:", tenantId)

    // Supabase disabled: return empty groups in local backend mode
    const grouped = {
      projects: [] as DriveFolder[],
      images: [] as DriveFolder[],
      datasets: [] as DriveFolder[],
      reports: [] as DriveFolder[],
    }
    console.log("[v0] Supabase disabled, returning empty grouped folders")
    return grouped
  }

  async deleteFolder(tenantId: string, userId: string, folderId: string): Promise<void> {
    console.log("[v0] Deleting Google Drive folder:", folderId)

    const accessToken = await this.authHandler.getValidToken(tenantId, userId)
    if (!accessToken) {
      throw new Error("Google Drive not authorized")
    }

    try {
      // In local backend mode we don't have DB mapping; best effort: assume folderId is Drive ID
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!response.ok && response.status !== 404) {
        const error = await response.text()
        console.error("[v0] Failed to delete folder from Drive:", error)
        throw new Error(`Failed to delete folder: ${error}`)
      }

      console.log("[v0] Folder deleted from Drive (DB cleanup skipped in local backend mode)")
    } catch (error) {
      console.error("[v0] Failed to delete folder:", error)
      throw error
    }
  }

  async getFolderContents(
    tenantId: string,
    userId: string,
    folderId: string,
  ): Promise<{
    folders: any[]
    files: any[]
  }> {
    console.log("[v0] Getting folder contents for:", folderId)

    const accessToken = await this.authHandler.getValidToken(tenantId, userId)
    if (!accessToken) {
      throw new Error("Google Drive not authorized")
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,size,createdTime,modifiedTime)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )

      if (!response.ok) {
        const error = await response.text()
        console.error("[v0] Failed to get folder contents:", error)
        throw new Error(`Failed to get folder contents: ${error}`)
      }

      const data = await response.json()
      const files = data.files || []

      const folders = files.filter((file: any) => file.mimeType === "application/vnd.google-apps.folder")
      const regularFiles = files.filter((file: any) => file.mimeType !== "application/vnd.google-apps.folder")

      console.log("[v0] Folder contents:", folders.length, "folders,", regularFiles.length, "files")

      return {
        folders,
        files: regularFiles,
      }
    } catch (error) {
      console.error("[v0] Failed to get folder contents:", error)
      throw error
    }
  }
}
