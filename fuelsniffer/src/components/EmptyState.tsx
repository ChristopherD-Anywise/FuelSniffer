export default function EmptyState({ fuelLabel, radius }: { fuelLabel: string; radius: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
      <div className="text-4xl mb-4">🔍</div>
      <p className="text-base font-semibold text-slate-700 mb-1">No stations found</p>
      <p className="text-sm text-slate-500 max-w-[280px]">
        No {fuelLabel} stations within {radius} km. Try increasing the radius or switching fuel type.
      </p>
    </div>
  )
}
