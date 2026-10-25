"use client";

import { primaryButtonClass } from "@/components/styles";

// Shown inside the admin layout, so the navigation keeps working
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  // In production the message is hidden; the digest matches the server log entry
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xs">
      <h1 className="text-lg font-semibold">This page couldn&apos;t load</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        This is usually a database connection problem. Check DATABASE_URL and that the Neon project is running, then
        try again.
      </p>
      {digest && <p className="mt-2 text-xs text-slate-400">Reference: {digest}</p>}
      <button type="button" onClick={retry} className={`mt-5 ${primaryButtonClass}`}>
        Try again
      </button>
    </div>
  );
}
