"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBookingHistoryAction } from "@/actions/admin-owner";
import { Button } from "@/components/ui/button";

type Props = {
  bookingId: string;
  label: string;
};

export function DeleteBookingButton({ bookingId, label }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function confirmDelete() {
    const fd = new FormData();
    fd.set("bookingId", bookingId);
    startTransition(async () => {
      await deleteBookingHistoryAction(fd);
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="danger" onClick={open}>
        Delete
      </Button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-black/40"
        onClose={close}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Delete booking permanently?</h2>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-slate-600">
          <p>
            Permanently delete this booking record?
            <br />
            <strong className="text-slate-900">{label}</strong>
          </p>
          <p>Any linked session and laser readings are removed. This cannot be undone.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={confirmDelete} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
