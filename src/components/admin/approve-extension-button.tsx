"use client";

import { useActionState } from "react";
import { approveExtensionRequestAction } from "@/actions/admin-instrument";
import { Button } from "@/components/ui/button";

export function ApproveExtensionButton({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(approveExtensionRequestAction, undefined);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <Button size="sm" disabled={pending}>
          {pending ? "…" : "Approve"}
        </Button>
      </form>
      {state?.error && <p className="max-w-xs text-right text-xs text-red-600">{state.error}</p>}
    </div>
  );
}
