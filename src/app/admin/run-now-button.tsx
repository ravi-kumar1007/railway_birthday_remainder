"use client";

import { useState, useTransition } from "react";
import { secondaryButtonClass } from "@/components/styles";
import { runBirthdaysNow, type RunNowResult } from "./actions";

export function RunNowButton({ waiting }: { waiting: number }) {
  const [running, startRun] = useTransition();
  const [result, setResult] = useState<RunNowResult | null>(null);

  function confirmAndRun() {
    const question =
      waiting > 0
        ? `Send birthday wishes now to the ${waiting} ${waiting === 1 ? "person" : "people"} still waiting? Anyone already wished today is skipped.`
        : "Nobody is waiting for a wish. Run the job anyway? Nothing will be sent twice.";
    if (!window.confirm(question)) return;
    startRun(async () => setResult(await runBirthdaysNow()));
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" onClick={confirmAndRun} disabled={running} className={`${secondaryButtonClass} !px-3 !py-1.5`}>
        {running ? "Running…" : "Run now"}
      </button>
      {result && (
        <p role="status" className={`max-w-xs text-right text-xs ${result.ok ? "text-slate-600" : "text-red-700"}`}>
          {result.ok
            ? [
                `Found ${result.summary.birthdaysFound}`,
                `sent ${result.summary.sent}`,
                `failed ${result.summary.failed}`,
                `skipped ${result.summary.skipped}.`,
                result.summary.note,
              ]
                .filter(Boolean)
                .join(" · ")
            : result.error}
        </p>
      )}
    </div>
  );
}
