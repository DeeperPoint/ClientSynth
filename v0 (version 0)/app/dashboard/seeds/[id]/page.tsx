"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { apiFetch } from "@/lib/backend-client"
import { useTenant } from "@/lib/tenant-context"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { ArrowLeft, RefreshCw } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

interface SeedImageInfo {
  id: string
  filename: string
  url: string
  w: number | null
  h: number | null
}

interface SeedDetail {
  id: string
  tenant_id: string
  name: string
  category: string | null
  status: string
  total_images: number
  processed_images: number
  description: string | null
  images?: SeedImageInfo[]
}

export default function SeedDetailPage() {
  const params = useParams()
  const seedId = params.id as string
  const { tenant } = useTenant()
  const [seed, setSeed] = useState<SeedDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (tenant) loadSeed()
  }, [tenant?.id, seedId])

  const loadSeed = async () => {
    if (!tenant) return
    setRefreshing(true)
    try {
      const res = await apiFetch(`/api/v1/seeds/${seedId}?include_images=true`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const data = await res.json()
      setSeed(data)
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Failed to load seed')
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  if (loading) return <div className="p-6">Loading...</div>
  if (!seed) return <div className="p-6">Seed not found</div>

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/seeds"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
          <h1 className="text-2xl font-bold">{seed.name}</h1>
          <span className="text-xs px-2 py-1 rounded bg-muted">{seed.category || 'uncategorized'}</span>
        </div>
        <Button onClick={loadSeed} variant="outline" size="sm" disabled={refreshing}>
          <RefreshCw className="h-4 w-4 mr-2" /> {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4 text-sm">
          <div><span className="font-medium">Status:</span> {seed.status}</div>
          <div><span className="font-medium">Images:</span> {seed.total_images}</div>
          <div><span className="font-medium">Processed:</span> {seed.processed_images}</div>
          <div><span className="font-medium">Description:</span> {seed.description || '—'}</div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {(seed.images || []).map(img => (
          <div key={img.id} className="border rounded bg-white overflow-hidden flex flex-col">
            <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.filename} className="object-cover w-full h-full" />
            </div>
            <div className="p-2 text-xs space-y-1">
              <div className="font-medium truncate" title={img.filename}>{img.filename}</div>
              <div>{img.w || '—'}×{img.h || '—'}</div>
              <div className="break-all text-[10px] text-muted-foreground">{img.id}</div>
            </div>
          </div>
        ))}
        {(!seed.images || seed.images.length === 0) && (
          <div className="text-sm text-muted-foreground">No images in this seed.</div>
        )}
      </div>
    </div>
  )
}
