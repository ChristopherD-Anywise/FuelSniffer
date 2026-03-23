'use client'

export default function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
      <div className="text-4xl mb-4">⚠️</div>
      <p className="text-base font-semibold text-slate-700 mb-1">Couldn&apos;t load prices</p>
      <p className="text-sm text-slate-500 mb-4 max-w-[280px]">
        Something went wrong fetching the latest prices. Check your connection and try again.
      </p>
      <button
        onClick={onRetry}
        className="h-10 px-5 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm shadow-sky-200"
      >
        Try loading again
      </button>
    </div>
  )
}
