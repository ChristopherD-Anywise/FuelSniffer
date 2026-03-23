export default function LoadingSkeleton() {
  return (
    <div className="divide-y divide-zinc-100">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="p-4 min-h-[80px] grid grid-cols-[80px_1fr_56px] gap-3 animate-pulse">
          <div className="flex flex-col items-end justify-center gap-1">
            <div className="h-7 w-16 bg-zinc-200 dark:bg-zinc-700 rounded" />
            <div className="h-3 w-6 bg-zinc-200 dark:bg-zinc-700 rounded" />
          </div>
          <div className="flex flex-col justify-center gap-2 pl-3">
            <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-700 rounded" />
            <div className="h-3 w-48 bg-zinc-200 dark:bg-zinc-700 rounded" />
            <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-700 rounded" />
          </div>
          <div className="flex items-center justify-end">
            <div className="h-4 w-10 bg-zinc-200 dark:bg-zinc-700 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
