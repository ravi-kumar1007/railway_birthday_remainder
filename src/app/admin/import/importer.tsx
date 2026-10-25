"use client";

import Link from "next/link";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { controlClass, primaryButtonClass, secondaryButtonClass } from "@/components/styles";
import { sampleImportCsv } from "@/lib/employee-csv";
import {
  detectColumns,
  FIELD_LABELS,
  IMPORT_FIELDS,
  REQUIRED_FIELDS,
  type ColumnMapping,
  type ImportField,
} from "@/lib/import/columns";
import { IMPORT_CHUNK_SIZE, type ImportChunkResult, type ImportMode } from "@/lib/import/plan";
import { buildPreview, sheetToTable, type PreviewRow } from "@/lib/import/preview";
import { IMPORT_ACCEPT, ImportFileError, readImportFile, type ImportFile } from "@/lib/import/read-file";
import { PreviewTable } from "./preview-table";

const SAMPLE_CSV_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${sampleImportCsv()}`)}`;

type LoadedFile = ImportFile & { fileName: string };

type Outcome = {
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: { line: number; reason: string }[];
  /** Set when a chunk failed; that chunk and everything after it was not saved */
  error?: string;
  sent: number;
  notSaved: number;
};

const number = (value: number) => value.toLocaleString("en-IN");

async function sendChunk(mode: ImportMode, rows: PreviewRow[]): Promise<ImportChunkResult> {
  try {
    const response = await fetch("/api/admin/employees/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, rows: rows.map((row) => row.data) }),
    });
    const body = (await response.json().catch(() => null)) as ImportChunkResult | null;
    if (response.ok && body && !("error" in body)) return body;
    if (response.status === 401) return { error: "Your session has expired. Sign in again, then retry the import." };
    return { error: body && "error" in body ? body.error : `The server answered with status ${response.status}.` };
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." };
  }
}

export function Importer() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [mode, setMode] = useState<ImportMode>("upsert");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const importing = saved !== null;
  const table = useMemo(() => (file ? sheetToTable(file.sheets[sheetIndex]?.rows ?? []) : null), [file, sheetIndex]);
  const missing = mapping ? REQUIRED_FIELDS.filter((field) => mapping[field] === null) : [];
  const preview = useMemo(
    () =>
      table && mapping && REQUIRED_FIELDS.every((field) => mapping[field] !== null)
        ? buildPreview(table, mapping, { date1904: file?.date1904 })
        : [],
    [table, mapping, file],
  );
  const ready = preview.filter((row) => row.status === "valid");
  const notImported = preview.length - ready.length;

  function chooseSheet(loaded: ImportFile, index: number) {
    setSheetIndex(index);
    setMapping(detectColumns(sheetToTable(loaded.sheets[index]?.rows ?? []).headers));
    setOutcome(null);
  }

  function reset() {
    setFile(null);
    setMapping(null);
    setFileError(null);
    setOutcome(null);
  }

  async function openFile(selected: File) {
    reset();
    setReading(true);
    try {
      const loaded = await readImportFile(selected);
      setFile({ ...loaded, fileName: selected.name });
      // Start on the first sheet that has more than a header row
      chooseSheet(loaded, Math.max(0, loaded.sheets.findIndex((sheet) => sheet.rows.length > 1)));
    } catch (error) {
      setFileError(
        error instanceof ImportFileError
          ? error.message
          : "This file couldn't be read. Check that it opens in Excel, or save it as CSV and try again.",
      );
    } finally {
      setReading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped && !importing) void openFile(dropped);
  }

  async function runImport() {
    const result: Outcome = { inserted: 0, updated: 0, unchanged: 0, skipped: [], sent: ready.length, notSaved: 0 };
    setOutcome(null);
    setSaved(0);
    // One chunk at a time: each is saved all-or-nothing, so a failure stops at a clean boundary
    for (let start = 0; start < ready.length; start += IMPORT_CHUNK_SIZE) {
      const chunk = ready.slice(start, start + IMPORT_CHUNK_SIZE);
      const response = await sendChunk(mode, chunk);
      if ("error" in response) {
        result.error = response.error;
        result.notSaved = ready.length - start;
        break;
      }
      result.inserted += response.inserted;
      result.updated += response.updated;
      result.unchanged += response.unchanged;
      result.skipped.push(...response.skipped.map(({ index, reason }) => ({ line: chunk[index].line, reason })));
      setSaved(start + chunk.length);
    }
    setSaved(null);
    setOutcome(result);
  }

  return (
    <div className="space-y-6">
      <Card>
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-10 text-center transition has-focus-visible:border-emerald-500 ${
            dragging ? "border-emerald-500 bg-emerald-50" : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/40"
          }`}
        >
          <input
            type="file"
            accept={IMPORT_ACCEPT}
            disabled={reading || importing}
            className="sr-only"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              // Clear it so choosing the same file again still triggers a change
              event.target.value = "";
              if (selected) void openFile(selected);
            }}
          />
          <span className="text-sm font-medium text-slate-800">
            {reading ? "Reading the file…" : file ? `${file.fileName} · choose another file` : "Choose a file or drag it here"}
          </span>
          <span className="text-xs text-slate-500">Excel (.xlsx, .xls), CSV, or a PDF with selectable text · up to 5 MB</span>
        </label>
        {fileError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {fileError}
          </p>
        )}
        <p className="mt-4 text-sm text-slate-600">
          Columns are matched by their headings, such as Name, Phone, Date of Birth, Emp Code and WhatsApp Consent.
          Dates like 15-08-1990 are read day first.{" "}
          <a
            href={SAMPLE_CSV_HREF}
            download="employee-import-sample.csv"
            className="font-medium whitespace-nowrap text-emerald-700 hover:text-emerald-800"
          >
            Download a sample CSV
          </a>
        </p>
      </Card>

      {file && mapping && table && (
        <Card title="Match the columns" description="Check which column holds each detail. Name, phone and date of birth are required.">
          {file.sheets.length > 1 && (
            <div className="mb-5 max-w-xs">
              <label htmlFor="sheet" className="text-sm font-medium text-slate-700">
                Sheet
              </label>
              <select
                id="sheet"
                value={sheetIndex}
                disabled={importing}
                onChange={(event) => chooseSheet(file, Number(event.target.value))}
                className={`mt-1.5 ${controlClass}`}
              >
                {file.sheets.map((sheet, index) => (
                  <option key={sheet.name} value={index}>
                    {sheet.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((field) => (
              <ColumnSelect
                key={field}
                field={field}
                headers={table.headers}
                value={mapping[field]}
                disabled={importing}
                onChange={(column) => {
                  setMapping({ ...mapping, [field]: column });
                  setOutcome(null);
                }}
              />
            ))}
          </div>
          {missing.length > 0 && (
            <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Choose the column for {missing.map((field) => FIELD_LABELS[field].toLowerCase()).join(", ")}.
            </p>
          )}
        </Card>
      )}

      {preview.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="px-5 pt-5 pb-3 sm:px-6">
            <h2 className="text-base font-semibold">Preview</h2>
            <p className="mt-1 text-sm text-slate-500">
              {number(ready.length)} of {number(preview.length)} rows are ready.
              {notImported > 0 && " Rows with errors or duplicates are left out; fix them in the file and upload it again to include them."}
            </p>
          </div>
          <PreviewTable key={`${file?.fileName}:${sheetIndex}`} rows={preview} />
        </section>
      )}

      {preview.length > 0 && (
        <Card title="Import">
          <fieldset disabled={importing} className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">When someone is already saved</legend>
            <ModeOption value="upsert" current={mode} onChange={setMode} title="Add new and update existing">
              People already saved, matched by employee code and then phone, get the details from the file. Blank
              consent or code cells keep what&apos;s saved.
            </ModeOption>
            <ModeOption value="insert" current={mode} onChange={setMode} title="Add new only">
              People already saved are skipped and left unchanged.
            </ModeOption>
          </fieldset>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={runImport}
              disabled={importing || ready.length === 0}
              className={primaryButtonClass}
            >
              {importing
                ? `Saving ${number(saved)} of ${number(ready.length)}…`
                : `Import ${number(ready.length)} ${ready.length === 1 ? "employee" : "employees"}`}
            </button>
            {importing && (
              <div
                role="progressbar"
                aria-label="Import progress"
                aria-valuemin={0}
                aria-valuemax={ready.length}
                aria-valuenow={saved}
                className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.max(4, (saved / ready.length) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {outcome && <OutcomeSummary outcome={outcome} onReset={reset} />}
        </Card>
      )}
    </div>
  );
}

function OutcomeSummary({ outcome, onReset }: { outcome: Outcome; onReset: () => void }) {
  const parts = [
    `${number(outcome.inserted)} added`,
    `${number(outcome.updated)} updated`,
    outcome.unchanged > 0 && `${number(outcome.unchanged)} already up to date`,
    outcome.skipped.length > 0 && `${number(outcome.skipped.length)} skipped`,
  ].filter(Boolean);

  return (
    <div
      role="status"
      className={`mt-5 rounded-xl border p-4 text-sm ${
        outcome.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <p className="font-medium">
        {outcome.error ? "The import stopped." : "Import finished."} {parts.join(", ")}.
      </p>
      {outcome.error && (
        <p className="mt-1">
          {outcome.error}{" "}
          {outcome.notSaved === outcome.sent
            ? "Nothing was saved."
            : `The last ${number(outcome.notSaved)} rows weren't saved; the ${number(outcome.sent - outcome.notSaved)} before them were.`}
        </p>
      )}
      {outcome.skipped.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-slate-700">
          {outcome.skipped.map(({ line, reason }) => (
            <li key={line}>
              <span className="font-medium">Row {line}:</span> {reason}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/employees" className={primaryButtonClass}>
          View employees
        </Link>
        <button type="button" onClick={onReset} className={secondaryButtonClass}>
          Import another file
        </button>
      </div>
    </div>
  );
}

function ColumnSelect({
  field,
  headers,
  value,
  disabled,
  onChange,
}: {
  field: ImportField;
  headers: string[];
  value: number | null;
  disabled: boolean;
  onChange: (column: number | null) => void;
}) {
  const required = REQUIRED_FIELDS.includes(field);
  return (
    <div>
      <label htmlFor={`column-${field}`} className="text-sm font-medium text-slate-700">
        {FIELD_LABELS[field]}
        {!required && <span className="font-normal text-slate-500"> (optional)</span>}
      </label>
      <select
        id={`column-${field}`}
        value={value ?? ""}
        disabled={disabled}
        aria-invalid={required && value === null ? true : undefined}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className={`mt-1.5 ${controlClass}`}
      >
        <option value="">Not in this file</option>
        {headers.map((header, index) => (
          <option key={index} value={index}>
            {header || `Column ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}

function ModeOption({
  value,
  current,
  onChange,
  title,
  children,
}: {
  value: ImportMode;
  current: ImportMode;
  onChange: (mode: ImportMode) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${
        current === value ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <input
        type="radio"
        name="mode"
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        className="mt-0.5 size-4 shrink-0 accent-emerald-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-800">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{children}</span>
      </span>
    </label>
  );
}

function Card({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className={title ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}
