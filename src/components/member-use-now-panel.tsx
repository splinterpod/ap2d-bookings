"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBookingAction } from "@/actions/booking";
import { ExtendBookingForm, type ExtensionOption } from "@/components/extend-booking-form";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

type DurationOption = { minutes: number; endLabel: string };

type Props = {
  instrumentId: string;
  extension: {
    bookingId: string;
    currentEndLabel: string;
    options: ExtensionOption[];
  } | null;
  bookNow: {
    dateKey: string;
    startMin: number;
    durationOptions: DurationOption[];
  } | null;
  unavailableReason?: string;
};

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const DEFAULT_BOOK_NOW_MINUTES = 4 * 60;

/** Prefer 4h; if unavailable, largest option up to 4h, else shortest. */
function defaultBookNowDuration(options: DurationOption[]): number {
  if (options.length === 0) return 0;
  const exact = options.find((o) => o.minutes === DEFAULT_BOOK_NOW_MINUTES);
  if (exact) return exact.minutes;
  const upToDefault = options.filter((o) => o.minutes <= DEFAULT_BOOK_NOW_MINUTES);
  if (upToDefault.length > 0) return upToDefault[upToDefault.length - 1]!.minutes;
  return options[0]!.minutes;
}

export function MemberUseNowPanel({ instrumentId, extension, bookNow, unavailableReason }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [duration, setDuration] = useState(() => defaultBookNowDuration(bookNow?.durationOptions ?? []));
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  if (extension) {
    return (
      <ExtendBookingForm
        bookingId={extension.bookingId}
        currentEndLabel={extension.currentEndLabel}
        options={extension.options}
        compact
      />
    );
  }

  if (bookNow) {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-sm font-semibold text-emerald-900">Instrument available now</p>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div>
          <Label htmlFor="member-book-until">Until</Label>
          <Select
            id="member-book-until"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {bookNow.durationOptions.map((o) => (
              <option key={o.minutes} value={o.minutes}>
                {o.endLabel} ({fmtDuration(o.minutes)})
              </option>
            ))}
          </Select>
        </div>
        <Button
          className="w-full"
          disabled={isPending || !duration}
          onClick={() => {
            const fd = new FormData();
            fd.set("instrumentId", instrumentId);
            fd.set("date", bookNow.dateKey);
            fd.set(
              "startTime",
              `${String(Math.floor(bookNow.startMin / 60)).padStart(2, "0")}:${String(bookNow.startMin % 60).padStart(2, "0")}`,
            );
            fd.set("durationMinutes", String(duration));
            fd.set("walkUp", "1");
            startTransition(async () => {
              setMessage(null);
              const res = await createBookingAction(undefined, fd);
              if (res?.error) setMessage({ tone: "error", text: res.error });
              else if (res?.success) {
                setMessage({ tone: "success", text: res.success });
                router.refresh();
              }
            });
          }}
        >
          {isPending ? "Working…" : "Book now"}
        </Button>
      </div>
    );
  }

  if (unavailableReason) {
    return <Alert tone="info">{unavailableReason}</Alert>;
  }

  return null;
}
