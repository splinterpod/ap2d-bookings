"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserInstrumentLimitAction } from "@/actions/admin";
import type { SerUserInstrumentLimit } from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export type SerInstrumentWithDefaults = {
  id: string;
  name: string;
  standardDefaultLabel: string;
  approvalDefaultLabel: string;
};

type LimitMode = SerUserInstrumentLimit["limitMode"];
type ApprovalMode = SerUserInstrumentLimit["approvalMode"];

type Props = {
  userId: string;
  username: string;
  isAdminUser: boolean;
  canEdit: boolean;
  instruments: SerInstrumentWithDefaults[];
  limits: SerUserInstrumentLimit[];
};

function effectiveSummary(
  inst: SerInstrumentWithDefaults,
  row: SerUserInstrumentLimit,
): string {
  const limit =
    row.limitMode === "default"
      ? inst.standardDefaultLabel
      : row.limitMode === "unlimited"
        ? "Unlimited"
        : `${row.customLimitHours ?? 0}h/week`;
  const approval =
    row.approvalMode === "default" ? inst.approvalDefaultLabel : row.approvalMode === "require" ? "Always required" : "Auto-confirm";
  return `${limit} · ${approval}`;
}

export function InstrumentLimitsDialog({
  userId,
  username,
  isAdminUser,
  canEdit,
  instruments,
  limits,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, SerUserInstrumentLimit>>(() =>
    Object.fromEntries(limits.map((l) => [l.instrumentId, { ...l }])),
  );

  const customCount = limits.filter(
    (l) => l.limitMode !== "default" || l.approvalMode !== "default",
  ).length;

  function open() {
    setDrafts(Object.fromEntries(limits.map((l) => [l.instrumentId, { ...l }])));
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function patch(instrumentId: string, patch: Partial<SerUserInstrumentLimit>) {
    setDrafts((prev) => ({
      ...prev,
      [instrumentId]: { ...prev[instrumentId], ...patch },
    }));
  }

  function save(instrumentId: string) {
    const row = drafts[instrumentId];
    if (!row) return;
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("instrumentId", instrumentId);
    fd.set("limitMode", row.limitMode);
    fd.set("approvalMode", row.approvalMode);
    if (row.limitMode === "custom" && row.customLimitHours !== null) {
      fd.set("limitHours", String(row.customLimitHours));
    }
    startTransition(async () => {
      await setUserInstrumentLimitAction(fd);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="w-full" onClick={open}>
        View limits
      </Button>
      <p className="mt-1 text-xs text-slate-500">
        {isAdminUser
          ? "Not applicable"
          : customCount === 0
            ? "Instrument defaults"
            : `${customCount} custom`}
      </p>

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 z-50 w-[min(100%-2rem,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Instrument limits</h2>
              <p className="text-sm text-slate-500">{username}</p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={close} aria-label="Close">
              ✕
            </Button>
          </div>
        </div>

        <div className="max-h-[min(65vh,28rem)] space-y-3 overflow-y-auto p-4">
          {instruments.length === 0 ? (
            <p className="text-sm text-slate-500">No instruments configured yet.</p>
          ) : (
            instruments.map((inst) => {
              const row = drafts[inst.id] ?? limits.find((l) => l.instrumentId === inst.id)!;
              const isCustom = row.limitMode === "custom";

              return (
                <div key={inst.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-800">{inst.name}</div>
                    <Badge tone={row.limitMode === "default" && row.approvalMode === "default" ? "slate" : "blue"}>
                      {row.limitMode === "default" && row.approvalMode === "default" ? "Default" : "Custom"}
                    </Badge>
                  </div>

                  {isAdminUser ? (
                    <p className="text-xs text-slate-500">Limits do not apply to admin accounts.</p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <div>
                          <Label>Weekly standard-hours limit</Label>
                          <Select
                            value={row.limitMode}
                            disabled={!canEdit || isPending}
                            onChange={(e) =>
                              patch(inst.id, { limitMode: e.target.value as LimitMode })
                            }
                            className="w-full"
                          >
                            <option value="default">Default ({inst.standardDefaultLabel})</option>
                            <option value="custom">Custom</option>
                            <option value="unlimited">Unlimited</option>
                          </Select>
                        </div>
                        {isCustom && (
                          <div>
                            <Label>Custom hours / week</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              disabled={!canEdit || isPending}
                              value={row.customLimitHours ?? ""}
                              onChange={(e) =>
                                patch(inst.id, {
                                  customLimitHours: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                            />
                          </div>
                        )}
                        <div>
                          <Label>Booking approval</Label>
                          <Select
                            value={row.approvalMode}
                            disabled={!canEdit || isPending}
                            onChange={(e) =>
                              patch(inst.id, { approvalMode: e.target.value as ApprovalMode })
                            }
                            className="w-full"
                          >
                            <option value="default">Default ({inst.approvalDefaultLabel})</option>
                            <option value="auto">Auto-confirm</option>
                            <option value="require">Always require approval</option>
                          </Select>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{effectiveSummary(inst, row)}</p>
                      {canEdit && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="mt-2 w-full"
                          disabled={isPending || (isCustom && row.customLimitHours === null)}
                          onClick={() => save(inst.id)}
                        >
                          Save {inst.name}
                        </Button>
                      )}
                    </>
                  )}
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
