"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startImpersonationAction } from "@/actions/impersonation";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  username: string;
};

export function ImpersonateUserButton({ userId, username }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function confirm() {
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      await startImpersonationAction(fd);
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={open}>
        Log in as
      </Button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-black/40"
        onClose={close}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Log in as this user?</h2>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-slate-600">
          <p>
            You will see the app exactly as <strong className="text-slate-900">{username}</strong>. Use the{" "}
            <strong className="text-slate-900">×</strong> at the top left to return to your account.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={confirm} disabled={isPending}>
            {isPending ? "Switching…" : "Confirm"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
