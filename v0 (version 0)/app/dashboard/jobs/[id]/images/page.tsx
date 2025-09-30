import { Suspense } from "react"
import { ImageGallery } from "@/components/image-gallery"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Images } from "lucide-react"
import Link from "next/link"

interface JobImagesPageProps {
  params: { id: string }
}

export default function JobImagesPage({ params }: JobImagesPageProps) {
  // Note: In a real implementation, you'd fetch the job details and tenant_id
  // For now, we'll use placeholder values that would come from the job data
  const jobId = params.id
  const tenantId = "placeholder-tenant-id" // This should come from job data or user context

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/jobs/${jobId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Job
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Images className="w-6 h-6 text-purple-600" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-teal-600 bg-clip-text text-transparent">
              Generated Images
            </h1>
          </div>
        </div>
      </div>

      {/* Image Gallery */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-purple-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Images className="w-5 h-5" />
            Image Gallery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              </div>
            }
          >
            <ImageGallery jobId={jobId} tenantId={tenantId} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
