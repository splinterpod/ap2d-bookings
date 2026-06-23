"use client";

import { useRef, useState, useTransition } from "react";
import { signInSessionAction, signOutSessionAction } from "@/actions/session";
import { validateLaserSessionForm } from "@/lib/laser-session";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input, Label, Textarea } from "@/components/ui/input";
import { LASER_WAVELENGTHS } from "@/lib/validation";

export type ExistingReading = { wavelengthNm: number; calibrated: boolean; photonCount: number | null };

type Props = {
  bookingId: string;
  mode: "in" | "out";
  initialReadings?: ExistingReading[];
  initialSessionNotes?: string | null;
};

function initialLasersUsed(readings: ExistingReading[] | undefined): Record<number, boolean> {
  return Object.fromEntries(
    LASER_WAVELENGTHS.map((nm) => [nm, !!readings?.some((r) => r.wavelengthNm === nm)]),
  );
}

function initialAlreadyCalibrated(readings: ExistingReading[] | undefined, nm: number): boolean {
  const existing = readings?.find((r) => r.wavelengthNm === nm);
  return !!(existing?.calibrated && existing.photonCount === null);
}

export function SessionForm({ bookingId, mode, initialReadings, initialSessionNotes }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [lasersUsed, setLasersUsed] = useState<Record<number, boolean>>(() =>
    initialLasersUsed(initialReadings),
  );
  const [alreadyCalibrated, setAlreadyCalibrated] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(
      LASER_WAVELENGTHS.map((nm) => [nm, initialAlreadyCalibrated(initialReadings, nm)]),
    ),
  );

  function readingFor(nm: number): ExistingReading | undefined {
    return initialReadings?.find((r) => r.wavelengthNm === nm);
  }

  function toggleLaserUsed(nm: number, used: boolean) {
    setLasersUsed((prev) => ({ ...prev, [nm]: used }));
    if (!used) {
      setAlreadyCalibrated((prev) => ({ ...prev, [nm]: false }));
    }
  }

  function run() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("bookingId", bookingId);

    const validationError = validateLaserSessionForm(fd, false);
    if (validationError) {
      setMessage({ tone: "error", text: validationError });
      return;
    }

    startTransition(async () => {
      setMessage(null);
      const action = mode === "in" ? signInSessionAction : signOutSessionAction;
      const res = await action(undefined, fd);
      if (res?.error) setMessage({ tone: "error", text: res.error });
      else if (res?.success) {
        setMessage({ tone: "success", text: res.success });
        setDone(true);
      }
    });
  }

  if (done) {
    return <Alert tone="success">{message?.text ?? "Done."}</Alert>;
  }

  const anyLaserUsed = LASER_WAVELENGTHS.some((nm) => lasersUsed[nm]);

  return (
    <form ref={formRef} className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Lasers used this session</legend>
        <p className="text-xs text-slate-500">
          {mode === "in"
            ? "Check each laser you will use."
            : "Review or update lasers and calibration, then confirm sign-out."}
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {LASER_WAVELENGTHS.map((nm) => (
            <label key={nm} className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                name={`using_${nm}`}
                checked={lasersUsed[nm] ?? false}
                onChange={(e) => toggleLaserUsed(nm, e.target.checked)}
              />
              {nm} nm
            </label>
          ))}
        </div>
      </fieldset>

      {anyLaserUsed && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-700">Calibration</legend>
          {LASER_WAVELENGTHS.map((nm) => {
            if (!lasersUsed[nm]) return null;
            const existing = readingFor(nm);
            const already = alreadyCalibrated[nm] ?? false;
            return (
              <div key={nm} className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-800">{nm} nm</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`already_${nm}`}
                    checked={already}
                    onChange={(e) =>
                      setAlreadyCalibrated((prev) => ({ ...prev, [nm]: e.target.checked }))
                    }
                  />
                  Already calibrated
                </label>
                <div
                  className={cn(
                    "mt-3",
                    already && "rounded-lg border border-dashed border-slate-300 bg-slate-100 p-3",
                  )}
                >
                  <p
                    className={cn(
                      "mb-1.5 text-xs font-medium",
                      already ? "text-slate-400" : "text-slate-600",
                    )}
                  >
                    Photon count
                    {already && <span className="ml-1 font-normal text-slate-400">— not required</span>}
                  </p>
                  <Input
                    name={`photon_${nm}`}
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    placeholder={already ? "Already calibrated" : "Enter photon count"}
                    defaultValue={existing?.photonCount ?? ""}
                    disabled={already}
                    aria-disabled={already}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-xs text-slate-500">
            Mark already calibrated to skip the count, or enter a photon count for each laser in use.
          </p>
        </fieldset>
      )}

      <div>
        <Label htmlFor={`session-notes-${bookingId}`}>Session notes (optional)</Label>
        <Textarea
          id={`session-notes-${bookingId}`}
          name="sessionNotes"
          rows={2}
          maxLength={500}
          placeholder="Sample type, experiment details…"
          defaultValue={initialSessionNotes ?? ""}
        />
      </div>

      {mode === "out" && (
        <p className="text-xs text-slate-500">
          Signing out releases any remaining booked time on the calendar for others.
        </p>
      )}

      <Button type="button" className="w-full sm:w-auto" disabled={isPending} onClick={() => run()}>
        {isPending ? "Working…" : mode === "in" ? "Sign in to session" : "Confirm & sign out"}
      </Button>
    </form>
  );
}
