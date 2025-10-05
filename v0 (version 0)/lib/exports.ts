import { apiFetch } from "@/lib/backend-client"

export async function createAndDownloadExport(jobId: string, format: "csv" | "json" = "csv") {
  const res = await apiFetch("/api/v1/exports/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: jobId, format, filters: {} }),
  })
  if (!res.ok) throw new Error(`Failed to create export (${res.status})`)
  const data = await res.json()
  const exportId = data.id
  // Immediately request download endpoint
  const downloadUrl = `${location.origin.replace(/\/$/, "")}/api/proxy/exports/${exportId}/download`
  // Fallback direct backend URL if no proxy route implemented
  const direct = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000") + `/api/v1/exports/${exportId}/download`
  // Try proxy first (optional), then direct
  triggerBrowserDownload(downloadUrl, format) || triggerBrowserDownload(direct, format)
  return exportId
}

function triggerBrowserDownload(url: string, format: string) {
  try {
    const a = document.createElement("a")
    a.href = url
    a.download = `export.${format}`
    a.style.display = "none"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return true
  } catch {
    return false
  }
}
