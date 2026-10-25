/** Grey placeholder shown while part of a page streams in */
export function Skeleton({ className = "h-40" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} aria-hidden />;
}
