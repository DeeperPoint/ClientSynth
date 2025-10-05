import { GoogleDriveAuthHandler } from "./auth-handler"
import { GoogleDriveFolderManager } from "./folder-manager"
// import { createServerClient } from "@supabase/ssr" // disabled in local backend mode
import { cookies } from "next/headers"

export interface UploadJob {
  id: string
  files: UploadFile[]
  targetFolderId: string
  tenantId: string
  userId: string
  status: "pending" | "uploading" | "completed" | "failed"
  progress: {
    total: number
    completed: number
    failed: number
  }
}

export interface UploadFile {
  localPath: string
  fileName: string
  mimeType: string
  fileType: "image" | "dataset" | "report" | "export"
  metadata?: Record<string, any>
}

export interface UploadResult {
  success: boolean
  driveFileId?: string
  fileName: string
  error?: string
}

export class GoogleDriveBatchUploader {
  private authHandler: GoogleDriveAuthHandler
  private folderManager: GoogleDriveFolderManager
  private supabase: any
  private activeUploads: Map<string, UploadJob> = new Map()

  constructor() {
    this.authHandler = new GoogleDriveAuthHandler()
    this.folderManager = new GoogleDriveFolderManager()
    this.supabase = { from: () => ({ insert: async () => ({ data: null, error: null }), update: async () => ({ data: null, error: null }), select: async () => ({ data: null, error: null }) }) }
  }

  async startBatchUpload(
    files: UploadFile[],
    targetFolderId: string,
    tenantId: string,
    userId: string,
    jobId?: string,
  ): Promise<string> {
    console.log("[v0] Starting batch upload of", files.length, "files to folder:", targetFolderId)

    const uploadJobId = jobId || `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const uploadJob: UploadJob = {
      id: uploadJobId,
      files,
      targetFolderId,
      tenantId,
      userId,
      status: "pending",
      progress: {
        total: files.length,
        completed: 0,
        failed: 0,
      },
    }

    this.activeUploads.set(uploadJobId, uploadJob)

    // Create sync status record
    await this.createSyncStatus(uploadJobId, tenantId, jobId, files.length)

    // Start upload process (don't await - run in background)
    this.processBatchUpload(uploadJobId).catch((error) => {
      console.error("[v0] Batch upload failed:", error)
      this.updateUploadStatus(uploadJobId, "failed")
    })

    console.log("[v0] Batch upload started with ID:", uploadJobId)
    return uploadJobId
  }

  private async processBatchUpload(uploadJobId: string): Promise<void> {
    console.log("[v0] Processing batch upload:", uploadJobId)

    const uploadJob = this.activeUploads.get(uploadJobId)
    if (!uploadJob) {
      console.error("[v0] Upload job not found:", uploadJobId)
      return
    }

    uploadJob.status = "uploading"
    await this.updateSyncStatus(uploadJobId, "in_progress")

    const accessToken = await this.authHandler.getValidToken(uploadJob.tenantId, uploadJob.userId)
    if (!accessToken) {
      console.error("[v0] No valid access token for upload")
      uploadJob.status = "failed"
      await this.updateSyncStatus(uploadJobId, "failed", "Google Drive not authorized")
      return
    }

    const results: UploadResult[] = []

    // Process files in batches of 5 to avoid overwhelming the API
    const batchSize = 5
    for (let i = 0; i < uploadJob.files.length; i += batchSize) {
      const batch = uploadJob.files.slice(i, i + batchSize)

      const batchPromises = batch.map((file) =>
        this.uploadSingleFile(accessToken, file, uploadJob.targetFolderId, uploadJob.tenantId),
      )

      const batchResults = await Promise.allSettled(batchPromises)

      batchResults.forEach((result, index) => {
        const file = batch[index]
        if (result.status === "fulfilled") {
          results.push(result.value)
          uploadJob.progress.completed++
        } else {
          console.error("[v0] File upload failed:", file.fileName, result.reason)
          results.push({
            success: false,
            fileName: file.fileName,
            error: result.reason?.message || "Upload failed",
          })
          uploadJob.progress.failed++
        }
      })

      // Update progress
      await this.updateSyncStatus(
        uploadJobId,
        "in_progress",
        undefined,
        uploadJob.progress.completed,
        uploadJob.progress.failed,
      )

      console.log("[v0] Batch progress:", uploadJob.progress.completed, "/", uploadJob.progress.total)

      // Small delay between batches
      if (i + batchSize < uploadJob.files.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // Mark as completed
    uploadJob.status = uploadJob.progress.failed === 0 ? "completed" : "failed"
    await this.updateSyncStatus(
      uploadJobId,
      uploadJob.status,
      uploadJob.progress.failed > 0 ? `${uploadJob.progress.failed} files failed to upload` : undefined,
      uploadJob.progress.completed,
      uploadJob.progress.failed,
    )

    console.log(
      "[v0] Batch upload completed:",
      uploadJobId,
      "Success:",
      uploadJob.progress.completed,
      "Failed:",
      uploadJob.progress.failed,
    )
  }

  private async uploadSingleFile(
    accessToken: string,
    file: UploadFile,
    targetFolderId: string,
    tenantId: string,
  ): Promise<UploadResult> {
    console.log("[v0] Uploading file:", file.fileName)

    try {
      // Read file content (in a real implementation, you'd read from the file system)
      // For now, we'll simulate with placeholder content
      const fileContent = await this.readFileContent(file.localPath)

      // Create file metadata
      const metadata = {
        name: file.fileName,
        parents: [targetFolderId],
        ...(file.mimeType && { mimeType: file.mimeType }),
      }

      // Upload file using multipart upload
      const boundary = "-------314159265358979323846"
      const delimiter = `\r\n--${boundary}\r\n`
      const close_delim = `\r\n--${boundary}--`

      const multipartRequestBody =
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${file.mimeType}\r\n\r\n` +
        fileContent +
        close_delim

      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary="${boundary}"`,
        },
        body: multipartRequestBody,
      })

      if (!response.ok) {
        const error = await response.text()
        console.error("[v0] File upload failed:", error)
        throw new Error(`Upload failed: ${error}`)
      }

      const driveFile = await response.json()
      console.log("[v0] File uploaded successfully:", driveFile.id)

      // Store file info in database
      await this.storeDriveFileInfo(driveFile, file, tenantId)

      return {
        success: true,
        driveFileId: driveFile.id,
        fileName: file.fileName,
      }
    } catch (error) {
      console.error("[v0] Failed to upload file:", file.fileName, error)
      return {
        success: false,
        fileName: file.fileName,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private async readFileContent(localPath: string): Promise<string> {
    // In a real implementation, you would read the actual file content
    // For now, return placeholder content based on file type
    console.log("[v0] Reading file content from:", localPath)

    if (localPath.includes("image")) {
      return "placeholder-image-content"
    } else if (localPath.includes("dataset")) {
      return JSON.stringify({ data: "placeholder-dataset" })
    } else {
      return "placeholder-file-content"
    }
  }

  private async storeDriveFileInfo(driveFile: any, uploadFile: UploadFile, tenantId: string): Promise<void> {
    console.log("[v0] Storing drive file info:", driveFile.id)

    try {
      const { error } = await this.supabase.from("drive_files").insert({
        tenant_id: tenantId,
        drive_file_id: driveFile.id,
        file_name: driveFile.name,
        file_type: uploadFile.fileType,
        mime_type: driveFile.mimeType,
        file_size: driveFile.size ? Number.parseInt(driveFile.size) : null,
        drive_url: `https://drive.google.com/file/d/${driveFile.id}/view`,
        local_path: uploadFile.localPath,
        metadata: {
          ...uploadFile.metadata,
          drive_created_time: driveFile.createdTime,
          drive_modified_time: driveFile.modifiedTime,
        },
        upload_status: "completed",
      })

      if (error) {
        console.error("[v0] Error storing drive file info:", error)
      } else {
        console.log("[v0] Drive file info stored successfully")
      }
    } catch (error) {
      console.error("[v0] Failed to store drive file info:", error)
    }
  }

  private async createSyncStatus(uploadJobId: string, tenantId: string, jobId?: string, totalFiles = 0): Promise<void> {
    console.log("[v0] Creating sync status record:", uploadJobId)

    try {
      const { error } = await this.supabase.from("drive_sync_status").insert({
        id: uploadJobId,
        tenant_id: tenantId,
        job_id: jobId,
        sync_type: "upload",
        status: "pending",
        total_files: totalFiles,
        started_at: new Date().toISOString(),
      })

      if (error) {
        console.error("[v0] Error creating sync status:", error)
      }
    } catch (error) {
      console.error("[v0] Failed to create sync status:", error)
    }
  }

  private async updateSyncStatus(
    uploadJobId: string,
    status: string,
    errorMessage?: string,
    processedFiles?: number,
    failedFiles?: number,
  ): Promise<void> {
    console.log("[v0] Updating sync status:", uploadJobId, status)

    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      }

      if (errorMessage) updateData.error_message = errorMessage
      if (processedFiles !== undefined) updateData.processed_files = processedFiles
      if (failedFiles !== undefined) updateData.failed_files = failedFiles
      if (status === "completed" || status === "failed") {
        updateData.completed_at = new Date().toISOString()
      }

      const { error } = await this.supabase.from("drive_sync_status").update(updateData).eq("id", uploadJobId)

      if (error) {
        console.error("[v0] Error updating sync status:", error)
      }
    } catch (error) {
      console.error("[v0] Failed to update sync status:", error)
    }
  }

  private updateUploadStatus(uploadJobId: string, status: UploadJob["status"]): void {
    const uploadJob = this.activeUploads.get(uploadJobId)
    if (uploadJob) {
      uploadJob.status = status
    }
  }

  async getUploadStatus(uploadJobId: string): Promise<UploadJob | null> {
    console.log("[v0] Getting upload status:", uploadJobId)

    const uploadJob = this.activeUploads.get(uploadJobId)
    if (uploadJob) {
      return uploadJob
    }

    // If not in memory, check database
    try {
      const { data, error } = await this.supabase.from("drive_sync_status").select("*").eq("id", uploadJobId).single()

      if (error || !data) {
        console.log("[v0] Upload job not found in database")
        return null
      }

      // Convert database record to UploadJob format
      return {
        id: data.id,
        files: [], // Files not stored in sync status
        targetFolderId: "",
        tenantId: data.tenant_id,
        userId: "",
        status: data.status as UploadJob["status"],
        progress: {
          total: data.total_files,
          completed: data.processed_files,
          failed: data.failed_files,
        },
      }
    } catch (error) {
      console.error("[v0] Error getting upload status from database:", error)
      return null
    }
  }

  async cancelUpload(uploadJobId: string): Promise<void> {
    console.log("[v0] Cancelling upload:", uploadJobId)

    const uploadJob = this.activeUploads.get(uploadJobId)
    if (uploadJob) {
      uploadJob.status = "failed"
      this.activeUploads.delete(uploadJobId)
    }

    await this.updateSyncStatus(uploadJobId, "failed", "Upload cancelled by user")
    console.log("[v0] Upload cancelled")
  }

  async getRecentUploads(tenantId: string, limit = 10): Promise<any[]> {
    console.log("[v0] Getting recent uploads for tenant:", tenantId)

    try {
      const { data, error } = await this.supabase
        .from("drive_sync_status")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("sync_type", "upload")
        .order("created_at", { ascending: false })
        .limit(limit)

      if (error) {
        console.error("[v0] Error fetching recent uploads:", error)
        return []
      }

      console.log("[v0] Found recent uploads:", data?.length || 0)
      return data || []
    } catch (error) {
      console.error("[v0] Failed to get recent uploads:", error)
      return []
    }
  }
}
