"use client";

import Form from "next/form";
import type { ChangeEvent } from "react";
import { controlClass, secondaryButtonClass } from "@/components/styles";
import type { EmployeeFilters } from "@/lib/employee-filters";

function submitOnChange(event: ChangeEvent<HTMLSelectElement>) {
  event.currentTarget.form?.requestSubmit();
}

export function EmployeeFilterBar({ filters }: { filters: EmployeeFilters }) {
  return (
    <Form action="/admin/employees" role="search" className="mb-4 flex flex-col gap-2 sm:flex-row">
      <label htmlFor="q" className="sr-only">
        Search employees
      </label>
      <input
        id="q"
        name="q"
        type="search"
        maxLength={100}
        defaultValue={filters.q}
        placeholder="Search name, phone or employee code"
        className={`${controlClass} sm:flex-1`}
      />
      <div className="flex gap-2">
        <label htmlFor="status" className="sr-only">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={filters.status}
          onChange={submitOnChange}
          className={`${controlClass} min-w-0 flex-1 sm:w-36 sm:flex-none`}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All employees</option>
        </select>
        <label htmlFor="consent" className="sr-only">
          WhatsApp consent
        </label>
        <select
          id="consent"
          name="consent"
          defaultValue={filters.consent}
          onChange={submitOnChange}
          className={`${controlClass} min-w-0 flex-1 sm:w-36 sm:flex-none`}
        >
          <option value="all">Any consent</option>
          <option value="yes">Consented</option>
          <option value="no">No consent</option>
        </select>
        <button type="submit" className={secondaryButtonClass}>
          Search
        </button>
      </div>
    </Form>
  );
}
