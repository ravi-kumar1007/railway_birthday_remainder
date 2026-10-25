"use client";

import { primaryButtonClass } from "@/components/styles";

// Catches errors in the admin layout itself (such as invalid settings), which admin/error.tsx can't
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  // In production the message is hidden; the digest matches the server log entry
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div role="alert" className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xs">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          If the app was just set up, check its environment variables (DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD_HASH,
          SESSION_SECRET). The server log names the one that&apos;s wrong.
        </p>
        {digest && <p className="mt-2 text-xs text-slate-400">Reference: {digest}</p>}
        <button type="button" onClick={retry} className={`mt-5 ${primaryButtonClass}`}>
          Try again
        </button>
      </div>
    </main>
  );
}
