"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Download, Eye, RefreshCw, Trash2, ZoomIn } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

interface MediaItem {
  id: string
  s3_key: string
  s3_bucket: string
  tenant_id: string
  width: number
  height: number
  file_size: number
  model_name: string
  prompt: string
  created_at: string
  record_id: string
}

interface ImageGalleryProps {
  jobId: string
  tenantId: string
}

export function ImageGallery({ jobId, tenantId }: ImageGalleryProps) {
  const [images, setImages] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<MediaItem | null>(null)
  const [regenerating, setRegenerating] = useState<string | null>(null)

  useEffect(() => {
    loadImages()
  }, [jobId])

  const loadImages = async () => {
    try {
      const response = await fetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "select",
          table: "media",
          columns: "*",
          where: { op: "eq", column: "job_id", value: jobId },
          orderBy: { column: "created_at", ascending: false },
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to load images")
      }

      const result = await response.json()
      const items: MediaItem[] = (result.data || []).filter((item: MediaItem) => item.tenant_id === tenantId)
      setImages(items)
    } catch (error) {
      console.error("Failed to load images:", error)
    } finally {
      setLoading(false)
    }
  }

  const getImageUrl = (item: MediaItem) => {
    return `https://${item.s3_bucket}.s3.${process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1"}.amazonaws.com/${item.s3_key}`
  }

  const regenerateImage = async (item: MediaItem) => {
    setRegenerating(item.id)
    try {
      const response = await fetch("/api/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          jobId,
          recordId: item.record_id,
          prompt: item.prompt,
          model: item.model_name,
        }),
      })

      if (response.ok) {
        await loadImages() // Refresh the gallery
      }
    } catch (error) {
      console.error("Failed to regenerate image:", error)
    } finally {
      setRegenerating(null)
    }
  }

  const deleteImage = async (item: MediaItem) => {
    try {
      const response = await fetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          table: "media",
          where: { op: "eq", column: "id", value: item.id },
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || "Failed to delete image")
      }
      setImages(images.filter((img) => img.id !== item.id))
    } catch (error) {
      console.error("Failed to delete image:", error)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8" role="status" aria-label="Loading images">
        <Spinner className="h-8 w-8" />
        <span className="sr-only">Loading images...</span>
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <Empty className="border-2 border-dashed border-muted">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Eye className="w-8 h-8" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No Images Generated</EmptyTitle>
          <EmptyDescription>Images will appear here once the job generates them.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-6">
      {/* Gallery Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
            {images.length} Images
          </Badge>
          <Badge variant="outline">
            Total Size: {formatFileSize(images.reduce((sum, img) => sum + img.file_size, 0))}
          </Badge>
        </div>
        <Button onClick={loadImages} variant="outline" size="sm" aria-label="Refresh image gallery">
          <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* Image Grid */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        role="list"
        aria-label="Generated images"
      >
        {images.map((item) => (
          <Card
            key={item.id}
            className="group hover:shadow-lg transition-all duration-200 overflow-hidden"
            role="listitem"
          >
            <div className="relative aspect-square">
              <img
                src={getImageUrl(item) || "/placeholder.svg"}
                alt={`AI-generated image: ${item.prompt.substring(0, 100)}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {/* Overlay with actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedImage(item)}
                      aria-label={`View full size image: ${item.prompt.substring(0, 50)}`}
                    >
                      <ZoomIn className="w-4 h-4" aria-hidden="true" />
                      <span className="sr-only">View full size</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>Image Details</DialogTitle>
                    </DialogHeader>
                    {selectedImage && (
                      <div className="space-y-4">
                        <img
                          src={getImageUrl(selectedImage) || "/placeholder.svg"}
                          alt={`Full size: ${selectedImage.prompt}`}
                          className="w-full max-h-96 object-contain rounded-lg"
                        />
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <strong>Model:</strong> {selectedImage.model_name}
                          </div>
                          <div>
                            <strong>Dimensions:</strong> {selectedImage.width}×{selectedImage.height}
                          </div>
                          <div>
                            <strong>File Size:</strong> {formatFileSize(selectedImage.file_size)}
                          </div>
                          <div>
                            <strong>Created:</strong> {new Date(selectedImage.created_at).toLocaleDateString()}
                          </div>
                          <div className="col-span-2">
                            <strong>Prompt:</strong> {selectedImage.prompt}
                          </div>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => regenerateImage(item)}
                  disabled={regenerating === item.id}
                  aria-label={`Regenerate image: ${item.prompt.substring(0, 50)}`}
                >
                  {regenerating === item.id ? (
                    <>
                      <Spinner className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Regenerating...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" aria-hidden="true" />
                      <span className="sr-only">Regenerate</span>
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  asChild
                  aria-label={`Download image: ${item.prompt.substring(0, 50)}`}
                >
                  <a href={getImageUrl(item)} download target="_blank" rel="noopener noreferrer">
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span className="sr-only">Download</span>
                  </a>
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteImage(item)}
                  aria-label={`Delete image: ${item.prompt.substring(0, 50)}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  <span className="sr-only">Delete</span>
                </Button>
              </div>
            </div>

            <CardContent className="p-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    {item.model_name.split("/").pop()}
                  </Badge>
                  <span className="text-xs text-gray-500">{formatFileSize(item.file_size)}</span>
                </div>
                <p className="text-xs text-gray-600 line-clamp-2">{item.prompt}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
