export default function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 animate-pulse">
          <div className="h-12 w-16 bg-slate-200 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-36 bg-slate-200 rounded" />
            <div className="h-3 w-48 bg-slate-150 rounded" style={{ background: '#e8ecf1' }} />
            <div className="h-3 w-24 bg-slate-100 rounded" style={{ background: '#edf0f4' }} />
          </div>
          <div className="h-4 w-5 bg-slate-200 rounded shrink-0" />
        </div>
      ))}
    </div>
  )
}
