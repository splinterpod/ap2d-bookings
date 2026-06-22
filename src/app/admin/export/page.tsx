import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function AdminExportPage() {
  const instruments = await prisma.instrument.findMany({
    orderBy: { name: "asc" },
    select: { name: true, slug: true },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export usage data</CardTitle>
        <p className="mt-1 text-sm font-normal text-slate-500">
          Downloads an Excel workbook — one sheet per instrument by default. Raman sheets include a photon count
          column for each laser wavelength.
        </p>
      </CardHeader>
      <CardBody className="space-y-4">
        <form action="/api/export" method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="export-from">From (optional)</Label>
            <Input id="export-from" type="date" name="from" className="w-44" />
          </div>
          <div>
            <Label htmlFor="export-to">To (optional)</Label>
            <Input id="export-to" type="date" name="to" className="w-44" />
          </div>
          <div>
            <Label htmlFor="export-instrument">Instrument (optional)</Label>
            <Select id="export-instrument" name="instrument" className="w-56" defaultValue="">
              <option value="">Select an instrument</option>
              {instruments.map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.name}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm text-slate-700">
            <input type="checkbox" name="includeCancelled" value="1" className="h-4 w-4 rounded border-slate-300" />
            Include cancelled &amp; rejected
          </label>
          <Button type="submit">Download Excel</Button>
        </form>
        <p className="text-xs text-slate-500">
          Leave dates blank to export everything. If no instrument is selected, each instrument gets its own sheet.
          By default only confirmed bookings are exported.
        </p>
      </CardBody>
    </Card>
  );
}
