import { Skeleton } from "@/components/ui/skeleton";

/**
 * Branded, non-blank loading experience used while a route resolves.
 * Keeps the page frame in place so nothing jumps when real content arrives.
 */
export function PageLoader() {
  return (
    <div className="min-h-[60vh] animate-in fade-in duration-300 p-4 sm:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <span className="relative flex h-9 w-9 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
          <span className="absolute inset-2 rounded-full bg-primary/20 blur-[6px] animate-pulse" />
        </span>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold tracking-tight">AD4YOU</p>
          <p className="text-xs text-muted-foreground">Loading your page…</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-3">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default PageLoader;
