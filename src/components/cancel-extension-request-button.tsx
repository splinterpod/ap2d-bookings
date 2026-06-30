"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelExtensionRequestAction } from "@/actions/booking";
import { Button } from "@/components/ui/button";

type Props = {
  bookingId: string;
  variant?: "ghost" | "outline";
  buttonLabel?: string;
};

export function CancelExtensionRequestButton({
  bookingId,
  variant = "outline",
  buttonLabel = "Cancel extension request",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function submit() {
    const fd = new FormData();
    fd.set("bookingId", bookingId);
    startTransition(async () => {
      await cancelExtensionRequestAction(fd);
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant={variant} disabled={isPending} onClick={submit}>
      {isPending ? "Cancelling…" : buttonLabel}
    </Button>
  );
}
