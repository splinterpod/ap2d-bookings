import { parseStandardHours } from "@/lib/booking";
import { toggleMaintenanceAction, updateInstrumentAction } from "@/actions/admin-instrument";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

type Instrument = {
  id: string;
  name: string;
  slug: string;
  location: string;
  description: string | null;
  maintenance: boolean;
  slotMinutes: number;
  maxSessionMinutes: number;
  advanceBookingDays: number;
  minNoticeMinutes: number;
  lateSignInReminderMinutes: number;
  noShowCancelMinutes: number;
  standardHours: unknown;
  standardHoursWeeklyLimitMinutes: number | null;
  afterHoursWeeklyLimitMinutes: number | null;
  autoConfirmIfTrained: boolean;
};

export function InstrumentEditor({ instrument }: { instrument: Instrument }) {
  const sh = parseStandardHours(instrument.standardHours);
  const stdLimitHours = instrument.standardHoursWeeklyLimitMinutes
    ? instrument.standardHoursWeeklyLimitMinutes / 60
    : "";
  const afterUnlimited = instrument.afterHoursWeeklyLimitMinutes === null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{instrument.name}</CardTitle>
            <p className="mt-0.5 text-xs font-normal text-slate-400">/{instrument.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={instrument.maintenance ? "red" : "green"}>
              {instrument.maintenance ? "Maintenance" : "Available"}
            </Badge>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <form action={toggleMaintenanceAction}>
            <input type="hidden" name="instrumentId" value={instrument.id} />
            <input type="hidden" name="maintenance" value={(!instrument.maintenance).toString()} />
            <Button variant={instrument.maintenance ? "secondary" : "danger"} size="sm">
              {instrument.maintenance ? "End maintenance" : "Put into maintenance"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details &amp; default rules</CardTitle>
          <p className="mt-1 text-sm font-normal text-slate-500">
            Default scheduling, hours, and approval settings for this instrument. All users follow these unless an
            admin sets custom limits or approval rules under Users.
          </p>
        </CardHeader>
        <CardBody>
          <form action={updateInstrumentAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="instrumentId" value={instrument.id} />

            <div className="sm:col-span-2 border-b border-slate-100 pb-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Instrument details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input name="name" defaultValue={instrument.name} required />
                </div>
                <div>
                  <Label>URL slug</Label>
                  <Input name="slug" defaultValue={instrument.slug} required pattern="[a-z0-9-]+" />
                  <p className="mt-1 text-xs text-slate-500">Lowercase letters, numbers, and hyphens only.</p>
                </div>
                <div className="sm:col-span-2">
                  <Label>Location</Label>
                  <Input name="location" defaultValue={instrument.location} required />
                </div>
                <div className="sm:col-span-2">
                  <Label>Description (optional)</Label>
                  <Textarea name="description" rows={2} defaultValue={instrument.description ?? ""} />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2 border-b border-slate-100 pb-4">
              <h3 className="text-sm font-semibold text-slate-700">Default scheduling</h3>
              <p className="mt-1 text-xs text-slate-500">
                Slot size, session length, and booking window defaults for this instrument.
              </p>
            </div>
            <div>
              <Label>Slot size (minutes)</Label>
              <Input type="number" name="slotMinutes" defaultValue={instrument.slotMinutes} min={5} step={5} />
            </div>
            <div>
              <Label>Max session length (hours)</Label>
              <Input
                type="number"
                name="maxSessionHours"
                defaultValue={instrument.maxSessionMinutes / 60}
                min={1}
                step={1}
              />
            </div>
            <div>
              <Label>Advance booking window (days)</Label>
              <Input type="number" name="advanceBookingDays" defaultValue={instrument.advanceBookingDays} min={1} />
            </div>
            <div>
              <Label>Minimum notice (minutes)</Label>
              <Input type="number" name="minNoticeMinutes" defaultValue={instrument.minNoticeMinutes} min={0} />
            </div>
            <div>
              <Label>Late sign-in reminder (minutes after start)</Label>
              <Input
                type="number"
                name="lateSignInReminderMinutes"
                defaultValue={instrument.lateSignInReminderMinutes}
                min={0}
              />
              <p className="mt-1 text-xs text-slate-500">
                Email if the user has not signed in this many minutes after the booked start.
              </p>
            </div>
            <div>
              <Label>No-show auto-cancel (minutes after start)</Label>
              <Input
                type="number"
                name="noShowCancelMinutes"
                defaultValue={instrument.noShowCancelMinutes}
                min={1}
              />
              <p className="mt-1 text-xs text-slate-500">
                Cancel the booking if still not signed in after this many minutes (frees the slot).
              </p>
            </div>

            <div className="sm:col-span-2 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700">Default standard hours</h3>
              <p className="mt-1 text-xs text-slate-500">
                When the lab is open and default weekly hour limits. Per-user overrides are set under Users → Limits.
              </p>
            </div>
            <div>
              <Label>Days (1=Mon … 7=Sun, comma-separated)</Label>
              <Input name="standardDays" defaultValue={sh.days.join(",")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start</Label>
                <Input type="time" name="standardStart" defaultValue={sh.start} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="time" name="standardEnd" defaultValue={sh.end} />
              </div>
            </div>
            <div>
              <Label>Default standard-hours weekly limit (hours; blank = unlimited)</Label>
              <Input type="number" name="standardLimitHours" defaultValue={stdLimitHours} min={0} step={0.5} />
            </div>
            <div className="space-y-2">
              <Label>Default after-hours weekly limit</Label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="afterHoursUnlimited" defaultChecked={afterUnlimited} /> Unlimited
              </label>
              <Input
                type="number"
                name="afterHoursLimitHours"
                placeholder="Hours (if not unlimited)"
                defaultValue={
                  instrument.afterHoursWeeklyLimitMinutes ? instrument.afterHoursWeeklyLimitMinutes / 60 : ""
                }
                min={0}
                step={0.5}
              />
            </div>

            <div className="sm:col-span-2 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700">Default approval</h3>
              <p className="mt-1 text-xs text-slate-500">
                Whether trained users are auto-confirmed by default. Admins can require approval per user under Users →
                Limits.
              </p>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="autoConfirmIfTrained"
                  defaultChecked={instrument.autoConfirmIfTrained}
                />
                Auto-confirm bookings for trained users (default)
              </label>
              <p className="text-xs text-slate-500">
                When unchecked, every booking stays pending until an admin approves it in Bookings.
              </p>
            </div>

            <div className="sm:col-span-2">
              <Button>Save instrument</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
