"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** A submit button that disables itself while its form's Server Action runs */
export function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: ReactNode;
  pendingText: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}
