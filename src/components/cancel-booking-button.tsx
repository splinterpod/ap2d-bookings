"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBookingAction } from "@/actions/booking";
import { Button } from "@/components/ui/button";

type Props = {
  bookingId: string;
  label: string;
  size?: "sm" | "md";
  variant?: "danger" | "ghost";
  buttonLabel?: string;
};

export function CancelBookingButton({
  bookingId,
  label,
  size = "sm",
  variant = "danger",
  buttonLabel = "Cancel booking",
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

  function confirmCancel() {
    const fd = new FormData();
    fd.set("bookingId", bookingId);
    startTransition(async () => {
      await cancelBookingAction(fd);
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={open}>
        {buttonLabel}
      </Button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-black/40"
        onClose={close}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Cancel this booking?</h2>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-slate-600">
          <p>
            This will cancel the booking and free the time slot.
            <br />
            <strong className="text-slate-900">{label}</strong>
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={close} disabled={isPending}>
            Keep booking
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={confirmCancel} disabled={isPending}>
            {isPending ? "Cancelling…" : "Yes, cancel booking"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
