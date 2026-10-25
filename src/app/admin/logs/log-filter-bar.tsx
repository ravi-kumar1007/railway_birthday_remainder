"use client";

import Form from "next/form";
import Link from "next/link";
import type { ChangeEvent } from "react";
import { controlClass, secondaryButtonClass } from "@/components/styles";
import type { LogFilters } from "@/lib/log-filters";

function submitOnChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  event.currentTarget.form?.requestSubmit();
}

export function LogFilterBar({ filters }: { filters: LogFilters }) {
  const filtered = filters.date !== null || filters.status !== "all";
  return (
    <Form action="/admin/logs" className="mb-4 flex flex-wrap items-center gap-2">
      <label htmlFor="date" className="sr-only">
        Date
      </label>
      <input
        id="date"
        name="date"
        type="date"
        defaultValue={filters.date ?? ""}
        onChange={submitOnChange}
        className={`${controlClass} w-auto`}
      />
      <label htmlFor="status" className="sr-only">
        Status
      </label>
      <select
        id="status"
        name="status"
        defaultValue={filters.status}
        onChange={submitOnChange}
        className={`${controlClass} w-auto`}
      >
        <option value="all">All statuses</option>
        <option value="queued">Sending or unknown</option>
        <option value="sent">Sent</option>
        <option value="delivered">Delivered</option>
        <option value="read">Read</option>
        <option value="failed">Failed</option>
      </select>
      <button type="submit" className={`${secondaryButtonClass} !py-1.5`}>
        Apply
      </button>
      {filtered && (
        <Link href="/admin/logs" className="px-2 text-sm font-medium text-emerald-700 hover:text-emerald-800">
          Clear
        </Link>
      )}
    </Form>
  );
}
