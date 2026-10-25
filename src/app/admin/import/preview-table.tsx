"use client";

import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/badge";
import type { PreviewRow, PreviewStatus } from "@/lib/import/preview";

// Rendering tens of thousands of rows would freeze the page; the counts above stay exact
const SHOWN_ROWS = 200;

const STATUS: Record<PreviewStatus, { label: string; tone: BadgeTone }> = {
  valid: { label: "Ready", tone: "emerald" },
  error: { label: "Error", tone: "red" },
  duplicate: { label: "Duplicate", tone: "amber" },
};

type Filter = "all" | PreviewStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "valid", label: "Ready" },
  { value: "error", label: "Errors" },
  { value: "duplicate", label: "Duplicates" },
];

export function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const matching = (value: Filter) => (value === "all" ? rows : rows.filter((row) => row.status === value));
  const visible = matching(filter);

  return (
    <div>
      <div role="group" aria-label="Show rows" className="flex flex-wrap gap-2 px-5 pb-4 sm:px-6">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              filter === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label} <span className="tabular-nums opacity-70">{matching(value).length.toLocaleString("en-IN")}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border-t border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5">Row</th>
              <th scope="col" className="px-4 py-2.5">Status</th>
              <th scope="col" className="px-4 py-2.5">Name</th>
              <th scope="col" className="px-4 py-2.5">Phone</th>
              <th scope="col" className="px-4 py-2.5">Date of birth</th>
              <th scope="col" className="px-4 py-2.5">Emp code</th>
              <th scope="col" className="px-4 py-2.5">Consent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.slice(0, SHOWN_ROWS).map((row) => (
              <tr key={row.line} className="align-top">
                <td className="px-4 py-2.5 text-slate-500 tabular-nums">{row.line}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                  {row.issues.length > 0 && (
                    <ul className="mt-1 max-w-56 space-y-0.5 text-xs text-slate-600">
                      {row.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{row.name || "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{row.phone || "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{row.birthday || "—"}</td>
                <td className="px-4 py-2.5">{row.empCode || "—"}</td>
                <td className="px-4 py-2.5">{row.consent || "—"}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No rows here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {visible.length > SHOWN_ROWS && (
        <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500 sm:px-6">
          Showing the first {SHOWN_ROWS} of {visible.length.toLocaleString("en-IN")} rows.
        </p>
      )}
    </div>
  );
}
