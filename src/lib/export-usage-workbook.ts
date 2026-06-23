import ExcelJS from "exceljs";
import { PRODUCT_TAGLINE } from "./branding";
import type { BookingStatus, LaserPhase } from "@prisma/client";
import { formatTz } from "./time";
import { laserCountForExport } from "./laser-session";
import { LASER_WAVELENGTHS } from "./validation";

export type ExportBooking = {
  id: string;
  startAt: Date;
  endAt: Date;
  scheduledEndAt: Date;
  status: BookingStatus;
  notes: string | null;
  noShow: boolean;
  user: { username: string };
  instrument: { id: string; name: string; slug: string; instrumentType: string };
  session: {
    signedInAt: Date;
    signedOutAt: Date | null;
    actualEndAt: Date | null;
    notes: string | null;
    signInSkipped: boolean;
    readings: Array<{
      wavelengthNm: number;
      calibrated: boolean;
      photonCount: number | null;
      phase: LaserPhase;
    }>;
  } | null;
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF0F766E" },
};

const META_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF0FDFA" },
};

const DATE_FMT = "MMM d, yyyy h:mm a";

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function statusLabel(status: BookingStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatTz(value, DATE_FMT);
  return String(value);
}

function laserCount(
  session: NonNullable<ExportBooking["session"]>,
  nm: number,
  sessionComplete: boolean,
): string {
  return laserCountForExport(session.readings, nm, session.signInSkipped, sessionComplete);
}

function sessionNotesLabel(notes: string | null | undefined): string {
  return notes?.trim() || "—";
}

function isRaman(instrumentType: string): boolean {
  return instrumentType === "raman";
}

function baseColumns(raman: boolean): string[] {
  const cols = [
    "User",
    "Booked start",
    "Booked end",
    "Booked duration",
    "Calendar slot end",
    "Status",
    "Booking notes",
    "Signed in",
    "Signed out",
    "Session duration",
  ];
  if (raman) {
    for (const nm of LASER_WAVELENGTHS) {
      cols.push(`${nm} nm counts`);
    }
  }
  cols.push("Session notes");
  return cols;
}

function bookingRow(b: ExportBooking, raman: boolean): (string | number)[] {
  const s = b.session;
  const bookedMins = Math.round((b.scheduledEndAt.getTime() - b.startAt.getTime()) / 60000);
  const sessionMins =
    s?.signedInAt && s.signedOutAt
      ? Math.round((s.signedOutAt.getTime() - s.signedInAt.getTime()) / 60000)
      : null;
  const sessionComplete = !!s?.signedOutAt;

  const row: (string | number)[] = [
    b.user.username,
    formatTz(b.startAt, DATE_FMT),
    formatTz(b.scheduledEndAt, DATE_FMT),
    fmtDuration(bookedMins),
    formatTz(b.endAt, DATE_FMT),
    statusLabel(b.status),
    b.notes?.trim() || "—",
    s ? formatTz(s.signedInAt, DATE_FMT) : "—",
    s?.signedOutAt ? formatTz(s.signedOutAt, DATE_FMT) : "—",
    sessionMins !== null ? fmtDuration(sessionMins) : "—",
  ];

  if (raman) {
    for (const nm of LASER_WAVELENGTHS) {
      row.push(s ? laserCount(s, nm, sessionComplete) : "Not used");
    }
  }
  row.push(s ? sessionNotesLabel(s.notes) : "—");

  return row;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, "-").slice(0, 31);
}

/** Width from header + data rows only (merged title rows are excluded). */
function autoFitColumns(sheet: ExcelJS.Worksheet, headerRowNum: number, colCount: number) {
  for (let c = 1; c <= colCount; c++) {
    let maxLen = 0;
    for (let r = headerRowNum; r <= sheet.rowCount; r++) {
      const text = cellText(sheet.getRow(r).getCell(c).value);
      maxLen = Math.max(maxLen, text.length);
    }
    sheet.getColumn(c).width = Math.max(maxLen + 1, 6);
  }
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNum: number, colCount: number) {
  const row = sheet.getRow(rowNum);
  row.height = 22;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", wrapText: false };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF115E59" } },
    };
  }
}

function addInstrumentSheet(
  workbook: ExcelJS.Workbook,
  instrumentName: string,
  instrumentType: string,
  bookings: ExportBooking[],
  rangeLabel: string,
  exportedAt: string,
) {
  const raman = isRaman(instrumentType);
  const columns = baseColumns(raman);
  const sheet = workbook.addWorksheet(sanitizeSheetName(instrumentName));

  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${instrumentName} — usage export`;
  titleCell.font = { bold: true, size: 13, color: { argb: "FF134E4A" } };
  titleCell.fill = META_FILL;
  titleCell.alignment = { vertical: "middle" };

  sheet.mergeCells(2, 1, 2, columns.length);
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = `Exported ${exportedAt} · ${rangeLabel} · ${bookings.length} booking${bookings.length === 1 ? "" : "s"}`;
  metaCell.font = { size: 10, color: { argb: "FF64748B" } };
  metaCell.fill = META_FILL;
  metaCell.alignment = { vertical: "middle" };

  sheet.getRow(3).height = 6;

  const headerRowNum = 4;
  const headerRow = sheet.getRow(headerRowNum);
  headerRow.values = columns;
  styleHeaderRow(sheet, headerRowNum, columns.length);

  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i];
    const dataRow = sheet.addRow(bookingRow(b, raman));
    dataRow.alignment = { vertical: "top", wrapText: false };
    const stripe = i % 2 === 1 ? "FFF8FAFC" : undefined;
    dataRow.eachCell((cell) => {
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
      if (stripe) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: stripe } };
      }
    });
  }

  sheet.views = [{ state: "frozen", ySplit: headerRowNum, activeCell: "A5" }];
  autoFitColumns(sheet, headerRowNum, columns.length);
}

export async function buildUsageWorkbook(
  bookingsByInstrument: Map<
    string,
    { name: string; instrumentType: string; bookings: ExportBooking[] }
  >,
  rangeLabel: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = PRODUCT_TAGLINE;
  workbook.created = new Date();

  const exportedAt = formatTz(new Date(), "MMM d, yyyy h:mm a");

  const entries = [...bookingsByInstrument.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  if (entries.length === 0) {
    const sheet = workbook.addWorksheet("Export");
    sheet.getCell(1, 1).value = "No bookings matched the selected filters.";
    sheet.getCell(2, 1).value = `Exported ${exportedAt} · ${rangeLabel}`;
  } else {
    for (const { name, instrumentType, bookings } of entries) {
      addInstrumentSheet(workbook, name, instrumentType, bookings, rangeLabel, exportedAt);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildRangeLabel(
  fromStr: string | null,
  toStr: string | null,
  includeCancelled: boolean,
): string {
  const parts: string[] = [];
  if (fromStr && toStr) parts.push(`Bookings from ${fromStr} through ${toStr}`);
  else if (fromStr) parts.push(`Bookings from ${fromStr} onward`);
  else if (toStr) parts.push(`Bookings through ${toStr}`);
  else parts.push("All bookings");

  parts.push(
    includeCancelled
      ? "Including cancelled & rejected · started bookings only"
      : "Confirmed sessions only · started bookings only",
  );
  return parts.join(" · ");
}
