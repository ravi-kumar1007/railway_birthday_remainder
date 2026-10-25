"use client";

import { useState, useTransition } from "react";
import { secondaryButtonClass } from "@/components/styles";
import { retrySend } from "./actions";

export function RetryButton({ logId, unknown }: { logId: string; unknown: boolean }) {
  const [pending, startRetry] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retry() {
    const question = unknown
      ? "Meta never confirmed this message, so it may already have arrived. Check with the employee first. Send it again?"
      : "Send this birthday wish again?";
    if (!window.confirm(question)) return;
    startRetry(async () => {
      const result = await retrySend(logId);
      setError(result.ok ? null : result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={retry} disabled={pending} className={`${secondaryButtonClass} !px-3 !py-1`}>
        {pending ? "Sending…" : "Retry"}
      </button>
      {error && (
        <p role="alert" className="max-w-56 text-right text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
