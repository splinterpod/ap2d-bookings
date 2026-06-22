"use client";

import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";

function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function useLiveAppNow(timezone: string, initial: { dateKey: string; minutes: number }) {
  const [now, setNow] = useState(initial);

  useEffect(() => {
    function tick() {
      const d = new Date();
      setNow({
        dateKey: formatInTimeZone(d, timezone, "yyyy-MM-dd"),
        minutes: parseClock(formatInTimeZone(d, timezone, "HH:mm")),
      });
    }
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [timezone]);

  return now;
}
