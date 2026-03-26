import { Skeleton } from '@/components/ui/skeleton';

export default function ChatLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full bg-[#14151f]" />
        <Skeleton className="h-5 w-40 bg-[#14151f]" />
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`flex gap-3 ${i % 2 === 1 ? 'flex-row-reverse' : ''}`}>
            <Skeleton className="h-8 w-8 flex-shrink-0 rounded-full bg-[#14151f]" />
            <div className="flex max-w-[60%] flex-col gap-1">
              <Skeleton
                className={`h-10 rounded-xl bg-[#14151f] ${i % 2 === 1 ? 'w-48' : 'w-64'}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <Skeleton className="h-12 w-full rounded-xl bg-[#14151f]" />
    </div>
  );
}
