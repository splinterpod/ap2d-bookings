"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTrainingAction } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type SerInstrument = { id: string; name: string; slug: string };

export type SerTraining = {
  instrumentId: string;
  trainedAtLabel: string;
  trainedByUsername: string | null;
};

type Props = {
  userId: string;
  username: string;
  isAdminUser: boolean;
  canEditTraining: boolean;
  instruments: SerInstrument[];
  trainings: SerTraining[];
};

export function TrainingHistoryDialog({
  userId,
  username,
  isAdminUser,
  canEditTraining,
  instruments,
  trainings,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function toggleTraining(instrumentId: string, trained: boolean) {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("instrumentId", instrumentId);
    fd.set("trained", String(trained));
    startTransition(async () => {
      await setTrainingAction(fd);
      router.refresh();
    });
  }

  const trainedCount = isAdminUser
    ? instruments.length
    : trainings.length;

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="w-full" onClick={open}>
        View training
      </Button>
      <p className="mt-1 text-xs text-slate-500">
        {trainedCount} of {instruments.length} instrument{instruments.length === 1 ? "" : "s"}
      </p>

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 z-50 w-[min(100%-2rem,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Training history</h2>
              <p className="text-sm text-slate-500">{username}</p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={close} aria-label="Close">
              ✕
            </Button>
          </div>
        </div>

        <div className="max-h-[min(60vh,24rem)] space-y-2 overflow-y-auto p-4">
          {instruments.length === 0 ? (
            <p className="text-sm text-slate-500">No instruments configured yet.</p>
          ) : (
            instruments.map((inst) => {
              const record = trainings.find((t) => t.instrumentId === inst.id);
              const trained = isAdminUser || !!record;

              return (
                <div
                  key={inst.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800">{inst.name}</div>
                    {isAdminUser ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Admin accounts are trained on all instruments.
                      </p>
                    ) : record ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Trained {record.trainedAtLabel}
                        {record.trainedByUsername ? ` by ${record.trainedByUsername}` : ""}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-slate-500">Not trained</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={trained ? "green" : "slate"}>{trained ? "Trained" : "Not trained"}</Badge>
                    {canEditTraining && (
                      <Button
                        type="button"
                        size="sm"
                        variant={trained ? "outline" : "primary"}
                        disabled={isPending}
                        onClick={() => toggleTraining(inst.id, !trained)}
                      >
                        {trained ? "Remove" : "Mark trained"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <Button type="button" variant="secondary" className="w-full" onClick={close}>
            Close
          </Button>
        </div>
      </dialog>
    </>
  );
}
