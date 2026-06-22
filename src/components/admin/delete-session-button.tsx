"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSessionHistoryAction } from "@/actions/admin-owner";
import { Button } from "@/components/ui/button";

type Props = {
  sessionId: string;
  label: string;
};

export function DeleteSessionButton({ sessionId, label }: Props) {
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
    fd.set("sessionId", sessionId);
    startTransition(async () => {
      await deleteSessionHistoryAction(fd);
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
          <h2 className="text-base font-semibold text-slate-900">Delete session permanently?</h2>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-slate-600">
          <p>
            Permanently delete this session log entry?
            <br />
            <strong className="text-slate-900">{label}</strong>
          </p>
          <p>Laser readings and sign-in/out data are removed. The booking record stays. This cannot be undone.</p>
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
