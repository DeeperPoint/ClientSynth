"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/backend-client"
import { useTenant } from "@/lib/tenant-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, RefreshCw, Images } from "lucide-react"
import { toast } from "sonner"

interface SeedSummary {
  id: string
  name: string
  category: string | null
  status: string
  total_images: number
}

export default function SeedsPage() {
  const { tenant } = useTenant()
  const [seeds, setSeeds] = useState<SeedSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [seedName, setSeedName] = useState("")
  const [category, setCategory] = useState("")

  useEffect(() => {
    if (tenant) loadSeeds()
  }, [tenant?.id])

  const loadSeeds = async () => {
    if (!tenant) return
    setIsLoading(true)
    try {
      const res = await apiFetch(`/api/v1/seeds?tenant_id=${tenant.id}`)
      if (res.ok) {
        const data = await res.json()
        setSeeds(data)
      } else {
        setSeeds([])
      }
    } catch (e) {
      console.error(e)
      toast.error("Failed to load seeds")
    } finally {
      setIsLoading(false)
    }
  }

  const uploadZip = async () => {
    if (!tenant) return toast.error("Select a tenant first")
    if (!zipFile) return toast.error("Choose a zip file")
    if (!seedName.trim()) return toast.error("Provide a seed name")
    try {
      const form = new FormData()
      form.append("tenant_id", tenant.id)
      form.append("name", seedName.trim())
      form.append("description", "")
      form.append("category", category.trim())
      form.append("zip_file", zipFile)
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/v1/seeds/upload`, {
        method: "POST",
        headers: { Authorization: typeof window !== 'undefined' ? `Bearer ${localStorage.getItem('backend_access_token')}` : '' },
        body: form,
      })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      toast.success("Seed uploaded; refreshing list")
      setSeedName("")
      setCategory("")
      setZipFile(null)
      await loadSeeds()
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || "Upload failed")
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Images className="h-6 w-6" /> Seed Libraries</h1>
        <Button variant="outline" size="sm" onClick={loadSeeds} disabled={isLoading}>
          <RefreshCw className="h-4 w-4 mr-2" /> {isLoading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Seed Zip</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-1 space-y-2">
              <Label>Name</Label>
              <Input value={seedName} onChange={e => setSeedName(e.target.value)} placeholder="Certificate Set" />
            </div>
            <div className="md:col-span-1 space-y-2">
              <Label>Category (optional)</Label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="certificate" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Zip File</Label>
              <Input type="file" accept=".zip" onChange={e => setZipFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <Button onClick={uploadZip} disabled={isLoading || !zipFile}>
            <Upload className="h-4 w-4 mr-2" /> Upload
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {seeds.map(seed => (
          <Card key={seed.id} className="hover:shadow-md transition">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex justify-between items-center">
                <span>{seed.name}</span>
                <span className="text-xs px-2 py-1 rounded bg-muted">{seed.category || 'uncategorized'}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>Status: <span className="font-medium">{seed.status}</span></div>
              <div>Total Images: {seed.total_images}</div>
              <Button asChild variant="outline" size="sm" className="mt-2 w-full">
                <a href={`/dashboard/seeds/${seed.id}`}>View Details</a>
              </Button>
            </CardContent>
          </Card>
        ))}
        {seeds.length === 0 && !isLoading && (
          <div className="text-muted-foreground text-sm">No seeds uploaded yet.</div>
        )}
      </div>
    </div>
  )
}
