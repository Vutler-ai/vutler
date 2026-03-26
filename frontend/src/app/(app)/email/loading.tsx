import { Skeleton } from '@/components/ui/skeleton';

export default function EmailLoading() {
  return (
    <div className="flex h-full gap-0">
      {/* Sidebar */}
      <div className="flex w-64 flex-col gap-3 border-r border-white/5 p-4">
        <Skeleton className="h-9 w-full bg-[#14151f]" />
        <div className="mt-2 flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg bg-[#14151f]" />
          ))}
        </div>
      </div>

      {/* Email list */}
      <div className="flex flex-1 flex-col gap-2 border-r border-white/5 p-4">
        <Skeleton className="mb-2 h-6 w-32 bg-[#14151f]" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex flex-col gap-1 rounded-lg border border-white/5 bg-[#14151f] p-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32 bg-[#08090f]" />
              <Skeleton className="h-3 w-16 bg-[#08090f]" />
            </div>
            <Skeleton className="h-3 w-48 bg-[#08090f]" />
            <Skeleton className="h-3 w-full bg-[#08090f]" />
          </div>
        ))}
      </div>

      {/* Preview pane */}
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-6 w-3/4 bg-[#14151f]" />
        <Skeleton className="h-4 w-1/2 bg-[#14151f]" />
        <div className="mt-2 flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-4 w-full bg-[#14151f]" />
          ))}
          <Skeleton className="h-4 w-3/4 bg-[#14151f]" />
        </div>
      </div>
    </div>
  );
}
