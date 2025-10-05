import { Skeleton } from "@/components/ui/skeleton"
import { UI_CONFIG } from "@/lib/ui-config"

export default function Loading() {
  return (
    <div className={`max-w-7xl mx-auto ${UI_CONFIG.spacing.page.full}`}>
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div className={UI_CONFIG.spacing.section.small}>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-4 mb-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Jobs grid skeleton */}
      <div className={`grid ${UI_CONFIG.grid.cols.default} ${UI_CONFIG.grid.gap.medium}`}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="border rounded-lg p-6 space-y-4">
            <div className="flex items-start justify-between">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
