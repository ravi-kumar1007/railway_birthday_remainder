import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-emerald-600 text-2xl text-white shadow-sm">
            <span aria-hidden>🎂</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Birthday Wishes</h1>
          <p className="mt-1 text-sm text-slate-500">
            {process.env.NEXT_PUBLIC_COMPANY_NAME || "Company"} admin
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-slate-700">
            Privacy policy
          </Link>
        </p>
      </div>
    </main>
  );
}
