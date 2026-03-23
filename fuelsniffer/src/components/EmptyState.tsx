export default function EmptyState({ fuelLabel, radius }: { fuelLabel: string; radius: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
      <p className="text-lg font-bold text-zinc-700 mb-2">No stations found</p>
      <p className="text-[15px] text-zinc-500">
        No {fuelLabel} stations within {radius} km. Try increasing the radius or switching fuel type.
      </p>
    </div>
  )
}
