"use client";

import { useTransition } from "react";
import { endImpersonationAction } from "@/actions/impersonation";

type Props = {
  username: string;
};

export function ImpersonationBanner({ username }: Props) {
  const [isPending, startTransition] = useTransition();

  function exit() {
    startTransition(async () => {
      await endImpersonationAction();
    });
  }

  return (
    <div className="sticky top-0 z-40 border-b border-amber-300 bg-amber-50">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={exit}
          disabled={isPending}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400 bg-white text-lg font-semibold leading-none text-amber-900 hover:bg-amber-100 disabled:opacity-60"
          aria-label="Exit impersonation"
          title="Exit and return to your account"
        >
          ×
        </button>
        <p className="min-w-0 text-sm text-amber-950">
          Viewing as <strong>{username}</strong>
          {isPending ? " — returning…" : ""}
        </p>
      </div>
    </div>
  );
}
