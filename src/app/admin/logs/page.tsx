import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { isUnknownOutcome, SendStatusBadge } from "@/components/send-status-badge";
import { Skeleton } from "@/components/skeleton";
import { secondaryButtonClass } from "@/components/styles";
import { rethrowNextErrors } from "@/db/errors";
import { requireAdmin } from "@/lib/auth/session";
import { appTimeZone } from "@/lib/dates";
import { describeError } from "@/lib/log";
import { logFiltersQuery, parseLogFilters } from "@/lib/log-filters";
import { formatPhone } from "@/lib/phone";
import { listSendLogs, LOGS_PAGE_SIZE } from "@/lib/send-logs";
import { LogFilterBar } from "./log-filter-bar";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Send logs" };

export default function LogsPage({ searchParams }: PageProps<"/admin/logs">) {
  return (
    <>
      <PageHeader
        title="Send logs"
        description="Every birthday wish and its delivery status. Ticks update as WhatsApp reports them."
      />
      {/* The URL is read inside Suspense, so navigating here shows the header at once */}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Logs searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Logs({ searchParams }: Pick<PageProps<"/admin/logs">, "searchParams">) {
  // Checked here too, not only by the proxy: this component loads admin data
  await requireAdmin();
  const filters = parseLogFilters(await searchParams);
  const timeZone = appTimeZone();

  let result: Awaited<ReturnType<typeof listSendLogs>>;
  try {
    result = await listSendLogs(filters, timeZone);
  } catch (error) {
    rethrowNextErrors(error);
    console.error("Loading send logs failed:", describeError(error));
    return (
      <p role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-center text-sm text-red-700">
        Could not load the send logs. Check the database connection, then reload the page.
      </p>
    );
  }

  const { rows, total } = result;
  const lastPage = Math.max(1, Math.ceil(total / LOGS_PAGE_SIZE));
  const when = new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <LogFilterBar key={logFiltersQuery({ ...filters, page: 1 })} filters={filters} />
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {total > 0 ? "This page is empty." : "No sends match these filters yet."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-4 py-3">Employee</th>
                <th scope="col" className="hidden px-4 py-3 md:table-cell">Sent</th>
                <th scope="col" className="hidden px-4 py-3 lg:table-cell">Template</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const unknown = isUnknownOutcome(row);
                return (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.employeeName}</div>
                      <div className="text-xs text-slate-500">{formatPhone(row.employeePhone)}</div>
                      <div className="mt-0.5 text-xs text-slate-500 md:hidden">{when.format(row.createdAt)}</div>
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap text-slate-600 md:table-cell">
                      {when.format(row.createdAt)}
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-slate-600 lg:table-cell">
                      {row.templateName ?? "deleted template"}
                    </td>
                    <td className="px-4 py-3">
                      <SendStatusBadge log={row} />
                      {row.errorMessage && (
                        <p className="mt-1 max-w-xs text-xs text-red-700">
                          {row.errorCode && <span className="font-mono">{row.errorCode}: </span>}
                          {row.errorMessage}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(row.status === "failed" || unknown) && <RetryButton logId={row.id} unknown={unknown} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600"
          >
            <p>
              {total.toLocaleString("en-IN")} send{total === 1 ? "" : "s"}
            </p>
            {lastPage > 1 && (
              <div className="flex items-center gap-2">
                {filters.page > 1 && (
                  <Link href={`/admin/logs${logFiltersQuery({ ...filters, page: filters.page - 1 })}`} className={secondaryButtonClass}>
                    Previous
                  </Link>
                )}
                <span>
                  Page {filters.page} of {lastPage}
                </span>
                {filters.page < lastPage && (
                  <Link href={`/admin/logs${logFiltersQuery({ ...filters, page: filters.page + 1 })}`} className={secondaryButtonClass}>
                    Next
                  </Link>
                )}
              </div>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
