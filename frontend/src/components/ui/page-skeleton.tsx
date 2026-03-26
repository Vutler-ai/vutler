import { Skeleton } from '@/components/ui/skeleton';

interface PageSkeletonProps {
  /** Number of content card rows to render. Defaults to 6. */
  rows?: number;
}

export function PageSkeleton({ rows = 6 }: PageSkeletonProps) {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48 bg-[#14151f]" />
          <Skeleton className="h-4 w-72 bg-[#14151f]" />
        </div>
        <Skeleton className="h-9 w-28 bg-[#14151f]" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-[#14151f] p-4">
            <Skeleton className="mb-2 h-4 w-20 bg-[#08090f]" />
            <Skeleton className="h-7 w-14 bg-[#08090f]" />
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-[#14151f] p-5">
            <div className="mb-3 flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full bg-[#08090f]" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32 bg-[#08090f]" />
                <Skeleton className="h-3 w-20 bg-[#08090f]" />
              </div>
            </div>
            <Skeleton className="mb-2 h-3 w-full bg-[#08090f]" />
            <Skeleton className="h-3 w-4/5 bg-[#08090f]" />
          </div>
        ))}
      </div>
    </div>
  );
}
