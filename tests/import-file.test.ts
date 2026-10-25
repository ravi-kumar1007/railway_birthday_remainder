import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { detectColumns } from "@/lib/import/columns";
import { buildPreview, sheetToTable } from "@/lib/import/preview";
import { ImportFileError, readImportFile } from "@/lib/import/read-file";

function workbookFile(rows: unknown[][], bookType: "xlsx" | "xls" = "xlsx") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Staff");
  const data: ArrayBuffer = XLSX.write(workbook, { type: "array", bookType: bookType === "xls" ? "biff8" : "xlsx" });
  return new File([data], `staff.${bookType}`);
}

async function previewOf(file: File) {
  const { sheets, date1904 } = await readImportFile(file);
  const table = sheetToTable(sheets[0].rows);
  return buildPreview(table, detectColumns(table.headers), { date1904 });
}

describe("readImportFile", () => {
  it("reads Excel workbooks with a title row, real date cells and numeric phones", async () => {
    for (const type of ["xlsx", "xls"] as const) {
      const file = workbookFile(
        [["Employee list"], ["Name", "Mobile", "DOB"], ["Priya Sharma", 9876543210, new Date(1990, 7, 15)]],
        type,
      );
      expect(await previewOf(file), type).toMatchObject([
        { line: 3, status: "valid", birthday: "15 Aug 1990", data: { phone: "+919876543210" } },
      ]);
    }
  });

  it("reads CSV files, whatever the separator", async () => {
    const file = new File(["Name;Phone;Date of Birth\nPriya Sharma;98765 43210;15/08/1990\n"], "staff.csv");
    expect(await previewOf(file)).toMatchObject([{ status: "valid", birthday: "15 Aug 1990" }]);
  });

  it("rejects other file types and files over 5 MB", async () => {
    await expect(readImportFile(new File(["x"], "notes.txt"))).rejects.toThrow(ImportFileError);
    await expect(readImportFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.csv"))).rejects.toThrow(/5 MB/);
  });
});
