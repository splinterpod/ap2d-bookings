"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteUserAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  username: string;
};

export function DeleteUserButton({ userId, username }: Props) {
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
    fd.set("userId", userId);
    startTransition(async () => {
      await deleteUserAction(fd);
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        aria-label={`Delete ${username}`}
        title="Delete account permanently"
      >
        ×
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-black/40"
        onClose={close}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Delete account?</h2>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-slate-600">
          <p>
            Permanently delete <strong className="text-slate-900">{username}</strong>? This removes their
            account, bookings, and session history. This cannot be undone.
          </p>
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
