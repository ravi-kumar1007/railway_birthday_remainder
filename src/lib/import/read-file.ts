import type { WorkBook } from "xlsx";
import type { Cell } from "./cells";
import { groupIntoLines, tableFromPdfLines, type PdfTextItem } from "./pdf-text";

// Runs in the browser only. Each parser is loaded when a file of its type is chosen.

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const IMPORT_ACCEPT = ".xlsx,.xls,.csv,.pdf";
const MAX_PDF_PAGES = 100;

export type ImportFile = {
  sheets: { name: string; rows: Cell[][] }[];
  /** Excel workbooks saved with the Mac 1904 date system count date serials differently */
  date1904: boolean;
};

/** A problem with the file that the admin can fix; the message is shown as-is */
export class ImportFileError extends Error {
  name = "ImportFileError";
}

export async function readImportFile(file: File): Promise<ImportFile> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportFileError("This file is larger than 5 MB. Split it into smaller files.");
  }
  const extension = file.name.toLowerCase().split(".").pop();
  switch (extension) {
    case "csv":
      return readCsv(file);
    case "xlsx":
    case "xls":
      return readWorkbook(file);
    case "pdf":
      return readPdf(file);
    default:
      throw new ImportFileError("Choose an Excel (.xlsx or .xls), CSV or PDF file.");
  }
}

async function readCsv(file: File): Promise<ImportFile> {
  const { default: Papa } = await import("papaparse");
  // PapaParse works out whether the file uses commas, semicolons or tabs
  const { data } = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" });
  return { sheets: [{ name: file.name, rows: data }], date1904: false };
}

async function readWorkbook(file: File): Promise<ImportFile> {
  const XLSX = await import("xlsx");
  let workbook: WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true });
  } catch {
    throw new ImportFileError("This spreadsheet couldn't be opened. It may be damaged or password-protected.");
  }
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    // raw: dates stay Excel serial numbers and phone numbers stay numbers; cells.ts reads both
    rows: XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }),
  }));
  return { sheets, date1904: Boolean(workbook.Workbook?.WBProps?.date1904) };
}

async function readPdf(file: File): Promise<ImportFile> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;

  // Text extraction only: nothing is rendered and the PDF's own scripts never run
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let document;
  try {
    document = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy();
    throw new ImportFileError(
      error instanceof Error && error.name === "PasswordException"
        ? "This PDF is password-protected. Remove the password, or upload Excel/CSV."
        : "This PDF couldn't be opened. Upload Excel/CSV instead.",
    );
  }

  try {
    const items: PdfTextItem[] = [];
    for (let page = 1; page <= Math.min(document.numPages, MAX_PDF_PAGES); page++) {
      const content = await (await document.getPage(page)).getTextContent();
      for (const item of content.items) {
        if ("str" in item && item.str.trim()) {
          items.push({ str: item.str, x: item.transform[4], y: item.transform[5], page });
        }
      }
    }
    if (items.length === 0) throw new ImportFileError("Scanned PDF not supported. Upload Excel/CSV.");

    const table = tableFromPdfLines(groupIntoLines(items));
    if (!table) {
      throw new ImportFileError(
        "No employee rows found in this PDF. Each row needs a name, a phone number and a date of birth. Scanned PDFs aren't supported; upload Excel/CSV instead.",
      );
    }
    return { sheets: [{ name: file.name, rows: [table.headers, ...table.rows] }], date1904: false };
  } finally {
    // Frees the document and stops its worker
    await loadingTask.destroy();
  }
}
