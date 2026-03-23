'use client'

export default function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
      <p className="text-lg font-bold text-zinc-700 mb-2">Couldn&apos;t load prices</p>
      <p className="text-[15px] text-zinc-500 mb-4">
        Something went wrong fetching the latest prices. Check your connection and try again.
      </p>
      <button
        onClick={onRetry}
        className="h-11 px-6 bg-blue-600 text-white font-bold rounded-md text-[15px]"
      >
        Try loading again
      </button>
    </div>
  )
}
