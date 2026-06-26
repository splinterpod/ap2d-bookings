import Link from "next/link";
import { prisma } from "@/lib/db";
import { InstrumentEditor } from "@/components/admin/instrument-editor";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminInstrumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ instrument?: string }>;
}) {
  const { instrument: instrumentSlug } = await searchParams;

  const instruments = await prisma.instrument.findMany({
    orderBy: { name: "asc" },
  });

  const selected =
    instruments.find((i) => i.slug === instrumentSlug) ?? instruments[0] ?? null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        {instruments.length} instrument{instruments.length === 1 ? "" : "s"} configured
      </p>

      {instruments.length > 0 && (
        <nav className="flex flex-wrap gap-2">
          {instruments.map((i) => {
            const active = selected?.id === i.id;
            return (
              <Link
                key={i.id}
                href={`/admin/instruments?instrument=${i.slug}`}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-800"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {i.name}
                {i.maintenance && <Badge tone="red">Maint.</Badge>}
                {i.bookingAdminMode && <Badge tone="blue">Admin mode</Badge>}
              </Link>
            );
          })}
        </nav>
      )}

      {selected ? (
        <InstrumentEditor instrument={selected} />
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">
              No instruments configured. Run <code className="text-xs">npm run db:seed</code> or add instruments
              directly in the database.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
