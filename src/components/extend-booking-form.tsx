"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extendBookingAction } from "@/actions/booking";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export type ExtensionOption = {
  newEndAtIso: string;
  label: string;
  extraMinutes: number;
};

type Props = {
  bookingId: string;
  currentEndLabel: string;
  options: ExtensionOption[];
  compact?: boolean;
  requestMode?: boolean;
  pendingEndLabel?: string;
};

export function ExtendBookingForm({
  bookingId,
  currentEndLabel,
  options,
  compact = false,
  requestMode = false,
  pendingEndLabel,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(options[0]?.newEndAtIso ?? "");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  if (options.length === 0) return null;

  function submit() {
    if (!selected) return;
    const fd = new FormData();
    fd.set("bookingId", bookingId);
    fd.set("newEndAt", selected);
    startTransition(async () => {
      setMessage(null);
      const res = await extendBookingAction(undefined, fd);
      if (res?.error) setMessage({ tone: "error", text: res.error });
      else if (res?.success) {
        setMessage({ tone: "success", text: res.success });
        router.refresh();
      }
    });
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"}>
      {!compact && (
        <p className="text-sm font-semibold text-slate-800">
          {requestMode
            ? `Request extension (currently until ${currentEndLabel})`
            : `Extend booking (currently until ${currentEndLabel})`}
        </p>
      )}
      {pendingEndLabel && (
        <Alert tone="info">Pending extension until {pendingEndLabel} — awaiting admin approval.</Alert>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div>
        <Label htmlFor={`extend-${bookingId}`}>{requestMode ? "Extend to" : "Extend to"}</Label>
        <Select id={`extend-${bookingId}`} value={selected} onChange={(e) => setSelected(e.target.value)}>
          {options.map((o) => (
            <option key={o.newEndAtIso} value={o.newEndAtIso}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        className={compact ? "w-full" : undefined}
        disabled={isPending || !selected}
        onClick={submit}
      >
        {isPending
          ? requestMode
            ? "Submitting…"
            : "Extending…"
          : requestMode
            ? "Request extension"
            : "Extend booking"}
      </Button>
    </div>
  );
}
