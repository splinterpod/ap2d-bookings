import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatTz, localToUtc } from "@/lib/time";
import {
  buildRangeLabel,
  buildUsageWorkbook,
  type ExportBooking,
} from "@/lib/export-usage-workbook";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const instrumentSlug = searchParams.get("instrument")?.trim() || null;
  const includeCancelled = searchParams.get("includeCancelled") === "1";

  const where: {
    startAt?: { gte?: Date; lte?: Date };
    instrumentId?: string;
    status?: "CONFIRMED";
  } = {};

  if (!includeCancelled) {
    where.status = "CONFIRMED";
  }
  if (fromStr || toStr) {
    where.startAt = {};
    if (fromStr) where.startAt.gte = localToUtc(fromStr, "00:00");
    if (toStr) where.startAt.lte = localToUtc(toStr, "23:59");
  }

  if (instrumentSlug) {
    const instrument = await prisma.instrument.findUnique({
      where: { slug: instrumentSlug },
      select: { id: true },
    });
    if (!instrument) {
      return new Response("Instrument not found.", { status: 404 });
    }
    where.instrumentId = instrument.id;
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      user: { select: { username: true } },
      instrument: { select: { id: true, name: true, slug: true, instrumentType: true } },
      session: { include: { readings: true } },
    },
    orderBy: [{ instrument: { name: "asc" } }, { startAt: "asc" }],
  });

  const byInstrument = new Map<
    string,
    { name: string; instrumentType: string; bookings: ExportBooking[] }
  >();

  for (const b of bookings) {
    const key = b.instrument.id;
    if (!byInstrument.has(key)) {
      byInstrument.set(key, {
        name: b.instrument.name,
        instrumentType: b.instrument.instrumentType,
        bookings: [],
      });
    }
    byInstrument.get(key)!.bookings.push(b as ExportBooking);
  }

  // When filtering to one instrument with no bookings, still include an empty sheet.
  if (instrumentSlug && byInstrument.size === 0) {
    const instrument = await prisma.instrument.findUnique({
      where: { slug: instrumentSlug },
      select: { id: true, name: true, instrumentType: true },
    });
    if (instrument) {
      byInstrument.set(instrument.id, {
        name: instrument.name,
        instrumentType: instrument.instrumentType,
        bookings: [],
      });
    }
  }

  // When exporting all instruments, include sheets for instruments with zero bookings in range.
  if (!instrumentSlug) {
    const allInstruments = await prisma.instrument.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, instrumentType: true },
    });
    for (const inst of allInstruments) {
      if (!byInstrument.has(inst.id)) {
        byInstrument.set(inst.id, {
          name: inst.name,
          instrumentType: inst.instrumentType,
          bookings: [],
        });
      }
    }
  }

  const rangeLabel = buildRangeLabel(fromStr, toStr, includeCancelled);
  const buffer = await buildUsageWorkbook(byInstrument, rangeLabel);

  const stamp = formatTz(new Date(), "yyyy-MM-dd");
  const suffix = instrumentSlug ? instrumentSlug : "all-instruments";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kherani-usage-${suffix}-${stamp}.xlsx"`,
    },
  });
}
