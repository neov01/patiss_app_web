import { Skeleton } from '@/components/ui/Skeleton'

export default function DepensesLoading() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Title skeleton */}
      <div className="space-y-2">
        <Skeleton height={32} width={260} />
        <Skeleton height={16} width={400} />
      </div>

      {/* Hero gauge skeleton */}
      <div className="bg-white rounded-2xl p-6 border border-[rgba(131,116,107,0.15)] space-y-4">
        <div className="flex justify-between">
          <Skeleton height={24} width={180} />
          <Skeleton height={24} width={100} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-5 space-y-2">
            <Skeleton height={14} width={150} />
            <Skeleton height={44} width={220} />
          </div>
          <div className="md:col-span-7 space-y-2">
            <Skeleton height={14} width="100%" />
            <Skeleton height={14} width="100%" />
          </div>
        </div>
      </div>

      {/* Quick actions skeleton */}
      <div className="flex gap-3">
        <Skeleton height={48} width={180} />
        <Skeleton height={48} width={180} />
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Skeleton height={90} />
        <Skeleton height={90} />
        <Skeleton height={90} />
        <Skeleton height={90} />
      </div>

      {/* Feed skeleton */}
      <div className="space-y-3 pt-2">
        <Skeleton height={20} width={200} />
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    </div>
  )
}
