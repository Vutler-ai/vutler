import { Skeleton } from '@/components/ui/skeleton';

export default function BillingLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-32 bg-[#14151f]" />
        <Skeleton className="h-4 w-64 bg-[#14151f]" />
      </div>

      {/* Current plan card */}
      <div className="rounded-xl border border-white/5 bg-[#14151f] p-6">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-28 bg-[#08090f]" />
          <Skeleton className="h-6 w-20 rounded-full bg-[#08090f]" />
        </div>
        <Skeleton className="mb-2 h-8 w-24 bg-[#08090f]" />
        <Skeleton className="h-4 w-48 bg-[#08090f]" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-9 w-32 rounded-lg bg-[#08090f]" />
          <Skeleton className="h-9 w-32 rounded-lg bg-[#08090f]" />
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-[#14151f] p-6">
            <Skeleton className="mb-2 h-5 w-20 bg-[#08090f]" />
            <Skeleton className="mb-4 h-8 w-24 bg-[#08090f]" />
            <div className="flex flex-col gap-2">
              {[...Array(4)].map((_, j) => (
                <Skeleton key={j} className="h-4 w-full bg-[#08090f]" />
              ))}
            </div>
            <Skeleton className="mt-6 h-10 w-full rounded-lg bg-[#08090f]" />
          </div>
        ))}
      </div>

      {/* Invoice history */}
      <div className="rounded-xl border border-white/5 bg-[#14151f] p-6">
        <Skeleton className="mb-4 h-5 w-36 bg-[#08090f]" />
        <div className="flex flex-col gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <Skeleton className="h-4 w-24 bg-[#08090f]" />
              <Skeleton className="h-4 w-20 bg-[#08090f]" />
              <Skeleton className="h-4 w-16 bg-[#08090f]" />
              <Skeleton className="h-6 w-16 rounded bg-[#08090f]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
