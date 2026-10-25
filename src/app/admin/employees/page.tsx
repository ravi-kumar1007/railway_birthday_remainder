import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Badge } from "@/components/badge";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/skeleton";
import { primaryButtonClass, secondaryButtonClass } from "@/components/styles";
import { rethrowNextErrors } from "@/db/errors";
import { formatBirthday, isBirthdayOn } from "@/lib/birthday";
import { todayInTimeZone } from "@/lib/dates";
import {
  employeeFiltersQuery,
  hasActiveFilters,
  parseEmployeeFilters,
  type EmployeeFilters,
} from "@/lib/employee-filters";
import { EMPLOYEES_PAGE_SIZE, listEmployees } from "@/lib/employees";
import { describeError } from "@/lib/log";
import { formatPhone } from "@/lib/phone";
import { EmployeeFilterBar } from "./filter-bar";

export const metadata: Metadata = { title: "Employees" };

const NOTICES = {
  added: "Employee added.",
  updated: "Changes saved.",
  deactivated: "Employee deactivated. They won't get birthday wishes until you reactivate them.",
  reactivated: "Employee reactivated.",
};

function noticeFor(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && Object.hasOwn(NOTICES, value)
    ? NOTICES[value as keyof typeof NOTICES]
    : undefined;
}

export default function EmployeesPage({ searchParams }: PageProps<"/admin/employees">) {
  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone who can receive a birthday wish."
        actions={
          <>
            <a href="/api/admin/employees/export" download className={secondaryButtonClass}>
              Export CSV
            </a>
            <Link href="/admin/employees/new" className={primaryButtonClass}>
              Add employee
            </Link>
          </>
        }
      />
      {/* The URL is read inside Suspense, so navigating here shows the header at once */}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <EmployeeList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function EmployeeList({ searchParams }: Pick<PageProps<"/admin/employees">, "searchParams">) {
  const params = await searchParams;
  const filters = parseEmployeeFilters(params);
  const notice = noticeFor(params.notice);

  return (
    <>
      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {/* Keyed so the inputs pick up filters changed by a link, such as "Clear filters" */}
      <EmployeeFilterBar key={`filters${employeeFiltersQuery({ ...filters, page: 1 })}`} filters={filters} />
      <Suspense key={`table${employeeFiltersQuery(filters)}`} fallback={<Skeleton className="h-96" />}>
        <EmployeeTable filters={filters} />
      </Suspense>
    </>
  );
}

async function EmployeeTable({ filters }: { filters: EmployeeFilters }) {
  let result: Awaited<ReturnType<typeof listEmployees>>;
  try {
    result = await listEmployees(filters);
  } catch (error) {
    rethrowNextErrors(error);
    console.error("Loading employees failed:", describeError(error));
    return (
      <Message title="Could not load employees">
        Check the database connection, then reload the page.
      </Message>
    );
  }

  const { rows, total } = result;
  if (total === 0) {
    return hasActiveFilters(filters) ? (
      <Message title="No employees match these filters">
        <Link href="/admin/employees" className="font-medium text-emerald-700 hover:text-emerald-800">
          Clear filters
        </Link>
      </Message>
    ) : (
      <Message title="No active employees yet">
        Add people one by one, or import them from a spreadsheet.
        <span className="mt-4 flex justify-center gap-2">
          <Link href="/admin/employees/new" className={primaryButtonClass}>
            Add employee
          </Link>
          <Link href="/admin/import" className={secondaryButtonClass}>
            Import
          </Link>
        </span>
      </Message>
    );
  }

  const lastPage = Math.ceil(total / EMPLOYEES_PAGE_SIZE);
  if (rows.length === 0) {
    return (
      <Message title="This page is empty">
        <Link
          href={`/admin/employees${employeeFiltersQuery({ ...filters, page: lastPage })}`}
          className="font-medium text-emerald-700 hover:text-emerald-800"
        >
          Go to the last page
        </Link>
      </Message>
    );
  }

  const today = todayInTimeZone();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium tracking-wide text-slate-500 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              Name
            </th>
            <th scope="col" className="hidden px-4 py-3 md:table-cell">
              Phone
            </th>
            <th scope="col" className="hidden px-4 py-3 md:table-cell">
              Birthday
            </th>
            <th scope="col" className="hidden px-4 py-3 sm:table-cell">
              WhatsApp
            </th>
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((employee) => {
            const birthday = { day: employee.birthDay, month: employee.birthMonth, year: employee.birthYear };
            const birthdayToday = employee.isActive && isBirthdayOn(birthday, today);
            return (
              <tr key={employee.id} className={employee.isActive ? undefined : "bg-slate-50/60 text-slate-500"}>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`font-medium ${employee.isActive ? "text-slate-900" : ""}`}>{employee.name}</span>
                    {birthdayToday && <Badge tone="amber">🎂 Today</Badge>}
                    {!employee.isActive && <Badge tone="slate">Inactive</Badge>}
                  </div>
                  {employee.empCode && <div className="text-xs text-slate-500">{employee.empCode}</div>}
                  <div className="mt-0.5 text-xs text-slate-500 md:hidden">
                    {formatPhone(employee.phone)} · {formatBirthday(birthday)}
                  </div>
                </td>
                <td className="hidden px-4 py-3 whitespace-nowrap md:table-cell">{formatPhone(employee.phone)}</td>
                <td className="hidden px-4 py-3 whitespace-nowrap md:table-cell">{formatBirthday(birthday)}</td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  {employee.whatsappConsent ? (
                    <Badge tone="emerald">Consented</Badge>
                  ) : (
                    <Badge tone="slate">No consent</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/employees/${employee.id}`}
                    className="font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    Edit<span className="sr-only">, {employee.name}</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pagination filters={filters} total={total} lastPage={lastPage} />
    </div>
  );
}

function Pagination({ filters, total, lastPage }: { filters: EmployeeFilters; total: number; lastPage: number }) {
  const from = (filters.page - 1) * EMPLOYEES_PAGE_SIZE + 1;
  const to = Math.min(filters.page * EMPLOYEES_PAGE_SIZE, total);
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600"
    >
      <p>
        {from}–{to} of {total}
      </p>
      {lastPage > 1 && (
        <div className="flex gap-2">
          <PageLink filters={filters} page={filters.page - 1} disabled={filters.page <= 1}>
            Previous
          </PageLink>
          <PageLink filters={filters} page={filters.page + 1} disabled={filters.page >= lastPage}>
            Next
          </PageLink>
        </div>
      )}
    </nav>
  );
}

function PageLink({
  filters,
  page,
  disabled,
  children,
}: {
  filters: EmployeeFilters;
  page: number;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span aria-disabled className={`${secondaryButtonClass} pointer-events-none opacity-50`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`/admin/employees${employeeFiltersQuery({ ...filters, page })}`} className={secondaryButtonClass}>
      {children}
    </Link>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      <div className="mt-1 text-sm text-slate-500">{children}</div>
    </div>
  );
}
