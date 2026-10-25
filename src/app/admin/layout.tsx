import { Suspense, type ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { AdminNav } from "./admin-nav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh lg:flex">
      <AdminNav />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<PageSkeleton />}>
            <AdminGate>{children}</AdminGate>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

// The session is read behind Suspense so the shell (nav) can render without waiting on the request
async function AdminGate({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-7 w-48 rounded bg-slate-200" />
      <div className="h-32 rounded-2xl bg-slate-200/70" />
    </div>
  );
}
