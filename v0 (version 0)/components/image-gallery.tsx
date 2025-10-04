"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Download, Eye, RefreshCw, Trash2, ZoomIn } from "lucide-react"
import { apiFetch } from "@/lib/backend-client"

interface MediaItem {
  id: string
  s3_key: string
  s3_bucket: string
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

  // TODO: Replace with backend image listing if needed

  useEffect(() => {
    loadImages()
  }, [jobId])

  const loadImages = async () => {
    try {
      const res = await apiFetch(`/api/v1/jobs/${jobId}/media`)
      if (res.ok) {
        const data = await res.json()
        setImages(Array.isArray(data) ? data : [])
      } else {
        setImages([])
      }
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
      const res = await apiFetch(`/api/v1/media/${item.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete image")
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
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <Card className="border-dashed border-2 border-gray-300">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Eye className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Images Generated</h3>
          <p className="text-gray-500">Images will appear here once the job generates them.</p>
        </CardContent>
      </Card>
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
        <Button onClick={loadImages} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Image Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {images.map((item) => (
          <Card key={item.id} className="group hover:shadow-lg transition-all duration-200 overflow-hidden">
            <div className="relative aspect-square">
              <img
                src={getImageUrl(item) || "/placeholder.svg"}
                alt={`Generated image for record ${item.record_id}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {/* Overlay with actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="secondary" onClick={() => setSelectedImage(item)}>
                      <ZoomIn className="w-4 h-4" />
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
                          alt="Full size image"
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
                >
                  {regenerating === item.id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>

                <Button size="sm" variant="secondary" asChild>
                  <a href={getImageUrl(item)} download target="_blank" rel="noopener noreferrer">
                    <Download className="w-4 h-4" />
                  </a>
                </Button>

                <Button size="sm" variant="destructive" onClick={() => deleteImage(item)}>
                  <Trash2 className="w-4 h-4" />
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
