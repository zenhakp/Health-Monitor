export function SkeletonVital() {
  return (
    <div className="vital-card p-4">
      <div className="flex justify-between mb-3">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-5 w-12" />
      </div>
      <div className="skeleton h-16 w-full" />
    </div>
  );
}

export function SkeletonAlert() {
  return (
    <div className="bg-dark-900 border border-dark-600 rounded-xl p-4 mb-2">
      <div className="flex gap-3">
        <div className="skeleton h-4 w-16 rounded-full" />
        <div className="skeleton h-4 w-32" />
      </div>
      <div className="skeleton h-3 w-full mt-3" />
      <div className="skeleton h-3 w-3/4 mt-1" />
    </div>
  );
}

export function SkeletonPatient() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-dark-900">
      <div className="skeleton w-9 h-9 rounded-full" />
      <div className="flex-1">
        <div className="skeleton h-3 w-24 mb-1" />
        <div className="skeleton h-3 w-32" />
      </div>
    </div>
  );
}