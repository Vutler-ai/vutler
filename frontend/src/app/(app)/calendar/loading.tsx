import { Skeleton } from '@/components/ui/skeleton';

export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-lg bg-[#14151f]" />
          <Skeleton className="h-7 w-40 bg-[#14151f]" />
          <Skeleton className="h-9 w-9 rounded-lg bg-[#14151f]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-lg bg-[#14151f]" />
          <Skeleton className="h-9 w-20 rounded-lg bg-[#14151f]" />
          <Skeleton className="h-9 w-28 rounded-lg bg-[#14151f]" />
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-8 rounded-none bg-[#14151f]" />
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px">
        {[...Array(35)].map((_, i) => (
          <div key={i} className="flex min-h-[100px] flex-col gap-1 rounded-lg border border-white/5 bg-[#14151f] p-2">
            <Skeleton className="h-5 w-5 rounded-full bg-[#08090f]" />
            {i % 5 === 0 && <Skeleton className="h-5 w-full rounded bg-[#08090f]" />}
            {i % 7 === 2 && <Skeleton className="h-5 w-full rounded bg-[#08090f]" />}
          </div>
        ))}
      </div>
    </div>
  );
}
