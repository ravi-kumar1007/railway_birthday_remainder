"use client";

import { Fragment, useLayoutEffect, useState, type ReactNode } from "react";

/**
 * Next.js keeps visited pages mounted but hidden (Activity). This remounts its children whenever they
 * are hidden, so coming back to a form shows fresh values instead of a stale draft or error.
 */
export function FreshOnReturn({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState(0);
  useLayoutEffect(() => () => setInstance((n) => n + 1), []);
  return <Fragment key={instance}>{children}</Fragment>;
}
