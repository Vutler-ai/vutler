import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="flex gap-0">
      {/* Settings sidebar */}
      <div className="flex w-56 flex-col gap-1 border-r border-white/5 p-4">
        <Skeleton className="mb-3 h-5 w-24 bg-[#14151f]" />
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg bg-[#14151f]" />
        ))}
      </div>

      {/* Settings content */}
      <div className="flex flex-1 flex-col gap-6 p-8">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-7 w-48 bg-[#14151f]" />
          <Skeleton className="h-4 w-72 bg-[#14151f]" />
        </div>

        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-xl border border-white/5 bg-[#14151f] p-6">
            <Skeleton className="h-5 w-32 bg-[#08090f]" />
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-20 bg-[#08090f]" />
                <Skeleton className="h-10 w-full rounded-lg bg-[#08090f]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-28 bg-[#08090f]" />
                <Skeleton className="h-10 w-full rounded-lg bg-[#08090f]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
