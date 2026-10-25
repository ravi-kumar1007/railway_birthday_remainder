"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { secondaryButtonClass } from "./styles";

/** Re-renders the current page on the server, e.g. to run its checks again */
export function RefreshButton({ children, pendingText }: { children: string; pendingText: string }) {
  const router = useRouter();
  const [pending, startRefresh] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startRefresh(() => router.refresh())}
      disabled={pending}
      className={`${secondaryButtonClass} !px-3 !py-1.5`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
