import { GoogleDriveAuthHandler } from "./auth-handler"
import { GoogleDriveFolderManager } from "./folder-manager"
import { query } from "@/lib/postgres/client"

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
  private activeUploads: Map<string, UploadJob> = new Map()

  constructor() {
    this.authHandler = new GoogleDriveAuthHandler()
    this.folderManager = new GoogleDriveFolderManager()
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
      await query(
        `
          INSERT INTO drive_files (
            tenant_id,
            drive_file_id,
            file_name,
            file_type,
            mime_type,
            file_size,
            drive_url,
            local_path,
            metadata,
            upload_status,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW(), NOW()
          )
        `,
        [
          tenantId,
          driveFile.id,
          driveFile.name,
          uploadFile.fileType,
          driveFile.mimeType,
          driveFile.size ? Number.parseInt(driveFile.size) : null,
          `https://drive.google.com/file/d/${driveFile.id}/view`,
          uploadFile.localPath,
          JSON.stringify({
            ...uploadFile.metadata,
            drive_created_time: driveFile.createdTime,
            drive_modified_time: driveFile.modifiedTime,
          }),
          "completed",
        ]
      )

      console.log("[v0] Drive file info stored successfully")
    } catch (error) {
      console.error("[v0] Failed to store drive file info:", error)
    }
  }

  private async createSyncStatus(uploadJobId: string, tenantId: string, jobId?: string, totalFiles = 0): Promise<void> {
    console.log("[v0] Creating sync status record:", uploadJobId)

    try {
      await query(
        `
          INSERT INTO drive_sync_status (
            id,
            tenant_id,
            job_id,
            sync_type,
            status,
            total_files,
            processed_files,
            failed_files,
            started_at,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, 'upload', 'pending', $4, 0, 0, NOW(), NOW(), NOW()
          )
        `,
        [uploadJobId, tenantId, jobId || null, totalFiles]
      )
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

      const setClauses: string[] = []
      const values: any[] = []
      let index = 1

      Object.entries(updateData).forEach(([key, value]) => {
        setClauses.push(`${key} = $${index}`)
        values.push(value)
        index++
      })

      values.push(uploadJobId)

      await query(
        `
          UPDATE drive_sync_status
          SET ${setClauses.join(", ")}
          WHERE id = $${index}
        `,
        values
      )
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
      const result = await query(
        `
          SELECT *
          FROM drive_sync_status
          WHERE id = $1
        `,
        [uploadJobId]
      )

      const data = result.rows[0]

      if (!data) {
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
      const result = await query(
        `
          SELECT *
          FROM drive_sync_status
          WHERE tenant_id = $1
            AND sync_type = 'upload'
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [tenantId, limit]
      )

      console.log("[v0] Found recent uploads:", result.rows.length)
      return result.rows
    } catch (error) {
      console.error("[v0] Failed to get recent uploads:", error)
      return []
    }
  }
}
