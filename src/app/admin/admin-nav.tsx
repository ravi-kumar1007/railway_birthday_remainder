"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { logout } from "@/app/login/actions";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/import", label: "Import" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/logs", label: "Send logs" },
  { href: "/admin/settings", label: "Settings" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

// Read here rather than passed from the server layout: NEXT_PUBLIC_ values are fixed at build time
// in the browser, and the prerendered page must show the same name or hydration fails
const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || "Company";

export function AdminNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white lg:h-dvh lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
      <div className="flex h-14 items-center justify-between px-4 lg:h-16 lg:px-5">
        <Link href="/admin" className="flex min-w-0 items-center gap-2.5" onClick={close}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-base text-white">
            <span aria-hidden>🎂</span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">Birthday Wishes</span>
            <span className="block truncate text-xs leading-tight text-slate-500">{companyName}</span>
          </span>
        </Link>
        <button
          type="button"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-expanded={open}
          aria-controls="admin-nav-links"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden>
            {open ? (
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z" />
            ) : (
              <path d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5A.75.75 0 0 1 2.75 9h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 9.75Zm0 5a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" />
            )}
          </svg>
        </button>
      </div>

      <nav
        id="admin-nav-links"
        className={`${open ? "block" : "hidden"} border-t border-slate-200 px-3 pb-4 lg:flex lg:h-[calc(100dvh-4rem)] lg:flex-col lg:border-t-0`}
      >
        {/* The URL of a page like /admin/employees/[id] is only known per request, so the active
            highlight streams in; the fallback is the same list without it */}
        <Suspense fallback={<NavLinks pathname={null} onNavigate={close} />}>
          <CurrentNavLinks onNavigate={close} />
        </Suspense>
        <form action={logout} className="mt-3 border-t border-slate-200 pt-3">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}

function CurrentNavLinks({ onNavigate }: { onNavigate: () => void }) {
  return <NavLinks pathname={usePathname()} onNavigate={onNavigate} />;
}

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate: () => void }) {
  return (
    <ul className="space-y-0.5 pt-3 lg:flex-1">
      {links.map((link) => {
        const active = pathname !== null && isActive(pathname, link.href);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
